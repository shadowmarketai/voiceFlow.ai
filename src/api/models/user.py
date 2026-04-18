"""
VoiceFlow Marketing AI - User & RefreshToken Models
=====================================================
User authentication and session management models.
Uses sha256_crypt (not bcrypt) per KB: bcrypt 4.x incompatible with passlib 1.7.4.
"""

import enum
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy import (
    Enum as SQLEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from .analytics import AnalyticsEvent
    from .campaign import Campaign
    from .survey import Survey, SurveyResponse
    from .tenant import Tenant
    from .voice import VoiceAnalysis
    from .webhook import APIKey, WebhookConfig
    from .workflow import Workflow


class UserRole(enum.Enum):
    """User role enumeration."""
    ADMIN = "admin"
    MANAGER = "manager"
    AGENT = "agent"
    USER = "user"
    VIEWER = "viewer"


class User(TimestampMixin, SoftDeleteMixin, Base):
    """
    User model for authentication and authorization.
    Supports JWT auth, OAuth, and multi-tenant isolation.
    """
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Authentication
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)

    # Profile
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Role & permissions
    role: Mapped[UserRole] = mapped_column(
        SQLEnum(UserRole, name="user_role", create_constraint=True),
        default=UserRole.USER,
        server_default="user",
        nullable=False,
    )

    # Account status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # OAuth
    oauth_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)  # "google", "microsoft"
    oauth_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Two-Factor Authentication (TOTP)
    totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_2fa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    # Multi-tenant
    tenant_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True, index=True,
    )

    # Preferences
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Kolkata", server_default="Asia/Kolkata")
    language: Mapped[str] = mapped_column(String(10), default="en", server_default="en")

    # Billing
    plan: Mapped[str] = mapped_column(String(50), default="starter", server_default="starter")
    company: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Relationships
    tenant: Mapped[Optional["Tenant"]] = relationship("Tenant", back_populates="users", lazy="selectin")
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        "RefreshToken", back_populates="user", cascade="all, delete-orphan", lazy="selectin",
    )
    voice_analyses: Mapped[list["VoiceAnalysis"]] = relationship(
        "VoiceAnalysis", back_populates="user", lazy="dynamic",
    )
    # CRM relationships removed — CRM models use String user_id (legacy TEXT PK)
    campaigns: Mapped[list["Campaign"]] = relationship(
        "Campaign", back_populates="user", lazy="dynamic",
    )
    workflows: Mapped[list["Workflow"]] = relationship(
        "Workflow", back_populates="user", lazy="dynamic",
    )
    analytics_events: Mapped[list["AnalyticsEvent"]] = relationship(
        "AnalyticsEvent", back_populates="user", lazy="dynamic",
    )
    # NOTE: tickets ↔ user relationships removed because Ticket.user_id is now
    # a plain String (no FK) — matches legacy users.id TEXT column. Query
    # tickets via Ticket.user_id == current_user["id"] in routers instead.
    surveys: Mapped[list["Survey"]] = relationship(
        "Survey", back_populates="user", lazy="dynamic",
    )
    survey_responses: Mapped[list["SurveyResponse"]] = relationship(
        "SurveyResponse", back_populates="user", lazy="dynamic",
    )
    api_keys: Mapped[list["APIKey"]] = relationship(
        "APIKey", back_populates="user", cascade="all, delete-orphan", lazy="dynamic",
    )
    webhook_configs: Mapped[list["WebhookConfig"]] = relationship(
        "WebhookConfig", back_populates="user", cascade="all, delete-orphan", lazy="dynamic",
    )

    __table_args__ = (
        Index("idx_user_role", "role"),
        Index("idx_user_is_active", "is_active"),
        Index("idx_user_oauth", "oauth_provider", "oauth_id"),
        Index("idx_user_tenant_email", "tenant_id", "email"),
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email='{self.email}', role={self.role.value})>"


class RefreshToken(Base):
    """
    Refresh token model for JWT token rotation.
    Tokens are stored as SHA-256 hashes for security.
    """
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Token hash (SHA-256 of the actual token value)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)

    # User reference
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )

    # Expiry and revocation
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Device tracking
    device_info: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)  # IPv6 max length
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default="now()",
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="refresh_tokens")

    __table_args__ = (
        Index("idx_refresh_token_user_active", "user_id", "revoked"),
        Index("idx_refresh_token_expires", "expires_at"),
    )

    def __repr__(self) -> str:
        return f"<RefreshToken(id={self.id}, user_id={self.user_id}, revoked={self.revoked})>"
