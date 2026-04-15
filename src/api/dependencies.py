"""
VoiceFlow Marketing AI - Shared Dependencies
=============================================
FastAPI dependency injection functions for database sessions,
authentication, and role-based access control.

Uses PyJWT (KB-004) exclusively. Never python-jose.
"""

import logging
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from api.config import settings
from api.database import db

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)


# ── Database Dependency ──────────────────────────────────────────


def get_db():
    """Yield a database connection context.

    Usage in endpoints::

        @router.get("/items")
        async def list_items(conn=Depends(get_db)):
            rows = conn.execute("SELECT * FROM items").fetchall()
    """
    with db() as conn:
        yield conn


# ── JWT Helpers ──────────────────────────────────────────────────


def _decode_token(token: str) -> dict:
    """Decode and validate a JWT token using PyJWT (KB-004)."""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or malformed token",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── Auth Admin Fallback (demo) ──────────────────────────────────


def _get_admin_user() -> dict:
    """Fetch an admin user from the DB for the demo token.

    Order of preference:
      1. The canonical ``admin@shadowmarket.ai`` row (if it exists)
      2. Any user with role='admin' or 'superadmin'
      3. The first user in the table
      4. A hardcoded demo dict (only reached on a totally empty DB)
    """
    try:
        with db() as conn:
            # Canonical platform owner
            row = conn.execute(
                "SELECT * FROM users WHERE email=?",
                ("mkumaran2931@gmail.com",),
            ).fetchone()
            if row:
                return dict(row)
            # Legacy fallback
            row = conn.execute(
                "SELECT * FROM users WHERE email=?",
                ("admin@shadowmarket.ai",),
            ).fetchone()
            if row:
                return dict(row)
            row = conn.execute(
                "SELECT * FROM users WHERE role IN ('admin','superadmin') "
                "ORDER BY id LIMIT 1"
            ).fetchone()
            if row:
                return dict(row)
            row = conn.execute("SELECT * FROM users ORDER BY id LIMIT 1").fetchone()
            if row:
                return dict(row)
    except Exception:
        pass
    return {
        "id": "user-001",
        "email": "admin@shadowmarket.ai",
        "name": "Shadow Market",
        "role": "admin",
        "plan": "pro",
        "company": "Shadow Market",
        "created_at": "2024-01-01T00:00:00",
    }


# ── Current User Dependency ─────────────────────────────────────


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    """Extract and validate the current user from the JWT bearer token.

    Supports a ``demo-token-123`` bypass for local development.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    # Allow demo token in development
    if token == "demo-token-123":
        return _get_admin_user()

    payload = _decode_token(token)
    email: str = payload.get("sub", "")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing subject",
        )

    try:
        with db() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE email=?", (email,)
            ).fetchone()
    except Exception as exc:
        logger.error("Database error during auth lookup: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication lookup failed",
        )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    user = dict(row)
    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )

    return user


# ── Active User Dependency ──────────────────────────────────────


async def get_current_active_user(
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Ensure the current user is active (not deactivated)."""
    is_active = current_user.get("is_active", 1)
    # SQLite stores booleans as 0/1
    if not is_active or is_active == 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )
    return current_user


# ── Role-Based Access ────────────────────────────────────────────


def require_role(allowed_roles: list[str]):
    """Dependency factory that restricts endpoints to specific roles.

    Usage::

        @router.get("/admin-only")
        async def admin_route(user=Depends(require_role(["admin"]))):
            ...
    """

    async def _role_checker(
        current_user: dict = Depends(get_current_active_user),
    ) -> dict:
        user_role = current_user.get("role", "user")
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user_role}' is not permitted. Required: {allowed_roles}",
            )
        return current_user

    return _role_checker
