"""
Gemini Live S2S — Track B
==========================
Full-duplex Speech-to-Speech via Google Gemini 2.0 Flash Live API.

Architecture:
  GeminiLiveS2S.stream_call(audio_iterator) → async generator of audio chunks

Audio format:
  Input:  PCM16 16kHz mono (raw bytes, no header)
  Output: PCM16 24kHz mono chunks (streamed)

Environment variables:
  GEMINI_API_KEY          Google AI Studio key
  GEMINI_S2S_MODEL        default: models/gemini-2.0-flash-exp
  GEMINI_S2S_VOICE        default: Aoede
  GEMINI_S2S_LANGUAGE     default: en-IN

Latency target: ~250ms TTFA (first audio chunk from first user speech)
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
from collections.abc import AsyncIterator
from typing import Any

import websockets

logger = logging.getLogger(__name__)

_API_KEY    = os.getenv("GEMINI_API_KEY", "")
_MODEL      = os.getenv("GEMINI_S2S_MODEL", "models/gemini-2.0-flash-exp")
_VOICE      = os.getenv("GEMINI_S2S_VOICE", "Aoede")
_LANGUAGE   = os.getenv("GEMINI_S2S_LANGUAGE", "en-IN")

_WS_BASE = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"


class GeminiLiveS2S:
    """
    Stateless wrapper around Gemini 2.0 Flash Live WebSocket API.

    Usage:
        s2s = GeminiLiveS2S(system_prompt="You are a helpful voice assistant.")
        async for audio_chunk in s2s.stream_call(audio_iterator):
            send_to_phone(audio_chunk)
    """

    def __init__(
        self,
        system_prompt: str = "You are a helpful voice assistant. Keep responses under 30 words.",
        language: str = _LANGUAGE,
        voice: str = _VOICE,
    ):
        self.system_prompt = system_prompt
        self.language      = language
        self.voice         = voice
        self._ws_url       = f"{_WS_BASE}?key={_API_KEY}" if _API_KEY else ""

    @property
    def is_available(self) -> bool:
        return bool(_API_KEY)

    async def stream_call(
        self,
        audio_iterator: AsyncIterator[bytes],
        on_transcript: Any = None,
    ) -> AsyncIterator[bytes]:
        """
        Stream audio in, receive audio chunks out.

        Args:
            audio_iterator: async generator yielding PCM16 16kHz mono chunks
            on_transcript:  optional async callable(text) for transcript events
        Yields:
            PCM16 24kHz audio bytes
        """
        if not self.is_available:
            logger.warning("Gemini S2S not available — GEMINI_API_KEY not set")
            return

        setup_msg = {
            "setup": {
                "model": _MODEL,
                "generation_config": {
                    "response_modalities": ["AUDIO"],
                    "speech_config": {
                        "voice_config": {
                            "prebuilt_voice_config": {"voice_name": self.voice}
                        }
                    },
                },
                "system_instruction": {
                    "parts": [{"text": self.system_prompt}]
                },
            }
        }

        try:
            async with websockets.connect(
                self._ws_url,
                ping_interval=20,
                ping_timeout=10,
                close_timeout=5,
            ) as ws:
                # Send setup
                await ws.send(json.dumps(setup_msg))
                setup_ack = await asyncio.wait_for(ws.recv(), timeout=5)
                logger.debug("Gemini setup ack: %s", setup_ack[:80])

                # Run send + receive concurrently
                audio_queue: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=50)
                send_task = asyncio.create_task(
                    self._send_audio(ws, audio_iterator, audio_queue)
                )

                async for chunk in self._receive_audio(ws, audio_queue, on_transcript):
                    yield chunk

                send_task.cancel()
        except Exception as exc:
            logger.error("GeminiLiveS2S error: %s", exc, exc_info=True)

    async def _send_audio(
        self,
        ws,
        audio_iterator: AsyncIterator[bytes],
        done_queue: asyncio.Queue,
    ) -> None:
        """Stream PCM16 chunks to Gemini and signal done."""
        try:
            async for chunk in audio_iterator:
                if not chunk:
                    continue
                msg = {
                    "realtime_input": {
                        "media_chunks": [
                            {
                                "data": base64.b64encode(chunk).decode(),
                                "mime_type": "audio/pcm;rate=16000",
                            }
                        ]
                    }
                }
                await ws.send(json.dumps(msg))
        except Exception as exc:
            logger.debug("Gemini send ended: %s", exc)
        finally:
            # Signal end of turn
            try:
                await ws.send(json.dumps({"client_content": {"turn_complete": True}}))
            except Exception:
                pass
            await done_queue.put(None)

    async def _receive_audio(
        self,
        ws,
        done_queue: asyncio.Queue,
        on_transcript,
    ) -> AsyncIterator[bytes]:
        """Receive server messages and yield audio chunks."""
        while True:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=30)
                msg = json.loads(raw)
            except TimeoutError:
                logger.warning("Gemini receive timeout")
                break
            except Exception as exc:
                logger.debug("Gemini recv ended: %s", exc)
                break

            # Audio delta
            for part in (
                msg.get("server_content", {})
                   .get("model_turn", {})
                   .get("parts", [])
            ):
                if "inline_data" in part:
                    audio_b64 = part["inline_data"].get("data", "")
                    if audio_b64:
                        yield base64.b64decode(audio_b64)

            # Transcript
            for part in (
                msg.get("server_content", {})
                   .get("output_transcription", {})
                   .get("parts", [])
            ):
                if "text" in part and on_transcript:
                    try:
                        await on_transcript(part["text"])
                    except Exception:
                        pass

            # Turn complete
            if msg.get("server_content", {}).get("turn_complete"):
                break

            # Check if sender is done
            if not done_queue.empty():
                break


class GeminiS2SHealthCheck:
    """Lightweight connectivity test — used by pipeline router health worker."""

    @staticmethod
    async def is_healthy(timeout: float = 5.0) -> bool:
        if not _API_KEY:
            return False
        try:
            async with websockets.connect(
                f"{_WS_BASE}?key={_API_KEY}",
                close_timeout=timeout,
            ) as ws:
                # Just try to connect — don't send setup
                await asyncio.wait_for(ws.recv(), timeout=timeout)
                return True
        except Exception:
            return False
