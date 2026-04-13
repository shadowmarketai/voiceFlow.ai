"""
VoiceFlow Marketing AI - Appointment Schemas (Pydantic v2)
===========================================================
"""

from datetime import datetime, time, date
from typing import Optional, List, Any

from pydantic import BaseModel, ConfigDict, Field, EmailStr


# ── Service ───────────────────────────────────────────────────


class ServiceBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    duration_min: int = Field(30, ge=5, le=480)
    buffer_before_min: int = Field(0, ge=0, le=120)
    buffer_after_min: int = Field(0, ge=0, le=120)
    price_cents: int = Field(0, ge=0)
    currency: str = Field("INR", min_length=3, max_length=3)
    color: str = Field("#6366f1", pattern=r"^#[0-9a-fA-F]{6,8}$")
    location_type: str = Field("google_meet")
    location_value: Optional[str] = None
    min_notice_min: int = Field(60, ge=0)
    max_advance_days: int = Field(60, ge=1, le=365)
    max_per_day: Optional[int] = None
    intake_form: Optional[List[dict]] = None
    is_active: bool = True


class ServiceCreate(ServiceBase):
    pass


class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    duration_min: Optional[int] = None
    buffer_before_min: Optional[int] = None
    buffer_after_min: Optional[int] = None
    price_cents: Optional[int] = None
    currency: Optional[str] = None
    color: Optional[str] = None
    location_type: Optional[str] = None
    location_value: Optional[str] = None
    min_notice_min: Optional[int] = None
    max_advance_days: Optional[int] = None
    max_per_day: Optional[int] = None
    intake_form: Optional[List[dict]] = None
    is_active: Optional[bool] = None


class ServiceResponse(ServiceBase):
    id: int
    slug: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ── Availability ──────────────────────────────────────────────


class AvailabilityRuleSchema(BaseModel):
    weekday: int = Field(..., ge=0, le=6)
    start_time: time
    end_time: time
    is_open: bool = True
    timezone: str = "Asia/Kolkata"

    model_config = ConfigDict(from_attributes=True)


class AvailabilityRuleResponse(AvailabilityRuleSchema):
    id: int


class AvailabilityOverrideCreate(BaseModel):
    date: date
    is_closed: bool = False
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    reason: Optional[str] = None


class AvailabilityOverrideResponse(AvailabilityOverrideCreate):
    id: int

    model_config = ConfigDict(from_attributes=True)


# ── Booking ───────────────────────────────────────────────────


class BookingBase(BaseModel):
    service_id: Optional[int] = None
    client_name: str = Field(..., min_length=1, max_length=200)
    client_email: Optional[EmailStr] = None
    client_phone: Optional[str] = None
    starts_at: datetime
    ends_at: datetime
    timezone: str = "Asia/Kolkata"
    location_type: str = "google_meet"
    location_value: Optional[str] = None
    meeting_url: Optional[str] = None
    notes: Optional[str] = None
    intake_answers: Optional[dict] = None
    source: str = "manual"


class BookingCreate(BookingBase):
    pass


class BookingUpdate(BaseModel):
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    location_type: Optional[str] = None
    location_value: Optional[str] = None
    meeting_url: Optional[str] = None
    cancellation_reason: Optional[str] = None


class BookingResponse(BookingBase):
    id: int
    status: str
    cancellation_reason: Optional[str] = None
    service_name: Optional[str] = None
    service_color: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ── Booking page ──────────────────────────────────────────────


class BookingPageBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=120, pattern=r"^[a-z0-9-]+$")
    description: Optional[str] = None
    service_ids: Optional[List[int]] = None
    custom_questions: Optional[List[dict]] = None
    theme: Optional[dict] = None
    redirect_url: Optional[str] = None
    status: str = "draft"


class BookingPageCreate(BookingPageBase):
    pass


class BookingPageUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    service_ids: Optional[List[int]] = None
    custom_questions: Optional[List[dict]] = None
    theme: Optional[dict] = None
    redirect_url: Optional[str] = None
    status: Optional[str] = None


class BookingPageResponse(BookingPageBase):
    id: int
    views: int = 0
    bookings_count: int = 0
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ── KPI / dashboard ───────────────────────────────────────────


class AppointmentKpis(BaseModel):
    today_count: int = 0
    week_count: int = 0
    month_count: int = 0
    booked_by_ai: int = 0
    show_rate_pct: float = 0.0
    pending_count: int = 0


# ── Slot lookup ───────────────────────────────────────────────


class SlotResponse(BaseModel):
    starts_at: datetime
    ends_at: datetime
    available: bool = True
