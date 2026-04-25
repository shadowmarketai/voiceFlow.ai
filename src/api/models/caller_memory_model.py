"""
VoiceFlow AI — CallerMemory ORM Model  (CRM DB)
================================================
Permanent cross-call memory for every caller, scoped per tenant.

Table: caller_memories  (voiceflow_crm database)

Privacy: raw phone numbers are NEVER stored.
         Phone is hashed with SHA-256 (E.164 normalised) before storage.

Key design decisions:
  - (tenant_id, phone_hash) is the natural composite key
  - key_facts      → JSONB: {budget, property_type, location, …}
  - conv_summaries → JSONB array: [{date, summary, intent, duration_sec}, …]
  - emotion_history→ JSONB array: last 10 emotions across all calls
  - total_calls    → incremented atomically on every on_call_end()
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from api.models.base import CRMBase


class CallerMemory(CRMBase):
    """
    Persistent caller profile — one row per (tenant, caller).

    Lifetime: 90 days from last_call_at (enforced at app level, not DB level).
    Each call appends to conv_summaries and merges into key_facts.
    """
    __tablename__ = "caller_memories"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # Tenant isolation
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    # Privacy-safe caller identity
    phone_hash: Mapped[str] = mapped_column(
        String(64), nullable=False,
        comment="SHA-256 of E.164-normalised phone number",
    )

    # Known caller details (extracted from conversations)
    caller_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    language_pref: Mapped[str] = mapped_column(
        String(10), default="en", server_default="en",
        comment="Preferred language: en, ta, hi, te, kn, ml, …",
    )

    # Structured facts extracted across all calls
    # e.g. {"budget": "₹45L", "property_type": "3BHK", "location": "OMR", "appointment_date": "2026-04-25"}
    key_facts: Mapped[dict] = mapped_column(
        JSONB, default=dict, server_default="{}",
        comment="Merged key-value facts extracted from all calls",
    )

    # Per-call LLM summaries — array of objects
    # [{date: ISO, summary: str, intent: str, duration_sec: int, emotion: str}]
    conv_summaries: Mapped[list] = mapped_column(
        JSONB, default=list, server_default="[]",
        comment="LLM-generated summary per completed call (max 20 kept)",
    )

    # Emotion trend across last 10 calls
    emotion_history: Mapped[list] = mapped_column(
        JSONB, default=list, server_default="[]",
        comment="Last 10 dominant emotions (newest last)",
    )

    # Call statistics
    total_calls: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False,
    )
    last_call_at: Mapped[datetime | None] = mapped_column(
        Text, nullable=True,
        comment="ISO-8601 timestamp of most recent call end",
    )

    # Last known intent
    last_intent: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Ad-hoc notes added by the system or agent
    # ["interested in 2BHK", "prefers morning calls"]
    notes: Mapped[list] = mapped_column(
        JSONB, default=list, server_default="[]",
        comment="Free-text notes accumulated across calls (max 20)",
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        Text, nullable=False,
        server_default=func.now(),
        comment="Row creation time",
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        Text, nullable=True,
        onupdate=func.now(),
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("tenant_id", "phone_hash", name="uq_caller_memory_tenant_phone"),
        Index("ix_caller_memory_tenant_id", "tenant_id"),
        Index("ix_caller_memory_last_call", "last_call_at"),
        Index("ix_caller_memory_total_calls", "total_calls"),
    )

    def __repr__(self) -> str:
        return (
            f"<CallerMemory(id={self.id}, tenant={self.tenant_id!r}, "
            f"name={self.caller_name!r}, calls={self.total_calls})>"
        )
