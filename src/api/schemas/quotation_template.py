"""
Pydantic schemas for the Tendent Quotation Engine.
"""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


# ───────────────────────────────────────────── Template schemas ──

class RateItem(BaseModel):
    id: str
    label: str
    unit: str
    material_rate: float = 0.0
    labour_rate: float = 0.0
    description: Optional[str] = None
    formula: Optional[str] = None  # generic engine: e.g. "length * width"


class FieldSchema(BaseModel):
    key: str
    label: str
    type: str = "text"  # text | number | select | checkbox | textarea
    required: bool = False
    default: Any = None
    min: Optional[float] = None
    max: Optional[float] = None
    unit: Optional[str] = None
    options: Optional[list] = None
    help: Optional[str] = None
    group: Optional[str] = None
    show_if: Optional[dict] = None  # conditional visibility


class TemplateCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    slug: str = Field(..., min_length=2, max_length=120, pattern=r"^[a-z0-9\-]+$")
    description: Optional[str] = None
    icon: Optional[str] = None
    is_active: bool = True
    engine: str = "generic"  # peb | generic

    auto_generate_3d: bool = False
    auto_generate_drawings: bool = False
    auto_generate_render: bool = False

    fields_schema: list = Field(default_factory=list)
    rate_items: list = Field(default_factory=list)
    peb_config: Optional[dict] = None

    terms_conditions: Optional[str] = None
    branding_overrides: Optional[dict] = None
    default_validity_days: int = 30

    negotiation_enabled: bool = False
    max_discount_pct: float = 0.0
    negotiation_reject_message: Optional[str] = None


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    is_active: Optional[bool] = None
    engine: Optional[str] = None

    auto_generate_3d: Optional[bool] = None
    auto_generate_drawings: Optional[bool] = None
    auto_generate_render: Optional[bool] = None

    fields_schema: Optional[list] = None
    rate_items: Optional[list] = None
    peb_config: Optional[dict] = None

    terms_conditions: Optional[str] = None
    branding_overrides: Optional[dict] = None
    default_validity_days: Optional[int] = None

    negotiation_enabled: Optional[bool] = None
    max_discount_pct: Optional[float] = None
    negotiation_reject_message: Optional[str] = None


class TemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: str
    name: str
    slug: str
    description: Optional[str]
    icon: Optional[str]
    is_active: bool
    engine: str

    auto_generate_3d: bool
    auto_generate_drawings: bool
    auto_generate_render: bool

    fields_schema: list
    rate_items: list
    peb_config: Optional[dict]

    terms_conditions: Optional[str]
    branding_overrides: Optional[dict]
    default_validity_days: int

    negotiation_enabled: bool
    max_discount_pct: float
    negotiation_reject_message: Optional[str]

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ─────────────────────────────────────────────── Intake schemas ──

class IntakeSubmit(BaseModel):
    client_name: str = Field(..., min_length=2, max_length=200)
    client_phone: str = Field(..., min_length=7, max_length=30)
    client_email: Optional[str] = None
    client_company: Optional[str] = None
    client_location: Optional[str] = None
    form_data: dict = Field(default_factory=dict)


class IntakeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: str
    template_id: int
    client_name: str
    client_email: Optional[str]
    client_phone: str
    client_company: Optional[str]
    client_location: Optional[str]
    form_data: dict
    calc_result: Optional[dict]
    render_3d_url: Optional[str]
    drawings_url: Optional[str]
    ai_render_url: Optional[str]
    status: str
    quotation_id: Optional[int]
    assigned_user_id: Optional[str]
    created_at: Optional[datetime] = None


# ───────────────────────────────────────────── Calculate schemas ──

class CalcRequest(BaseModel):
    template_id: int
    form_data: dict


class CalcResponse(BaseModel):
    total_amount: float
    rate_per_sqft: Optional[float] = None
    floor_area: Optional[float] = None
    items: list = Field(default_factory=list)
    steel_summary: Optional[dict] = None
    meta: dict = Field(default_factory=dict)


# ─────────────────────────────────────────────── Offer schemas ──

class OfferPropose(BaseModel):
    proposed_amount: float = Field(..., gt=0)
    client_message: Optional[str] = None


class OfferResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    quotation_id: int
    proposed_amount: float
    original_amount: float
    discount_pct: float
    client_message: Optional[str]
    tenant_response: Optional[str]
    status: str
    created_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None


class OfferDecision(BaseModel):
    action: str = Field(..., pattern=r"^(approve|counter|reject)$")
    counter_amount: Optional[float] = None  # required when action == counter
    tenant_response: Optional[str] = None


# ─────────────────────────────────────────── Public portal schema ──

class PublicQuoteView(BaseModel):
    """What a client sees on the portal (no sensitive internal fields)."""
    quotation_id: int
    project_name: str
    client_name: Optional[str]
    status: str
    total_amount: float
    final_amount: Optional[float]
    revision: int
    valid_until: Optional[datetime]
    sent_at: Optional[datetime]
    boq_results: Optional[dict]
    render_3d_url: Optional[str]
    drawings_url: Optional[str]
    ai_render_urls: Optional[list]

    negotiation_enabled: bool
    max_discount_pct: float
    min_acceptable_amount: float  # computed: total_amount * (1 - pct/100)

    tenant: dict  # branding: name, logo_url, primary_color, accent_color
    template_name: Optional[str]
    terms_conditions: Optional[str]

    # Offer history visible to client
    offers: list = Field(default_factory=list)


class PublicQuestion(BaseModel):
    message: str = Field(..., min_length=2, max_length=2000)
