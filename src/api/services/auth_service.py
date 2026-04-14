"""
VoiceFlow Marketing AI - Auth Service
=======================================
Business logic for authentication: registration, login, token management.

Rules enforced:
- KB-004: Uses PyJWT exclusively (NOT python-jose)
- KB-005: Password validation (8+ chars, 1 uppercase, 1 digit)
- Uses bcrypt for password hashing (bcrypt<4.1 pinned for passlib compatibility)
- KB-017: Always call db.refresh() / re-fetch after db.commit()
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt

from api.config import settings
from api.database import db
from api.exceptions import ConflictError, NotFoundError, UnauthorizedError

logger = logging.getLogger(__name__)


class AuthService:
    """Handles all authentication operations."""

    # ── Password Hashing (bcrypt directly, no passlib) ────────────

    @staticmethod
    def hash_password(password: str) -> str:
        """Hash a plaintext password using bcrypt."""
        password_bytes = password.encode("utf-8")
        salt = bcrypt.gensalt(rounds=12)
        return bcrypt.hashpw(password_bytes, salt).decode("utf-8")

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verify a plaintext password against a hash.

        Supports both bcrypt ($2b$) and legacy sha256_crypt ($5$) hashes.
        """
        try:
            if hashed_password.startswith("$2b$") or hashed_password.startswith("$2a$"):
                return bcrypt.checkpw(
                    plain_password.encode("utf-8"),
                    hashed_password.encode("utf-8"),
                )
            elif hashed_password.startswith("$5$"):
                # Legacy sha256_crypt from passlib seeder
                from passlib.hash import sha256_crypt
                return sha256_crypt.verify(plain_password, hashed_password)
            return False
        except Exception:
            return False

    # ── Token Creation (KB-004: PyJWT only) ──────────────────────

    @staticmethod
    def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
        """Create a JWT access token using PyJWT (KB-004).

        Args:
            data: Payload data (must include 'sub' for user email).
            expires_delta: Custom expiration. Defaults to settings.ACCESS_TOKEN_EXPIRE_MINUTES.

        Returns:
            Encoded JWT string.
        """
        to_encode = data.copy()
        expire = datetime.now(timezone.utc) + (
            expires_delta
            or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        to_encode.update({
            "exp": expire,
            "iat": datetime.now(timezone.utc),
            "type": "access",
        })
        encoded = jwt.encode(
            to_encode,
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM,
        )
        return encoded

    @staticmethod
    def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
        """Create a JWT refresh token using PyJWT (KB-004).

        Args:
            data: Payload data (must include 'sub' for user email).
            expires_delta: Custom expiration. Defaults to settings.REFRESH_TOKEN_EXPIRE_DAYS.

        Returns:
            Encoded JWT string.
        """
        to_encode = data.copy()
        expire = datetime.now(timezone.utc) + (
            expires_delta
            or timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        )
        to_encode.update({
            "exp": expire,
            "iat": datetime.now(timezone.utc),
            "type": "refresh",
        })
        encoded = jwt.encode(
            to_encode,
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM,
        )
        return encoded

    @staticmethod
    def decode_token(token: str) -> dict:
        """Decode and validate a JWT token.

        Raises:
            UnauthorizedError: If token is invalid or expired.
        """
        try:
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=[settings.ALGORITHM],
            )
            return payload
        except jwt.ExpiredSignatureError:
            raise UnauthorizedError(detail="Token has expired")
        except jwt.PyJWTError as exc:
            logger.warning("JWT decode error: %s", exc)
            raise UnauthorizedError(detail="Invalid or malformed token")

    # ── Registration ─────────────────────────────────────────────

    @classmethod
    def register(
        cls,
        email: str,
        password: str,
        full_name: str,
        company: Optional[str] = None,
        phone: Optional[str] = None,
    ) -> dict:
        """Register a new user account.

        Args:
            email: User email (must be unique).
            password: Plaintext password (already validated by schema).
            full_name: User's display name.
            company: Optional company name.
            phone: Optional phone number.

        Returns:
            dict with access_token, refresh_token, and user info.

        Raises:
            ConflictError: If email is already registered.
        """
        with db() as conn:
            # Check for existing user
            existing = conn.execute(
                "SELECT id FROM users WHERE email=?", (email,)
            ).fetchone()
            if existing:
                raise ConflictError(detail="Email already registered")

            user_id = f"user-{uuid.uuid4().hex[:8]}"
            hashed = cls.hash_password(password)
            created_at = datetime.now(timezone.utc).isoformat()

            conn.execute(
                """
                INSERT INTO users (id, email, name, hashed_password, role, plan, company, phone, created_at, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    email,
                    full_name,
                    hashed,
                    "user",
                    "starter",
                    company or "",
                    phone or "",
                    created_at,
                    1,
                ),
            )

            # KB-017: re-fetch after commit
            row = conn.execute(
                "SELECT * FROM users WHERE id=?", (user_id,)
            ).fetchone()

        user_dict = dict(row)
        safe_user = _safe_user(user_dict)

        token_data = {"sub": email, "role": "user", "user_id": user_id}
        access_token = cls.create_access_token(token_data)
        refresh_token = cls.create_refresh_token(token_data)

        logger.info("User registered: %s (%s)", email, user_id)

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "user": safe_user,
        }

    # ── Login ────────────────────────────────────────────────────

    @classmethod
    def login(cls, email: str, password: str) -> dict:
        """Authenticate a user with email and password.

        Returns:
            dict with access_token, refresh_token, and user info.

        Raises:
            UnauthorizedError: If email/password is invalid.
        """
        with db() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE email=?", (email,)
            ).fetchone()

        if not row:
            raise UnauthorizedError(detail="Invalid email or password")

        user_dict = dict(row)

        if not cls.verify_password(password, user_dict.get("hashed_password", "")):
            raise UnauthorizedError(detail="Invalid email or password")

        # Check if user is active
        if not user_dict.get("is_active", 1):
            raise UnauthorizedError(detail="Account is deactivated")

        safe_user = _safe_user(user_dict)
        token_data = {
            "sub": user_dict["email"],
            "role": user_dict.get("role", "user"),
            "user_id": user_dict["id"],
            "is_super_admin": bool(user_dict.get("is_super_admin", 0)),
            "tenant_id": user_dict.get("tenant_id", ""),
        }
        access_token = cls.create_access_token(token_data)
        refresh_token = cls.create_refresh_token(token_data)

        logger.info("User logged in: %s (super_admin=%s)", email, safe_user.get("is_super_admin"))

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "user": safe_user,
        }

    # ── Refresh Token ────────────────────────────────────────────

    @classmethod
    def refresh_token(cls, refresh_token_str: str) -> dict:
        """Issue a new access token from a valid refresh token.

        Args:
            refresh_token_str: The refresh JWT to validate.

        Returns:
            dict with new access_token and refresh_token.

        Raises:
            UnauthorizedError: If refresh token is invalid.
        """
        payload = cls.decode_token(refresh_token_str)

        if payload.get("type") != "refresh":
            raise UnauthorizedError(detail="Invalid token type — expected refresh token")

        email = payload.get("sub")
        if not email:
            raise UnauthorizedError(detail="Invalid token: missing subject")

        with db() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE email=?", (email,)
            ).fetchone()

        if not row:
            raise UnauthorizedError(detail="User not found")

        user_dict = dict(row)
        if not user_dict.get("is_active", 1):
            raise UnauthorizedError(detail="Account is deactivated")

        safe_user = _safe_user(user_dict)
        token_data = {
            "sub": user_dict["email"],
            "role": user_dict.get("role", "user"),
            "user_id": user_dict["id"],
        }
        new_access = cls.create_access_token(token_data)
        new_refresh = cls.create_refresh_token(token_data)

        logger.info("Token refreshed for: %s", email)

        return {
            "access_token": new_access,
            "refresh_token": new_refresh,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "user": safe_user,
        }

    # ── Logout ───────────────────────────────────────────────────

    @staticmethod
    def logout(user_id: str) -> dict:
        """Logout a user (KB-007).

        In a stateless JWT setup, logout is primarily client-side.
        Server-side we log the event. In production, you would add the
        token to a blacklist in Redis.

        Args:
            user_id: The ID of the user logging out.

        Returns:
            dict with logout confirmation message.
        """
        logger.info("User logged out: %s", user_id)
        return {"message": "Logged out successfully"}

    # ── User Profile ─────────────────────────────────────────────

    @classmethod
    def get_user_by_email(cls, email: str) -> Optional[dict]:
        """Fetch a user by email."""
        with db() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE email=?", (email,)
            ).fetchone()
        if not row:
            return None
        return dict(row)

    @classmethod
    def get_user_by_id(cls, user_id: str) -> Optional[dict]:
        """Fetch a user by ID."""
        with db() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE id=?", (user_id,)
            ).fetchone()
        if not row:
            return None
        return dict(row)

    @classmethod
    def update_user(cls, user_id: str, updates: dict) -> dict:
        """Update a user's profile fields.

        Args:
            user_id: The user ID to update.
            updates: Dict of field->value pairs to update.

        Returns:
            Updated safe user dict.

        Raises:
            NotFoundError: If user does not exist.
        """
        if not updates:
            raise NotFoundError(detail="No updates provided")

        # Map schema fields to DB columns
        field_mapping = {
            "full_name": "name",
            "company": "company",
            "phone": "phone",
        }

        db_updates = {}
        for key, value in updates.items():
            if value is not None:
                db_col = field_mapping.get(key, key)
                db_updates[db_col] = value

        if not db_updates:
            raise NotFoundError(detail="No valid updates provided")

        with db() as conn:
            existing = conn.execute(
                "SELECT id FROM users WHERE id=?", (user_id,)
            ).fetchone()
            if not existing:
                raise NotFoundError(detail="User not found")

            set_clause = ", ".join(f"{k}=?" for k in db_updates)
            values = list(db_updates.values()) + [user_id]
            conn.execute(
                f"UPDATE users SET {set_clause} WHERE id=?",
                values,
            )

            # KB-017: re-fetch after commit
            row = conn.execute(
                "SELECT * FROM users WHERE id=?", (user_id,)
            ).fetchone()

        user_dict = dict(row)
        logger.info("User updated: %s", user_id)
        return _safe_user(user_dict)


# ── Private Helpers ──────────────────────────────────────────────


def _safe_user(user_dict: dict) -> dict:
    """Remove sensitive fields (hashed_password) from user dict."""
    return {
        "id": user_dict.get("id", ""),
        "email": user_dict.get("email", ""),
        "full_name": user_dict.get("name", ""),
        "role": user_dict.get("role", "user"),
        "company": user_dict.get("company", ""),
        "phone": user_dict.get("phone", ""),
        "plan": user_dict.get("plan", "starter"),
        "is_active": bool(user_dict.get("is_active", 1)),
        "is_super_admin": bool(user_dict.get("is_super_admin", 0)),
        "tenant_id": user_dict.get("tenant_id", ""),
        "created_at": user_dict.get("created_at", ""),
    }
