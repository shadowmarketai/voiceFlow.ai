"""
Interruption Manager — Real-time barge-in detection during agent playback.
==========================================================================

Problem:
  When the agent is speaking (TTS playing), the user might:
  1. Cough, clear throat, background noise  → NOT an interrupt
  2. Say "ஆமா" / "hmm" / "ok" (backchannel) → NOT an interrupt
  3. Actually start talking over the agent   → REAL interrupt

Naive approach (treat ALL speech as interrupt) breaks Indian conversations
where backchannels happen every few seconds.

Solution — 3-layer false interrupt filter:
  Layer 1: Duration gate     — ignore speech < 300ms (cough, noise)
  Layer 2: Backchannel check — ignore "ஆமா", "ok", "hmm" using smart_turn
  Layer 3: Confidence gate   — require sustained speech (>500ms) + high VAD
           confidence (>0.7) before triggering a real interrupt

Usage:
    manager = InterruptionManager(vad_engine, language="ta")

    # Call on every incoming audio chunk while agent is speaking
    decision = await manager.check(audio_chunk)

    if decision.action == InterruptAction.INTERRUPT:
        # Cancel LLM + TTS, start new STT
        cancel_active_tasks()
        process_new_input(decision.accumulated_audio)
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public types
# ---------------------------------------------------------------------------

class InterruptAction(str, Enum):
    """What the pipeline should do with this audio chunk."""
    IGNORE = "ignore"        # Background noise or backchannel — keep playing
    WAIT = "wait"            # Speech detected but too short — keep checking
    INTERRUPT = "interrupt"  # Real interrupt — cancel everything, listen


@dataclass
class InterruptDecision:
    """Result from InterruptionManager.check()."""
    action: InterruptAction
    reason: str
    speech_duration_ms: float = 0.0
    transcript: str = ""
    accumulated_audio: bytes = b""  # buffered user audio for STT handoff
    vad_confidence: float = 0.0
    agent_partial_text: str = ""    # what agent had said before interrupt


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

@dataclass
class InterruptConfig:
    """Tunable thresholds for interrupt detection."""

    # Layer 1: Duration gate
    min_speech_ms: float = 300.0
    """Ignore speech bursts shorter than this (cough, click, breath)."""

    # Layer 2: Backchannel — uses smart_turn.py, no config needed here

    # Layer 3: Confidence gate
    confirm_speech_ms: float = 500.0
    """Require this much sustained speech before confirming interrupt."""

    vad_confidence_threshold: float = 0.7
    """Minimum VAD confidence to confirm a real interrupt."""

    # Gap tolerance — speech can have brief pauses and still be one utterance
    max_gap_ms: float = 200.0
    """If silence gap < this, treat as same speech burst."""

    # Backchannel STT — use lightweight/fast STT for checking
    quick_stt_timeout: float = 1.5
    """Max seconds to wait for quick STT result."""

    # Language-specific adjustments
    indian_language_bonus_ms: float = 100.0
    """Extra wait time for Indian languages (more backchannels)."""


# Default configs per use case
CONFIGS = {
    "default": InterruptConfig(),
    "indian": InterruptConfig(
        min_speech_ms=350.0,
        confirm_speech_ms=600.0,
        indian_language_bonus_ms=150.0,
    ),
    "english": InterruptConfig(
        min_speech_ms=250.0,
        confirm_speech_ms=400.0,
        indian_language_bonus_ms=0.0,
    ),
    "sensitive": InterruptConfig(
        min_speech_ms=200.0,
        confirm_speech_ms=350.0,
        vad_confidence_threshold=0.6,
    ),
}

_INDIAN_LANGS = {"ta", "hi", "te", "kn", "ml", "mr", "bn", "gu", "pa", "or"}


def get_config(language: str = "en") -> InterruptConfig:
    """Pick the right config based on language."""
    lang = (language or "en")[:2].lower()
    if lang in _INDIAN_LANGS:
        return CONFIGS["indian"]
    return CONFIGS["english"]


# ---------------------------------------------------------------------------
# InterruptionManager
# ---------------------------------------------------------------------------

class InterruptionManager:
    """Monitors incoming user audio during agent playback for real interrupts.

    Create one per WebSocket session. Call `check()` on every incoming audio
    chunk while the agent is speaking. Call `reset()` when a new agent turn
    starts or after an interrupt is confirmed.

    Args:
        vad_engine: VADEngine instance (from vad/vad_engine.py)
        language:   Current conversation language code
        config:     Override interrupt thresholds (optional)
    """

    #: Maps interruption_sensitivity values to min_speech_ms overrides.
    _SENSITIVITY_MS: dict[str, float] = {
        "low":    500.0,   # only obvious speech triggers barge-in
        "medium": 300.0,   # default — balanced
        "high":   150.0,   # react quickly (e.g. command-style agents)
    }

    def __init__(
        self,
        vad_engine: Any,
        language: str = "en",
        config: InterruptConfig | None = None,
        interruption_sensitivity: str = "medium",
    ):
        self._vad = vad_engine
        self._language = (language or "en")[:2].lower()
        self._config = config or get_config(self._language)

        # Apply sensitivity override — read from agent config when provided.
        sensitivity_key = (interruption_sensitivity or "medium").lower()
        override_ms = self._SENSITIVITY_MS.get(sensitivity_key)
        if override_ms is not None:
            self._config.min_speech_ms = override_ms

        # State tracking
        self._speech_start: float | None = None
        self._last_speech_time: float | None = None
        self._audio_buffer: list[bytes] = []
        self._total_speech_ms: float = 0.0
        self._chunk_count: int = 0

        # Quick STT cache — avoid re-transcribing the same audio
        self._quick_stt_result: str | None = None
        self._quick_stt_task: asyncio.Task | None = None

        # Track what agent was saying at interrupt time
        self._agent_text_so_far: str = ""

    @property
    def is_tracking_speech(self) -> bool:
        """True if we're currently accumulating speech from the user."""
        return self._speech_start is not None

    def set_agent_text(self, text: str) -> None:
        """Update the agent's partial text (call as TTS chunks are sent)."""
        self._agent_text_so_far = text

    def update_language(self, language: str) -> None:
        """Update language mid-conversation (e.g., after language detection)."""
        self._language = (language or "en")[:2].lower()
        self._config = get_config(self._language)

    def reset(self) -> None:
        """Reset state for a new agent turn. Call when agent starts speaking."""
        self._speech_start = None
        self._last_speech_time = None
        self._audio_buffer.clear()
        self._total_speech_ms = 0.0
        self._chunk_count = 0
        self._quick_stt_result = None
        if self._quick_stt_task and not self._quick_stt_task.done():
            self._quick_stt_task.cancel()
        self._quick_stt_task = None
        self._agent_text_so_far = ""

    async def check(
        self,
        audio_chunk: bytes,
        sample_rate: int = 16000,
    ) -> InterruptDecision:
        """Check an incoming audio chunk for interrupt signals.

        Call this on EVERY audio chunk received while the agent is speaking.
        The audio is expected as raw PCM16 bytes (or whatever your VAD accepts).

        Returns an InterruptDecision telling the pipeline what to do.
        """
        self._chunk_count += 1
        now = time.monotonic()

        # ── Run VAD on this chunk ─────────────────────────────────────────
        try:
            vad_result = self._vad.detect_from_bytes(
                audio_chunk, sample_rate=sample_rate,
            )
        except Exception as exc:
            logger.debug("VAD error in interrupt check: %s", exc)
            return InterruptDecision(
                action=InterruptAction.IGNORE,
                reason="vad_error",
            )

        # ── No speech detected ────────────────────────────────────────────
        if not vad_result.is_speech:
            if self._speech_start is not None:
                # Was tracking speech — check if gap is too long
                gap_ms = (now - (self._last_speech_time or now)) * 1000
                if gap_ms > self._config.max_gap_ms:
                    # Speech ended — evaluate what we accumulated
                    return await self._evaluate_accumulated(now)
            return InterruptDecision(
                action=InterruptAction.IGNORE,
                reason="no_speech",
            )

        # ── Speech detected ───────────────────────────────────────────────
        self._last_speech_time = now
        self._audio_buffer.append(audio_chunk)

        if self._speech_start is None:
            self._speech_start = now
            logger.debug("Interrupt monitor: speech started during playback")

        speech_ms = (now - self._speech_start) * 1000

        # Adjust threshold for Indian languages
        effective_min_ms = self._config.min_speech_ms
        if self._language in _INDIAN_LANGS:
            effective_min_ms += self._config.indian_language_bonus_ms

        # ── LAYER 1: Duration gate ────────────────────────────────────────
        if speech_ms < effective_min_ms:
            return InterruptDecision(
                action=InterruptAction.WAIT,
                reason=f"too_short_{speech_ms:.0f}ms<{effective_min_ms:.0f}ms",
                speech_duration_ms=speech_ms,
                vad_confidence=vad_result.confidence,
            )

        # ── LAYER 2: Backchannel check (at ~300ms mark) ──────────────────
        # Fire quick STT once we have enough audio, then check backchannel
        if self._quick_stt_result is None and self._quick_stt_task is None:
            self._quick_stt_task = asyncio.create_task(
                self._run_quick_stt(sample_rate),
            )

        # Check if quick STT has completed
        if self._quick_stt_task and self._quick_stt_task.done():
            try:
                self._quick_stt_result = self._quick_stt_task.result()
            except Exception:
                self._quick_stt_result = ""

            if self._quick_stt_result:
                if self._is_backchannel(self._quick_stt_result):
                    logger.debug(
                        "Interrupt suppressed: backchannel '%s'",
                        self._quick_stt_result,
                    )
                    self._reset_speech_state()
                    return InterruptDecision(
                        action=InterruptAction.IGNORE,
                        reason=f"backchannel:{self._quick_stt_result}",
                        speech_duration_ms=speech_ms,
                        transcript=self._quick_stt_result,
                    )

        # ── LAYER 3: Sustained speech + confidence ────────────────────────
        effective_confirm_ms = self._config.confirm_speech_ms
        if self._language in _INDIAN_LANGS:
            effective_confirm_ms += self._config.indian_language_bonus_ms

        if speech_ms < effective_confirm_ms:
            return InterruptDecision(
                action=InterruptAction.WAIT,
                reason=f"confirming_{speech_ms:.0f}ms<{effective_confirm_ms:.0f}ms",
                speech_duration_ms=speech_ms,
                vad_confidence=vad_result.confidence,
            )

        if vad_result.confidence < self._config.vad_confidence_threshold:
            return InterruptDecision(
                action=InterruptAction.WAIT,
                reason=f"low_confidence_{vad_result.confidence:.2f}",
                speech_duration_ms=speech_ms,
                vad_confidence=vad_result.confidence,
            )

        # ── CONFIRMED INTERRUPT ───────────────────────────────────────────
        accumulated = b"".join(self._audio_buffer)
        transcript = self._quick_stt_result or ""
        agent_text = self._agent_text_so_far

        logger.info(
            "INTERRUPT confirmed: speech=%.0fms confidence=%.2f transcript='%s'",
            speech_ms,
            vad_result.confidence,
            transcript[:50],
        )

        self._reset_speech_state()

        return InterruptDecision(
            action=InterruptAction.INTERRUPT,
            reason="confirmed_interrupt",
            speech_duration_ms=speech_ms,
            transcript=transcript,
            accumulated_audio=accumulated,
            vad_confidence=vad_result.confidence,
            agent_partial_text=agent_text,
        )

    async def _evaluate_accumulated(self, now: float) -> InterruptDecision:
        """Evaluate accumulated speech after silence gap exceeded."""
        speech_ms = self._total_speech_ms
        if self._speech_start:
            speech_ms = ((self._last_speech_time or now) - self._speech_start) * 1000

        # Too short overall — ignore
        if speech_ms < self._config.min_speech_ms:
            self._reset_speech_state()
            return InterruptDecision(
                action=InterruptAction.IGNORE,
                reason=f"short_burst_{speech_ms:.0f}ms",
                speech_duration_ms=speech_ms,
            )

        # Check backchannel from quick STT
        if self._quick_stt_task and not self._quick_stt_task.done():
            try:
                self._quick_stt_result = await asyncio.wait_for(
                    self._quick_stt_task,
                    timeout=0.5,
                )
            except (asyncio.TimeoutError, Exception):
                self._quick_stt_result = ""

        if self._quick_stt_result and self._is_backchannel(self._quick_stt_result):
            self._reset_speech_state()
            return InterruptDecision(
                action=InterruptAction.IGNORE,
                reason=f"backchannel_after_gap:{self._quick_stt_result}",
                speech_duration_ms=speech_ms,
                transcript=self._quick_stt_result,
            )

        # Enough speech but ended — still an interrupt
        accumulated = b"".join(self._audio_buffer)
        transcript = self._quick_stt_result or ""
        agent_text = self._agent_text_so_far

        logger.info(
            "INTERRUPT (post-gap): speech=%.0fms transcript='%s'",
            speech_ms,
            transcript[:50],
        )

        self._reset_speech_state()

        return InterruptDecision(
            action=InterruptAction.INTERRUPT,
            reason="confirmed_after_gap",
            speech_duration_ms=speech_ms,
            transcript=transcript,
            accumulated_audio=accumulated,
            agent_partial_text=agent_text,
        )

    def _is_backchannel(self, text: str) -> bool:
        """Check if text is a backchannel using smart_turn.py."""
        try:
            from voice_engine.smart_turn import TurnSignal, evaluate_turn

            decision = evaluate_turn(
                transcript=text,
                language=self._language,
            )
            return decision.signal == TurnSignal.BACKCHANNEL
        except Exception:
            # Fallback: simple string match
            return self._is_backchannel_simple(text)

    def _is_backchannel_simple(self, text: str) -> bool:
        """Lightweight backchannel check without smart_turn import."""
        normalized = text.strip().lower()
        # Common backchannels and noise tokens across Indian languages
        tokens = {
            "ok", "okay", "yes", "yeah", "hmm", "mm", "mmm",
            "haan", "han", "ji", "accha", "thik",
            "sari", "aama", "ama", "seri",
            "um", "uh", "mhm", "hm",
        }
        return normalized in tokens or len(normalized) <= 3

    async def _run_quick_stt(self, sample_rate: int) -> str:
        """Run lightweight STT on accumulated audio buffer.

        Uses Deepgram (fastest) or falls back to a short Whisper call.
        Only needs to transcribe ~0.5s of audio — keep it fast.
        """
        if not self._audio_buffer:
            return ""

        audio_bytes = b"".join(self._audio_buffer)

        # Try Deepgram (fastest, ~100-200ms for short audio)
        try:
            from voice_engine.api_providers import transcribe_ensemble

            result = await asyncio.wait_for(
                transcribe_ensemble(
                    audio_bytes,
                    language=self._language,
                    sample_rate=sample_rate,
                ),
                timeout=self._config.quick_stt_timeout,
            )
            return result.get("transcription", "")
        except asyncio.TimeoutError:
            logger.debug("Quick STT timed out")
            return ""
        except Exception as exc:
            logger.debug("Quick STT failed: %s", exc)
            return ""

    def _reset_speech_state(self) -> None:
        """Clear speech tracking without full reset."""
        self._speech_start = None
        self._last_speech_time = None
        self._audio_buffer.clear()
        self._total_speech_ms = 0.0
        self._quick_stt_result = None
        if self._quick_stt_task and not self._quick_stt_task.done():
            self._quick_stt_task.cancel()
        self._quick_stt_task = None


# ---------------------------------------------------------------------------
# Session-level task tracker for cancellation
# ---------------------------------------------------------------------------

class SessionTaskTracker:
    """Tracks asyncio tasks per session so they can be cancelled on interrupt.

    Usage:
        tracker = SessionTaskTracker()

        # When creating tasks during a turn:
        task = asyncio.create_task(some_work())
        tracker.track(session_id, task)

        # On interrupt:
        cancelled = await tracker.cancel_all(session_id)

        # On turn complete:
        tracker.clear(session_id)
    """

    def __init__(self):
        self._tasks: dict[str, list[asyncio.Task]] = {}

    def track(self, session_id: str, task: asyncio.Task) -> None:
        """Register a task for a session."""
        if session_id not in self._tasks:
            self._tasks[session_id] = []
        self._tasks[session_id].append(task)

    async def cancel_all(self, session_id: str) -> int:
        """Cancel all running tasks for a session. Returns count cancelled."""
        tasks = self._tasks.pop(session_id, [])
        cancelled = 0
        for task in tasks:
            if not task.done():
                task.cancel()
                cancelled += 1
                try:
                    await asyncio.wait_for(
                        asyncio.shield(task),
                        timeout=0.1,
                    )
                except (asyncio.CancelledError, asyncio.TimeoutError, Exception):
                    pass
        return cancelled

    def clear(self, session_id: str) -> None:
        """Remove completed task references for a session."""
        tasks = self._tasks.get(session_id, [])
        self._tasks[session_id] = [t for t in tasks if not t.done()]

    def cleanup_session(self, session_id: str) -> None:
        """Full cleanup when session ends."""
        self._tasks.pop(session_id, None)
