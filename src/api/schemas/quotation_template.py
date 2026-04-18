"""
Pydantic schemas for the Tendent Quotation Engine.
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# ───────────────────────────────────────────── Template schemas ──

class RateItem(BaseModel):
    id: str
    label: str
    unit: str
    material_rate: float = 0.0
    labour_rate: float = 0.0
    description: str | None = None
    formula: str | None = None  # generic engine: e.g. "length * width"


class FieldSchema(BaseModel):
    key: str
    label: str
    type: str = "text"  # text | number | select | checkbox | textarea
    required: bool = False
    default: Any = None
    min: float | None = None
    max: float | None = None
    unit: str | None = None
    options: list | None = None
    help: str | None = None
    group: str | None = None
    show_if: dict | None = None  # conditional visibility


class TemplateCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    slug: str = Field(..., min_length=2, max_length=120, pattern=r"^[a-z0-9\-]+$")
    description: str | None = None
    icon: str | None = None
    is_active: bool = True
    engine: str = "generic"  # peb | generic

    auto_generate_3d: bool = False
    auto_generate_drawings: bool = False
    auto_generate_render: bool = False

    fields_schema: list = Field(default_factory=list)
    rate_items: list = Field(default_factory=list)
    peb_config: dict | None = None

    terms_conditions: str | None = None
    branding_overrides: dict | None = None
    default_validity_days: int = 30

    negotiation_enabled: bool = False
    max_discount_pct: float = 0.0
    negotiation_reject_message: str | None = None


class TemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    icon: str | None = None
    is_active: bool | None = None
    engine: str | None = None

    auto_generate_3d: bool | None = None
    auto_generate_drawings: bool | None = None
    auto_generate_render: bool | None = None

    fields_schema: list | None = None
    rate_items: list | None = None
    peb_config: dict | None = None

    terms_conditions: str | None = None
    branding_overrides: dict | None = None
    default_validity_days: int | None = None

    negotiation_enabled: bool | None = None
    max_discount_pct: float | None = None
    negotiation_reject_message: str | None = None


class TemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: str
    name: str
    slug: str
    description: str | None
    icon: str | None
    is_active: bool
    engine: str

    auto_generate_3d: bool
    auto_generate_drawings: bool
    auto_generate_render: bool

    fields_schema: list
    rate_items: list
    peb_config: dict | None

    terms_conditions: str | None
    branding_overrides: dict | None
    default_validity_days: int

    negotiation_enabled: bool
    max_discount_pct: float
    negotiation_reject_message: str | None

    created_at: datetime | None = None
    updated_at: datetime | None = None


# ─────────────────────────────────────────────── Intake schemas ──

class IntakeSubmit(BaseModel):
    client_name: str = Field(..., min_length=2, max_length=200)
    client_phone: str = Field(..., min_length=7, max_length=30)
    client_email: str | None = None
    client_company: str | None = None
    client_location: str | None = None
    form_data: dict = Field(default_factory=dict)


class IntakeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: str
    template_id: int
    client_name: str
    client_email: str | None
    client_phone: str
    client_company: str | None
    client_location: str | None
    form_data: dict
    calc_result: dict | None
    render_3d_url: str | None
    drawings_url: str | None
    ai_render_url: str | None
    status: str
    quotation_id: int | None
    assigned_user_id: str | None
    created_at: datetime | None = None


# ───────────────────────────────────────────── Calculate schemas ──

class CalcRequest(BaseModel):
    template_id: int
    form_data: dict


class CalcResponse(BaseModel):
    total_amount: float
    rate_per_sqft: float | None = None
    floor_area: float | None = None
    items: list = Field(default_factory=list)
    steel_summary: dict | None = None
    meta: dict = Field(default_factory=dict)


# ─────────────────────────────────────────────── Offer schemas ──

class OfferPropose(BaseModel):
    proposed_amount: float = Field(..., gt=0)
    client_message: str | None = None


class OfferResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    quotation_id: int
    proposed_amount: float
    original_amount: float
    discount_pct: float
    client_message: str | None
    tenant_response: str | None
    status: str
    created_at: datetime | None = None
    resolved_at: datetime | None = None


class OfferDecision(BaseModel):
    action: str = Field(..., pattern=r"^(approve|counter|reject)$")
    counter_amount: float | None = None  # required when action == counter
    tenant_response: str | None = None


# ─────────────────────────────────────────── Public portal schema ──

class PublicQuoteView(BaseModel):
    """What a client sees on the portal (no sensitive internal fields)."""
    quotation_id: int
    project_name: str
    client_name: str | None
    status: str
    total_amount: float
    final_amount: float | None
    revision: int
    valid_until: datetime | None
    sent_at: datetime | None
    boq_results: dict | None
    render_3d_url: str | None
    drawings_url: str | None
    ai_render_urls: list | None

    negotiation_enabled: bool
    max_discount_pct: float
    min_acceptable_amount: float  # computed: total_amount * (1 - pct/100)

    tenant: dict  # branding: name, logo_url, primary_color, accent_color
    template_name: str | None
    terms_conditions: str | None

    # Offer history visible to client
    offers: list = Field(default_factory=list)


class PublicQuestion(BaseModel):
    message: str = Field(..., min_length=2, max_length=2000)
