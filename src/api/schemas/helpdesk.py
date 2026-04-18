"""
VoiceFlow Marketing AI - Helpdesk Schemas
==========================================
Request/response models for the Help Desk ticketing endpoints.
Uses Pydantic v2 ConfigDict (KB-014).
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# ── Request Schemas ─────────────────────────────────────────────


class TicketCreate(BaseModel):
    """Create a new support ticket."""

    subject: str = Field(..., min_length=1, max_length=300)
    description: str | None = None
    priority: str = Field(default="medium", pattern="^(low|medium|high|urgent|critical)$")
    category: str | None = Field(
        default=None,
        pattern="^(billing|technical|sales|general|feature_request|bug_report|voice_ai|crm|integration|other)$",
    )
    channel: str | None = Field(default=None, max_length=50)
    customer_name: str | None = Field(default=None, max_length=200)
    customer_email: str | None = Field(default=None, max_length=255)
    customer_phone: str | None = Field(default=None, max_length=20)
    assigned_to: str | None = None
    lead_id: int | None = None
    contact_id: int | None = None
    tags: list[str] | None = None
    custom_fields: dict[str, Any] | None = None
    attachments: list[dict[str, str]] | None = None

    model_config = ConfigDict(from_attributes=True)


class TicketUpdate(BaseModel):
    """Update an existing ticket."""

    subject: str | None = Field(default=None, min_length=1, max_length=300)
    description: str | None = None
    status: str | None = Field(
        default=None,
        pattern="^(open|in_progress|waiting_on_customer|waiting_on_third_party|resolved|closed|reopened)$",
    )
    priority: str | None = Field(
        default=None,
        pattern="^(low|medium|high|urgent|critical)$",
    )
    category: str | None = Field(
        default=None,
        pattern="^(billing|technical|sales|general|feature_request|bug_report|voice_ai|crm|integration|other)$",
    )
    assigned_to: str | None = None
    tags: list[str] | None = None
    custom_fields: dict[str, Any] | None = None
    internal_notes: str | None = None
    resolution_notes: str | None = None

    model_config = ConfigDict(from_attributes=True)


class TicketReplyCreate(BaseModel):
    """Add a reply to a ticket."""

    body: str = Field(..., min_length=1)
    is_internal: bool = False
    sender_type: str = Field(default="agent", pattern="^(agent|customer|system|ai)$")
    sender_name: str | None = Field(default=None, max_length=200)
    sender_email: str | None = Field(default=None, max_length=255)
    attachments: list[dict[str, str]] | None = None

    model_config = ConfigDict(from_attributes=True)


# ── Response Schemas ────────────────────────────────────────────


class TicketReplyResponse(BaseModel):
    """Ticket reply response."""

    id: int
    body: str
    is_internal: bool = False
    sender_type: str
    sender_name: str | None = None
    sender_email: str | None = None
    attachments: list[dict[str, str]] | None = None
    is_ai_generated: bool = False
    ai_confidence: float | None = None
    ticket_id: int
    user_id: str | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class TicketResponse(BaseModel):
    """Ticket detail response."""

    id: int
    ticket_number: str
    subject: str
    description: str | None = None
    status: str
    priority: str
    category: str | None = None
    channel: str | None = None
    source_reference: str | None = None
    customer_name: str | None = None
    customer_email: str | None = None
    customer_phone: str | None = None
    sla_due_at: datetime | None = None
    first_response_at: datetime | None = None
    first_response_sla_met: bool | None = None
    resolution_sla_met: bool | None = None
    resolved_at: datetime | None = None
    closed_at: datetime | None = None
    resolution_notes: str | None = None
    satisfaction_rating: int | None = None
    detected_sentiment: float | None = None
    detected_emotion: str | None = None
    auto_categorized: bool = False
    tags: list[str] | None = None
    custom_fields: dict[str, Any] | None = None
    internal_notes: str | None = None
    attachments: list[dict[str, str]] | None = None
    lead_id: int | None = None
    contact_id: int | None = None
    assigned_to: str | None = None
    user_id: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
    replies: list[TicketReplyResponse] | None = None

    model_config = ConfigDict(from_attributes=True)


class TicketDashboardResponse(BaseModel):
    """Ticket dashboard statistics."""

    total_tickets: int = 0
    open_tickets: int = 0
    in_progress_tickets: int = 0
    waiting_tickets: int = 0
    resolved_tickets: int = 0
    closed_tickets: int = 0
    reopened_tickets: int = 0
    avg_resolution_time_hours: float | None = None
    tickets_by_priority: dict[str, int] = Field(default_factory=dict)
    tickets_by_category: dict[str, int] = Field(default_factory=dict)
    sla_met_percentage: float | None = None
    avg_satisfaction_rating: float | None = None

    model_config = ConfigDict(from_attributes=True)
