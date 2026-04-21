"""
VoiceFlow AI - Leads Schemas
==============================
Pydantic v2 schemas for the leads database.
"""

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, model_validator


# ── Lead Capture (universal ingest) ──────────────────────────────

class LeadCaptureRequest(BaseModel):
    """Single endpoint for all lead sources — dedupes by tenant + phone."""
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    phone_country: str | None = Field(None, max_length=2)

    business_name: str | None = None
    business_type: str | None = None
    business_size: str | None = None
    location_city: str | None = None
    location_state: str | None = None
    location_country: str | None = Field(None, max_length=2)

    source: str = Field("manual", description="manual, csv, voiceflow, facebook, google, indiamart, justdial, zoho, hubspot, etc.")
    source_campaign: str | None = None
    source_medium: str | None = None
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None

    intent: str | None = None
    budget_range: str | None = None
    timeline: str | None = None

    consent_given: bool = False
    consent_source: str | None = None
    marketing_optin: bool = False

    tags: list[str] = Field(default_factory=list)
    custom_fields: dict[str, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def require_phone_or_email(self):
        if not self.phone and not self.email:
            raise ValueError("At least one of phone or email is required")
        return self


class LeadCaptureResponse(BaseModel):
    lead_id: str
    is_new: bool
    lead_score: int
    status: str


# ── Lead CRUD ────────────────────────────────────────────────────

class LeadCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: str | None = None
    phone: str | None = None
    phone_country: str | None = None
    business_name: str | None = None
    business_type: str | None = None
    location_city: str | None = None
    location_state: str | None = None
    source: str = "manual"
    status: str = "new"
    qualification: str = "cold"
    assigned_to: str | None = None
    tags: list[str] = Field(default_factory=list)
    custom_fields: dict[str, str] = Field(default_factory=dict)


class LeadUpdateRequest(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    business_name: str | None = None
    business_type: str | None = None
    location_city: str | None = None
    location_state: str | None = None
    status: str | None = None
    qualification: str | None = None
    lead_score: int | None = None
    assigned_to: str | None = None
    next_followup_at: datetime | None = None
    tags: list[str] | None = None
    custom_fields: dict[str, str] | None = None


class LeadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    phone_country: str | None = None
    business_name: str | None = None
    business_type: str | None = None
    business_size: str | None = None
    location_city: str | None = None
    location_state: str | None = None
    location_country: str | None = None
    source: str
    source_campaign: str | None = None
    source_medium: str | None = None
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None
    intent: str | None = None
    budget_range: str | None = None
    timeline: str | None = None
    lead_score: int
    qualification: str
    status: str
    assigned_to: str | None = None
    converted_at: str | None = None
    deal_value: float | None = None
    consent_given: bool
    marketing_optin: bool
    created_at: str
    updated_at: str
    last_contacted_at: str | None = None
    next_followup_at: str | None = None
    tags: list[str] = Field(default_factory=list)
    custom_fields: dict[str, str] = Field(default_factory=dict)


class LeadListResponse(BaseModel):
    leads: list[LeadResponse]
    total: int
    page: int
    per_page: int


# ── Lead Interaction ─────────────────────────────────────────────

class InteractionCreateRequest(BaseModel):
    lead_id: str
    channel: str  # voiceflow, whatsapp, call, email, sms
    direction: str = "inbound"
    content: str | None = None
    metadata_json: dict | None = None
    sentiment: str | None = None
    intent_detected: str | None = None


class InteractionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    lead_id: str
    channel: str
    direction: str
    content: str | None = None
    sentiment: str | None = None
    intent_detected: str | None = None
    created_at: str


# ── CSV Import ───────────────────────────────────────────────────

class ImportResult(BaseModel):
    total_rows: int
    created: int
    updated: int
    skipped: int
    errors: list[str] = Field(default_factory=list)


# ── Pipeline Stats ───────────────────────────────────────────────

class PipelineStats(BaseModel):
    new: int = 0
    contacted: int = 0
    nurturing: int = 0
    converted: int = 0
    lost: int = 0
    total: int = 0


# ── CRM Connection ───────────────────────────────────────────────

class CrmConnectionCreateRequest(BaseModel):
    provider: str = Field(..., description="zoho, hubspot, salesforce, pipedrive, freshsales, custom")
    display_name: str | None = None
    api_key: str | None = None
    webhook_url: str | None = None
    field_mapping: dict | None = None
    sync_direction: str = "bidirectional"
    sync_interval_minutes: int = 15


class CrmConnectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    provider: str
    display_name: str | None = None
    sync_direction: str
    sync_interval_minutes: int
    last_sync_at: str | None = None
    last_sync_status: str | None = None
    is_active: bool
    has_access_token: bool = False
    has_api_key: bool = False
    field_mapping: dict | None = None
    created_at: str


# ── Ad Source Connection ─────────────────────────────────────────

class AdSourceCreateRequest(BaseModel):
    provider: str = Field(..., description="facebook, google, indiamart, justdial, linkedin, website")
    display_name: str | None = None
    auth_type: str = "webhook"
    credentials: dict | None = None
    polling_interval_minutes: int | None = None
    auto_assign_agent_id: str | None = None
    default_tags: list[str] | None = None


class AdSourceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    provider: str
    display_name: str | None = None
    auth_type: str
    webhook_url: str | None = None
    polling_interval_minutes: int | None = None
    auto_assign_agent_id: str | None = None
    default_tags: list[str] | None = None
    is_active: bool
    last_poll_at: str | None = None
    created_at: str


# ── Sync Log ─────────────────────────────────────────────────────

class SyncLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    connection_type: str
    provider: str
    direction: str
    status: str
    records_processed: int
    records_created: int
    records_updated: int
    records_skipped: int
    started_at: str
    completed_at: str | None = None


# ── CRM Write-back ───────────────────────────────────────────────

class CrmWritebackPayload(BaseModel):
    """Payload pushed to external CRM after a call completes."""
    lead_id: str
    call_id: str | None = None
    transcript: str | None = None
    recording_url: str | None = None
    duration_seconds: float | None = None
    emotion: str | None = None
    intent: str | None = None
    sentiment: float | None = None
    lead_score: int | None = None
    status_update: str | None = None
    notes: str | None = None
