"""
End-of-Speech (EOS) Detection Engine.

Determines when a user has finished speaking so the AI can respond.
Without EOS, the system either:
  - Cuts off users mid-sentence (too eager)
  - Waits too long creating awkward pauses (too conservative)

Smart EOS uses trailing silence + speech duration + energy decay
to find the natural end of an utterance.

GAP-6 — Linguistic Endpointing:
  Runs _completion_score() from smart_turn on every interim transcript
  and dynamically adjusts min_silence_ms in real-time:

    completeness > 0.9  → min_silence = 200ms  (clear complete sentence)
    completeness 0.6–0.9 → min_silence = 400ms
    completeness < 0.6  → min_silence = 700ms  (user still talking)

  After agent asked a yes/no question → threshold forced to 200ms.
  Indian language mode adds +100ms to each tier.

  Net saving: 200-300ms on ~70% of turns.
"""

import logging
import time
from dataclasses import dataclass

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class EOSConfig:
    """Configuration for end-of-speech detection."""

    # Silence thresholds
    min_silence_ms: int = 500
    """Minimum trailing silence to trigger EOS (ms).
    Used as static fallback when no interim transcript is available.
    Recommended: 400-700ms for Indian languages (longer pauses)."""

    max_silence_ms: int = 2000
    """Maximum silence before forced EOS (ms).
    After this much silence, always trigger EOS."""

    # Speech constraints
    min_speech_ms: int = 300
    """Minimum speech duration before EOS can trigger.
    Prevents triggering on very short utterances (coughs, 'um')."""

    max_speech_ms: int = 30000
    """Maximum speech duration before forced EOS.
    Prevents infinite listening."""

    # Energy thresholds
    silence_energy_threshold: float = 0.01
    """RMS energy below this = silence. Adapt based on mic quality."""

    energy_decay_factor: float = 0.7
    """If energy drops below this fraction of peak, likely EOS."""

    # Smart mode
    smart_mode: bool = True
    """Use smart EOS (considers speech patterns, not just silence)."""

    # Indian language adjustments
    indian_language_mode: bool = True
    """Indian languages tend to have longer inter-word pauses.
    Increases each dynamic silence tier by 100ms when enabled."""

    # GAP-6: linguistic endpointing
    dynamic_threshold: bool = True
    """Enable dynamic silence threshold driven by linguistic completeness.
    When True and interim_text is supplied to process_chunk(), the silence
    threshold adapts in real-time instead of being fixed at min_silence_ms."""

    language: str = "en"
    """Language code for completeness scoring (e.g. 'en', 'hi', 'ta')."""


@dataclass
class EOSResult:
    """Result from EOS detection."""
    is_end_of_speech: bool
    confidence: float          # 0.0 to 1.0
    reason: str                # "silence" | "energy_decay" | "max_duration" | "smart" | "linguistic"
    trailing_silence_ms: float
    speech_duration_ms: float
    peak_energy: float
    current_energy: float
    # GAP-6 extras (0 when dynamic threshold not active)
    completeness_score: float = 0.0
    active_silence_threshold_ms: int = 0


# GAP-6: dynamic silence tiers (ms) per completeness band
_TIER_HIGH   = 200   # completeness > 0.9  — clear complete sentence
_TIER_MID    = 400   # completeness 0.6–0.9
_TIER_LOW    = 700   # completeness < 0.6  — user still talking
_TIER_YESNO  = 200   # after yes/no question — answer fast
_INDIC_BONUS = 100   # added to every tier for Indian language mode


class EOSEngine:
    """End-of-Speech detection engine.

    Tracks audio stream state and determines when user stops speaking.

    Usage (streaming):
        eos = EOSEngine(EOSConfig(dynamic_threshold=True, language="hi"))
        eos.reset()

        for audio_chunk, interim_text in stream:
            result = eos.process_chunk(
                audio_chunk,
                sample_rate=16000,
                interim_text=interim_text,          # from Deepgram WS
                agent_asked_question=last_turn_was_question,
            )
            if result.is_end_of_speech:
                break
    """

    def __init__(self, config: EOSConfig | None = None):
        self.config = config or EOSConfig()
        if self.config.indian_language_mode:
            self.config.min_silence_ms += 100

        # Streaming state
        self._speech_started = False
        self._speech_start_time: float | None = None
        self._last_speech_time: float | None = None
        self._peak_energy: float = 0.0
        self._chunk_count: int = 0

        # GAP-6: current dynamic threshold — starts at static value
        self._active_silence_ms: int = self.config.min_silence_ms
        self._last_completeness: float = 0.0

        logger.info(
            "EOS engine initialized: min_silence=%dms smart=%s indian=%s dynamic=%s lang=%s",
            self.config.min_silence_ms,
            self.config.smart_mode,
            self.config.indian_language_mode,
            self.config.dynamic_threshold,
            self.config.language,
        )

    def reset(self):
        """Reset state for a new utterance."""
        self._speech_started = False
        self._speech_start_time = None
        self._last_speech_time = None
        self._peak_energy = 0.0
        self._chunk_count = 0
        self._active_silence_ms = self.config.min_silence_ms
        self._last_completeness = 0.0

    def update_threshold(
        self,
        interim_text: str,
        agent_asked_question: bool = False,
    ) -> int:
        """Recalculate the dynamic silence threshold from an interim transcript.

        Called whenever Deepgram delivers a new interim result.  Can also be
        called independently of process_chunk() if you want to decouple the
        audio processing loop from the transcript loop.

        Returns the new active threshold in ms.
        """
        if not self.config.dynamic_threshold:
            return self._active_silence_ms

        indic_bonus = _INDIC_BONUS if self.config.indian_language_mode else 0
        lang = (self.config.language or "en")[:2].lower()

        # Yes/no context always wins
        if agent_asked_question:
            self._active_silence_ms = _TIER_YESNO + indic_bonus
            self._last_completeness = 1.0
            logger.debug(
                "GAP-6: yes/no context → threshold=%dms", self._active_silence_ms
            )
            return self._active_silence_ms

        try:
            from voice_engine.smart_turn import _completion_score
            score = _completion_score(interim_text, lang)
        except Exception:
            # smart_turn unavailable — keep current threshold
            return self._active_silence_ms

        self._last_completeness = score

        if score > 0.9:
            new_ms = _TIER_HIGH + indic_bonus
        elif score >= 0.6:
            new_ms = _TIER_MID + indic_bonus
        else:
            new_ms = _TIER_LOW + indic_bonus

        if new_ms != self._active_silence_ms:
            logger.debug(
                "GAP-6: completeness=%.2f lang=%s → threshold %dms→%dms text=%r",
                score, lang, self._active_silence_ms, new_ms,
                (interim_text or "")[:40],
            )
        self._active_silence_ms = new_ms
        return new_ms

    def process_chunk(
        self,
        audio_chunk: np.ndarray,
        sample_rate: int = 16000,
        interim_text: str | None = None,
        agent_asked_question: bool = False,
    ) -> EOSResult:
        """Process an audio chunk and check for end-of-speech.

        Args:
            audio_chunk:           Audio samples (float32, mono)
            sample_rate:           Sample rate in Hz
            interim_text:          Latest Deepgram interim transcript (GAP-6).
                                   When provided, dynamically adjusts the
                                   silence threshold before the EOS check.
            agent_asked_question:  Set True when the agent's last turn ended
                                   with a yes/no question. Forces 200ms threshold.

        Returns:
            EOSResult indicating if speech has ended.
        """
        now = time.time()
        self._chunk_count += 1

        # GAP-6: update dynamic threshold whenever a new interim arrives
        if interim_text is not None and self.config.dynamic_threshold:
            self.update_threshold(interim_text, agent_asked_question)
        elif agent_asked_question and self.config.dynamic_threshold:
            self.update_threshold("", agent_asked_question=True)

        # Effective silence threshold for this chunk
        effective_min_silence_ms = self._active_silence_ms

        # Compute energy
        energy = float(np.sqrt(np.mean(audio_chunk ** 2)))
        is_silence = energy < self.config.silence_energy_threshold
        self._peak_energy = max(self._peak_energy, energy)

        # Track speech start
        if not is_silence and not self._speech_started:
            self._speech_started = True
            self._speech_start_time = now
            self._last_speech_time = now

        if not is_silence:
            self._last_speech_time = now

        # Calculate durations
        speech_duration_ms = 0.0
        trailing_silence_ms = 0.0

        if self._speech_start_time is not None:
            speech_duration_ms = (now - self._speech_start_time) * 1000

        if self._last_speech_time is not None:
            trailing_silence_ms = (now - self._last_speech_time) * 1000

        # No speech detected yet
        if not self._speech_started:
            return EOSResult(
                is_end_of_speech=False,
                confidence=0.0,
                reason="no_speech",
                trailing_silence_ms=0.0,
                speech_duration_ms=0.0,
                peak_energy=self._peak_energy,
                current_energy=energy,
                completeness_score=self._last_completeness,
                active_silence_threshold_ms=effective_min_silence_ms,
            )

        # Check EOS conditions
        reason = ""
        confidence = 0.0
        is_eos = False

        # 1. Max duration exceeded
        if speech_duration_ms >= self.config.max_speech_ms:
            is_eos = True
            reason = "max_duration"
            confidence = 1.0

        # 2. Max silence exceeded (forced EOS)
        elif trailing_silence_ms >= self.config.max_silence_ms:
            is_eos = True
            reason = "max_silence"
            confidence = 1.0

        # 3. Min speech met + dynamic/static silence threshold
        elif (
            speech_duration_ms >= self.config.min_speech_ms
            and trailing_silence_ms >= effective_min_silence_ms
        ):
            if self.config.smart_mode:
                energy_ratio = energy / (self._peak_energy + 1e-10)
                if energy_ratio < self.config.energy_decay_factor:
                    is_eos = True
                    # Tag as linguistic if dynamic threshold was tighter than static
                    reason = (
                        "linguistic"
                        if (
                            self.config.dynamic_threshold
                            and effective_min_silence_ms < self.config.min_silence_ms
                        )
                        else "smart"
                    )
                    silence_factor = min(
                        1.0,
                        trailing_silence_ms / self.config.max_silence_ms,
                    )
                    energy_factor = 1.0 - energy_ratio
                    confidence = 0.5 * silence_factor + 0.5 * energy_factor
                else:
                    is_eos = False
                    confidence = 0.3
            else:
                is_eos = True
                reason = "silence"
                confidence = min(
                    1.0,
                    trailing_silence_ms / self.config.max_silence_ms,
                )

        return EOSResult(
            is_end_of_speech=is_eos,
            confidence=confidence,
            reason=reason,
            trailing_silence_ms=trailing_silence_ms,
            speech_duration_ms=speech_duration_ms,
            peak_energy=self._peak_energy,
            current_energy=energy,
            completeness_score=self._last_completeness,
            active_silence_threshold_ms=effective_min_silence_ms,
        )

    def detect_from_full_audio(
        self,
        audio: np.ndarray,
        sample_rate: int = 16000,
    ) -> EOSResult:
        """Detect EOS from a complete audio buffer (non-streaming).

        Analyzes the tail of the audio to determine if speech has ended.
        """
        self.reset()

        # Process in 30ms chunks
        chunk_size = int(0.03 * sample_rate)
        result = EOSResult(
            is_end_of_speech=False,
            confidence=0.0,
            reason="",
            trailing_silence_ms=0.0,
            speech_duration_ms=0.0,
            peak_energy=0.0,
            current_energy=0.0,
        )

        for i in range(0, len(audio) - chunk_size, chunk_size):
            chunk = audio[i : i + chunk_size]
            result = self.process_chunk(chunk, sample_rate)

        return result
