"""
End-of-Speech (EOS) Detection
===============================
Detects when a user has finished speaking for natural turn-taking.

Providers:
  - Silence-based (primary — configurable silence threshold)
  - Smart EOS (uses VAD + trailing silence + utterance analysis)
"""

from voice_engine.eos.eos_engine import EOSEngine, EOSResult, EOSConfig

__all__ = ["EOSEngine", "EOSResult", "EOSConfig"]
