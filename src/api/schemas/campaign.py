"""
VoiceFlow Marketing AI - Campaign Schemas
==========================================
Request/response models for marketing campaigns.
Budget must be in INR (default currency).
Uses Pydantic v2 ConfigDict (KB-014).
"""

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CampaignStatus(str, Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class CampaignPlatform(str, Enum):
    META = "meta"
    GOOGLE = "google"
    WHATSAPP = "whatsapp"
    EMAIL = "email"
    SMS = "sms"


class CampaignType(str, Enum):
    RETARGET = "retarget"
    NURTURE = "nurture"
    WIN_BACK = "win_back"
    AWARENESS = "awareness"
    ENGAGEMENT = "engagement"


class CampaignCreate(BaseModel):
    """Create a new marketing campaign."""

    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    campaign_type: Optional[CampaignType] = None
    platform: Optional[CampaignPlatform] = None

    # Audience
    audience_type: Optional[str] = Field(
        default=None,
        max_length=50,
        description="e.g. emotion_based, intent_based, dialect_based",
    )
    audience_criteria: Optional[dict[str, Any]] = Field(
        default=None,
        description="JSON criteria for audience selection",
    )

    # Budget in INR (paisa for Razorpay compatibility)
    budget: Optional[float] = Field(default=None, ge=0.0, description="Budget in INR")
    currency: str = Field(default="INR", max_length=3)

    # Schedule
    start_date: Optional[str] = None
    end_date: Optional[str] = None

    @field_validator("audience_criteria")
    @classmethod
    def validate_audience_criteria(cls, v: Optional[dict]) -> Optional[dict]:
        """Ensure audience_criteria is valid JSON if provided."""
        if v is not None and not isinstance(v, dict):
            raise ValueError("audience_criteria must be a valid JSON object")
        return v

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        if v.upper() != "INR":
            raise ValueError("Currency must be INR (Indian Rupees)")
        return v.upper()

    model_config = ConfigDict(from_attributes=True)


class CampaignUpdate(BaseModel):
    """Update an existing marketing campaign (partial update)."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    campaign_type: Optional[CampaignType] = None
    platform: Optional[CampaignPlatform] = None
    status: Optional[CampaignStatus] = None

    audience_type: Optional[str] = Field(default=None, max_length=50)
    audience_criteria: Optional[dict[str, Any]] = None

    budget: Optional[float] = Field(default=None, ge=0.0)
    currency: Optional[str] = Field(default=None, max_length=3)

    start_date: Optional[str] = None
    end_date: Optional[str] = None

    @field_validator("audience_criteria")
    @classmethod
    def validate_audience_criteria(cls, v: Optional[dict]) -> Optional[dict]:
        if v is not None and not isinstance(v, dict):
            raise ValueError("audience_criteria must be a valid JSON object")
        return v

    model_config = ConfigDict(from_attributes=True)


class CampaignResponse(BaseModel):
    """Campaign entity response."""

    id: str
    name: str
    description: Optional[str] = None
    campaign_type: Optional[str] = None
    platform: Optional[str] = None
    status: str = "draft"

    audience_type: Optional[str] = None
    audience_criteria: Optional[dict[str, Any]] = None
    audience_size: Optional[int] = None

    budget: Optional[float] = None
    spent: float = 0.0
    currency: str = "INR"

    impressions: int = 0
    clicks: int = 0
    conversions: int = 0

    start_date: Optional[str] = None
    end_date: Optional[str] = None

    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class CampaignStatsResponse(BaseModel):
    """Campaign performance statistics."""

    campaign_id: str
    name: str
    status: str
    total_contacts: int = 0
    dialed: int = 0
    connected: int = 0
    converted: int = 0
    connect_rate: float = 0.0
    conversion_rate: float = 0.0
    progress: float = 0.0

    model_config = ConfigDict(from_attributes=True)
