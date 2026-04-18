"""
VoiceFlow Marketing AI - Tenant Schemas
========================================
Request/response models for the White-Label / Tenant management endpoints.
Uses Pydantic v2 ConfigDict (KB-014).
"""

from datetime import datetime
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
