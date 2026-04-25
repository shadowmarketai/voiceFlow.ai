"""
Voice pipeline state machine.

States
------
IDLE        No active turn. Ready for user input.
LISTENING   Audio is being buffered. VAD active.
PROCESSING  STT → LLM → TTS running. Barge-in accepted.
SPEAKING    TTS audio sent to client. Barge-in detection active.

Valid transitions
-----------------
IDLE       → LISTENING   (first audio chunk / end_turn with buffered audio)
LISTENING  → PROCESSING  (end_turn or silence timeout)
LISTENING  → IDLE        (silence without speech)
PROCESSING → SPEAKING    (first audio chunk sent to client)
PROCESSING → LISTENING   (barge-in or explicit interrupt)
SPEAKING   → LISTENING   (turn complete or barge-in)
SPEAKING   → IDLE        (session ends)
ANY        → IDLE        (error / reset)

Violations are logged as warnings and the transition is blocked.
"""
from __future__ import annotations

import asyncio
import logging
from enum import Enum

logger = logging.getLogger(__name__)

_VALID: dict[str, set[str]] = {
    "IDLE":       {"LISTENING"},
    "LISTENING":  {"PROCESSING", "IDLE"},
    "PROCESSING": {"SPEAKING", "LISTENING", "IDLE"},
    "SPEAKING":   {"LISTENING", "IDLE"},
}


class CallState(str, Enum):
    IDLE       = "IDLE"
    LISTENING  = "LISTENING"
    PROCESSING = "PROCESSING"
    SPEAKING   = "SPEAKING"


class StateMachine:
    """Thread-safe (asyncio-safe) call state machine."""

    def __init__(self, session_id: str = "") -> None:
        self._state = CallState.IDLE
        self._session_id = session_id
        self._lock = asyncio.Lock()

    @property
    def state(self) -> CallState:
        return self._state

    async def transition(self, new: CallState, reason: str = "") -> bool:
        """Attempt a state transition. Returns True if allowed and applied."""
        async with self._lock:
            allowed = _VALID.get(self._state.value, set())
            if new.value not in allowed:
                logger.warning(
                    "[StateMachine] BLOCKED %s → %s (session=%s reason=%s)",
                    self._state.value, new.value, self._session_id, reason,
                )
                return False
            logger.debug(
                "[StateMachine] %s → %s (session=%s reason=%s)",
                self._state.value, new.value, self._session_id, reason,
            )
            self._state = new
            return True

    def force(self, new: CallState, reason: str = "reset") -> None:
        """Force any transition — use only for error recovery."""
        logger.info(
            "[StateMachine] FORCE %s → %s (session=%s reason=%s)",
            self._state.value, new.value, self._session_id, reason,
        )
        self._state = new

    def is_busy(self) -> bool:
        """True when the pipeline is actively running (processing or speaking)."""
        return self._state in (CallState.PROCESSING, CallState.SPEAKING)

    def can_start_turn(self) -> bool:
        """True when we can start a new processing turn."""
        return self._state == CallState.LISTENING

    def can_accept_audio(self) -> bool:
        """True when incoming audio should be buffered."""
        return self._state in (CallState.IDLE, CallState.LISTENING)
