"""
VoiceFlow Marketing AI - Voice Schemas
=======================================
Request/response models for voice processing endpoints.
Uses Pydantic v2 ConfigDict (KB-014).
"""

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class VoiceProcessRequest(BaseModel):
    """Request model for voice processing via URL."""

    audio_url: Optional[str] = Field(
        default=None, description="URL of the audio file to process"
    )
    language: Optional[str] = Field(
        default=None,
        description="Language hint (e.g. 'hi', 'ta', 'en')",
    )
    enable_emotion: bool = Field(
        default=True, description="Enable emotion detection"
    )
    enable_intent: bool = Field(
        default=True, description="Enable marketing intent classification"
    )
    callback_url: Optional[str] = Field(
        default=None, description="URL for async result callback"
    )

    model_config = ConfigDict(from_attributes=True)


class VoiceProcessResponse(BaseModel):
    """Full response from voice processing pipeline."""

    request_id: str
    status: str = "completed"

    # Transcription
    transcription: str = ""
    language: str = ""
    dialect: str = ""
    confidence: float = 0.0

    # Emotion
    emotion: str = "neutral"
    emotion_confidence: float = 0.0
    emotion_scores: dict[str, float] = Field(default_factory=dict)

    # Gen Z slang
    gen_z_score: float = 0.0
    slang_detected: list[dict[str, str]] = Field(default_factory=list)

    # Code mixing
    is_code_mixed: bool = False
    languages_detected: dict[str, float] = Field(default_factory=dict)

    # Marketing intelligence
    intent: str = "inquiry"
    intent_confidence: float = 0.0
    lead_score: float = 0.0
    sentiment: float = 0.0

    # Keywords
    keywords: list[str] = Field(default_factory=list)

    # Metadata
    processing_time_ms: float = 0.0
    audio_duration_s: float = 0.0
    timestamp: str = ""

    model_config = ConfigDict(from_attributes=True)


class VoiceAnalysisResponse(BaseModel):
    """Stored voice analysis record from the database."""

    id: int
    request_id: str
    transcription: Optional[str] = None
    language: Optional[str] = None
    dialect: Optional[str] = None
    confidence: Optional[float] = None

    emotion: Optional[str] = None
    emotion_confidence: Optional[float] = None
    emotion_scores: Optional[dict[str, float]] = None

    gen_z_score: float = 0.0
    is_code_mixed: bool = False
    languages_detected: Optional[dict[str, float]] = None

    intent: Optional[str] = None
    intent_confidence: Optional[float] = None
    lead_score: float = 0.0
    sentiment: float = 0.0

    keywords: Optional[list[str]] = None
    source: Optional[str] = None
    phone_number: Optional[str] = None

    processing_time_ms: Optional[float] = None
    audio_duration_seconds: Optional[float] = None

    created_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class VoiceRespondRequest(BaseModel):
    """Request model for the full voice conversation turn endpoint."""

    language: Optional[str] = None
    system_prompt: str = Field(
        default="You are a helpful sales assistant. Keep responses under 40 words.",
        max_length=2000,
    )
    llm_provider: str = Field(default="groq", description="LLM provider: groq, anthropic, openai")
    tts_language: str = Field(default="en", description="TTS output language")
    voice_id: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class VoiceAnalyzeAndSpeakRequest(BaseModel):
    """Request for analyze-and-speak endpoint."""

    response_text: str = Field(
        default="Thank you for your message.",
        max_length=5000,
    )
    tts_language: str = Field(default="en")
    voice_id: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
