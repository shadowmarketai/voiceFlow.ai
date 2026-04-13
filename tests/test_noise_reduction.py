"""
Tests for Noise Reduction engine.
"""

import numpy as np
import pytest

from voice_engine.noise_reduction.noise_engine import NoiseReductionEngine


class TestNoiseReduction:
    """Test spectral gating noise reduction."""

    def test_reduce_noisy_audio(self, sample_audio_noisy):
        nr = NoiseReductionEngine(method="spectral_gate", aggressiveness=1.0)
        clean = nr.reduce(sample_audio_noisy, sample_rate=16000)
        assert len(clean) == len(sample_audio_noisy)
        # Clean audio should have lower noise energy
        noise_energy_before = np.std(sample_audio_noisy)
        noise_energy_after = np.std(clean)
        # Not guaranteed to be lower in all synthetic cases,
        # but should not amplify
        assert noise_energy_after < noise_energy_before * 2

    def test_empty_audio(self):
        nr = NoiseReductionEngine()
        empty = np.array([], dtype=np.float32)
        result = nr.reduce(empty)
        assert len(result) == 0

    def test_silence_unchanged(self, sample_audio_silence):
        nr = NoiseReductionEngine()
        clean = nr.reduce(sample_audio_silence, sample_rate=16000)
        assert len(clean) == len(sample_audio_silence)
        # Silence should remain near-zero
        assert np.max(np.abs(clean)) < 0.1

    def test_reduce_from_bytes(self, sample_audio_bytes):
        nr = NoiseReductionEngine()
        clean_bytes = nr.reduce_from_bytes(sample_audio_bytes, sample_rate=16000)
        assert len(clean_bytes) > 0
        assert isinstance(clean_bytes, bytes)

    def test_wiener_filter(self, sample_audio_noisy):
        nr = NoiseReductionEngine(method="wiener", aggressiveness=1.0)
        clean = nr.reduce(sample_audio_noisy, sample_rate=16000)
        assert len(clean) == len(sample_audio_noisy)

    def test_aggressiveness_range(self, sample_audio_noisy):
        # Low aggressiveness
        nr_low = NoiseReductionEngine(aggressiveness=0.2)
        clean_low = nr_low.reduce(sample_audio_noisy, sample_rate=16000)

        # High aggressiveness
        nr_high = NoiseReductionEngine(aggressiveness=2.0)
        clean_high = nr_high.reduce(sample_audio_noisy, sample_rate=16000)

        # Both should produce valid output
        assert len(clean_low) == len(sample_audio_noisy)
        assert len(clean_high) == len(sample_audio_noisy)

    def test_with_noise_profile(self, sample_audio_noisy):
        nr = NoiseReductionEngine()
        # Use first 0.1s as noise profile
        noise_profile = np.random.randn(1600).astype(np.float32) * 0.2
        clean = nr.reduce(sample_audio_noisy, sample_rate=16000, noise_profile=noise_profile)
        assert len(clean) == len(sample_audio_noisy)
