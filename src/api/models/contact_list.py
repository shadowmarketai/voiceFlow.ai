"""
Contact List model — persistent storage for campaign phone numbers.
Supports CSV import and manual entry.
"""

from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, JSON, String, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from api.models.base import Base


class ContactList(Base):
    """A named list of phone numbers for campaign dialing."""

    __tablename__ = "contact_lists"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    tenant_id: Mapped[str] = mapped_column(String(64), default="", index=True)
    user_id: Mapped[int] = mapped_column(Integer, default=0, index=True)

    # Phone numbers stored as JSON array of E.164 strings
    # e.g. ["+919876543210", "+919812345678"]
    phone_numbers: Mapped[list] = mapped_column(JSON, default=list)
    total_count: Mapped[int] = mapped_column(Integer, default=0)

    # Optional metadata per contact (name, email, etc.)
    # e.g. [{"phone": "+91...", "name": "Raj", "email": "..."}]
    contacts_data: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # Source tracking
    source: Mapped[str] = mapped_column(String(50), default="manual")  # manual, csv, api
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        Index("ix_contact_lists_tenant_user", "tenant_id", "user_id"),
    )
