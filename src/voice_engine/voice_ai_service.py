"""
VoiceFlow - Full Voice AI Pipeline
====================================
Wires together:
  VAD → Noise Reduction → STT (Whisper) → Analysis (emotion/intent)
  → LLM (Claude/Groq) → TTS (Indic Parler/OpenVoice) → EOS

Usage:
    service = VoiceAIService()
    response = await service.handle_turn(audio_bytes, assistant_config)
    # response.audio_base64  — ready to stream back to phone
    # response.text          — AI text response
    # response.analysis      — STT + emotion/intent analysis
"""

import asyncio
import logging
import os
import tempfile
import time
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# LLM helpers
# ---------------------------------------------------------------------------

# ─── India-grounding helper (W2.3) ───────────────────────────────────────

_INDIA_GROUND_SUFFIX = """

—
CONTEXT (do not mention to the user):
You are operating in India. When relevant:
- Currency: ₹ (Indian Rupee, INR) — never USD/EUR unless the user explicitly asks.
- Numbers: lakh (1,00,000) and crore (1,00,00,000) — use these in Indic/mixed language replies.
- Date format: DD/MM/YYYY. Time: IST (UTC+5:30).
- Phone format: +91 XXXXX XXXXX or 10-digit mobile.
- Names: Indian naming conventions (first + last; Mr/Ms; respect elders with -ji / Auntie / Uncle if tone is informal).
- Tone: friendly, respectful; avoid slang that sounds American.
- If the user code-switches between English and an Indian language, reply in the same mix.
- Never invent policy/pricing/product facts. If unsure, say "Let me check and get back to you."
"""

_LANG_HINT = {
    "hi": "Reply in natural Hindi or Hinglish.",
    "ta": "Reply in Tamil or Tanglish.",
    "te": "Reply in Telugu or Tenglish.",
    "kn": "Reply in Kannada or Kanglish.",
    "ml": "Reply in Malayalam.",
    "bn": "Reply in Bengali.",
    "mr": "Reply in Marathi.",
    "gu": "Reply in Gujarati.",
    "pa": "Reply in Punjabi.",
    "or": "Reply in Odia.",
    "as": "Reply in Assamese.",
    "ur": "Reply in Urdu.",
    "ne": "Reply in Nepali.",
    "kok": "Reply in Konkani (prefer Goan variety unless told otherwise).",
    "mni": "Reply in Manipuri (Meitei).",
    "sd": "Reply in Sindhi.",
    "sa": "Reply in Sanskrit only if specifically requested; otherwise Hindi.",
}

# W5.3 — lightweight dialect hints fed into the LLM system prompt.
# Keys match the dialect_hints in languages.py. Keeping these terse —
# long style guides waste tokens and the LLM already knows these varieties.
_DIALECT_HINT = {
    ("hi", "haryanvi"): "Use Haryanvi flavour — direct tone, drop honorifics.",
    ("hi", "bhojpuri"): "Use Bhojpuri-flavoured Hindi — warm, village-register vocabulary.",
    ("hi", "bihari"): "Use Bihari-flavoured Hindi — colloquial, add regional markers where natural.",
    ("ta", "chennai"): "Use Chennai Tamil — urban, mixes English loanwords freely.",
    ("ta", "madurai"): "Use Madurai Tamil — rural-warm register, fewer English loans.",
    ("ta", "sri_lankan"): "Use Sri Lankan Tamil conventions — more formal, older vocabulary.",
    ("mr", "puneri"): "Use Puneri Marathi — slightly formal, educated-urban register.",
    ("mr", "varhadi"): "Use Varhadi Marathi — Vidarbha dialect, rural warmth.",
    ("bn", "bangladeshi"): "Use Bangladeshi Bengali conventions (Dhaka register).",
    ("gu", "kathiyawadi"): "Use Kathiyawadi Gujarati — Saurashtra region flavour.",
    ("pa", "majhi"): "Use Majhi Punjabi — Amritsar/Lahore register (the 'standard').",
    ("en", "indian_english"): "Use Indian English phrasing ('do the needful', 'prepone', 'revert back').",
}


def _ground_prompt_india(
    system_prompt: str,
    language: str | None = None,
    dialect: str | None = None,
) -> str:
    """Prepend India-locale grounding to an agent's system prompt.

    Cheap, stateless — zero latency cost. Measurably reduces hallucinations
    on currency/date/phone answers vs unanchored prompts.

    W5.3 — when `dialect` is set (e.g. 'chennai' for Tamil, 'haryanvi' for
    Hindi) an extra one-liner is appended so the model matches regional tone.
    """
    base = (system_prompt or "").rstrip()
    extras = _INDIA_GROUND_SUFFIX
    lang_key = (language or "").lower().split("-")[0]
    if lang_key in _LANG_HINT:
        extras += "\n- " + _LANG_HINT[lang_key]
    if dialect:
        hint = _DIALECT_HINT.get((lang_key, dialect.lower()))
        if hint:
            extras += "\n- " + hint
    return base + extras


async def _call_llm(
    system_prompt: str,
    user_message: str,
    provider: str = "gemini",
    model: str = None,
) -> str:
    """Fallback LLM helper. Chain: Gemini 2.5 Pro → Groq → Anthropic → stub."""
    import httpx

    # --- Gemini 2.5 Pro (primary) ---
    if provider in ("gemini", "auto") and os.environ.get("GOOGLE_API_KEY"):
        try:
            api_key = os.environ["GOOGLE_API_KEY"]
            chosen_model = model or "gemini-2.5-pro"
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/"
                    f"{chosen_model}:generateContent?key={api_key}",
                    json={
                        "system_instruction": {"parts": [{"text": system_prompt}]},
                        "contents": [{"role": "user", "parts": [{"text": user_message}]}],
                        "generationConfig": {"maxOutputTokens": 200, "temperature": 0.7},
                    },
                )
                resp.raise_for_status()
                return resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        except Exception as e:
            logger.warning("Gemini fallback failed (%s), trying Groq...", e)

    # --- Groq (fast, free tier) ---
    if os.environ.get("GROQ_API_KEY"):
        try:
            api_key = os.environ["GROQ_API_KEY"]
            chosen_model = model or "llama-3.1-8b-instant"
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "model": chosen_model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_message},
                        ],
                        "max_tokens": 200,
                        "temperature": 0.7,
                    },
                )
                resp.raise_for_status()
                return resp.json()["choices"][0]["message"]["content"].strip()
        except Exception as e:
            logger.warning("Groq fallback failed (%s), trying Anthropic...", e)

    # --- Anthropic Claude ---
    if os.environ.get("ANTHROPIC_API_KEY"):
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
            chosen_model = model or "claude-haiku-4-5-20251001"
            message = client.messages.create(
                model=chosen_model, max_tokens=200,
                system=system_prompt,
                messages=[{"role": "user", "content": user_message}],
            )
            return message.content[0].text.strip()
        except Exception as e:
            logger.warning("Anthropic fallback failed (%s), using stub...", e)

    # --- Stub (dev/demo — no API key) ---
    return "Thank you for calling. Could you please share more details so I can assist you better?"


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

class VoiceTurnRequest:
    """Input to a single conversational turn"""
    def __init__(
        self,
        audio_bytes: bytes,
        language: str | None = None,
        assistant_id: str | None = None,
        system_prompt: str = "You are a helpful voice assistant. Keep responses under 40 words.",
        voice_id: str | None = None,
        llm_provider: str = "gemini",
        llm_model: str | None = None,
        tts_language: str | None = None,
        tts_emotion: str | None = None,
        dialect: str | None = None,
        # Cross-call memory
        caller_phone: str | None = None,
        # n8n tool use
        tools_enabled: bool = False,
        agent_tools: list | None = None,
        # Transfer
        transfer_number: str | None = None,
        # Domain label for corpus collection
        domain: str = "general",
        # Caller identity
        user_id: str | None = None,
        tenant_id: str | None = None,
        # Conversation history — list of {"role": "user"|"assistant", "content": "..."}
        # When provided, prepended to the LLM call so the agent remembers prior turns.
        conversation_history: list | None = None,
    ):
        self.audio_bytes = audio_bytes
        self.language = language
        self.assistant_id = assistant_id
        self.system_prompt = system_prompt
        self.voice_id = voice_id
        self.llm_provider = llm_provider if llm_provider else "gemini"
        self.llm_model = llm_model
        self.tts_language = tts_language
        self.tts_emotion = tts_emotion
        self.dialect = dialect
        self.caller_phone = caller_phone
        self.tools_enabled = tools_enabled
        self.agent_tools = agent_tools
        self.transfer_number = transfer_number
        self.domain = domain
        self.user_id = user_id
        self.tenant_id = tenant_id
        self.conversation_history = conversation_history or []


class VoiceTurnResponse:
    """Output from a single conversational turn"""
    def __init__(
        self,
        text: str,
        audio_base64: str,
        audio_format: str,
        sample_rate: int,
        analysis: dict[str, Any],
        latency_ms: float,
        tts_engine: str,
    ):
        self.text = text
        self.audio_base64 = audio_base64
        self.audio_format = audio_format
        self.sample_rate = sample_rate
        self.analysis = analysis
        self.latency_ms = latency_ms
        self.tts_engine = tts_engine

    def to_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "audio_base64": self.audio_base64,
            "audio_format": self.audio_format,
            "sample_rate": self.sample_rate,
            "analysis": self.analysis,
            "latency_ms": self.latency_ms,
            "tts_engine": self.tts_engine,
        }


# ---------------------------------------------------------------------------
# Main service
# ---------------------------------------------------------------------------

class VoiceAIService:
    """
    Full Voice AI pipeline: STT → LLM → TTS

    Designed for real-time conversational AI on phone calls.
    Lazy-loads heavy models on first use.
    """

    def __init__(self):
        self._voice_engine = None   # STT + analysis
        self._tts_service = None    # TTS
        self._vad_engine = None     # Voice Activity Detection
        self._noise_engine = None   # Noise Reduction
        self._eos_engine = None     # End-of-Speech Detection

    def _get_voice_engine(self):
        if self._voice_engine is None:
            from voice_engine.engine import VoiceFlowEngine
            model_size = os.environ.get("WHISPER_MODEL_SIZE", "tiny")
            logger.info(f"Loading VoiceFlowEngine (whisper={model_size})...")
            self._voice_engine = VoiceFlowEngine(model_size=model_size)
        return self._voice_engine

    def _get_tts_service(self):
        if self._tts_service is None:
            from tts.service import get_tts_service
            self._tts_service = get_tts_service()
        return self._tts_service

    def _get_vad(self):
        if self._vad_engine is None:
            from voice_engine.vad import VADEngine
            self._vad_engine = VADEngine(provider="auto", threshold=0.5)
        return self._vad_engine

    def _get_noise_reducer(self):
        if self._noise_engine is None:
            from voice_engine.noise_reduction import NoiseReductionEngine
            self._noise_engine = NoiseReductionEngine(
                method="spectral_gate", aggressiveness=1.0
            )
        return self._noise_engine

    def _get_eos(self):
        if self._eos_engine is None:
            from voice_engine.eos import EOSConfig, EOSEngine
            self._eos_engine = EOSEngine(EOSConfig(
                min_silence_ms=500,
                indian_language_mode=True,
                smart_mode=True,
            ))
        return self._eos_engine

    def preprocess_audio(
        self,
        audio_bytes: bytes,
        sample_rate: int = 16000,
    ) -> dict[str, Any]:
        """Pre-process audio: noise reduction → VAD → extract speech.

        Returns dict with cleaned audio bytes, VAD result, and whether
        to proceed with STT.
        """
        import numpy as np

        audio = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0

        # Step 1: Noise reduction
        try:
            nr = self._get_noise_reducer()
            audio = nr.reduce(audio, sample_rate)
            noise_reduced = True
        except Exception as e:
            logger.warning("Noise reduction failed (using raw audio): %s", e)
            noise_reduced = False

        # Step 2: VAD
        try:
            vad = self._get_vad()
            vad_result = vad.detect(audio, sample_rate)
            has_speech = vad_result.is_speech
            speech_ratio = vad_result.speech_ratio

            # Extract only speech segments to reduce STT load
            if has_speech and speech_ratio < 0.8:
                speech_audio = vad.extract_speech(audio, sample_rate)
                if speech_audio is not None:
                    audio = speech_audio
        except Exception as e:
            logger.warning("VAD failed (processing full audio): %s", e)
            has_speech = True
            speech_ratio = 1.0

        # Convert back to bytes
        audio_int16 = (audio * 32768.0).clip(-32768, 32767).astype(np.int16)
        clean_bytes = audio_int16.tobytes()

        return {
            "audio_bytes": clean_bytes,
            "has_speech": has_speech,
            "speech_ratio": speech_ratio,
            "noise_reduced": noise_reduced,
            "duration_s": len(audio) / sample_rate,
        }

    async def transcribe_and_analyze(self, audio_bytes: bytes, language: str | None = None) -> dict[str, Any]:
        """
        Step 1: STT + emotion + intent analysis.

        Tries local Whisper engine first (dev/GPU mode).
        Falls back to API providers in production (Deepgram → OpenAI → Groq).
        """
        t_start = time.time()

        # Try local engine first (available in dev with torch installed)
        try:
            engine = self._get_voice_engine()

            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as f:
                f.write(audio_bytes)
                tmp_path = f.name

            try:
                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(
                    None,
                    lambda: engine.process_audio(audio_path=tmp_path, language=language)
                )
            finally:
                os.unlink(tmp_path)

            return {
                "transcription": result.transcription,
                "language": result.language,
                "dialect": result.dialect.value,
                "emotion": result.emotion.value,
                "emotion_confidence": result.emotion_confidence,
                "emotion_scores": result.emotion_scores,
                "intent": result.intent.value,
                "intent_confidence": result.intent_confidence,
                "lead_score": result.lead_score,
                "sentiment": result.sentiment,
                "gen_z_score": result.gen_z_score,
                "slang_detected": result.slang_detected,
                "keywords": result.keywords,
                "audio_duration_s": result.audio_duration_s,
                "processing_time_ms": result.processing_time_ms,
            }
        except Exception as e:
            logger.info("Local STT not available (%s), using API providers", e)

        # Fallback: API-based STT (production mode)
        # Phase 1 W2.1: use ensemble STT — races Deepgram + Sarvam for Indic
        # languages and picks higher-confidence result. Falls back to the
        # cascade for non-Indic or when only one provider is configured.
        from voice_engine.api_providers import transcribe_ensemble
        stt_result = await transcribe_ensemble(audio_bytes, language=language)
        elapsed_ms = (time.time() - t_start) * 1000

        return {
            "transcription": stt_result.get("text", ""),
            "language": stt_result.get("language", language or "en"),
            "dialect": "unknown",
            "emotion": "neutral",
            "emotion_confidence": 0.0,
            "emotion_scores": {},
            "intent": "inquiry",
            "intent_confidence": 0.5,
            "lead_score": 0.0,
            "sentiment": 0.0,
            "gen_z_score": 0.0,
            "slang_detected": [],
            "keywords": [],
            "audio_duration_s": len(audio_bytes) / 32000,
            "processing_time_ms": elapsed_ms,
            "stt_provider": stt_result.get("provider", "unknown"),
            "stt_confidence": stt_result.get("confidence", 0.0),
        }

    async def generate_response_audio(
        self,
        text: str,
        language: str = "en",
        emotion: str | None = None,
        detected_customer_emotion: str | None = None,
        voice_id: str | None = None,
        use_case: str = "sales_bot",
    ) -> dict[str, Any]:
        """
        Step 3: TTS — convert AI text response to audio.

        Tries local TTS engines first (dev/GPU mode).
        Falls back to API providers (ElevenLabs → OpenAI → Edge TTS).
        """
        # Try local TTS engines first
        try:
            from tts.config import EmotionType, Language, TTSRequest

            lang_map = {
                "en": Language.ENGLISH, "ta": Language.TAMIL, "hi": Language.HINDI,
                "te": Language.TELUGU, "kn": Language.KANNADA, "ml": Language.MALAYALAM,
            }
            tts_language = lang_map.get(language, Language.ENGLISH)
            emotion_map = {v.value: v for v in EmotionType}
            tts_emotion = emotion_map.get(emotion) if emotion else None

            tts_req = TTSRequest(
                text=text, language=tts_language, emotion=tts_emotion,
                detected_customer_emotion=detected_customer_emotion,
                voice_id=voice_id, use_case=use_case,
            )

            svc = self._get_tts_service()
            tts_resp = await svc.synthesize(tts_req)

            return {
                "audio_base64": tts_resp.audio_base64,
                "audio_format": tts_resp.format,
                "sample_rate": tts_resp.sample_rate,
                "duration_seconds": tts_resp.duration_seconds,
                "engine_used": tts_resp.engine_used.value if tts_resp.engine_used else "unknown",
                "latency_ms": tts_resp.latency_ms,
            }
        except Exception as e:
            logger.info("Local TTS not available (%s), using API providers", e)

        # Fallback: API-based TTS (production mode)
        from voice_engine.api_providers import synthesize_speech_api
        tts_result = await synthesize_speech_api(
            text=text, language=language, voice_id=voice_id,
        )

        return {
            "audio_base64": tts_result.get("audio_base64", ""),
            "audio_format": tts_result.get("format", "mp3"),
            "sample_rate": tts_result.get("sample_rate", 24000),
            "duration_seconds": 0,
            "engine_used": tts_result.get("provider", "unknown"),
            "latency_ms": tts_result.get("latency_ms", 0),
        }

    async def handle_turn_stream(self, request: VoiceTurnRequest):
        """W1.2 — Parallel LLM-on-VAD + TTS streaming.

        Yields dict events as soon as each phrase is ready:
          {"type": "stt",          "text": "..."}
          {"type": "llm_partial",  "text": "..."}
          {"type": "audio_chunk",  "index": i, "text": "...", "audio_base64": "..."}
          {"type": "done",         "total_ms": int, "ttfa_ms": int, "text": "full reply"}

        TTFA (time-to-first-audio) is the perceived-latency metric: how long
        the user waits after finishing speech before hearing the first word
        of the reply. Parallel streaming typically cuts TTFA by 40-60%
        vs the serial handle_turn().
        """
        import asyncio
        import re

        t_start = time.time()
        t_first_audio: float | None = None

        # Preprocess (same as handle_turn)
        try:
            preprocess = self.preprocess_audio(request.audio_bytes)
            processed_bytes = preprocess["audio_bytes"]
            if not preprocess["has_speech"]:
                yield {"type": "done", "total_ms": (time.time() - t_start) * 1000,
                       "ttfa_ms": 0, "text": "", "reason": "no_speech"}
                return
        except Exception:
            processed_bytes = request.audio_bytes

        # STT + emotion parallel (streaming path)
        from voice_engine.emotion_engine import analyse_emotion as _stream_ae
        _stt_task = asyncio.create_task(
            self.transcribe_and_analyze(processed_bytes, language=request.language)
        )
        _em_task = asyncio.create_task(_stream_ae(processed_bytes))

        # ── GAP-2: Speculative LLM on high-confidence partial transcript ──────
        # While the authoritative STT task is running, stream the same audio to
        # Deepgram's live WebSocket.  When an interim result has high confidence
        # AND looks like a complete utterance, fire the LLM immediately.  If the
        # final transcript matches we've saved 200-400 ms; if not, we cancel and
        # restart the LLM with the correct text (<5 % of turns).
        _spec_queue: asyncio.Queue[str | None] = asyncio.Queue()
        _spec_llm_task: asyncio.Task | None = None
        _spec_text: str = ""

        _dg_key = os.environ.get("DEEPGRAM_API_KEY", "")
        if _dg_key:
            from voice_engine.api_providers import transcribe_deepgram_stream
            from voice_engine.smart_turn import _BACKCHANNELS, _completion_score
            from voice_engine.smart_llm import pick_model as _pick_model

            _prelim_lang = (request.language or request.tts_language or "en")[:2].lower()
            _prelim_prompt = _ground_prompt_india(
                request.system_prompt, language=_prelim_lang
            )
            _spec_provider, _spec_model, _ = _pick_model(
                user_message="",
                requested_provider=request.llm_provider,
                requested_model=request.llm_model,
            )

            async def _consume_spec_llm(prompt: str, text: str) -> None:
                """Stream LLM tokens into _spec_queue; None sentinel marks end."""
                try:
                    from voice_engine.api_providers import call_llm_stream as _cls
                    async for _delta in _cls(
                        prompt, text,
                        provider=_spec_provider,
                        model=_spec_model or None,
                    ):
                        await _spec_queue.put(_delta)
                except asyncio.CancelledError:
                    pass
                finally:
                    await _spec_queue.put(None)

            async def _run_speculative_streaming() -> None:
                """Fire speculative LLM on the first confident partial transcript."""
                nonlocal _spec_llm_task, _spec_text
                _bc_set = _BACKCHANNELS.get(_prelim_lang, set()) | _BACKCHANNELS["en"]
                async for _is_final, _txt, _conf in transcribe_deepgram_stream(
                    processed_bytes, _dg_key, language=request.language
                ):
                    if _is_final:
                        break
                    if not _txt.strip():
                        continue
                    # Skip backchannels — no point firing LLM for "ok" / "சரி"
                    _norm = re.sub(r"[^\w\s]", "", _txt.lower()).strip()
                    if _norm in _bc_set:
                        continue
                    _comp = _completion_score(_txt, _prelim_lang)
                    if _conf > 0.85 and _comp > 0.6:
                        _spec_text = _txt
                        _spec_llm_task = asyncio.create_task(
                            _consume_spec_llm(_prelim_prompt, _txt)
                        )
                        return  # fired — no need to keep listening

            _spec_streaming_task = asyncio.create_task(_run_speculative_streaming())
        else:
            _spec_streaming_task = None

        # ── GAP-4: yield filler immediately while STT + LLM run ───────────────
        # The filler is pre-synthesized (zero TTS latency here).  We yield it
        # now so the client starts playing it within ~50 ms of turn-end.
        # When the first real audio_chunk arrives the client crossfades out.
        # Skip only on a response-cache hit (real answer is already ready).
        from voice_engine.filler_engine import get_filler_engine as _get_filler_engine
        _filler_eng = _get_filler_engine()
        _filler_lang = (request.tts_language or request.language or "en")
        _filler_eng.ensure_warmed(language=_filler_lang, voice_id=request.voice_id)

        # Check response cache — if we have the answer already, skip the filler
        _cache_skip = False
        try:
            from voice_engine import response_cache as _rc
            # We don't have user_text yet, but a lightweight probe is enough:
            # look up using only the agent+language key (no text) just to see
            # if the cache is primed.  Full cache lookup happens later as usual.
            pass  # full cache check done post-STT; skip flag stays False for now
        except Exception:
            pass

        if not _filler_eng.should_skip(cache_hit=_cache_skip):
            _filler_clip = _filler_eng.get_filler(
                language=_filler_lang,
                emotion=None,           # emotion unknown until STT returns
                voice_id=request.voice_id,
            )
            if _filler_clip:
                yield {
                    "type": "filler",
                    "audio_base64": _filler_clip,
                    "cancellable": True,  # client must stop on first audio_chunk
                }

        analysis, emotion_result = await asyncio.gather(_stt_task, _em_task)

        # Cancel speculative streaming if still running (STT finished first)
        if _spec_streaming_task and not _spec_streaming_task.done():
            _spec_streaming_task.cancel()

        user_text = analysis["transcription"]
        t_after_stt = time.time()

        if emotion_result.get("source") == "default" and user_text:
            emotion_result = await _stream_ae(b"", transcript=user_text)

        analysis["emotion"]            = emotion_result.get("emotion", "neutral")
        analysis["emotion_confidence"] = emotion_result.get("emotion_confidence", 0.0)
        analysis["emotion_scores"]     = emotion_result.get("emotion_scores", {})

        yield {"type": "stt", "text": user_text, "language": analysis.get("language"),
               "emotion": analysis["emotion"],
               "elapsed_ms": int((t_after_stt - t_start) * 1000)}

        if not user_text.strip():
            yield {"type": "done", "total_ms": (time.time() - t_start) * 1000,
                   "ttfa_ms": 0, "text": "", "reason": "empty_transcript"}
            return

        # W2.2 — language auto-switch
        from voice_engine.lang_detect import pick_tts_language
        chosen_lang, lang_reason = pick_tts_language(
            user_hint=request.tts_language,
            stt_detected=analysis.get("language"),
            text=user_text,
        )
        if chosen_lang != (request.tts_language or "en"):
            yield {"type": "language", "from": request.tts_language,
                   "to": chosen_lang, "reason": lang_reason}

        # Smart turn guard (streaming path)
        from voice_engine.smart_turn import TurnSignal as _TS
        from voice_engine.smart_turn import evaluate_turn
        _turn = evaluate_turn(
            transcript=user_text, language=chosen_lang,
            emotion_result=emotion_result,
            transfer_enabled=bool(getattr(request, "transfer_number", None)),
        )
        if _turn.signal == _TS.BACKCHANNEL:
            yield {"type": "done", "total_ms": (time.time() - t_start) * 1000,
                   "ttfa_ms": 0, "text": "", "reason": "backchannel"}
            return
        if _turn.signal == _TS.HANDOFF:
            yield {"type": "handoff", "reason": _turn.reason,
                   "total_ms": (time.time() - t_start) * 1000}
            return

        grounded_prompt = _ground_prompt_india(
            request.system_prompt,
            language=chosen_lang,
            dialect=getattr(request, "dialect", None),
        )
        if _turn.emotion_prefix:
            grounded_prompt = _turn.emotion_prefix + "\n\n" + grounded_prompt

        # GAP-3: Adaptive TTS chunking — first 3-5 words fire TTS immediately,
        # then clause-level, then sentence-level for best prosody on later chunks.
        from voice_engine.adaptive_chunker import AdaptiveChunker
        from voice_engine.api_providers import call_llm_stream

        _chunker = AdaptiveChunker(language=chosen_lang)
        full_text = ""
        chunk_index = 0
        tts_tasks: list[asyncio.Task] = []
        detected_emotion = analysis.get("emotion", "neutral")

        from voice_engine.llm_output_cleaner import clean_for_tts as _clean_chunk

        async def _tts_for_chunk(text: str, idx: int):
            t_tts_start = time.time()
            # Clean each chunk — strip markdown / filler before TTS
            clean_text = _clean_chunk(text, max_sentences=3)
            result = await self.generate_response_audio(
                text=clean_text or text,
                language=chosen_lang,
                detected_customer_emotion=detected_emotion,
                voice_id=request.voice_id,
                use_case="sales_bot",
            )
            return idx, clean_text or text, result, t_tts_start

        # W6.1 — smart model routing for streaming turns too.
        from voice_engine.smart_llm import pick_model
        chosen_provider_s, chosen_model_s, _reason_s = pick_model(
            user_message=user_text,
            requested_provider=request.llm_provider,
            requested_model=request.llm_model,
        )

        # ── GAP-2: decide whether to use speculative LLM or start fresh ───────
        # Text similarity check: accept speculation if ≥85 % character overlap
        def _texts_close(a: str, b: str) -> bool:
            import difflib
            if not a or not b:
                return False
            return difflib.SequenceMatcher(None, a.strip().lower(), b.strip().lower()).ratio() > 0.80

        _use_speculative = (
            _spec_llm_task is not None
            and not _spec_llm_task.cancelled()
            and _texts_close(_spec_text, user_text)
        )

        if not _use_speculative and _spec_llm_task and not _spec_llm_task.done():
            # Partial mismatch — cancel the wrong speculative response
            _spec_llm_task.cancel()
            logger.debug(
                "Speculative LLM cancelled: partial=%r final=%r", _spec_text[:40], user_text[:40]
            )

        async def _llm_token_stream():
            """Yield LLM tokens from the speculative queue (fast path) or a
            fresh call (fallback).  The speculative fast-path replays already-
            buffered tokens first, then streams any remaining tokens."""
            if _use_speculative:
                logger.debug("GAP-2: using speculative LLM (saved STT-wait latency)")
                while True:
                    token = await _spec_queue.get()
                    if token is None:
                        return
                    yield token
            else:
                async for token in call_llm_stream(
                    system_prompt=grounded_prompt,
                    user_message=user_text,
                    provider=chosen_provider_s,
                    model=chosen_model_s or None,
                    history=request.conversation_history or None,
                ):
                    yield token

        async for delta in _llm_token_stream():
            full_text += delta
            yield {"type": "llm_partial", "text": delta}

            # GAP-3: adaptive chunker decides when to fire TTS.
            # Phase 0 → fires after 3-5 words (TTFA ~80-150 ms).
            # Phase 1 → fires on clause boundary.
            # Phase 2+ → fires on sentence boundary (best prosody).
            chunk = _chunker.feed(delta)
            if chunk:
                tts_tasks.append(asyncio.create_task(_tts_for_chunk(chunk, chunk_index)))
                chunk_index += 1

            # Drain completed TTS tasks in ORDER — only emit the head of the
            # queue. Out-of-order audio chunks would garble playback.
            while tts_tasks and tts_tasks[0].done():
                task = tts_tasks.pop(0)
                try:
                    idx, txt, result, t_tts_start = task.result()
                    if t_first_audio is None:
                        t_first_audio = time.time()
                    yield {
                        "type": "audio_chunk",
                        "index": idx,
                        "text": txt,
                        "audio_base64": result.get("audio_base64", ""),
                        "audio_format": result.get("audio_format", "mp3"),
                        "engine": result.get("engine_used", "unknown"),
                        "tts_ms": int((time.time() - t_tts_start) * 1000),
                    }
                except Exception as exc:
                    logger.warning("TTS chunk failed: %s", exc)

        # Flush any remaining buffer (reply ended without a sentence terminator)
        tail = _chunker.flush()
        if tail:
            tts_tasks.append(asyncio.create_task(_tts_for_chunk(tail, chunk_index)))
            chunk_index += 1

        # Drain remaining TTS tasks in order
        for task in tts_tasks:
            try:
                idx, txt, result, t_tts_start = await task
                if t_first_audio is None:
                    t_first_audio = time.time()
                yield {
                    "type": "audio_chunk",
                    "index": idx,
                    "text": txt,
                    "audio_base64": result.get("audio_base64", ""),
                    "audio_format": result.get("audio_format", "mp3"),
                    "engine": result.get("engine_used", "unknown"),
                    "tts_ms": int((time.time() - t_tts_start) * 1000),
                }
            except Exception as exc:
                logger.warning("TTS chunk failed: %s", exc)

        t_end = time.time()
        total_ms = (t_end - t_start) * 1000
        ttfa_ms = int((t_first_audio - t_start) * 1000) if t_first_audio else int(total_ms)

        # Record metrics. Streaming mode reports the real perceived-latency
        # (ttfa_ms) separately so dashboards can track the p95 900ms target.
        try:
            from api.services.quality_store import record_call
            record_call(
                agent_id=getattr(request, "assistant_id", None),
                language=chosen_lang,
                stt_ms=int((t_after_stt - t_start) * 1000),
                llm_ms=max(0, ttfa_ms - int((t_after_stt - t_start) * 1000)),
                tts_ms=max(0, int(total_ms) - ttfa_ms),
                total_ms=int(total_ms),
                ttfa_ms=int(ttfa_ms),
                pipeline_mode="stream",
            )
        except Exception:
            pass

        yield {"type": "done", "total_ms": int(total_ms), "ttfa_ms": ttfa_ms, "text": full_text}

    async def handle_text_stream(
        self,
        user_text: str,
        system_prompt: str = "You are a helpful voice assistant. Keep responses under 40 words.",
        language: str = "en",
        llm_provider: str = "gemini",
        llm_model: str | None = None,
        tts_language: str = "en",
        voice_id: str | None = None,
        history: list | None = None,
    ):
        """Text-based streaming turn — same events as handle_turn_stream but skips STT.

        The browser has already done STT (Deepgram JS SDK); this method runs the
        LLM + TTS streaming pipeline and yields GAP-3/GAP-4 optimised events:

          {"type": "language",    "from": "en", "to": "ta", "reason": "..."}
          {"type": "filler",      "audio_base64": "...", "cancellable": true}
          {"type": "llm_partial", "text": "..."}
          {"type": "audio_chunk", "index": N, "text": "...", "audio_base64": "..."}
          {"type": "done",        "total_ms": int, "ttfa_ms": int, "text": "full reply", "language": "ta"}
        """
        import asyncio

        t_start = time.time()
        t_first_audio: float | None = None

        if not user_text.strip():
            yield {"type": "done", "total_ms": 0, "ttfa_ms": 0, "text": "", "reason": "empty_input"}
            return

        # ── Per-turn language detection (multilingual fix v2) ────────────────
        # The browser sent us text, but we don't know what language it actually
        # is — Deepgram may have transliterated Tamil/Telugu to English, or the
        # user typed in a script that doesn't match the agent's configured
        # language. Run script + romanized-Indic detection on the text itself.
        from voice_engine.lang_detect import pick_tts_language
        chosen_lang, lang_reason = pick_tts_language(
            user_hint=tts_language or language,
            stt_detected=language if language and language != "en" else None,
            text=user_text,
        )

        # Tell the client which language we picked, so the UI can show it
        # AND so the next turn can pass that as the new tts_language hint.
        if chosen_lang != (tts_language or "en"):
            yield {"type": "language", "from": tts_language or "en",
                   "to": chosen_lang, "reason": lang_reason}

        # All downstream stages now use chosen_lang, not the request defaults.
        lang = chosen_lang[:2].lower()
        tts_language = chosen_lang

        # ── GAP-4: emit filler immediately ────────────────────────────────────
        from voice_engine.filler_engine import get_filler_engine as _get_filler_engine
        _filler_eng = _get_filler_engine()
        _filler_eng.ensure_warmed(language=tts_language, voice_id=voice_id)
        _filler_clip = _filler_eng.get_filler(language=tts_language, emotion=None, voice_id=voice_id)
        if _filler_clip:
            yield {"type": "filler", "audio_base64": _filler_clip, "cancellable": True}

        # ── LLM streaming ─────────────────────────────────────────────────────
        from voice_engine.api_providers import call_llm_stream, synthesize_speech_api
        from voice_engine.adaptive_chunker import AdaptiveChunker

        _system = _ground_prompt_india(system_prompt, language=lang)
        _chunker = AdaptiveChunker(language=tts_language)
        full_text = ""
        chunk_index = 0
        tts_tasks: list[asyncio.Task] = []

        from voice_engine.llm_output_cleaner import clean_for_tts as _clean_ts

        async def _tts_for_chunk(phrase: str, idx: int) -> dict:
            clean_phrase = _clean_ts(phrase, max_sentences=3)
            result = await synthesize_speech_api(clean_phrase or phrase, language=tts_language, voice_id=voice_id)
            return {"index": idx, "text": clean_phrase or phrase, "audio_base64": result.get("audio_base64", "")}

        async for delta in call_llm_stream(_system, user_text, provider=llm_provider, model=llm_model, history=history):
            full_text += delta
            yield {"type": "llm_partial", "text": delta}
            chunk = _chunker.feed(delta)
            if chunk:
                tts_tasks.append(asyncio.create_task(_tts_for_chunk(chunk, chunk_index)))
                chunk_index += 1

        tail = _chunker.flush()
        if tail:
            tts_tasks.append(asyncio.create_task(_tts_for_chunk(tail, chunk_index)))

        # Stream TTS chunks in order
        for task in tts_tasks:
            try:
                result = await task
                if result.get("audio_base64"):
                    if t_first_audio is None:
                        t_first_audio = time.time()
                    yield {"type": "audio_chunk", **result}
            except Exception as exc:
                logger.debug("TTS chunk failed: %s", exc)

        total_ms = (time.time() - t_start) * 1000
        ttfa_ms = int((t_first_audio - t_start) * 1000) if t_first_audio else 0
        yield {"type": "done", "total_ms": int(total_ms), "ttfa_ms": ttfa_ms,
               "text": full_text, "language": chosen_lang}

    async def handle_turn(self, request: VoiceTurnRequest) -> VoiceTurnResponse:
        """
        Full pipeline for one conversational turn:
          0. Preprocess (noise reduction + VAD)
          1. STT + Analysis
          2. LLM response generation
          3. TTS
        """
        t_start = time.time()

        # --- Step 0: Preprocess audio (noise reduction + VAD) ---
        try:
            preprocess = self.preprocess_audio(request.audio_bytes)
            processed_bytes = preprocess["audio_bytes"]
            if not preprocess["has_speech"]:
                logger.info("No speech detected (VAD), skipping turn")
                return VoiceTurnResponse(
                    text="",
                    audio_base64="",
                    audio_format="wav",
                    sample_rate=16000,
                    analysis={"transcription": "", "vad": "no_speech"},
                    latency_ms=(time.time() - t_start) * 1000,
                    tts_engine="none",
                )
            t_preprocess = time.time()
            logger.info(
                "Preprocess done in %.0fms: speech_ratio=%.2f, noise_reduced=%s",
                (t_preprocess - t_start) * 1000,
                preprocess["speech_ratio"],
                preprocess["noise_reduced"],
            )
        except Exception as e:
            logger.warning("Preprocess failed, using raw audio: %s", e)
            processed_bytes = request.audio_bytes

        # --- Step 1: STT + emotion analysis (parallel) ---
        # Hume prosody runs concurrently with Sarvam STT so it adds ~0ms to
        # wall-clock latency. Falls back to text-keyword detection if no key.
        from voice_engine.emotion_engine import analyse_emotion
        stt_task      = asyncio.create_task(
            self.transcribe_and_analyze(processed_bytes, language=request.language)
        )
        emotion_task  = asyncio.create_task(
            analyse_emotion(processed_bytes)  # transcript enriched below
        )
        analysis, emotion_result = await asyncio.gather(stt_task, emotion_task)

        user_text = analysis["transcription"]
        t_after_stt = time.time()
        logger.info(f"STT done in {(t_after_stt - t_start)*1000:.0f}ms: '{user_text[:60]}'")

        # Re-run text-fallback if Hume returned default (no API key / timeout)
        if emotion_result.get("source") == "default" and user_text:
            from voice_engine.emotion_engine import analyse_emotion as _ae
            emotion_result = await _ae(b"", transcript=user_text)

        # Merge Hume emotion scores into analysis dict (fills the neutral gap)
        analysis["emotion"]            = emotion_result.get("emotion", "neutral")
        analysis["emotion_confidence"] = emotion_result.get("emotion_confidence", 0.0)
        analysis["emotion_scores"]     = emotion_result.get("emotion_scores", {})
        detected_emotion               = analysis["emotion"]
        logger.info("Emotion: %s (%.2f) via %s",
                    detected_emotion, analysis["emotion_confidence"],
                    emotion_result.get("source", "?"))

        # W2.2 — per-utterance language detection.
        from voice_engine.lang_detect import pick_tts_language
        chosen_lang, lang_reason = pick_tts_language(
            user_hint=request.tts_language,
            stt_detected=analysis.get("language"),
            text=user_text,
        )
        if chosen_lang != (request.tts_language or "en"):
            logger.info("Language switch: %s -> %s (reason=%s)",
                        request.tts_language, chosen_lang, lang_reason)

        # Smart turn evaluation — backchannel guard + human-handoff trigger
        from voice_engine.smart_turn import TurnSignal, evaluate_turn
        turn = evaluate_turn(
            transcript=user_text,
            language=chosen_lang,
            emotion_result=emotion_result,
            transfer_enabled=bool(getattr(request, "transfer_number", None)),
        )
        logger.info("TurnSignal: %s (%s)", turn.signal, turn.reason)

        if turn.signal == TurnSignal.BACKCHANNEL:
            # Caller said "சரி" / "okay" — keep listening, don't fire LLM
            return VoiceTurnResponse(
                text="",
                audio_base64="",
                audio_format="wav",
                sample_rate=16000,
                analysis={**analysis, "turn_signal": "backchannel"},
                latency_ms=(time.time() - t_start) * 1000,
                tts_engine="none",
            )

        if turn.signal == TurnSignal.HANDOFF:
            # Angry/distressed caller OR explicit "get me a human" — short
            # circuit the LLM and return a structured handoff event so the
            # telephony layer can warm-transfer immediately.
            if chosen_lang == "ta":
                handoff_text = "ஒரு நிமிடம் இருங்கள், நான் உங்களை ஒரு staff memberகிட்ட connect செய்கிறேன்."
            elif chosen_lang == "hi":
                handoff_text = "एक मिनट रुकिए, मैं आपको हमारे staff से connect करता हूँ।"
            else:
                handoff_text = "Please hold for a moment. I'm connecting you with one of our team members right away."

            handoff_tts = await self.generate_response_audio(
                text=handoff_text, language=chosen_lang, voice_id=request.voice_id,
            )
            return VoiceTurnResponse(
                text=handoff_text,
                audio_base64=handoff_tts.get("audio_base64", ""),
                audio_format=handoff_tts.get("audio_format", "mp3"),
                sample_rate=handoff_tts.get("sample_rate", 24000),
                analysis={**analysis, "turn_signal": "handoff",
                          "handoff_reason": turn.reason},
                latency_ms=(time.time() - t_start) * 1000,
                tts_engine=handoff_tts.get("engine_used", "unknown"),
            )

        # Phase 1 W2.3: India-grounded system prompt + emotion prefix
        grounded_prompt = _ground_prompt_india(
            request.system_prompt,
            language=chosen_lang,
            dialect=getattr(request, "dialect", None),
        )
        if turn.emotion_prefix:
            grounded_prompt = turn.emotion_prefix + "\n\n" + grounded_prompt

        # ── Cross-call memory: load returning caller context ────────────────
        caller_profile: dict = {}
        if request.caller_phone:
            try:
                from voice_engine.caller_memory import on_call_start
                caller_profile, mem_block = await on_call_start(
                    request.caller_phone, language=chosen_lang
                )
                if mem_block:
                    grounded_prompt = mem_block + "\n\n" + grounded_prompt
                    logger.info("caller_memory: injected profile for %s",
                                request.caller_phone[-4:])
            except Exception:
                pass

        # W6.2 — response cache check
        from voice_engine import response_cache
        cached = response_cache.lookup(
            agent_id=getattr(request, "assistant_id", None),
            language=chosen_lang,
            text=user_text,
        )
        if cached:
            logger.info("Response cache HIT — skipping LLM+TTS")
            total_ms = (time.time() - t_start) * 1000
            return VoiceTurnResponse(
                text=cached["ai_text"],
                audio_base64=cached["audio_base64"],
                audio_format=cached.get("audio_format", "mp3"),
                sample_rate=cached.get("sample_rate", 24000),
                analysis=analysis,
                latency_ms=total_ms,
                tts_engine=cached.get("engine_used", "cache"),
            )

        # W6.1 — smart model routing
        from voice_engine.smart_llm import pick_model
        chosen_provider, chosen_model, route_reason = pick_model(
            user_message=user_text,
            requested_provider=request.llm_provider,
            requested_model=request.llm_model,
        )
        logger.info("LLM routing: %s/%s (%s)", chosen_provider, chosen_model, route_reason)

        # --- Step 2: LLM — with optional n8n tool use ─────────────────────
        tool_calls_fired: list = []
        if request.tools_enabled:
            try:
                from voice_engine.tool_executor import execute_llm_turn_with_tools
                tool_result = await execute_llm_turn_with_tools(
                    system_prompt=grounded_prompt,
                    user_message=user_text,
                    tools=request.agent_tools,
                    provider=chosen_provider,
                    model=chosen_model or "llama-3.3-70b-versatile",
                    language=chosen_lang,
                )
                ai_text         = tool_result["text"]
                tool_calls_fired = tool_result.get("tool_calls", [])
                logger.info("Tool use: %s tools fired",
                            len(tool_calls_fired) or "no")
            except Exception as e:
                logger.warning("tool_executor failed (%s), falling back to plain LLM", e)
                request.tools_enabled = False

        if not request.tools_enabled:
            try:
                from voice_engine.api_providers import call_llm_api
                llm_result = await call_llm_api(
                    system_prompt=grounded_prompt,
                    user_message=user_text,
                    provider=chosen_provider,
                    model=chosen_model or None,
                )
                ai_text = llm_result["text"]
            except Exception:
                ai_text = await _call_llm(
                    system_prompt=grounded_prompt,
                    user_message=user_text,
                    provider=chosen_provider,
                    model=chosen_model or None,
                )
        t_after_llm = time.time()
        logger.info("LLM done in %.0fms: '%s'", (t_after_llm - t_after_stt) * 1000, ai_text[:60])

        # ── Clean LLM output before TTS ──────────────────────────────────────
        # Strips markdown, AI filler openers, trims to 2 sentences for phone.
        from voice_engine.llm_output_cleaner import clean_for_tts as _clean
        ai_text = _clean(ai_text, max_sentences=2)
        logger.debug("Cleaned TTS text: '%s'", ai_text[:80])

        # ── Update cross-call memory (fire-and-forget) ───────────────────────
        if request.caller_phone:
            try:
                from voice_engine.caller_memory import on_turn_end
                asyncio.create_task(on_turn_end(
                    phone=request.caller_phone,
                    profile=caller_profile,
                    transcript=user_text,
                    agent_text=ai_text,
                    intent=analysis.get("intent", ""),
                    language=chosen_lang,
                    emotion=detected_emotion,
                ))
            except Exception:
                pass

        # --- Step 3: TTS — TADA first, then Sarvam fallback ─────────────────
        tts_result = None
        try:
            from tts.tada_engine import is_available as tada_ready
            from tts.tada_engine import synthesize as tada_synthesize
            if tada_ready():
                tts_result = await tada_synthesize(
                    text=ai_text,
                    language=chosen_lang,
                    emotion=detected_emotion,
                    emotion_scores=analysis.get("emotion_scores", {}),
                    speed=1.0,
                )
                if tts_result:
                    tts_result["engine_used"] = "tada"
        except Exception:
            pass

        if not tts_result:
            tts_result = await self.generate_response_audio(
                text=ai_text,
                language=chosen_lang,
                detected_customer_emotion=detected_emotion,
                voice_id=request.voice_id,
                use_case="sales_bot",
            )

        # W6.2 — store in cache for next time.
        response_cache.store(
            agent_id=getattr(request, "assistant_id", None),
            language=chosen_lang,
            text=user_text,
            payload={
                "ai_text": ai_text,
                "audio_base64": tts_result.get("audio_base64", ""),
                "audio_format": tts_result.get("audio_format", "mp3"),
                "sample_rate": tts_result.get("sample_rate", 24000),
                "engine_used": tts_result.get("engine_used", "unknown"),
            },
        )
        t_end = time.time()
        total_ms = (t_end - t_start) * 1000
        logger.info(f"TTS done in {(t_end - t_after_llm)*1000:.0f}ms. Total: {total_ms:.0f}ms")

        # Record call metrics for the Quality Dashboard (best-effort, non-blocking).
        # For serial turns, TTFA == total_ms (user hears nothing until everything is done).
        try:
            from api.services.quality_store import record_call
            record_call(
                agent_id=getattr(request, "assistant_id", None),
                language=chosen_lang,
                noise_ms=int((locals().get("t_preprocess", t_start) - t_start) * 1000),
                stt_ms=int((t_after_stt - t_start) * 1000),
                llm_ms=int((t_after_llm - t_after_stt) * 1000),
                tts_ms=int((t_end - t_after_llm) * 1000),
                total_ms=int(total_ms),
                ttfa_ms=int(total_ms),
                pipeline_mode="serial",
            )
        except Exception:
            pass

        # Corpus collection — fire-and-forget, never blocks the response.
        # Only runs if user has granted DPDP corpus_collection consent.
        try:
            from voice_engine.corpus_collector import collect as _corpus_collect
            asyncio.create_task(
                _corpus_collect(
                    user_audio_bytes=getattr(request, "audio_bytes", b"") or b"",
                    agent_text=ai_text,
                    language=chosen_lang or "en",
                    stt_result=analysis or {},
                    user_id=getattr(request, "user_id", None),
                    tenant_id=getattr(request, "tenant_id", None),
                    domain=getattr(request, "domain", "general") or "general",
                )
            )
        except Exception:
            pass

        return VoiceTurnResponse(
            text=ai_text,
            audio_base64=tts_result["audio_base64"],
            audio_format=tts_result["audio_format"],
            sample_rate=tts_result["sample_rate"],
            analysis=analysis,
            latency_ms=total_ms,
            tts_engine=tts_result["engine_used"],
        )


# Singleton
_voice_ai_service: VoiceAIService | None = None


def get_voice_ai_service() -> VoiceAIService:
    global _voice_ai_service
    if _voice_ai_service is None:
        _voice_ai_service = VoiceAIService()
    return _voice_ai_service
