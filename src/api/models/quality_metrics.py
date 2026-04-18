"""
Quality / telemetry metrics persisted to the DB.
------------------------------------------------
Three narrow tables keep the metrics endpoint fast and queryable:

- ProviderProbe    — one row per provider health probe tick
- UptimeProbe      — one row per /health self-probe tick
- CallMetric       — one row per completed voice call (latency + WER/MOS snapshot)
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import Base


class ProviderProbe(Base):
    __tablename__ = "quality_provider_probes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    category: Mapped[str] = mapped_column(String(8), index=True)       # stt / llm / tts
    provider: Mapped[str] = mapped_column(String(64))
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ok: Mapped[bool] = mapped_column(Boolean, default=False)
    http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str | None] = mapped_column(String(128), nullable=True)

    __table_args__ = (
        Index("ix_provider_probes_ts_cat", "ts", "category"),
    )


class UptimeProbe(Base):
    __tablename__ = "quality_uptime_probes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    service: Mapped[str] = mapped_column(String(48), index=True)
    ok: Mapped[bool] = mapped_column(Boolean, default=False)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)


class CallMetric(Base):
    __tablename__ = "quality_call_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    agent_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    language: Mapped[str | None] = mapped_column(String(8), nullable=True)
    duration_sec: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Pipeline stage latencies (ms)
    noise_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    vad_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stt_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    emotion_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    llm_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tts_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    eos_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # W1.4 — Time to first audio. For streaming turns this is the perceived
    # latency; for serial turns ttfa_ms == total_ms. Target p95: 900ms.
    ttfa_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # "stream" | "serial" — lets dashboards compare the two.
    pipeline_mode: Mapped[str | None] = mapped_column(String(16), nullable=True)

    # Accuracy (optional — filled in from benchmark runs)
    wer: Mapped[float | None] = mapped_column(Float, nullable=True)
    der: Mapped[float | None] = mapped_column(Float, nullable=True)          # Diarization Error Rate %
    tts_mos: Mapped[float | None] = mapped_column(Float, nullable=True)
    utmos: Mapped[float | None] = mapped_column(Float, nullable=True)         # Automated MOS predictor
    intent_ok: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    # Operational outcomes (Vapi/Zendesk-style)
    completed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)   # call ended normally
    resolved_first_call: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # FCR
    csat_score: Mapped[int | None] = mapped_column(Integer, nullable=True)   # 1–5 from user


class CsatRating(Base):
    """Post-call customer satisfaction rating (1–5) + optional free-text."""
    __tablename__ = "quality_csat_ratings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    call_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    agent_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    score: Mapped[int] = mapped_column(Integer)               # 1–5
    comment: Mapped[str | None] = mapped_column(String(500), nullable=True)
    language: Mapped[str | None] = mapped_column(String(8), nullable=True)
