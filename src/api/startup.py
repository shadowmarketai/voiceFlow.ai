"""
Startup utilities: environment validation, structured logging, Sentry integration.
Called during FastAPI app initialization.
"""

import os
import sys
import json
import logging
from datetime import datetime, timezone


# ============================================
# Environment Validation
# ============================================

REQUIRED_VARS = {
    "SECRET_KEY": "JWT signing key — must be set in production",
}

RECOMMENDED_VARS = {
    "GROQ_API_KEY": "Groq LLM (primary AI provider)",
    "ANTHROPIC_API_KEY": "Anthropic Claude (fallback AI provider)",
    "RAZORPAY_KEY_ID": "Razorpay billing integration",
    "SENDGRID_API_KEY": "SendGrid email provider",
}

PRODUCTION_REQUIRED_VARS = {
    "DATABASE_URL": "PostgreSQL connection string (required in production)",
    "ALLOWED_ORIGINS": "CORS allowed origins (comma-separated)",
}


def validate_environment():
    """
    Check required env vars on startup. Fails fast if critical vars are missing in production.
    Returns a summary dict.
    """
    app_env = os.environ.get("APP_ENV", "development")
    issues = {"errors": [], "warnings": []}

    # Required always
    for var, desc in REQUIRED_VARS.items():
        val = os.environ.get(var, "")
        if not val or val.startswith("your-") or val.startswith("your_"):
            if app_env == "production":
                issues["errors"].append(f"MISSING: {var} — {desc}")
            else:
                issues["warnings"].append(f"UNSET: {var} — {desc} (using default)")

    # Recommended
    for var, desc in RECOMMENDED_VARS.items():
        if not os.environ.get(var):
            issues["warnings"].append(f"OPTIONAL: {var} — {desc}")

    # Production only
    if app_env == "production":
        for var, desc in PRODUCTION_REQUIRED_VARS.items():
            if not os.environ.get(var):
                issues["errors"].append(f"MISSING: {var} — {desc}")

    # Print results
    if issues["errors"]:
        for e in issues["errors"]:
            print(f"  [ERROR] {e}")
        if app_env == "production":
            print("\nFATAL: Missing required environment variables. Refusing to start in production.")
            sys.exit(1)

    if issues["warnings"]:
        for w in issues["warnings"]:
            print(f"  [WARN]  {w}")

    if not issues["errors"] and not issues["warnings"]:
        print("  All environment variables OK.")

    return issues


# ============================================
# Structured JSON Logging
# ============================================

class JSONFormatter(logging.Formatter):
    """JSON log formatter for production log aggregation."""

    def format(self, record):
        log_data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        if record.exc_info and record.exc_info[0]:
            log_data["exception"] = self.formatException(record.exc_info)
        if hasattr(record, "request_id"):
            log_data["request_id"] = record.request_id
        return json.dumps(log_data)


def setup_logging():
    """Configure logging based on APP_ENV."""
    app_env = os.environ.get("APP_ENV", "development")
    log_level = logging.DEBUG if os.environ.get("DEBUG", "").lower() in ("true", "1") else logging.INFO

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Clear existing handlers
    root_logger.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)

    if app_env == "production":
        handler.setFormatter(JSONFormatter())
    else:
        handler.setFormatter(logging.Formatter(
            "%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
            datefmt="%H:%M:%S",
        ))

    root_logger.addHandler(handler)

    # Quiet noisy loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("watchfiles").setLevel(logging.WARNING)

    return root_logger


# ============================================
# Sentry Error Tracking
# ============================================

def setup_sentry():
    """Initialize Sentry if SENTRY_DSN is configured."""
    sentry_dsn = os.environ.get("SENTRY_DSN", "")
    if not sentry_dsn or sentry_dsn.startswith("https://your"):
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        sentry_sdk.init(
            dsn=sentry_dsn,
            environment=os.environ.get("APP_ENV", "development"),
            traces_sample_rate=0.1,  # 10% of transactions
            profiles_sample_rate=0.05,  # 5% of profiles
            integrations=[
                FastApiIntegration(),
                StarletteIntegration(),
            ],
            send_default_pii=False,
        )
        print("  Sentry error tracking initialized")
        return True
    except ImportError:
        print("  Sentry SDK not installed (pip install sentry-sdk[fastapi])")
        return False
    except Exception as e:
        print(f"  Sentry init failed: {e}")
        return False


# ============================================
# Master startup routine
# ============================================

def run_startup_checks():
    """Run all startup checks. Call this from server.py on_event('startup')."""
    print("\n=== VoiceFlow AI — Startup Checks ===")

    print("\n[1/3] Environment validation:")
    validate_environment()

    print("\n[2/3] Logging setup:")
    logger = setup_logging()
    logger.info("Structured logging configured")

    print("\n[3/3] Error tracking:")
    setup_sentry()

    print("\n=== Startup checks complete ===\n")
