"""
End-of-Speech (EOS) Detection Engine.

Determines when a user has finished speaking so the AI can respond.
Without EOS, the system either:
  - Cuts off users mid-sentence (too eager)
  - Waits too long creating awkward pauses (too conservative)

Smart EOS uses trailing silence + speech duration + energy decay
to find the natural end of an utterance.
"""

import logging
import time
from dataclasses import dataclass
from enum import Enum
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class EOSConfig:
    """Configuration for end-of-speech detection."""

    # Silence thresholds
    min_silence_ms: int = 500
    """Minimum trailing silence to trigger EOS (ms).
    Lower = faster response, higher = fewer false triggers.
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
    Increases min_silence_ms by 100ms when enabled."""


@dataclass
class EOSResult:
    """Result from EOS detection."""
    is_end_of_speech: bool
    confidence: float  # 0.0 to 1.0
    reason: str  # "silence", "energy_decay", "max_duration", "smart"
    trailing_silence_ms: float
    speech_duration_ms: float
    peak_energy: float
    current_energy: float


class EOSEngine:
    """End-of-Speech detection engine.

    Tracks audio stream state and determines when user stops speaking.

    Usage (streaming):
        eos = EOSEngine()
        eos.reset()

        for audio_chunk in stream:
            result = eos.process_chunk(audio_chunk, sample_rate=16000)
            if result.is_end_of_speech:
                # User stopped speaking, generate AI response
                break
    """

    def __init__(self, config: Optional[EOSConfig] = None):
        self.config = config or EOSConfig()
        if self.config.indian_language_mode:
            self.config.min_silence_ms += 100

        # Streaming state
        self._speech_started = False
        self._speech_start_time: Optional[float] = None
        self._last_speech_time: Optional[float] = None
        self._peak_energy: float = 0.0
        self._chunk_count: int = 0

        logger.info(
            "EOS engine initialized: min_silence=%dms, smart=%s, indian_mode=%s",
            self.config.min_silence_ms,
            self.config.smart_mode,
            self.config.indian_language_mode,
        )

    def reset(self):
        """Reset state for a new utterance."""
        self._speech_started = False
        self._speech_start_time = None
        self._last_speech_time = None
        self._peak_energy = 0.0
        self._chunk_count = 0

    def process_chunk(
        self,
        audio_chunk: np.ndarray,
        sample_rate: int = 16000,
    ) -> EOSResult:
        """Process an audio chunk and check for end-of-speech.

        Args:
            audio_chunk: Audio samples (float32, mono)
            sample_rate: Sample rate in Hz

        Returns:
            EOSResult indicating if speech has ended
        """
        now = time.time()
        self._chunk_count += 1

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

        # 3. Min speech met + sufficient silence
        elif (
            speech_duration_ms >= self.config.min_speech_ms
            and trailing_silence_ms >= self.config.min_silence_ms
        ):
            if self.config.smart_mode:
                # Smart mode: also check energy decay
                energy_ratio = energy / (self._peak_energy + 1e-10)
                if energy_ratio < self.config.energy_decay_factor:
                    is_eos = True
                    reason = "smart"
                    # Confidence increases with longer silence
                    silence_factor = min(
                        1.0,
                        trailing_silence_ms / self.config.max_silence_ms,
                    )
                    energy_factor = 1.0 - energy_ratio
                    confidence = 0.5 * silence_factor + 0.5 * energy_factor
                else:
                    # Energy still high — user might continue
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
