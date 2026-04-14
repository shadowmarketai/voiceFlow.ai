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
        from voice_engine.api_providers import transcribe_audio_api
        stt_result = await transcribe_audio_api(audio_bytes, language=language)
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

        # --- Step 2: Generate LLM response (tries all providers) ---
        try:
            from voice_engine.api_providers import call_llm_api
            llm_result = await call_llm_api(
                system_prompt=request.system_prompt,
                user_message=user_text,
                provider=request.llm_provider,
                model=request.llm_model,
            )
            ai_text = llm_result["text"]
        except Exception:
            ai_text = await _call_llm(
                system_prompt=request.system_prompt,
                user_message=user_text,
                provider=request.llm_provider,
                model=request.llm_model,
            )
        t_after_llm = time.time()
        logger.info(f"LLM done in {(t_after_llm - t_after_stt)*1000:.0f}ms: '{ai_text[:60]}'")

        # --- Step 3: TTS ---
        tts_result = await self.generate_response_audio(
            text=ai_text,
            language=request.tts_language,
            detected_customer_emotion=detected_emotion,
            voice_id=request.voice_id,
            use_case="sales_bot",
        )
        t_end = time.time()
        total_ms = (t_end - t_start) * 1000
        logger.info(f"TTS done in {(t_end - t_after_llm)*1000:.0f}ms. Total: {total_ms:.0f}ms")

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
