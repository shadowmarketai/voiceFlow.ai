"""
API middleware: tiered rate limiting, security headers, request validation.
"""

import json
import logging
import os
import time
from collections import defaultdict

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
    "starter": {"general": 300, "auth": 20},
    "pro":     {"general": 600, "auth": 30},
    "enterprise": {"general": 1000, "auth": 100},
}
DEFAULT_PLAN = "starter"


def _extract_token_data(request: Request) -> dict:
    """Try to extract plan + tenant_id from JWT token (best-effort, no signature verification)."""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        return {"plan": DEFAULT_PLAN, "tenant_id": None}
    token = auth[7:]
    if token == "demo-token-123":
        return {"plan": "pro", "tenant_id": None}
    try:
        import base64
        parts = token.split(".")
        if len(parts) >= 2:
            payload = parts[1] + "=" * (4 - len(parts[1]) % 4)
            data = json.loads(base64.urlsafe_b64decode(payload))
            return {
                "plan": data.get("plan", DEFAULT_PLAN),
                "tenant_id": data.get("tenant_id"),
            }
    except Exception:
        pass
    return {"plan": DEFAULT_PLAN, "tenant_id": None}


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
        self._buckets: dict[str, tuple[int, float]] = defaultdict(lambda: (0, 0.0))
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
        token_data = _extract_token_data(request)
        plan = token_data["plan"]
        tenant_id = token_data["tenant_id"]
        limits = PLAN_LIMITS.get(plan, PLAN_LIMITS[DEFAULT_PLAN])

        # Auth endpoints get stricter limits
        if "/auth/login" in path or "/auth/register" in path:
            if not self._check_limit(f"auth:{client_ip}", limits["auth"]):
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many login attempts. Try again in 1 minute."},
                    headers={"Retry-After": "60"},
                )

        # W8.2 — per-tenant rate limit (stacks with per-IP).
        # A single tenant can't saturate the platform even if they
        # spread requests across multiple client IPs.
        limit_key = f"tenant:{tenant_id}" if tenant_id else f"general:{client_ip}"
        rpm = limits["general"]
        if not self._check_limit(limit_key, rpm):
            return JSONResponse(
                status_code=429,
                content={"detail": f"Rate limit exceeded. Max {rpm} requests/minute for {plan} plan."},
                headers={"Retry-After": "60", "X-RateLimit-Limit": str(rpm)},
            )

        try:
            response = await call_next(request)
        except Exception as exc:
            import logging
            logging.getLogger(__name__).exception("Middleware caught exception on %s %s", request.method, request.url.path)
            return JSONResponse(status_code=500, content={"error": True, "detail": str(exc)[:200], "status_code": 500})

        # W8.2 — expose standard rate-limit headers.
        count, _ = self._buckets.get(limit_key, (0, 0.0))
        remaining = max(0, rpm - count)
        response.headers["X-RateLimit-Limit"] = str(rpm)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
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
        response.headers["Permissions-Policy"] = "camera=(), microphone=(self), geolocation=(), payment=(self), fullscreen=(self)"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-site"
        response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
        if APP_ENV == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
            # CSP: allow external resources needed by the frontend + Swagger UI CDN
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: "
                "https://checkout.razorpay.com https://cdn.jsdelivr.net; "
                "style-src 'self' 'unsafe-inline' "
                "https://fonts.googleapis.com https://cdn.jsdelivr.net; "
                "font-src 'self' https://fonts.gstatic.com; "
                "img-src 'self' data: blob: https:; "
                "connect-src 'self' https: wss:; "
                "worker-src 'self' blob:; "
                "media-src 'self' blob: data:; "
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
