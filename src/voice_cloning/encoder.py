"""
Speaker Encoder — Extract voice embeddings (fingerprints)
==========================================================
Extracts a d-vector / speaker embedding from reference audio.
This embedding captures the unique characteristics of a voice.

Providers:
  1. XTTS v2 (Coqui) — best quality, needs GPU for speed
  2. Resemblyzer — lightweight CPU encoder
"""

import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

EMBEDDINGS_DIR = os.getenv("VOICE_EMBEDDINGS_DIR", "data/voice_embeddings")


class SpeakerEncoder:
    """Extract and manage speaker voice embeddings."""

    def __init__(self, provider: str = "auto"):
        self._provider = provider
        self._xtts_model = None
        os.makedirs(EMBEDDINGS_DIR, exist_ok=True)

    def _get_provider(self) -> str:
        if self._provider != "auto":
            return self._provider
        # Try XTTS first, fall back to resemblyzer
        try:
            import torch
            from TTS.tts.models.xtts import Xtts
            return "xtts"
        except ImportError:
            pass
        try:
            from resemblyzer import VoiceEncoder
            return "resemblyzer"
        except ImportError:
            pass
        return "basic"

    def extract_embedding(self, audio_path: str) -> Dict[str, Any]:
        """Extract speaker embedding from audio file.

        Returns dict with embedding data + metadata.
        """
        provider = self._get_provider()
        logger.info("Extracting embedding with provider: %s", provider)

        if provider == "xtts":
            return self._extract_xtts(audio_path)
        elif provider == "resemblyzer":
            return self._extract_resemblyzer(audio_path)
        return self._extract_basic(audio_path)

    def _extract_xtts(self, audio_path: str) -> Dict[str, Any]:
        """Extract using XTTS v2 (highest quality)."""
        import torch
        from TTS.api import TTS

        if self._xtts_model is None:
            logger.info("Loading XTTS v2 model...")
            self._xtts_model = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
            logger.info("XTTS v2 loaded")

        # XTTS extracts conditioning latents internally
        return {
            "provider": "xtts_v2",
            "reference_audio": audio_path,
            "model": "tts_models/multilingual/multi-dataset/xtts_v2",
        }

    def _extract_resemblyzer(self, audio_path: str) -> Dict[str, Any]:
        """Extract using Resemblyzer (lightweight CPU)."""
        import numpy as np
        from resemblyzer import VoiceEncoder, preprocess_wav

        encoder = VoiceEncoder()
        wav = preprocess_wav(audio_path)
        embedding = encoder.embed_utterance(wav)

        return {
            "provider": "resemblyzer",
            "embedding": embedding.tolist(),
            "embedding_dim": len(embedding),
        }

    def _extract_basic(self, audio_path: str) -> Dict[str, Any]:
        """Basic feature extraction (no ML, always works)."""
        import librosa
        import numpy as np

        audio, sr = librosa.load(audio_path, sr=22050, mono=True)

        # Extract MFCCs as basic voice fingerprint
        mfccs = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=40)
        embedding = np.mean(mfccs, axis=1)

        # Extract pitch statistics
        pitches, magnitudes = librosa.piptrack(y=audio, sr=sr)
        pitch_values = pitches[pitches > 0]
        pitch_mean = float(np.mean(pitch_values)) if len(pitch_values) > 0 else 0
        pitch_std = float(np.std(pitch_values)) if len(pitch_values) > 0 else 0

        return {
            "provider": "basic_mfcc",
            "embedding": embedding.tolist(),
            "embedding_dim": len(embedding),
            "pitch_mean": pitch_mean,
            "pitch_std": pitch_std,
        }

    def save_embedding(self, voice_id: str, embedding_data: Dict) -> str:
        """Save embedding to disk for reuse."""
        import json
        path = os.path.join(EMBEDDINGS_DIR, f"{voice_id}.json")
        with open(path, "w") as f:
            json.dump(embedding_data, f)
        logger.info("Embedding saved: %s", path)
        return path

    def load_embedding(self, voice_id: str) -> Optional[Dict]:
        """Load pre-computed embedding."""
        import json
        path = os.path.join(EMBEDDINGS_DIR, f"{voice_id}.json")
        if not os.path.exists(path):
            return None
        with open(path) as f:
            return json.load(f)
