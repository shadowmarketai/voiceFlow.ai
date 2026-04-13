"""
VoiceFlow Marketing AI - Voice Analysis Models
================================================
Core voice AI models for ASR, emotion detection, intent classification,
dialect identification, and marketing intelligence.
"""

import enum
from typing import Optional, TYPE_CHECKING

from sqlalchemy import (
    String, Integer, Float, Boolean, JSON, Text, ForeignKey, Index,
    Enum as SQLEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin

if TYPE_CHECKING:
    from .user import User
    from .crm import Lead


class EmotionType(enum.Enum):
    """Detected emotion types from voice analysis."""
    HAPPY = "happy"
    SAD = "sad"
    ANGRY = "angry"
    FRUSTRATED = "frustrated"
    NEUTRAL = "neutral"
    EXCITED = "excited"
    CONFUSED = "confused"
    FEARFUL = "fearful"


class IntentType(enum.Enum):
    """Marketing intent classification from voice analysis."""
    PURCHASE = "purchase"
    INQUIRY = "inquiry"
    COMPLAINT = "complaint"
    SUPPORT = "support"
    FEEDBACK = "feedback"
    CANCEL = "cancel"
    UPSELL_OPPORTUNITY = "upsell_opportunity"
    CHURN_RISK = "churn_risk"
    REFERRAL = "referral"
    RENEWAL = "renewal"


class DialectType(enum.Enum):
    """Regional dialect detection for Indian languages."""
    KONGU = "kongu"
    CHENNAI = "chennai"
    MADURAI = "madurai"
    TIRUNELVELI = "tirunelveli"
    HINDI_STANDARD = "hindi_standard"
    HINDI_BHOJPURI = "hindi_bhojpuri"
    HINDI_RAJASTHANI = "hindi_rajasthani"
    HINDI_MARWARI = "hindi_marwari"
    TELUGU_STANDARD = "telugu_standard"
    KANNADA_STANDARD = "kannada_standard"
    MALAYALAM_STANDARD = "malayalam_standard"
    BENGALI_STANDARD = "bengali_standard"
    MARATHI_STANDARD = "marathi_standard"
    GUJARATI_STANDARD = "gujarati_standard"
    PUNJABI_STANDARD = "punjabi_standard"
    UNKNOWN = "unknown"


class VoiceAnalysis(TimestampMixin, Base):
    """
    Stores voice analysis results.
    Core table for all voice processing: ASR, emotion, intent, dialect, lead scoring.
    Lead score formula: sentiment 30% + intent 30% + emotion 20% + engagement 20%.
    """
    __tablename__ = "voice_analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False, index=True)

    # Audio metadata
    audio_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    audio_duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sample_rate: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    audio_format: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # "wav", "mp3", "ogg"
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Transcription
    transcription: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    language: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    dialect: Mapped[Optional[DialectType]] = mapped_column(
        SQLEnum(DialectType, name="dialect_type", create_constraint=True),
        default=DialectType.UNKNOWN,
        nullable=True,
    )
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    word_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    speaking_rate_wpm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # words per minute

    # Emotion analysis
    emotion: Mapped[Optional[EmotionType]] = mapped_column(
        SQLEnum(EmotionType, name="emotion_type", create_constraint=True),
        default=EmotionType.NEUTRAL,
        nullable=True,
    )
    emotion_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    emotion_scores: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # {"happy": 0.8, "sad": 0.1, ...}

    # Gen Z analysis
    gen_z_score: Mapped[float] = mapped_column(Float, default=0.0, server_default="0")
    slang_detected: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)  # [{"word": "lit", "meaning": "..."}]

    # Code-mixing detection
    is_code_mixed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    languages_detected: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # {"english": 0.6, "tamil": 0.4}

    # Marketing intelligence
    intent: Mapped[Optional[IntentType]] = mapped_column(
        SQLEnum(IntentType, name="intent_type", create_constraint=True),
        default=IntentType.INQUIRY,
        nullable=True,
    )
    intent_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lead_score: Mapped[float] = mapped_column(Float, default=0.0, server_default="0", index=True)
    sentiment: Mapped[float] = mapped_column(Float, default=0.0, server_default="0")  # -1 to 1
    engagement_score: Mapped[float] = mapped_column(Float, default=0.0, server_default="0")  # 0 to 1

    # Keywords and entities
    keywords: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)  # ["product", "price", ...]
    entities: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # {"products": [], "numbers": []}
    topics: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)  # ["pricing", "support"]

    # AI response (if conversational)
    ai_response: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_response_model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Processing metadata
    processing_time_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    model_version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    whisper_model: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # "base", "small", "medium"
    pipeline_version: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # Source tracking
    source: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)  # "whatsapp", "ivr", "web", "api"
    phone_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)
    session_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    call_direction: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # "inbound", "outbound"

    # Foreign keys
    lead_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("crm_leads.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True,
    )

    # Relationships
    lead: Mapped[Optional["Lead"]] = relationship("Lead", back_populates="voice_analyses")
    user: Mapped[Optional["User"]] = relationship("User", back_populates="voice_analyses")

    __table_args__ = (
        Index("idx_voice_analysis_created", "created_at"),
        Index("idx_voice_analysis_emotion", "emotion"),
        Index("idx_voice_analysis_intent", "intent"),
        Index("idx_voice_analysis_user_created", "user_id", "created_at"),
        Index("idx_voice_analysis_source_created", "source", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<VoiceAnalysis(id={self.id}, request_id='{self.request_id}', emotion={self.emotion})>"
