"""
VoiceFlow Marketing AI - Auth Schemas
======================================
Request/response models for authentication endpoints.
Password validation per KB-005: 8+ chars, 1 uppercase, 1 digit.
Uses Pydantic v2 ConfigDict (KB-014) and EmailStr (email-validator).
"""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    """User registration request with password validation (KB-005)."""

    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(..., min_length=1, max_length=200)
    company: Optional[str] = Field(default=None, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=20)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        """Enforce password complexity (KB-005).

        - At least 8 characters
        - At least one uppercase letter
        - At least one digit
        """
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Full name cannot be empty")
        return v.strip()

    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    """User login request."""

    email: EmailStr
    password: str = Field(..., min_length=1)

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    """JWT token response after login or registration."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(
        description="Access token expiry in seconds"
    )
    user: dict[str, Any]

    model_config = ConfigDict(from_attributes=True)


class TenantBranding(BaseModel):
    """Tenant branding info exposed to its own users (read-only)."""

    id: str
    name: str
    slug: Optional[str] = None
    app_name: Optional[str] = None
    tagline: Optional[str] = None
    logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    accent_color: Optional[str] = None
    font_family: Optional[str] = None
    sidebar_style: Optional[str] = None
    website: Optional[str] = None
    support_email: Optional[str] = None
    support_phone: Optional[str] = None
    address: Optional[str] = None
    plan_id: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class UserResponse(BaseModel):
    """Public user profile response."""

    id: str
    email: str
    full_name: str
    name: Optional[str] = None  # alias used by some frontend code
    role: str = "user"
    company: Optional[str] = None
    phone: Optional[str] = None
    plan: str = "starter"
    is_active: bool = True
    is_super_admin: bool = False
    tenant_id: Optional[str] = None
    tenant: Optional[TenantBranding] = None
    created_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    """User profile update request."""

    full_name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    company: Optional[str] = Field(default=None, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=20)

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError("Full name cannot be empty")
        return v.strip() if v else v

    model_config = ConfigDict(from_attributes=True)


class RefreshTokenRequest(BaseModel):
    """Refresh token request."""

    refresh_token: str = Field(..., min_length=1)

    model_config = ConfigDict(from_attributes=True)


class PasswordChangeRequest(BaseModel):
    """Password change request with validation (KB-005)."""

    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v

    model_config = ConfigDict(from_attributes=True)


# ── 2FA Schemas ──────────────────────────────────────────────────


class TwoFactorSetupResponse(BaseModel):
    """Response after initiating 2FA setup — contains secret + QR URI."""

    secret: str
    qr_uri: str
    message: str = "Scan the QR code with your authenticator app"


class TwoFactorVerifyRequest(BaseModel):
    """Request to verify a TOTP code (6-digit)."""

    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class TwoFactorLoginRequest(BaseModel):
    """Request to complete login with 2FA code."""

    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")
    temp_token: str = Field(..., min_length=1)


class LoginResponse(BaseModel):
    """Extended login response that may indicate 2FA is required."""

    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    expires_in: Optional[int] = None
    user: Optional[dict[str, Any]] = None
    requires_2fa: bool = False
    temp_token: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ── Google OAuth Schemas ─────────────────────────────────────────


class GoogleAuthRequest(BaseModel):
    """Google OAuth code from frontend popup flow."""

    code: str = Field(..., min_length=1, description="Authorization code from Google OAuth")
    redirect_uri: str = Field(..., min_length=1, description="Redirect URI used in the auth request")


# ── Forgot / Reset Password Schemas ─────────────────────────────


class ForgotPasswordRequest(BaseModel):
    """Request a password reset email."""

    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Reset password with token from email."""

    token: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v

    model_config = ConfigDict(from_attributes=True)
