"""
Tests for Voice Activity Detection engine.
"""

import numpy as np
import pytest

from voice_engine.vad.vad_engine import VADEngine, VADProvider


class TestEnergyVAD:
    """Test energy-based VAD (no ML deps required)."""

    def test_silence_detection(self, sample_audio_silence):
        vad = VADEngine(provider="energy")
        result = vad.detect(sample_audio_silence, sample_rate=16000)
        assert result.is_speech is False
        assert result.speech_ratio < 0.1

    def test_speech_detection(self, sample_audio_speech):
        vad = VADEngine(provider="energy")
        result = vad.detect(sample_audio_speech, sample_rate=16000)
        assert result.is_speech is True
        assert result.speech_ratio > 0.3

    def test_speech_segments_returned(self, sample_audio_speech):
        vad = VADEngine(provider="energy")
        result = vad.detect(sample_audio_speech, sample_rate=16000)
        assert len(result.speech_segments) > 0
        # Each segment is (start, end) tuple
        for start, end in result.speech_segments:
            assert end > start

    def test_speech_with_pause(self, sample_audio_with_pause):
        vad = VADEngine(provider="energy")
        result = vad.detect(sample_audio_with_pause, sample_rate=16000)
        assert result.is_speech is True
        # Should detect multiple segments (speech-silence-speech)
        assert result.total_silence_duration > 0.3

    def test_extract_speech(self, sample_audio_with_pause):
        vad = VADEngine(provider="energy")
        speech_only = vad.extract_speech(sample_audio_with_pause, sample_rate=16000)
        assert speech_only is not None
        # Extracted speech should be shorter than original (silence removed)
        assert len(speech_only) < len(sample_audio_with_pause)

    def test_extract_speech_from_silence(self, sample_audio_silence):
        vad = VADEngine(provider="energy")
        result = vad.extract_speech(sample_audio_silence, sample_rate=16000)
        assert result is None  # No speech to extract

    def test_detect_from_bytes(self, sample_audio_bytes):
        vad = VADEngine(provider="energy")
        result = vad.detect_from_bytes(sample_audio_bytes, sample_rate=16000)
        assert result.is_speech is True

    def test_vad_result_fields(self, sample_audio_speech):
        vad = VADEngine(provider="energy")
        result = vad.detect(sample_audio_speech, sample_rate=16000)
        assert 0.0 <= result.confidence <= 1.0
        assert result.total_speech_duration >= 0
        assert result.total_silence_duration >= 0
        assert 0.0 <= result.speech_ratio <= 1.0
