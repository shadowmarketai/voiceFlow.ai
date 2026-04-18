"""
GPU Client — KVM4-side HTTP client for the L40S GPU server
===========================================================
Talks to the FastAPI server running on the E2E L40S pod.

Environment:
    E2E_GPU_API_URL   base URL of GPU server  (e.g. http://10.0.1.5:8998)
    GPU_API_KEY       bearer token for auth   (optional if GPU server has no key)
"""

from __future__ import annotations

import base64
import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_GPU_URL = os.getenv("E2E_GPU_API_URL", "").rstrip("/")
_GPU_KEY = os.getenv("GPU_API_KEY", "")
_TIMEOUT = float(os.getenv("GPU_CLIENT_TIMEOUT", "30"))


def _headers() -> dict[str, str]:
    h = {"Content-Type": "application/json"}
    if _GPU_KEY:
        h["Authorization"] = f"Bearer {_GPU_KEY}"
    return h


def _base_url() -> str:
    if not _GPU_URL:
        raise RuntimeError("E2E_GPU_API_URL is not configured")
    return _GPU_URL


# ── Health ────────────────────────────────────────────────────────────────

async def check_gpu_health() -> dict[str, Any]:
    """
    Ping the GPU server health endpoint.
    Returns the health dict or {"status": "unreachable", ...} on error.
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{_base_url()}/health")
            resp.raise_for_status()
            return resp.json()
    except RuntimeError as exc:
        return {"status": "unconfigured", "error": str(exc)}
    except Exception as exc:
        logger.warning("[GPUClient] Health check failed: %s", exc)
        return {"status": "unreachable", "error": str(exc)}


async def get_vram_stats() -> dict[str, Any]:
    """Return VRAM stats from the GPU server."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{_base_url()}/vram", headers=_headers())
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.warning("[GPUClient] VRAM stats failed: %s", exc)
        return {"error": str(exc)}


# ── XTTS v2 ───────────────────────────────────────────────────────────────

async def xtts_tts(
    text: str,
    language: str = "en",
    speaker_wav: bytes | None = None,
    pace: float = 1.0,
) -> bytes:
    """
    Synthesise speech via XTTS v2 on the GPU server.

    Args:
        text          — text to synthesise
        language      — ISO 639-1 language code
        speaker_wav   — raw WAV bytes for voice cloning (optional)
        pace          — speed multiplier (default 1.0)

    Returns:
        WAV bytes
    """
    payload: dict[str, Any] = {
        "text": text,
        "language": language,
        "pace": pace,
    }
    if speaker_wav:
        payload["speaker_wav_b64"] = base64.b64encode(speaker_wav).decode()

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(
            f"{_base_url()}/tts/xtts",
            json=payload,
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.content


# ── IndicF5 ───────────────────────────────────────────────────────────────

async def indicf5_tts(
    text: str,
    language: str = "ta",
    ref_audio: bytes | None = None,
    ref_text: str = "",
    speed: float = 1.0,
) -> bytes:
    """
    Synthesise speech via IndicF5 on the GPU server.

    Args:
        text       — text to synthesise
        language   — ISO 639-1 language code
        ref_audio  — reference WAV bytes for voice cloning (optional)
        ref_text   — transcript of reference audio (improves cloning quality)
        speed      — speed multiplier

    Returns:
        WAV bytes
    """
    payload: dict[str, Any] = {
        "text": text,
        "language": language,
        "ref_text": ref_text,
        "speed": speed,
    }
    if ref_audio:
        payload["ref_audio_b64"] = base64.b64encode(ref_audio).decode()

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(
            f"{_base_url()}/tts/indicf5",
            json=payload,
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.content


# ── Training trigger ──────────────────────────────────────────────────────

async def trigger_gpu_training(
    language: str = "ta",
    corpus_dir: str = "",
    output_dir: str = "",
    epochs: int = 3,
) -> dict[str, Any]:
    """
    Ask the GPU server to start a QLoRA fine-tune run.
    The server checks free VRAM and launches training as a subprocess.

    Returns the server response dict.
    """
    payload = {
        "language": language,
        "corpus_dir": corpus_dir,
        "output_dir": output_dir,
        "epochs": epochs,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{_base_url()}/train/start",
                json=payload,
                headers=_headers(),
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.error("[GPUClient] Training trigger failed: %s", exc)
        return {"status": "error", "error": str(exc)}


# ── Moshi WebSocket URL ───────────────────────────────────────────────────

def moshi_ws_url() -> str:
    """Return the WebSocket URL for the Moshi proxy on the GPU server."""
    url = _base_url().replace("http://", "ws://").replace("https://", "wss://")
    return f"{url}/moshi/stream"
