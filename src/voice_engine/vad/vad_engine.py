"""
VAD Engine — Voice Activity Detection.

Detects speech segments in audio to avoid sending silence
to STT (saves latency + cost) and to support turn-taking.
"""

import logging
from dataclasses import dataclass, field
from enum import Enum

import numpy as np

logger = logging.getLogger(__name__)


class VADProvider(Enum):
    SILERO = "silero"
    ENERGY = "energy"


@dataclass
class VADResult:
    """Result from VAD processing."""
    is_speech: bool
    confidence: float  # 0.0 to 1.0
    speech_segments: list[tuple[float, float]] = field(default_factory=list)  # (start_s, end_s)
    total_speech_duration: float = 0.0
    total_silence_duration: float = 0.0
    speech_ratio: float = 0.0  # speech / total duration


class VADEngine:
    """Voice Activity Detection engine with multiple providers.

    Usage:
        vad = VADEngine()
        result = vad.detect(audio_array, sample_rate=16000)
        if result.is_speech:
            # Process audio through STT
    """

    def __init__(self, provider: str = "auto", threshold: float = 0.5):
        self.threshold = threshold
        self._silero_model = None
        self._provider = self._resolve_provider(provider)
        logger.info("VAD engine initialized: provider=%s, threshold=%.2f", self._provider, threshold)

    def _resolve_provider(self, provider: str) -> VADProvider:
        if provider == "auto":
            try:
                self._load_silero()
                return VADProvider.SILERO
            except Exception:
                logger.info("Silero VAD not available, using energy-based VAD")
                return VADProvider.ENERGY
        return VADProvider(provider)

    def _load_silero(self):
        """Load Silero VAD model (lazy)."""
        if self._silero_model is not None:
            return
        import torch
        model, utils = torch.hub.load(
            repo_or_dir="snakers4/silero-vad",
            model="silero_vad",
            trust_repo=True,
        )
        self._silero_model = model
        self._silero_utils = utils
        logger.info("Silero VAD model loaded")

    def detect(
        self,
        audio: np.ndarray,
        sample_rate: int = 16000,
    ) -> VADResult:
        """Detect voice activity in audio.

        Args:
            audio: Audio samples as numpy array (float32, mono)
            sample_rate: Sample rate in Hz

        Returns:
            VADResult with speech detection info
        """
        if self._provider == VADProvider.SILERO:
            return self._detect_silero(audio, sample_rate)
        return self._detect_energy(audio, sample_rate)

    def detect_from_bytes(
        self,
        audio_bytes: bytes,
        sample_rate: int = 16000,
        dtype: str = "int16",
    ) -> VADResult:
        """Detect VAD from raw audio bytes."""
        audio = np.frombuffer(audio_bytes, dtype=dtype).astype(np.float32)
        if dtype == "int16":
            audio = audio / 32768.0  # Normalize to [-1, 1]
        return self.detect(audio, sample_rate)

    def _detect_silero(self, audio: np.ndarray, sample_rate: int) -> VADResult:
        """Silero VAD — ML-based, high accuracy."""
        import torch
        self._load_silero()

        tensor = torch.from_numpy(audio).float()
        if sample_rate != 16000:
            import torchaudio
            tensor = torchaudio.functional.resample(tensor, sample_rate, 16000)

        # Process in 512-sample windows (32ms at 16kHz)
        window_size = 512
        speech_segments: list[tuple[float, float]] = []
        is_speech = False
        speech_start = 0.0
        total_speech = 0.0

        for i in range(0, len(tensor) - window_size, window_size):
            chunk = tensor[i : i + window_size]
            prob = self._silero_model(chunk, 16000).item()

            time_s = i / 16000.0

            if prob >= self.threshold and not is_speech:
                is_speech = True
                speech_start = time_s
            elif prob < self.threshold and is_speech:
                is_speech = False
                speech_segments.append((speech_start, time_s))
                total_speech += time_s - speech_start

        # Close open segment
        if is_speech:
            end_time = len(tensor) / 16000.0
            speech_segments.append((speech_start, end_time))
            total_speech += end_time - speech_start

        total_duration = len(tensor) / 16000.0
        total_silence = total_duration - total_speech

        # Overall speech confidence
        if len(tensor) > 0:
            full_prob = self._silero_model(tensor[:16000 * 30] if len(tensor) > 16000 * 30 else tensor, 16000).item()
        else:
            full_prob = 0.0

        return VADResult(
            is_speech=bool(speech_segments),
            confidence=full_prob,
            speech_segments=speech_segments,
            total_speech_duration=total_speech,
            total_silence_duration=total_silence,
            speech_ratio=total_speech / total_duration if total_duration > 0 else 0.0,
        )

    def _detect_energy(self, audio: np.ndarray, sample_rate: int) -> VADResult:
        """Energy-based VAD — no ML required, works everywhere."""
        frame_length = int(0.03 * sample_rate)  # 30ms frames
        hop_length = int(0.01 * sample_rate)    # 10ms hop

        speech_segments: list[tuple[float, float]] = []
        is_speech = False
        speech_start = 0.0
        total_speech = 0.0

        # Compute energy threshold from signal
        energy_values = []
        for i in range(0, len(audio) - frame_length, hop_length):
            frame = audio[i : i + frame_length]
            energy = np.sqrt(np.mean(frame ** 2))
            energy_values.append(energy)

        if not energy_values:
            return VADResult(is_speech=False, confidence=0.0)

        energy_arr = np.array(energy_values)
        # Adaptive threshold: mean + 0.5 * std of bottom 30%
        sorted_energy = np.sort(energy_arr)
        noise_floor = sorted_energy[: max(1, len(sorted_energy) // 3)]
        energy_threshold = np.mean(noise_floor) + 0.5 * np.std(noise_floor)
        energy_threshold = max(energy_threshold, 0.005)  # Minimum threshold

        for idx, energy in enumerate(energy_values):
            time_s = idx * hop_length / sample_rate

            if energy >= energy_threshold and not is_speech:
                is_speech = True
                speech_start = time_s
            elif energy < energy_threshold and is_speech:
                is_speech = False
                speech_segments.append((speech_start, time_s))
                total_speech += time_s - speech_start

        if is_speech:
            end_time = len(audio) / sample_rate
            speech_segments.append((speech_start, end_time))
            total_speech += end_time - speech_start

        total_duration = len(audio) / sample_rate
        total_silence = total_duration - total_speech

        # Confidence based on speech ratio and energy
        confidence = min(1.0, total_speech / max(total_duration, 0.001))

        return VADResult(
            is_speech=bool(speech_segments),
            confidence=confidence,
            speech_segments=speech_segments,
            total_speech_duration=total_speech,
            total_silence_duration=total_silence,
            speech_ratio=total_speech / total_duration if total_duration > 0 else 0.0,
        )

    def extract_speech(
        self,
        audio: np.ndarray,
        sample_rate: int = 16000,
        padding_ms: int = 200,
    ) -> np.ndarray | None:
        """Extract only speech portions from audio.

        Returns concatenated speech segments (removes silence).
        Useful for reducing STT processing time.
        """
        result = self.detect(audio, sample_rate)
        if not result.speech_segments:
            return None

        padding_samples = int(padding_ms * sample_rate / 1000)
        speech_chunks = []

        for start_s, end_s in result.speech_segments:
            start_idx = max(0, int(start_s * sample_rate) - padding_samples)
            end_idx = min(len(audio), int(end_s * sample_rate) + padding_samples)
            speech_chunks.append(audio[start_idx:end_idx])

        if not speech_chunks:
            return None

        return np.concatenate(speech_chunks)
