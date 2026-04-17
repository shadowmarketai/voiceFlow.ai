"""
Gnani / Sarvam S2S stubs — Phase 8
=====================================
Flip-a-flag implementations for future Indian S2S providers.

To activate a provider when it becomes generally available:
  1. Set the corresponding env var / feature flag to True
  2. Fill the 3 marked methods (connect, stream, disconnect)
  3. No other file changes needed — PipelineRouter picks it up automatically

Provider stubs:
  GnaniInyaVoiceOS   — Gnani.ai enterprise voice OS (gated, not public)
  SarvamS2S          — Sarvam AI S2S (MOU with TN govt, Tamil product expected)
  MoshiS2S           — Kyutai Moshi self-hosted S2S (Track C, E2E GPU)
"""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import AsyncIterator

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Base interface every S2S provider must implement
# ─────────────────────────────────────────────────────────────────────────────

class BaseS2S:
    """All S2S providers share this interface."""

    provider_id: str = "base"

    @property
    def is_available(self) -> bool:
        return False

    async def stream_call(
        self,
        audio_iterator: AsyncIterator[bytes],
        system_prompt: str = "",
        language: str = "en",
        on_transcript=None,
    ) -> AsyncIterator[bytes]:
        """Yield audio response chunks given an audio input stream."""
        raise NotImplementedError
        yield b""  # satisfy type checker


# ─────────────────────────────────────────────────────────────────────────────
# Sarvam S2S stub
# ─────────────────────────────────────────────────────────────────────────────

_SARVAM_S2S_AVAILABLE = os.getenv("SARVAM_S2S_AVAILABLE", "").lower() in ("1", "true")
_SARVAM_S2S_BASE      = os.getenv("SARVAM_S2S_BASE", "")
_SARVAM_S2S_API_KEY   = os.getenv("SARVAM_API_KEY", "")


class SarvamS2S(BaseS2S):
    """
    Sarvam AI Speech-to-Speech — stub.

    Monitor: @SarvamAI on Twitter / https://sarvam.ai
    Expected: Tamil + 22 Indic languages, MOU with TN government.

    To activate:
      1. Get API key from Sarvam AI
      2. Set env vars:
           SARVAM_S2S_AVAILABLE=true
           SARVAM_S2S_BASE=wss://api.sarvam.ai/v1/s2s/stream
           SARVAM_API_KEY=your_key
      3. Implement the 3 methods below (marked ← IMPLEMENT)
    """

    provider_id = "sarvam_s2s"

    @property
    def is_available(self) -> bool:
        return _SARVAM_S2S_AVAILABLE and bool(_SARVAM_S2S_BASE) and bool(_SARVAM_S2S_API_KEY)

    async def stream_call(
        self,
        audio_iterator: AsyncIterator[bytes],
        system_prompt: str = "",
        language: str = "ta",
        on_transcript=None,
    ) -> AsyncIterator[bytes]:
        if not self.is_available:
            logger.warning("SarvamS2S not available — set SARVAM_S2S_AVAILABLE=true")
            return

        # ← IMPLEMENT: connect WebSocket, send setup with system_prompt + language
        # ← IMPLEMENT: stream audio chunks in, yield audio chunks out
        # ← IMPLEMENT: handle turn_complete / disconnect

        # Placeholder — remove when implemented
        logger.error("SarvamS2S.stream_call is not yet implemented")
        yield b""


# ─────────────────────────────────────────────────────────────────────────────
# Gnani Inya VoiceOS stub
# ─────────────────────────────────────────────────────────────────────────────

_GNANI_AVAILABLE = os.getenv("GNANI_S2S_AVAILABLE", "").lower() in ("1", "true")
_GNANI_API_KEY   = os.getenv("GNANI_API_KEY", "")
_GNANI_S2S_BASE  = os.getenv("GNANI_S2S_BASE", "wss://api.gnani.ai/v1/inya/stream")


class GnaniInyaVoiceOS(BaseS2S):
    """
    Gnani.ai Inya VoiceOS — stub.

    Enterprise-gated. Contact: https://gnani.ai/contact
    Supports: Tamil, Telugu, Kannada, Hindi, Bengali + more.

    To activate:
      1. Get enterprise API access from Gnani
      2. Set env vars:
           GNANI_S2S_AVAILABLE=true
           GNANI_API_KEY=your_key
           GNANI_S2S_BASE=wss://api.gnani.ai/v1/inya/stream
      3. Implement the 3 methods below (marked ← IMPLEMENT)
    """

    provider_id = "gnani_s2s"

    @property
    def is_available(self) -> bool:
        return _GNANI_AVAILABLE and bool(_GNANI_API_KEY)

    async def stream_call(
        self,
        audio_iterator: AsyncIterator[bytes],
        system_prompt: str = "",
        language: str = "ta",
        on_transcript=None,
    ) -> AsyncIterator[bytes]:
        if not self.is_available:
            logger.warning("GnaniInyaVoiceOS not available — set GNANI_S2S_AVAILABLE=true")
            return

        # ← IMPLEMENT: WebSocket connect with auth header
        # ← IMPLEMENT: stream audio, yield audio response
        # ← IMPLEMENT: handle session end

        logger.error("GnaniInyaVoiceOS.stream_call is not yet implemented")
        yield b""


# ─────────────────────────────────────────────────────────────────────────────
# Moshi S2S (self-hosted, Track C)
# ─────────────────────────────────────────────────────────────────────────────

_MOSHI_AVAILABLE  = os.getenv("MOSHI_AVAILABLE", "").lower() in ("1", "true")
_MOSHI_SERVER_URL = os.getenv("MOSHI_SERVER_URL", "ws://localhost:8998")


class MoshiS2S(BaseS2S):
    """
    Kyutai Moshi 7B — self-hosted full-duplex S2S.

    Runs on E2E Networks L4 GPU (24GB VRAM).
    Track C: English first → Tamil fine-tuned after corpus reaches 10hrs.

    Setup:
      pip install moshi
      python -m moshi.server --host 0.0.0.0 --port 8998 \
        --hf-repo kyutai/moshika-pytorch-bf16

    To activate:
      Set env vars:
        MOSHI_AVAILABLE=true
        MOSHI_SERVER_URL=ws://<e2e-gpu-ip>:8998

    Moshi server protocol (kyutai/moshi):
      - WebSocket binary frames: interleaved audio + text tokens
      - Send 1920-byte PCM16 chunks at 24kHz (80ms frames)
      - Receive 1920-byte PCM16 chunks at 24kHz
    """

    provider_id = "moshi"

    @property
    def is_available(self) -> bool:
        return _MOSHI_AVAILABLE and bool(_MOSHI_SERVER_URL)

    async def stream_call(
        self,
        audio_iterator: AsyncIterator[bytes],
        system_prompt: str = "",
        language: str = "en",
        on_transcript=None,
    ) -> AsyncIterator[bytes]:
        if not self.is_available:
            logger.warning("MoshiS2S not available — set MOSHI_AVAILABLE=true")
            return

        try:
            import websockets as ws_lib

            async with ws_lib.connect(
                self._ws_url(),
                ping_interval=5,
            ) as ws:
                send_task = asyncio.create_task(
                    self._send_loop(ws, audio_iterator)
                )
                async for chunk in self._recv_loop(ws):
                    yield chunk
                send_task.cancel()
        except Exception as exc:
            logger.error("MoshiS2S error: %s", exc)

    def _ws_url(self) -> str:
        return f"{_MOSHI_SERVER_URL}/api/chat"

    async def _send_loop(self, ws, audio_iterator: AsyncIterator[bytes]) -> None:
        try:
            async for chunk in audio_iterator:
                # Moshi expects 1920-byte frames at 24kHz PCM16
                # Resample/pad if needed — basic pass-through for now
                await ws.send(chunk)
        except Exception as exc:
            logger.debug("Moshi send ended: %s", exc)

    async def _recv_loop(self, ws) -> AsyncIterator[bytes]:
        try:
            async for message in ws:
                if isinstance(message, bytes) and len(message) > 0:
                    yield message
        except Exception as exc:
            logger.debug("Moshi recv ended: %s", exc)
