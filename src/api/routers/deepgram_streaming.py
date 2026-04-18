"""
Deepgram Streaming STT proxy — using aiohttp WebSocket client.

Opens a persistent WebSocket to Deepgram on the server side and relays
binary audio chunks from the browser → Deepgram, then streams back
partial + final transcripts as JSON frames.

Uses aiohttp.ClientSession for the outbound Deepgram WebSocket — stable
API across versions, unlike the `websockets` library which breaks on
major version bumps.

Client protocol (on /api/v1/stt/stream):
  → send binary frames: raw 16-bit PCM @ 16kHz mono
  → receive JSON frames: {type, text, is_final, speaker?, confidence}
  → send text "close" to finish (or just close the socket)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

import aiohttp
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/stt", tags=["stt-stream"])

# Nova-2 supported language codes — unsupported codes cause HTTP 400
_NOVA2_SUPPORTED = {
    "en", "es", "fr", "de", "pt", "it", "nl", "ru", "ja", "ko", "zh",
    "ar", "hi", "tr", "pl", "uk", "sv", "no", "da", "cs", "fi", "ro",
    "sk", "bg", "hr", "hu", "el", "sr", "lt", "lv", "et", "sl", "ca",
    "af", "id", "ms", "vi", "th", "tl",
}

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

    # Build Deepgram URL with language hint (only if supported by Nova-2)
    dg_url = DEEPGRAM_WS_URL
    lang_code = (language or "").lower()[:2]
    if language and lang_code in _NOVA2_SUPPORTED:
        dg_url += f"&language={lang_code}"
    elif language:
        logger.info("Language %s not supported by Nova-2, using auto-detect", language)
        dg_url += "&detect_language=true"
    if not diarize:
        dg_url = dg_url.replace("&diarize=true", "")

    try:
        async with aiohttp.ClientSession() as session:
            async with session.ws_connect(
                dg_url,
                headers={"Authorization": f"Token {api_key}"},
                heartbeat=20,
                max_msg_size=2**24,
            ) as dg_ws:
                await client_ws.send_json({"type": "connected", "provider": "deepgram_nova2"})
                logger.info("Deepgram STT stream connected (lang=%s, diarize=%s)", language, diarize)

                async def pump_client_to_deepgram() -> None:
                    """Forward every binary audio frame from the browser to Deepgram."""
                    try:
                        while True:
                            msg = await client_ws.receive()
                            if "bytes" in msg and msg["bytes"] is not None:
                                await dg_ws.send_bytes(msg["bytes"])
                            elif "text" in msg and msg["text"]:
                                txt = msg["text"]
                                if txt.strip().lower() in ("close", "stop"):
                                    await dg_ws.send_str(json.dumps({"type": "CloseStream"}))
                                    break
                    except WebSocketDisconnect:
                        pass
                    except Exception as exc:
                        logger.debug("client→deepgram pump ended: %s", exc)

                async def pump_deepgram_to_client() -> None:
                    """Parse Deepgram transcript frames and forward to client."""
                    try:
                        async for msg in dg_ws:
                            if msg.type == aiohttp.WSMsgType.TEXT:
                                try:
                                    data = json.loads(msg.data)
                                except Exception:
                                    continue

                                if data.get("type") == "Results":
                                    alt = (data.get("channel", {})
                                               .get("alternatives", [{}])[0])
                                    text = alt.get("transcript", "")
                                    if not text:
                                        continue
                                    is_final = data.get("is_final", False)
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

                            elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                                break
                    except Exception as exc:
                        logger.debug("deepgram→client pump ended: %s", exc)

                await asyncio.gather(
                    pump_client_to_deepgram(),
                    pump_deepgram_to_client(),
                )

    except aiohttp.WSServerHandshakeError as exc:
        logger.warning("Deepgram WebSocket handshake failed (HTTP %s): %s", exc.status, exc.message)
        try:
            await client_ws.send_json({"type": "error", "message": f"Deepgram connection failed: HTTP {exc.status}"})
        except Exception:
            pass
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
