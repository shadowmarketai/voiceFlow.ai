"""
VoiceFlow Marketing AI - Campaign Schemas
==========================================
Request/response models for marketing campaigns.
Budget must be in INR (default currency).
Uses Pydantic v2 ConfigDict (KB-014).
"""

from enum import Enum
from typing import Any

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
    description: str | None = Field(default=None, max_length=5000)
    campaign_type: CampaignType | None = None
    platform: CampaignPlatform | None = None

    # Audience
    audience_type: str | None = Field(
        default=None,
        max_length=50,
        description="e.g. emotion_based, intent_based, dialect_based",
    )
    audience_criteria: dict[str, Any] | None = Field(
        default=None,
        description="JSON criteria for audience selection",
    )

    # Budget in INR (paisa for Razorpay compatibility)
    budget: float | None = Field(default=None, ge=0.0, description="Budget in INR")
    currency: str = Field(default="INR", max_length=3)

    # Schedule
    start_date: str | None = None
    end_date: str | None = None

    # Telephony (for voice campaigns)
    telephony_provider: str | None = Field(default=None, description="vobiz, bolna, telecmi, exotel, twilio")
    from_number: str | None = Field(default=None, description="Outbound caller ID (+91...)")
    language: str | None = Field(default="en", description="Campaign language: en, hi, ta, te, etc.")

    @field_validator("audience_criteria")
    @classmethod
    def validate_audience_criteria(cls, v: dict | None) -> dict | None:
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

    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    campaign_type: CampaignType | None = None
    platform: CampaignPlatform | None = None
    status: CampaignStatus | None = None

    audience_type: str | None = Field(default=None, max_length=50)
    audience_criteria: dict[str, Any] | None = None

    budget: float | None = Field(default=None, ge=0.0)
    currency: str | None = Field(default=None, max_length=3)

    start_date: str | None = None
    end_date: str | None = None

    @field_validator("audience_criteria")
    @classmethod
    def validate_audience_criteria(cls, v: dict | None) -> dict | None:
        if v is not None and not isinstance(v, dict):
            raise ValueError("audience_criteria must be a valid JSON object")
        return v

    model_config = ConfigDict(from_attributes=True)


class CampaignResponse(BaseModel):
    """Campaign entity response."""

    id: str
    name: str
    description: str | None = None
    campaign_type: str | None = None
    platform: str | None = None
    status: str = "draft"

    audience_type: str | None = None
    audience_criteria: dict[str, Any] | None = None
    audience_size: int | None = None

    budget: float | None = None
    spent: float = 0.0
    currency: str = "INR"

    impressions: int = 0
    clicks: int = 0
    conversions: int = 0
    total_calls_made: int = 0
    calls_connected: int = 0

    start_date: str | None = None
    end_date: str | None = None

    created_at: str | None = None
    updated_at: str | None = None

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
