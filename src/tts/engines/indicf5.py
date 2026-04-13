"""
IndicF5 TTS Engine
Best for: Highest quality Indian language TTS (4.6 MOS)
Model: ai4bharat/IndicF5
License: Open Source
"""

import asyncio
import io
import os
import time
import uuid
import json
from typing import Optional, AsyncGenerator, Dict, Any
import logging

from tts.engines.base import BaseTTSEngine

logger = logging.getLogger(__name__)


class IndicF5Engine(BaseTTSEngine):
    """
    IndicF5 implementation (ai4bharat)

    Features:
    - 11 Indian languages (highest quality: 4.6 MOS)
    - Zero-shot voice cloning from 5-second reference
    - Prosody-based emotion (transfers from reference audio)
    - Low latency: 150-300ms
    - CPU capable
    - Streaming support
    """

    LANGUAGE_CODES = {
        "ta": "Tamil", "hi": "Hindi", "te": "Telugu",
        "kn": "Kannada", "ml": "Malayalam", "bn": "Bengali",
        "mr": "Marathi", "gu": "Gujarati", "pa": "Punjabi",
        "or": "Odia", "as": "Assamese"
    }

    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.model_id = "ai4bharat/IndicF5"
        self._fallback_mode = False

    @property
    def engine_name(self) -> str:
        return "indicf5"

    async def load_model(self) -> bool:
        """Load IndicF5 model"""
        try:
            logger.info("Loading IndicF5 model: %s", self.model_id)

            try:
                from f5_tts.api import F5TTS
                import torch

                device = "cuda" if torch.cuda.is_available() else "cpu"

                self.model = F5TTS(model_type="F5-TTS", ckpt_file="", device=device)
                self.device = device
                self.is_loaded = True
                self._fallback_mode = False

                logger.info("IndicF5 model loaded on %s", device)
                return True

            except ImportError:
                logger.warning("f5-tts not installed, checking edge-tts fallback")
                try:
                    import edge_tts  # noqa: F401
                    self.is_loaded = True
                    self._fallback_mode = True
                    logger.info("IndicF5 using edge-tts fallback")
                    return True
                except ImportError:
                    logger.error("Neither f5-tts nor edge-tts installed — IndicF5 unavailable")
                    return False

        except Exception as e:
            logger.error("Failed to load IndicF5: %s", e)
            return False

    async def unload_model(self) -> bool:
        """Unload model from memory"""
        try:
            if self.model:
                del self.model
                self.model = None
            self.is_loaded = False

            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except ImportError:
                pass
            return True
        except Exception as e:
            logger.error("Failed to unload IndicF5: %s", e)
            return False

    async def synthesize(
        self,
        text: str,
        language: str,
        emotion: Optional[str] = None,
        voice_id: Optional[str] = None,
        pace: float = 1.0,
        pitch: float = 1.0,
        **kwargs
    ) -> bytes:
        """Generate audio using IndicF5"""

        if not self.is_loaded:
            await self.load_model()

        start_time = time.time()

        try:
            if self._fallback_mode:
                audio = await self._fallback_synthesize(text, language, pace)
            else:
                audio = await self._indicf5_synthesize(text, language, voice_id, pace)

            latency = (time.time() - start_time) * 1000
            logger.info("IndicF5 synthesis completed in %.0fms", latency)
            return audio

        except Exception as e:
            logger.error("IndicF5 synthesis failed: %s", e)
            raise

    async def _indicf5_synthesize(
        self,
        text: str,
        language: str,
        voice_id: Optional[str],
        pace: float
    ) -> bytes:
        """Synthesize using IndicF5 model"""
        import numpy as np
        import scipy.io.wavfile as wavfile

        # Find reference audio for voice cloning
        ref_audio_path = None
        ref_text = ""
        if voice_id:
            ref_path = os.path.join("voices", voice_id, "reference.wav")
            ref_text_path = os.path.join("voices", voice_id, "reference.txt")
            if os.path.exists(ref_path):
                ref_audio_path = ref_path
            if os.path.exists(ref_text_path):
                with open(ref_text_path) as f:
                    ref_text = f.read().strip()

        # Generate audio
        loop = asyncio.get_event_loop()

        if ref_audio_path:
            wav_data, sample_rate = await loop.run_in_executor(
                None,
                lambda: self.model.infer(
                    ref_file=ref_audio_path,
                    ref_text=ref_text,
                    gen_text=text,
                    speed=pace
                )
            )
        else:
            wav_data, sample_rate = await loop.run_in_executor(
                None,
                lambda: self.model.infer(
                    gen_text=text,
                    speed=pace
                )
            )

        # Convert to WAV bytes
        audio_np = np.array(wav_data)
        if audio_np.dtype == np.float32 or audio_np.dtype == np.float64:
            audio_np = (audio_np * 32767).astype(np.int16)

        buffer = io.BytesIO()
        wavfile.write(buffer, sample_rate or 24000, audio_np)
        buffer.seek(0)
        return buffer.read()

    async def _fallback_synthesize(self, text: str, language: str, pace: float) -> bytes:
        """Fallback using edge-tts for Indian languages"""
        try:
            import edge_tts

            voice_map = {
                "ta": "ta-IN-PallaviNeural",
                "hi": "hi-IN-SwaraNeural",
                "te": "te-IN-ShrutiNeural",
                "kn": "kn-IN-SapnaNeural",
                "ml": "ml-IN-SobhanaNeural",
                "bn": "bn-IN-TanishaaNeural",
                "mr": "mr-IN-AarohiNeural",
                "gu": "gu-IN-DhwaniNeural",
                "en": "en-IN-NeerjaNeural",
            }
            voice = voice_map.get(language, "en-IN-NeerjaNeural")
            rate = f"{int((pace - 1) * 100):+d}%"

            communicate = edge_tts.Communicate(text, voice, rate=rate)
            audio_data = b""
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_data += chunk["data"]
            return audio_data

        except ImportError:
            logger.error("edge-tts not installed for IndicF5 fallback")
            raise

    async def synthesize_stream(
        self,
        text: str,
        language: str,
        emotion: Optional[str] = None,
        voice_id: Optional[str] = None,
        pace: float = 1.0,
        pitch: float = 1.0,
        **kwargs
    ) -> AsyncGenerator[bytes, None]:
        """Stream audio generation"""

        if self._fallback_mode:
            try:
                import edge_tts
                voice_map = {
                    "ta": "ta-IN-PallaviNeural",
                    "hi": "hi-IN-SwaraNeural",
                    "te": "te-IN-ShrutiNeural",
                    "en": "en-IN-NeerjaNeural"
                }
                voice = voice_map.get(language, "en-IN-NeerjaNeural")
                communicate = edge_tts.Communicate(text, voice)
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        yield chunk["data"]
            except ImportError:
                audio = await self.synthesize(text, language, emotion, voice_id, pace, pitch)
                chunk_size = 4096
                for i in range(0, len(audio), chunk_size):
                    yield audio[i:i + chunk_size]
                    await asyncio.sleep(0.005)
        else:
            audio = await self.synthesize(text, language, emotion, voice_id, pace, pitch)
            chunk_size = 4096
            for i in range(0, len(audio), chunk_size):
                yield audio[i:i + chunk_size]
                await asyncio.sleep(0.005)

    async def clone_voice(
        self,
        reference_audio: bytes,
        voice_name: str,
        language: str
    ) -> str:
        """Clone voice — IndicF5 only needs 5 seconds of reference audio"""

        voice_id = f"if5_{uuid.uuid4().hex[:8]}"
        voice_dir = os.path.join("voices", voice_id)
        os.makedirs(voice_dir, exist_ok=True)

        # Save reference audio
        ref_path = os.path.join(voice_dir, "reference.wav")
        with open(ref_path, "wb") as f:
            f.write(reference_audio)

        # Save metadata
        metadata = {
            "voice_id": voice_id,
            "name": voice_name,
            "language": language,
            "engine": "indicf5",
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        with open(os.path.join(voice_dir, "metadata.json"), "w") as f:
            json.dump(metadata, f)

        logger.info("Voice cloned with IndicF5: %s -> %s", voice_name, voice_id)
        return voice_id

    def get_supported_languages(self) -> list:
        return list(self.LANGUAGE_CODES.keys())

    def get_supported_emotions(self) -> list:
        return ["prosody_based"]
