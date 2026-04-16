"""
Persistent Voice Agent + Call Log + Channel Config tables.

These replace the localStorage-only versions used by AgentBuilder /
Channels page so that user data survives browser clears, redeploys,
and works across devices.
"""

from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, Float, Integer, JSON, String, Text, Index,
)
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import Base


class VoiceAgent(Base):
    __tablename__ = "voice_agents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    name: Mapped[str] = mapped_column(String(128), nullable=False)
    language: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="draft")    # draft / active / inactive
    icon: Mapped[str | None] = mapped_column(String(8), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)

    # Full agent config (prompt, llm settings, voice, behavior, compliance...)
    # Stored as a single JSON blob so the schema doesn't churn every time we
    # add a field on the front-end.
    config: Mapped[dict] = mapped_column(JSON, default=dict)

    conversations: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_voice_agents_tenant_status", "tenant_id", "status"),
    )


class CallLog(Base):
    __tablename__ = "call_logs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    agent_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    direction: Mapped[str] = mapped_column(String(16), default="inbound")   # inbound / outbound
    channel: Mapped[str] = mapped_column(String(32), default="webrtc")      # webrtc / phone / whatsapp / widget / api
    from_addr: Mapped[str | None] = mapped_column(String(128), nullable=True)
    to_addr: Mapped[str | None] = mapped_column(String(128), nullable=True)

    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    duration_sec: Mapped[float | None] = mapped_column(Float, nullable=True)

    outcome: Mapped[str | None] = mapped_column(String(32), nullable=True)  # qualified / not_interested / callback / voicemail / error
    sentiment: Mapped[str | None] = mapped_column(String(16), nullable=True)
    emotion: Mapped[str | None] = mapped_column(String(16), nullable=True)

    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    recording_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    cost_inr: Mapped[float | None] = mapped_column(Float, nullable=True)
    meta: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    __table_args__ = (
        Index("ix_call_logs_tenant_started", "tenant_id", "started_at"),
        Index("ix_call_logs_agent_started", "agent_id", "started_at"),
    )


class ChannelConfig(Base):
    """Per-tenant channel deployment config (Web Widget, WhatsApp, Phone, API)."""
    __tablename__ = "channel_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    channel: Mapped[str] = mapped_column(String(32), index=True)            # web-widget / whatsapp / phone / api
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_channel_configs_tenant_channel", "tenant_id", "channel", unique=True),
    )
