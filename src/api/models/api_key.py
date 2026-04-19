"""
API Key model — persistent API key management.
"""

from datetime import datetime

from sqlalchemy import DateTime, Index, String, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from api.models.base import Base


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    key_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    key_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    tenant_id: Mapped[str] = mapped_column(String(64), default="", index=True)
    user_id: Mapped[str] = mapped_column(String(64), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_api_keys_tenant", "tenant_id", "is_active"),
    )
