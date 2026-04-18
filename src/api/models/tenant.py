"""
VoiceFlow Marketing AI - Tenant Model
======================================
Multi-tenant white-label support.
Each tenant represents a separate organization with its own branding and config.
"""

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON, Boolean, Date, DateTime, Float, ForeignKey,
    Index, Integer, Numeric, String, Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, SoftDeleteMixin, TimestampMixin

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
    domain: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)

    # Branding
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    favicon_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    primary_color: Mapped[str | None] = mapped_column(String(7), nullable=True)  # hex e.g. #FF5733
    secondary_color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    custom_css: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Contact
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Billing plan
    plan: Mapped[str] = mapped_column(String(50), default="starter", server_default="starter")
    max_users: Mapped[int] = mapped_column(Integer, default=5, server_default="5")
    max_voice_minutes: Mapped[int] = mapped_column(Integer, default=100, server_default="100")
    max_leads: Mapped[int] = mapped_column(Integer, default=500, server_default="500")

    # Feature flags (overrides global feature config per tenant)
    feature_flags: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Configuration
    settings: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    default_language: Mapped[str] = mapped_column(String(10), default="en", server_default="en")
    default_currency: Mapped[str] = mapped_column(String(3), default="INR", server_default="INR")
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Kolkata", server_default="Asia/Kolkata")

    # Industry vertical
    industry: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # ── Business Identity ────────────────────────────────────────────────
    company_type: Mapped[str | None] = mapped_column(
        String(60), nullable=True,
        comment="Pvt Ltd, LLP, OPC, Partnership, Proprietorship, Public Ltd, NGO",
    )
    gstin: Mapped[str | None] = mapped_column(
        String(15), nullable=True, index=True,
        comment="GST Identification Number (15 chars)",
    )
    pan_number: Mapped[str | None] = mapped_column(
        String(10), nullable=True,
        comment="PAN card number (10 chars)",
    )
    website_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # ── Primary Point of Contact ─────────────────────────────────────────
    owner_name: Mapped[str | None] = mapped_column(String(200), nullable=True, comment="Primary POC / Owner full name")
    owner_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    owner_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # ── Billing / Contract ───────────────────────────────────────────────
    billing_email: Mapped[str | None] = mapped_column(String(255), nullable=True, comment="Who receives invoices")
    billing_address: Mapped[str | None] = mapped_column(Text, nullable=True, comment="Billing address if different from office")
    contract_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    contract_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    monthly_billing_amount: Mapped[float | None] = mapped_column(
        Numeric(12, 2), nullable=True, comment="Contracted MRR in default_currency",
    )
    payment_terms: Mapped[str | None] = mapped_column(
        String(50), nullable=True, comment="prepaid, NET15, NET30, NET60",
    )

    # ── Onboarding ───────────────────────────────────────────────────────
    onboarding_status: Mapped[str] = mapped_column(
        String(50), default="not_started", server_default="not_started",
        comment="not_started | in_progress | completed | churned",
    )
    onboarding_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    go_live_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # ── CRM ──────────────────────────────────────────────────────────────
    tags: Mapped[list | None] = mapped_column(JSON, nullable=True, comment="String array of CRM tags")
    internal_notes: Mapped[str | None] = mapped_column(Text, nullable=True, comment="Internal notes — not visible to tenant")

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    suspension_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Usage tracking
    current_voice_minutes_used: Mapped[float] = mapped_column(Float, default=0.0, server_default="0")
    current_lead_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    # Relationships
    users: Mapped[list["User"]] = relationship("User", back_populates="tenant", lazy="selectin")
    contacts: Mapped[list["TenantContact"]] = relationship(
        "TenantContact", back_populates="tenant", lazy="selectin", cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("idx_tenant_plan", "plan"),
        Index("idx_tenant_industry", "industry"),
        Index("idx_tenant_is_active", "is_active"),
        Index("idx_tenant_onboarding_status", "onboarding_status"),
        Index("idx_tenant_contract_end", "contract_end_date"),
    )

    def __repr__(self) -> str:
        return f"<Tenant(id={self.id}, name='{self.name}', slug='{self.slug}')>"


class TenantContact(TimestampMixin, Base):
    """
    Named contacts for a tenant.
    A tenant can have multiple contacts: owner, billing, technical, support, etc.
    Kept in a separate table so tenant_id isolation stays clean.
    """
    __tablename__ = "tenant_contacts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True,
    )

    # Person details
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    designation: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="e.g. CTO, Finance Manager")

    # Role
    role: Mapped[str] = mapped_column(
        String(50), default="general", server_default="general",
        comment="owner | billing | technical | support | general",
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    # Notes
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationship back to tenant
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="contacts")

    __table_args__ = (
        Index("idx_tc_tenant_id", "tenant_id"),
        Index("idx_tc_role", "role"),
    )

    def __repr__(self) -> str:
        return f"<TenantContact(id={self.id}, tenant_id={self.tenant_id}, name='{self.name}', role='{self.role}')>"
