"""
VoiceFlow Marketing AI - Tenant Schemas
========================================
Request/response models for the White-Label / Tenant management endpoints.
Uses Pydantic v2 ConfigDict (KB-014).
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# ── Request Schemas ─────────────────────────────────────────────


class TenantCreate(BaseModel):
    """Create a new tenant (admin only)."""

    name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=100, pattern="^[a-z0-9-]+$")
    domain: str | None = Field(default=None, max_length=255)
    logo_url: str | None = Field(default=None, max_length=500)
    favicon_url: str | None = Field(default=None, max_length=500)
    primary_color: str | None = Field(default=None, max_length=7, pattern="^#[0-9A-Fa-f]{6}$")
    secondary_color: str | None = Field(default=None, max_length=7, pattern="^#[0-9A-Fa-f]{6}$")
    contact_email: str | None = Field(default=None, max_length=255)
    contact_phone: str | None = Field(default=None, max_length=20)
    address: str | None = None
    plan: str = Field(default="starter", max_length=50)
    max_users: int = Field(default=5, ge=1)
    max_voice_minutes: int = Field(default=100, ge=0)
    max_leads: int = Field(default=500, ge=0)
    feature_flags: dict[str, Any] | None = None
    settings: dict[str, Any] | None = None
    default_language: str = Field(default="en", max_length=10)
    default_currency: str = Field(default="INR", max_length=3)
    timezone: str = Field(default="Asia/Kolkata", max_length=50)
    industry: str | None = Field(default=None, max_length=100)

    # Business identity
    company_type: str | None = Field(default=None, max_length=60)
    gstin: str | None = Field(default=None, max_length=15, pattern=r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$|^$")
    pan_number: str | None = Field(default=None, max_length=10, pattern=r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$|^$")
    website_url: str | None = Field(default=None, max_length=500)

    # Primary POC
    owner_name: str | None = Field(default=None, max_length=200)
    owner_email: str | None = Field(default=None, max_length=255)
    owner_phone: str | None = Field(default=None, max_length=20)

    # Billing / Contract
    billing_email: str | None = Field(default=None, max_length=255)
    billing_address: str | None = None
    contract_start_date: date | None = None
    contract_end_date: date | None = None
    monthly_billing_amount: Decimal | None = Field(default=None, ge=0)
    payment_terms: str | None = Field(default=None, max_length=50)

    # Onboarding
    onboarding_status: str = Field(default="not_started", max_length=50)
    onboarding_notes: str | None = None
    go_live_date: date | None = None

    # CRM
    tags: list[str] | None = None
    internal_notes: str | None = None

    model_config = ConfigDict(from_attributes=True)


class TenantUpdate(BaseModel):
    """Update tenant configuration."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    domain: str | None = Field(default=None, max_length=255)
    logo_url: str | None = Field(default=None, max_length=500)
    favicon_url: str | None = Field(default=None, max_length=500)
    primary_color: str | None = Field(default=None, max_length=7, pattern="^#[0-9A-Fa-f]{6}$")
    secondary_color: str | None = Field(default=None, max_length=7, pattern="^#[0-9A-Fa-f]{6}$")
    custom_css: str | None = None
    contact_email: str | None = Field(default=None, max_length=255)
    contact_phone: str | None = Field(default=None, max_length=20)
    address: str | None = None
    plan: str | None = Field(default=None, max_length=50)
    max_users: int | None = Field(default=None, ge=1)
    max_voice_minutes: int | None = Field(default=None, ge=0)
    max_leads: int | None = Field(default=None, ge=0)
    settings: dict[str, Any] | None = None
    default_language: str | None = Field(default=None, max_length=10)
    default_currency: str | None = Field(default=None, max_length=3)
    timezone: str | None = Field(default=None, max_length=50)
    industry: str | None = Field(default=None, max_length=100)
    is_active: bool | None = None

    # Business identity
    company_type: str | None = Field(default=None, max_length=60)
    gstin: str | None = Field(default=None, max_length=15)
    pan_number: str | None = Field(default=None, max_length=10)
    website_url: str | None = Field(default=None, max_length=500)

    # Primary POC
    owner_name: str | None = Field(default=None, max_length=200)
    owner_email: str | None = Field(default=None, max_length=255)
    owner_phone: str | None = Field(default=None, max_length=20)

    # Billing / Contract
    billing_email: str | None = Field(default=None, max_length=255)
    billing_address: str | None = None
    contract_start_date: date | None = None
    contract_end_date: date | None = None
    monthly_billing_amount: Decimal | None = Field(default=None, ge=0)
    payment_terms: str | None = Field(default=None, max_length=50)

    # Onboarding
    onboarding_status: str | None = Field(default=None, max_length=50)
    onboarding_notes: str | None = None
    go_live_date: date | None = None

    # CRM
    tags: list[str] | None = None
    internal_notes: str | None = None

    model_config = ConfigDict(from_attributes=True)


class FeatureFlagsUpdate(BaseModel):
    """Update tenant feature flags."""

    feature_flags: dict[str, Any] = Field(..., description="Feature flag key-value pairs")

    model_config = ConfigDict(from_attributes=True)


# ── Response Schemas ────────────────────────────────────────────


class TenantResponse(BaseModel):
    """Tenant detail response."""

    id: int
    name: str
    slug: str
    domain: str | None = None
    logo_url: str | None = None
    favicon_url: str | None = None
    primary_color: str | None = None
    secondary_color: str | None = None
    custom_css: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    address: str | None = None
    plan: str = "starter"
    max_users: int = 5
    max_voice_minutes: int = 100
    max_leads: int = 500
    feature_flags: dict[str, Any] | None = None
    settings: dict[str, Any] | None = None
    default_language: str = "en"
    default_currency: str = "INR"
    timezone: str = "Asia/Kolkata"
    industry: str | None = None
    is_active: bool = True
    trial_ends_at: datetime | None = None
    current_voice_minutes_used: float = 0.0
    current_lead_count: int = 0

    # Business identity
    company_type: str | None = None
    gstin: str | None = None
    pan_number: str | None = None
    website_url: str | None = None

    # Primary POC
    owner_name: str | None = None
    owner_email: str | None = None
    owner_phone: str | None = None

    # Billing / Contract
    billing_email: str | None = None
    billing_address: str | None = None
    contract_start_date: date | None = None
    contract_end_date: date | None = None
    monthly_billing_amount: Decimal | None = None
    payment_terms: str | None = None

    # Onboarding
    onboarding_status: str = "not_started"
    onboarding_notes: str | None = None
    go_live_date: date | None = None

    # CRM
    tags: list[str] | None = None
    internal_notes: str | None = None

    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


# ── Contact Schemas ─────────────────────────────────────────────


class TenantContactCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=20)
    designation: str | None = Field(default=None, max_length=100)
    role: str = Field(default="general", max_length=50)
    is_primary: bool = False
    notes: str | None = None

    model_config = ConfigDict(from_attributes=True)


class TenantContactResponse(BaseModel):
    id: int
    tenant_id: int
    name: str
    email: str | None = None
    phone: str | None = None
    designation: str | None = None
    role: str = "general"
    is_primary: bool = False
    notes: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class TenantStatsResponse(BaseModel):
    """Tenant usage statistics."""

    tenant_id: int
    tenant_name: str
    plan: str
    total_users: int = 0
    max_users: int = 5
    voice_minutes_used: float = 0.0
    max_voice_minutes: int = 100
    lead_count: int = 0
    max_leads: int = 500
    is_active: bool = True
    trial_ends_at: datetime | None = None
    users_usage_percentage: float = 0.0
    voice_usage_percentage: float = 0.0
    leads_usage_percentage: float = 0.0

    model_config = ConfigDict(from_attributes=True)
