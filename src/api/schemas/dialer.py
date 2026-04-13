"""
Dialer Schemas
===============
Pydantic v2 request/response schemas for the auto-dialer module.
"""

from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field


class DialerCampaignCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    mode: str = Field("power", pattern="^(preview|power|predictive|progressive)$")
    caller_id: Optional[str] = None
    start_time: str = "09:00"
    end_time: str = "21:00"
    days_of_week: List[int] = [0, 1, 2, 3, 4, 5]
    max_attempts_per_contact: int = Field(3, ge=1, le=10)
    retry_interval_minutes: int = Field(60, ge=5)
    max_concurrent_calls: int = Field(5, ge=1, le=50)
    script_template: Optional[str] = None


class DialerCampaignUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    mode: Optional[str] = None
    caller_id: Optional[str] = None
    status: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    max_concurrent_calls: Optional[int] = None
    script_template: Optional[str] = None


class DialerCampaignResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: Optional[str] = None
    mode: str
    caller_id: Optional[str] = None
    status: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    total_contacts: int = 0
    contacted: int = 0
    connected: int = 0
    converted: int = 0
    created_at: Optional[str] = None


class DialerContactCreate(BaseModel):
    phone: str = Field(..., min_length=10, max_length=20)
    name: Optional[str] = None
    email: Optional[str] = None
    priority: int = Field(5, ge=1, le=10)
    custom_fields: Optional[dict] = None
    lead_id: Optional[int] = None


class DialerContactBulkCreate(BaseModel):
    contacts: List[DialerContactCreate] = Field(..., min_length=1, max_length=10000)


class DialerCallComplete(BaseModel):
    disposition: str
    notes: Optional[str] = None
    duration_seconds: int = 0
    recording_url: Optional[str] = None


class DialerCallResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    campaign_id: int
    contact_id: int
    phone: str
    disposition: Optional[str] = None
    duration_seconds: int = 0
    recording_url: Optional[str] = None
    notes: Optional[str] = None
    transcription: Optional[str] = None
    emotion: Optional[str] = None
    intent: Optional[str] = None
    lead_score: Optional[float] = None
    created_at: Optional[str] = None


class CampaignStatsResponse(BaseModel):
    campaign_id: int
    total_contacts: int = 0
    contacted: int = 0
    connected: int = 0
    converted: int = 0
    completion_rate: float = 0.0
    connection_rate: float = 0.0
    conversion_rate: float = 0.0
    avg_lead_score: Optional[float] = None
    avg_duration: Optional[float] = None


class DNCCreate(BaseModel):
    phone: str = Field(..., min_length=10, max_length=20)
    reason: Optional[str] = None
