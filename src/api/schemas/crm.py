"""
VoiceFlow Marketing AI - CRM Schemas
======================================
Request/response models for CRM entities: Leads, Companies, Contacts, Deals, Activities.
Uses Pydantic v2 ConfigDict (KB-014).
"""

from enum import Enum
from typing import Optional

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
    last_name: Optional[str] = Field(default=None, max_length=100)
    phone: str = Field(..., min_length=5, max_length=20)
    email: Optional[EmailStr] = None
    company: Optional[str] = Field(default=None, max_length=200)
    source: Optional[str] = Field(default="Manual", max_length=50)
    status: LeadStatus = LeadStatus.NEW
    lead_score: float = Field(default=0.0, ge=0.0, le=100.0)
    notes: Optional[str] = Field(default=None, max_length=5000)
    assigned_to: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None

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

    first_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(default=None, max_length=100)
    phone: Optional[str] = Field(default=None, min_length=5, max_length=20)
    email: Optional[EmailStr] = None
    company: Optional[str] = Field(default=None, max_length=200)
    source: Optional[str] = Field(default=None, max_length=50)
    status: Optional[LeadStatus] = None
    lead_score: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    notes: Optional[str] = Field(default=None, max_length=5000)
    assigned_to: Optional[str] = None
    tags: Optional[list[str]] = None
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class LeadResponse(BaseModel):
    """Lead entity response."""

    id: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    source: Optional[str] = None
    status: Optional[str] = None
    lead_score: float = 0.0
    notes: Optional[str] = None
    assigned_to: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    primary_emotion: Optional[str] = None
    primary_intent: Optional[str] = None
    detected_dialect: Optional[str] = None
    avg_sentiment: float = 0.0
    crm_type: Optional[str] = None
    crm_record_id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ── Company Schemas ──────────────────────────────────────────────


class CompanyCreate(BaseModel):
    """Create a new company."""

    name: str = Field(..., min_length=1, max_length=200)
    contact_person: Optional[str] = Field(default=None, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=20)
    website: Optional[str] = Field(default=None, max_length=500)
    industry: Optional[str] = Field(default=None, max_length=100)
    address: Optional[str] = Field(default=None, max_length=500)
    city: Optional[str] = Field(default=None, max_length=100)
    state: Optional[str] = Field(default=None, max_length=100)
    country: Optional[str] = Field(default="India", max_length=100)
    gstn: Optional[str] = Field(default=None, max_length=20)
    notes: Optional[str] = Field(default=None, max_length=5000)

    model_config = ConfigDict(from_attributes=True)


class CompanyUpdate(BaseModel):
    """Update an existing company (partial update)."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    contact_person: Optional[str] = Field(default=None, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=20)
    website: Optional[str] = Field(default=None, max_length=500)
    industry: Optional[str] = Field(default=None, max_length=100)
    address: Optional[str] = Field(default=None, max_length=500)
    city: Optional[str] = Field(default=None, max_length=100)
    state: Optional[str] = Field(default=None, max_length=100)
    country: Optional[str] = Field(default=None, max_length=100)
    gstn: Optional[str] = Field(default=None, max_length=20)
    notes: Optional[str] = Field(default=None, max_length=5000)

    model_config = ConfigDict(from_attributes=True)


class CompanyResponse(BaseModel):
    """Company entity response."""

    id: str
    name: str
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    industry: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    gstn: Optional[str] = None
    notes: Optional[str] = None
    leads_count: int = 0
    orders_count: int = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ── Contact Schemas ──────────────────────────────────────────────


class ContactCreate(BaseModel):
    """Create a new contact."""

    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: Optional[str] = Field(default=None, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=20)
    mobile: Optional[str] = Field(default=None, max_length=20)
    company_id: Optional[str] = None
    designation: Optional[str] = Field(default=None, max_length=100)
    department: Optional[str] = Field(default=None, max_length=100)
    address: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = Field(default=None, max_length=5000)

    model_config = ConfigDict(from_attributes=True)


class ContactUpdate(BaseModel):
    """Update an existing contact (partial update)."""

    first_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(default=None, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=20)
    mobile: Optional[str] = Field(default=None, max_length=20)
    company_id: Optional[str] = None
    designation: Optional[str] = Field(default=None, max_length=100)
    department: Optional[str] = Field(default=None, max_length=100)
    address: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = Field(default=None, max_length=5000)

    model_config = ConfigDict(from_attributes=True)


class ContactResponse(BaseModel):
    """Contact entity response."""

    id: str
    first_name: str
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    designation: Optional[str] = None
    department: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ── Deal Schemas ─────────────────────────────────────────────────


class DealCreate(BaseModel):
    """Create a new deal."""

    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    value: float = Field(default=0.0, ge=0.0, description="Deal value in INR")
    stage: DealStage = DealStage.DISCOVERY
    lead_id: Optional[str] = None
    company_id: Optional[str] = None
    contact_id: Optional[str] = None
    assigned_to: Optional[str] = None
    expected_close_date: Optional[str] = None
    probability: float = Field(default=0.0, ge=0.0, le=100.0)

    model_config = ConfigDict(from_attributes=True)


class DealUpdate(BaseModel):
    """Update an existing deal (partial update)."""

    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    value: Optional[float] = Field(default=None, ge=0.0)
    stage: Optional[DealStage] = None
    lead_id: Optional[str] = None
    company_id: Optional[str] = None
    contact_id: Optional[str] = None
    assigned_to: Optional[str] = None
    expected_close_date: Optional[str] = None
    probability: Optional[float] = Field(default=None, ge=0.0, le=100.0)

    model_config = ConfigDict(from_attributes=True)


class DealResponse(BaseModel):
    """Deal entity response."""

    id: str
    title: str
    description: Optional[str] = None
    value: float = 0.0
    stage: Optional[str] = None
    lead_id: Optional[str] = None
    company_id: Optional[str] = None
    contact_id: Optional[str] = None
    assigned_to: Optional[str] = None
    expected_close_date: Optional[str] = None
    probability: float = 0.0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ── Activity Schemas ─────────────────────────────────────────────


class ActivityCreate(BaseModel):
    """Create a new activity (call log, note, task, etc.)."""

    activity_type: ActivityType
    subject: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    lead_id: Optional[str] = None
    contact_id: Optional[str] = None
    deal_id: Optional[str] = None
    due_date: Optional[str] = None
    duration_minutes: Optional[int] = Field(default=None, ge=0)
    outcome: Optional[str] = Field(default=None, max_length=200)

    model_config = ConfigDict(from_attributes=True)


class ActivityResponse(BaseModel):
    """Activity entity response."""

    id: str
    activity_type: str
    subject: str
    description: Optional[str] = None
    lead_id: Optional[str] = None
    contact_id: Optional[str] = None
    deal_id: Optional[str] = None
    due_date: Optional[str] = None
    duration_minutes: Optional[int] = None
    outcome: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
