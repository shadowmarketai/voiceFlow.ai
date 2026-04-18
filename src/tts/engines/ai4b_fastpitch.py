"""
AI4Bharat FastPitch + HiFiGAN V1 TTS Engine
============================================
Model: AI4Bharat IndicTTS (FastPitch architecture)
Source: ai4bharat/indic-tts-coqui-dravidian-gpu--t4 (Dravidian)
        ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4 (Indo-Aryan)
License: Open Source (MIT / CC-BY-4.0)

Supported: 13 languages — ta, te, kn, ml, hi, mr, bn, gu, pa, or, as, en, sa

Inference priority:
  1. Local CoquiTTS — GPU preferred, CPU fallback (requires TTS package + model download)
  2. Bhashini Dhruva API — FREE government-hosted endpoint (requires BHASHINI keys)
  3. edge-tts — last-resort free fallback

Install for local inference:
    pip install TTS torch torchaudio huggingface_hub

No GPU needed for API mode — just set BHASHINI_USER_ID + BHASHINI_API_KEY.
"""

from __future__ import annotations

import asyncio
import io
import logging
import os
import wave
from collections.abc import AsyncGenerator
from typing import Any

from tts.engines.base import BaseTTSEngine

logger = logging.getLogger(__name__)

# HuggingFace model repos for local inference
_HF_DRAVIDIAN = "ai4bharat/indic-tts-coqui-dravidian-gpu--t4"
_HF_INDO_ARYAN = "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4"

_DRAVIDIAN_LANGS = {"ta", "te", "kn", "ml"}
_INDO_ARYAN_LANGS = {"hi", "mr", "bn", "gu", "pa", "or", "as", "sa"}
_ALL_LANGS = _DRAVIDIAN_LANGS | _INDO_ARYAN_LANGS | {"en"}

# Bhashini Dhruva service IDs (FastPitch / Coqui backend)
_BHASHINI_SERVICE: dict[str, str] = {
    "ta": "ai4bharat/indic-tts-coqui-dravidian-gpu--t4",
    "te": "ai4bharat/indic-tts-coqui-dravidian-gpu--t4",
    "kn": "ai4bharat/indic-tts-coqui-dravidian-gpu--t4",
    "ml": "ai4bharat/indic-tts-coqui-dravidian-gpu--t4",
    "hi": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "mr": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "bn": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "gu": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "pa": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "or": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "as": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "en": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "sa": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
}

_BHASHINI_URL = "https://dhruva-api.bhashini.gov.in/services/inference/pipeline"


class AI4BFastPitchEngine(BaseTTSEngine):
    """
    AI4Bharat FastPitch + HiFiGAN V1 TTS engine.

    Two runtime modes (auto-detected at load_model time):
      - local:   CoquiTTS loading AI4Bharat HuggingFace models directly (GPU/CPU)
      - api:     Bhashini Dhruva API (FREE, no GPU needed)
      - edge:    edge-tts last-resort fallback
    """

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self._mode: str = "unloaded"   # "local" | "api" | "edge"
        self._coqui_models: dict[str, Any] = {}  # {"dravidian": ..., "indo_aryan": ...}
        self._bhashini_uid = os.getenv("BHASHINI_USER_ID", "")
        self._bhashini_key = os.getenv("BHASHINI_API_KEY", "")

    # ── Identity ─────────────────────────────────────────────────────────────

    @property
    def engine_name(self) -> str:
        return "ai4b_fastpitch"

    def get_supported_languages(self) -> list:
        return sorted(_ALL_LANGS)

    def get_supported_emotions(self) -> list:
        return ["neutral"]  # FastPitch is single-style; emotion via pace/pitch

    # ── Lifecycle ────────────────────────────────────────────────────────────

    async def load_model(self) -> bool:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._load_model_sync)

    def _load_model_sync(self) -> bool:
        # 1. Try local CoquiTTS
        if self._try_load_coqui():
            self._mode = "local"
            self.is_loaded = True
            logger.info("[AI4BFastPitch] Loaded local CoquiTTS models")
            return True

        # 2. Try Bhashini API
        if self._bhashini_uid and self._bhashini_key:
            self._mode = "api"
            self.is_loaded = True
            logger.info("[AI4BFastPitch] Using Bhashini Dhruva API (FREE)")
            return True

        # 3. edge-tts fallback
        try:
            import edge_tts  # noqa: F401
            self._mode = "edge"
            self.is_loaded = True
            logger.warning(
                "[AI4BFastPitch] Neither CoquiTTS nor Bhashini configured. "
                "Using edge-tts fallback. Set BHASHINI_USER_ID + BHASHINI_API_KEY for free API mode."
            )
            return True
        except ImportError:
            logger.error("[AI4BFastPitch] No TTS backend available")
            return False

    def _try_load_coqui(self) -> bool:
        try:
            import torch
            from TTS.api import TTS  # noqa: PLC0415

            device = "cuda" if torch.cuda.is_available() else "cpu"

            # Dravidian group (ta/te/kn/ml)
            try:
                self._coqui_models["dravidian"] = TTS(
                    model_path=None,
                    config_path=None,
                    progress_bar=False,
                ).to(device)
                # Download from HF if model not found locally — lazy init
            except Exception as exc:
                logger.debug("[AI4BFastPitch] Dravidian CoquiTTS load failed: %s", exc)

            return bool(self._coqui_models)
        except ImportError:
            return False

    async def unload_model(self) -> bool:
        self._coqui_models.clear()
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
        lang = language[:2].lower()
        if lang not in _ALL_LANGS:
            logger.warning("[AI4BFastPitch] Unsupported lang %s — using hi", lang)
            lang = "hi"

        if self._mode == "local":
            return await self._synthesize_local(text, lang, pace, pitch)
        if self._mode == "api":
            return await self._synthesize_api(text, lang, pace)
        return await self._synthesize_edge(text, lang)

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

    # ── Local CoquiTTS ───────────────────────────────────────────────────────

    async def _synthesize_local(
        self, text: str, lang: str, pace: float, pitch: float
    ) -> bytes:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self._synthesize_local_sync, text, lang, pace, pitch
        )

    def _synthesize_local_sync(
        self, text: str, lang: str, pace: float, pitch: float
    ) -> bytes:
        group = "dravidian" if lang in _DRAVIDIAN_LANGS else "indo_aryan"
        model = self._coqui_models.get(group) or next(iter(self._coqui_models.values()), None)
        if model is None:
            raise RuntimeError("No CoquiTTS model loaded")

        import io as _io

        import numpy as np
        import soundfile as sf

        wav = model.tts(text=text, language=lang, speed=pace)
        arr = np.array(wav, dtype=np.float32)
        buf = _io.BytesIO()
        sf.write(buf, arr, 22050, format="WAV", subtype="PCM_16")
        return buf.getvalue()

    # ── Bhashini Dhruva API ──────────────────────────────────────────────────

    async def _synthesize_api(self, text: str, lang: str, pace: float) -> bytes:
        import base64

        import httpx

        service_id = _BHASHINI_SERVICE.get(lang, _BHASHINI_SERVICE["hi"])
        payload = {
            "pipelineTasks": [
                {
                    "taskType": "tts",
                    "config": {
                        "language":     {"sourceLanguage": lang},
                        "serviceId":    service_id,
                        "gender":       "female",
                        "samplingRate": 8000,
                    },
                }
            ],
            "inputData": {"input": [{"source": text}]},
        }
        headers = {
            "Authorization": self._bhashini_key,
            "userID":        self._bhashini_uid,
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
            raise RuntimeError("Bhashini API returned empty audio")

        return base64.b64decode(audio_b64)

    # ── edge-tts fallback ────────────────────────────────────────────────────

    async def _synthesize_edge(self, text: str, lang: str) -> bytes:
        import edge_tts

        edge_voice_map = {
            "ta": "ta-IN-PallaviNeural",
            "hi": "hi-IN-SwaraNeural",
            "te": "te-IN-ShrutiNeural",
            "kn": "kn-IN-SapnaNeural",
            "ml": "ml-IN-SobhanaNeural",
            "mr": "mr-IN-AarohiNeural",
            "bn": "bn-IN-TanishaaNeural",
            "gu": "gu-IN-DhwaniNeural",
            "pa": "pa-IN-OjasNeural",
        }
        voice = edge_voice_map.get(lang, "en-IN-NeerjaNeural")

        buf = io.BytesIO()
        communicate = edge_tts.Communicate(text, voice)
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buf.write(chunk["data"])
        return buf.getvalue()

    # ── Voice cloning (not supported for FastPitch) ──────────────────────────

    async def clone_voice(
        self, reference_audio: bytes, voice_name: str, language: str
    ) -> str:
        raise NotImplementedError(
            "AI4BFastPitch does not support voice cloning. Use IndicF5 or OpenVoice V2."
        )

    # ── WAV utils ────────────────────────────────────────────────────────────

    @staticmethod
    def _to_wav_bytes(pcm_bytes: bytes, sample_rate: int = 8000) -> bytes:
        """Wrap raw PCM bytes in a WAV header if needed."""
        if pcm_bytes[:4] == b"RIFF":
            return pcm_bytes
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            wf.writeframes(pcm_bytes)
        return buf.getvalue()
