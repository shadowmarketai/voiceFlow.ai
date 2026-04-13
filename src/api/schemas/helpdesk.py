"""
VoiceFlow Marketing AI - Helpdesk Schemas
==========================================
Request/response models for the Help Desk ticketing endpoints.
Uses Pydantic v2 ConfigDict (KB-014).
"""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


# ── Request Schemas ─────────────────────────────────────────────


class TicketCreate(BaseModel):
    """Create a new support ticket."""

    subject: str = Field(..., min_length=1, max_length=300)
    description: Optional[str] = None
    priority: str = Field(default="medium", pattern="^(low|medium|high|urgent|critical)$")
    category: Optional[str] = Field(
        default=None,
        pattern="^(billing|technical|sales|general|feature_request|bug_report|voice_ai|crm|integration|other)$",
    )
    channel: Optional[str] = Field(default=None, max_length=50)
    customer_name: Optional[str] = Field(default=None, max_length=200)
    customer_email: Optional[str] = Field(default=None, max_length=255)
    customer_phone: Optional[str] = Field(default=None, max_length=20)
    assigned_to: Optional[str] = None
    lead_id: Optional[int] = None
    contact_id: Optional[int] = None
    tags: Optional[list[str]] = None
    custom_fields: Optional[dict[str, Any]] = None
    attachments: Optional[list[dict[str, str]]] = None

    model_config = ConfigDict(from_attributes=True)


class TicketUpdate(BaseModel):
    """Update an existing ticket."""

    subject: Optional[str] = Field(default=None, min_length=1, max_length=300)
    description: Optional[str] = None
    status: Optional[str] = Field(
        default=None,
        pattern="^(open|in_progress|waiting_on_customer|waiting_on_third_party|resolved|closed|reopened)$",
    )
    priority: Optional[str] = Field(
        default=None,
        pattern="^(low|medium|high|urgent|critical)$",
    )
    category: Optional[str] = Field(
        default=None,
        pattern="^(billing|technical|sales|general|feature_request|bug_report|voice_ai|crm|integration|other)$",
    )
    assigned_to: Optional[str] = None
    tags: Optional[list[str]] = None
    custom_fields: Optional[dict[str, Any]] = None
    internal_notes: Optional[str] = None
    resolution_notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class TicketReplyCreate(BaseModel):
    """Add a reply to a ticket."""

    body: str = Field(..., min_length=1)
    is_internal: bool = False
    sender_type: str = Field(default="agent", pattern="^(agent|customer|system|ai)$")
    sender_name: Optional[str] = Field(default=None, max_length=200)
    sender_email: Optional[str] = Field(default=None, max_length=255)
    attachments: Optional[list[dict[str, str]]] = None

    model_config = ConfigDict(from_attributes=True)


# ── Response Schemas ────────────────────────────────────────────


class TicketReplyResponse(BaseModel):
    """Ticket reply response."""

    id: int
    body: str
    is_internal: bool = False
    sender_type: str
    sender_name: Optional[str] = None
    sender_email: Optional[str] = None
    attachments: Optional[list[dict[str, str]]] = None
    is_ai_generated: bool = False
    ai_confidence: Optional[float] = None
    ticket_id: int
    user_id: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class TicketResponse(BaseModel):
    """Ticket detail response."""

    id: int
    ticket_number: str
    subject: str
    description: Optional[str] = None
    status: str
    priority: str
    category: Optional[str] = None
    channel: Optional[str] = None
    source_reference: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    sla_due_at: Optional[datetime] = None
    first_response_at: Optional[datetime] = None
    first_response_sla_met: Optional[bool] = None
    resolution_sla_met: Optional[bool] = None
    resolved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    resolution_notes: Optional[str] = None
    satisfaction_rating: Optional[int] = None
    detected_sentiment: Optional[float] = None
    detected_emotion: Optional[str] = None
    auto_categorized: bool = False
    tags: Optional[list[str]] = None
    custom_fields: Optional[dict[str, Any]] = None
    internal_notes: Optional[str] = None
    attachments: Optional[list[dict[str, str]]] = None
    lead_id: Optional[int] = None
    contact_id: Optional[int] = None
    assigned_to: Optional[str] = None
    user_id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    replies: Optional[list[TicketReplyResponse]] = None

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
    avg_resolution_time_hours: Optional[float] = None
    tickets_by_priority: dict[str, int] = Field(default_factory=dict)
    tickets_by_category: dict[str, int] = Field(default_factory=dict)
    sla_met_percentage: Optional[float] = None
    avg_satisfaction_rating: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)
