"""
GPU FastAPI Server — runs on the L40S pod (E2E Networks)
=========================================================
Exposes TTS inference (XTTS v2, IndicF5) and a Moshi WebSocket proxy.
Moshi itself runs as: python -m moshi.server --port 8999

Endpoints:
  GET  /health           — liveness check (returns model load status)
  GET  /vram             — VRAM stats
  POST /tts/xtts         — XTTS v2 synthesis → WAV bytes
  POST /tts/indicf5      — IndicF5 synthesis → WAV bytes
  WS   /moshi/stream     — proxy to Moshi WebSocket server on :8999

Start:
    uvicorn voice_engine.gpu.server:app --host 0.0.0.0 --port 8998 --workers 1

Environment:
    MOSHI_PORT          port where moshi.server is listening (default: 8999)
    GPU_API_KEY         bearer token for this server (optional but recommended)
"""

from __future__ import annotations

import asyncio
import base64
import io
import logging
import os

import httpx
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from pydantic import BaseModel

from voice_engine.gpu.model_loader import get_free_vram_gb, get_indicf5, get_xtts, vram_stats

logger = logging.getLogger(__name__)

_MOSHI_PORT = int(os.getenv("MOSHI_PORT", "8999"))
_GPU_API_KEY = os.getenv("GPU_API_KEY", "")

app = FastAPI(title="VoiceFlow GPU Server", version="1.0.0")


# ── Auth ─────────────────────────────────────────────────────────────────

def _check_key(request: Request) -> None:
    if not _GPU_API_KEY:
        return
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or auth[7:] != _GPU_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid GPU API key")


# ── Health / VRAM ─────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    stats = vram_stats()
    return {"status": "ok", **stats}


@app.get("/vram")
async def vram(request: Request):
    _check_key(request)
    return vram_stats()


# ── XTTS v2 ───────────────────────────────────────────────────────────────

class XTTSRequest(BaseModel):
    text: str
    language: str = "en"
    speaker_wav_b64: str | None = None   # base64 WAV for voice cloning
    pace: float = 1.0


@app.post("/tts/xtts")
async def tts_xtts(req: XTTSRequest, request: Request):
    _check_key(request)
    loop = asyncio.get_event_loop()
    wav_bytes = await loop.run_in_executor(None, _xtts_sync, req)
    return Response(content=wav_bytes, media_type="audio/wav")


def _xtts_sync(req: XTTSRequest) -> bytes:
    import numpy as np
    import soundfile as sf

    tts = get_xtts()

    if req.speaker_wav_b64:
        import tempfile
        spk_bytes = base64.b64decode(req.speaker_wav_b64)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(spk_bytes)
            tmp_path = tmp.name
        wav = tts.tts(text=req.text, language=req.language, speaker_wav=tmp_path, speed=req.pace)
    else:
        wav = tts.tts(text=req.text, language=req.language, speed=req.pace)

    arr = np.array(wav, dtype=np.float32)
    buf = io.BytesIO()
    sf.write(buf, arr, 24000, format="WAV", subtype="PCM_16")
    return buf.getvalue()


# ── IndicF5 ───────────────────────────────────────────────────────────────

class IndicF5Request(BaseModel):
    text: str
    language: str = "ta"
    ref_audio_b64: str | None = None      # base64 WAV reference for voice cloning
    ref_text: str = ""                    # transcript of ref audio
    speed: float = 1.0


@app.post("/tts/indicf5")
async def tts_indicf5(req: IndicF5Request, request: Request):
    _check_key(request)
    loop = asyncio.get_event_loop()
    wav_bytes = await loop.run_in_executor(None, _indicf5_sync, req)
    return Response(content=wav_bytes, media_type="audio/wav")


def _indicf5_sync(req: IndicF5Request) -> bytes:
    import tempfile

    import numpy as np
    import soundfile as sf

    model = get_indicf5()

    ref_audio_path: str | None = None
    if req.ref_audio_b64:
        spk_bytes = base64.b64decode(req.ref_audio_b64)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(spk_bytes)
            ref_audio_path = tmp.name

    wav, sample_rate, _ = model.infer(
        ref_file=ref_audio_path or "",
        ref_text=req.ref_text,
        gen_text=req.text,
        speed=req.speed,
    )

    arr = np.array(wav, dtype=np.float32)
    buf = io.BytesIO()
    sf.write(buf, arr, sample_rate, format="WAV", subtype="PCM_16")
    return buf.getvalue()


# ── Moshi WebSocket proxy ─────────────────────────────────────────────────

@app.websocket("/moshi/stream")
async def moshi_proxy(websocket: WebSocket):
    """
    Proxy WebSocket frames between the client and the Moshi server on :8999.
    Moshi speaks its own binary WebSocket protocol — we forward bytes verbatim.
    """
    await websocket.accept()

    moshi_url = f"ws://127.0.0.1:{_MOSHI_PORT}/api/chat"
    # Optional liveness pre-check (swallowed — Moshi may not respond to HTTP GET)
    try:
        async with httpx.AsyncClient() as client, client.stream(
            "GET", moshi_url.replace("ws://", "http://")
        ) as _:
            pass
    except Exception:  # noqa: S110
        logger.debug("[GPU] Moshi pre-check skipped (expected for WS-only server)")

    import websockets  # noqa: PLC0415

    try:
        async with websockets.connect(moshi_url) as moshi_ws:
            async def client_to_moshi():
                try:
                    while True:
                        data = await websocket.receive_bytes()
                        await moshi_ws.send(data)
                except WebSocketDisconnect:
                    await moshi_ws.close()

            async def moshi_to_client():
                try:
                    async for message in moshi_ws:
                        if isinstance(message, bytes):
                            await websocket.send_bytes(message)
                        else:
                            await websocket.send_text(message)
                except Exception as exc:
                    logger.debug("[GPU] Moshi→client stream ended: %s", exc)

            await asyncio.gather(client_to_moshi(), moshi_to_client())

    except Exception as exc:
        logger.error("[GPU] Moshi proxy error: %s", exc)
        try:
            await websocket.close(code=1011, reason="Moshi server unavailable")
        except Exception:  # noqa: S110
            logger.debug("[GPU] WS already closed during Moshi proxy error")


# ── Training trigger ─────────────────────────────────────────────────────

class TrainRequest(BaseModel):
    language: str = "ta"
    corpus_dir: str = ""
    output_dir: str = ""
    epochs: int = 3


@app.post("/train/start")
async def train_start(req: TrainRequest, request: Request):
    _check_key(request)
    from voice_engine.gpu.background_trainer import launch_training  # noqa: PLC0415
    result = await launch_training(
        language=req.language,
        corpus_dir=req.corpus_dir,
        output_dir=req.output_dir,
        epochs=req.epochs,
    )
    return result


@app.get("/train/status")
async def train_status(request: Request):
    _check_key(request)
    from voice_engine.gpu.background_trainer import current_status  # noqa: PLC0415
    return current_status()


# ── Startup: pre-load models ──────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    loop = asyncio.get_event_loop()
    logger.info("[GPU] Pre-loading XTTS v2 and IndicF5 models…")
    try:
        await loop.run_in_executor(None, get_xtts)
        logger.info("[GPU] XTTS v2 ready. Free VRAM: %.1f GB", get_free_vram_gb())
    except Exception as exc:
        logger.error("[GPU] XTTS v2 startup failed: %s", exc)
    try:
        await loop.run_in_executor(None, get_indicf5)
        logger.info("[GPU] IndicF5 ready. Free VRAM: %.1f GB", get_free_vram_gb())
    except Exception as exc:
        logger.error("[GPU] IndicF5 startup failed: %s", exc)
    logger.info("[GPU] Server ready — VRAM: %s", vram_stats())
