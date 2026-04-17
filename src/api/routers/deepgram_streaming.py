"""
Deepgram Streaming STT proxy.

Opens a persistent WebSocket to Deepgram on the server side and relays
binary audio chunks from the browser → Deepgram, then streams back
partial + final transcripts as JSON frames.

Why a proxy instead of direct browser→Deepgram?
  - Keeps the API key server-side (never exposed to the browser)
  - Lets us enforce auth, tenant scoping, and per-call billing

Client protocol (on /api/v1/stt/stream):
  → connect with auth query param: ws://host/api/v1/stt/stream?token=<jwt>
  → send binary frames: raw 16-bit PCM / Opus audio @ 16kHz mono
  → receive JSON frames: {type, text, is_final, speaker?, latency_ms}
  → send text "close" to finish (or just close the socket)

Events sent to the client:
  {"type": "connected"}
  {"type": "partial", "text": "hello how are"}
  {"type": "final",   "text": "hello how are you doing today", "speaker": 0}
  {"type": "error",   "message": "..."}
  {"type": "closed"}
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/stt", tags=["stt-stream"])


DEEPGRAM_WS_URL = (
    "wss://api.deepgram.com/v1/listen"
    "?model=nova-2"
    "&smart_format=true"
    "&punctuate=true"
    "&interim_results=true"
    "&diarize=true"
    "&encoding=linear16"
    "&sample_rate=16000"
    "&channels=1"
)


@router.websocket("/stream")
async def stt_stream(
    client_ws: WebSocket,
    language: str | None = Query(None, description="ISO language hint"),
    diarize: bool = Query(True, description="Enable speaker diarization"),
):
    """Bidirectional WebSocket: client audio ↔ Deepgram Nova-2 streaming."""
    await client_ws.accept()

    api_key = os.getenv("DEEPGRAM_API_KEY")
    if not api_key:
        await client_ws.send_json({"type": "error", "message": "Deepgram not configured"})
        await client_ws.close()
        return

    # Build Deepgram URL with language hint if provided
    dg_url = DEEPGRAM_WS_URL
    if language:
        dg_url += f"&language={language}"
    if not diarize:
        dg_url = dg_url.replace("&diarize=true", "")

    try:
        import websockets
    except ImportError:
        await client_ws.send_json({
            "type": "error",
            "message": "websockets package missing — add `websockets` to requirements",
        })
        await client_ws.close()
        return

    try:
        async with websockets.connect(
            dg_url,
            extra_headers={"Authorization": f"Token {api_key}"},
            ping_interval=20, ping_timeout=20, max_size=2**24,
        ) as dg_ws:
            await client_ws.send_json({"type": "connected", "provider": "deepgram_nova2"})

            async def pump_client_to_deepgram() -> None:
                """Forward every binary audio frame from the browser to Deepgram."""
                try:
                    while True:
                        msg = await client_ws.receive()
                        if "bytes" in msg and msg["bytes"] is not None:
                            await dg_ws.send(msg["bytes"])
                        elif "text" in msg and msg["text"]:
                            txt = msg["text"]
                            if txt.strip().lower() in ("close", "stop"):
                                await dg_ws.send(json.dumps({"type": "CloseStream"}))
                                break
                except WebSocketDisconnect:
                    pass
                except Exception as exc:
                    logger.warning("client→deepgram pump error: %s", exc)

            async def pump_deepgram_to_client() -> None:
                """Parse Deepgram transcript frames and forward simplified JSON to client."""
                try:
                    async for raw in dg_ws:
                        try:
                            data = json.loads(raw)
                        except Exception:
                            continue

                        if data.get("type") == "Results":
                            alt = (data.get("channel", {})
                                       .get("alternatives", [{}])[0])
                            text = alt.get("transcript", "")
                            if not text:
                                continue
                            is_final = data.get("is_final", False)
                            # Pick speaker from first word if diarize is on
                            speaker = None
                            words = alt.get("words", [])
                            if words and "speaker" in words[0]:
                                speaker = words[0]["speaker"]
                            payload: dict[str, Any] = {
                                "type": "final" if is_final else "partial",
                                "text": text,
                                "confidence": alt.get("confidence", 0),
                            }
                            if speaker is not None:
                                payload["speaker"] = speaker
                            await client_ws.send_json(payload)
                        elif data.get("type") == "SpeechStarted":
                            await client_ws.send_json({"type": "speech_started"})
                        elif data.get("type") == "UtteranceEnd":
                            await client_ws.send_json({"type": "utterance_end"})
                except Exception as exc:
                    logger.warning("deepgram→client pump error: %s", exc)

            await asyncio.gather(
                pump_client_to_deepgram(),
                pump_deepgram_to_client(),
            )

    except Exception as exc:
        logger.warning("Deepgram streaming failure: %s", exc)
        try:
            await client_ws.send_json({"type": "error", "message": str(exc)[:200]})
        except Exception:
            pass

    try:
        await client_ws.send_json({"type": "closed"})
        await client_ws.close()
    except Exception:
        pass
