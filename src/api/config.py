"""
VoiceFlow AI SaaS - Application Configuration
===============================================
Standalone Voice AI platform with white-label support
and API integrations for external CRMs.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables and .env file."""

    # ── Application ──────────────────────────────────────────────
    APP_NAME: str = "VoiceFlow AI"
    APP_VERSION: str = "1.0.0"
    APP_ENV: str = "development"
    DEBUG: bool = True

    # ── Database ─────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/voiceflow"

    # ── Redis ────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── Authentication ───────────────────────────────────────────
    SECRET_KEY: str = "voiceflow-ai-secret-key-change-in-production-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── CORS ─────────────────────────────────────────────────────
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:8001",
        "*",
    ]

    # ── Voice AI ─────────────────────────────────────────────────
    WHISPER_MODEL: str = "base"
    TORCH_DEVICE: str = "cpu"

    # ── LLM Providers ───────────────────────────────────────────
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    GROQ_API_KEY: str = ""

    # ── Telephony ────────────────────────────────────────────────
    TELECMI_API_KEY: str = ""
    EXOTEL_API_KEY: str = ""
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""

    # ── Payments ─────────────────────────────────────────────────
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""

    # ── Monitoring ───────────────────────────────────────────────
    SENTRY_DSN: str = ""

    # ── Voice Agent ─────────────────────────────────────────────
    RECORDINGS_DIR: str = "data/recordings"
    VOICES_DIR: str = "data/voices"
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    RAG_ENABLED: bool = True
    SARVAM_API_KEY: str = ""
    SARVAM_TRANSLATE_ENABLED: bool = False

    # ── White-Label ──────────────────────────────────────────────
    WHITELABEL_ENABLED: bool = True
    DEFAULT_TENANT_PLAN: str = "starter"

    # ── WhatsApp Business API ────────────────────────────────────
    WHATSAPP_PHONE_NUMBER_ID: str = ""
    WHATSAPP_ACCESS_TOKEN: str = ""
    WHATSAPP_VERIFY_TOKEN: str = "voiceflow-whatsapp-verify-2026"
    WHATSAPP_APP_SECRET: str = ""

    # ── CRM API Integration ──────────────────────────────────────
    CRM_WEBHOOK_URL: str = ""
    CRM_API_KEY: str = ""

    # ── Rate Limiting ────────────────────────────────────────────
    RATE_LIMIT_LOGIN: str = "5/minute"
    RATE_LIMIT_REGISTER: str = "3/minute"
    RATE_LIMIT_DEFAULT: str = "60/minute"
    RATE_LIMIT_API: str = "120/minute"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )


# Singleton instance
settings = Settings()
