"""
DPDP compliance models — W7.3.

Digital Personal Data Protection Act (India, 2023):
- ConsentRecord tracks per-user consent for data processing.
- DataDeletionRequest tracks right-to-erasure requests (Article 13).
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import Base


class ConsentRecord(Base):
    __tablename__ = "dpdp_consent"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    user_id: Mapped[str] = mapped_column(String(128), index=True)
    tenant_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    purpose: Mapped[str] = mapped_column(String(128))
    granted: Mapped[bool] = mapped_column(Boolean, default=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class DataDeletionRequest(Base):
    __tablename__ = "dpdp_deletion_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    user_id: Mapped[str] = mapped_column(String(128), index=True)
    tenant_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
