"""
API middleware: tiered rate limiting, security headers, request validation.
"""

import os
import time
import json
import logging
from collections import defaultdict
from typing import Dict, Tuple
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)
APP_ENV = os.environ.get("APP_ENV", "development")


# ============================================
# Tiered Rate Limiter (in-memory, per-IP)
# ============================================

# Plan-based rate limits
PLAN_LIMITS = {
    "starter": {"general": 60, "auth": 10},
    "pro":     {"general": 300, "auth": 30},
    "enterprise": {"general": 1000, "auth": 100},
}
DEFAULT_PLAN = "starter"


def _extract_plan_from_token(request: Request) -> str:
    """Try to extract user plan from JWT token (best-effort)."""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        return DEFAULT_PLAN
    token = auth[7:]
    # Demo token
    if token == "demo-token-123":
        return "pro"
    # Decode JWT payload without verification (just for plan lookup)
    try:
        import base64
        parts = token.split(".")
        if len(parts) >= 2:
            payload = parts[1] + "=" * (4 - len(parts[1]) % 4)
            data = json.loads(base64.urlsafe_b64decode(payload))
            return data.get("plan", DEFAULT_PLAN)
    except Exception:
        pass
    return DEFAULT_PLAN


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Tiered token-bucket rate limiter.
    Limits scale by user plan: starter(60rpm), pro(300rpm), enterprise(1000rpm).
    Auth endpoints always get stricter limits.
    Disabled in development unless FORCE_RATE_LIMIT=1.
    """

    def __init__(self, app):
        super().__init__(app)
        # {key: (count, window_start)}
        self._buckets: Dict[str, Tuple[int, float]] = defaultdict(lambda: (0, 0.0))
        self.enabled = APP_ENV not in ("development", "testing") or os.environ.get("FORCE_RATE_LIMIT") == "1"

    def _check_limit(self, key: str, rpm: int) -> bool:
        """Returns True if request is allowed."""
        now = time.time()
        count, window_start = self._buckets[key]
        if now - window_start > 60:
            self._buckets[key] = (1, now)
            return True
        if count >= rpm:
            return False
        self._buckets[key] = (count + 1, window_start)
        return True

    async def dispatch(self, request: Request, call_next):
        if not self.enabled:
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path
        plan = _extract_plan_from_token(request)
        limits = PLAN_LIMITS.get(plan, PLAN_LIMITS[DEFAULT_PLAN])

        # Auth endpoints get stricter limits
        if "/auth/login" in path or "/auth/register" in path:
            if not self._check_limit(f"auth:{client_ip}", limits["auth"]):
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many login attempts. Try again in 1 minute."},
                    headers={"Retry-After": "60"},
                )

        # General rate limit
        if not self._check_limit(f"general:{client_ip}", limits["general"]):
            return JSONResponse(
                status_code=429,
                content={"detail": f"Rate limit exceeded. Max {limits['general']} requests/minute for {plan} plan."},
                headers={"Retry-After": "60"},
            )

        response = await call_next(request)
        # Add rate limit headers
        response.headers["X-RateLimit-Limit"] = str(limits["general"])
        response.headers["X-RateLimit-Plan"] = plan
        return response


# ============================================
# Security Headers
# ============================================

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add comprehensive security headers to all responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(self), geolocation=()"
        response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
        if APP_ENV == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com; "
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                "font-src 'self' https://fonts.gstatic.com; "
                "img-src 'self' data: https:; "
                "connect-src 'self' https://api.razorpay.com https://*.groq.com https://api.anthropic.com; "
                "frame-src https://api.razorpay.com;"
            )
        return response


# ============================================
# Request Size Limiter
# ============================================

class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject requests with bodies larger than max_size (default 10MB)."""

    def __init__(self, app, max_size: int = 10 * 1024 * 1024):
        super().__init__(app)
        self.max_size = max_size

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.max_size:
            return JSONResponse(
                status_code=413,
                content={"detail": f"Request body too large. Max {self.max_size // (1024*1024)}MB."},
            )
        return await call_next(request)
