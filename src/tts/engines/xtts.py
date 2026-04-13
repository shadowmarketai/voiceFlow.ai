"""
XTTS-v2 Engine
Best for: Production customer service, cross-lingual voice transfer
Model: coqui/XTTS-v2
License: Coqui Public License
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


class XTTSv2Engine(BaseTTSEngine):
    """
    XTTS-v2 implementation (Coqui TTS)

    Features:
    - 17 languages (including Hindi and English)
    - Style transfer from reference audio (emotion cloning)
    - 6-second reference for voice cloning
    - GPU required for reasonable latency
    - Streaming support
    - ~150-400ms latency
    """

    SUPPORTED_LANGUAGES = [
        "en", "es", "fr", "de", "it", "pt", "pl", "tr", "ru",
        "nl", "cs", "ar", "zh", "ja", "hu", "ko", "hi"
    ]

    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.model_id = "coqui/XTTS-v2"
        self.tts = None

    @property
    def engine_name(self) -> str:
        return "xtts_v2"

    async def load_model(self) -> bool:
        """Load XTTS-v2 model"""
        try:
            logger.info("Loading XTTS-v2 model")

            try:
                from TTS.api import TTS as CoquiTTS
                import torch

                device = "cuda" if torch.cuda.is_available() else "cpu"

                self.tts = CoquiTTS("tts_models/multilingual/multi-dataset/xtts_v2")
                self.tts.to(device)
                self.device = device
                self.is_loaded = True
                self._fallback_mode = False

                logger.info("XTTS-v2 model loaded on %s", device)
                return True

            except ImportError:
                logger.warning("TTS package not installed, using edge-tts fallback")
                self.is_loaded = True
                self._fallback_mode = True
                return True

        except Exception as e:
            logger.error("Failed to load XTTS-v2: %s", e)
            return False

    async def unload_model(self) -> bool:
        """Unload model from memory"""
        try:
            if self.tts:
                del self.tts
                self.tts = None
            self.is_loaded = False

            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            return True
        except Exception as e:
            logger.error("Failed to unload XTTS-v2: %s", e)
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
        """Generate audio using XTTS-v2"""

        if not self.is_loaded:
            await self.load_model()

        start_time = time.time()

        # Map language code
        lang = language if language in self.SUPPORTED_LANGUAGES else "en"

        try:
            if self._fallback_mode:
                audio = await self._fallback_synthesize(text, language, pace)
            else:
                audio = await self._xtts_synthesize(text, lang, voice_id, pace)

            latency = (time.time() - start_time) * 1000
            logger.info("XTTS-v2 synthesis completed in %.0fms", latency)
            return audio

        except Exception as e:
            logger.error("XTTS-v2 synthesis failed: %s", e)
            raise

    async def _xtts_synthesize(
        self,
        text: str,
        language: str,
        voice_id: Optional[str],
        pace: float
    ) -> bytes:
        """Synthesize using XTTS-v2 model"""
        import scipy.io.wavfile as wavfile

        # Find reference audio for voice cloning / style transfer
        speaker_wav = None
        if voice_id:
            ref_path = os.path.join("voices", voice_id, "reference.wav")
            if os.path.exists(ref_path):
                speaker_wav = ref_path

        # If no reference, use a default speaker wav
        if not speaker_wav:
            default_ref = os.path.join(
                os.path.dirname(__file__), "..", "..", "..", "voices", "default", "reference.wav"
            )
            if os.path.exists(default_ref):
                speaker_wav = default_ref

        # Generate audio
        loop = asyncio.get_event_loop()
        wav_data = await loop.run_in_executor(
            None,
            lambda: self.tts.tts(
                text=text,
                language=language,
                speaker_wav=speaker_wav,
                speed=pace
            )
        )

        # Convert numpy array to WAV bytes
        import numpy as np
        audio_np = np.array(wav_data)
        buffer = io.BytesIO()
        wavfile.write(buffer, 22050, (audio_np * 32767).astype(np.int16))
        buffer.seek(0)
        return buffer.read()

    async def _fallback_synthesize(self, text: str, language: str, pace: float) -> bytes:
        """Fallback using edge-tts"""
        try:
            import edge_tts

            voice_map = {
                "hi": "hi-IN-MadhurNeural",
                "en": "en-IN-PrabhatNeural",
                "es": "es-ES-AlvaroNeural",
                "fr": "fr-FR-HenriNeural",
                "de": "de-DE-ConradNeural",
                "ar": "ar-SA-HamedNeural",
                "zh": "zh-CN-YunxiNeural",
                "ja": "ja-JP-KeitaNeural",
                "ko": "ko-KR-InJoonNeural",
            }
            voice = voice_map.get(language, "en-IN-PrabhatNeural")
            rate = f"{int((pace - 1) * 100):+d}%"

            communicate = edge_tts.Communicate(text, voice, rate=rate)
            audio_data = b""
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_data += chunk["data"]
            return audio_data

        except ImportError:
            logger.error("edge-tts not installed for XTTS fallback")
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
                voice_map = {"hi": "hi-IN-MadhurNeural", "en": "en-IN-PrabhatNeural"}
                voice = voice_map.get(language, "en-IN-PrabhatNeural")
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
            # XTTS-v2 supports streaming natively via tts.tts_stream
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
        """Clone voice — XTTS-v2 only needs 6 seconds of reference audio"""

        voice_id = f"xtts_{uuid.uuid4().hex[:8]}"
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
            "engine": "xtts_v2",
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        with open(os.path.join(voice_dir, "metadata.json"), "w") as f:
            json.dump(metadata, f)

        logger.info("Voice cloned with XTTS-v2: %s -> %s", voice_name, voice_id)
        return voice_id

    def get_supported_languages(self) -> list:
        return self.SUPPORTED_LANGUAGES

    def get_supported_emotions(self) -> list:
        return ["style_transfer"]
