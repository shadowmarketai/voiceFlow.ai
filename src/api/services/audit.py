"""
Audit logging service — W7.1.

Usage:
    from api.services.audit import log_action

    log_action(
        actor_id="user-123",
        actor_role="admin",
        tenant_id="tenant-xyz",
        action="delete",
        resource_type="voice_agent",
        resource_id="agent-42",
        detail="Deleted sales-bot agent",
        request=request,          # optional — extracts IP + UA
    )

All writes are best-effort: audit never breaks the primary flow.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import Request

from api.database import get_session_factory
from api.models.audit_log import AuditEntry

log = logging.getLogger(__name__)


def log_action(
    actor_id: str,
    actor_role: str,
    action: str,
    resource_type: str,
    tenant_id: str | None = None,
    resource_id: str | None = None,
    detail: str | None = None,
    request: Request | None = None,
) -> None:
    """Persist an audit entry. Never raises — swallows DB errors."""
    ip = None
    ua = None
    if request:
        ip = request.client.host if request.client else None
        ua = (request.headers.get("user-agent") or "")[:256]

    try:
        with get_session_factory()() as s:
            s.add(AuditEntry(
                actor_id=str(actor_id),
                actor_role=str(actor_role),
                tenant_id=tenant_id,
                action=action,
                resource_type=resource_type,
                resource_id=str(resource_id) if resource_id else None,
                detail=(str(detail)[:2000]) if detail else None,
                ip_address=ip,
                user_agent=ua,
            ))
            s.commit()
    except Exception as exc:
        log.warning("audit log write failed: %s", exc)


def query_log(
    tenant_id: str | None = None,
    actor_id: str | None = None,
    action: str | None = None,
    resource_type: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Read audit entries (newest first). Restricted to super admins."""
    from sqlalchemy import desc, select

    try:
        with get_session_factory()() as s:
            q = select(AuditEntry).order_by(desc(AuditEntry.ts))
            if tenant_id:
                q = q.where(AuditEntry.tenant_id == tenant_id)
            if actor_id:
                q = q.where(AuditEntry.actor_id == actor_id)
            if action:
                q = q.where(AuditEntry.action == action)
            if resource_type:
                q = q.where(AuditEntry.resource_type == resource_type)
            q = q.offset(offset).limit(min(limit, 500))
            rows = s.execute(q).scalars().all()
            return [
                {
                    "id": r.id,
                    "ts": r.ts.isoformat() + "Z" if r.ts else None,
                    "actor_id": r.actor_id,
                    "actor_role": r.actor_role,
                    "tenant_id": r.tenant_id,
                    "action": r.action,
                    "resource_type": r.resource_type,
                    "resource_id": r.resource_id,
                    "detail": r.detail,
                    "ip_address": r.ip_address,
                }
                for r in rows
            ]
    except Exception as exc:
        log.warning("audit log query failed: %s", exc)
        return []
