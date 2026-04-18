"""
VoiceFlow Marketing AI - Webhook & API Key Schemas
====================================================
Request/response models for the Webhooks and API Keys endpoints.
Uses Pydantic v2 ConfigDict (KB-014).
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# ── API Key Schemas ─────────────────────────────────────────────


class APIKeyCreate(BaseModel):
    """Create a new API key."""

    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    permissions: list[str] | None = Field(
        default=None,
        description='Granular permissions, e.g. ["voice:read", "voice:write", "crm:sync"]',
    )
    allowed_ips: list[str] | None = None
    allowed_origins: list[str] | None = None
    rate_limit_per_minute: int = Field(default=60, ge=1)
    rate_limit_per_hour: int = Field(default=1000, ge=1)
    rate_limit_per_day: int = Field(default=10000, ge=1)
    expires_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class APIKeyResponse(BaseModel):
    """API key response (does NOT include the plain key)."""

    id: int
    name: str
    description: str | None = None
    key_prefix: str | None = None
    permissions: list[str] | None = None
    allowed_ips: list[str] | None = None
    allowed_origins: list[str] | None = None
    rate_limit_per_minute: int = 60
    rate_limit_per_hour: int = 1000
    rate_limit_per_day: int = 10000
    is_active: bool = True
    last_used_at: datetime | None = None
    total_requests: int = 0
    total_errors: int = 0
    expires_at: datetime | None = None
    user_id: int
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class APIKeyCreatedResponse(BaseModel):
    """Response returned only once when a key is first created.
    Contains the plain text key that must be stored by the client.
    """

    id: int
    name: str
    key: str = Field(..., description="Plain API key - shown only ONCE")
    key_prefix: str
    permissions: list[str] | None = None
    expires_at: datetime | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


# ── Webhook Schemas ─────────────────────────────────────────────


class WebhookCreate(BaseModel):
    """Create a new webhook configuration."""

    name: str = Field(..., min_length=1, max_length=100)
    url: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    events: list[str] | None = Field(
        default=None,
        description='Events to subscribe to, e.g. ["voice.processed", "lead.created", "deal.won"]',
    )
    secret: str | None = Field(default=None, max_length=255)
    headers: dict[str, str] | None = None
    auth_type: str | None = Field(
        default=None,
        pattern="^(none|basic|bearer|hmac)$",
    )
    auth_credentials: str | None = Field(default=None, max_length=500)
    http_method: str = Field(default="POST", pattern="^(GET|POST|PUT|PATCH)$")
    content_type: str = Field(default="application/json", max_length=50)
    timeout_seconds: int = Field(default=30, ge=1, le=120)
    max_retries: int = Field(default=3, ge=0, le=10)
    retry_delay_seconds: int = Field(default=60, ge=1)
    auto_disable_after_failures: int = Field(default=10, ge=1)

    model_config = ConfigDict(from_attributes=True)


class WebhookUpdate(BaseModel):
    """Update a webhook configuration."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    url: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = None
    events: list[str] | None = None
    secret: str | None = Field(default=None, max_length=255)
    headers: dict[str, str] | None = None
    auth_type: str | None = Field(
        default=None,
        pattern="^(none|basic|bearer|hmac)$",
    )
    auth_credentials: str | None = Field(default=None, max_length=500)
    http_method: str | None = Field(default=None, pattern="^(GET|POST|PUT|PATCH)$")
    content_type: str | None = Field(default=None, max_length=50)
    timeout_seconds: int | None = Field(default=None, ge=1, le=120)
    max_retries: int | None = Field(default=None, ge=0, le=10)
    retry_delay_seconds: int | None = Field(default=None, ge=1)
    is_active: bool | None = None
    auto_disable_after_failures: int | None = Field(default=None, ge=1)

    model_config = ConfigDict(from_attributes=True)


class WebhookResponse(BaseModel):
    """Webhook configuration response."""

    id: int
    name: str
    url: str
    description: str | None = None
    events: list[str] | None = None
    auth_type: str | None = None
    http_method: str = "POST"
    content_type: str = "application/json"
    timeout_seconds: int = 30
    max_retries: int = 3
    retry_delay_seconds: int = 60
    is_active: bool = True
    total_deliveries: int = 0
    successful_deliveries: int = 0
    failed_deliveries: int = 0
    consecutive_failures: int = 0
    last_delivery_at: datetime | None = None
    last_delivery_status: int | None = None
    last_error_message: str | None = None
    auto_disable_after_failures: int = 10
    disabled_at: datetime | None = None
    disabled_reason: str | None = None
    user_id: int
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class WebhookDeliveryLogResponse(BaseModel):
    """Webhook delivery log entry."""

    id: int
    event_type: str
    event_id: str | None = None
    request_url: str
    request_headers: dict[str, Any] | None = None
    request_body: dict[str, Any] | None = None
    response_status: int | None = None
    response_body: str | None = None
    duration_ms: float | None = None
    attempt_number: int = 1
    is_success: bool = False
    error_message: str | None = None
    webhook_config_id: int
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class WebhookTestResponse(BaseModel):
    """Response from testing a webhook."""

    success: bool
    status_code: int | None = None
    response_body: str | None = None
    duration_ms: float | None = None
    error: str | None = None

    model_config = ConfigDict(from_attributes=True)
