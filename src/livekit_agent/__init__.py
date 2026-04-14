"""
VoiceFlow AI — LiveKit Integration
====================================
Real-time voice AI using LiveKit for WebRTC transport.

Architecture:
  Browser ─LiveKit WebRTC─> LiveKit Cloud ─> VoiceFlow Agent
                                               │
                                    Deepgram STT (real-time)
                                               │
                                    Groq/Gemini LLM (~100ms)
                                               │
                                    Sarvam/OpenAI TTS
                                               │
  Browser <─LiveKit WebRTC── LiveKit Cloud <── Audio response
"""
