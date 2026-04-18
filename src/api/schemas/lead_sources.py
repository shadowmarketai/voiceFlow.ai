"""
VoiceFlow Marketing AI - Lead Sources Schemas
===============================================
Request/response models for lead source integrations (IndiaMart, JustDial, Facebook).
Uses Pydantic v2 ConfigDict (KB-014).
"""

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class LeadSourceProviderEnum(str, Enum):
    INDIAMART = "indiamart"
    JUSTDIAL = "justdial"
    FACEBOOK_LEADS = "facebook_leads"


class LeadSourceConfigCreate(BaseModel):
    """Create or update a lead source configuration."""
    provider: LeadSourceProviderEnum
    api_key: str | None = Field(default=None, max_length=500)
    api_secret: str | None = Field(default=None, max_length=500)
    app_secret: str | None = Field(default=None, max_length=500)
    page_id: str | None = Field(default=None, max_length=255)
    polling_interval_minutes: int = Field(default=5, ge=1, le=60)
    is_active: bool = True
    auto_assign: bool = False
    assign_to_user_id: int | None = None
    default_tags: list[str] | None = None

    model_config = ConfigDict(from_attributes=True)


class LeadSourceConfigUpdate(BaseModel):
    """Partial update for a lead source configuration."""
    api_key: str | None = Field(default=None, max_length=500)
    api_secret: str | None = Field(default=None, max_length=500)
    app_secret: str | None = Field(default=None, max_length=500)
    page_id: str | None = Field(default=None, max_length=255)
    polling_interval_minutes: int | None = Field(default=None, ge=1, le=60)
    is_active: bool | None = None
    auto_assign: bool | None = None
    assign_to_user_id: int | None = None
    default_tags: list[str] | None = None

    model_config = ConfigDict(from_attributes=True)


class LeadSourceConfigResponse(BaseModel):
    """Lead source config response — API keys are masked."""
    id: int
    provider: str
    api_key_masked: str | None = None
    page_id: str | None = None
    polling_interval_minutes: int = 5
    is_active: bool = True
    auto_assign: bool = False
    assign_to_user_id: int | None = None
    default_tags: list[str] | None = None
    total_ingested: int = 0
    total_duplicates: int = 0
    total_errors: int = 0
    last_sync_at: str | None = None
    created_at: str | None = None
    updated_at: str | None = None

    model_config = ConfigDict(from_attributes=True)


class LeadIngestionResult(BaseModel):
    """Result of a lead ingestion operation."""
    ingested: int = 0
    duplicates: int = 0
    errors: int = 0
    error_details: list[str] = Field(default_factory=list)


class LeadSourceStats(BaseModel):
    """Per-source lead counts."""
    source: str
    total: int = 0
    today: int = 0
    this_week: int = 0
    this_month: int = 0
