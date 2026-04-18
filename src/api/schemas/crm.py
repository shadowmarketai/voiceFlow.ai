"""
VoiceFlow Marketing AI - CRM Schemas
======================================
Request/response models for CRM entities: Leads, Companies, Contacts, Deals, Activities.
Uses Pydantic v2 ConfigDict (KB-014).
"""

from enum import Enum

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

# ── Enums ────────────────────────────────────────────────────────


class LeadStatus(str, Enum):
    NEW = "new"
    CONTACTED = "contacted"
    QUALIFIED = "qualified"
    PROPOSAL = "proposal"
    NEGOTIATION = "negotiation"
    WON = "won"
    LOST = "lost"


class DealStage(str, Enum):
    DISCOVERY = "discovery"
    PROPOSAL = "proposal"
    NEGOTIATION = "negotiation"
    CLOSED_WON = "closed_won"
    CLOSED_LOST = "closed_lost"


class ActivityType(str, Enum):
    CALL = "call"
    EMAIL = "email"
    MEETING = "meeting"
    NOTE = "note"
    TASK = "task"
    WHATSAPP = "whatsapp"


# ── Lead Schemas ─────────────────────────────────────────────────


class LeadCreate(BaseModel):
    """Create a new lead."""

    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    phone: str = Field(..., min_length=5, max_length=20)
    email: EmailStr | None = None
    company: str | None = Field(default=None, max_length=200)
    source: str | None = Field(default="Manual", max_length=50)
    status: LeadStatus = LeadStatus.NEW
    lead_score: float = Field(default=0.0, ge=0.0, le=100.0)
    notes: str | None = Field(default=None, max_length=5000)
    assigned_to: str | None = None
    tags: list[str] = Field(default_factory=list)
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        cleaned = v.strip().replace(" ", "").replace("-", "")
        if len(cleaned) < 5:
            raise ValueError("Phone number is too short")
        return v.strip()

    model_config = ConfigDict(from_attributes=True)


class LeadUpdate(BaseModel):
    """Update an existing lead (partial update)."""

    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, min_length=5, max_length=20)
    email: EmailStr | None = None
    company: str | None = Field(default=None, max_length=200)
    source: str | None = Field(default=None, max_length=50)
    status: LeadStatus | None = None
    lead_score: float | None = Field(default=None, ge=0.0, le=100.0)
    notes: str | None = Field(default=None, max_length=5000)
    assigned_to: str | None = None
    tags: list[str] | None = None
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None

    model_config = ConfigDict(from_attributes=True)


class LeadResponse(BaseModel):
    """Lead entity response."""

    id: str
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    email: str | None = None
    company: str | None = None
    source: str | None = None
    status: str | None = None
    lead_score: float = 0.0
    notes: str | None = None
    assigned_to: str | None = None
    tags: list[str] = Field(default_factory=list)
    primary_emotion: str | None = None
    primary_intent: str | None = None
    detected_dialect: str | None = None
    avg_sentiment: float = 0.0
    crm_type: str | None = None
    crm_record_id: str | None = None
    created_at: str | None = None
    updated_at: str | None = None

    model_config = ConfigDict(from_attributes=True)


# ── Company Schemas ──────────────────────────────────────────────


class CompanyCreate(BaseModel):
    """Create a new company."""

    name: str = Field(..., min_length=1, max_length=200)
    contact_person: str | None = Field(default=None, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=20)
    website: str | None = Field(default=None, max_length=500)
    industry: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=500)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    country: str | None = Field(default="India", max_length=100)
    gstn: str | None = Field(default=None, max_length=20)
    notes: str | None = Field(default=None, max_length=5000)

    model_config = ConfigDict(from_attributes=True)


class CompanyUpdate(BaseModel):
    """Update an existing company (partial update)."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    contact_person: str | None = Field(default=None, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=20)
    website: str | None = Field(default=None, max_length=500)
    industry: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=500)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    country: str | None = Field(default=None, max_length=100)
    gstn: str | None = Field(default=None, max_length=20)
    notes: str | None = Field(default=None, max_length=5000)

    model_config = ConfigDict(from_attributes=True)


class CompanyResponse(BaseModel):
    """Company entity response."""

    id: str
    name: str
    contact_person: str | None = None
    email: str | None = None
    phone: str | None = None
    website: str | None = None
    industry: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    gstn: str | None = None
    notes: str | None = None
    leads_count: int = 0
    orders_count: int = 0
    created_at: str | None = None
    updated_at: str | None = None

    model_config = ConfigDict(from_attributes=True)


# ── Contact Schemas ──────────────────────────────────────────────


class ContactCreate(BaseModel):
    """Create a new contact."""

    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=20)
    mobile: str | None = Field(default=None, max_length=20)
    company_id: str | None = None
    designation: str | None = Field(default=None, max_length=100)
    department: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=5000)

    model_config = ConfigDict(from_attributes=True)


class ContactUpdate(BaseModel):
    """Update an existing contact (partial update)."""

    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=20)
    mobile: str | None = Field(default=None, max_length=20)
    company_id: str | None = None
    designation: str | None = Field(default=None, max_length=100)
    department: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=5000)

    model_config = ConfigDict(from_attributes=True)


class ContactResponse(BaseModel):
    """Contact entity response."""

    id: str
    first_name: str
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    mobile: str | None = None
    company_id: str | None = None
    company_name: str | None = None
    designation: str | None = None
    department: str | None = None
    address: str | None = None
    notes: str | None = None
    created_at: str | None = None
    updated_at: str | None = None

    model_config = ConfigDict(from_attributes=True)


# ── Deal Schemas ─────────────────────────────────────────────────


class DealCreate(BaseModel):
    """Create a new deal."""

    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    value: float = Field(default=0.0, ge=0.0, description="Deal value in INR")
    stage: DealStage = DealStage.DISCOVERY
    lead_id: str | None = None
    company_id: str | None = None
    contact_id: str | None = None
    assigned_to: str | None = None
    expected_close_date: str | None = None
    probability: float = Field(default=0.0, ge=0.0, le=100.0)

    model_config = ConfigDict(from_attributes=True)


class DealUpdate(BaseModel):
    """Update an existing deal (partial update)."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    value: float | None = Field(default=None, ge=0.0)
    stage: DealStage | None = None
    lead_id: str | None = None
    company_id: str | None = None
    contact_id: str | None = None
    assigned_to: str | None = None
    expected_close_date: str | None = None
    probability: float | None = Field(default=None, ge=0.0, le=100.0)

    model_config = ConfigDict(from_attributes=True)


class DealResponse(BaseModel):
    """Deal entity response."""

    id: str
    title: str
    description: str | None = None
    value: float = 0.0
    stage: str | None = None
    lead_id: str | None = None
    company_id: str | None = None
    contact_id: str | None = None
    assigned_to: str | None = None
    expected_close_date: str | None = None
    probability: float = 0.0
    created_at: str | None = None
    updated_at: str | None = None

    model_config = ConfigDict(from_attributes=True)


# ── Activity Schemas ─────────────────────────────────────────────


class ActivityCreate(BaseModel):
    """Create a new activity (call log, note, task, etc.)."""

    activity_type: ActivityType
    subject: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    lead_id: str | None = None
    contact_id: str | None = None
    deal_id: str | None = None
    due_date: str | None = None
    duration_minutes: int | None = Field(default=None, ge=0)
    outcome: str | None = Field(default=None, max_length=200)

    model_config = ConfigDict(from_attributes=True)


class ActivityResponse(BaseModel):
    """Activity entity response."""

    id: str
    activity_type: str
    subject: str
    description: str | None = None
    lead_id: str | None = None
    contact_id: str | None = None
    deal_id: str | None = None
    due_date: str | None = None
    duration_minutes: int | None = None
    outcome: str | None = None
    created_by: str | None = None
    created_at: str | None = None

    model_config = ConfigDict(from_attributes=True)
