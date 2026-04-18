"""
Audio Preprocessor for Voice Cloning
======================================
Cleans and validates audio samples before embedding extraction.
"""

import logging
import tempfile

import librosa
import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)


class AudioPreprocessor:
    """Preprocess audio samples for optimal voice cloning quality."""

    def __init__(self, target_sr: int = 22050):
        self.target_sr = target_sr

    def load_and_normalize(self, file_path: str) -> tuple[np.ndarray, int]:
        """Load audio and normalize to target sample rate."""
        audio, sr = librosa.load(file_path, sr=None, mono=True)
        if sr != self.target_sr:
            audio = librosa.resample(audio, orig_sr=sr, target_sr=self.target_sr)
        return audio, self.target_sr

    def remove_noise(self, audio: np.ndarray, sr: int) -> np.ndarray:
        """Remove background noise using spectral gating."""
        try:
            import noisereduce as nr
            noise_sample = audio[: sr // 2]
            return nr.reduce_noise(
                y=audio, sr=sr, y_noise=noise_sample,
                prop_decrease=0.75, stationary=False,
            )
        except ImportError:
            logger.warning("noisereduce not installed, using built-in spectral gate")
            from voice_engine.noise_reduction import NoiseReductionEngine
            nr_engine = NoiseReductionEngine(method="spectral_gate", aggressiveness=0.8)
            return nr_engine.reduce(audio, sr)

    def normalize_volume(self, audio: np.ndarray) -> np.ndarray:
        """Peak normalize to -1dB."""
        peak = np.max(np.abs(audio))
        if peak > 0:
            audio = audio / peak * 0.95
        return audio

    def trim_silence(self, audio: np.ndarray, sr: int) -> np.ndarray:
        """Remove leading/trailing silence."""
        trimmed, _ = librosa.effects.trim(audio, top_db=20)
        return trimmed

    def calculate_snr(self, audio: np.ndarray) -> float:
        """Estimate Signal-to-Noise Ratio in dB."""
        signal_power = np.mean(audio ** 2)
        noise_floor = np.percentile(np.abs(audio), 10) ** 2
        if noise_floor == 0:
            return 60.0
        return float(10 * np.log10(signal_power / (noise_floor + 1e-10)))

    def quality_check(self, audio: np.ndarray, sr: int) -> dict:
        """Check if sample meets minimum quality for cloning."""
        duration = len(audio) / sr
        snr = self.calculate_snr(audio)

        return {
            "duration_seconds": round(duration, 2),
            "snr_db": round(snr, 2),
            "sample_rate": sr,
            "duration_ok": duration >= 6.0,
            "snr_ok": snr >= 15,
            "ready": duration >= 6.0 and snr >= 15,
            "issues": self._get_issues(duration, snr),
        }

    def _get_issues(self, duration: float, snr: float) -> list:
        issues = []
        if duration < 6.0:
            issues.append(f"Too short: {duration:.1f}s (need 6s minimum, 30s+ recommended)")
        if snr < 15:
            issues.append(f"Too noisy: SNR {snr:.1f}dB (need 15dB+, record in quiet room)")
        if duration < 30:
            issues.append(f"For best quality, record 30s-5min (currently {duration:.1f}s)")
        return issues

    def process(self, file_path: str) -> dict:
        """Full preprocessing pipeline. Returns processed audio + quality report."""
        audio, sr = self.load_and_normalize(file_path)
        audio = self.remove_noise(audio, sr)
        audio = self.normalize_volume(audio)
        audio = self.trim_silence(audio, sr)

        quality = self.quality_check(audio, sr)

        # Save processed audio to temp file
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as _tmp:
            processed_path = _tmp.name
        sf.write(processed_path, audio, sr)

        return {
            "audio": audio,
            "sr": sr,
            "processed_path": processed_path,
            "quality": quality,
        }
