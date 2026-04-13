"""
VoiceFlow Marketing AI - Tenant Schemas
========================================
Request/response models for the White-Label / Tenant management endpoints.
Uses Pydantic v2 ConfigDict (KB-014).
"""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


# ── Request Schemas ─────────────────────────────────────────────


class TenantCreate(BaseModel):
    """Create a new tenant (admin only)."""

    name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=100, pattern="^[a-z0-9-]+$")
    domain: Optional[str] = Field(default=None, max_length=255)
    logo_url: Optional[str] = Field(default=None, max_length=500)
    favicon_url: Optional[str] = Field(default=None, max_length=500)
    primary_color: Optional[str] = Field(default=None, max_length=7, pattern="^#[0-9A-Fa-f]{6}$")
    secondary_color: Optional[str] = Field(default=None, max_length=7, pattern="^#[0-9A-Fa-f]{6}$")
    contact_email: Optional[str] = Field(default=None, max_length=255)
    contact_phone: Optional[str] = Field(default=None, max_length=20)
    address: Optional[str] = None
    plan: str = Field(default="starter", max_length=50)
    max_users: int = Field(default=5, ge=1)
    max_voice_minutes: int = Field(default=100, ge=0)
    max_leads: int = Field(default=500, ge=0)
    feature_flags: Optional[dict[str, Any]] = None
    settings: Optional[dict[str, Any]] = None
    default_language: str = Field(default="en", max_length=10)
    default_currency: str = Field(default="INR", max_length=3)
    timezone: str = Field(default="Asia/Kolkata", max_length=50)
    industry: Optional[str] = Field(default=None, max_length=100)

    model_config = ConfigDict(from_attributes=True)


class TenantUpdate(BaseModel):
    """Update tenant configuration."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    domain: Optional[str] = Field(default=None, max_length=255)
    logo_url: Optional[str] = Field(default=None, max_length=500)
    favicon_url: Optional[str] = Field(default=None, max_length=500)
    primary_color: Optional[str] = Field(default=None, max_length=7, pattern="^#[0-9A-Fa-f]{6}$")
    secondary_color: Optional[str] = Field(default=None, max_length=7, pattern="^#[0-9A-Fa-f]{6}$")
    custom_css: Optional[str] = None
    contact_email: Optional[str] = Field(default=None, max_length=255)
    contact_phone: Optional[str] = Field(default=None, max_length=20)
    address: Optional[str] = None
    plan: Optional[str] = Field(default=None, max_length=50)
    max_users: Optional[int] = Field(default=None, ge=1)
    max_voice_minutes: Optional[int] = Field(default=None, ge=0)
    max_leads: Optional[int] = Field(default=None, ge=0)
    settings: Optional[dict[str, Any]] = None
    default_language: Optional[str] = Field(default=None, max_length=10)
    default_currency: Optional[str] = Field(default=None, max_length=3)
    timezone: Optional[str] = Field(default=None, max_length=50)
    industry: Optional[str] = Field(default=None, max_length=100)
    is_active: Optional[bool] = None

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
    domain: Optional[str] = None
    logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    custom_css: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    address: Optional[str] = None
    plan: str = "starter"
    max_users: int = 5
    max_voice_minutes: int = 100
    max_leads: int = 500
    feature_flags: Optional[dict[str, Any]] = None
    settings: Optional[dict[str, Any]] = None
    default_language: str = "en"
    default_currency: str = "INR"
    timezone: str = "Asia/Kolkata"
    industry: Optional[str] = None
    is_active: bool = True
    trial_ends_at: Optional[datetime] = None
    current_voice_minutes_used: float = 0.0
    current_lead_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

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
    trial_ends_at: Optional[datetime] = None
    users_usage_percentage: float = 0.0
    voice_usage_percentage: float = 0.0
    leads_usage_percentage: float = 0.0

    model_config = ConfigDict(from_attributes=True)
