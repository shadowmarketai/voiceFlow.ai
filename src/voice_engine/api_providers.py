"""
API-based Voice Providers — Full Production Pipeline
=====================================================
All cloud-based — no local ML models, no GPU needed.

STT chain: Deepgram → Sarvam AI → Bhashini (AI4Bharat) → Groq Whisper → OpenAI Whisper
LLM chain: Groq → Gemini → OpenAI → Anthropic → Deepseek → stub
TTS chain: ElevenLabs → Sarvam AI → OpenAI TTS → Deepgram Aura → Google Cloud → Edge TTS (free)

Env vars needed:
  DEEPGRAM_API_KEY, GROQ_API_KEY, OPENAI_API_KEY, ELEVENLABS_API_KEY,
  ANTHROPIC_API_KEY, GOOGLE_API_KEY, SARVAM_API_KEY, DEEPSEEK_API_KEY
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


# ═════════════════════════════════════════════════════════════════
# STT (Speech-to-Text) — 4 providers
# ═════════════════════════════════════════════════════════════════

async def transcribe_audio_api(
    audio_bytes: bytes,
    language: str | None = None,
    provider: str = "auto",
) -> dict[str, Any]:
    """Transcribe audio. Chain: Deepgram → Sarvam → Groq Whisper → OpenAI Whisper."""

    providers = [
        ("deepgram", "DEEPGRAM_API_KEY", _deepgram_stt),
        ("sarvam", "SARVAM_API_KEY", _sarvam_stt),
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
    """Sarvam AI — built for Indian languages (Tamil, Hindi, Telugu, etc.)."""
    # Sarvam confirmed supports these 11 Indic locales as of 2026.
    # Others (as/ur/ne/kok/mni/sd/sa) route to OpenAI Whisper via
    # the chain in transcribe_audio_api().
    lang_map = {"ta": "ta-IN", "hi": "hi-IN", "te": "te-IN", "kn": "kn-IN",
                "ml": "ml-IN", "bn": "bn-IN", "mr": "mr-IN", "gu": "gu-IN",
                "en": "en-IN", "pa": "pa-IN", "or": "or-IN"}
    # Devanagari-family langs (Nepali, Konkani, Sanskrit) — fall back to Hindi
    # locale at Sarvam. Accuracy drops but voice still intelligible.
    devanagari_fallback = {"ne", "kok", "sa"}
    sarvam_lang = lang_map.get(
        language, "hi-IN" if (language or "") in devanagari_fallback else "hi-IN"
    )

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

    return {
        "text": data.get("transcript", ""),
        "language": language or "hi",
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
    """Call LLM. Chain: Groq → Gemini → OpenAI → Anthropic → Deepseek → stub."""

    providers_list = [
        ("groq", "GROQ_API_KEY", _groq_llm),
        ("gemini", "GOOGLE_API_KEY", _gemini_llm),
        ("openai", "OPENAI_API_KEY", _openai_llm),
        ("anthropic", "ANTHROPIC_API_KEY", _anthropic_llm),
        ("deepseek", "DEEPSEEK_API_KEY", _deepseek_llm),
    ]

    for name, env_key, func in providers_list:
        if provider not in ("auto", name):
            continue
        api_key = os.environ.get(env_key, "")
        if not api_key:
            continue
        try:
            t = time.time()
            text = await func(system_prompt, user_message, api_key, model)
            return {"text": text, "provider": name, "latency_ms": (time.time() - t) * 1000}
        except Exception as e:
            logger.warning("%s LLM failed: %s", name, e)

    return {"text": "Thank you for calling. Could you please share more details?",
            "provider": "stub", "latency_ms": 0}


# ─── W1.2 Streaming LLM — yields token deltas as SSE events arrive ───

async def call_llm_stream(
    system_prompt: str,
    user_message: str,
    provider: str = "auto",
    model: str = None,
) -> AsyncGenerator[str, None]:
    """Async generator of partial text chunks. Falls back to full-response
    for providers that don't support streaming.

    Streaming paths:
      - groq        -> SSE /chat/completions?stream=true  (OpenAI-compat)
      - openai      -> SSE /chat/completions?stream=true
      - deepseek    -> SSE /chat/completions?stream=true

    Non-streaming paths fall back to call_llm_api() — the whole response is
    yielded as a single chunk so the downstream pipeline still works.
    """
    providers_list = [
        ("groq", "GROQ_API_KEY", "https://api.groq.com/openai/v1/chat/completions",
         model or "llama-3.1-8b-instant"),
        ("openai", "OPENAI_API_KEY", "https://api.openai.com/v1/chat/completions",
         model or "gpt-4o-mini"),
        ("deepseek", "DEEPSEEK_API_KEY", "https://api.deepseek.com/v1/chat/completions",
         model or "deepseek-chat"),
    ]

    for name, env_key, url, chosen_model in providers_list:
        if provider not in ("auto", name):
            continue
        api_key = os.environ.get(env_key, "")
        if not api_key:
            continue
        try:
            async with httpx.AsyncClient(timeout=30) as client, client.stream(
                "POST", url,
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": chosen_model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                    "max_tokens": 200,
                    "temperature": 0.7,
                    "stream": True,
                },
            ) as resp:
                if resp.status_code != 200:
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
                            yield delta
                    except (KeyError, IndexError, json.JSONDecodeError):
                        continue
            return
        except Exception as e:
            logger.warning("%s stream failed, trying next: %s", name, e)

    # Fallback: non-streaming call, yield whole response as one chunk
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
    """Google Gemini 2.5 Flash — fast, free tier."""
    chosen = model or "gemini-2.5-flash"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{chosen}:generateContent?key={api_key}",
            json={"contents": [{"parts": [{"text": f"{system_prompt}\n\nUser: {user_message}"}]}],
                  "generationConfig": {"maxOutputTokens": 200, "temperature": 0.7}},
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


# ═════════════════════════════════════════════════════════════════
# TTS (Text-to-Speech) — 6 providers
# ═════════════════════════════════════════════════════════════════

async def synthesize_speech_api(
    text: str,
    language: str = "en",
    voice_id: str | None = None,
    provider: str = "auto",
    speed: float = 1.0,
) -> dict[str, Any]:
    """Synthesize speech. Chain: ElevenLabs → Sarvam → OpenAI → Deepgram Aura → Google Cloud → Edge TTS."""
    t_start = time.time()

    providers_list = [
        ("elevenlabs", "ELEVENLABS_API_KEY", lambda: _elevenlabs_tts(text, os.environ["ELEVENLABS_API_KEY"], voice_id, speed)),
        ("sarvam", "SARVAM_API_KEY", lambda: _sarvam_tts(text, os.environ["SARVAM_API_KEY"], language, speed)),
        ("openai", "OPENAI_API_KEY", lambda: _openai_tts(text, os.environ["OPENAI_API_KEY"], voice_id, speed)),
        ("deepgram", "DEEPGRAM_API_KEY", lambda: _deepgram_tts(text, os.environ["DEEPGRAM_API_KEY"], voice_id)),
        ("google", "GOOGLE_API_KEY", lambda: _google_tts(text, os.environ["GOOGLE_API_KEY"], language, voice_id)),
    ]

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


async def _elevenlabs_tts(text: str, api_key: str, voice_id: str | None, speed: float) -> dict[str, Any]:
    """ElevenLabs — highest quality, voice cloning, 29+ languages."""
    vid = voice_id or "21m00Tcm4TlvDq8ikWAM"  # Rachel
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{vid}",
            headers={"xi-api-key": api_key, "Content-Type": "application/json"},
            json={"text": text, "model_id": "eleven_flash_v2_5",
                  "voice_settings": {"stability": 0.5, "similarity_boost": 0.75, "speed": speed}},
        )
        resp.raise_for_status()
    return {"audio_base64": base64.b64encode(resp.content).decode(), "format": "mp3",
            "provider": "elevenlabs", "sample_rate": 44100}


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
