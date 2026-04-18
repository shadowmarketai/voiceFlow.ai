"""
VoiceFlow Marketing AI - API Key & Webhook Models
===================================================
API key management and webhook configuration for external integrations.
API keys are stored as SHA-256 hashes and support granular permissions.
"""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin

if TYPE_CHECKING:
    from .user import User


class APIKey(TimestampMixin, Base):
    """
    API key model for external access.
    Keys are stored as SHA-256 hashes (never plaintext).
    Supports granular permissions: voice:read, voice:write, crm:sync, etc.
    Rate limited per minute and per hour.
    """
    __tablename__ = "api_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Key info
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    key_prefix: Mapped[str | None] = mapped_column(String(8), nullable=True)  # First 8 chars for identification
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Permissions (granular access control)
    permissions: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # Example: ["voice:read", "voice:write", "crm:sync", "campaign:read", "analytics:read"]

    # Scopes (additional resource-level restrictions)
    allowed_ips: Mapped[list | None] = mapped_column(JSON, nullable=True)  # IP whitelist
    allowed_origins: Mapped[list | None] = mapped_column(JSON, nullable=True)  # CORS origins
    allowed_endpoints: Mapped[list | None] = mapped_column(JSON, nullable=True)  # specific endpoint patterns

    # Rate limiting
    rate_limit_per_minute: Mapped[int] = mapped_column(Integer, default=60, server_default="60")
    rate_limit_per_hour: Mapped[int] = mapped_column(Integer, default=1000, server_default="1000")
    rate_limit_per_day: Mapped[int] = mapped_column(Integer, default=10000, server_default="10000")

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Usage tracking
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    total_requests: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    total_errors: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    # Expiry
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    # Owner (tenant isolation)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="api_keys")

    __table_args__ = (
        Index("idx_apikey_user_active", "user_id", "is_active"),
        Index("idx_apikey_expires", "expires_at"),
        Index("idx_apikey_prefix", "key_prefix"),
    )

    def __repr__(self) -> str:
        return f"<APIKey(id={self.id}, name='{self.name}', prefix='{self.key_prefix}')>"


class WebhookConfig(TimestampMixin, Base):
    """
    Webhook configuration for external integrations.
    Supports event-based delivery with retry logic and secret verification.
    """
    __tablename__ = "webhook_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Webhook info
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Events to trigger on
    events: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # Example: ["voice.processed", "lead.created", "lead.scored", "churn.detected",
    #           "campaign.completed", "ticket.created", "deal.won"]

    # Security
    secret: Mapped[str | None] = mapped_column(String(255), nullable=True)  # HMAC signing secret
    headers: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # Additional headers to send
    auth_type: Mapped[str | None] = mapped_column(String(20), nullable=True)  # "none", "basic", "bearer", "hmac"
    auth_credentials: Mapped[str | None] = mapped_column(String(500), nullable=True)  # encrypted auth value

    # Delivery configuration
    http_method: Mapped[str] = mapped_column(String(10), default="POST", server_default="POST")
    content_type: Mapped[str] = mapped_column(String(50), default="application/json", server_default="application/json")
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=30, server_default="30")
    max_retries: Mapped[int] = mapped_column(Integer, default=3, server_default="3")
    retry_delay_seconds: Mapped[int] = mapped_column(Integer, default=60, server_default="60")

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    # Delivery statistics
    total_deliveries: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    successful_deliveries: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    failed_deliveries: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_delivery_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_delivery_status: Mapped[int | None] = mapped_column(Integer, nullable=True)  # HTTP status code
    last_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Auto-disable on failures
    auto_disable_after_failures: Mapped[int] = mapped_column(Integer, default=10, server_default="10")
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    disabled_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Owner (tenant isolation)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="webhook_configs")
    delivery_logs: Mapped[list["WebhookDeliveryLog"]] = relationship(
        "WebhookDeliveryLog", back_populates="webhook_config", cascade="all, delete-orphan", lazy="dynamic",
    )

    __table_args__ = (
        Index("idx_webhook_user_active", "user_id", "is_active"),
        Index("idx_webhook_active", "is_active"),
    )

    def __repr__(self) -> str:
        return f"<WebhookConfig(id={self.id}, name='{self.name}', active={self.is_active})>"


class WebhookDeliveryLog(Base):
    """
    Webhook delivery attempt log.
    Records each delivery attempt with request/response data for debugging.
    """
    __tablename__ = "webhook_delivery_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Delivery info
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    event_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # Request
    request_url: Mapped[str] = mapped_column(String(500), nullable=False)
    request_headers: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    request_body: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Response
    response_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_headers: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    response_body: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timing
    duration_ms: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Retry info
    attempt_number: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    is_success: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Foreign keys
    webhook_config_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("webhook_configs.id", ondelete="CASCADE"), nullable=False, index=True,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default="now()",
        nullable=False,
    )

    # Relationships
    webhook_config: Mapped["WebhookConfig"] = relationship("WebhookConfig", back_populates="delivery_logs")

    __table_args__ = (
        Index("idx_delivery_webhook_created", "webhook_config_id", "created_at"),
        Index("idx_delivery_event", "event_type", "created_at"),
        Index("idx_delivery_success", "is_success"),
    )

    def __repr__(self) -> str:
        return f"<WebhookDeliveryLog(id={self.id}, event='{self.event_type}', success={self.is_success})>"
