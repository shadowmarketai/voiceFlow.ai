"""
VoiceFlow Marketing AI - SQLAlchemy Base & Mixins
==================================================
Modern SQLAlchemy 2.0 DeclarativeBase with reusable mixins.

KB-001: Uses DeclarativeBase (NOT deprecated declarative_base())
KB-002: Uses mapped_column() with Mapped[] type hints (NOT Column())
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    """
    SQLAlchemy 2.0 DeclarativeBase.
    All models inherit from this class.
    """
    pass


class TimestampMixin:
    """
    Adds created_at and updated_at columns to any model.
    Uses server-side defaults for consistency.
    """
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        onupdate=func.now(),
        server_default=func.now(),
        nullable=True,
    )


class SoftDeleteMixin:
    """
    Adds soft-delete capability to any model.
    Records are marked as deleted instead of being removed.
    """
    is_deleted: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default="false",
        nullable=False,
        index=True,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    deleted_by: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
