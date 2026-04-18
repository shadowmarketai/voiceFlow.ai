"""
VoiceFlow Marketing AI - Voice Schemas
=======================================
Request/response models for voice processing endpoints.
Uses Pydantic v2 ConfigDict (KB-014).
"""


from pydantic import BaseModel, ConfigDict, Field


class VoiceProcessRequest(BaseModel):
    """Request model for voice processing via URL."""

    audio_url: str | None = Field(
        default=None, description="URL of the audio file to process"
    )
    language: str | None = Field(
        default=None,
        description="Language hint (e.g. 'hi', 'ta', 'en')",
    )
    enable_emotion: bool = Field(
        default=True, description="Enable emotion detection"
    )
    enable_intent: bool = Field(
        default=True, description="Enable marketing intent classification"
    )
    callback_url: str | None = Field(
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
    transcription: str | None = None
    language: str | None = None
    dialect: str | None = None
    confidence: float | None = None

    emotion: str | None = None
    emotion_confidence: float | None = None
    emotion_scores: dict[str, float] | None = None

    gen_z_score: float = 0.0
    is_code_mixed: bool = False
    languages_detected: dict[str, float] | None = None

    intent: str | None = None
    intent_confidence: float | None = None
    lead_score: float = 0.0
    sentiment: float = 0.0

    keywords: list[str] | None = None
    source: str | None = None
    phone_number: str | None = None

    processing_time_ms: float | None = None
    audio_duration_seconds: float | None = None

    created_at: str | None = None

    model_config = ConfigDict(from_attributes=True)


class VoiceRespondRequest(BaseModel):
    """Request model for the full voice conversation turn endpoint."""

    language: str | None = None
    system_prompt: str = Field(
        default="You are a helpful sales assistant. Keep responses under 40 words.",
        max_length=2000,
    )
    llm_provider: str = Field(default="groq", description="LLM provider: groq, anthropic, openai")
    tts_language: str = Field(default="en", description="TTS output language")
    voice_id: str | None = None

    model_config = ConfigDict(from_attributes=True)


class VoiceAnalyzeAndSpeakRequest(BaseModel):
    """Request for analyze-and-speak endpoint."""

    response_text: str = Field(
        default="Thank you for your message.",
        max_length=5000,
    )
    tts_language: str = Field(default="en")
    voice_id: str | None = None

    model_config = ConfigDict(from_attributes=True)
