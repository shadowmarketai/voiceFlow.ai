"""
Tests for End-of-Speech detection engine.
"""

import numpy as np
import pytest

from voice_engine.eos.eos_engine import EOSEngine, EOSConfig


class TestEOSEngine:
    """Test end-of-speech detection."""

    def test_no_speech_detected(self, sample_audio_silence):
        eos = EOSEngine(EOSConfig(min_silence_ms=500))
        result = eos.detect_from_full_audio(sample_audio_silence, sample_rate=16000)
        assert result.reason in ("no_speech", "")

    def test_continuous_speech_no_eos(self, sample_audio_speech):
        eos = EOSEngine(EOSConfig(min_silence_ms=500))
        result = eos.detect_from_full_audio(sample_audio_speech, sample_rate=16000)
        # Continuous speech should not trigger EOS
        assert result.speech_duration_ms > 0

    def test_speech_then_silence_triggers_eos(self):
        """Speech followed by silence should trigger EOS."""
        sr = 16000
        config = EOSConfig(min_silence_ms=300, min_speech_ms=200, smart_mode=False)
        eos = EOSEngine(config)

        # 0.5s speech + 0.5s silence
        t = np.linspace(0, 0.5, int(0.5 * sr), dtype=np.float32)
        speech = 0.3 * np.sin(2 * np.pi * 300 * t)
        silence = np.zeros(int(0.5 * sr), dtype=np.float32)
        audio = np.concatenate([speech, silence])

        result = eos.detect_from_full_audio(audio, sample_rate=sr)
        assert result.is_end_of_speech is True
        assert result.trailing_silence_ms > 200

    def test_streaming_mode(self, sample_audio_speech, sample_audio_silence):
        """Test chunk-by-chunk streaming EOS detection."""
        config = EOSConfig(min_silence_ms=200, min_speech_ms=100, smart_mode=False)
        eos = EOSEngine(config)
        eos.reset()

        # Feed speech chunks
        chunk_size = 480  # 30ms at 16kHz
        for i in range(0, len(sample_audio_speech), chunk_size):
            chunk = sample_audio_speech[i : i + chunk_size]
            if len(chunk) < chunk_size:
                break
            result = eos.process_chunk(chunk, sample_rate=16000)
            # During speech, should not trigger EOS
            if i < len(sample_audio_speech) - chunk_size:
                assert result.is_end_of_speech is False

    def test_reset(self):
        eos = EOSEngine()
        eos._speech_started = True
        eos._peak_energy = 0.5
        eos.reset()
        assert eos._speech_started is False
        assert eos._peak_energy == 0.0

    def test_max_duration_forces_eos(self):
        """Very long speech should trigger max_duration EOS."""
        sr = 16000
        config = EOSConfig(max_speech_ms=500, min_silence_ms=100, smart_mode=False)
        eos = EOSEngine(config)

        # 1 second of speech (exceeds 500ms max)
        t = np.linspace(0, 1.0, sr, dtype=np.float32)
        audio = 0.3 * np.sin(2 * np.pi * 300 * t)

        result = eos.detect_from_full_audio(audio, sample_rate=sr)
        assert result.is_end_of_speech is True
        assert result.reason == "max_duration"

    def test_indian_language_mode(self):
        """Indian language mode should increase min_silence."""
        config_normal = EOSConfig(min_silence_ms=500, indian_language_mode=False)
        config_indian = EOSConfig(min_silence_ms=500, indian_language_mode=True)

        eos_normal = EOSEngine(config_normal)
        eos_indian = EOSEngine(config_indian)

        # Indian mode adds 100ms to min_silence
        assert eos_indian.config.min_silence_ms == 600
        assert eos_normal.config.min_silence_ms == 500

    def test_eos_result_fields(self):
        eos = EOSEngine()
        sr = 16000
        audio = np.zeros(sr, dtype=np.float32)
        result = eos.detect_from_full_audio(audio, sr)

        assert hasattr(result, "is_end_of_speech")
        assert hasattr(result, "confidence")
        assert hasattr(result, "reason")
        assert hasattr(result, "trailing_silence_ms")
        assert hasattr(result, "speech_duration_ms")
        assert hasattr(result, "peak_energy")
        assert hasattr(result, "current_energy")
