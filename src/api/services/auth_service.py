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
import pyotp

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
            If 2FA is enabled, returns requires_2fa=True with a temp_token instead.

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

        if not user_dict.get("is_active", 1):
            raise UnauthorizedError(detail="Account is deactivated")

        # Check if 2FA is enabled
        if user_dict.get("is_2fa_enabled") and user_dict.get("totp_secret"):
            # Issue a short-lived temp token for 2FA verification
            temp_token = cls.create_access_token(
                {"sub": email, "type": "2fa_pending", "user_id": user_dict["id"]},
                expires_delta=timedelta(minutes=5),
            )
            logger.info("2FA required for: %s", email)
            return {
                "requires_2fa": True,
                "temp_token": temp_token,
            }

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
            "requires_2fa": False,
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


    # ── 2FA (TOTP) ────────────────────────────────────────────────

    @classmethod
    def setup_2fa(cls, user_id: str) -> dict:
        """Generate a TOTP secret for the user and return QR URI.

        Does NOT enable 2FA yet — user must verify a code first.
        """
        secret = pyotp.random_base32()
        totp = pyotp.TOTP(secret)
        email = ""

        with db() as conn:
            row = conn.execute("SELECT email FROM users WHERE id=?", (user_id,)).fetchone()
            if not row:
                raise NotFoundError(detail="User not found")
            email = dict(row)["email"]
            # Store secret but don't enable yet
            conn.execute(
                "UPDATE users SET totp_secret=? WHERE id=?", (secret, user_id)
            )

        qr_uri = totp.provisioning_uri(name=email, issuer_name="VoiceFlow AI")
        logger.info("2FA setup initiated for user: %s", user_id)
        return {"secret": secret, "qr_uri": qr_uri}

    @classmethod
    def verify_and_enable_2fa(cls, user_id: str, code: str) -> bool:
        """Verify a TOTP code and enable 2FA for the user."""
        with db() as conn:
            row = conn.execute(
                "SELECT totp_secret FROM users WHERE id=?", (user_id,)
            ).fetchone()
            if not row:
                raise NotFoundError(detail="User not found")
            secret = dict(row).get("totp_secret")
            if not secret:
                raise UnauthorizedError(detail="2FA not set up. Call setup first.")

            totp = pyotp.TOTP(secret)
            if not totp.verify(code, valid_window=1):
                raise UnauthorizedError(detail="Invalid verification code")

            conn.execute(
                "UPDATE users SET is_2fa_enabled=1 WHERE id=?", (user_id,)
            )

        logger.info("2FA enabled for user: %s", user_id)
        return True

    @classmethod
    def verify_2fa_login(cls, email: str, code: str, temp_token: str) -> dict:
        """Verify 2FA code during login and issue full tokens."""
        # Validate temp token
        payload = cls.decode_token(temp_token)
        if payload.get("type") != "2fa_pending":
            raise UnauthorizedError(detail="Invalid temp token")
        if payload.get("sub") != email:
            raise UnauthorizedError(detail="Token email mismatch")

        with db() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE email=?", (email,)
            ).fetchone()

        if not row:
            raise UnauthorizedError(detail="User not found")

        user_dict = dict(row)
        secret = user_dict.get("totp_secret")
        if not secret:
            raise UnauthorizedError(detail="2FA not configured")

        totp = pyotp.TOTP(secret)
        if not totp.verify(code, valid_window=1):
            raise UnauthorizedError(detail="Invalid 2FA code")

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

        logger.info("2FA verified, user logged in: %s", email)
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "user": safe_user,
            "requires_2fa": False,
        }

    @classmethod
    def disable_2fa(cls, user_id: str, code: str) -> bool:
        """Disable 2FA after verifying a valid TOTP code."""
        with db() as conn:
            row = conn.execute(
                "SELECT totp_secret, is_2fa_enabled FROM users WHERE id=?",
                (user_id,),
            ).fetchone()
            if not row:
                raise NotFoundError(detail="User not found")
            user = dict(row)
            if not user.get("is_2fa_enabled"):
                raise UnauthorizedError(detail="2FA is not enabled")

            totp = pyotp.TOTP(user["totp_secret"])
            if not totp.verify(code, valid_window=1):
                raise UnauthorizedError(detail="Invalid verification code")

            conn.execute(
                "UPDATE users SET is_2fa_enabled=0, totp_secret=NULL WHERE id=?",
                (user_id,),
            )

        logger.info("2FA disabled for user: %s", user_id)
        return True

    # ── Google OAuth ────────────────────────────────────────────

    @classmethod
    def google_login(cls, id_token_str: str) -> dict:
        """Authenticate or register a user via Google ID token.

        Verifies the Google ID token, creates an account if new,
        and returns JWT tokens.
        """
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests

        try:
            idinfo = id_token.verify_oauth2_token(
                id_token_str,
                google_requests.Request(),
                settings.GOOGLE_CLIENT_ID,
            )
        except Exception as exc:
            logger.warning("Google token verification failed: %s", exc)
            raise UnauthorizedError(detail="Invalid Google credential")

        google_id = idinfo.get("sub")
        email = idinfo.get("email")
        name = idinfo.get("name", email.split("@")[0] if email else "User")
        avatar = idinfo.get("picture", "")

        if not email:
            raise UnauthorizedError(detail="Google account has no email")

        with db() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE email=?", (email,)
            ).fetchone()

            if row:
                # Existing user — link OAuth if not yet linked
                user_dict = dict(row)
                if not user_dict.get("oauth_provider"):
                    conn.execute(
                        "UPDATE users SET oauth_provider=?, oauth_id=?, avatar_url=? WHERE id=?",
                        ("google", google_id, avatar, user_dict["id"]),
                    )
                # Re-fetch
                row = conn.execute(
                    "SELECT * FROM users WHERE email=?", (email,)
                ).fetchone()
                user_dict = dict(row)
            else:
                # New user via Google
                user_id = f"user-{uuid.uuid4().hex[:8]}"
                created_at = datetime.now(timezone.utc).isoformat()
                conn.execute(
                    """
                    INSERT INTO users (id, email, name, hashed_password, role, plan, company, phone,
                                       created_at, is_active, oauth_provider, oauth_id, avatar_url, is_verified)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        user_id, email, name, "",  # no password for OAuth users
                        "user", "starter", "", "",
                        created_at, 1, "google", google_id, avatar, 1,
                    ),
                )
                row = conn.execute(
                    "SELECT * FROM users WHERE id=?", (user_id,)
                ).fetchone()
                user_dict = dict(row)

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

        logger.info("Google login: %s (new=%s)", email, not bool(row))
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "user": safe_user,
            "requires_2fa": False,
        }

    # ── Forgot / Reset Password ─────────────────────────────────

    @classmethod
    def create_password_reset_token(cls, email: str) -> Optional[str]:
        """Create a short-lived JWT for password reset.

        Returns None (silently) if email doesn't exist, to prevent enumeration.
        """
        with db() as conn:
            row = conn.execute(
                "SELECT id FROM users WHERE email=?", (email,)
            ).fetchone()

        if not row:
            return None  # Don't reveal whether email exists

        token = cls.create_access_token(
            {"sub": email, "type": "password_reset", "user_id": dict(row)["id"]},
            expires_delta=timedelta(minutes=15),
        )
        logger.info("Password reset token created for: %s", email)
        return token

    @classmethod
    def reset_password(cls, token: str, new_password: str) -> bool:
        """Reset password using a valid reset token."""
        payload = cls.decode_token(token)
        if payload.get("type") != "password_reset":
            raise UnauthorizedError(detail="Invalid reset token")

        email = payload.get("sub")
        if not email:
            raise UnauthorizedError(detail="Invalid token: missing subject")

        hashed = cls.hash_password(new_password)
        with db() as conn:
            result = conn.execute(
                "UPDATE users SET hashed_password=? WHERE email=?",
                (hashed, email),
            )
            if result.rowcount == 0:
                raise NotFoundError(detail="User not found")

        logger.info("Password reset completed for: %s", email)
        return True


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
        "is_2fa_enabled": bool(user_dict.get("is_2fa_enabled", 0)),
    }
