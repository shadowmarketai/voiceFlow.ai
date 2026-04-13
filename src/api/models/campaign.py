"""
VoiceFlow Marketing AI - Campaign Model
=========================================
Marketing campaign tracking across platforms (Meta Ads, Google Ads, WhatsApp).
Budget is in INR (default currency).
"""

import enum
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import (
    String, Integer, Float, Boolean, DateTime, JSON, Text, ForeignKey, Index,
    Enum as SQLEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, SoftDeleteMixin

if TYPE_CHECKING:
    from .user import User
    from .crm import Lead


class CampaignStatus(enum.Enum):
    """Campaign lifecycle status."""
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class CampaignType(enum.Enum):
    """Campaign type classification."""
    RETARGET = "retarget"
    NURTURE = "nurture"
    WIN_BACK = "win_back"
    UPSELL = "upsell"
    ONBOARDING = "onboarding"
    PROMOTIONAL = "promotional"
    SEASONAL = "seasonal"
    VOICE_BLAST = "voice_blast"
    DRIP = "drip"
    AB_TEST = "ab_test"


class CampaignPlatform(enum.Enum):
    """Advertising/messaging platform."""
    META = "meta"
    GOOGLE = "google"
    WHATSAPP = "whatsapp"
    SMS = "sms"
    EMAIL = "email"
    VOICE = "voice"
    LINKEDIN = "linkedin"
    MULTI = "multi"


class Campaign(TimestampMixin, SoftDeleteMixin, Base):
    """
    Marketing campaign model.
    Tracks campaigns across Meta Ads, Google Ads, WhatsApp, and voice platforms.
    All budget amounts are in INR.
    """
    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Campaign info
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    campaign_type: Mapped[Optional[CampaignType]] = mapped_column(
        SQLEnum(CampaignType, name="campaign_type", create_constraint=True),
        nullable=True,
    )

    # Status
    status: Mapped[CampaignStatus] = mapped_column(
        SQLEnum(CampaignStatus, name="campaign_status", create_constraint=True),
        default=CampaignStatus.DRAFT,
        server_default="draft",
        nullable=False,
    )

    # Platform
    platform: Mapped[Optional[CampaignPlatform]] = mapped_column(
        SQLEnum(CampaignPlatform, name="campaign_platform", create_constraint=True),
        nullable=True,
    )
    platform_campaign_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    platform_ad_set_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Audience targeting
    audience_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # "emotion_based", "intent_based", "dialect_based"
    audience_criteria: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # {"emotions": ["angry"], "intents": ["cancel"]}
    audience_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    target_demographics: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # {"age": "25-45", "location": "Mumbai"}

    # Budget (amounts in INR)
    budget: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    daily_budget: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    spent: Mapped[float] = mapped_column(Float, default=0.0, server_default="0")
    currency: Mapped[str] = mapped_column(String(3), default="INR", server_default="INR")

    # Performance metrics
    impressions: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    clicks: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    conversions: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    leads_generated: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    cost_per_click: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cost_per_conversion: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    click_through_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # CTR percentage
    conversion_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    roi: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # return on investment %

    # Voice campaign specifics
    total_calls_made: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    calls_connected: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    avg_call_duration: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # seconds

    # Content
    message_template: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    creative_urls: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)  # list of ad creative URLs
    voice_script: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    caller_id: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # Schedule
    start_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    end_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    schedule_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # {"days": ["mon","tue"], "start_time": "09:00", "end_time": "18:00"}

    # A/B testing
    is_ab_test: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    ab_variant: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # "A", "B", "C"
    parent_campaign_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("campaigns.id", ondelete="SET NULL"), nullable=True,
    )

    # Tags and notes
    tags: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Owner (tenant isolation)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )

    # Relationships
    leads: Mapped[List["Lead"]] = relationship("Lead", back_populates="campaign", lazy="dynamic")
    user: Mapped["User"] = relationship("User", back_populates="campaigns")
    ab_variants: Mapped[List["Campaign"]] = relationship(
        "Campaign", back_populates="parent_campaign", lazy="dynamic",
    )
    parent_campaign: Mapped[Optional["Campaign"]] = relationship(
        "Campaign", back_populates="ab_variants", remote_side=[id],
    )

    __table_args__ = (
        Index("idx_campaign_status", "status"),
        Index("idx_campaign_platform", "platform"),
        Index("idx_campaign_user_status", "user_id", "status"),
        Index("idx_campaign_dates", "start_date", "end_date"),
        Index("idx_campaign_type", "campaign_type"),
    )

    def __repr__(self) -> str:
        return f"<Campaign(id={self.id}, name='{self.name}', status={self.status.value})>"
