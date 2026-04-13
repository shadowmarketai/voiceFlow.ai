"""
VoiceFlow Marketing AI - Analytics Models
===========================================
Analytics event tracking for dashboards, reporting, and aggregation.
"""

from datetime import datetime
from typing import Optional, TYPE_CHECKING

from sqlalchemy import (
    String, Integer, Float, DateTime, JSON, ForeignKey, Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from .base import Base

if TYPE_CHECKING:
    from .user import User


class AnalyticsEvent(Base):
    """
    Analytics events for dashboards and reporting.
    Designed for efficient aggregation with denormalized date dimensions.
    """
    __tablename__ = "analytics_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Event classification
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    event_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    event_category: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # "voice", "crm", "marketing", "billing"
    event_action: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # "created", "updated", "converted"

    # Context references
    voice_analysis_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("voice_analyses.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    lead_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("crm_leads.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    campaign_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("campaigns.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    deal_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("crm_deals.id", ondelete="SET NULL"), nullable=True, index=True,
    )

    # Event data (flexible schema)
    properties: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Date dimensions for aggregation (denormalized for query performance)
    event_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    hour: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    day_of_week: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 0=Monday, 6=Sunday
    week_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Metrics
    value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    count: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    duration_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Source tracking
    source: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # "web", "api", "system"
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    session_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Owner (tenant isolation)
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    user: Mapped[Optional["User"]] = relationship("User", back_populates="analytics_events")

    __table_args__ = (
        Index("idx_analytics_event_type", "event_type"),
        Index("idx_analytics_date", "event_date"),
        Index("idx_analytics_category_date", "event_category", "event_date"),
        Index("idx_analytics_user_type", "user_id", "event_type"),
        Index("idx_analytics_lead_type", "lead_id", "event_type"),
        Index("idx_analytics_campaign_type", "campaign_id", "event_type"),
        Index("idx_analytics_year_month", "year", "month"),
    )

    def __repr__(self) -> str:
        return f"<AnalyticsEvent(id={self.id}, type='{self.event_type}', name='{self.event_name}')>"
