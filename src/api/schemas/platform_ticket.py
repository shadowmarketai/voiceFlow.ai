"""
VoiceFlow Marketing AI - Platform Ticket Schemas
==================================================
Pydantic schemas for tenant→super-admin support tickets.

These tickets are distinct from helpdesk tickets (which are for a tenant's
own customers). Platform tickets are raised by tenant admins to the
platform team (super admin) for billing/bug/feature/access issues.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# ── Categories / status / priority enums ────────────────────────────

PlatformTicketCategory = Literal["billing", "bug", "feature_request", "access", "other"]
PlatformTicketStatus = Literal["open", "in_progress", "waiting_tenant", "resolved", "closed"]
PlatformTicketPriority = Literal["low", "medium", "high", "urgent"]


# ── Tenant-side: raise a ticket ─────────────────────────────────────


class PlatformTicketCreate(BaseModel):
    """Tenant admin raises a new support ticket to the platform team."""
    subject: str = Field(..., min_length=3, max_length=200)
    body: str = Field(..., min_length=5)
    category: PlatformTicketCategory = "other"
    priority: PlatformTicketPriority = "medium"


# ── Super-admin side: update / resolve ──────────────────────────────


class PlatformTicketUpdate(BaseModel):
    """Super admin updates ticket status, priority, or assignment."""
    status: PlatformTicketStatus | None = None
    priority: PlatformTicketPriority | None = None
    assigned_to: str | None = None  # super admin user id


# ── Replies (both sides) ────────────────────────────────────────────


class PlatformTicketReplyCreate(BaseModel):
    """Add a reply to a ticket. The router decides is_super_admin from auth."""
    body: str = Field(..., min_length=1)


class PlatformTicketReplyOut(BaseModel):
    id: str
    ticket_id: str
    author_id: str
    author_name: str | None = None
    author_email: str | None = None
    is_super_admin: bool = False
    body: str
    created_at: str | None = None

    model_config = ConfigDict(from_attributes=True)


# ── Ticket output ───────────────────────────────────────────────────


class PlatformTicketOut(BaseModel):
    id: str
    tenant_id: str
    tenant_name: str | None = None
    raised_by: str
    raised_by_name: str | None = None
    raised_by_email: str | None = None
    subject: str
    body: str
    category: str
    priority: str
    status: str
    assigned_to: str | None = None
    assigned_to_name: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    resolved_at: str | None = None
    reply_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class PlatformTicketDetailOut(PlatformTicketOut):
    """Ticket with full reply thread."""
    replies: list[PlatformTicketReplyOut] = []


class PlatformTicketListOut(BaseModel):
    tickets: list[PlatformTicketOut]
    total: int
    counts_by_status: dict[str, int] = {}
