"""
VoiceFlow TTS Service
Main service that orchestrates all TTS engines with intelligent selection
"""

import base64
import json
import logging
import os
import time
from collections.abc import AsyncGenerator
from typing import Any

from tts.config import (
    EMOTION_RESPONSE_MAPPING,
    LANGUAGE_ENGINE_QUALITY,
    TTS_ENGINE_CONFIG,
    USE_CASE_ENGINE_MAPPING,
    EmotionType,
    TTSEngine,
    TTSRequest,
    TTSResponse,
    VoiceCloneRequest,
    VoiceCloneResponse,
    VoiceConfig,
)
from tts.engines.ai4b_fastpitch import AI4BFastPitchEngine
from tts.engines.base import BaseTTSEngine
from tts.engines.bhashini_tts_engine import BhashiniTTSEngine
from tts.engines.cartesia import CartesiaEngine
from tts.engines.elevenlabs import ElevenLabsEngine
from tts.engines.indic_parler import IndicParlerTTSEngine
from tts.engines.indicf5 import IndicF5Engine
from tts.engines.openvoice import OpenVoiceV2Engine
from tts.engines.sarvam_tts import SarvamTTSEngine
from tts.engines.svara import SvaraTTSEngine
from tts.engines.xtts import XTTSv2Engine

logger = logging.getLogger(__name__)


class TTSService:
    """
    Main TTS Service for VoiceFlow
    
    Features:
    - Intelligent engine selection based on language, emotion, use case
    - Emotion-aware TTS (maps detected customer emotion to AI response)
    - Tamil dialect support
    - Voice cloning
    - Streaming support
    - Fallback handling
    """

    def __init__(self, voices_dir: str = None):
        import os as _os
        if voices_dir is None:
            # Store voices next to src/ in project root
            voices_dir = _os.path.join(
                _os.path.dirname(__file__), "..", "..", "voices"
            )
            voices_dir = _os.path.abspath(voices_dir)
        self.voices_dir = voices_dir
        os.makedirs(voices_dir, exist_ok=True)

        # Initialize engines (lazy loaded)
        self.engines: dict[TTSEngine, BaseTTSEngine] = {}
        self._engine_classes = {
            # API-based engines (no GPU, primary for production)
            TTSEngine.ELEVENLABS:     ElevenLabsEngine,
            TTSEngine.CARTESIA:       CartesiaEngine,
            TTSEngine.SARVAM_TTS:     SarvamTTSEngine,
            # Self-hosted engines (GPU-based, fallback)
            TTSEngine.INDIC_PARLER:   IndicParlerTTSEngine,
            TTSEngine.OPENVOICE_V2:   OpenVoiceV2Engine,
            TTSEngine.XTTS_V2:        XTTSv2Engine,
            TTSEngine.INDICF5:        IndicF5Engine,
            TTSEngine.SVARA:          SvaraTTSEngine,
            TTSEngine.AI4B_FASTPITCH: AI4BFastPitchEngine,
            TTSEngine.BHASHINI:       BhashiniTTSEngine,
        }

        # Cache for cloned voices
        self.voice_cache: dict[str, VoiceConfig] = {}
        self._load_voices()

    def _load_voices(self):
        """Load existing cloned voices from disk"""
        for voice_id in os.listdir(self.voices_dir):
            meta_path = os.path.join(self.voices_dir, voice_id, "metadata.json")
            if os.path.exists(meta_path):
                with open(meta_path) as f:
                    data = json.load(f)
                    self.voice_cache[voice_id] = VoiceConfig(**data)

    async def _get_engine(self, engine_type: TTSEngine) -> BaseTTSEngine:
        """Get or initialize an engine"""
        if engine_type not in self.engines:
            config = TTS_ENGINE_CONFIG.get(engine_type, {})
            engine_class = self._engine_classes.get(engine_type)

            # Fallback: match by string value if direct enum lookup fails
            if not engine_class:
                for key, cls in self._engine_classes.items():
                    if key.value == getattr(engine_type, 'value', str(engine_type)):
                        engine_class = cls
                        engine_type = key
                        config = TTS_ENGINE_CONFIG.get(engine_type, {})
                        break

            if not engine_class:
                raise ValueError(f"Engine {engine_type} not implemented")

            engine = engine_class(config)
            loaded = await engine.load_model()
            if not loaded:
                raise RuntimeError(f"Engine {engine_type.value} failed to load")
            self.engines[engine_type] = engine

        return self.engines[engine_type]

    def select_engine(
        self,
        language: str,
        emotion: str | None = None,
        use_case: str | None = None,
        detected_customer_emotion: str | None = None,
        prefer_low_latency: bool = False,
    ) -> TTSEngine:
        """Select the best TTS engine based on context.

        Priority:
        0. Bhashini-only languages (Bodo, Dogri, Sindhi, etc.) → Bhashini
        1. Latency preference → Cartesia (English) or Sarvam TTS (Indian)
        2. Use-case mapping
        3. Customer emotion mapping (empathy, etc.)
        4. Language quality matrix (highest score wins)
        5. Language family default:
              English → ElevenLabs
              Indian  → Sarvam TTS
        """
        lang = (language or "en").lower()[:2]

        # 0. Rare Indian langs only Bhashini supports
        if language in self._BHASHINI_ONLY_LANGS:
            return TTSEngine.BHASHINI

        # 1. Low-latency override — Cartesia for EN, Sarvam for Indian
        if prefer_low_latency:
            return TTSEngine.CARTESIA if lang == "en" else TTSEngine.SARVAM_TTS

        # 2. Use-case mapping
        if use_case and use_case in USE_CASE_ENGINE_MAPPING:
            return USE_CASE_ENGINE_MAPPING[use_case]["primary"]

        # 3. Emotion-aware engine selection
        if detected_customer_emotion and detected_customer_emotion in EMOTION_RESPONSE_MAPPING:
            return EMOTION_RESPONSE_MAPPING[detected_customer_emotion]["engine"]

        # 4. Language quality matrix — highest score wins
        if lang in LANGUAGE_ENGINE_QUALITY:
            quality_scores = LANGUAGE_ENGINE_QUALITY[lang]
            return max(quality_scores, key=quality_scores.get)

        # 5. Language family defaults
        if lang == "en":
            return TTSEngine.ELEVENLABS
        return TTSEngine.SARVAM_TTS

    def get_emotion_for_response(
        self,
        detected_customer_emotion: str
    ) -> dict[str, Any]:
        """
        Get the appropriate AI response emotion based on detected customer emotion
        """
        if detected_customer_emotion in EMOTION_RESPONSE_MAPPING:
            return EMOTION_RESPONSE_MAPPING[detected_customer_emotion]

        return EMOTION_RESPONSE_MAPPING["neutral"]

    # Fallback order when a selected engine fails.
    # API-based engines (ElevenLabs, Cartesia, Sarvam) come first — no GPU,
    # always available as long as API keys are set. Self-hosted engines follow
    # as fallback for when API keys are absent or API is down.
    ENGINE_FALLBACK_ORDER = [
        TTSEngine.ELEVENLABS,       # MOS 4.8 — try first (English primary)
        TTSEngine.CARTESIA,         # MOS 4.7 — fastest (English real-time)
        TTSEngine.SARVAM_TTS,       # MOS 4.4 — best Indian API (Indian primary)
        TTSEngine.INDIC_PARLER,     # MOS 4.3 — self-hosted Indian
        TTSEngine.BHASHINI,         # API — 22+ langs, free
        TTSEngine.AI4B_FASTPITCH,   # Self-hosted — lowest latency fallback
        TTSEngine.OPENVOICE_V2,
        TTSEngine.INDICF5,
        TTSEngine.SVARA,
        TTSEngine.XTTS_V2,
    ]

    # Languages ONLY supported by Bhashini (not in other engines)
    _BHASHINI_ONLY_LANGS = {
        "bodo", "dogri", "kashmiri", "konkani",
        "maithili", "manipuri", "sindhi",
    }

    async def _get_engine_with_fallback(
        self,
        engine_type: TTSEngine,
        language: str = None
    ) -> tuple:
        """Try to get the requested engine; on failure, walk the fallback chain.
        Returns (engine_instance, actual_engine_type).
        """
        # Try the requested engine first
        try:
            engine = await self._get_engine(engine_type)
            return engine, engine_type
        except Exception as e:
            logger.warning("Primary engine %s failed: %s — trying fallbacks", engine_type, e)

        # Walk fallback chain
        for fallback in self.ENGINE_FALLBACK_ORDER:
            if fallback == engine_type:
                continue
            try:
                engine = await self._get_engine(fallback)
                logger.info("Using fallback engine %s instead of %s", fallback, engine_type)
                return engine, fallback
            except Exception:
                continue

        raise RuntimeError("All TTS engines failed to load")

    async def synthesize(self, request: TTSRequest) -> TTSResponse:
        """
        Main synthesis method with intelligent engine selection
        """
        start_time = time.time()

        # Determine emotion response if customer emotion detected
        response_config = None
        emotion = request.emotion or EmotionType.NEUTRAL

        if request.detected_customer_emotion:
            response_config = self.get_emotion_for_response(
                request.detected_customer_emotion
            )
            emotion = EmotionType(response_config.get("tts_emotion", "neutral"))

        # Select engine
        engine_type = request.engine
        if not engine_type:
            engine_type = self.select_engine(
                language=request.language.value,
                emotion=emotion.value,
                use_case=request.use_case,
                detected_customer_emotion=request.detected_customer_emotion
            )

        # Get engine (with automatic fallback on failure)
        engine, engine_type = await self._get_engine_with_fallback(
            engine_type, request.language.value
        )

        # Apply response config modifiers
        pace = request.pace
        pitch = request.pitch
        if response_config:
            if response_config.get("pace") == "slow":
                pace *= 0.85
            elif response_config.get("pace") == "fast":
                pace *= 1.15

            if response_config.get("pitch") == "low":
                pitch *= 0.9
            elif response_config.get("pitch") == "high":
                pitch *= 1.1

        # Synthesize — retry with fallback if synthesis itself fails
        try:
            audio_bytes = await engine.synthesize(
                text=request.text,
                language=request.language.value,
                emotion=emotion.value,
                voice_id=request.voice_id,
                pace=pace,
                pitch=pitch,
                dialect=request.dialect.value if request.dialect else None,
                energy=request.energy
            )
        except Exception as synth_err:
            logger.warning("Synthesis failed on %s: %s — retrying with fallbacks", engine_type, synth_err)
            # Try remaining engines
            for fallback in self.ENGINE_FALLBACK_ORDER:
                if fallback == engine_type:
                    continue
                try:
                    fb_engine, engine_type = await self._get_engine_with_fallback(fallback, request.language.value)
                    audio_bytes = await fb_engine.synthesize(
                        text=request.text,
                        language=request.language.value,
                        emotion=emotion.value,
                        voice_id=request.voice_id,
                        pace=pace,
                        pitch=pitch,
                        dialect=request.dialect.value if request.dialect else None,
                        energy=request.energy
                    )
                    break
                except Exception:
                    continue
            else:
                raise RuntimeError(f"All TTS engines failed. Last error: {synth_err}")

        # Calculate duration (rough estimate from bytes)
        # WAV: bytes / (sample_rate * channels * bytes_per_sample)
        duration = len(audio_bytes) / (request.sample_rate * 1 * 2)

        latency = (time.time() - start_time) * 1000

        # Encode to base64
        audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')

        return TTSResponse(
            audio_base64=audio_base64,
            duration_seconds=duration,
            engine_used=engine_type,
            emotion_used=emotion.value,
            latency_ms=latency,
            sample_rate=request.sample_rate,
            format=request.output_format
        )

    async def synthesize_stream(
        self,
        request: TTSRequest
    ) -> AsyncGenerator[bytes, None]:
        """
        Stream audio generation for real-time applications
        """
        # Select engine (prefer low latency for streaming)
        engine_type = request.engine or self.select_engine(
            language=request.language.value,
            prefer_low_latency=True
        )

        engine, engine_type = await self._get_engine_with_fallback(
            engine_type, request.language.value
        )

        emotion = request.emotion or EmotionType.NEUTRAL

        async for chunk in engine.synthesize_stream(
            text=request.text,
            language=request.language.value,
            emotion=emotion.value,
            voice_id=request.voice_id,
            pace=request.pace,
            pitch=request.pitch
        ):
            yield chunk

    async def clone_voice(self, request: VoiceCloneRequest) -> VoiceCloneResponse:
        """
        Clone a voice from reference audio
        """
        # Get reference audio
        if request.reference_audio_base64:
            reference_audio = base64.b64decode(request.reference_audio_base64)
        elif request.reference_audio_url:
            import aiohttp
            async with aiohttp.ClientSession() as session, session.get(request.reference_audio_url) as resp:
                reference_audio = await resp.read()
        else:
            raise ValueError("No reference audio provided")

        # Get engine
        engine = await self._get_engine(request.engine)

        # Clone voice
        voice_id = await engine.clone_voice(
            reference_audio=reference_audio,
            voice_name=request.name,
            language=request.language.value
        )

        # Save to cache
        voice_config = VoiceConfig(
            voice_id=voice_id,
            name=request.name,
            language=request.language,
            dialect=request.dialect,
            engine=request.engine,
            reference_audio_path=f"{self.voices_dir}/{voice_id}/reference.wav",
            created_at=time.strftime("%Y-%m-%d %H:%M:%S")
        )
        self.voice_cache[voice_id] = voice_config

        return VoiceCloneResponse(
            voice_id=voice_id,
            name=request.name,
            status="ready",
            engine=request.engine,
            estimated_ready_seconds=0
        )

    def list_voices(self) -> list[VoiceConfig]:
        """List all available cloned voices"""
        return list(self.voice_cache.values())

    def get_voice(self, voice_id: str) -> VoiceConfig | None:
        """Get a specific voice configuration"""
        return self.voice_cache.get(voice_id)

    async def delete_voice(self, voice_id: str) -> bool:
        """Delete a cloned voice"""
        if voice_id in self.voice_cache:
            import shutil
            voice_dir = os.path.join(self.voices_dir, voice_id)
            if os.path.exists(voice_dir):
                shutil.rmtree(voice_dir)
            del self.voice_cache[voice_id]
            return True
        return False

    def get_available_engines(self) -> list[dict[str, Any]]:
        """Get list of available TTS engines with their capabilities"""
        engines = []
        for engine_type, config in TTS_ENGINE_CONFIG.items():
            engines.append({
                "engine": engine_type.value,
                "model_id": config.get("model_id"),
                "languages": config.get("languages", []),
                "emotions": config.get("emotions", []),
                "latency_ms": config.get("latency_ms"),
                "quality_mos": config.get("quality_mos"),
                "best_for": config.get("best_for", []),
                "license": config.get("license")
            })
        return engines

    def get_use_case_recommendations(self) -> dict[str, Any]:
        """Get recommended engines for each use case"""
        return USE_CASE_ENGINE_MAPPING

    async def health_check(self) -> dict[str, Any]:
        """Check health of TTS engines"""
        health = {
            "status": "healthy",
            "engines": {},
            "voices_count": len(self.voice_cache)
        }

        for engine_type in self._engine_classes.keys():
            try:
                engine = await self._get_engine(engine_type)
                health["engines"][engine_type.value] = {
                    "loaded": engine.is_loaded,
                    "status": "ready" if engine.is_loaded else "not_loaded"
                }
            except Exception as e:
                health["engines"][engine_type.value] = {
                    "loaded": False,
                    "status": "error",
                    "error": str(e)
                }

        return health


# Singleton instance
_tts_service: TTSService | None = None


def get_tts_service() -> TTSService:
    """Get or create the TTS service singleton"""
    global _tts_service
    if _tts_service is None:
        _tts_service = TTSService()
    return _tts_service
