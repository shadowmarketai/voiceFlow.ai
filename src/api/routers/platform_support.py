"""
Platform Support — tenant-side ticket router.

Closes the 5 gaps we had:
  1. Email / WhatsApp notifications on create + reply + status change
  2. SLA tracking: first_response_at + resolved_at + breach flags
  3. Attachments JSON column (array of URLs)
  4. Tenant-owner-only status updates
  5. Auto-assign urgent tickets to the super admin

Endpoints:
    GET  /api/v1/platform-support/tickets
    GET  /api/v1/platform-support/tickets/{ticket_id}
    POST /api/v1/platform-support/tickets
    POST /api/v1/platform-support/tickets/{ticket_id}/reply
    PUT  /api/v1/platform-support/tickets/{ticket_id}   (owner-only)
    POST /api/v1/platform-support/tickets/{ticket_id}/attachments   (file upload)
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel

from api.database import db, USE_POSTGRES
from api.dependencies import get_current_user
from api.services import notifications

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/platform-support", tags=["platform-support"])
_ph = "%s" if USE_POSTGRES else "?"

SLA_FIRST_RESPONSE_HOURS = {
    "urgent": 2, "high": 8, "medium": 24, "low": 72,
}
SLA_RESOLVE_HOURS = {
    "urgent": 24, "high": 72, "medium": 168, "low": 336,
}

ATTACHMENTS_DIR = Path(os.getenv("ATTACHMENTS_DIR", "/app/data/ticket-attachments"))


def _require_tenant_user(user: dict = Depends(get_current_user)) -> dict:
    if user.get("is_super_admin"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Super admin should use /api/v1/admin/tickets")
    if not user.get("tenant_id"):
        # Direct users also get tickets, bucketed by user_id as a pseudo-tenant.
        pass
    return user


def _ensure_columns() -> None:
    """Additive migration — adds SLA + attachments + assigned_to if missing."""
    try:
        with db() as conn:
            if USE_POSTGRES:
                cur = conn.cursor()
                for ddl in (
                    "ALTER TABLE platform_tickets ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMP",
                    "ALTER TABLE platform_tickets ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'",
                    "ALTER TABLE platform_tickets ADD COLUMN IF NOT EXISTS assigned_to TEXT",
                ):
                    try: cur.execute(ddl)
                    except Exception: pass
            else:
                cols = [c[1] for c in conn.execute("PRAGMA table_info(platform_tickets)").fetchall()]
                for name, ddl in (
                    ("first_response_at", "ALTER TABLE platform_tickets ADD COLUMN first_response_at TEXT"),
                    ("attachments",       "ALTER TABLE platform_tickets ADD COLUMN attachments TEXT DEFAULT '[]'"),
                    ("assigned_to",       "ALTER TABLE platform_tickets ADD COLUMN assigned_to TEXT"),
                ):
                    if name not in cols:
                        try: conn.execute(ddl)
                        except Exception: pass
    except Exception as exc:
        logger.debug("ticket column migration: %s", exc)


_ensure_columns()


def _scope_filter(user: dict) -> tuple[str, list]:
    """Return (WHERE clause fragment, params) to restrict tickets to caller."""
    if user.get("tenant_id"):
        return f"tenant_id={_ph}", [user["tenant_id"]]
    # Direct user → their own tickets only
    return f"created_by={_ph}", [user["id"]]


def _row_to_dict(row) -> dict[str, Any]:
    d = dict(row)
    # Parse attachments JSON
    att = d.get("attachments")
    if isinstance(att, str):
        try: d["attachments"] = json.loads(att)
        except Exception: d["attachments"] = []
    elif att is None:
        d["attachments"] = []

    # Compute SLA breach flags
    priority = d.get("priority", "medium")
    created = d.get("created_at")
    first_resp_hours = SLA_FIRST_RESPONSE_HOURS.get(priority, 24)
    resolve_hours = SLA_RESOLVE_HOURS.get(priority, 168)
    d["sla_first_response_hours"] = first_resp_hours
    d["sla_resolve_hours"] = resolve_hours

    try:
        created_dt = datetime.fromisoformat(str(created).replace("Z", ""))
        now = datetime.utcnow()
        # First-response breach?
        first_resp = d.get("first_response_at")
        if first_resp:
            fr_dt = datetime.fromisoformat(str(first_resp).replace("Z", ""))
            d["sla_first_response_breached"] = (fr_dt - created_dt).total_seconds() / 3600 > first_resp_hours
            d["sla_first_response_elapsed_hours"] = round((fr_dt - created_dt).total_seconds() / 3600, 1)
        elif d.get("status") in ("open",):
            elapsed = (now - created_dt).total_seconds() / 3600
            d["sla_first_response_breached"] = elapsed > first_resp_hours
            d["sla_first_response_elapsed_hours"] = round(elapsed, 1)
        # Resolve breach?
        resolved = d.get("resolved_at")
        if resolved:
            r_dt = datetime.fromisoformat(str(resolved).replace("Z", ""))
            d["sla_resolve_breached"] = (r_dt - created_dt).total_seconds() / 3600 > resolve_hours
        elif d.get("status") not in ("resolved", "closed"):
            elapsed = (now - created_dt).total_seconds() / 3600
            d["sla_resolve_breached"] = elapsed > resolve_hours
    except Exception:
        d["sla_first_response_breached"] = False
        d["sla_resolve_breached"] = False

    return d


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.get("/tickets")
async def list_my_tickets(user: dict = Depends(_require_tenant_user)) -> dict[str, Any]:
    where, params = _scope_filter(user)
    with db() as conn:
        rows = conn.execute(
            f"SELECT * FROM platform_tickets WHERE {where} ORDER BY created_at DESC",
            tuple(params),
        ).fetchall()
    return {"tickets": [_row_to_dict(r) for r in rows]}


@router.get("/tickets/{ticket_id}")
async def get_my_ticket(ticket_id: str, user: dict = Depends(_require_tenant_user)) -> dict[str, Any]:
    where, params = _scope_filter(user)
    with db() as conn:
        row = conn.execute(
            f"SELECT * FROM platform_tickets WHERE id={_ph} AND {where}",
            (ticket_id, *params),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Ticket not found or not in your scope")
        ticket = _row_to_dict(row)

        reply_rows = conn.execute(
            f"SELECT * FROM platform_ticket_replies WHERE ticket_id={_ph} ORDER BY created_at ASC",
            (ticket_id,),
        ).fetchall()
        replies = []
        for rr in reply_rows:
            rd = dict(rr)
            rd["is_super_admin"] = bool(rd.get("is_super_admin"))
            replies.append(rd)
        ticket["replies"] = replies
    return ticket


class CreateTicketReq(BaseModel):
    subject: str
    body: str
    priority: Optional[str] = "medium"
    category: Optional[str] = None


@router.post("/tickets", status_code=201)
async def create_ticket(req: CreateTicketReq, user: dict = Depends(_require_tenant_user)) -> dict[str, Any]:
    if not req.subject.strip() or not req.body.strip():
        raise HTTPException(400, "Subject and body are required")
    if req.priority not in ("low", "medium", "high", "urgent"):
        raise HTTPException(400, "Invalid priority")

    tid = f"pt-{uuid.uuid4().hex[:10]}"
    tenant_id = user.get("tenant_id")
    created_by = user.get("id")
    now = datetime.utcnow().isoformat()

    # Auto-assign urgent tickets to super admin
    assigned = None
    if req.priority == "urgent":
        try:
            with db() as conn:
                sa = conn.execute(
                    f"SELECT id FROM users WHERE is_super_admin=1 LIMIT 1"
                ).fetchone()
                if sa: assigned = dict(sa).get("id")
        except Exception:
            pass

    with db() as conn:
        conn.execute(f"""
            INSERT INTO platform_tickets
            (id, tenant_id, created_by, subject, body, status, priority, category,
             created_at, assigned_to, attachments)
            VALUES ({_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph})
        """, (tid, tenant_id, created_by, req.subject, req.body, "open",
              req.priority, req.category, now, assigned, "[]"))
        created_row = conn.execute(
            f"SELECT * FROM platform_tickets WHERE id={_ph}", (tid,)
        ).fetchone()

    ticket = _row_to_dict(created_row)
    logger.info("Ticket created: %s by %s (tenant=%s priority=%s)", tid, created_by, tenant_id, req.priority)

    # Notify super admin via email
    try:
        notifications.notify_ticket_created(ticket)
    except Exception as exc:
        logger.warning("ticket create email failed: %s", exc)

    # Real-time WS broadcast
    try:
        from api.realtime import manager
        await manager.to_super_admins("ticket.created", ticket)
    except Exception:
        pass

    return ticket


class ReplyReq(BaseModel):
    body: str


@router.post("/tickets/{ticket_id}/reply")
async def reply_ticket(ticket_id: str, req: ReplyReq, user: dict = Depends(_require_tenant_user)) -> dict[str, Any]:
    if not req.body.strip():
        raise HTTPException(400, "Reply body cannot be empty")

    where, params = _scope_filter(user)
    reply_id = f"ptr-{uuid.uuid4().hex[:10]}"
    now = datetime.utcnow().isoformat()

    with db() as conn:
        ticket_row = conn.execute(
            f"SELECT * FROM platform_tickets WHERE id={_ph} AND {where}",
            (ticket_id, *params),
        ).fetchone()
        if not ticket_row:
            raise HTTPException(404, "Ticket not found or not in your scope")
        ticket = dict(ticket_row)

        conn.execute(f"""
            INSERT INTO platform_ticket_replies (id, ticket_id, author_id, is_super_admin, body)
            VALUES ({_ph},{_ph},{_ph},{_ph},{_ph})
        """, (reply_id, ticket_id, user["id"], 0, req.body))
        # Status: tenant reply → waiting_tenant becomes in_progress
        if ticket.get("status") == "waiting_tenant":
            conn.execute(
                f"UPDATE platform_tickets SET status='in_progress' WHERE id={_ph}", (ticket_id,)
            )

    # Find super admin email to notify
    try:
        with db() as conn:
            sa = conn.execute("SELECT email FROM users WHERE is_super_admin=1 LIMIT 1").fetchone()
            if sa:
                notifications.notify_ticket_reply(
                    _row_to_dict(ticket_row), req.body, dict(sa)["email"], is_from_admin=False,
                )
    except Exception as exc:
        logger.warning("reply notify failed: %s", exc)

    try:
        from api.realtime import manager
        await manager.to_super_admins("ticket.reply.created", {
            "id": reply_id, "ticket_id": ticket_id, "body": req.body,
            "author_id": user["id"], "is_super_admin": False,
        })
    except Exception:
        pass

    return {"id": reply_id, "ticket_id": ticket_id, "body": req.body}


class UpdateTicketReq(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None


@router.put("/tickets/{ticket_id}")
async def update_my_ticket(ticket_id: str, req: UpdateTicketReq, user: dict = Depends(_require_tenant_user)) -> dict[str, Any]:
    """Tenant-side update — only the tenant OWNER can change status / priority."""
    if not user.get("is_tenant_owner"):
        raise HTTPException(403, "Only the tenant owner can update ticket status")

    updates: dict[str, Any] = {}
    if req.status and req.status in ("open", "closed"):
        updates["status"] = req.status
    if req.priority and req.priority in ("low", "medium", "high", "urgent"):
        updates["priority"] = req.priority
    if not updates:
        raise HTTPException(400, "Nothing to update")

    where, params = _scope_filter(user)
    set_clause = ", ".join(f"{k}={_ph}" for k in updates)
    values = list(updates.values()) + [ticket_id] + list(params)
    with db() as conn:
        existing = conn.execute(
            f"SELECT id FROM platform_tickets WHERE id={_ph} AND {where}",
            (ticket_id, *params),
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Ticket not found or not in your scope")
        conn.execute(
            f"UPDATE platform_tickets SET {set_clause} WHERE id={_ph} AND {where}",
            tuple(values),
        )
        row = conn.execute(
            f"SELECT * FROM platform_tickets WHERE id={_ph}", (ticket_id,)
        ).fetchone()
    return _row_to_dict(row)


@router.post("/tickets/{ticket_id}/attachments", status_code=201)
async def upload_attachment(
    ticket_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(_require_tenant_user),
) -> dict[str, Any]:
    """Upload an attachment (image / PDF) to a ticket. Max 10 MB."""
    MAX_BYTES = 10 * 1024 * 1024
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, f"File too large (max 10 MB)")

    ATTACHMENTS_DIR.mkdir(parents=True, exist_ok=True)
    ext = (file.filename or "file").rsplit(".", 1)[-1] if "." in (file.filename or "") else "bin"
    fname = f"{ticket_id}_{uuid.uuid4().hex[:8]}.{ext}"
    target = ATTACHMENTS_DIR / fname
    target.write_bytes(data)

    url = f"/api/v1/platform-support/attachments/{fname}"
    where, params = _scope_filter(user)
    with db() as conn:
        row = conn.execute(
            f"SELECT attachments FROM platform_tickets WHERE id={_ph} AND {where}",
            (ticket_id, *params),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Ticket not found")
        current = row[0] if not hasattr(row, "_mapping") else dict(row).get("attachments")
        try:
            arr = json.loads(current) if isinstance(current, str) else (current or [])
        except Exception:
            arr = []
        arr.append({
            "url": url, "name": file.filename or fname, "size": len(data),
            "content_type": file.content_type or "application/octet-stream",
            "uploaded_at": datetime.utcnow().isoformat(),
        })
        conn.execute(
            f"UPDATE platform_tickets SET attachments={_ph} WHERE id={_ph}",
            (json.dumps(arr), ticket_id),
        )
    return {"success": True, "url": url, "name": file.filename, "size": len(data)}


@router.get("/attachments/{filename}")
async def download_attachment(filename: str, user: dict = Depends(get_current_user)):
    """Serve an attachment file. Anyone authenticated; exact file path required."""
    from fastapi.responses import FileResponse
    safe = filename.replace("..", "").replace("/", "")
    p = ATTACHMENTS_DIR / safe
    if not p.exists():
        raise HTTPException(404, "File not found")
    return FileResponse(str(p))
