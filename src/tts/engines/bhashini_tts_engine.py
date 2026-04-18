"""
Bhashini / IITM TTS Engine — Proper TTSEngine wrapper
======================================================
Wraps the Bhashini Dhruva API (government-hosted AI4Bharat IndicTTS) as a
full BaseTTSEngine so it can be selected by the TTS service, used in
fallback chains, and called from the dashboard like any other engine.

Coverage: 22+ languages via Bhashini API (all languages supported by
          AI4Bharat IndicTTS through Dhruva).

Voices  : male / female per language (controlled via `gender` kwarg).
          Internally maps `voice_id` prefixes: "m_" → male, "f_" → female.

Requires: BHASHINI_USER_ID + BHASHINI_API_KEY env vars (free registration at
          https://bhashini.gov.in/ulca/user/register)

Falls back to edge-tts when Bhashini is not configured.
"""

from __future__ import annotations

import base64
import io
import logging
import os
import wave
from collections.abc import AsyncGenerator
from typing import Any

import httpx

from tts.engines.base import BaseTTSEngine

logger = logging.getLogger(__name__)

_BHASHINI_URL = "https://dhruva-api.bhashini.gov.in/services/inference/pipeline"

# Service IDs — Dravidian and Indo-Aryan groups
_SERVICE_IDS: dict[str, str] = {
    # Dravidian
    "ta": "ai4bharat/indic-tts-coqui-dravidian-gpu--t4",
    "te": "ai4bharat/indic-tts-coqui-dravidian-gpu--t4",
    "kn": "ai4bharat/indic-tts-coqui-dravidian-gpu--t4",
    "ml": "ai4bharat/indic-tts-coqui-dravidian-gpu--t4",
    # Indo-Aryan
    "hi": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "mr": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "bn": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "gu": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "pa": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "or": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "as": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    # Others via Indo-Aryan endpoint
    "en": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "sa": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "bodo":      "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "dogri":     "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "kashmiri":  "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "konkani":   "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "maithili":  "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "manipuri":  "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "nepali":    "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "sindhi":    "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
}

_SUPPORTED_LANGS = set(_SERVICE_IDS.keys())

# edge-tts voice map for fallback
_EDGE_VOICE_MAP: dict[str, dict[str, str]] = {
    "ta": {"female": "ta-IN-PallaviNeural",  "male": "ta-IN-ValluvarNeural"},
    "hi": {"female": "hi-IN-SwaraNeural",    "male": "hi-IN-MadhurNeural"},
    "te": {"female": "te-IN-ShrutiNeural",   "male": "te-IN-MohanNeural"},
    "kn": {"female": "kn-IN-SapnaNeural",    "male": "kn-IN-GaganNeural"},
    "ml": {"female": "ml-IN-SobhanaNeural",  "male": "ml-IN-MidhunNeural"},
    "mr": {"female": "mr-IN-AarohiNeural",   "male": "mr-IN-ManoharNeural"},
    "bn": {"female": "bn-IN-TanishaaNeural", "male": "bn-IN-BashkarNeural"},
    "gu": {"female": "gu-IN-DhwaniNeural",   "male": "gu-IN-NiranjanNeural"},
    "pa": {"female": "pa-IN-OjasNeural",     "male": "pa-IN-OjasNeural"},
}


class BhashiniTTSEngine(BaseTTSEngine):
    """
    Bhashini / IITM TTS Engine — AI4Bharat IndicTTS via Dhruva API.

    22+ Indian languages, male + female voices per language.
    Returns 8 kHz PCM WAV (suitable for telephony / Twilio directly).
    Wraps raw PCM in a WAV header so downstream consumers see a valid WAV file.
    Falls back to edge-tts when Bhashini credentials are absent.
    """

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self._uid = os.getenv("BHASHINI_USER_ID", "")
        self._key = os.getenv("BHASHINI_API_KEY", "")
        self._mode: str = "unloaded"   # "api" | "edge"

    # ── Identity ─────────────────────────────────────────────────────────────

    @property
    def engine_name(self) -> str:
        return "bhashini"

    def get_supported_languages(self) -> list:
        return sorted(_SUPPORTED_LANGS)

    def get_supported_emotions(self) -> list:
        # Bhashini IndicTTS has no emotion parameter — controlled via text style
        return ["neutral"]

    # ── Lifecycle ────────────────────────────────────────────────────────────

    async def load_model(self) -> bool:
        if self._uid and self._key:
            self._mode = "api"
            self.is_loaded = True
            logger.info("[BhashiniTTS] Using Bhashini Dhruva API — %d languages", len(_SUPPORTED_LANGS))
            return True

        try:
            import edge_tts  # noqa: F401
            self._mode = "edge"
            self.is_loaded = True
            logger.warning(
                "[BhashiniTTS] BHASHINI_USER_ID/BHASHINI_API_KEY not set — "
                "using edge-tts fallback. Register FREE at bhashini.gov.in/ulca/user/register"
            )
            return True
        except ImportError:
            logger.error("[BhashiniTTS] Neither Bhashini credentials nor edge-tts available")
            return False

    async def unload_model(self) -> bool:
        self.is_loaded = False
        self._mode = "unloaded"
        return True

    # ── Synthesis ────────────────────────────────────────────────────────────

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
        lang   = language[:2].lower() if language else "ta"
        gender = self._resolve_gender(voice_id, kwargs.get("gender", "female"))

        if self._mode == "api":
            return await self._call_bhashini(text, lang, gender)
        return await self._edge_fallback(text, lang, gender)

    async def synthesize_stream(
        self,
        text: str,
        language: str,
        emotion: str | None = None,
        voice_id: str | None = None,
        pace: float = 1.0,
        pitch: float = 1.0,
        **kwargs,
    ) -> AsyncGenerator[bytes, None]:
        audio = await self.synthesize(text, language, emotion, voice_id, pace, pitch, **kwargs)
        chunk_size = 4096
        for i in range(0, len(audio), chunk_size):
            yield audio[i : i + chunk_size]

    # ── Bhashini API call ────────────────────────────────────────────────────

    async def _call_bhashini(self, text: str, lang: str, gender: str) -> bytes:
        service_id = _SERVICE_IDS.get(lang, _SERVICE_IDS["hi"])
        payload = {
            "pipelineTasks": [
                {
                    "taskType": "tts",
                    "config": {
                        "language":     {"sourceLanguage": lang},
                        "serviceId":    service_id,
                        "gender":       gender,
                        "samplingRate": 8000,
                    },
                }
            ],
            "inputData": {"input": [{"source": text}]},
        }
        headers = {
            "Authorization": self._key,
            "userID":        self._uid,
            "Content-Type":  "application/json",
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(_BHASHINI_URL, json=payload, headers=headers)
            resp.raise_for_status()

        data = resp.json()
        audio_b64 = (
            data.get("pipelineResponse", [{}])[0]
            .get("audio", [{}])[0]
            .get("audioContent", "")
        )
        if not audio_b64:
            raise RuntimeError(f"Bhashini TTS returned empty audio for lang={lang}")

        raw = base64.b64decode(audio_b64)
        return self._ensure_wav(raw, sample_rate=8000)

    # ── edge-tts fallback ────────────────────────────────────────────────────

    async def _edge_fallback(self, text: str, lang: str, gender: str) -> bytes:
        import edge_tts

        voices = _EDGE_VOICE_MAP.get(lang, {"female": "en-IN-NeerjaNeural", "male": "en-IN-PrabhatNeural"})
        voice  = voices.get(gender, voices["female"])

        buf = io.BytesIO()
        communicate = edge_tts.Communicate(text, voice)
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buf.write(chunk["data"])
        return buf.getvalue()

    # ── Voice cloning (not supported) ────────────────────────────────────────

    async def clone_voice(
        self, reference_audio: bytes, voice_name: str, language: str
    ) -> str:
        raise NotImplementedError(
            "Bhashini TTS does not support voice cloning. Use IndicF5 or OpenVoice V2."
        )

    # ── Helpers ──────────────────────────────────────────────────────────────

    @staticmethod
    def _resolve_gender(voice_id: str | None, default: str) -> str:
        """
        Resolve gender from voice_id prefix convention:
          "m_<anything>" → "male"
          "f_<anything>" → "female"
          None / unknown → default
        """
        if voice_id:
            if voice_id.startswith("m_"):
                return "male"
            if voice_id.startswith("f_"):
                return "female"
        return default if default in ("male", "female") else "female"

    @staticmethod
    def _ensure_wav(data: bytes, sample_rate: int = 8000) -> bytes:
        """Wrap raw PCM in WAV header if not already a valid WAV."""
        if data[:4] == b"RIFF":
            return data
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            wf.writeframes(data)
        return buf.getvalue()
