"""
VoiceFlow AI — Conversation Models  (Voice DB)
===============================================
Permanent storage for every call session and every STT→LLM→TTS turn.

Tables (voiceflow_voice database):
  conversations        — one row per call session
  conversation_turns   — one row per STT→LLM→TTS cycle within a call
  conversation_summaries — one row per completed call (LLM-generated summary)

Every call writes to all three tables. Nothing is temporary.

Relationship:
  Conversation (1) → (N) ConversationTurn
  Conversation (1) → (1) ConversationSummary
  ConversationSummary → linked to CallerMemory via caller_memory_id
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Float,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from api.models.base import VoiceBase


# ─────────────────────────────────────────────────────────────────────────────
# Conversation  (call session)
# ─────────────────────────────────────────────────────────────────────────────

class Conversation(VoiceBase):
    """
    One row per inbound or outbound call session.

    Created when the call is answered. Updated at every turn with
    running stats. Finalised (ended_at, outcome, total_turns) when
    the call ends.
    """
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # Unique call identifier (from telephony provider or WebRTC)
    call_id: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)

    # Ownership
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    agent_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    # Caller
    phone_hash: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True,
        comment="SHA-256 of caller phone — links to caller_memories",
    )
    caller_name: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Call direction and channel
    direction: Mapped[str] = mapped_column(
        String(16), default="inbound", server_default="inbound",
        comment="inbound | outbound",
    )
    channel: Mapped[str] = mapped_column(
        String(32), default="phone", server_default="phone",
        comment="phone | webrtc | whatsapp | widget | api",
    )

    # Routing
    track_used: Mapped[str | None] = mapped_column(
        String(8), nullable=True,
        comment="Pipeline track: A | B | C | D",
    )
    language: Mapped[str] = mapped_column(String(10), default="en", server_default="en")

    # Timing
    started_at: Mapped[str] = mapped_column(
        Text, nullable=False,
        server_default=func.now(),
    )
    ended_at: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Outcome
    outcome: Mapped[str | None] = mapped_column(
        String(50), nullable=True,
        comment="qualified | not_interested | callback | voicemail | error | transferred",
    )
    final_intent: Mapped[str | None] = mapped_column(String(100), nullable=True)
    final_emotion: Mapped[str | None] = mapped_column(String(50), nullable=True)
    final_sentiment: Mapped[float | None] = mapped_column(Float, nullable=True)
    lead_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Stats
    total_turns: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    total_words_caller: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    total_words_agent: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    interruption_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    filler_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    # Performance
    avg_ttfa_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_turn_latency_ms: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Recording reference (links to voiceflow_recording.call_recordings)
    recording_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Caller memory reference (links to voiceflow_crm.caller_memories)
    caller_memory_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, index=True)

    # Cost
    cost_paise: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True,
        comment="Total call cost in paise (₹1 = 100 paise)",
    )

    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=func.now())
    updated_at: Mapped[str | None] = mapped_column(Text, nullable=True, onupdate=func.now())

    __table_args__ = (
        Index("ix_conversations_tenant_started", "tenant_id", "started_at"),
        Index("ix_conversations_agent_id", "agent_id"),
        Index("ix_conversations_phone_hash", "phone_hash"),
        Index("ix_conversations_outcome", "outcome"),
    )

    def __repr__(self) -> str:
        return f"<Conversation(id={self.id}, call_id={self.call_id!r}, tenant={self.tenant_id!r})>"


# ─────────────────────────────────────────────────────────────────────────────
# ConversationTurn  (one STT→LLM→TTS cycle)
# ─────────────────────────────────────────────────────────────────────────────

class ConversationTurn(VoiceBase):
    """
    One row per STT→LLM→TTS cycle within a call.

    Written after each turn completes. Captures the full transcript,
    agent reply, all timing metrics, and AI analysis scores.
    """
    __tablename__ = "conversation_turns"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # Parent call
    conversation_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    call_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    # Turn sequence
    turn_index: Mapped[int] = mapped_column(Integer, nullable=False)

    # STT — what the caller said
    caller_transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    stt_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    stt_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    stt_language: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # LLM — what the agent replied
    agent_reply: Mapped[str | None] = mapped_column(Text, nullable=True)
    llm_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    llm_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    llm_tokens_in: Mapped[int | None] = mapped_column(Integer, nullable=True)
    llm_tokens_out: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # TTS
    tts_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tts_voice_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tts_chars: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Latency metrics (ms)
    stt_latency_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    llm_latency_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    tts_latency_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    ttfa_ms: Mapped[float | None] = mapped_column(
        Float, nullable=True,
        comment="Time-to-first-audio from end of caller speech",
    )
    total_turn_ms: Mapped[float | None] = mapped_column(Float, nullable=True)

    # AI analysis scores (from voice_analyses)
    emotion: Mapped[str | None] = mapped_column(String(50), nullable=True)
    emotion_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    intent: Mapped[str | None] = mapped_column(String(100), nullable=True)
    intent_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    sentiment: Mapped[float | None] = mapped_column(Float, nullable=True)
    lead_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    dialect: Mapped[str | None] = mapped_column(String(50), nullable=True)
    gen_z_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Entities extracted this turn
    extracted_entities: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True,
        comment="Entities extracted: {caller_name, price, location, date, …}",
    )

    # Flags
    was_interrupted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    used_filler: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    used_speculative_llm: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    # Pipeline track used
    track: Mapped[str | None] = mapped_column(String(8), nullable=True)

    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=func.now())

    __table_args__ = (
        Index("ix_turns_conversation_id", "conversation_id"),
        Index("ix_turns_call_id", "call_id"),
        Index("ix_turns_tenant_created", "tenant_id", "created_at"),
        Index("ix_turns_emotion", "emotion"),
        Index("ix_turns_intent", "intent"),
    )

    def __repr__(self) -> str:
        return (
            f"<ConversationTurn(id={self.id}, call={self.call_id!r}, "
            f"turn={self.turn_index}, emotion={self.emotion!r})>"
        )


# ─────────────────────────────────────────────────────────────────────────────
# ConversationSummary  (LLM summary at call end)
# ─────────────────────────────────────────────────────────────────────────────

class ConversationSummary(VoiceBase):
    """
    LLM-generated summary created when a call ends.

    One row per call. Generated by Groq llama3-8b using the full turn
    transcript. Also persisted into CallerMemory.conv_summaries (CRM DB)
    for cross-call context injection.
    """
    __tablename__ = "conversation_summaries"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # Parent references
    conversation_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True, unique=True)
    call_id: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    # Cross-DB reference to caller_memories (CRM DB)
    caller_memory_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, index=True)

    # LLM summary output
    summary: Mapped[str] = mapped_column(
        Text, nullable=False,
        comment="2-3 sentence Groq summary of the entire call",
    )
    key_facts_extracted: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True,
        comment="Key facts extracted by LLM: {budget, location, intent, …}",
    )

    # Call metadata at summary time
    call_duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_turns: Mapped[int | None] = mapped_column(Integer, nullable=True)
    final_intent: Mapped[str | None] = mapped_column(String(100), nullable=True)
    final_emotion: Mapped[str | None] = mapped_column(String(50), nullable=True)
    outcome: Mapped[str | None] = mapped_column(String(50), nullable=True)
    language: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # LLM metadata
    llm_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    llm_tokens_used: Mapped[int | None] = mapped_column(Integer, nullable=True)
    summary_latency_ms: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=func.now())

    __table_args__ = (
        Index("ix_summaries_tenant_created", "tenant_id", "created_at"),
        Index("ix_summaries_caller_memory", "caller_memory_id"),
    )

    def __repr__(self) -> str:
        return (
            f"<ConversationSummary(id={self.id}, call={self.call_id!r}, "
            f"intent={self.final_intent!r})>"
        )
