"""
VoiceFlow AI — Test Fixtures
"""

import os
import sys

import numpy as np
import pytest

# Add src/ to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))


@pytest.fixture
def sample_audio_silence():
    """1 second of silence at 16kHz."""
    return np.zeros(16000, dtype=np.float32)


@pytest.fixture
def sample_audio_speech():
    """1 second of synthetic speech-like audio at 16kHz (sine wave + noise)."""
    t = np.linspace(0, 1.0, 16000, dtype=np.float32)
    # Simulate speech: 300Hz fundamental + harmonics + noise
    audio = (
        0.3 * np.sin(2 * np.pi * 300 * t)
        + 0.15 * np.sin(2 * np.pi * 600 * t)
        + 0.1 * np.sin(2 * np.pi * 900 * t)
        + 0.05 * np.random.randn(16000).astype(np.float32)
    )
    return audio


@pytest.fixture
def sample_audio_noisy():
    """1 second of speech with heavy noise."""
    t = np.linspace(0, 1.0, 16000, dtype=np.float32)
    speech = 0.3 * np.sin(2 * np.pi * 300 * t)
    noise = 0.2 * np.random.randn(16000).astype(np.float32)
    return (speech + noise).astype(np.float32)


@pytest.fixture
def sample_audio_bytes(sample_audio_speech):
    """Speech audio as int16 bytes."""
    int16 = (sample_audio_speech * 32768).clip(-32768, 32767).astype(np.int16)
    return int16.tobytes()


@pytest.fixture
def sample_audio_with_pause():
    """Audio: 0.5s speech + 0.8s silence + 0.3s speech."""
    sr = 16000
    t1 = np.linspace(0, 0.5, int(0.5 * sr), dtype=np.float32)
    speech1 = 0.3 * np.sin(2 * np.pi * 300 * t1)
    silence = np.zeros(int(0.8 * sr), dtype=np.float32)
    t2 = np.linspace(0, 0.3, int(0.3 * sr), dtype=np.float32)
    speech2 = 0.3 * np.sin(2 * np.pi * 400 * t2)
    return np.concatenate([speech1, silence, speech2])
