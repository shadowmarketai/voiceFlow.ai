"""
VoiceFlow Marketing AI - Lead Sources Schemas
===============================================
Request/response models for lead source integrations (IndiaMart, JustDial, Facebook).
Uses Pydantic v2 ConfigDict (KB-014).
"""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class LeadSourceProviderEnum(str, Enum):
    INDIAMART = "indiamart"
    JUSTDIAL = "justdial"
    FACEBOOK_LEADS = "facebook_leads"


class LeadSourceConfigCreate(BaseModel):
    """Create or update a lead source configuration."""
    provider: LeadSourceProviderEnum
    api_key: Optional[str] = Field(default=None, max_length=500)
    api_secret: Optional[str] = Field(default=None, max_length=500)
    app_secret: Optional[str] = Field(default=None, max_length=500)
    page_id: Optional[str] = Field(default=None, max_length=255)
    polling_interval_minutes: int = Field(default=5, ge=1, le=60)
    is_active: bool = True
    auto_assign: bool = False
    assign_to_user_id: Optional[int] = None
    default_tags: Optional[list[str]] = None

    model_config = ConfigDict(from_attributes=True)


class LeadSourceConfigUpdate(BaseModel):
    """Partial update for a lead source configuration."""
    api_key: Optional[str] = Field(default=None, max_length=500)
    api_secret: Optional[str] = Field(default=None, max_length=500)
    app_secret: Optional[str] = Field(default=None, max_length=500)
    page_id: Optional[str] = Field(default=None, max_length=255)
    polling_interval_minutes: Optional[int] = Field(default=None, ge=1, le=60)
    is_active: Optional[bool] = None
    auto_assign: Optional[bool] = None
    assign_to_user_id: Optional[int] = None
    default_tags: Optional[list[str]] = None

    model_config = ConfigDict(from_attributes=True)


class LeadSourceConfigResponse(BaseModel):
    """Lead source config response — API keys are masked."""
    id: int
    provider: str
    api_key_masked: Optional[str] = None
    page_id: Optional[str] = None
    polling_interval_minutes: int = 5
    is_active: bool = True
    auto_assign: bool = False
    assign_to_user_id: Optional[int] = None
    default_tags: Optional[list[str]] = None
    total_ingested: int = 0
    total_duplicates: int = 0
    total_errors: int = 0
    last_sync_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

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
