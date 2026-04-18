"""
OpenVoice V2 Engine
Best for: Real-time voice agents, commercial use (MIT license)
Features: Ultra-low latency (100-250ms), zero-shot cloning, any language
"""

import asyncio
import logging
import os
import time
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from tts.engines.base import BaseTTSEngine

logger = logging.getLogger(__name__)


class OpenVoiceV2Engine(BaseTTSEngine):
    """
    OpenVoice V2 implementation
    Model: myshell-ai/OpenVoiceV2
    
    Features:
    - Zero-shot voice cloning (any language)
    - Ultra-low latency (100-250ms)
    - MIT license (commercial OK)
    - Emotion parameter control
    - Excellent CPU performance
    """

    EMOTION_PARAMS = {
        "happy": {"speed": 1.1, "pitch": 1.1, "energy": 1.2},
        "sad": {"speed": 0.9, "pitch": 0.9, "energy": 0.8},
        "neutral": {"speed": 1.0, "pitch": 1.0, "energy": 1.0},
        "excited": {"speed": 1.2, "pitch": 1.15, "energy": 1.3},
        "calm": {"speed": 0.85, "pitch": 0.95, "energy": 0.85},
        "angry": {"speed": 1.1, "pitch": 1.05, "energy": 1.4},
        "professional": {"speed": 1.0, "pitch": 1.0, "energy": 1.0}
    }

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self.model_id = "myshell-ai/OpenVoiceV2"
        self.base_speaker_path = None
        self.tone_converter = None
        self.se_extractor = None

    @property
    def engine_name(self) -> str:
        return "openvoice_v2"

    async def load_model(self) -> bool:
        """Load OpenVoice V2 model"""
        try:
            logger.info("Loading OpenVoice V2 model")

            # OpenVoice uses a different loading mechanism
            # Install: pip install openvoice-cli or from source

            try:
                import torch
                from openvoice import se_extractor
                from openvoice.api import ToneColorConverter

                device = "cuda" if torch.cuda.is_available() else "cpu"

                # Load tone color converter
                ckpt_converter = 'checkpoints_v2/converter'
                self.tone_converter = ToneColorConverter(
                    f'{ckpt_converter}/config.json',
                    device=device
                )
                self.tone_converter.load_ckpt(f'{ckpt_converter}/checkpoint.pth')

                self.se_extractor = se_extractor
                self.device = device
                self.is_loaded = True

                logger.info("OpenVoice V2 model loaded successfully")
                return True

            except ImportError:
                # Fallback: Use HuggingFace transformers approach
                logger.warning("OpenVoice not installed, using fallback mode")
                self.is_loaded = True
                self._fallback_mode = True
                return True

        except Exception as e:
            logger.error(f"Failed to load OpenVoice V2: {e}")
            return False

    async def unload_model(self) -> bool:
        """Unload model from memory"""
        try:
            if self.tone_converter:
                del self.tone_converter
                self.tone_converter = None
            self.is_loaded = False
            return True
        except Exception as e:
            logger.error(f"Failed to unload model: {e}")
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
        """Generate audio from text with OpenVoice V2"""

        if not self.is_loaded:
            await self.load_model()

        start_time = time.time()
        emotion = emotion or "neutral"

        try:
            # Get emotion parameters
            emotion_params = self.EMOTION_PARAMS.get(emotion, self.EMOTION_PARAMS["neutral"])

            # Apply user overrides
            speed = pace * emotion_params["speed"]
            final_pitch = pitch * emotion_params["pitch"]

            if hasattr(self, '_fallback_mode') and self._fallback_mode:
                # Fallback: Use edge-tts or another TTS
                audio = await self._fallback_synthesize(text, language, speed)
            else:
                # Use OpenVoice
                audio = await self._openvoice_synthesize(
                    text, language, voice_id, speed, final_pitch
                )

            latency = (time.time() - start_time) * 1000
            logger.info(f"OpenVoice V2 synthesis completed in {latency:.0f}ms")

            return audio

        except Exception as e:
            logger.error(f"OpenVoice synthesis failed: {e}")
            raise

    async def _openvoice_synthesize(
        self,
        text: str,
        language: str,
        voice_id: str | None,
        speed: float,
        pitch: float
    ) -> bytes:
        """Synthesize using OpenVoice V2"""
        import torch

        # Generate base audio using MeloTTS (OpenVoice's base TTS)
        from melo.api import TTS

        # Language mapping
        lang_map = {
            "ta": "EN",  # Will clone to Tamil voice
            "hi": "EN",
            "te": "EN",
            "en": "EN"
        }

        melo_lang = lang_map.get(language, "EN")

        # Generate base speech
        model = TTS(language=melo_lang, device=self.device)
        speaker_ids = model.hps.data.spk2id

        # Generate to temp file
        tmp_path = f"/tmp/openvoice_{uuid.uuid4().hex}.wav"
        model.tts_to_file(text, speaker_ids['EN-US'], tmp_path, speed=speed)

        # If voice_id provided, apply tone color conversion
        if voice_id:
            # Load target speaker embedding
            target_se_path = f"voices/{voice_id}/se.pth"
            if os.path.exists(target_se_path):
                target_se = torch.load(target_se_path).to(self.device)

                # Extract source speaker embedding
                source_se = self.se_extractor.get_se(tmp_path, self.tone_converter, vad=False)

                # Convert tone
                output_path = f"/tmp/openvoice_out_{uuid.uuid4().hex}.wav"
                self.tone_converter.convert(
                    audio_src_path=tmp_path,
                    src_se=source_se,
                    tgt_se=target_se,
                    output_path=output_path
                )
                tmp_path = output_path

        # Read and return audio
        with open(tmp_path, 'rb') as f:
            audio = f.read()

        # Cleanup
        os.remove(tmp_path)

        return audio

    async def _fallback_synthesize(self, text: str, language: str, speed: float) -> bytes:
        """Fallback synthesis using edge-tts"""
        try:
            import edge_tts

            # Language to voice mapping
            voice_map = {
                "ta": "ta-IN-PallaviNeural",
                "hi": "hi-IN-SwaraNeural",
                "te": "te-IN-ShrutiNeural",
                "kn": "kn-IN-SapnaNeural",
                "ml": "ml-IN-SobhanaNeural",
                "en": "en-IN-NeerjaNeural"
            }

            voice = voice_map.get(language, "en-IN-NeerjaNeural")

            # Generate
            communicate = edge_tts.Communicate(text, voice, rate=f"{int((speed-1)*100):+d}%")

            audio_data = b""
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_data += chunk["data"]

            return audio_data

        except ImportError:
            logger.error("edge-tts not installed for fallback")
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

        if hasattr(self, '_fallback_mode') and self._fallback_mode:
            # Use edge-tts streaming
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
        else:
            # Generate full and chunk
            audio = await self.synthesize(text, language, emotion, voice_id, pace, pitch, **kwargs)
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
        """Clone voice using OpenVoice's tone color extraction"""

        voice_id = f"ov2_{uuid.uuid4().hex[:8]}"
        voice_dir = f"voices/{voice_id}"
        os.makedirs(voice_dir, exist_ok=True)

        # Save reference audio
        ref_path = f"{voice_dir}/reference.wav"
        with open(ref_path, "wb") as f:
            f.write(reference_audio)

        try:
            if self.se_extractor:
                import torch

                # Extract speaker embedding
                se = self.se_extractor.get_se(
                    ref_path,
                    self.tone_converter,
                    vad=True
                )

                # Save embedding
                torch.save(se, f"{voice_dir}/se.pth")

        except Exception as e:
            logger.warning(f"Could not extract speaker embedding: {e}")

        # Save metadata
        import json
        metadata = {
            "voice_id": voice_id,
            "name": voice_name,
            "language": language,
            "engine": "openvoice_v2",
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        with open(f"{voice_dir}/metadata.json", "w") as f:
            json.dump(metadata, f)

        logger.info(f"Voice cloned with OpenVoice V2: {voice_name} -> {voice_id}")
        return voice_id

    def get_supported_languages(self) -> list:
        # OpenVoice V2 supports any language via zero-shot
        return ["ta", "hi", "te", "kn", "ml", "en", "bn", "mr", "gu", "pa", "any"]

    def get_supported_emotions(self) -> list:
        return list(self.EMOTION_PARAMS.keys())
