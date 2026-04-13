"""
VoiceFlow Marketing AI - Survey Schemas
========================================
Request/response models for the Surveys endpoints.
Uses Pydantic v2 ConfigDict (KB-014).
"""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


# ── Request Schemas ─────────────────────────────────────────────


class SurveyCreate(BaseModel):
    """Create a new survey."""

    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    questions: Optional[list[dict[str, Any]]] = None
    logic: Optional[dict[str, Any]] = None
    theme: Optional[dict[str, Any]] = None
    logo_url: Optional[str] = Field(default=None, max_length=500)
    thank_you_message: Optional[str] = None
    redirect_url: Optional[str] = Field(default=None, max_length=500)
    is_anonymous: bool = False
    allow_multiple_responses: bool = False
    require_auth: bool = False
    show_progress_bar: bool = True
    randomize_questions: bool = False
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    max_responses: Optional[int] = Field(default=None, ge=1)
    distribution_channels: Optional[list[str]] = None
    tags: Optional[list[str]] = None
    campaign_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class SurveyUpdate(BaseModel):
    """Update an existing survey."""

    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    questions: Optional[list[dict[str, Any]]] = None
    logic: Optional[dict[str, Any]] = None
    theme: Optional[dict[str, Any]] = None
    logo_url: Optional[str] = Field(default=None, max_length=500)
    thank_you_message: Optional[str] = None
    redirect_url: Optional[str] = Field(default=None, max_length=500)
    is_anonymous: Optional[bool] = None
    allow_multiple_responses: Optional[bool] = None
    require_auth: Optional[bool] = None
    show_progress_bar: Optional[bool] = None
    randomize_questions: Optional[bool] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    max_responses: Optional[int] = Field(default=None, ge=1)
    distribution_channels: Optional[list[str]] = None
    tags: Optional[list[str]] = None

    model_config = ConfigDict(from_attributes=True)


class SurveyResponseCreate(BaseModel):
    """Submit a survey response."""

    answers: dict[str, Any] = Field(..., description="Question ID to answer mapping")
    respondent_name: Optional[str] = Field(default=None, max_length=200)
    respondent_email: Optional[str] = Field(default=None, max_length=255)
    respondent_phone: Optional[str] = Field(default=None, max_length=20)
    is_complete: bool = True
    source: Optional[str] = Field(default=None, max_length=50)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    lead_id: Optional[int] = None
    contact_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


# ── Response Schemas ────────────────────────────────────────────


class SurveyResponseDetail(BaseModel):
    """Individual survey response detail."""

    id: int
    answers: dict[str, Any]
    respondent_name: Optional[str] = None
    respondent_email: Optional[str] = None
    respondent_phone: Optional[str] = None
    is_complete: bool = False
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    completion_time_seconds: Optional[float] = None
    source: Optional[str] = None
    nps_score: Optional[int] = None
    satisfaction_score: Optional[float] = None
    survey_id: int
    user_id: Optional[str] = None
    lead_id: Optional[int] = None
    contact_id: Optional[int] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class SurveyDetail(BaseModel):
    """Survey detail response."""

    id: int
    title: str
    description: Optional[str] = None
    slug: Optional[str] = None
    status: str
    questions: Optional[list[dict[str, Any]]] = None
    logic: Optional[dict[str, Any]] = None
    theme: Optional[dict[str, Any]] = None
    logo_url: Optional[str] = None
    thank_you_message: Optional[str] = None
    redirect_url: Optional[str] = None
    is_anonymous: bool = False
    allow_multiple_responses: bool = False
    require_auth: bool = False
    show_progress_bar: bool = True
    randomize_questions: bool = False
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    max_responses: Optional[int] = None
    total_responses: int = 0
    total_started: int = 0
    avg_completion_time_seconds: Optional[float] = None
    completion_rate: Optional[float] = None
    avg_nps_score: Optional[float] = None
    distribution_channels: Optional[list[str]] = None
    tags: Optional[list[str]] = None
    user_id: str
    campaign_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class SurveyAnalyticsResponse(BaseModel):
    """Survey analytics and statistics."""

    survey_id: int
    title: str
    total_responses: int = 0
    total_started: int = 0
    completion_rate: Optional[float] = None
    avg_completion_time_seconds: Optional[float] = None
    avg_nps_score: Optional[float] = None
    nps_distribution: dict[str, int] = Field(default_factory=dict)
    answer_distribution: dict[str, Any] = Field(default_factory=dict)
    responses_by_source: dict[str, int] = Field(default_factory=dict)
    responses_over_time: list[dict[str, Any]] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
