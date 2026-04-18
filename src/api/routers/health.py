"""
VoiceFlow Marketing AI - Health Check Router
==============================================
Liveness and readiness health check endpoints.

- GET /health               — fast liveness probe (load balancers, Docker HEALTHCHECK)
- GET /health/detailed      — deep readiness check (legacy path)
- GET /api/v1/health/detailed — deep readiness check (versioned path)
- GET /api/v1/launch-checklist — production readiness validator
"""

import logging
import os
import platform
import shutil
import time
from datetime import UTC, datetime

from fastapi import APIRouter
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Health"])

_start_time = time.time()


# ── Liveness Probe ───────────────────────────────────────────────


@router.get("/health", summary="Liveness health check")
async def health_liveness() -> dict:
    """Fast liveness check for load balancers and Docker HEALTHCHECK."""
    return {
        "status": "healthy",
        "timestamp": datetime.now(UTC).isoformat(),
    }


# ── Detailed Readiness Check ────────────────────────────────────


@router.get("/health/detailed", summary="Detailed readiness check (legacy path)")
async def health_detailed_legacy() -> JSONResponse:
    """Alias for the versioned detailed health check (backward-compat)."""
    return await health_detailed()


@router.get("/api/v1/health/detailed", summary="Detailed readiness check")
async def health_detailed() -> JSONResponse:
    """Deep health check that validates DB, Redis, disk, and memory.

    Returns 200 if core services are OK, 503 if critical components are down.
    """
    checks: dict = {}
    overall = "healthy"

    # Uptime
    uptime_s = time.time() - _start_time
    checks["uptime"] = {
        "status": "ok",
        "uptime_seconds": round(uptime_s, 1),
        "uptime_human": _format_duration(uptime_s),
    }

    # Database
    checks["database"] = _check_database()
    if checks["database"]["status"] != "ok":
        overall = "degraded"

    # Redis
    checks["redis"] = _check_redis()
    if checks["redis"]["status"] != "ok" and overall == "healthy":
        overall = "degraded"

    # Disk
    checks["disk"] = _check_disk()
    if checks["disk"]["status"] == "critical":
        overall = "unhealthy"

    # Memory
    checks["memory"] = _check_memory()
    if checks["memory"]["status"] == "critical":
        overall = "unhealthy"

    # System info
    checks["system"] = {
        "python": platform.python_version(),
        "platform": platform.system(),
        "arch": platform.machine(),
        "pid": os.getpid(),
    }

    status_code = 200 if overall in ("healthy", "degraded") else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status": overall,
            "timestamp": datetime.now(UTC).isoformat(),
            "checks": checks,
        },
    )


# ── Internal Check Helpers ───────────────────────────────────────


def _check_database() -> dict:
    """Check database connectivity."""
    try:
        from api.database import get_connection

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.close()
        conn.close()
        db_type = "postgresql" if os.environ.get("DATABASE_URL") else "sqlite"
        return {"status": "ok", "type": db_type}
    except Exception as exc:
        logger.warning("Database health check failed: %s", exc)
        return {"status": "error", "error": str(exc)}


def _check_redis() -> dict:
    """Check Redis connectivity (optional service)."""
    redis_url = os.environ.get("REDIS_URL", "")
    if not redis_url:
        return {"status": "skipped", "reason": "REDIS_URL not configured"}
    try:
        import redis as redis_lib

        r = redis_lib.from_url(redis_url, socket_connect_timeout=2)
        r.ping()
        display_url = redis_url.split("@")[-1] if "@" in redis_url else redis_url
        return {"status": "ok", "url": display_url}
    except ImportError:
        return {"status": "skipped", "reason": "redis package not installed"}
    except Exception as exc:
        return {"status": "error", "error": str(exc)}


def _check_disk() -> dict:
    """Check disk space availability."""
    try:
        usage = shutil.disk_usage("/")
        free_gb = usage.free / (1024**3)
        total_gb = usage.total / (1024**3)
        pct_used = ((usage.total - usage.free) / usage.total) * 100

        if free_gb < 0.5:
            disk_status = "critical"
        elif free_gb < 2:
            disk_status = "warning"
        else:
            disk_status = "ok"

        return {
            "status": disk_status,
            "free_gb": round(free_gb, 1),
            "total_gb": round(total_gb, 1),
            "percent_used": round(pct_used, 1),
        }
    except Exception as exc:
        return {"status": "error", "error": str(exc)}


def _check_memory() -> dict:
    """Check memory usage."""
    try:
        import resource

        usage_kb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        usage_mb = usage_kb / 1024
        if usage_mb > 2048:
            mem_status = "critical"
        elif usage_mb > 1024:
            mem_status = "warning"
        else:
            mem_status = "ok"
        return {"status": mem_status, "rss_mb": round(usage_mb, 1)}
    except ImportError:
        # Windows fallback
        try:
            import psutil

            proc = psutil.Process(os.getpid())
            mem = proc.memory_info()
            rss_mb = mem.rss / (1024 * 1024)
            if rss_mb > 2048:
                mem_status = "critical"
            elif rss_mb > 1024:
                mem_status = "warning"
            else:
                mem_status = "ok"
            return {"status": mem_status, "rss_mb": round(rss_mb, 1)}
        except ImportError:
            return {"status": "ok", "note": "Memory check not available (install psutil)"}


def _format_duration(seconds: float) -> str:
    """Format seconds into human-readable duration."""
    days = int(seconds // 86400)
    hours = int((seconds % 86400) // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    if days > 0:
        return f"{days}d {hours}h {minutes}m"
    if hours > 0:
        return f"{hours}h {minutes}m"
    return f"{minutes}m {secs}s"


# ── Launch Checklist ─────────────────────────────────────────────


@router.get("/api/v1/launch-checklist", summary="Production readiness checklist")
async def launch_checklist() -> dict:
    """Validate all production requirements.

    Returns a checklist with pass/fail for each item and an overall
    readiness score (75%+ required to be production-ready).
    """
    items: list[dict] = []

    # 1. SECRET_KEY
    secret = os.environ.get("SECRET_KEY", "")
    items.append({
        "id": "secret_key",
        "label": "SECRET_KEY is set and not default",
        "passed": bool(secret) and not secret.startswith("your-") and secret != "change-me-in-production",
        "category": "security",
    })

    # 2. DATABASE_URL
    db_url = os.environ.get("DATABASE_URL", "")
    items.append({
        "id": "database_url",
        "label": "PostgreSQL DATABASE_URL configured",
        "passed": bool(db_url) and "postgresql" in db_url,
        "category": "database",
    })

    # 3. Database connectivity
    db_check = _check_database()
    items.append({
        "id": "database_connect",
        "label": "Database is reachable",
        "passed": db_check["status"] == "ok",
        "category": "database",
    })

    # 4. ALLOWED_ORIGINS
    origins = os.environ.get("ALLOWED_ORIGINS", "")
    items.append({
        "id": "cors_origins",
        "label": "ALLOWED_ORIGINS set (not wildcard)",
        "passed": bool(origins) and origins.strip() != "*",
        "category": "security",
    })

    # 5. LLM provider
    has_groq = bool(os.environ.get("GROQ_API_KEY"))
    has_anthropic = bool(os.environ.get("ANTHROPIC_API_KEY"))
    items.append({
        "id": "llm_provider",
        "label": "At least one LLM provider configured (Groq or Anthropic)",
        "passed": has_groq or has_anthropic,
        "category": "ai",
    })

    # 6. Sentry
    sentry_dsn = os.environ.get("SENTRY_DSN", "")
    items.append({
        "id": "sentry",
        "label": "Sentry error tracking configured",
        "passed": bool(sentry_dsn) and not sentry_dsn.startswith("https://your"),
        "category": "monitoring",
    })

    # 7. Billing (Razorpay)
    items.append({
        "id": "billing",
        "label": "Razorpay billing keys configured",
        "passed": bool(os.environ.get("RAZORPAY_KEY_ID")) and bool(os.environ.get("RAZORPAY_KEY_SECRET")),
        "category": "billing",
    })

    # 8. Email provider
    items.append({
        "id": "email",
        "label": "Email provider configured (SendGrid or Mailgun)",
        "passed": bool(os.environ.get("SENDGRID_API_KEY")) or bool(os.environ.get("MAILGUN_API_KEY")),
        "category": "integrations",
    })

    # 9. APP_ENV
    app_env = os.environ.get("APP_ENV", "development")
    items.append({
        "id": "app_env",
        "label": "APP_ENV set to production",
        "passed": app_env == "production",
        "category": "config",
    })

    # 10. Disk space
    disk = _check_disk()
    items.append({
        "id": "disk_space",
        "label": "Disk space > 1 GB free",
        "passed": disk["status"] in ("ok", "warning"),
        "category": "infrastructure",
    })

    # 11. SSL / HTTPS hint
    items.append({
        "id": "ssl",
        "label": "SSL certificate configured (check nginx)",
        "passed": os.path.exists("/etc/letsencrypt/live") or os.path.exists("/etc/nginx/ssl/cert.pem"),
        "category": "security",
        "note": "Verify manually if running outside Docker",
    })

    # 12. Redis
    redis_check = _check_redis()
    items.append({
        "id": "redis",
        "label": "Redis connected (for caching/queues)",
        "passed": redis_check["status"] == "ok",
        "category": "infrastructure",
    })

    passed = sum(1 for i in items if i["passed"])
    total = len(items)
    score = round((passed / total) * 100) if total else 0

    return {
        "score": score,
        "passed": passed,
        "total": total,
        "ready": score >= 75,
        "items": items,
        "timestamp": datetime.now(UTC).isoformat(),
    }
