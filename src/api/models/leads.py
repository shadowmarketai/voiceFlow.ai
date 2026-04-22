"""
VoiceFlow AI - Leads Database Models
======================================
All tables for the separate leads database (shadowmarket_leads).

Tables:
  - leads              — Core lead/contact records
  - lead_interactions   — Every touchpoint (call, chat, email, sms)
  - lead_custom_fields  — Tenant-specific custom fields (EAV pattern)
  - lead_tags           — Tag-based segmentation
  - crm_connections     — OAuth2 credentials for external CRMs
  - ad_source_connections — Webhook/API configs for ad platforms
  - sync_logs           — Audit trail for all sync operations
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from api.models.leads_base import LeadsBase


# ============================================
# Lead (core table)
# ============================================

class Lead(LeadsBase):
    __tablename__ = "leads"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    tenant_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    # ── Identity ──
    name: Mapped[str | None] = mapped_column(String(200))
    email: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(20))  # E.164
    phone_country: Mapped[str | None] = mapped_column(String(2))

    # ── Business context ──
    business_name: Mapped[str | None] = mapped_column(String(200))
    business_type: Mapped[str | None] = mapped_column(String(100))
    business_size: Mapped[str | None] = mapped_column(String(50))
    location_city: Mapped[str | None] = mapped_column(String(100))
    location_state: Mapped[str | None] = mapped_column(String(100))
    location_country: Mapped[str | None] = mapped_column(String(2))

    # ── Source attribution ──
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="manual")
    source_campaign: Mapped[str | None] = mapped_column(String(200))
    source_medium: Mapped[str | None] = mapped_column(String(50))
    referrer_url: Mapped[str | None] = mapped_column(Text)
    utm_source: Mapped[str | None] = mapped_column(String(100))
    utm_medium: Mapped[str | None] = mapped_column(String(100))
    utm_campaign: Mapped[str | None] = mapped_column(String(100))

    # ── Qualification ──
    intent: Mapped[str | None] = mapped_column(String(100))
    budget_range: Mapped[str | None] = mapped_column(String(50))
    timeline: Mapped[str | None] = mapped_column(String(50))
    lead_score: Mapped[int] = mapped_column(Integer, default=0)
    qualification: Mapped[str] = mapped_column(
        String(20), default="cold"
    )  # cold, warm, hot, qualified, disqualified

    # ── Status ──
    status: Mapped[str] = mapped_column(
        String(30), default="new"
    )  # new, contacted, nurturing, converted, lost
    disposition: Mapped[str | None] = mapped_column(
        String(30)
    )  # follow_up, not_interested, wrong_enquiry, callback, site_visit, quotation_sent
    assigned_to: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)

    # ── Conversion link (soft FK to app DB) ──
    converted_user_id: Mapped[str | None] = mapped_column(String(255))
    converted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deal_value: Mapped[float | None] = mapped_column(Numeric(12, 2))

    # ── Consent (DPDP / GDPR) ──
    consent_given: Mapped[bool] = mapped_column(Boolean, default=False)
    consent_source: Mapped[str | None] = mapped_column(String(100))
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    marketing_optin: Mapped[bool] = mapped_column(Boolean, default=False)

    # ── Lifecycle ──
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    last_contacted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_followup_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # ── Soft delete ──
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # ── Relationships ──
    interactions: Mapped[list["LeadInteraction"]] = relationship(
        back_populates="lead", cascade="all, delete-orphan"
    )
    custom_fields: Mapped[list["LeadCustomField"]] = relationship(
        back_populates="lead", cascade="all, delete-orphan"
    )
    tags: Mapped[list["LeadTag"]] = relationship(
        back_populates="lead", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("idx_leads_tenant_status", "tenant_id", "status"),
        Index("idx_leads_phone", "phone"),
        Index("idx_leads_email", "email"),
        Index("idx_leads_source_campaign", "tenant_id", "source", "source_campaign"),
        Index("idx_leads_followup", "next_followup_at"),
    )


# ============================================
# Lead Interactions (every touchpoint)
# ============================================

class LeadInteraction(LeadsBase):
    __tablename__ = "lead_interactions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    lead_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False
    )
    channel: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # voiceflow, whatsapp, call, email, sms
    direction: Mapped[str] = mapped_column(
        String(10), default="inbound"
    )  # inbound, outbound
    content: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict | None] = mapped_column(JSON)
    sentiment: Mapped[str | None] = mapped_column(String(20))
    intent_detected: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationship
    lead: Mapped["Lead"] = relationship(back_populates="interactions")

    __table_args__ = (
        Index("idx_interactions_lead", "lead_id", "created_at"),
    )


# ============================================
# Lead Custom Fields (EAV pattern)
# ============================================

class LeadCustomField(LeadsBase):
    __tablename__ = "lead_custom_fields"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    lead_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False
    )
    field_key: Mapped[str] = mapped_column(String(100), nullable=False)
    field_value: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    lead: Mapped["Lead"] = relationship(back_populates="custom_fields")

    __table_args__ = (
        UniqueConstraint("lead_id", "field_key", name="uq_lead_custom_field"),
    )


# ============================================
# Lead Tags (segmentation)
# ============================================

class LeadTag(LeadsBase):
    __tablename__ = "lead_tags"

    lead_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("leads.id", ondelete="CASCADE"), primary_key=True
    )
    tag: Mapped[str] = mapped_column(String(50), primary_key=True)

    lead: Mapped["Lead"] = relationship(back_populates="tags")

    __table_args__ = (
        Index("idx_tags_tag", "tag"),
    )


# ============================================
# CRM Connections (OAuth2 credentials)
# ============================================

class CrmConnection(LeadsBase):
    __tablename__ = "crm_connections"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    tenant_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # zoho, hubspot, salesforce, pipedrive, freshsales, custom
    display_name: Mapped[str | None] = mapped_column(String(200))

    # OAuth2 tokens (encrypted at rest in production)
    access_token: Mapped[str | None] = mapped_column(Text)
    refresh_token: Mapped[str | None] = mapped_column(Text)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    api_domain: Mapped[str | None] = mapped_column(String(500))

    # For API-key-based CRMs
    api_key: Mapped[str | None] = mapped_column(Text)

    # For custom webhook CRMs
    webhook_url: Mapped[str | None] = mapped_column(String(500))

    # Field mapping: {our_field: their_field}
    field_mapping: Mapped[dict | None] = mapped_column(JSON)

    # Sync settings
    sync_direction: Mapped[str] = mapped_column(
        String(20), default="bidirectional"
    )  # import, export, bidirectional
    sync_interval_minutes: Mapped[int] = mapped_column(Integer, default=15)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_sync_status: Mapped[str | None] = mapped_column(String(20))

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("tenant_id", "provider", name="uq_crm_tenant_provider"),
    )


# ============================================
# Ad Source Connections
# ============================================

class AdSourceConnection(LeadsBase):
    __tablename__ = "ad_source_connections"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    tenant_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # facebook, google, indiamart, justdial, linkedin, website
    display_name: Mapped[str | None] = mapped_column(String(200))

    auth_type: Mapped[str] = mapped_column(
        String(20), default="webhook"
    )  # oauth2, api_key, webhook
    credentials: Mapped[dict | None] = mapped_column(JSON)  # encrypted in prod

    # Webhook config
    webhook_url: Mapped[str | None] = mapped_column(String(500))
    webhook_secret: Mapped[str | None] = mapped_column(String(255))

    # Polling config (for IndiaMart etc.)
    polling_interval_minutes: Mapped[int | None] = mapped_column(Integer)
    last_poll_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Auto-assignment
    auto_assign_agent_id: Mapped[str | None] = mapped_column(String(255))
    default_tags: Mapped[list | None] = mapped_column(JSON)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("tenant_id", "provider", name="uq_adsource_tenant_provider"),
    )


# ============================================
# Sync Logs (audit trail)
# ============================================

class SyncLog(LeadsBase):
    __tablename__ = "sync_logs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    tenant_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    connection_type: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # crm, ad_source
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    direction: Mapped[str] = mapped_column(
        String(10), nullable=False
    )  # import, export
    status: Mapped[str] = mapped_column(
        String(20), default="success"
    )  # success, partial, failed
    records_processed: Mapped[int] = mapped_column(Integer, default=0)
    records_created: Mapped[int] = mapped_column(Integer, default=0)
    records_updated: Mapped[int] = mapped_column(Integer, default=0)
    records_skipped: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[list | None] = mapped_column(JSON)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index("idx_sync_logs_tenant", "tenant_id", "started_at"),
    )
