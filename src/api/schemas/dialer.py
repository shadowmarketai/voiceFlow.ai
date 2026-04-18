"""
Dialer Schemas
===============
Pydantic v2 request/response schemas for the auto-dialer module.
"""


from pydantic import BaseModel, ConfigDict, Field


class DialerCampaignCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    mode: str = Field("power", pattern="^(preview|power|predictive|progressive)$")
    caller_id: str | None = None
    start_time: str = "09:00"
    end_time: str = "21:00"
    days_of_week: list[int] = [0, 1, 2, 3, 4, 5]
    max_attempts_per_contact: int = Field(3, ge=1, le=10)
    retry_interval_minutes: int = Field(60, ge=5)
    max_concurrent_calls: int = Field(5, ge=1, le=50)
    script_template: str | None = None


class DialerCampaignUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    mode: str | None = None
    caller_id: str | None = None
    status: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    max_concurrent_calls: int | None = None
    script_template: str | None = None


class DialerCampaignResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str | None = None
    mode: str
    caller_id: str | None = None
    status: str
    start_time: str | None = None
    end_time: str | None = None
    total_contacts: int = 0
    contacted: int = 0
    connected: int = 0
    converted: int = 0
    created_at: str | None = None


class DialerContactCreate(BaseModel):
    phone: str = Field(..., min_length=10, max_length=20)
    name: str | None = None
    email: str | None = None
    priority: int = Field(5, ge=1, le=10)
    custom_fields: dict | None = None
    lead_id: int | None = None


class DialerContactBulkCreate(BaseModel):
    contacts: list[DialerContactCreate] = Field(..., min_length=1, max_length=10000)


class DialerCallComplete(BaseModel):
    disposition: str
    notes: str | None = None
    duration_seconds: int = 0
    recording_url: str | None = None


class DialerCallResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    campaign_id: int
    contact_id: int
    phone: str
    disposition: str | None = None
    duration_seconds: int = 0
    recording_url: str | None = None
    notes: str | None = None
    transcription: str | None = None
    emotion: str | None = None
    intent: str | None = None
    lead_score: float | None = None
    created_at: str | None = None


class CampaignStatsResponse(BaseModel):
    campaign_id: int
    total_contacts: int = 0
    contacted: int = 0
    connected: int = 0
    converted: int = 0
    completion_rate: float = 0.0
    connection_rate: float = 0.0
    conversion_rate: float = 0.0
    avg_lead_score: float | None = None
    avg_duration: float | None = None


class DNCCreate(BaseModel):
    phone: str = Field(..., min_length=10, max_length=20)
    reason: str | None = None
