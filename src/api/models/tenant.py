"""
VoiceFlow Marketing AI - Tenant Model
======================================
Multi-tenant white-label support.
Each tenant represents a separate organization with its own branding and config.
"""

from datetime import datetime
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import String, Integer, Boolean, DateTime, JSON, Text, Float, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, SoftDeleteMixin

if TYPE_CHECKING:
    from .user import User


class Tenant(TimestampMixin, SoftDeleteMixin, Base):
    """
    Tenant model for white-label multi-tenancy.
    Each tenant has its own branding, feature flags, and billing plan.
    """
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Identity
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    domain: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True)

    # Branding
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    favicon_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    primary_color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)  # hex e.g. #FF5733
    secondary_color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    custom_css: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Contact
    contact_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Billing plan
    plan: Mapped[str] = mapped_column(String(50), default="starter", server_default="starter")
    max_users: Mapped[int] = mapped_column(Integer, default=5, server_default="5")
    max_voice_minutes: Mapped[int] = mapped_column(Integer, default=100, server_default="100")
    max_leads: Mapped[int] = mapped_column(Integer, default=500, server_default="500")

    # Feature flags (overrides global feature config per tenant)
    feature_flags: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Configuration
    settings: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    default_language: Mapped[str] = mapped_column(String(10), default="en", server_default="en")
    default_currency: Mapped[str] = mapped_column(String(3), default="INR", server_default="INR")
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Kolkata", server_default="Asia/Kolkata")

    # Industry vertical
    industry: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    trial_ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    suspended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    suspension_reason: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Usage tracking
    current_voice_minutes_used: Mapped[float] = mapped_column(Float, default=0.0, server_default="0")
    current_lead_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    # Relationships
    users: Mapped[List["User"]] = relationship("User", back_populates="tenant", lazy="selectin")

    __table_args__ = (
        Index("idx_tenant_plan", "plan"),
        Index("idx_tenant_industry", "industry"),
        Index("idx_tenant_is_active", "is_active"),
    )

    def __repr__(self) -> str:
        return f"<Tenant(id={self.id}, name='{self.name}', slug='{self.slug}')>"
