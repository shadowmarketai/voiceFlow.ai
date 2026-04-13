"""
VoiceFlow - Full Voice AI Pipeline
====================================
Wires together:
  STT (Whisper) → Analysis (emotion/intent) → LLM (Claude/Groq) → TTS (Indic Parler/OpenVoice)

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
            chosen_model = model or "llama3-8b-8192"
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

    async def transcribe_and_analyze(self, audio_bytes: bytes, language: Optional[str] = None) -> Dict[str, Any]:
        """
        Step 1: STT + emotion + intent analysis.
        Returns serialisable dict.
        """
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
        Returns dict with audio_base64, engine_used, etc.
        """
        from tts.config import TTSRequest, Language, EmotionType

        # Map language code to TTS Language enum
        lang_map = {
            "en": Language.ENGLISH,
            "ta": Language.TAMIL,
            "hi": Language.HINDI,
            "te": Language.TELUGU,
            "kn": Language.KANNADA,
            "ml": Language.MALAYALAM,
        }
        tts_language = lang_map.get(language, Language.ENGLISH)

        # Map emotion string
        emotion_map = {v.value: v for v in EmotionType}
        tts_emotion = emotion_map.get(emotion) if emotion else None

        tts_req = TTSRequest(
            text=text,
            language=tts_language,
            emotion=tts_emotion,
            detected_customer_emotion=detected_customer_emotion,
            voice_id=voice_id,
            use_case=use_case,
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

    async def handle_turn(self, request: VoiceTurnRequest) -> VoiceTurnResponse:
        """
        Full pipeline for one conversational turn:
          1. STT + Analysis
          2. LLM response generation
          3. TTS
        """
        t_start = time.time()

        # --- Step 1: Analyse incoming audio ---
        analysis = await self.transcribe_and_analyze(
            request.audio_bytes, language=request.language
        )
        user_text = analysis["transcription"]
        detected_emotion = analysis.get("emotion", "neutral")
        t_after_stt = time.time()
        logger.info(f"STT done in {(t_after_stt - t_start)*1000:.0f}ms: '{user_text[:60]}'")

        # --- Step 2: Generate LLM response ---
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
