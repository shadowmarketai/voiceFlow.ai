"""
VoiceFlow Marketing AI - User Management Router
=================================================
Admin endpoints for managing users, roles, and invitations.
All endpoints require admin role via require_permission("userManagement", ...).
"""

import logging
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.database import db
from api.permissions import require_permission
from api.schemas.common import MessageResponse
from api.schemas.user_management import (
    UserDetailResponse,
    UserInviteRequest,
    UserListItem,
    UserListResponse,
    UserRoleUpdate,
    UserStatusUpdate,
    UserUpdateRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/users", tags=["User Management"])


# ── GET /users — List users ─────────────────────────────────────


@router.get("", response_model=UserListResponse, summary="List all users")
async def list_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    role: Optional[str] = Query(None, pattern="^(admin|manager|agent|user|viewer)$"),
    status_filter: Optional[str] = Query(None, alias="status", pattern="^(active|inactive)$"),
    search: Optional[str] = Query(None, max_length=200),
    current_user: dict = Depends(require_permission("userManagement", "read")),
) -> UserListResponse:
    """List users with optional filtering by role, status, and search."""
    try:
        with db() as conn:
            # Build query
            conditions = []
            params = []

            if role:
                conditions.append("role = ?")
                params.append(role)

            if status_filter == "active":
                conditions.append("is_active = 1")
            elif status_filter == "inactive":
                conditions.append("is_active = 0")

            if search:
                conditions.append("(email LIKE ? OR COALESCE(full_name, name, '') LIKE ?)")
                params.extend([f"%{search}%", f"%{search}%"])

            where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

            # Count total
            count_row = conn.execute(
                f"SELECT COUNT(*) as cnt FROM users {where}", params
            ).fetchone()
            total = count_row["cnt"] if count_row else 0

            # Fetch page
            offset = (page - 1) * per_page
            rows = conn.execute(
                f"SELECT id, email, COALESCE(full_name, name, '') as full_name, role, is_active, "
                f"company, plan, created_at, last_login_at, oauth_provider, avatar_url "
                f"FROM users {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
                params + [per_page, offset],
            ).fetchall()

            users = [
                UserListItem(
                    id=str(r["id"]),
                    email=r["email"],
                    full_name=r["full_name"] or "",
                    role=r.get("role", "user"),
                    is_active=bool(r.get("is_active", 1)),
                    company=r.get("company"),
                    plan=r.get("plan", "starter"),
                    created_at=str(r["created_at"]) if r.get("created_at") else None,
                    last_login_at=str(r["last_login_at"]) if r.get("last_login_at") else None,
                    oauth_provider=r.get("oauth_provider"),
                    avatar_url=r.get("avatar_url"),
                )
                for r in rows
            ]

            return UserListResponse(users=users, total=total, page=page, per_page=per_page)

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to list users: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to list users")


# ── GET /users/{id} — Get user detail ───────────────────────────


@router.get("/{user_id}", response_model=UserDetailResponse, summary="Get user details")
async def get_user(
    user_id: str,
    current_user: dict = Depends(require_permission("userManagement", "read")),
) -> UserDetailResponse:
    """Get detailed information about a specific user."""
    try:
        with db() as conn:
            row = conn.execute(
                "SELECT id, email, COALESCE(full_name, name, '') as full_name, role, is_active, "
                "is_verified, company, phone, plan, created_at, last_login_at, "
                "oauth_provider, avatar_url "
                "FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        return UserDetailResponse(
            id=str(row["id"]),
            email=row["email"],
            full_name=row["full_name"] or "",
            role=row.get("role", "user"),
            is_active=bool(row.get("is_active", 1)),
            is_verified=bool(row.get("is_verified", 0)),
            company=row.get("company"),
            phone=row.get("phone"),
            plan=row.get("plan", "starter"),
            created_at=str(row["created_at"]) if row.get("created_at") else None,
            last_login_at=str(row["last_login_at"]) if row.get("last_login_at") else None,
            oauth_provider=row.get("oauth_provider"),
            avatar_url=row.get("avatar_url"),
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to get user %s: %s", user_id, exc)
        raise HTTPException(status_code=500, detail="Failed to get user")


# ── PUT /users/{id} — Update user details ─────────────────────


@router.put("/{user_id}", response_model=UserDetailResponse, summary="Update user details")
async def update_user(
    user_id: str,
    body: UserUpdateRequest,
    current_user: dict = Depends(require_permission("userManagement", "update")),
) -> UserDetailResponse:
    """Update a user's profile details (name, email, phone, company, role, plan, status)."""
    try:
        updates = body.model_dump(exclude_none=True)
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        with db() as conn:
            row = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="User not found")

            # Check email uniqueness if changing email
            if "email" in updates:
                existing = conn.execute(
                    "SELECT id FROM users WHERE email = ? AND id != ?",
                    (updates["email"], user_id),
                ).fetchone()
                if existing:
                    raise HTTPException(status_code=409, detail="Email already in use")

            # Build SET clause
            set_parts = []
            params = []
            for col, val in updates.items():
                if col == "full_name":
                    # Update both name and full_name for compatibility
                    set_parts.append("name = ?")
                    params.append(val)
                    set_parts.append("full_name = ?")
                    params.append(val)
                elif col == "is_active":
                    set_parts.append("is_active = ?")
                    params.append(1 if val else 0)
                else:
                    set_parts.append(f"{col} = ?")
                    params.append(val)

            params.append(user_id)
            conn.execute(
                f"UPDATE users SET {', '.join(set_parts)} WHERE id = ?",
                params,
            )

            # Re-fetch updated user
            updated = conn.execute(
                "SELECT id, email, COALESCE(full_name, name, '') as full_name, role, is_active, "
                "is_verified, company, phone, plan, created_at, last_login_at, "
                "oauth_provider, avatar_url "
                "FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()

        logger.info("User %s updated by %s: %s", user_id, current_user.get("email"), list(updates.keys()))
        return UserDetailResponse(
            id=str(updated["id"]),
            email=updated["email"],
            full_name=updated["full_name"] or "",
            role=updated.get("role", "user"),
            is_active=bool(updated.get("is_active", 1)),
            is_verified=bool(updated.get("is_verified", 0)),
            company=updated.get("company"),
            phone=updated.get("phone"),
            plan=updated.get("plan", "starter"),
            created_at=str(updated["created_at"]) if updated.get("created_at") else None,
            last_login_at=str(updated["last_login_at"]) if updated.get("last_login_at") else None,
            oauth_provider=updated.get("oauth_provider"),
            avatar_url=updated.get("avatar_url"),
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to update user %s: %s", user_id, exc)
        raise HTTPException(status_code=500, detail="Failed to update user")


# ── PUT /users/{id}/role — Change role ──────────────────────────


@router.put("/{user_id}/role", response_model=MessageResponse, summary="Change user role")
async def update_user_role(
    user_id: str,
    body: UserRoleUpdate,
    current_user: dict = Depends(require_permission("userManagement", "update")),
) -> MessageResponse:
    """Change a user's role. Cannot change own role."""
    current_id = str(current_user.get("id", ""))
    if current_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    try:
        with db() as conn:
            row = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="User not found")

            conn.execute(
                "UPDATE users SET role = ? WHERE id = ?",
                (body.role, user_id),
            )

        logger.info("User %s role changed to %s by %s", user_id, body.role, current_id)
        return MessageResponse(message=f"User role updated to '{body.role}'")

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to update user role: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to update user role")


# ── PUT /users/{id}/status — Activate/deactivate ────────────────


@router.put("/{user_id}/status", response_model=MessageResponse, summary="Activate/deactivate user")
async def update_user_status(
    user_id: str,
    body: UserStatusUpdate,
    current_user: dict = Depends(require_permission("userManagement", "update")),
) -> MessageResponse:
    """Activate or deactivate a user. Cannot deactivate self."""
    current_id = str(current_user.get("id", ""))
    if current_id == user_id and not body.is_active:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")

    try:
        with db() as conn:
            row = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="User not found")

            conn.execute(
                "UPDATE users SET is_active = ? WHERE id = ?",
                (1 if body.is_active else 0, user_id),
            )

        action = "activated" if body.is_active else "deactivated"
        logger.info("User %s %s by %s", user_id, action, current_id)
        return MessageResponse(message=f"User {action} successfully")

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to update user status: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to update user status")


# ── POST /users/invite — Invite user ────────────────────────────


@router.post("/invite", response_model=MessageResponse, status_code=201, summary="Invite a new user")
async def invite_user(
    body: UserInviteRequest,
    current_user: dict = Depends(require_permission("userManagement", "create")),
) -> MessageResponse:
    """Invite a new user by creating their account with a temporary password."""
    try:
        with db() as conn:
            existing = conn.execute(
                "SELECT id FROM users WHERE email = ?", (body.email,)
            ).fetchone()
            if existing:
                raise HTTPException(status_code=409, detail="User with this email already exists")

            # Generate a temporary password
            temp_password = secrets.token_urlsafe(12)

            from passlib.hash import sha256_crypt
            hashed = sha256_crypt.hash(temp_password)

            import uuid
            user_id = f"user-{uuid.uuid4().hex[:8]}"
            conn.execute(
                "INSERT INTO users (id, email, hashed_password, name, full_name, role, company, is_active) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
                (user_id, body.email, hashed, body.full_name, body.full_name, body.role, body.company),
            )

        logger.info("User %s invited with role %s by %s", body.email, body.role, current_user.get("email"))
        return MessageResponse(
            message=f"User invited successfully. Temporary password: {temp_password}"
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to invite user: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to invite user")


# ── DELETE /users/{id} — Remove user ────────────────────────────


@router.delete("/{user_id}", response_model=MessageResponse, summary="Delete a user")
async def delete_user(
    user_id: str,
    current_user: dict = Depends(require_permission("userManagement", "delete")),
) -> MessageResponse:
    """Soft-delete or remove a user. Cannot delete self."""
    current_id = str(current_user.get("id", ""))
    if current_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    try:
        with db() as conn:
            row = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="User not found")

            conn.execute("UPDATE users SET is_active = 0 WHERE id = ?", (user_id,))

        logger.info("User %s deleted by %s", user_id, current_id)
        return MessageResponse(message="User removed successfully")

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to delete user: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to delete user")
