"""
Noise Reduction Engine — Clean audio for better STT accuracy.

Especially important for Indian telephony calls which often have
background noise, echo, and poor line quality.
"""

import logging
from enum import Enum
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


class NoiseMethod(Enum):
    SPECTRAL_GATE = "spectral_gate"
    WIENER = "wiener"


class NoiseReductionEngine:
    """Audio noise reduction for telephony.

    Usage:
        nr = NoiseReductionEngine()
        clean_audio = nr.reduce(noisy_audio, sample_rate=16000)
    """

    def __init__(
        self,
        method: str = "spectral_gate",
        aggressiveness: float = 1.0,
    ):
        """
        Args:
            method: "spectral_gate" or "wiener"
            aggressiveness: 0.0 (gentle) to 2.0 (aggressive). Default 1.0.
        """
        self.method = NoiseMethod(method)
        self.aggressiveness = min(2.0, max(0.0, aggressiveness))
        logger.info(
            "Noise reduction initialized: method=%s, aggressiveness=%.1f",
            self.method.value,
            self.aggressiveness,
        )

    def reduce(
        self,
        audio: np.ndarray,
        sample_rate: int = 16000,
        noise_profile: Optional[np.ndarray] = None,
    ) -> np.ndarray:
        """Reduce noise from audio.

        Args:
            audio: Audio samples (float32, mono)
            sample_rate: Sample rate in Hz
            noise_profile: Optional noise-only sample for calibration

        Returns:
            Cleaned audio (same shape as input)
        """
        if len(audio) == 0:
            return audio

        if self.method == NoiseMethod.SPECTRAL_GATE:
            return self._spectral_gate(audio, sample_rate, noise_profile)
        return self._wiener_filter(audio, sample_rate)

    def reduce_from_bytes(
        self,
        audio_bytes: bytes,
        sample_rate: int = 16000,
        dtype: str = "int16",
    ) -> bytes:
        """Reduce noise from raw audio bytes."""
        audio = np.frombuffer(audio_bytes, dtype=dtype).astype(np.float32)
        if dtype == "int16":
            audio = audio / 32768.0

        clean = self.reduce(audio, sample_rate)

        if dtype == "int16":
            clean = (clean * 32768.0).clip(-32768, 32767).astype(np.int16)
            return clean.tobytes()
        return clean.astype(np.float32).tobytes()

    def _spectral_gate(
        self,
        audio: np.ndarray,
        sample_rate: int,
        noise_profile: Optional[np.ndarray] = None,
    ) -> np.ndarray:
        """Spectral gating noise reduction.

        Estimates noise spectrum from quiet portions or provided profile,
        then gates frequency bins below the noise threshold.
        """
        n_fft = 2048
        hop = n_fft // 4

        # STFT
        stft = self._stft(audio, n_fft, hop)
        magnitude = np.abs(stft)
        phase = np.angle(stft)

        # Estimate noise spectrum
        if noise_profile is not None and len(noise_profile) > 0:
            noise_stft = self._stft(noise_profile, n_fft, hop)
            noise_mag = np.mean(np.abs(noise_stft), axis=1, keepdims=True)
        else:
            # Use first 0.5s or quietest 20% as noise estimate
            n_noise_frames = max(1, int(0.5 * sample_rate / hop))
            energy_per_frame = np.sum(magnitude ** 2, axis=0)
            quiet_indices = np.argsort(energy_per_frame)[:max(1, len(energy_per_frame) // 5)]
            noise_mag = np.mean(magnitude[:, quiet_indices], axis=1, keepdims=True)

        # Apply spectral gate
        threshold = noise_mag * (1.0 + self.aggressiveness)
        mask = np.maximum(0, 1.0 - threshold / (magnitude + 1e-10))
        mask = np.clip(mask, 0, 1)

        # Smooth mask to reduce artifacts
        from scipy.ndimage import uniform_filter1d
        mask = uniform_filter1d(mask, size=3, axis=1)

        # Apply mask and reconstruct
        clean_stft = magnitude * mask * np.exp(1j * phase)
        clean_audio = self._istft(clean_stft, n_fft, hop, len(audio))

        return clean_audio

    def _wiener_filter(self, audio: np.ndarray, sample_rate: int) -> np.ndarray:
        """Wiener filter noise reduction."""
        n_fft = 2048
        hop = n_fft // 4

        stft = self._stft(audio, n_fft, hop)
        power = np.abs(stft) ** 2

        # Estimate noise power from quietest frames
        energy_per_frame = np.sum(power, axis=0)
        quiet_indices = np.argsort(energy_per_frame)[:max(1, len(energy_per_frame) // 5)]
        noise_power = np.mean(power[:, quiet_indices], axis=1, keepdims=True)

        # Wiener filter
        gain = np.maximum(0, 1.0 - self.aggressiveness * noise_power / (power + 1e-10))
        gain = np.clip(gain, 0.05, 1.0)  # Floor to avoid musical noise

        clean_stft = stft * gain
        return self._istft(clean_stft, n_fft, hop, len(audio))

    @staticmethod
    def _stft(audio: np.ndarray, n_fft: int, hop: int) -> np.ndarray:
        """Short-time Fourier Transform."""
        window = np.hanning(n_fft)
        n_frames = 1 + (len(audio) - n_fft) // hop
        stft = np.zeros((n_fft // 2 + 1, n_frames), dtype=np.complex128)
        for i in range(n_frames):
            start = i * hop
            frame = audio[start : start + n_fft] * window
            stft[:, i] = np.fft.rfft(frame)
        return stft

    @staticmethod
    def _istft(stft: np.ndarray, n_fft: int, hop: int, length: int) -> np.ndarray:
        """Inverse STFT with overlap-add."""
        window = np.hanning(n_fft)
        n_frames = stft.shape[1]
        output = np.zeros(length)
        window_sum = np.zeros(length)

        for i in range(n_frames):
            start = i * hop
            end = min(start + n_fft, length)
            frame = np.fft.irfft(stft[:, i])
            actual_len = end - start
            output[start:end] += frame[:actual_len] * window[:actual_len]
            window_sum[start:end] += window[:actual_len] ** 2

        # Normalize
        nonzero = window_sum > 1e-10
        output[nonzero] /= window_sum[nonzero]
        return output.astype(np.float32)
