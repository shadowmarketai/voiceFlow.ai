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
    # NOTE: detect_language is NOT supported in WebSocket streaming — only REST API.
    # For unsupported languages, omit the param and let Deepgram default to English.
    dg_url = DEEPGRAM_WS_URL
    lang_code = (language or "").lower()[:2]
    if language and lang_code in _NOVA2_SUPPORTED:
        dg_url += f"&language={lang_code}"
    elif language:
        logger.info("Language %s not supported by Nova-2 streaming, defaulting to en", language)
        dg_url += "&language=en"
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


# =====================================================================
# Batch STT for Indic languages (multilingual-fix v2)
# =====================================================================
# Deepgram Nova-2 streaming only supports Hindi from the Indic family
# (no Tamil/Telugu/Kannada/Malayalam/Bengali/Marathi/Gujarati/Punjabi/
# Odia).  When the browser records audio for those languages we POST
# the whole blob here and route it through the ensemble (Sarvam first,
# then Bhashini, then Whisper) which handles native scripts properly.
#
# This endpoint accepts ANY language code and will:
#   - send Indic codes through transcribe_ensemble (Sarvam path)
#   - send English through Deepgram REST
#   - return the actual detected language code in the response
#
# Use it from the frontend with a MediaRecorder push-to-talk pattern
# any time the selected language is something other than en/hi.

from fastapi import File, Form, UploadFile  # noqa: E402

INDIC_BATCH_LANGS = {"ta", "te", "kn", "ml", "bn", "mr", "gu", "pa", "or",
                     "as", "ur", "ne", "kok", "mni", "sd", "sa"}


@router.post("/transcribe")
async def transcribe_batch(
    file: UploadFile = File(...),
    language: str | None = Form(None, description="ISO language hint (omit for auto-detect)"),
):
    """Batch STT for recorded audio. Returns transcript + detected language.

    Routes Indic languages through Sarvam (correct script output) and
    falls back to the ensemble for everything else.  The detected
    language in the response is the AUTHORITATIVE one — the frontend
    should use it as the next turn's tts_language hint, NOT the one it
    requested.
    """
    audio_bytes = await file.read()
    if not audio_bytes:
        return {"text": "", "language": language or "en", "provider": "none",
                "confidence": 0.0, "error": "empty audio"}

    norm = (language or "").lower().split("-")[0] or None

    try:
        from voice_engine.api_providers import transcribe_ensemble
        result = await transcribe_ensemble(audio_bytes, language=norm)
    except Exception as exc:
        logger.warning("Batch STT ensemble failed: %s", exc)
        return {"text": "", "language": norm or "en", "provider": "error",
                "confidence": 0.0, "error": str(exc)[:200]}

    text = result.get("text", "")
    detected = (result.get("language") or norm or "en").lower().split("-")[0]

    # Refine detection with script analysis on the transcript itself.
    # Catches Sarvam mis-routing (e.g. Tamil audio transcribed in Hindi script).
    try:
        from voice_engine.lang_detect import pick_tts_language
        chosen, reason = pick_tts_language(
            user_hint=norm, stt_detected=detected, text=text,
        )
        if chosen != detected:
            logger.info("Batch STT lang refine: %s → %s (%s)", detected, chosen, reason)
            detected = chosen
    except Exception:
        pass

    return {
        "text": text,
        "language": detected,
        "provider": result.get("provider", "ensemble"),
        "confidence": result.get("confidence", 0.85),
    }


def should_use_batch(language: str | None) -> bool:
    """Helper exported for the frontend: True when batch STT is required.

    Use this on the client to decide whether to open the WebSocket
    streamer (Deepgram-supported) or do MediaRecorder push-to-talk
    against /transcribe (everything else).
    """
    if not language:
        return False  # let user pick streaming for auto-detect
    return language.lower().split("-")[0] in INDIC_BATCH_LANGS


@router.get("/health")
async def stt_health():
    """Quick configuration check — call this from a browser tab to see
    which STT providers are wired up.  If sarvam=false you will not get
    multilingual STT no matter what the UI does."""
    return {
        "deepgram": bool(os.getenv("DEEPGRAM_API_KEY")),
        "sarvam": bool(os.getenv("SARVAM_API_KEY")),
        "groq_whisper": bool(os.getenv("GROQ_API_KEY")),
        "openai_whisper": bool(os.getenv("OPENAI_API_KEY")),
        "indic_batch_languages": sorted(INDIC_BATCH_LANGS),
        "deepgram_streaming_languages": sorted(_NOVA2_SUPPORTED),
        "recommendation": (
            "Set SARVAM_API_KEY in .env for Tamil/Telugu/Kannada/Malayalam/Bengali/Marathi/Gujarati/Punjabi/Odia. "
            "Without it, batch STT falls back to Whisper which has worse Indic accuracy."
        ) if not os.getenv("SARVAM_API_KEY") else "OK",
    }
