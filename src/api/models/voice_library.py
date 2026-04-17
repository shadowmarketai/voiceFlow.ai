"""
Persistent voice library — W10.

Each tenant owns a set of cloned voices. The voice_id is used to route
TTS calls to the right ElevenLabs/XTTS/OpenVoice clone.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import Base


class VoiceCloneRecord(Base):
    __tablename__ = "voice_library"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    voice_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    voice_name: Mapped[str] = mapped_column(String(128))
    tenant_id: Mapped[str] = mapped_column(String(128), index=True)
    created_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    provider: Mapped[str] = mapped_column(String(32), default="elevenlabs")
    provider_voice_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    sample_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    embedding_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    language: Mapped[str] = mapped_column(String(8), default="en")
    quality_snr_db: Mapped[float | None] = mapped_column(Float, nullable=True)
    quality_duration_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
