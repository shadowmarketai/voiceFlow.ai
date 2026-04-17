"""
VoiceFlow Marketing AI - Auth Router
======================================
Authentication endpoints with rate limiting.

KB-004: PyJWT only (NOT python-jose)
KB-005: Password validation (8+ chars, 1 uppercase, 1 digit)
KB-006: Rate limit auth endpoints (login 5/min, register 3/min)
KB-007: Include logout endpoint
"""

import logging
import os

from fastapi import APIRouter, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from api.dependencies import get_current_active_user, get_current_user
from api.schemas.auth import (
    ForgotPasswordRequest,
    GoogleAuthRequest,
    LoginRequest,
    LoginResponse,
    RefreshTokenRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    TenantBranding,
    TwoFactorLoginRequest,
    TwoFactorSetupResponse,
    TwoFactorVerifyRequest,
    UserResponse,
    UserUpdate,
)
from api.schemas.common import MessageResponse
from api.permissions import get_accessible_modules, get_role_permissions
from api.services.auth_service import AuthService

logger = logging.getLogger(__name__)

# Rate limiter instance (KB-006) — disabled in test environment
_is_testing = os.getenv("APP_ENV") == "testing"
_rate_register = "100/minute" if _is_testing else "3/minute"
_rate_login = "100/minute" if _is_testing else "5/minute"
limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


# ── POST /register ───────────────────────────────────────────────


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=201,
    summary="Register a new user account",
)
@limiter.limit(_rate_register)
async def register(request: Request, body: RegisterRequest) -> TokenResponse:
    """Register a new user.

    Rate limited to 3 requests per minute (KB-006).
    Password must meet complexity requirements (KB-005).
    """
    result = AuthService.register(
        email=body.email,
        password=body.password,
        full_name=body.full_name,
        company=body.company,
        phone=body.phone,
    )
    return TokenResponse(**result)


# ── POST /login ──────────────────────────────────────────────────


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Login with email and password",
)
@limiter.limit(_rate_login)
async def login(request: Request, body: LoginRequest) -> LoginResponse:
    """Authenticate with email and password, returns JWT tokens.

    If 2FA is enabled, returns requires_2fa=True with a temp_token.
    Rate limited to 5 requests per minute (KB-006).
    """
    result = AuthService.login(email=body.email, password=body.password)
    return LoginResponse(**result)


# ── POST /refresh ────────────────────────────────────────────────


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh access token",
)
async def refresh_token(body: RefreshTokenRequest) -> TokenResponse:
    """Exchange a valid refresh token for a new access + refresh token pair.

    Refresh tokens expire after 7 days (configurable via REFRESH_TOKEN_EXPIRE_DAYS).
    """
    result = AuthService.refresh_token(refresh_token_str=body.refresh_token)
    return TokenResponse(**result)


# ── POST /logout (KB-007) ───────────────────────────────────────


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Logout current user",
)
async def logout(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> MessageResponse:
    """Logout the current user (KB-007).

    W8.1 — blacklists the access token's JTI so it can't be replayed.
    Client should also discard tokens on its side.
    """
    raw_token = (request.headers.get("authorization") or "")[7:]  # strip "Bearer "
    result = AuthService.logout(user_id=current_user.get("id", ""), token=raw_token)
    return MessageResponse(**result)


# ── GET /me ──────────────────────────────────────────────────────


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current user profile",
)
async def get_profile(
    current_user: dict = Depends(get_current_active_user),
) -> UserResponse:
    """Get the authenticated user's profile and tenant branding."""
    tenant_branding = _load_tenant_branding(current_user.get("tenant_id"))
    return UserResponse(
        id=current_user.get("id", ""),
        email=current_user.get("email", ""),
        full_name=current_user.get("name", ""),
        name=current_user.get("name", ""),
        role=current_user.get("role", "user"),
        company=current_user.get("company"),
        phone=current_user.get("phone"),
        plan=current_user.get("plan", "starter"),
        is_active=bool(current_user.get("is_active", 1)),
        is_super_admin=bool(current_user.get("is_super_admin", 0)),
        tenant_id=current_user.get("tenant_id"),
        tenant=tenant_branding,
        created_at=current_user.get("created_at", ""),
    )


def _load_tenant_branding(tenant_id: str | None) -> TenantBranding | None:
    """Load tenant branding fields. Returns None if no tenant."""
    if not tenant_id:
        return None
    from api.database import db, USE_POSTGRES
    _ph = "%s" if USE_POSTGRES else "?"
    try:
        with db() as conn:
            row = conn.execute(
                f"SELECT * FROM platform_tenants WHERE id={_ph}", (tenant_id,)
            ).fetchone()
            if not row:
                return None
            t = dict(row)
            return TenantBranding(
                id=t["id"],
                name=t.get("name", ""),
                slug=t.get("slug"),
                app_name=t.get("app_name"),
                tagline=t.get("tagline"),
                logo_url=t.get("logo_url"),
                favicon_url=t.get("favicon_url"),
                primary_color=t.get("primary_color"),
                secondary_color=t.get("secondary_color"),
                accent_color=t.get("accent_color"),
                font_family=t.get("font_family"),
                sidebar_style=t.get("sidebar_style"),
                website=t.get("website"),
                support_email=t.get("support_email"),
                support_phone=t.get("support_phone"),
                address=t.get("address"),
                plan_id=t.get("plan_id"),
            )
    except Exception as exc:
        logger.warning("Failed to load tenant branding for %s: %s", tenant_id, exc)
        return None


# ── PUT /me ──────────────────────────────────────────────────────


@router.put(
    "/me",
    response_model=UserResponse,
    summary="Update current user profile",
)
async def update_profile(
    body: UserUpdate,
    current_user: dict = Depends(get_current_active_user),
) -> UserResponse:
    """Update the authenticated user's profile fields."""
    updates = body.model_dump(exclude_none=True)
    updated_user = AuthService.update_user(
        user_id=current_user.get("id", ""),
        updates=updates,
    )
    return UserResponse(**updated_user)


# ── GET /permissions ──────────────────────────────────────────────


@router.get(
    "/permissions",
    summary="Get current user's permissions",
)
async def get_permissions(
    current_user: dict = Depends(get_current_active_user),
) -> dict:
    """Return the authenticated user's role permissions and accessible modules."""
    role = current_user.get("role", "user")
    return {
        "role": role,
        "permissions": get_role_permissions(role),
        "accessible_modules": get_accessible_modules(role),
    }


# ── 2FA Endpoints ───────────────────────────────────────────────


@router.post(
    "/2fa/setup",
    response_model=TwoFactorSetupResponse,
    summary="Start 2FA setup — returns QR code URI",
)
async def setup_2fa(
    current_user: dict = Depends(get_current_active_user),
) -> TwoFactorSetupResponse:
    """Generate TOTP secret and QR URI for authenticator app setup."""
    result = AuthService.setup_2fa(user_id=current_user.get("id", ""))
    return TwoFactorSetupResponse(**result)


@router.post(
    "/2fa/verify",
    response_model=MessageResponse,
    summary="Verify TOTP code and enable 2FA",
)
async def verify_2fa(
    body: TwoFactorVerifyRequest,
    current_user: dict = Depends(get_current_active_user),
) -> MessageResponse:
    """Verify a 6-digit TOTP code to activate 2FA on the account."""
    AuthService.verify_and_enable_2fa(
        user_id=current_user.get("id", ""),
        code=body.code,
    )
    return MessageResponse(message="Two-factor authentication enabled successfully")


@router.post(
    "/2fa/disable",
    response_model=MessageResponse,
    summary="Disable 2FA",
)
async def disable_2fa(
    body: TwoFactorVerifyRequest,
    current_user: dict = Depends(get_current_active_user),
) -> MessageResponse:
    """Disable 2FA after verifying a valid TOTP code."""
    AuthService.disable_2fa(
        user_id=current_user.get("id", ""),
        code=body.code,
    )
    return MessageResponse(message="Two-factor authentication disabled")


@router.post(
    "/2fa/login",
    response_model=LoginResponse,
    summary="Complete login with 2FA code",
)
@limiter.limit(_rate_login)
async def login_2fa(request: Request, body: TwoFactorLoginRequest) -> LoginResponse:
    """Verify 2FA code and complete login — returns full JWT tokens."""
    result = AuthService.verify_2fa_login(
        email=body.email,
        code=body.code,
        temp_token=body.temp_token,
    )
    return LoginResponse(**result)


# ── Google OAuth ────────────────────────────────────────────────


@router.post(
    "/google",
    response_model=LoginResponse,
    summary="Login or register with Google",
)
@limiter.limit(_rate_login)
async def google_auth(request: Request, body: GoogleAuthRequest) -> LoginResponse:
    """Authenticate using a Google authorization code from the frontend popup."""
    result = AuthService.google_login(code=body.code, redirect_uri=body.redirect_uri)
    return LoginResponse(**result)


# ── Forgot / Reset Password ────────────────────────────────────


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    summary="Request password reset email",
)
@limiter.limit("3/minute")
async def forgot_password(request: Request, body: ForgotPasswordRequest) -> MessageResponse:
    """Generate a password reset token and send email.

    Always returns success to prevent email enumeration.
    """
    from api.services.email_service import send_password_reset_email

    token = AuthService.create_password_reset_token(email=body.email)
    if token:
        sent = send_password_reset_email(to_email=body.email, reset_token=token)
        if not sent:
            logger.warning("Password reset email not sent for %s (SMTP not configured?)", body.email)
    return MessageResponse(message="If an account exists with that email, a reset link has been sent")


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Reset password with token",
)
async def reset_password(body: ResetPasswordRequest) -> MessageResponse:
    """Reset password using a valid reset token from the email link."""
    AuthService.reset_password(token=body.token, new_password=body.new_password)
    return MessageResponse(message="Password reset successfully. You can now sign in.")
