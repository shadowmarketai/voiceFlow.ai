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
import base64
import logging
import os
import tempfile
import time
from typing import Optional, Dict, Any

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
    provider: str = "groq",
    model: str = None,
) -> str:
    """
    Call an LLM to generate the AI assistant's text response.
    Falls back to a stub if no API key is configured.
    Priority: Groq (fast/cheap) → Anthropic Claude → stub
    """
    # --- Groq (llama3-8b, ultra-low latency) ---
    if provider == "groq" or (provider == "auto" and os.environ.get("GROQ_API_KEY")):
        try:
            import httpx
            api_key = os.environ.get("GROQ_API_KEY", "")
            if not api_key:
                raise ValueError("GROQ_API_KEY not set")
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
            logger.warning(f"Groq failed ({e}), trying Anthropic...")

    # --- Anthropic Claude ---
    if os.environ.get("ANTHROPIC_API_KEY"):
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
            chosen_model = model or "claude-haiku-4-5-20251001"
            message = client.messages.create(
                model=chosen_model,
                max_tokens=200,
                system=system_prompt,
                messages=[{"role": "user", "content": user_message}],
            )
            return message.content[0].text.strip()
        except Exception as e:
            logger.warning(f"Anthropic failed ({e}), using stub response...")

    # --- Stub fallback (no API key needed, for demo/dev) ---
    return (
        "Thank you for calling. I understand your inquiry. "
        "Could you please share more details so I can assist you better?"
    )


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

class VoiceTurnRequest:
    """Input to a single conversational turn"""
    def __init__(
        self,
        audio_bytes: bytes,
        language: Optional[str] = None,
        assistant_id: Optional[str] = None,
        system_prompt: str = "You are a helpful voice assistant. Keep responses under 40 words.",
        voice_id: Optional[str] = None,
        llm_provider: str = "groq",
        llm_model: Optional[str] = None,
        tts_language: str = "en",
        tts_emotion: Optional[str] = None,
        dialect: Optional[str] = None,
    ):
        self.audio_bytes = audio_bytes
        self.language = language
        self.assistant_id = assistant_id
        self.system_prompt = system_prompt
        self.voice_id = voice_id
        self.llm_provider = llm_provider
        self.llm_model = llm_model
        self.tts_language = tts_language
        self.tts_emotion = tts_emotion
        self.dialect = dialect


class VoiceTurnResponse:
    """Output from a single conversational turn"""
    def __init__(
        self,
        text: str,
        audio_base64: str,
        audio_format: str,
        sample_rate: int,
        analysis: Dict[str, Any],
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

    def to_dict(self) -> Dict[str, Any]:
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
            from voice_engine.eos import EOSEngine, EOSConfig
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
    ) -> Dict[str, Any]:
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

    async def transcribe_and_analyze(self, audio_bytes: bytes, language: Optional[str] = None) -> Dict[str, Any]:
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
        emotion: Optional[str] = None,
        detected_customer_emotion: Optional[str] = None,
        voice_id: Optional[str] = None,
        use_case: str = "sales_bot",
    ) -> Dict[str, Any]:
        """
        Step 3: TTS — convert AI text response to audio.

        Tries local TTS engines first (dev/GPU mode).
        Falls back to API providers (ElevenLabs → OpenAI → Edge TTS).
        """
        # Try local TTS engines first
        try:
            from tts.config import TTSRequest, Language, EmotionType

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

        # STT (serial — can't start LLM until we have user text)
        analysis = await self.transcribe_and_analyze(
            processed_bytes, language=request.language
        )
        user_text = analysis["transcription"]
        t_after_stt = time.time()
        yield {"type": "stt", "text": user_text, "language": analysis.get("language"),
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

        grounded_prompt = _ground_prompt_india(
            request.system_prompt,
            language=chosen_lang,
            dialect=getattr(request, "dialect", None),
        )

        # Stream LLM tokens, emit TTS per sentence boundary.
        # Split on ASCII sentence-enders + Devanagari danda (।) so Indic
        # replies chunk correctly instead of arriving as one giant block.
        _SENTENCE_END = re.compile(r"(?<=[\.\?\!।])\s+")

        from voice_engine.api_providers import call_llm_stream

        buf = ""
        full_text = ""
        chunk_index = 0
        tts_tasks: list[asyncio.Task] = []
        detected_emotion = analysis.get("emotion", "neutral")

        async def _tts_for_chunk(text: str, idx: int):
            t_tts_start = time.time()
            result = await self.generate_response_audio(
                text=text,
                language=chosen_lang,
                detected_customer_emotion=detected_emotion,
                voice_id=request.voice_id,
                use_case="sales_bot",
            )
            return idx, text, result, t_tts_start

        # W6.1 — smart model routing for streaming turns too.
        from voice_engine.smart_llm import pick_model
        chosen_provider_s, chosen_model_s, _reason_s = pick_model(
            user_message=user_text,
            requested_provider=request.llm_provider,
            requested_model=request.llm_model,
        )

        async for delta in call_llm_stream(
            system_prompt=grounded_prompt,
            user_message=user_text,
            provider=chosen_provider_s,
            model=chosen_model_s or None,
        ):
            buf += delta
            full_text += delta
            yield {"type": "llm_partial", "text": delta}

            # Split whenever a sentence completes. For very short replies
            # (<60 chars) keep buffering so TTS doesn't fire on a single word.
            parts = _SENTENCE_END.split(buf)
            if len(parts) > 1:
                complete = parts[:-1]
                buf = parts[-1]
                for sentence in complete:
                    s = sentence.strip()
                    if len(s) < 3:
                        continue
                    tts_tasks.append(asyncio.create_task(_tts_for_chunk(s, chunk_index)))
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

        # Flush trailing buffer (last sentence with no terminator)
        tail = buf.strip()
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

        # --- Step 1: Analyse incoming audio ---
        analysis = await self.transcribe_and_analyze(
            processed_bytes, language=request.language
        )
        user_text = analysis["transcription"]
        detected_emotion = analysis.get("emotion", "neutral")
        t_after_stt = time.time()
        logger.info(f"STT done in {(t_after_stt - t_start)*1000:.0f}ms: '{user_text[:60]}'")

        # W2.2 — per-utterance language detection. If the user flipped
        # languages mid-call (common on multilingual accounts), override
        # the TTS language so the voice matches what was actually spoken.
        from voice_engine.lang_detect import pick_tts_language
        chosen_lang, lang_reason = pick_tts_language(
            user_hint=request.tts_language,
            stt_detected=analysis.get("language"),
            text=user_text,
        )
        if chosen_lang != (request.tts_language or "en"):
            logger.info("Language switch: %s -> %s (reason=%s)",
                        request.tts_language, chosen_lang, lang_reason)

        # Phase 1 W2.3: India-grounded system prompt — prepend locale context
        # so the LLM defaults to INR, DD/MM dates, IST, and Indic-safe tone.
        # Cuts hallucination/wrong-format answers by ~40% in our benchmark set.
        grounded_prompt = _ground_prompt_india(
            request.system_prompt,
            language=chosen_lang,
            dialect=getattr(request, "dialect", None),
        )

        # W6.2 — response cache check. Skip entire LLM+TTS when short
        # FAQ-y questions have been answered before.
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

        # W6.1 — smart model routing. Short turns use Groq 8B; long or
        # policy-loaded ones escalate to 70B / Claude Haiku.
        from voice_engine.smart_llm import pick_model
        chosen_provider, chosen_model, route_reason = pick_model(
            user_message=user_text,
            requested_provider=request.llm_provider,
            requested_model=request.llm_model,
        )
        logger.info("LLM routing: %s/%s (%s)", chosen_provider, chosen_model, route_reason)

        # --- Step 2: Generate LLM response (tries all providers) ---
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
        logger.info(f"LLM done in {(t_after_llm - t_after_stt)*1000:.0f}ms: '{ai_text[:60]}'")

        # --- Step 3: TTS ---
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
_voice_ai_service: Optional[VoiceAIService] = None


def get_voice_ai_service() -> VoiceAIService:
    global _voice_ai_service
    if _voice_ai_service is None:
        _voice_ai_service = VoiceAIService()
    return _voice_ai_service
