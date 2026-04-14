"""
VoiceFlow AI — CRM Models (Leads, Deals)
==========================================
Minimal CRM models for analytics integration.
"""

from enum import Enum as PyEnum

from sqlalchemy import (
    Boolean, DateTime, Float, Integer, String, Text, Enum,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from api.models.base import Base, TimestampMixin, SoftDeleteMixin


class LeadStatus(str, PyEnum):
    NEW = "new"
    CONTACTED = "contacted"
    QUALIFIED = "qualified"
    PROPOSAL = "proposal"
    NEGOTIATION = "negotiation"
    WON = "won"
    LOST = "lost"


class DealStage(str, PyEnum):
    DISCOVERY = "discovery"
    PROPOSAL = "proposal"
    NEGOTIATION = "negotiation"
    CLOSED_WON = "closed_won"
    CLOSED_LOST = "closed_lost"


class Lead(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=True)
    phone: Mapped[str] = mapped_column(String(50), nullable=True)
    company: Mapped[str] = mapped_column(String(255), nullable=True)
    source: Mapped[str] = mapped_column(String(100), nullable=True, default="voice_call")
    status: Mapped[str] = mapped_column(
        Enum(LeadStatus), default=LeadStatus.NEW, nullable=False
    )
    score: Mapped[float] = mapped_column(Float, default=0.0)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    tenant_id: Mapped[int] = mapped_column(Integer, nullable=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=True)
    assigned_to: Mapped[int] = mapped_column(Integer, nullable=True)


class Deal(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "deals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    value: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(10), default="INR")
    stage: Mapped[str] = mapped_column(
        Enum(DealStage), default=DealStage.DISCOVERY, nullable=False
    )
    lead_id: Mapped[int] = mapped_column(Integer, nullable=True)
    tenant_id: Mapped[int] = mapped_column(Integer, nullable=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=True)
    close_date: Mapped[str] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
