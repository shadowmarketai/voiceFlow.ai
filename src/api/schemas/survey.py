"""
VoiceFlow Marketing AI - Survey Schemas
========================================
Request/response models for the Surveys endpoints.
Uses Pydantic v2 ConfigDict (KB-014).
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# ── Request Schemas ─────────────────────────────────────────────


class SurveyCreate(BaseModel):
    """Create a new survey."""

    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    questions: list[dict[str, Any]] | None = None
    logic: dict[str, Any] | None = None
    theme: dict[str, Any] | None = None
    logo_url: str | None = Field(default=None, max_length=500)
    thank_you_message: str | None = None
    redirect_url: str | None = Field(default=None, max_length=500)
    is_anonymous: bool = False
    allow_multiple_responses: bool = False
    require_auth: bool = False
    show_progress_bar: bool = True
    randomize_questions: bool = False
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    max_responses: int | None = Field(default=None, ge=1)
    distribution_channels: list[str] | None = None
    tags: list[str] | None = None
    campaign_id: int | None = None

    model_config = ConfigDict(from_attributes=True)


class SurveyUpdate(BaseModel):
    """Update an existing survey."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    questions: list[dict[str, Any]] | None = None
    logic: dict[str, Any] | None = None
    theme: dict[str, Any] | None = None
    logo_url: str | None = Field(default=None, max_length=500)
    thank_you_message: str | None = None
    redirect_url: str | None = Field(default=None, max_length=500)
    is_anonymous: bool | None = None
    allow_multiple_responses: bool | None = None
    require_auth: bool | None = None
    show_progress_bar: bool | None = None
    randomize_questions: bool | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    max_responses: int | None = Field(default=None, ge=1)
    distribution_channels: list[str] | None = None
    tags: list[str] | None = None

    model_config = ConfigDict(from_attributes=True)


class SurveyResponseCreate(BaseModel):
    """Submit a survey response."""

    answers: dict[str, Any] = Field(..., description="Question ID to answer mapping")
    respondent_name: str | None = Field(default=None, max_length=200)
    respondent_email: str | None = Field(default=None, max_length=255)
    respondent_phone: str | None = Field(default=None, max_length=20)
    is_complete: bool = True
    source: str | None = Field(default=None, max_length=50)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    lead_id: int | None = None
    contact_id: int | None = None

    model_config = ConfigDict(from_attributes=True)


# ── Response Schemas ────────────────────────────────────────────


class SurveyResponseDetail(BaseModel):
    """Individual survey response detail."""

    id: int
    answers: dict[str, Any]
    respondent_name: str | None = None
    respondent_email: str | None = None
    respondent_phone: str | None = None
    is_complete: bool = False
    started_at: datetime | None = None
    completed_at: datetime | None = None
    completion_time_seconds: float | None = None
    source: str | None = None
    nps_score: int | None = None
    satisfaction_score: float | None = None
    survey_id: int
    user_id: str | None = None
    lead_id: int | None = None
    contact_id: int | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class SurveyDetail(BaseModel):
    """Survey detail response."""

    id: int
    title: str
    description: str | None = None
    slug: str | None = None
    status: str
    questions: list[dict[str, Any]] | None = None
    logic: dict[str, Any] | None = None
    theme: dict[str, Any] | None = None
    logo_url: str | None = None
    thank_you_message: str | None = None
    redirect_url: str | None = None
    is_anonymous: bool = False
    allow_multiple_responses: bool = False
    require_auth: bool = False
    show_progress_bar: bool = True
    randomize_questions: bool = False
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    max_responses: int | None = None
    total_responses: int = 0
    total_started: int = 0
    avg_completion_time_seconds: float | None = None
    completion_rate: float | None = None
    avg_nps_score: float | None = None
    distribution_channels: list[str] | None = None
    tags: list[str] | None = None
    user_id: str
    campaign_id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class SurveyAnalyticsResponse(BaseModel):
    """Survey analytics and statistics."""

    survey_id: int
    title: str
    total_responses: int = 0
    total_started: int = 0
    completion_rate: float | None = None
    avg_completion_time_seconds: float | None = None
    avg_nps_score: float | None = None
    nps_distribution: dict[str, int] = Field(default_factory=dict)
    answer_distribution: dict[str, Any] = Field(default_factory=dict)
    responses_by_source: dict[str, int] = Field(default_factory=dict)
    responses_over_time: list[dict[str, Any]] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
