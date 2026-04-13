"""
Noise Reduction Engine
=======================
Cleans audio before STT processing.

Providers:
  - Spectral Gating (primary — no extra deps)
  - RNNoise (optional — requires rnnoise binary)
"""

from voice_engine.noise_reduction.noise_engine import NoiseReductionEngine

__all__ = ["NoiseReductionEngine"]
