"""
Voice Activity Detection (VAD) Engine
======================================
Detects when a user is speaking vs silent.

Providers:
  - Silero VAD (primary — lightweight, accurate)
  - Energy-based VAD (fallback — no ML required)
"""

from voice_engine.vad.vad_engine import VADEngine, VADProvider, VADResult

__all__ = ["VADEngine", "VADResult", "VADProvider"]
