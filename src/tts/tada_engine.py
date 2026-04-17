"""
TADA Emotion TTS Engine — Hume AI open-source model (MIT, March 2026).
=======================================================================

TADA (Text-Acoustic Dual Alignment) aligns audio representations directly
to text tokens, enabling emotionally-matched speech synthesis.

Key numbers vs comparable LLM TTS:
  Real-time factor:   0.09 (vs 0.45–0.60)      → 5× faster
  Hallucinations:     zero (1000+ test samples)
  Context window:     ~700 seconds of audio
  Speaker similarity: 4.18 / 5.0
  VRAM:               ~6 GB on E2E L4 GPU

How emotion mapping works:
  Caller frustration → TADA "frustrated" style → agent voice is softer, slower
  Caller confusion   → TADA "calm_explain"     → agent voice is measured, clear
  Caller satisfied   → TADA "warm"             → agent voice is warm, unhurried
  Default            → TADA "neutral"

Installation (run once on E2E GPU server):
  pip install tada
  huggingface-cli download HumeAI/tada-3b-ml --local-dir ./models/tada

Environment variables:
  TADA_MODEL_PATH     — local path (default: ./models/tada)
  TADA_ENABLED        — "true" to enable (default: false — GPU required)
  TADA_DEVICE         — "cuda" | "cpu" (default: cuda)

Falls back completely to Sarvam TTS if TADA is unavailable.
"""

from __future__ import annotations

import base64
import io
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

_TADA_ENABLED    = os.getenv("TADA_ENABLED", "false").lower() == "true"
_TADA_MODEL_PATH = os.getenv("TADA_MODEL_PATH", "./models/tada")
_TADA_DEVICE     = os.getenv("TADA_DEVICE", "cuda")

# Lazy-loaded model reference
_tada_model: Any = None


# ──────────────────────────────────────────────────────────────────────────────
# Emotion → TADA style mapping
# ──────────────────────────────────────────────────────────────────────────────

# Maps our internal emotion label (from emotion_engine.py) to TADA prosody style.
# TADA styles control pitch, rate, energy envelope of the synthesised voice.
_EMOTION_TO_STYLE: dict[str, str] = {
    "frustration": "calm_empathetic",   # softer, slower — mirrors de-escalation
    "anger":       "calm_empathetic",   # agent stays calm when caller is angry
    "confusion":   "clear_explain",     # measured pace, clear articulation
    "sadness":     "gentle_supportive", # warm, unhurried
    "fear":        "gentle_supportive",
    "distress":    "gentle_supportive",
    "joy":         "warm_upbeat",
    "satisfaction":"warm_upbeat",
    "excitement":  "warm_upbeat",
    "calmness":    "neutral",
    "neutral":     "neutral",
    "":            "neutral",
}

# Language-specific voice IDs within TADA (if the model has multi-speaker support)
_LANG_VOICE: dict[str, str] = {
    "ta": "priya_ta",     # Tamil female voice
    "hi": "kavya_hi",     # Hindi female voice
    "te": "divya_te",     # Telugu female voice
    "kn": "ananya_kn",
    "ml": "sreelakshmi_ml",
    "en": "aria_en",
}


def _load_model():
    """Lazy-load TADA model. Returns None if not available."""
    global _tada_model
    if _tada_model is not None:
        return _tada_model
    if not _TADA_ENABLED:
        return None
    try:
        import tada  # type: ignore
        _tada_model = tada.load(_TADA_MODEL_PATH, device=_TADA_DEVICE)
        logger.info("tada_engine: model loaded from %s on %s", _TADA_MODEL_PATH, _TADA_DEVICE)
        return _tada_model
    except ImportError:
        logger.info("tada_engine: `tada` package not installed — run: pip install tada")
    except FileNotFoundError:
        logger.info(
            "tada_engine: model not found at %s — run: "
            "huggingface-cli download HumeAI/tada-3b-ml --local-dir %s",
            _TADA_MODEL_PATH, _TADA_MODEL_PATH,
        )
    except Exception as e:
        logger.warning("tada_engine: failed to load model — %s", e)
    return None


# ──────────────────────────────────────────────────────────────────────────────
# Synthesis
# ──────────────────────────────────────────────────────────────────────────────

async def synthesize(
    text: str,
    language: str = "en",
    emotion: str = "neutral",
    emotion_scores: dict[str, float] | None = None,
    speed: float = 1.0,
) -> dict[str, Any] | None:
    """
    Synthesise speech with emotion-matched prosody via TADA.

    Returns dict compatible with api_providers.synthesize_speech_api() format:
      {
        "audio_base64": str,
        "format":       "wav",
        "sample_rate":  24000,
        "provider":     "tada",
        "latency_ms":   float,
      }

    Returns None if TADA is unavailable (caller should fall back to Sarvam).
    """
    import asyncio
    import time

    model = _load_model()
    if model is None:
        return None

    style      = _EMOTION_TO_STYLE.get(emotion, "neutral")
    voice_id   = _LANG_VOICE.get(language[:2], "aria_en")
    t0         = time.time()

    try:
        loop = asyncio.get_event_loop()
        audio_np = await loop.run_in_executor(
            None,
            lambda: model.synthesize(
                text=text,
                voice=voice_id,
                style=style,
                speed=speed,
                emotion_scores=emotion_scores or {},
            ),
        )

        # Convert numpy array → WAV bytes → base64
        import numpy as np
        import wave

        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)       # 16-bit PCM
            wf.setframerate(24000)
            pcm = (audio_np * 32767).astype(np.int16)
            wf.writeframes(pcm.tobytes())

        audio_b64 = base64.b64encode(buf.getvalue()).decode()
        latency   = (time.time() - t0) * 1000
        logger.info("tada_engine: synthesised %d chars in %.0fms (style=%s)",
                    len(text), latency, style)

        return {
            "audio_base64": audio_b64,
            "format":       "wav",
            "sample_rate":  24000,
            "provider":     "tada",
            "latency_ms":   latency,
        }

    except Exception as e:
        logger.warning("tada_engine: synthesis failed — %s", e)
        return None


def is_available() -> bool:
    """Quick check — returns True only if TADA model is loaded and ready."""
    return _load_model() is not None
