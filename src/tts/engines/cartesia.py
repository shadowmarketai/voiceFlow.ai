"""
Cartesia Sonic-2 TTS Engine
MOS 4.7 — Ultra-low latency English TTS (80ms TTFA)
Best choice for real-time phone agents where latency is critical
"""

import logging
import os

import aiohttp

from tts.engines.base import BaseTTSEngine

logger = logging.getLogger(__name__)

# Cartesia pre-built voice IDs — Indian-accented English
_VOICE_MAP: dict[str, str] = {
    "priya":   "694f9389-aac1-45b6-b726-9d9369183238",
    "meera":   "156fb8d2-335b-4950-9cb3-a2d33befec77",
    "arjun":   "a0e99841-438c-4a64-b679-ae501e7d6091",
    "arun":    "79a125e8-cd45-4c13-8a67-188112f4dd22",
    "default": "694f9389-aac1-45b6-b726-9d9369183238",
}

# Cartesia speed adjustments per emotion
# Speed: 0.5 (slowest) – 2.0 (fastest), default 1.0
_EMOTION_SPEED: dict[str, float] = {
    "neutral":    1.00,
    "happy":      1.05,
    "excited":    1.10,
    "sad":        0.88,
    "angry":      0.92,
    "empathetic": 0.90,
    "calm":       0.88,
    "narration":  0.95,
    "news":       1.00,
    "conversation": 1.00,
}

_CARTESIA_VERSION = "2024-06-10"


class CartesiaEngine(BaseTTSEngine):
    """Cartesia Sonic-2 — Ultra-low-latency English TTS.

    Requires CARTESIA_API_KEY env var.
    Outputs raw PCM s16le 22050 Hz for direct phone delivery.
    Best used as: English real-time agents, IVR, lead qualifiers.
    """

    @property
    def engine_name(self) -> str:
        return "cartesia"

    async def load_model(self) -> bool:
        self.api_key = os.getenv("CARTESIA_API_KEY", "")
        if not self.api_key:
            logger.warning("CARTESIA_API_KEY not set — Cartesia engine unavailable")
            return False
        self.model_id = self.config.get("model_id", "sonic-2")
        self.api_base = self.config.get("api_base", "https://api.cartesia.ai")
        self.is_loaded = True
        logger.info("Cartesia engine loaded (model=%s)", self.model_id)
        return True

    async def unload_model(self) -> bool:
        self.is_loaded = False
        return True

    def _resolve_voice(self, voice_id: str | None) -> str:
        if not voice_id:
            return _VOICE_MAP["default"]
        # If it already looks like a UUID, use directly
        if len(voice_id) == 36 and voice_id.count("-") == 4:
            return voice_id
        return _VOICE_MAP.get(voice_id.lower(), _VOICE_MAP["default"])

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
        emotion_speed = _EMOTION_SPEED.get(emotion or "neutral", 1.0)
        speed = max(0.5, min(2.0, emotion_speed * pace))
        lang_code = (language or "en").lower()[:2]

        url = f"{self.api_base}/tts/bytes"
        payload = {
            "model_id": self.model_id,
            "transcript": text,
            "voice": {"mode": "id", "id": vid},
            "output_format": {
                "container": "raw",
                "encoding": "pcm_s16le",
                "sample_rate": 22050,
            },
            "language": lang_code,
            "speed": speed,
        }
        headers = {
            "X-API-Key": self.api_key,
            "Cartesia-Version": _CARTESIA_VERSION,
            "Content-Type": "application/json",
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    raise RuntimeError(f"Cartesia error {resp.status}: {body[:200]}")
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
        emotion_speed = _EMOTION_SPEED.get(emotion or "neutral", 1.0)
        speed = max(0.5, min(2.0, emotion_speed * pace))
        lang_code = (language or "en").lower()[:2]

        url = f"{self.api_base}/tts/sse"
        payload = {
            "model_id": self.model_id,
            "transcript": text,
            "voice": {"mode": "id", "id": vid},
            "output_format": {
                "container": "raw",
                "encoding": "pcm_s16le",
                "sample_rate": 22050,
            },
            "language": lang_code,
            "speed": speed,
            "stream": True,
        }
        headers = {
            "X-API-Key": self.api_key,
            "Cartesia-Version": _CARTESIA_VERSION,
            "Content-Type": "application/json",
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    raise RuntimeError(f"Cartesia stream error {resp.status}: {body[:200]}")
                async for chunk in resp.content.iter_chunked(4096):
                    yield chunk

    async def clone_voice(
        self,
        reference_audio: bytes,
        voice_name: str,
        language: str,
    ) -> str:
        # Cartesia uses pre-built voices; voice cloning is handled by ElevenLabs.
        # Return empty to signal unsupported — caller falls back to ElevenLabs clone.
        logger.info("Cartesia does not support voice cloning — delegate to ElevenLabs")
        return ""

    def get_supported_languages(self) -> list:
        return self.config.get("languages", ["en"])

    def get_supported_emotions(self) -> list:
        return list(_EMOTION_SPEED.keys())
