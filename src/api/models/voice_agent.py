"""
VoiceFlow Marketing AI - Voice Agent Models
=============================================
SQLAlchemy 2.0 models for the LiveKit Voice Agent integration:
- CallRecording: Call audio, transcripts, and analysis
- ClonedVoice: Marketing person voice clones for TTS
- KnowledgeDocument: RAG training data with pgvector embeddings

KB-001: DeclarativeBase (NOT declarative_base())
KB-002: mapped_column() with Mapped[] type hints (NOT Column())
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    String, Text, Float, Integer, Boolean, DateTime, JSON, LargeBinary, Index,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from api.models.base import Base, TimestampMixin

try:
    from pgvector.sqlalchemy import Vector
    HAS_PGVECTOR = True
except ImportError:
    HAS_PGVECTOR = False

# Embedding dimension for OpenAI text-embedding-3-small
EMBEDDING_DIM = 1536


# ---------------------------------------------------------------------------
# CallRecording
# ---------------------------------------------------------------------------

class CallRecording(TimestampMixin, Base):
    """
    Stores complete call data: audio file path, transcript, and analysis.
    Audio saved to disk at RECORDINGS_DIR; metadata + optional blob in DB.
    """
    __tablename__ = "call_recordings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    call_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    caller_number: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    agent_voice_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    sip_provider: Mapped[str] = mapped_column(String(50), default="telecmi")

    # Audio storage
    recording_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    recording_blob: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    recording_size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    audio_format: Mapped[str] = mapped_column(String(10), default="wav")
    duration_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    sample_rate: Mapped[int] = mapped_column(Integer, default=16000)

    # Transcript
    full_transcript: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    transcript_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Voice analysis (from VoiceFlowEngine)
    caller_emotion: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    caller_intent: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    caller_sentiment: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lead_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Metadata
    tenant_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_call_recordings_tenant_created", "tenant_id", "created_at"),
    )


# ---------------------------------------------------------------------------
# ClonedVoice
# ---------------------------------------------------------------------------

class ClonedVoice(TimestampMixin, Base):
    """
    Stores marketing person's cloned voice for AI agent TTS.
    Reference audio on disk; engine config and status in DB.
    """
    __tablename__ = "cloned_voices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    person_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Reference audio
    reference_audio_path: Mapped[str] = mapped_column(String(500), nullable=False)
    reference_duration_seconds: Mapped[float] = mapped_column(Float, default=0.0)

    # TTS engine config
    tts_engine: Mapped[str] = mapped_column(String(50), default="indicf5")
    internal_voice_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    language: Mapped[str] = mapped_column(String(10), default="en")

    # Status
    status: Mapped[str] = mapped_column(String(20), default="processing")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


# ---------------------------------------------------------------------------
# KnowledgeDocument
# ---------------------------------------------------------------------------

class KnowledgeDocument(TimestampMixin, Base):
    """
    RAG training data: FAQs, product catalogs, call scripts, documents.
    Embeddings stored via pgvector for semantic search.
    """
    __tablename__ = "knowledge_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    agent_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)

    # Content
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    doc_type: Mapped[str] = mapped_column(String(50), default="document")
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # FAQ-specific fields
    question: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    answer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Embedding for RAG (pgvector or JSON fallback)
    if HAS_PGVECTOR:
        embedding_vector = mapped_column(Vector(EMBEDDING_DIM), nullable=True)
    else:
        embedding_vector: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    chunk_index: Mapped[int] = mapped_column(Integer, default=0)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    __table_args__ = (
        Index("ix_knowledge_tenant_agent", "tenant_id", "agent_id"),
    )
