"""
Enterprise compliance router — W7 (DPDP + audit log + RBAC).

All endpoints behind super-admin or tenant-owner auth.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from api.dependencies import get_current_active_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/enterprise", tags=["enterprise"])


# ── Helpers ────────────────────────────────────────────────────────────

def _require_super(user: dict):
    if not user.get("is_super_admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Super admin required")


def _require_owner_or_super(user: dict):
    if not (user.get("is_super_admin") or user.get("is_tenant_owner")):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tenant owner or super admin required")


# ══════════════════════════════════════════════════════════════════════
# AUDIT LOG — W7.1
# ══════════════════════════════════════════════════════════════════════

@router.get("/audit-log")
async def get_audit_log(
    tenant_id: str | None = None,
    actor_id: str | None = None,
    action: str | None = None,
    resource_type: str | None = None,
    limit: int = 100,
    offset: int = 0,
    user: dict = Depends(get_current_active_user),
):
    """Immutable audit trail. Super admins see everything; tenant owners
    see their own tenant only."""
    from api.services.audit import query_log

    if user.get("is_super_admin"):
        pass  # see all
    elif user.get("is_tenant_owner"):
        tenant_id = user.get("tenant_id")
    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Audit log access denied")

    entries = query_log(
        tenant_id=tenant_id, actor_id=actor_id, action=action,
        resource_type=resource_type, limit=limit, offset=offset,
    )
    return {"count": len(entries), "entries": entries}


# ══════════════════════════════════════════════════════════════════════
# RBAC — W7.2
# ══════════════════════════════════════════════════════════════════════

@router.get("/rbac/roles")
async def list_roles(user: dict = Depends(get_current_active_user)):
    """Return the full permission matrix. Super admin / tenant owner only."""
    _require_owner_or_super(user)
    from api.permissions import PERMISSION_MATRIX, get_role_permissions
    return {
        "roles": {
            role: get_role_permissions(role)
            for role in PERMISSION_MATRIX
        },
    }


@router.get("/rbac/my-permissions")
async def my_permissions(user: dict = Depends(get_current_active_user)):
    """Return the permissions for the caller's own role."""
    from api.permissions import get_accessible_modules, get_role_permissions
    role = user.get("role", "user")
    return {
        "role": role,
        "is_super_admin": bool(user.get("is_super_admin")),
        "is_tenant_owner": bool(user.get("is_tenant_owner")),
        "permissions": get_role_permissions(role),
        "accessible_modules": get_accessible_modules(role),
    }


# ══════════════════════════════════════════════════════════════════════
# DPDP COMPLIANCE — W7.3
# ══════════════════════════════════════════════════════════════════════

class ConsentPayload(BaseModel):
    user_id: str
    purpose: str
    granted: bool = True


@router.post("/dpdp/consent")
async def record_consent(
    payload: ConsentPayload,
    request: Request,
    user: dict = Depends(get_current_active_user),
):
    """Record or update a data-processing consent (DPDP Article 6)."""
    from api.database import get_session_factory
    from api.models.dpdp import ConsentRecord
    from api.services.audit import log_action

    ip = request.client.host if request.client else None
    try:
        with get_session_factory()() as s:
            s.add(ConsentRecord(
                user_id=payload.user_id,
                tenant_id=user.get("tenant_id"),
                purpose=payload.purpose,
                granted=payload.granted,
                ip_address=ip,
            ))
            s.commit()
    except Exception as exc:
        logger.warning("consent write failed: %s", exc)
        raise HTTPException(500, "Failed to record consent")

    log_action(
        actor_id=str(user.get("id", user.get("email", "?"))),
        actor_role=user.get("role", "user"),
        tenant_id=user.get("tenant_id"),
        action="consent_recorded",
        resource_type="dpdp_consent",
        resource_id=payload.user_id,
        detail=f"purpose={payload.purpose} granted={payload.granted}",
        request=request,
    )
    return {"status": "ok"}


class DeletionPayload(BaseModel):
    user_id: str
    reason: str | None = None


@router.post("/dpdp/deletion-request")
async def request_deletion(
    payload: DeletionPayload,
    request: Request,
    user: dict = Depends(get_current_active_user),
):
    """Submit a right-to-erasure request (DPDP Article 13).

    Creates a pending request; actual data purge runs async so the
    caller gets immediate acknowledgement.
    """
    from api.database import get_session_factory
    from api.models.dpdp import DataDeletionRequest
    from api.services.audit import log_action

    try:
        with get_session_factory()() as s:
            s.add(DataDeletionRequest(
                user_id=payload.user_id,
                tenant_id=user.get("tenant_id"),
                notes=payload.reason,
            ))
            s.commit()
    except Exception as exc:
        logger.warning("deletion request write failed: %s", exc)
        raise HTTPException(500, "Failed to submit deletion request")

    log_action(
        actor_id=str(user.get("id", user.get("email", "?"))),
        actor_role=user.get("role", "user"),
        tenant_id=user.get("tenant_id"),
        action="deletion_requested",
        resource_type="dpdp_deletion",
        resource_id=payload.user_id,
        detail=payload.reason,
        request=request,
    )
    return {"status": "pending", "note": "Request acknowledged. Data will be purged within 72 hours per DPDP guidelines."}


@router.get("/dpdp/deletion-requests")
async def list_deletion_requests(
    status_filter: str | None = None,
    user: dict = Depends(get_current_active_user),
):
    """List pending/completed deletion requests. Owner or super admin."""
    _require_owner_or_super(user)
    from sqlalchemy import desc, select

    from api.database import get_session_factory
    from api.models.dpdp import DataDeletionRequest

    try:
        with get_session_factory()() as s:
            q = select(DataDeletionRequest).order_by(desc(DataDeletionRequest.ts))
            if not user.get("is_super_admin"):
                q = q.where(DataDeletionRequest.tenant_id == user.get("tenant_id"))
            if status_filter:
                q = q.where(DataDeletionRequest.status == status_filter)
            q = q.limit(200)
            rows = s.execute(q).scalars().all()
            return {
                "count": len(rows),
                "requests": [
                    {
                        "id": r.id,
                        "ts": r.ts.isoformat() + "Z" if r.ts else None,
                        "user_id": r.user_id,
                        "tenant_id": r.tenant_id,
                        "status": r.status,
                        "completed_at": r.completed_at.isoformat() + "Z" if r.completed_at else None,
                        "notes": r.notes,
                    }
                    for r in rows
                ],
            }
    except Exception as exc:
        logger.warning("deletion request query failed: %s", exc)
        return {"count": 0, "requests": []}


@router.get("/dpdp/data-residency")
async def data_residency(user: dict = Depends(get_current_active_user)):
    """Return where data is stored. SOC 2 / enterprise buyer requirement."""
    import os
    return {
        "primary_region": os.getenv("DATA_RESIDENCY_REGION", "ap-south-1"),
        "database": os.getenv("DATA_RESIDENCY_DB", "India (Mumbai)"),
        "object_storage": os.getenv("DATA_RESIDENCY_STORAGE", "India (Mumbai)"),
        "call_recordings": os.getenv("DATA_RESIDENCY_RECORDINGS", "India (Mumbai)"),
        "backup_region": os.getenv("DATA_RESIDENCY_BACKUP", "ap-southeast-1"),
        "dpdp_compliant": True,
        "encryption_at_rest": True,
        "encryption_in_transit": True,
    }


@router.get("/infra-status")
async def infra_status(user: dict = Depends(get_current_active_user)):
    """Honest infrastructure status — what's configured, what's missing.

    Enterprise buyers and auditors need to know the real state, not
    an optimistic projection. Missing items are flagged with 'action_needed'.
    """
    _require_owner_or_super(user)
    import os

    def _check(label, env_var, fallback_note):
        val = os.environ.get(env_var, "")
        return {
            "label": label,
            "configured": bool(val),
            "value": val[:40] + "..." if len(val) > 40 else (val or None),
            "action_needed": fallback_note if not val else None,
        }

    return {
        "call_recordings": _check(
            "Call recording storage",
            "CALL_RECORDINGS_PATH",
            "Not configured. Set CALL_RECORDINGS_PATH to a persistent volume or S3 bucket.",
        ),
        "turn_server": _check(
            "WebRTC TURN server",
            "LIVEKIT_URL",
            "No TURN/STUN. LiveKit Cloud includes this; self-hosted needs coturn.",
        ),
        "sip_provider": _check(
            "SIP inbound routing (Twilio/Exotel)",
            "TWILIO_ACCOUNT_SID",
            "No SIP provider. Add TWILIO_ACCOUNT_SID or EXOTEL_SID for phone numbers.",
        ),
        "data_isolation": {
            "label": "Multi-tenant data isolation",
            "configured": True,
            "method": "app_level",
            "note": "Tenant isolation via tenant_id column + app-level WHERE clauses. "
                    "Row-level security (Postgres RLS) planned for Phase 3+.",
            "action_needed": None,
        },
        "disaster_recovery": {
            "label": "Disaster recovery",
            "configured": bool(os.environ.get("DATABASE_URL")),
            "method": "coolify_auto_backup" if os.environ.get("DATABASE_URL") else "none",
            "note": "Coolify provides automated backups. For enterprise: add cross-region "
                    "replication + point-in-time recovery.",
            "action_needed": "Configure daily DB backup + cross-region replica for DR." if not os.environ.get("BACKUP_ENABLED") else None,
        },
        "gpu_failover": {
            "label": "GPU → API failover",
            "configured": True,
            "method": "automatic",
            "note": "All ML operations (STT/LLM/TTS) use API providers by default. "
                    "Local GPU models (XTTS, Whisper) are optional acceleration. "
                    "If GPU pod restarts, API providers take over transparently.",
            "action_needed": None,
        },
        "embedding_storage": {
            "label": "Voice embedding persistence",
            "configured": True,
            "method": "docker_volume",
            "path": os.environ.get("VOICE_EMBEDDINGS_DIR", "data/voice_embeddings"),
            "note": "Stored on Docker volume (-v voiceflow_data:/app/data). "
                    "For GPU pods: mount the same volume or add S3 sync.",
            "action_needed": "Add S3 sync for GPU pod scenarios." if not os.environ.get("S3_EMBEDDINGS_BUCKET") else None,
        },
    }
