"""
ElevenLabs Turbo v2.5 TTS Engine
MOS 4.8 — Best quality English + multilingual TTS
Streaming supported, voice cloning via ElevenLabs API
"""

import logging
import os

import aiohttp

from tts.engines.base import BaseTTSEngine

logger = logging.getLogger(__name__)

# Default ElevenLabs voice IDs — Indian-accented English
_VOICE_MAP: dict[str, str] = {
    "priya":   "21m00Tcm4TlvDq8ikWAM",   # Rachel — warm Indian-accented EN
    "meera":   "AZnzlk1XvdvUeBnXmlld",   # Domi — friendly female
    "leda":    "EXAVITQu4vr4xnSDxMaL",   # Bella — professional female
    "arjun":   "ErXwobaYiN019PkySvjV",   # Antoni — confident male
    "arun":    "VR6AewLTigWG4xSOukaG",   # Arnold — authoritative male
    "nova":    "pNInz6obpgDQGcFmaJgB",   # Adam — neutral male
    "default": "21m00Tcm4TlvDq8ikWAM",
}

# Emotion → voice_settings mapping
# stability:        0 = very expressive / variable, 1 = flat / consistent
# similarity_boost: 0 = creative, 1 = close to reference voice
# style:            0 = no style, 1 = max style exaggeration
_EMOTION_SETTINGS: dict[str, dict] = {
    "neutral":    {"stability": 0.65, "similarity_boost": 0.80, "style": 0.15},
    "happy":      {"stability": 0.55, "similarity_boost": 0.75, "style": 0.30},
    "sad":        {"stability": 0.80, "similarity_boost": 0.85, "style": 0.06},
    "angry":      {"stability": 0.72, "similarity_boost": 0.80, "style": 0.12},
    "empathetic": {"stability": 0.75, "similarity_boost": 0.82, "style": 0.08},
    "excited":    {"stability": 0.50, "similarity_boost": 0.73, "style": 0.40},
    "calm":       {"stability": 0.82, "similarity_boost": 0.85, "style": 0.05},
    "narration":  {"stability": 0.70, "similarity_boost": 0.78, "style": 0.20},
    "news":       {"stability": 0.75, "similarity_boost": 0.82, "style": 0.12},
    "conversation": {"stability": 0.62, "similarity_boost": 0.78, "style": 0.18},
}


class ElevenLabsEngine(BaseTTSEngine):
    """ElevenLabs Turbo v2.5 — Premium TTS engine.

    Requires ELEVENLABS_API_KEY env var.
    Uses eleven_turbo_v2_5 model for best quality + speed balance.
    Outputs PCM 22050 Hz for direct phone delivery.
    """

    @property
    def engine_name(self) -> str:
        return "elevenlabs"

    async def load_model(self) -> bool:
        self.api_key = os.getenv("ELEVENLABS_API_KEY", "")
        if not self.api_key:
            logger.warning("ELEVENLABS_API_KEY not set — ElevenLabs engine unavailable")
            return False
        self.model_id = self.config.get("model_id", "eleven_turbo_v2_5")
        self.api_base = self.config.get("api_base", "https://api.elevenlabs.io/v1")
        self.is_loaded = True
        logger.info("ElevenLabs engine loaded (model=%s)", self.model_id)
        return True

    async def unload_model(self) -> bool:
        self.is_loaded = False
        return True

    def _resolve_voice(self, voice_id: str | None) -> str:
        if not voice_id:
            return _VOICE_MAP["default"]
        # If it's already an ElevenLabs UUID (26 chars alphanumeric), use directly
        if len(voice_id) >= 20 and voice_id.replace("-", "").isalnum():
            return voice_id
        return _VOICE_MAP.get(voice_id.lower(), _VOICE_MAP["default"])

    def _emotion_settings(self, emotion: str | None) -> dict:
        return _EMOTION_SETTINGS.get(emotion or "neutral", _EMOTION_SETTINGS["neutral"])

    async def synthesize(
        self,
        text: str,
        language: str,
        emotion: str | None = None,
        voice_id: str | None = None,
        pace: float = 1.0,
        pitch: float = 1.0,
        **kwargs,
    ) -> bytes:
        vid = self._resolve_voice(voice_id)
        settings = self._emotion_settings(emotion)
        stability = kwargs.get("stability", settings["stability"])
        similarity = kwargs.get("similarity_boost", settings["similarity_boost"])
        style = kwargs.get("style", settings["style"])

        url = f"{self.api_base}/text-to-speech/{vid}"
        payload = {
            "text": text,
            "model_id": self.model_id,
            "voice_settings": {
                "stability": stability,
                "similarity_boost": similarity,
                "style": style,
                "use_speaker_boost": True,
                "speed": max(0.7, min(1.3, pace)),
            },
            "output_format": "pcm_22050",
        }
        headers = {
            "xi-api-key": self.api_key,
            "Content-Type": "application/json",
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    raise RuntimeError(f"ElevenLabs error {resp.status}: {body[:200]}")
                return await resp.read()

    async def synthesize_stream(
        self,
        text: str,
        language: str,
        emotion: str | None = None,
        voice_id: str | None = None,
        pace: float = 1.0,
        pitch: float = 1.0,
        **kwargs,
    ):
        vid = self._resolve_voice(voice_id)
        settings = self._emotion_settings(emotion)

        url = f"{self.api_base}/text-to-speech/{vid}/stream"
        payload = {
            "text": text,
            "model_id": self.model_id,
            "voice_settings": {
                "stability": kwargs.get("stability", settings["stability"]),
                "similarity_boost": kwargs.get("similarity_boost", settings["similarity_boost"]),
                "style": kwargs.get("style", settings["style"]),
                "use_speaker_boost": True,
                "speed": max(0.7, min(1.3, pace)),
            },
            "output_format": "pcm_22050",
        }
        headers = {
            "xi-api-key": self.api_key,
            "Content-Type": "application/json",
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    raise RuntimeError(f"ElevenLabs stream error {resp.status}: {body[:200]}")
                async for chunk in resp.content.iter_chunked(4096):
                    yield chunk

    async def clone_voice(
        self,
        reference_audio: bytes,
        voice_name: str,
        language: str,
    ) -> str:
        """Clone a voice via ElevenLabs /voices/add API."""
        url = f"{self.api_base}/voices/add"
        form = aiohttp.FormData()
        form.add_field("name", voice_name)
        form.add_field(
            "files",
            reference_audio,
            filename="reference.wav",
            content_type="audio/wav",
        )
        headers = {"xi-api-key": self.api_key}
        async with aiohttp.ClientSession() as session:
            async with session.post(url, data=form, headers=headers) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    raise RuntimeError(f"ElevenLabs clone error {resp.status}: {body[:200]}")
                data = await resp.json()
                return data.get("voice_id", "")

    def get_supported_languages(self) -> list:
        return self.config.get("languages", ["en"])

    def get_supported_emotions(self) -> list:
        return list(_EMOTION_SETTINGS.keys())
