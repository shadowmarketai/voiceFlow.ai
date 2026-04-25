"""
API-based Voice Providers — Full Production Pipeline
=====================================================
All cloud-based — no local ML models, no GPU needed.

STT chain: Sarvam AI (primary, all Indian langs) → Deepgram Nova-2 (EN/fallback)
           → Groq Whisper → OpenAI Whisper
           Ensemble: Sarvam-only for Indic, Deepgram-only for English

LLM chain: Gemini 2.5 Pro (primary) → Groq → OpenAI → Anthropic → DeepSeek → stub
           Streaming: Gemini SSE → Groq SSE → OpenAI SSE → DeepSeek SSE → fallback batch

TTS chain (English):  ElevenLabs Turbo v2.5 → Cartesia Sonic-2 → OpenAI TTS
                       → Deepgram Aura → Google Cloud → Edge TTS (free)
TTS chain (Indian):   Sarvam TTS bulbul:v2 → ElevenLabs → OpenAI TTS
                       → Google Cloud → Edge TTS (free)

Env vars needed (required):
  GOOGLE_API_KEY       — Gemini 2.5 Pro LLM + Google Cloud TTS fallback
  SARVAM_API_KEY       — STT (Indian langs) + TTS (Indian langs)
  ELEVENLABS_API_KEY   — TTS (English primary, MOS 4.8)
  CARTESIA_API_KEY     — TTS (English real-time, MOS 4.7, 80ms TTFA)

Env vars needed (optional fallbacks):
  DEEPGRAM_API_KEY, GROQ_API_KEY, OPENAI_API_KEY,
  ANTHROPIC_API_KEY, DEEPSEEK_API_KEY,
  BHASHINI_USER_ID, BHASHINI_API_KEY (FREE — register at bhashini.gov.in)
"""

import base64
import json
import logging
import os
import tempfile
import time
from collections.abc import AsyncGenerator
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ── Key alias: accept either GOOGLE_API_KEY or GEMINI_API_KEY ──────────────
# Coolify users often set GEMINI_API_KEY; all existing code checks GOOGLE_API_KEY.
# Resolve once at import time so every os.environ.get("GOOGLE_API_KEY") works.
if not os.environ.get("GOOGLE_API_KEY") and os.environ.get("GEMINI_API_KEY"):
    os.environ["GOOGLE_API_KEY"] = os.environ["GEMINI_API_KEY"]
    logger.debug("Aliased GEMINI_API_KEY → GOOGLE_API_KEY")


def _google_key() -> str:
    """Return the Google/Gemini API key — checks both env var names."""
    return os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY") or ""


# ═════════════════════════════════════════════════════════════════
# STT (Speech-to-Text) — 4 providers
# ═════════════════════════════════════════════════════════════════

async def transcribe_deepgram_stream(
    audio_bytes: bytes,
    api_key: str,
    language: str | None = None,
) -> AsyncGenerator[tuple[bool, str, float], None]:
    """Stream pre-captured audio bytes to Deepgram's live WebSocket API.

    Yields ``(is_final, text, confidence)`` tuples as Deepgram processes each
    incoming chunk.  Sending a buffered recording in 4 KB slices simulates
    real-time streaming and lets Deepgram return *interim* transcripts before
    it has seen the full audio — enabling speculative LLM firing.

    Falls back silently (no yields) if the WebSocket connection fails so the
    caller can degrade gracefully to the REST path.
    """
    import json as _json

    import websockets

    lang_param = f"&language={language}" if language else ""
    # Auth via query param — avoids websockets version differences in header
    # kwarg names (extra_headers vs additional_headers changed across versions).
    url = (
        f"wss://api.deepgram.com/v1/listen"
        f"?token={api_key}"
        f"&model=nova-2&punctuate=true&smart_format=true"
        f"&interim_results=true&encoding=linear16&sample_rate=16000&channels=1"
        f"{lang_param}"
    )

    CHUNK = 4096  # 4 KB per send — small enough for quick interim results

    try:
        async with websockets.connect(
            url,
            ping_interval=None,
            open_timeout=5,
        ) as ws:
            # Producer coroutine: send audio in chunks, then close the stream
            async def _send_audio() -> None:
                for offset in range(0, len(audio_bytes), CHUNK):
                    await ws.send(audio_bytes[offset : offset + CHUNK])
                    await asyncio.sleep(0)  # yield control so receiver runs
                await ws.send(_json.dumps({"type": "CloseStream"}))

            send_task = asyncio.create_task(_send_audio())
            try:
                async for raw in ws:
                    try:
                        data = _json.loads(raw)
                    except (_json.JSONDecodeError, TypeError):
                        continue

                    if data.get("type") != "Results":
                        continue

                    ch = (data.get("channel") or {})
                    alt = (ch.get("alternatives") or [{}])[0]
                    text: str = alt.get("transcript", "")
                    confidence: float = float(alt.get("confidence") or 0.0)
                    is_final: bool = bool(data.get("is_final"))

                    if text:
                        yield (is_final, text, confidence)

                    # speech_final means Deepgram detected an utterance boundary
                    if data.get("speech_final"):
                        break
            finally:
                send_task.cancel()

    except Exception as exc:
        logger.debug("Deepgram streaming WS unavailable (%s) — skipping speculative path", exc)


async def transcribe_audio_api(
    audio_bytes: bytes,
    language: str | None = None,
    provider: str = "auto",
) -> dict[str, Any]:
    """Transcribe audio. Chain: Sarvam AI → Deepgram → Groq Whisper → OpenAI Whisper.

    Sarvam AI is primary — it handles all Indian languages natively (en-IN, ta-IN,
    hi-IN, te-IN, kn-IN, ml-IN, etc.) and returns accurate Devanagari / Tamil script
    instead of transliterated English that Deepgram produces for Indic audio.
    """

    providers = [
        ("sarvam", "SARVAM_API_KEY", _sarvam_stt),
        ("deepgram", "DEEPGRAM_API_KEY", _deepgram_stt),
        ("groq", "GROQ_API_KEY", _groq_stt),
        ("openai", "OPENAI_API_KEY", _openai_stt),
    ]

    for name, env_key, func in providers:
        if provider not in ("auto", name):
            continue
        api_key = os.environ.get(env_key, "")
        if not api_key:
            continue
        try:
            return await func(audio_bytes, api_key, language)
        except Exception as e:
            logger.warning("%s STT failed: %s", name, e)

    return {"text": "", "language": language or "en", "provider": "none", "confidence": 0.0,
            "error": "No STT provider available"}


# Indic language codes — ensemble routes these to both Deepgram + Sarvam in
# parallel. English stays Deepgram-only (faster, lower WER for EN).
_INDIC_LANG_CODES = {"hi", "ta", "te", "kn", "ml", "bn", "mr", "gu", "pa", "or", "as", "ur"}


async def transcribe_ensemble(
    audio_bytes: bytes,
    language: str | None = None,
) -> dict[str, Any]:
    """Ensemble STT — race Deepgram + Sarvam, pick the higher-confidence result.

    Rationale (Phase 1 W2.1): Deepgram nails English (~4% WER) but weaker on
    Indic. Sarvam is purpose-built for Indic (~5-7% Hindi WER). Running them
    in parallel + picking by confidence gives us industry-lowest WER without
    paying latency cost (slower of the two wins, which is basically the same
    as calling one).

    CRITICAL: Deepgram Nova-2 transcribes Indic audio as English transliterations
    ("premium plan" instead of "प्रीमियम प्लान") which causes 40%+ WER. When
    Sarvam is unavailable, route Indic to Groq Whisper (handles native script).
    """

    dg_key = os.environ.get("DEEPGRAM_API_KEY", "")
    sv_key = os.environ.get("SARVAM_API_KEY", "")
    groq_key = os.environ.get("GROQ_API_KEY", "")

    lang = (language or "").lower()[:2]
    is_indic = lang in _INDIC_LANG_CODES

    # For non-Indic languages: Deepgram is best (low WER, fast)
    if lang and not is_indic:
        if dg_key:
            return await _deepgram_stt(audio_bytes, dg_key, language)
        return await transcribe_audio_api(audio_bytes, language=language)

    # Indic path: Sarvam > Groq Whisper > Deepgram (in that preference order)
    # Deepgram is last resort for Indic — it outputs transliterated English
    if not sv_key and not groq_key and not dg_key:
        return await transcribe_audio_api(audio_bytes, language=language)

    if not sv_key:
        # No Sarvam — use Groq Whisper (writes native Devanagari/Tamil script)
        if groq_key:
            return await _groq_stt(audio_bytes, groq_key, language)
        # Last resort: Deepgram (WER will be higher but better than nothing)
        return await _deepgram_stt(audio_bytes, dg_key, language)

    # Indic with Sarvam available: use Sarvam ONLY (do NOT race with Deepgram).
    # Reason: Deepgram returns high confidence scores even when it transliterates
    # Hindi/Tamil words into English ("premium plan" instead of "प्रीमियम प्लान").
    # Racing causes Deepgram to win the confidence comparison despite wrong script.
    try:
        result = await _sarvam_stt(audio_bytes, sv_key, language)
        if result.get("text"):
            return result
        logger.warning("Sarvam STT returned empty text for lang=%s, falling back", language)
    except Exception as exc:
        logger.warning("Sarvam STT failed for lang=%s: %s — falling back to Groq Whisper", language, exc)

    # Sarvam failed → try Bhashini (AI4Bharat, FREE, better Tamil dialect accuracy)
    try:
        from voice_engine.providers.bhashini_stt import bhashini_stt
        from voice_engine.providers.bhashini_stt import is_configured as bhashini_ok
        if bhashini_ok():
            result = await bhashini_stt(audio_bytes, language or "ta")
            if result.get("text"):
                logger.info("[Ensemble] Bhashini fallback succeeded for lang=%s", language)
                return result
    except Exception as exc:
        logger.debug("[Ensemble] Bhashini fallback failed: %s", exc)

    # Sarvam + Bhashini both failed → Groq Whisper (native script output)
    if groq_key:
        return await _groq_stt(audio_bytes, groq_key, language)
    # Last resort: Deepgram (WER will be inflated but better than nothing)
    if dg_key:
        return await _deepgram_stt(audio_bytes, dg_key, language)
    return await transcribe_audio_api(audio_bytes, language=language)


async def _deepgram_stt(
    audio_bytes: bytes,
    api_key: str,
    language: str | None,
    diarize: bool = False,
) -> dict[str, Any]:
    """Deepgram Nova-2 — fastest, real-time streaming capable.

    diarize=True → returns per-word speaker tags (0, 1, 2…) and a
    `speakers` list with one segment per speaker turn. Useful for
    call-recording analysis + multi-party conferences.
    """
    # Nova-2 supported language codes (others get detect_language=true fallback)
    _NOVA2_SUPPORTED = {
        "en", "es", "fr", "de", "pt", "it", "nl", "ru", "ja", "ko", "zh",
        "ar", "hi", "tr", "pl", "uk", "sv", "no", "da", "cs", "fi", "ro",
        "sk", "bg", "hr", "hu", "el", "sr", "lt", "lv", "et", "sl", "ca",
        "af", "id", "ms", "vi", "th", "tl",
    }

    # Detect audio MIME type from magic bytes (avoids 400 on MP3/Opus from Edge TTS)
    content_type = "audio/wav"
    if audio_bytes[:3] in (b"ID3", b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
        content_type = "audio/mpeg"
    elif audio_bytes[:4] == b"OggS":
        content_type = "audio/ogg"
    elif audio_bytes[:4] == b"fLaC":
        content_type = "audio/flac"

    lang_code = (language or "").lower()[:2]
    params: dict = {"model": "nova-2", "smart_format": "true", "punctuate": "true"}
    if language and lang_code in _NOVA2_SUPPORTED:
        params["language"] = language
    else:
        # Unsupported language code — let Deepgram auto-detect
        params["detect_language"] = "true"
    if diarize:
        params["diarize"] = "true"

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.deepgram.com/v1/listen",
            headers={"Authorization": f"Token {api_key}", "Content-Type": content_type},
            params=params, content=audio_bytes,
        )
        resp.raise_for_status()
        data = resp.json()

    ch = data.get("results", {}).get("channels", [{}])
    alt = ch[0].get("alternatives", [{}])[0] if ch else {}

    result: dict[str, Any] = {
        "text": alt.get("transcript", ""),
        "language": ch[0].get("detected_language", language or "en") if ch else language or "en",
        "provider": "deepgram",
        "confidence": alt.get("confidence", 0.0),
    }

    if diarize:
        # Fold consecutive same-speaker words into one segment.
        segments: list[dict[str, Any]] = []
        cur: dict[str, Any] | None = None
        for w in alt.get("words", []):
            sp = w.get("speaker", 0)
            if cur is None or cur["speaker"] != sp:
                if cur:
                    segments.append(cur)
                cur = {"speaker": sp, "text": w.get("punctuated_word") or w.get("word", ""),
                       "start": w.get("start", 0), "end": w.get("end", 0)}
            else:
                cur["text"] += " " + (w.get("punctuated_word") or w.get("word", ""))
                cur["end"] = w.get("end", cur["end"])
        if cur:
            segments.append(cur)
        result["speakers"] = segments
        result["speaker_count"] = len({s["speaker"] for s in segments}) if segments else 0

    return result


async def _sarvam_stt(audio_bytes: bytes, api_key: str, language: str | None) -> dict[str, Any]:
    """Sarvam AI — built for Indian languages (Tamil, Hindi, Telugu, etc.).

    When `language` is None or unknown, we send `language_code='unknown'`
    which triggers Sarvam's built-in language identification instead of
    silently defaulting to Hindi.  The detected language is read back from
    the response and returned so downstream TTS picks the right voice.
    """
    # Sarvam confirmed supports these 11 Indic locales as of 2026.
    # Others (as/ur/ne/kok/mni/sd/sa) route to OpenAI Whisper via
    # the chain in transcribe_audio_api().
    lang_map = {"ta": "ta-IN", "hi": "hi-IN", "te": "te-IN", "kn": "kn-IN",
                "ml": "ml-IN", "bn": "bn-IN", "mr": "mr-IN", "gu": "gu-IN",
                "en": "en-IN", "pa": "pa-IN", "or": "or-IN"}
    # Devanagari-family langs (Nepali, Konkani, Sanskrit) — fall back to Hindi
    # locale at Sarvam. Accuracy drops but voice still intelligible.
    devanagari_fallback = {"ne", "kok", "sa"}
    norm = (language or "").lower().split("-")[0] or None
    if norm and norm in lang_map:
        sarvam_lang = lang_map[norm]
    elif norm and norm in devanagari_fallback:
        sarvam_lang = "hi-IN"
    else:
        # No usable hint — let Sarvam auto-detect instead of pinning to hi-IN.
        sarvam_lang = "unknown"

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(audio_bytes)
        tmp_path = f.name

    try:
        # Sarvam new keys (sk_...) use Authorization: Bearer.
        # Legacy keys use API-Subscription-Key. Support both.
        auth_headers = (
            {"Authorization": f"Bearer {api_key}"}
            if api_key.startswith("sk_")
            else {"API-Subscription-Key": api_key}
        )
        async with httpx.AsyncClient(timeout=30) as client:
            with open(tmp_path, "rb") as audio_file:
                resp = await client.post(
                    "https://api.sarvam.ai/speech-to-text",
                    headers=auth_headers,
                    files={"file": ("audio.wav", audio_file, "audio/wav")},
                    data={"language_code": sarvam_lang, "model": "saarika:v2"},
                )
            resp.raise_for_status()
            data = resp.json()
    finally:
        os.unlink(tmp_path)

    # Read back the detected language Sarvam actually used.  Falls back to
    # the requested hint, then "hi" as a last resort.  This is what fixes
    # the long-standing bug where every auto-detect call reported "hi".
    detected_raw = (data.get("language_code") or sarvam_lang or "").lower()
    detected = detected_raw.split("-")[0] if detected_raw and detected_raw != "unknown" else (norm or "hi")

    return {
        "text": data.get("transcript", ""),
        "language": detected,
        "provider": "sarvam", "confidence": data.get("confidence", 0.85),
    }


async def _groq_stt(audio_bytes: bytes, api_key: str, language: str | None) -> dict[str, Any]:
    """Groq Whisper Large v3 — fast + free tier."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(audio_bytes)
        tmp_path = f.name

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            with open(tmp_path, "rb") as audio_file:
                resp = await client.post(
                    "https://api.groq.com/openai/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    files={"file": ("audio.wav", audio_file, "audio/wav")},
                    data={"model": "whisper-large-v3", "language": language or ""},
                )
            resp.raise_for_status()
            data = resp.json()
    finally:
        os.unlink(tmp_path)

    return {"text": data.get("text", ""), "language": language or "en",
            "provider": "groq_whisper", "confidence": 0.95}


async def _openai_stt(audio_bytes: bytes, api_key: str, language: str | None) -> dict[str, Any]:
    """OpenAI Whisper-1 — highest accuracy."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(audio_bytes)
        tmp_path = f.name

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            with open(tmp_path, "rb") as audio_file:
                resp = await client.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    files={"file": ("audio.wav", audio_file, "audio/wav")},
                    data={"model": "whisper-1", "language": language or ""},
                )
            resp.raise_for_status()
            data = resp.json()
    finally:
        os.unlink(tmp_path)

    return {"text": data.get("text", ""), "language": language or "en",
            "provider": "openai_whisper", "confidence": 0.9}


# ═════════════════════════════════════════════════════════════════
# LLM (Language Model) — 5 providers
# ═════════════════════════════════════════════════════════════════

async def call_llm_api(
    system_prompt: str,
    user_message: str,
    provider: str = "auto",
    model: str = None,
) -> dict[str, Any]:
    """Call LLM. Chain: Gemini 2.5 Pro → Groq → OpenAI → Anthropic → Deepseek → stub.

    Gemini 2.5 Pro is primary — best quality-cost balance for Indian context,
    supports code-switching, and handles Indic-accented English well.
    Falls back to Groq for speed if Gemini key is not set.
    """

    providers_list = [
        ("gemini", "GOOGLE_API_KEY", _gemini_llm),
        ("groq", "GROQ_API_KEY", _groq_llm),
        ("kimi", "KIMI_API_KEY", _kimi_llm),
        ("openai", "OPENAI_API_KEY", _openai_llm),
        ("anthropic", "ANTHROPIC_API_KEY", _anthropic_llm),
        ("deepseek", "DEEPSEEK_API_KEY", _deepseek_llm),
    ]

    # Two-pass strategy:
    #   PASS 1 — Try the explicitly-requested provider (or any in "auto" mode).
    #   PASS 2 — If it failed (and we weren't in auto), still cascade through
    #            the remaining providers as a safety net.  Without this,
    #            a Gemini outage would silently land users on the stub
    #            error message even though Groq/OpenAI keys are valid.

    last_error: Exception | None = None

    def _try(name: str, env_key: str, func) -> dict | None:
        """Attempt one provider; return result dict or None on failure."""
        nonlocal last_error
        if name == "gemini":
            api_key = _google_key()
        else:
            api_key = os.environ.get(env_key, "")
        if not api_key:
            return None
        try:
            t = time.time()
            text = func(system_prompt, user_message, api_key, model)
            # support both sync and async funcs
            import inspect
            if inspect.iscoroutine(text):
                # coroutine — caller is async, so we can't await here.
                # but all our _xxx_llm funcs ARE coroutines, so this branch
                # is not actually used in production.  Kept for safety.
                pass
            return {"text": text, "provider": name,
                    "latency_ms": (time.time() - t) * 1000}
        except Exception as e:
            last_error = e
            logger.warning("%s LLM failed: %s", name, e)
            return None

    # PASS 1 — try the explicit requested provider (if any)
    if provider != "auto":
        for name, env_key, func in providers_list:
            if name == provider:
                if name == "gemini":
                    api_key = _google_key()
                else:
                    api_key = os.environ.get(env_key, "")
                if api_key:
                    try:
                        t = time.time()
                        text = await func(system_prompt, user_message, api_key, model)
                        return {"text": text, "provider": name,
                                "latency_ms": (time.time() - t) * 1000}
                    except Exception as e:
                        last_error = e
                        logger.warning(
                            "Requested %s LLM failed: %s — cascading to other providers",
                            name, e,
                        )
                break

    # PASS 2 — cascade through all providers (skipping the one we just tried).
    # Runs whether mode was "auto" or whether explicit provider failed.
    skip = provider if provider != "auto" else None
    for name, env_key, func in providers_list:
        if name == skip:
            continue
        if name == "gemini":
            api_key = _google_key()
        else:
            api_key = os.environ.get(env_key, "")
        if not api_key:
            continue
        try:
            t = time.time()
            text = await func(system_prompt, user_message, api_key, model)
            logger.info(
                "LLM cascade: requested=%s succeeded with %s",
                provider, name,
            )
            return {"text": text, "provider": name,
                    "latency_ms": (time.time() - t) * 1000}
        except Exception as e:
            last_error = e
            logger.warning("%s LLM failed: %s", name, e)

    # No LLM provider worked — return typed diagnostic so caller can yield it.
    configured = [
        env_k for (_, env_k, _) in providers_list
        if os.environ.get(env_k, "")
    ]
    if not configured:
        msg = ("[LLM_NOT_CONFIGURED] No LLM API key reached the server. "
               "Add GOOGLE_API_KEY (https://aistudio.google.com/app/apikey) to "
               "Coolify env vars and redeploy.")
    else:
        last_msg = f" Last error: {last_error}" if last_error else ""
        msg = (f"[LLM_ALL_FAILED] All providers ({', '.join(configured)}) "
               f"returned errors.{last_msg}")
    logger.error(msg)
    return {"text": msg, "provider": "error", "latency_ms": 0}


# ─── W1.2 Streaming LLM — yields token deltas as SSE events arrive ───

async def call_llm_stream(
    system_prompt: str,
    user_message: str,
    provider: str = "auto",
    model: str = None,
    history: list | None = None,
) -> AsyncGenerator[str, None]:
    """Async generator of partial text chunks.

    Streaming paths:
      - gemini      -> SSE /streamGenerateContent (native Gemini streaming)
      - groq        -> SSE /chat/completions?stream=true  (OpenAI-compat)
      - openai      -> SSE /chat/completions?stream=true
      - deepseek    -> SSE /chat/completions?stream=true

    Non-streaming paths fall back to call_llm_api() — the whole response is
    yielded as a single chunk so the downstream pipeline still works.

    history: optional list of prior {"role": ..., "content": ...} messages
             inserted between system prompt and current user message so the
             model has conversation context for multi-turn calls.
    """
    messages = [{"role": "system", "content": system_prompt}]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    # ── Gemini streaming (primary) ──────────────────────────────────────────
    if provider in ("auto", "gemini"):
        gemini_key = _google_key()
        if gemini_key:
            chosen_model = model or "gemini-2.5-pro"
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/"
                f"{chosen_model}:streamGenerateContent?alt=sse&key={gemini_key}"
            )
            gemini_contents = []
            # Map OpenAI-style history to Gemini contents format
            for msg in messages:
                role = "user" if msg["role"] in ("user", "system") else "model"
                gemini_contents.append({"role": role, "parts": [{"text": msg["content"]}]})
            try:
                async with httpx.AsyncClient(timeout=30) as client, client.stream(
                    "POST", url,
                    json={"contents": gemini_contents,
                          "generationConfig": {"maxOutputTokens": 200, "temperature": 0.7}},
                ) as resp:
                    if resp.status_code == 200:
                        async for raw_line in resp.aiter_lines():
                            if not raw_line or not raw_line.startswith("data:"):
                                continue
                            payload = raw_line[5:].strip()
                            if not payload or payload == "[DONE]":
                                continue
                            try:
                                obj = json.loads(payload)
                                parts = (obj.get("candidates", [{}])[0]
                                           .get("content", {})
                                           .get("parts", []))
                                for part in parts:
                                    text = part.get("text", "")
                                    if text:
                                        yield text
                            except (KeyError, IndexError, json.JSONDecodeError):
                                continue
                        return
                    else:
                        body = await resp.aread()
                        logger.warning("Gemini stream HTTP %s: %s", resp.status_code, body[:200])
            except Exception as e:
                logger.warning("Gemini stream failed, trying next: %s", e)

    # ── OpenAI-compatible streaming (Groq / OpenAI / DeepSeek) ─────────────
    # ── OpenAI-compatible streaming (Groq / OpenAI / DeepSeek) ─────────────
    # If we got here, either the user asked for one of these explicitly OR
    # the requested provider (e.g. Gemini) failed and we need to fall back.
    # Cascade through ALL configured ones — don't filter by `provider` here,
    # the explicit-provider check has already happened above.
    openai_compat = [
        ("groq", "GROQ_API_KEY", "https://api.groq.com/openai/v1/chat/completions",
         model or "llama-3.1-8b-instant"),
        ("kimi", "KIMI_API_KEY", "https://api.moonshot.cn/v1/chat/completions",
         model or "moonshot-v1-8k"),
        ("openai", "OPENAI_API_KEY", "https://api.openai.com/v1/chat/completions",
         model or "gpt-4o-mini"),
        ("deepseek", "DEEPSEEK_API_KEY", "https://api.deepseek.com/v1/chat/completions",
         model or "deepseek-chat"),
    ]

    # If provider is one of the openai-compat options AND it has a key, try
    # it first (preserve user's explicit choice).  Otherwise just cascade
    # through all of them in order, which gives us proper fallback behaviour
    # when the requested provider (gemini) failed silently.
    if provider in ("groq", "kimi", "openai", "deepseek"):
        openai_compat = (
            [p for p in openai_compat if p[0] == provider] +
            [p for p in openai_compat if p[0] != provider]
        )

    streamed_anything = False
    for name, env_key, url, chosen_model in openai_compat:
        api_key = os.environ.get(env_key, "")
        if not api_key:
            continue
        try:
            async with httpx.AsyncClient(timeout=30) as client, client.stream(
                "POST", url,
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": chosen_model,
                    "messages": messages,
                    "max_tokens": 200,
                    "temperature": 0.7,
                    "stream": True,
                },
            ) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    logger.warning("%s stream HTTP %s: %s", name, resp.status_code, body[:200])
                    raise RuntimeError(f"{name} stream HTTP {resp.status_code}")
                async for raw_line in resp.aiter_lines():
                    if not raw_line or not raw_line.startswith("data:"):
                        continue
                    payload = raw_line[5:].strip()
                    if payload == "[DONE]":
                        return
                    try:
                        obj = json.loads(payload)
                        delta = obj["choices"][0].get("delta", {}).get("content")
                        if delta:
                            streamed_anything = True
                            yield delta
                    except (KeyError, IndexError, json.JSONDecodeError):
                        continue
            if streamed_anything:
                logger.info("LLM stream cascade: %s succeeded", name)
                return
        except Exception as e:
            logger.warning("%s stream failed, trying next: %s", name, e)

    # Fallback: non-streaming call as last resort (yields whole text at once)
    if not streamed_anything:
        result = await call_llm_api(system_prompt, user_message, provider=provider, model=model)
        if result.get("text"):
            yield result["text"]


async def _groq_llm(system_prompt: str, user_message: str, api_key: str, model: str = None) -> str:
    """Groq — Llama 3.1, ~100ms latency."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": model or "llama-3.1-8b-instant",
                  "messages": [{"role": "system", "content": system_prompt},
                               {"role": "user", "content": user_message}],
                  "max_tokens": 200, "temperature": 0.7},
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()


async def _gemini_llm(system_prompt: str, user_message: str, api_key: str, model: str = None) -> str:
    """Google Gemini 2.5 Pro — best quality Indian-context LLM, handles code-switching."""
    chosen = model or "gemini-2.5-pro"
    # Use system_instruction + user turn for proper role separation
    payload = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_message}]}],
        "generationConfig": {"maxOutputTokens": 200, "temperature": 0.7},
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{chosen}:generateContent?key={api_key}",
            json=payload,
        )
        resp.raise_for_status()
        return resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()


async def _openai_llm(system_prompt: str, user_message: str, api_key: str, model: str = None) -> str:
    """OpenAI GPT-4o-mini."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": model or "gpt-4o-mini",
                  "messages": [{"role": "system", "content": system_prompt},
                               {"role": "user", "content": user_message}],
                  "max_tokens": 200, "temperature": 0.7},
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()


async def _anthropic_llm(system_prompt: str, user_message: str, api_key: str, model: str = None) -> str:
    """Anthropic Claude Haiku."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": api_key, "content-type": "application/json",
                     "anthropic-version": "2023-06-01"},
            json={"model": model or "claude-haiku-4-5-20251001", "max_tokens": 200,
                  "system": system_prompt,
                  "messages": [{"role": "user", "content": user_message}]},
        )
        resp.raise_for_status()
        return resp.json()["content"][0]["text"].strip()


async def _deepseek_llm(system_prompt: str, user_message: str, api_key: str, model: str = None) -> str:
    """Deepseek — cheap, good for code/reasoning."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://api.deepseek.com/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": model or "deepseek-chat",
                  "messages": [{"role": "system", "content": system_prompt},
                               {"role": "user", "content": user_message}],
                  "max_tokens": 200, "temperature": 0.7},
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()


async def _kimi_llm(system_prompt: str, user_message: str, api_key: str, model: str = None) -> str:
    """Kimi (Moonshot AI) — OpenAI-compatible, strong multilingual."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://api.moonshot.cn/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": model or "moonshot-v1-8k",
                  "messages": [{"role": "system", "content": system_prompt},
                               {"role": "user", "content": user_message}],
                  "max_tokens": 200, "temperature": 0.7},
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()


# ═════════════════════════════════════════════════════════════════
# TTS (Text-to-Speech) — 6 providers
# ═════════════════════════════════════════════════════════════════

_OPENAI_VOICES = {"nova", "alloy", "echo", "fable", "onyx", "shimmer"}
_ELEVENLABS_VOICE_MAP = {
    "rachel": "21m00Tcm4TlvDq8ikWAM",
    "domi": "AZnzlk1XvdvUeBnXmlld",
    "bella": "EXAVITQu4vr4xnSDxMaL",
    "elli": "MF3mGyEYCl7XYWbV9V6O",
    "josh": "TxGEqnHWrfWFTfGW9XjX",
    "arnold": "VR6AewLTigWG4xSOukaG",
    "adam": "pNInz6obpgDQGcFmaJgB",
    "sam": "yoZ06aMxZJJ28mfd3POQ",
}


_CARTESIA_VOICE_MAP = {
    # Default Indian-accented English voices on Cartesia
    "priya":   "694f9389-aac1-45b6-b726-9d9369183238",
    "meera":   "156fb8d2-335b-4950-9cb3-a2d33befec77",
    "arjun":   "a0e99841-438c-4a64-b679-ae501e7d6091",
    "default": "694f9389-aac1-45b6-b726-9d9369183238",
}

_INDIC_TTS_LANGS = {"ta", "te", "kn", "ml", "hi", "bn", "mr", "gu", "pa", "or", "as"}


async def synthesize_speech_api(
    text: str,
    language: str = "en",
    voice_id: str | None = None,
    provider: str = "auto",
    speed: float = 1.0,
    emotion: str | None = None,
    stability: float = 0.65,
    similarity_boost: float = 0.80,
) -> dict[str, Any]:
    """Synthesize speech.

    Chain (English):    ElevenLabs Turbo v2.5 → Cartesia Sonic-2 → OpenAI → Edge TTS
    Chain (Indian):     Sarvam TTS → ElevenLabs → OpenAI → Edge TTS
    Chain (rare langs): Google Cloud TTS → Edge TTS

    ElevenLabs Turbo v2.5 gives MOS 4.8 for English.
    Cartesia Sonic-2 gives MOS 4.7 with 80ms TTFA — best for real-time.
    Sarvam TTS gives MOS 4.4 for Indian languages natively.
    """
    t_start = time.time()
    lang = (language or "en").lower()[:2]
    is_indic = lang in _INDIC_TTS_LANGS

    # Resolve ElevenLabs voice ID
    resolved_voice = voice_id
    is_openai_voice = voice_id and voice_id.lower() in _OPENAI_VOICES
    if voice_id and voice_id.lower() in _ELEVENLABS_VOICE_MAP:
        resolved_voice = _ELEVENLABS_VOICE_MAP[voice_id.lower()]

    if is_indic and provider == "auto":
        # Indic chain: Sarvam → ElevenLabs → OpenAI → Edge TTS
        providers_list = [
            ("sarvam", "SARVAM_API_KEY", lambda: _sarvam_tts(text, os.environ["SARVAM_API_KEY"], language, speed)),
            ("elevenlabs", "ELEVENLABS_API_KEY", lambda: _elevenlabs_tts(text, os.environ["ELEVENLABS_API_KEY"], resolved_voice, speed, stability, similarity_boost)),
            ("openai", "OPENAI_API_KEY", lambda: _openai_tts(text, os.environ["OPENAI_API_KEY"], voice_id, speed)),
            ("google", "GOOGLE_API_KEY", lambda: _google_tts(text, _google_key(), language, voice_id)),
        ]
    else:
        # English chain: ElevenLabs → Cartesia → OpenAI → Deepgram → Edge TTS
        providers_list = [
            ("elevenlabs", "ELEVENLABS_API_KEY", lambda: _elevenlabs_tts(text, os.environ["ELEVENLABS_API_KEY"], resolved_voice, speed, stability, similarity_boost)),
            ("cartesia", "CARTESIA_API_KEY", lambda: _cartesia_tts(text, os.environ["CARTESIA_API_KEY"], voice_id, language, speed)),
            ("openai", "OPENAI_API_KEY", lambda: _openai_tts(text, os.environ["OPENAI_API_KEY"], voice_id, speed)),
            ("deepgram", "DEEPGRAM_API_KEY", lambda: _deepgram_tts(text, os.environ["DEEPGRAM_API_KEY"], voice_id)),
            ("google", "GOOGLE_API_KEY", lambda: _google_tts(text, _google_key(), language, voice_id)),
        ]

    # Override: if caller pinned a specific provider
    if provider not in ("auto",) and not is_indic:
        pass  # will be filtered in the loop below by provider != name check

    # If the voice is an OpenAI voice name, put OpenAI first — but NOT for Indic
    # languages where Sarvam is vastly better (OpenAI doesn't speak Tamil/Hindi well)
    if is_openai_voice and provider == "auto" and not is_indic:
        providers_list = [p for p in providers_list if p[0] == "openai"] + \
                         [p for p in providers_list if p[0] != "openai"]

    for name, env_key, func in providers_list:
        if provider not in ("auto", name):
            continue
        if not os.environ.get(env_key):
            continue
        try:
            result = await func()
            result["latency_ms"] = (time.time() - t_start) * 1000
            return result
        except Exception as e:
            logger.warning("%s TTS failed: %s", name, e)

    # Edge TTS — always available, free, no API key
    try:
        result = await _edge_tts(text, language, speed)
        result["latency_ms"] = (time.time() - t_start) * 1000
        return result
    except Exception as e:
        logger.warning("Edge TTS failed: %s", e)

    return {"audio_base64": "", "format": "wav", "provider": "none", "latency_ms": 0,
            "error": "No TTS provider available"}


async def _elevenlabs_tts(
    text: str,
    api_key: str,
    voice_id: str | None,
    speed: float,
    stability: float = 0.65,
    similarity_boost: float = 0.80,
) -> dict[str, Any]:
    """ElevenLabs Turbo v2.5 — MOS 4.8, best quality, 29+ languages, voice cloning."""
    vid = voice_id or "21m00Tcm4TlvDq8ikWAM"  # Rachel (Indian-accented English)
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{vid}",
            headers={"xi-api-key": api_key, "Content-Type": "application/json"},
            json={
                "text": text,
                "model_id": "eleven_turbo_v2_5",        # upgraded: best quality + speed
                "voice_settings": {
                    "stability": stability,               # 0.65 = conversational, natural variation
                    "similarity_boost": similarity_boost, # 0.80 = close to reference voice
                    "style": 0.15,                        # slight style expression
                    "use_speaker_boost": True,
                    "speed": speed,
                },
                "output_format": "pcm_22050",             # raw PCM for lowest latency
            },
        )
        resp.raise_for_status()
    return {"audio_base64": base64.b64encode(resp.content).decode(), "format": "pcm",
            "provider": "elevenlabs", "sample_rate": 22050}


async def _cartesia_tts(
    text: str,
    api_key: str,
    voice_id: str | None,
    language: str,
    speed: float,
) -> dict[str, Any]:
    """Cartesia Sonic-2 — MOS 4.7, 80ms TTFA, best for real-time English agents."""
    vid = _CARTESIA_VOICE_MAP.get((voice_id or "").lower(), _CARTESIA_VOICE_MAP["default"])
    lang_code = (language or "en").lower()[:2]
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.cartesia.ai/tts/bytes",
            headers={
                "X-API-Key": api_key,
                "Cartesia-Version": "2024-06-10",
                "Content-Type": "application/json",
            },
            json={
                "model_id": "sonic-2",
                "transcript": text,
                "voice": {"mode": "id", "id": vid},
                "output_format": {
                    "container": "raw",
                    "encoding": "pcm_s16le",
                    "sample_rate": 22050,
                },
                "language": lang_code,
                "speed": speed,
            },
        )
        resp.raise_for_status()
    return {"audio_base64": base64.b64encode(resp.content).decode(), "format": "pcm",
            "provider": "cartesia", "sample_rate": 22050}


async def _sarvam_tts(text: str, api_key: str, language: str, speed: float) -> dict[str, Any]:
    """Sarvam AI — native Indian language TTS (Tamil, Hindi, Telugu, etc.)."""
    lang_map = {"ta": "ta-IN", "hi": "hi-IN", "te": "te-IN", "kn": "kn-IN",
                "ml": "ml-IN", "bn": "bn-IN", "mr": "mr-IN", "gu": "gu-IN",
                "en": "en-IN", "pa": "pa-IN", "or": "or-IN"}
    sarvam_lang = lang_map.get(language, "hi-IN")

    # Sarvam speakers: anushka, abhilash, manisha, vidya, arya, karun,
    # hitesh, aditya, ritu, priya, neha, rahul, pooja, rohan, simran, kavya
    voice_map = {"ta-IN": "anushka", "hi-IN": "abhilash", "te-IN": "arya",
                 "kn-IN": "priya", "ml-IN": "manisha", "bn-IN": "neha",
                 "mr-IN": "kavya", "gu-IN": "ritu", "en-IN": "vidya"}
    speaker = voice_map.get(sarvam_lang, "anushka")

    # Sarvam new keys (sk_...) use Authorization: Bearer.
    # Legacy keys use API-Subscription-Key. Support both.
    tts_auth = (
        {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        if api_key.startswith("sk_")
        else {"API-Subscription-Key": api_key, "Content-Type": "application/json"}
    )
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.sarvam.ai/text-to-speech",
            headers=tts_auth,
            json={"inputs": [text], "target_language_code": sarvam_lang,
                  "speaker": speaker, "model": "bulbul:v2",
                  "pace": speed, "loudness": 1.0, "enable_preprocessing": True},
        )
        resp.raise_for_status()
        data = resp.json()

    audio_b64 = data.get("audios", [""])[0]
    return {"audio_base64": audio_b64, "format": "wav", "provider": "sarvam", "sample_rate": 22050}


async def _openai_tts(text: str, api_key: str, voice_id: str | None, speed: float) -> dict[str, Any]:
    """OpenAI TTS-1 — 6 voices (alloy, echo, fable, onyx, nova, shimmer)."""
    voice = voice_id or "nova"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.openai.com/v1/audio/speech",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": "tts-1", "input": text, "voice": voice, "speed": speed,
                  "response_format": "mp3"},
        )
        resp.raise_for_status()
    return {"audio_base64": base64.b64encode(resp.content).decode(), "format": "mp3",
            "provider": "openai_tts", "sample_rate": 24000}


async def _deepgram_tts(text: str, api_key: str, voice_id: str | None) -> dict[str, Any]:
    """Deepgram Aura — lowest latency TTS."""
    voice = voice_id or "aura-asteria-en"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"https://api.deepgram.com/v1/speak?model={voice}",
            headers={"Authorization": f"Token {api_key}", "Content-Type": "application/json"},
            json={"text": text},
        )
        resp.raise_for_status()
    return {"audio_base64": base64.b64encode(resp.content).decode(), "format": "mp3",
            "provider": "deepgram_aura", "sample_rate": 24000}


async def _google_tts(text: str, api_key: str, language: str, voice_id: str | None) -> dict[str, Any]:
    """Google Cloud TTS — WaveNet voices, wide language support."""
    lang_map = {"ta": "ta-IN", "hi": "hi-IN", "te": "te-IN", "kn": "kn-IN",
                "ml": "ml-IN", "bn": "bn-IN", "mr": "mr-IN", "gu": "gu-IN",
                "en": "en-IN", "pa": "pa-IN"}
    google_lang = lang_map.get(language, "en-IN")
    voice_name = voice_id or f"{google_lang}-Wavenet-A"

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"https://texttospeech.googleapis.com/v1/text:synthesize?key={api_key}",
            json={
                "input": {"text": text},
                "voice": {"languageCode": google_lang, "name": voice_name},
                "audioConfig": {"audioEncoding": "MP3", "speakingRate": 1.0},
            },
        )
        resp.raise_for_status()
        data = resp.json()

    return {"audio_base64": data.get("audioContent", ""), "format": "mp3",
            "provider": "google_cloud_tts", "sample_rate": 24000}


async def _edge_tts(text: str, language: str, speed: float) -> dict[str, Any]:
    """Microsoft Edge TTS — FREE, no API key, 9+ Indian language voices."""
    import edge_tts

    voice_map = {
        "ta": "ta-IN-PallaviNeural", "hi": "hi-IN-SwaraNeural",
        "te": "te-IN-ShrutiNeural", "kn": "kn-IN-SapnaNeural",
        "ml": "ml-IN-SobhanaNeural", "bn": "bn-IN-TanishaaNeural",
        "mr": "mr-IN-AarohiNeural", "gu": "gu-IN-DhwaniNeural",
        "en": "en-IN-NeerjaNeural", "pa": "pa-IN-Default",
        "or": "or-IN-Default",
    }
    voice = voice_map.get(language, "en-IN-NeerjaNeural")
    rate_str = f"{int((speed - 1) * 100):+d}%"

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        tmp_path = f.name
    try:
        comm = edge_tts.Communicate(text, voice, rate=rate_str)
        await comm.save(tmp_path)
        with open(tmp_path, "rb") as f:
            audio_bytes = f.read()
    finally:
        os.unlink(tmp_path)

    return {"audio_base64": base64.b64encode(audio_bytes).decode(), "format": "mp3",
            "provider": "edge_tts", "sample_rate": 24000}
