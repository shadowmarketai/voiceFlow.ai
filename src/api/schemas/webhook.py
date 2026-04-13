"""
VoiceFlow Marketing AI - Webhook & API Key Schemas
====================================================
Request/response models for the Webhooks and API Keys endpoints.
Uses Pydantic v2 ConfigDict (KB-014).
"""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


# ── API Key Schemas ─────────────────────────────────────────────


class APIKeyCreate(BaseModel):
    """Create a new API key."""

    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    permissions: Optional[list[str]] = Field(
        default=None,
        description='Granular permissions, e.g. ["voice:read", "voice:write", "crm:sync"]',
    )
    allowed_ips: Optional[list[str]] = None
    allowed_origins: Optional[list[str]] = None
    rate_limit_per_minute: int = Field(default=60, ge=1)
    rate_limit_per_hour: int = Field(default=1000, ge=1)
    rate_limit_per_day: int = Field(default=10000, ge=1)
    expires_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class APIKeyResponse(BaseModel):
    """API key response (does NOT include the plain key)."""

    id: int
    name: str
    description: Optional[str] = None
    key_prefix: Optional[str] = None
    permissions: Optional[list[str]] = None
    allowed_ips: Optional[list[str]] = None
    allowed_origins: Optional[list[str]] = None
    rate_limit_per_minute: int = 60
    rate_limit_per_hour: int = 1000
    rate_limit_per_day: int = 10000
    is_active: bool = True
    last_used_at: Optional[datetime] = None
    total_requests: int = 0
    total_errors: int = 0
    expires_at: Optional[datetime] = None
    user_id: int
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class APIKeyCreatedResponse(BaseModel):
    """Response returned only once when a key is first created.
    Contains the plain text key that must be stored by the client.
    """

    id: int
    name: str
    key: str = Field(..., description="Plain API key - shown only ONCE")
    key_prefix: str
    permissions: Optional[list[str]] = None
    expires_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ── Webhook Schemas ─────────────────────────────────────────────


class WebhookCreate(BaseModel):
    """Create a new webhook configuration."""

    name: str = Field(..., min_length=1, max_length=100)
    url: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    events: Optional[list[str]] = Field(
        default=None,
        description='Events to subscribe to, e.g. ["voice.processed", "lead.created", "deal.won"]',
    )
    secret: Optional[str] = Field(default=None, max_length=255)
    headers: Optional[dict[str, str]] = None
    auth_type: Optional[str] = Field(
        default=None,
        pattern="^(none|basic|bearer|hmac)$",
    )
    auth_credentials: Optional[str] = Field(default=None, max_length=500)
    http_method: str = Field(default="POST", pattern="^(GET|POST|PUT|PATCH)$")
    content_type: str = Field(default="application/json", max_length=50)
    timeout_seconds: int = Field(default=30, ge=1, le=120)
    max_retries: int = Field(default=3, ge=0, le=10)
    retry_delay_seconds: int = Field(default=60, ge=1)
    auto_disable_after_failures: int = Field(default=10, ge=1)

    model_config = ConfigDict(from_attributes=True)


class WebhookUpdate(BaseModel):
    """Update a webhook configuration."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    url: Optional[str] = Field(default=None, min_length=1, max_length=500)
    description: Optional[str] = None
    events: Optional[list[str]] = None
    secret: Optional[str] = Field(default=None, max_length=255)
    headers: Optional[dict[str, str]] = None
    auth_type: Optional[str] = Field(
        default=None,
        pattern="^(none|basic|bearer|hmac)$",
    )
    auth_credentials: Optional[str] = Field(default=None, max_length=500)
    http_method: Optional[str] = Field(default=None, pattern="^(GET|POST|PUT|PATCH)$")
    content_type: Optional[str] = Field(default=None, max_length=50)
    timeout_seconds: Optional[int] = Field(default=None, ge=1, le=120)
    max_retries: Optional[int] = Field(default=None, ge=0, le=10)
    retry_delay_seconds: Optional[int] = Field(default=None, ge=1)
    is_active: Optional[bool] = None
    auto_disable_after_failures: Optional[int] = Field(default=None, ge=1)

    model_config = ConfigDict(from_attributes=True)


class WebhookResponse(BaseModel):
    """Webhook configuration response."""

    id: int
    name: str
    url: str
    description: Optional[str] = None
    events: Optional[list[str]] = None
    auth_type: Optional[str] = None
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
    last_delivery_at: Optional[datetime] = None
    last_delivery_status: Optional[int] = None
    last_error_message: Optional[str] = None
    auto_disable_after_failures: int = 10
    disabled_at: Optional[datetime] = None
    disabled_reason: Optional[str] = None
    user_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class WebhookDeliveryLogResponse(BaseModel):
    """Webhook delivery log entry."""

    id: int
    event_type: str
    event_id: Optional[str] = None
    request_url: str
    request_headers: Optional[dict[str, Any]] = None
    request_body: Optional[dict[str, Any]] = None
    response_status: Optional[int] = None
    response_body: Optional[str] = None
    duration_ms: Optional[float] = None
    attempt_number: int = 1
    is_success: bool = False
    error_message: Optional[str] = None
    webhook_config_id: int
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class WebhookTestResponse(BaseModel):
    """Response from testing a webhook."""

    success: bool
    status_code: Optional[int] = None
    response_body: Optional[str] = None
    duration_ms: Optional[float] = None
    error: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
