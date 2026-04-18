"""
GPU Model Loader — L40S 48GB VRAM
===================================
Manages long-lived model instances for XTTS v2 and IndicF5.

Moshi is NOT loaded here — it runs as a standalone WebSocket server:
    python -m moshi.server --port 8999
and is proxied by the FastAPI server on /moshi/stream.

VRAM budget (48GB L40S):
    Moshi server process   ~7 GB   (managed externally)
    XTTS v2                ~6 GB   (loaded here, resident)
    IndicF5                ~8 GB   (loaded here, resident)
    Concurrent call cache  ~8 GB
    ─────────────────────────────
    Inference total        ~29 GB
    QLoRA training reserve ~16 GB  (activated only when idle)

Environment variables:
    XTTS_MODEL_DIR     path to XTTS v2 checkpoint (optional — defaults to HF download)
    INDICF5_MODEL_DIR  path to IndicF5 checkpoint (optional — defaults to HF download)
    DEVICE             cuda | cpu  (default: cuda)
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

_DEVICE = os.getenv("DEVICE", "cuda")


# ── Singleton model holders ────────────────────────────────────────────────

_xtts_model: Any | None = None
_indicf5_model: Any | None = None


def get_xtts() -> Any:
    """Return the resident XTTS v2 model instance (lazy load on first call)."""
    global _xtts_model  # noqa: PLW0603
    if _xtts_model is None:
        _xtts_model = _load_xtts()
    return _xtts_model


def get_indicf5() -> Any:
    """Return the resident IndicF5 model instance (lazy load on first call)."""
    global _indicf5_model  # noqa: PLW0603
    if _indicf5_model is None:
        _indicf5_model = _load_indicf5()
    return _indicf5_model


# ── Loaders ───────────────────────────────────────────────────────────────

def _load_xtts() -> Any:
    """Load XTTS v2 via CoquiTTS."""
    try:
        import torch
        from TTS.api import TTS  # noqa: PLC0415

        model_dir = os.getenv("XTTS_MODEL_DIR")
        device = _DEVICE if torch.cuda.is_available() else "cpu"

        if model_dir and os.path.isdir(model_dir):
            logger.info("[GPU] Loading XTTS v2 from local dir: %s", model_dir)
            tts = TTS(
                model_path=os.path.join(model_dir, "model.pth"),
                config_path=os.path.join(model_dir, "config.json"),
                progress_bar=False,
            ).to(device)
        else:
            logger.info("[GPU] Downloading XTTS v2 from HuggingFace…")
            tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2", progress_bar=True).to(device)

        logger.info("[GPU] XTTS v2 loaded on %s", device)
        return tts

    except Exception as exc:
        logger.error("[GPU] XTTS v2 load failed: %s", exc)
        raise


def _load_indicf5() -> Any:
    """Load IndicF5 via the f5-tts library."""
    try:
        from f5_tts.api import F5TTS  # noqa: PLC0415

        model_dir = os.getenv("INDICF5_MODEL_DIR")

        if model_dir and os.path.isdir(model_dir):
            logger.info("[GPU] Loading IndicF5 from local dir: %s", model_dir)
            model = F5TTS(model_type="F5-TTS", ckpt_file=os.path.join(model_dir, "model.pt"))
        else:
            logger.info("[GPU] Downloading IndicF5 from HuggingFace…")
            model = F5TTS(model_type="F5-TTS", ckpt_file="ai4bharat/IndicF5")

        logger.info("[GPU] IndicF5 loaded")
        return model

    except Exception as exc:
        logger.error("[GPU] IndicF5 load failed: %s", exc)
        raise


# ── VRAM helpers ──────────────────────────────────────────────────────────

def get_free_vram_gb() -> float:
    """Return free VRAM in GB. Returns 0 if CUDA unavailable."""
    try:
        import torch
        if not torch.cuda.is_available():
            return 0.0
        props = torch.cuda.mem_get_info()
        return props[0] / 1024 ** 3
    except Exception:
        return 0.0


def get_used_vram_gb() -> float:
    """Return allocated VRAM in GB."""
    try:
        import torch
        if not torch.cuda.is_available():
            return 0.0
        return torch.cuda.memory_allocated() / 1024 ** 3
    except Exception:
        return 0.0


def vram_stats() -> dict:
    """Return a VRAM summary dict."""
    free = get_free_vram_gb()
    used = get_used_vram_gb()
    return {
        "free_gb": round(free, 2),
        "used_gb": round(used, 2),
        "total_gb": round(free + used, 2),
        "xtts_loaded": _xtts_model is not None,
        "indicf5_loaded": _indicf5_model is not None,
    }
