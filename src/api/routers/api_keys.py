"""
API Key Management Router
=========================
Create, list, revoke API keys with DB persistence.
Keys are shown only once at creation time (hashed in DB).
"""

import hashlib
import logging
import secrets
from datetime import datetime, UTC

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.database import get_db
from api.models.api_key import ApiKey

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/api-keys", tags=["API Keys"])


class CreateKeyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class CreateKeyResponse(BaseModel):
    key_id: str
    name: str
    key: str  # Full key — shown only once
    key_prefix: str
    created_at: str


class KeyResponse(BaseModel):
    key_id: str
    name: str
    key_prefix: str
    is_active: bool
    last_used_at: str | None
    created_at: str


def _get_user_id(current_user: dict) -> str:
    return str(current_user.get("id", ""))


def _get_tenant_id(current_user: dict) -> str:
    return str(current_user.get("tenant_id", current_user.get("id", "")))


def _hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def _optional_auth():
    """Try auth, fall back to anonymous."""
    try:
        from api.permissions import require_permission
        return Depends(require_permission("api_keys", "read"))
    except Exception:
        return None


@router.post("", response_model=CreateKeyResponse)
async def create_key(
    req: CreateKeyRequest,
    db: Session = Depends(get_db),
):
    """Create a new API key. The full key is returned only once."""
    raw_key = f"vf_sk_{secrets.token_hex(24)}"
    key_id = f"key_{secrets.token_hex(8)}"
    key_prefix = raw_key[:12] + "..."

    record = ApiKey(
        key_id=key_id,
        key_hash=_hash_key(raw_key),
        key_prefix=key_prefix,
        name=req.name,
        tenant_id="",
        user_id="",
    )
    db.add(record)
    db.commit()

    logger.info("API key created: %s (%s)", key_id, req.name)

    return CreateKeyResponse(
        key_id=key_id,
        name=req.name,
        key=raw_key,
        key_prefix=key_prefix,
        created_at=record.created_at.isoformat() + "Z" if record.created_at else datetime.now(UTC).isoformat() + "Z",
    )


@router.get("", response_model=list[KeyResponse])
async def list_keys(db: Session = Depends(get_db)):
    """List all API keys (without full key values)."""
    rows = db.execute(
        select(ApiKey).where(ApiKey.is_active.is_(True)).order_by(ApiKey.created_at.desc())
    ).scalars().all()

    return [
        KeyResponse(
            key_id=r.key_id,
            name=r.name,
            key_prefix=r.key_prefix,
            is_active=r.is_active,
            last_used_at=r.last_used_at.isoformat() + "Z" if r.last_used_at else None,
            created_at=r.created_at.isoformat() + "Z" if r.created_at else "",
        )
        for r in rows
    ]


@router.delete("/{key_id}")
async def revoke_key(key_id: str, db: Session = Depends(get_db)):
    """Revoke an API key (soft delete)."""
    row = db.execute(
        select(ApiKey).where(ApiKey.key_id == key_id)
    ).scalar_one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="API key not found")

    row.is_active = False
    db.commit()

    logger.info("API key revoked: %s", key_id)
    return {"message": "API key revoked", "key_id": key_id}
