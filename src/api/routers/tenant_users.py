"""
Tenant user management — a tenant owner can manage their own team.

Endpoints (all require logged-in user):
    GET    /api/v1/tenant/users            → list members of my tenant
    POST   /api/v1/tenant/users            → invite a new member
    PUT    /api/v1/tenant/users/{user_id}  → update name / active
    DELETE /api/v1/tenant/users/{user_id}  → remove

Access rules:
    - Caller must have a `tenant_id` (tenant user) — direct users are blocked
    - Write operations require `is_tenant_owner = 1`
    - All queries are scoped to the caller's own tenant — you cannot touch
      users in other tenants

Within a tenant there is exactly ONE role ("user"). The only distinction is
the `is_tenant_owner` flag. The owner cannot remove themselves (safety).
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

from api.database import db, USE_POSTGRES
from api.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/tenant", tags=["tenant-users"])

_ph = "%s" if USE_POSTGRES else "?"


# ── helpers ──────────────────────────────────────────────────────────────

def _require_tenant_user(user: dict = Depends(get_current_user)) -> dict:
    """Caller must belong to a tenant."""
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    if user.get("is_super_admin"):
        # Super admin shouldn't use these endpoints — they have /admin/users
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
            "Super admin should use /api/v1/admin/users")
    if not user.get("tenant_id"):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
            "You are not part of any tenant")
    return user


def _require_tenant_owner(user: dict = Depends(_require_tenant_user)) -> dict:
    """Only the tenant owner can modify the team."""
    if not user.get("is_tenant_owner"):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
            "Only the tenant owner can manage users")
    return user


def _serialize(row: dict) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "email": row.get("email"),
        "name": row.get("name"),
        "phone": row.get("phone"),
        "is_active": bool(row.get("is_active")),
        "is_tenant_owner": bool(row.get("is_tenant_owner")),
        "created_at": row.get("created_at"),
    }


# ── endpoints ────────────────────────────────────────────────────────────

@router.get("/users")
async def list_my_tenant_users(user: dict = Depends(_require_tenant_user)) -> list[dict[str, Any]]:
    tenant_id = user["tenant_id"]
    with db() as conn:
        rows = conn.execute(
            f"SELECT id,email,name,phone,is_active,is_tenant_owner,created_at "
            f"FROM users WHERE tenant_id={_ph} "
            f"ORDER BY is_tenant_owner DESC, created_at ASC",
            (tenant_id,),
        ).fetchall()
    return [_serialize(dict(r)) for r in rows]


class CreateUserReq(BaseModel):
    email: EmailStr
    name: str
    password: str
    phone: Optional[str] = None


@router.post("/users", status_code=201)
async def create_tenant_user(
    req: CreateUserReq, user: dict = Depends(_require_tenant_owner),
) -> dict[str, Any]:
    tenant_id = user["tenant_id"]

    # Enforce max_users quota from platform_tenants (if set)
    with db() as conn:
        tenant_row = conn.execute(
            f"SELECT max_users FROM platform_tenants WHERE id={_ph}", (tenant_id,)
        ).fetchone()
        max_users = (dict(tenant_row).get("max_users") if tenant_row else None)
        current_count = conn.execute(
            f"SELECT COUNT(*) FROM users WHERE tenant_id={_ph}", (tenant_id,)
        ).fetchone()[0]
        if max_users and current_count >= max_users:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                f"User quota reached ({max_users}). Contact support to raise the limit.")

        # Email must be unique
        dup = conn.execute(
            f"SELECT id FROM users WHERE email={_ph}", (req.email,)
        ).fetchone()
        if dup:
            raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

        # Hash password via AuthService (bcrypt)
        from api.services.auth_service import AuthService
        hashed = AuthService.hash_password(req.password)
        new_id = f"u-{uuid.uuid4().hex[:10]}"
        conn.execute(f"""
            INSERT INTO users (id,email,name,hashed_password,role,plan,phone,is_active,is_super_admin,tenant_id,is_tenant_owner)
            VALUES ({_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph})
        """, (
            new_id, req.email, req.name, hashed,
            "user", "starter", req.phone, 1, 0, tenant_id, 0,
        ))
        created = conn.execute(
            f"SELECT id,email,name,phone,is_active,is_tenant_owner,created_at "
            f"FROM users WHERE id={_ph}", (new_id,)
        ).fetchone()
    logger.info("Tenant %s added user %s (%s)", tenant_id, new_id, req.email)
    return _serialize(dict(created))


class UpdateUserReq(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None


@router.put("/users/{user_id}")
async def update_tenant_user(
    user_id: str, req: UpdateUserReq, owner: dict = Depends(_require_tenant_owner),
) -> dict[str, Any]:
    tenant_id = owner["tenant_id"]
    with db() as conn:
        target = conn.execute(
            f"SELECT id,is_tenant_owner FROM users WHERE id={_ph} AND tenant_id={_ph}",
            (user_id, tenant_id),
        ).fetchone()
        if not target:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found in your tenant")
        tgt = dict(target)
        if tgt.get("is_tenant_owner") and req.is_active is False:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                "Tenant owner cannot be deactivated")

        updates = []
        params: list[Any] = []
        if req.name is not None:
            updates.append(f"name={_ph}"); params.append(req.name)
        if req.phone is not None:
            updates.append(f"phone={_ph}"); params.append(req.phone)
        if req.is_active is not None:
            updates.append(f"is_active={_ph}"); params.append(1 if req.is_active else 0)
        if not updates:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing to update")

        params.extend([user_id, tenant_id])
        conn.execute(
            f"UPDATE users SET {', '.join(updates)} WHERE id={_ph} AND tenant_id={_ph}",
            tuple(params),
        )
        refreshed = conn.execute(
            f"SELECT id,email,name,phone,is_active,is_tenant_owner,created_at "
            f"FROM users WHERE id={_ph}", (user_id,)
        ).fetchone()
    return _serialize(dict(refreshed))


@router.delete("/users/{user_id}")
async def delete_tenant_user(
    user_id: str, owner: dict = Depends(_require_tenant_owner),
) -> dict[str, Any]:
    tenant_id = owner["tenant_id"]
    if user_id == owner["id"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot remove yourself")
    with db() as conn:
        target = conn.execute(
            f"SELECT id,is_tenant_owner FROM users WHERE id={_ph} AND tenant_id={_ph}",
            (user_id, tenant_id),
        ).fetchone()
        if not target:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found in your tenant")
        if dict(target).get("is_tenant_owner"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                "Tenant owner cannot be removed")
        conn.execute(f"DELETE FROM users WHERE id={_ph} AND tenant_id={_ph}",
                     (user_id, tenant_id))
    return {"success": True, "removed": user_id}


@router.get("/info")
async def tenant_info(user: dict = Depends(_require_tenant_user)) -> dict[str, Any]:
    """Basic info about the caller's tenant: name, branding, counts."""
    tenant_id = user["tenant_id"]
    with db() as conn:
        row = conn.execute(
            f"SELECT * FROM platform_tenants WHERE id={_ph}", (tenant_id,)
        ).fetchone()
        user_count = conn.execute(
            f"SELECT COUNT(*) FROM users WHERE tenant_id={_ph}", (tenant_id,)
        ).fetchone()[0]
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found")
    t = dict(row)
    return {
        "id": t.get("id"),
        "name": t.get("name"),
        "slug": t.get("slug"),
        "app_name": t.get("app_name") or t.get("name"),
        "primary_color": t.get("primary_color"),
        "secondary_color": t.get("secondary_color"),
        "accent_color": t.get("accent_color"),
        "max_users": t.get("max_users"),
        "current_users": user_count,
        "is_tenant_owner": bool(user.get("is_tenant_owner")),
    }
