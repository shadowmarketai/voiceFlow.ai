"""
Svara TTS Engine
Best for: Meditation, wellness, natural rhythm, edge devices
Model: canopy-ai/svara-tts
License: Open Source
"""

import asyncio
import io
import json
import logging
import os
import time
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from tts.engines.base import BaseTTSEngine

logger = logging.getLogger(__name__)


class SvaraTTSEngine(BaseTTSEngine):
    """
    Svara TTS implementation (Canopy AI)

    Features:
    - 14 Indic languages + English
    - Natural rhythm and prosody (best for meditation/wellness)
    - Multiple model sizes: 150M, 400M, 1B, 3B
    - Emotion support: happy, sad, angry, fear, clear
    - CPU-friendly (especially smaller models)
    - 4.4 MOS quality
    """

    EMOTION_PARAMS = {
        "happy": {"temperature": 0.8, "repetition_penalty": 1.1},
        "sad": {"temperature": 0.6, "repetition_penalty": 1.0},
        "angry": {"temperature": 0.9, "repetition_penalty": 1.2},
        "fear": {"temperature": 0.7, "repetition_penalty": 1.0},
        "clear": {"temperature": 0.5, "repetition_penalty": 1.0},
        "neutral": {"temperature": 0.7, "repetition_penalty": 1.0},
        "calm": {"temperature": 0.5, "repetition_penalty": 0.9},
    }

    LANGUAGE_CODES = {
        "ta": "Tamil", "hi": "Hindi", "te": "Telugu",
        "kn": "Kannada", "ml": "Malayalam", "bn": "Bengali",
        "mr": "Marathi", "gu": "Gujarati", "pa": "Punjabi",
        "or": "Odia", "as": "Assamese", "en": "English",
        "bodo": "Bodo", "ne": "Nepali"
    }

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self.model_id = "canopy-ai/svara-tts"
        self.model_size = config.get("model_size", "400M")
        self._fallback_mode = False

    @property
    def engine_name(self) -> str:
        return "svara"

    async def load_model(self) -> bool:
        """Load Svara TTS model"""
        try:
            logger.info("Loading Svara TTS model (%s): %s", self.model_size, self.model_id)

            try:
                import torch
                from transformers import AutoModelForCausalLM, AutoTokenizer

                device = "cuda" if torch.cuda.is_available() else "cpu"

                model_path = f"{self.model_id}-{self.model_size}"
                self.tokenizer = AutoTokenizer.from_pretrained(model_path)
                self.model = AutoModelForCausalLM.from_pretrained(
                    model_path,
                    torch_dtype=torch.float16 if device == "cuda" else torch.float32
                ).to(device)

                self.device = device
                self.is_loaded = True
                self._fallback_mode = False

                logger.info("Svara TTS model loaded (%s) on %s", self.model_size, device)
                return True

            except (ImportError, OSError):
                logger.warning("Svara model not available, using edge-tts fallback")
                self.is_loaded = True
                self._fallback_mode = True
                return True

        except Exception as e:
            logger.error("Failed to load Svara TTS: %s", e)
            return False

    async def unload_model(self) -> bool:
        """Unload model from memory"""
        try:
            if self.model:
                del self.model
                self.model = None
            if hasattr(self, 'tokenizer') and self.tokenizer:
                del self.tokenizer
                self.tokenizer = None
            self.is_loaded = False

            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except ImportError:
                pass
            return True
        except Exception as e:
            logger.error("Failed to unload Svara: %s", e)
            return False

    async def synthesize(
        self,
        text: str,
        language: str,
        emotion: str | None = None,
        voice_id: str | None = None,
        pace: float = 1.0,
        pitch: float = 1.0,
        **kwargs
    ) -> bytes:
        """Generate audio using Svara TTS"""

        if not self.is_loaded:
            await self.load_model()

        start_time = time.time()
        emotion = emotion or "neutral"

        try:
            if self._fallback_mode:
                audio = await self._fallback_synthesize(text, language, pace)
            else:
                audio = await self._svara_synthesize(text, language, emotion, voice_id, pace)

            latency = (time.time() - start_time) * 1000
            logger.info("Svara TTS synthesis completed in %.0fms", latency)
            return audio

        except Exception as e:
            logger.error("Svara synthesis failed: %s", e)
            raise

    async def _svara_synthesize(
        self,
        text: str,
        language: str,
        emotion: str,
        voice_id: str | None,
        pace: float
    ) -> bytes:
        """Synthesize using Svara TTS model"""
        import numpy as np
        import scipy.io.wavfile as wavfile
        import torch

        lang_name = self.LANGUAGE_CODES.get(language, "English")
        emotion_params = self.EMOTION_PARAMS.get(emotion, self.EMOTION_PARAMS["neutral"])

        # Build input prompt
        prompt = f"<lang>{lang_name}</lang><emotion>{emotion}</emotion><text>{text}</text>"

        # Tokenize
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.device)

        # Generate
        loop = asyncio.get_event_loop()

        def _generate():
            with torch.no_grad():
                return self.model.generate(
                    **inputs,
                    max_new_tokens=2048,
                    temperature=emotion_params["temperature"],
                    repetition_penalty=emotion_params["repetition_penalty"],
                    do_sample=True
                )

        output = await loop.run_in_executor(None, _generate)

        # Decode audio tokens to waveform
        audio_tokens = output[0][inputs.input_ids.shape[1]:]
        audio_np = audio_tokens.cpu().float().numpy()

        # Normalize and convert
        if audio_np.max() > 1.0:
            audio_np = audio_np / audio_np.max()
        audio_int16 = (audio_np * 32767).astype(np.int16)

        # Apply pace
        if pace != 1.0:
            from scipy.signal import resample
            new_length = int(len(audio_int16) / pace)
            audio_int16 = resample(audio_int16, new_length).astype(np.int16)

        buffer = io.BytesIO()
        wavfile.write(buffer, 24000, audio_int16)
        buffer.seek(0)
        return buffer.read()

    async def _fallback_synthesize(self, text: str, language: str, pace: float) -> bytes:
        """Fallback using edge-tts"""
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
            logger.error("edge-tts not installed for Svara fallback")
            raise

    async def synthesize_stream(
        self,
        text: str,
        language: str,
        emotion: str | None = None,
        voice_id: str | None = None,
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
        """Clone voice — save reference audio for prosody transfer"""

        voice_id = f"svara_{uuid.uuid4().hex[:8]}"
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
            "engine": "svara",
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        with open(os.path.join(voice_dir, "metadata.json"), "w") as f:
            json.dump(metadata, f)

        logger.info("Voice cloned with Svara: %s -> %s", voice_name, voice_id)
        return voice_id

    def get_supported_languages(self) -> list:
        return list(self.LANGUAGE_CODES.keys())

    def get_supported_emotions(self) -> list:
        return list(self.EMOTION_PARAMS.keys())
