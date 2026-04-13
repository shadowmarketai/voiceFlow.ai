"""
Swetha Structures CRM - Quotation Schemas
===========================================
Pydantic v2 schemas for PEB quotation system.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class QuotationStatus(str, Enum):
    DRAFT = "draft"
    SENT = "sent"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    REVISED = "revised"


class RoofType(str, Enum):
    GABLE = "gable"
    SINGLE_SLOPE = "single_slope"


class SheetType(str, Enum):
    BARE = "bare"
    PUF = "puf"


# ── PEB Input ────────────────────────────────────────────────────


class PEBInput(BaseModel):
    """Building dimensions and material selection for BOQ calculation."""

    building_length: float = Field(..., gt=0, description="Length in feet")
    building_width: float = Field(..., gt=0, description="Width in feet")
    full_height: float = Field(..., gt=0, description="Full height (ridge) in feet")
    wall_height: float = Field(..., gt=0, description="Eave/wall height in feet")
    cladding_height: float = Field(..., gt=0, description="Cladding height in feet")

    roof_type: RoofType = RoofType.GABLE
    roof_sheet_type: SheetType = SheetType.BARE
    side_cladding_type: SheetType = SheetType.BARE

    mezzanine_required: bool = False
    mezz_length: Optional[float] = Field(default=None, ge=0)
    mezz_width: Optional[float] = Field(default=None, ge=0)

    lighting_sqft: Optional[float] = Field(default=None, ge=0)

    # Optional rate overrides
    steel_rate_main: Optional[float] = None
    steel_rate_mezz: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


# ── BOQ Result ───────────────────────────────────────────────────


class BOQItem(BaseModel):
    item_no: str
    description: str
    unit: str
    quantity: float
    rate: float
    amount: float
    category: str
    sub_note: Optional[str] = None


class BOQResult(BaseModel):
    items: list[BOQItem]
    total_amount: float
    floor_area: float
    rate_per_sqft: float
    steel_summary: dict[str, Any]
    cladding_summary: dict[str, Any]


# ── Quotation CRUD ───────────────────────────────────────────────


class QuotationCreate(BaseModel):
    """Create a new quotation — lead_id is mandatory."""

    lead_id: int = Field(..., description="CRM lead ID (required)")
    project_name: str = Field(..., min_length=1, max_length=500)
    client_name: Optional[str] = Field(default=None, max_length=300)
    client_location: Optional[str] = Field(default=None, max_length=500)
    building_params: PEBInput
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class QuotationUpdate(BaseModel):
    """Update an existing quotation (partial)."""

    project_name: Optional[str] = Field(default=None, max_length=500)
    client_name: Optional[str] = Field(default=None, max_length=300)
    client_location: Optional[str] = Field(default=None, max_length=500)
    building_params: Optional[PEBInput] = None
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class StatusUpdate(BaseModel):
    """Change quotation status."""

    status: QuotationStatus


class QuotationResponse(BaseModel):
    """Full quotation response."""

    id: int
    lead_id: int
    user_id: str
    project_name: str
    client_name: Optional[str] = None
    client_location: Optional[str] = None
    building_params: Optional[dict[str, Any]] = None
    boq_results: Optional[dict[str, Any]] = None
    total_amount: float = 0.0
    rate_per_sqft: float = 0.0
    status: str = "draft"
    revision: int = 1
    parent_quotation_id: Optional[int] = None
    pdf_path: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class QuotationLogResponse(BaseModel):
    """Audit log entry."""

    id: int
    quotation_id: int
    user_id: str
    action: str
    details: Optional[dict[str, Any]] = None
    created_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class QuotationStatsResponse(BaseModel):
    """Dashboard statistics."""

    total: int = 0
    draft: int = 0
    sent: int = 0
    accepted: int = 0
    rejected: int = 0
    revised: int = 0
    total_amount: float = 0.0
    monthly_amount: float = 0.0
