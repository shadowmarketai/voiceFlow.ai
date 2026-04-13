"""
VoiceFlow AI — Voice Cloning Engine
=====================================
Record 30s-5min audio → Clone → Type any text → Speaks in that voice

Providers (priority order):
  1. XTTS v2 (self-hosted, free, 17 languages)
  2. OpenVoice V2 (zero-shot, multilingual)
  3. ElevenLabs API (highest quality, paid)
  4. PlayHT API (130+ languages, paid)

Pipeline: Audio → Preprocess → Quality Check → Extract Embedding → Store
          Text → Load Embedding → Synthesize → Stream/Download
"""
