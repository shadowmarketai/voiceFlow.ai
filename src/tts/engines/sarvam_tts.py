"""
Sarvam AI TTS Engine — bulbul:v2
MOS 4.4 — Best API-based Indian language TTS (no GPU required)
Supports: Tamil, Hindi, Telugu, Kannada, Malayalam, Bengali, Marathi, Gujarati, Punjabi, Odia, English-IN
"""

import base64
import logging
import os

import aiohttp

from tts.engines.base import BaseTTSEngine

logger = logging.getLogger(__name__)

_LANG_MAP: dict[str, str] = {
    "ta": "ta-IN", "hi": "hi-IN", "te": "te-IN", "kn": "kn-IN",
    "ml": "ml-IN", "bn": "bn-IN", "mr": "mr-IN", "gu": "gu-IN",
    "pa": "pa-IN", "or": "or-IN", "en": "en-IN",
}

# Default speaker per language locale (Sarvam built-in voices)
_SPEAKER_MAP: dict[str, str] = {
    "ta-IN": "anushka",
    "hi-IN": "abhilash",
    "te-IN": "arya",
    "kn-IN": "priya",
    "ml-IN": "manisha",
    "bn-IN": "neha",
    "mr-IN": "kavya",
    "gu-IN": "ritu",
    "pa-IN": "hitesh",
    "or-IN": "aditya",
    "en-IN": "vidya",
}

# Sarvam TTS does not expose emotion directly — pace is the main control
_EMOTION_PACE: dict[str, float] = {
    "neutral":    1.0,
    "happy":      1.05,
    "excited":    1.10,
    "sad":        0.88,
    "angry":      0.90,
    "empathetic": 0.88,
    "calm":       0.85,
    "narration":  0.92,
    "conversation": 1.0,
}


class SarvamTTSEngine(BaseTTSEngine):
    """Sarvam AI bulbul:v2 — Best Indian language TTS via API.

    Requires SARVAM_API_KEY env var.
    Returns WAV audio, no GPU required.
    """

    @property
    def engine_name(self) -> str:
        return "sarvam_tts"

    async def load_model(self) -> bool:
        self.api_key = os.getenv("SARVAM_API_KEY", "")
        if not self.api_key:
            logger.warning("SARVAM_API_KEY not set — Sarvam TTS engine unavailable")
            return False
        self.api_base = self.config.get("api_base", "https://api.sarvam.ai/text-to-speech")
        self.model_id = self.config.get("model_id", "bulbul:v2")
        self.is_loaded = True
        logger.info("Sarvam TTS engine loaded (model=%s)", self.model_id)
        return True

    async def unload_model(self) -> bool:
        self.is_loaded = False
        return True

    def _auth_headers(self) -> dict:
        # New sk_... keys use Bearer; legacy keys use API-Subscription-Key
        if self.api_key.startswith("sk_"):
            return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        return {"API-Subscription-Key": self.api_key, "Content-Type": "application/json"}

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
        lang_code = (language or "hi").lower()[:2]
        sarvam_lang = _LANG_MAP.get(lang_code, "hi-IN")
        speaker = voice_id or _SPEAKER_MAP.get(sarvam_lang, "anushka")

        emotion_pace = _EMOTION_PACE.get(emotion or "neutral", 1.0)
        final_pace = max(0.5, min(2.0, emotion_pace * pace))

        payload = {
            "inputs": [text],
            "target_language_code": sarvam_lang,
            "speaker": speaker,
            "model": self.model_id,
            "pace": final_pace,
            "loudness": 1.0,
            "enable_preprocessing": True,
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(
                self.api_base,
                headers=self._auth_headers(),
                json=payload,
            ) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    raise RuntimeError(f"Sarvam TTS error {resp.status}: {body[:200]}")
                data = await resp.json()

        audio_b64 = data.get("audios", [""])[0]
        if not audio_b64:
            raise RuntimeError("Sarvam TTS returned empty audio")
        return base64.b64decode(audio_b64)

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
        # Sarvam TTS is batch-only — yield the full result as a single chunk
        audio_bytes = await self.synthesize(text, language, emotion, voice_id, pace, pitch, **kwargs)
        yield audio_bytes

    async def clone_voice(
        self,
        reference_audio: bytes,
        voice_name: str,
        language: str,
    ) -> str:
        # Sarvam TTS uses pre-built speakers, no custom voice cloning
        logger.info("Sarvam TTS does not support custom voice cloning")
        return ""

    def get_supported_languages(self) -> list:
        return list(_LANG_MAP.keys())

    def get_supported_emotions(self) -> list:
        return list(_EMOTION_PACE.keys())
