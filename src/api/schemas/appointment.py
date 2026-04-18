"""
VoiceFlow Marketing AI - Appointment Schemas (Pydantic v2)
===========================================================
"""

from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, EmailStr, Field

# ── Service ───────────────────────────────────────────────────


class ServiceBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    duration_min: int = Field(30, ge=5, le=480)
    buffer_before_min: int = Field(0, ge=0, le=120)
    buffer_after_min: int = Field(0, ge=0, le=120)
    price_cents: int = Field(0, ge=0)
    currency: str = Field("INR", min_length=3, max_length=3)
    color: str = Field("#6366f1", pattern=r"^#[0-9a-fA-F]{6,8}$")
    location_type: str = Field("google_meet")
    location_value: str | None = None
    min_notice_min: int = Field(60, ge=0)
    max_advance_days: int = Field(60, ge=1, le=365)
    max_per_day: int | None = None
    intake_form: list[dict] | None = None
    is_active: bool = True


class ServiceCreate(ServiceBase):
    pass


class ServiceUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    duration_min: int | None = None
    buffer_before_min: int | None = None
    buffer_after_min: int | None = None
    price_cents: int | None = None
    currency: str | None = None
    color: str | None = None
    location_type: str | None = None
    location_value: str | None = None
    min_notice_min: int | None = None
    max_advance_days: int | None = None
    max_per_day: int | None = None
    intake_form: list[dict] | None = None
    is_active: bool | None = None


class ServiceResponse(ServiceBase):
    id: int
    slug: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

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
    start_time: time | None = None
    end_time: time | None = None
    reason: str | None = None


class AvailabilityOverrideResponse(AvailabilityOverrideCreate):
    id: int

    model_config = ConfigDict(from_attributes=True)


# ── Booking ───────────────────────────────────────────────────


class BookingBase(BaseModel):
    service_id: int | None = None
    client_name: str = Field(..., min_length=1, max_length=200)
    client_email: EmailStr | None = None
    client_phone: str | None = None
    starts_at: datetime
    ends_at: datetime
    timezone: str = "Asia/Kolkata"
    location_type: str = "google_meet"
    location_value: str | None = None
    meeting_url: str | None = None
    notes: str | None = None
    intake_answers: dict | None = None
    source: str = "manual"


class BookingCreate(BookingBase):
    pass


class BookingUpdate(BaseModel):
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    status: str | None = None
    notes: str | None = None
    location_type: str | None = None
    location_value: str | None = None
    meeting_url: str | None = None
    cancellation_reason: str | None = None


class BookingResponse(BookingBase):
    id: int
    status: str
    cancellation_reason: str | None = None
    service_name: str | None = None
    service_color: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


# ── Booking page ──────────────────────────────────────────────


class BookingPageBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=120, pattern=r"^[a-z0-9-]+$")
    description: str | None = None
    service_ids: list[int] | None = None
    custom_questions: list[dict] | None = None
    theme: dict | None = None
    redirect_url: str | None = None
    status: str = "draft"


class BookingPageCreate(BookingPageBase):
    pass


class BookingPageUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    service_ids: list[int] | None = None
    custom_questions: list[dict] | None = None
    theme: dict | None = None
    redirect_url: str | None = None
    status: str | None = None


class BookingPageResponse(BookingPageBase):
    id: int
    views: int = 0
    bookings_count: int = 0
    created_at: datetime | None = None

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
