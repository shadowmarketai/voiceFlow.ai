"""
Quality metrics store — helpers for persisting + querying telemetry.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select

from api.database import get_session_factory
from api.models.quality_metrics import CallMetric, ProviderProbe, UptimeProbe


# ── Writers ────────────────────────────────────────────────────────────

def record_provider_probe(category: str, provider: str, latency_ms: int | None,
                          ok: bool, http_status: int | None = None, note: str | None = None) -> None:
    """Persist a provider probe tick. Swallows DB errors (telemetry must never break prod)."""
    try:
        with get_session_factory()() as s:
            s.add(ProviderProbe(
                category=category, provider=provider, latency_ms=latency_ms,
                ok=ok, http_status=http_status, note=note,
            ))
            s.commit()
    except Exception:
        pass


def record_uptime_probe(service: str, ok: bool, latency_ms: int | None = None) -> None:
    try:
        with get_session_factory()() as s:
            s.add(UptimeProbe(service=service, ok=ok, latency_ms=latency_ms))
            s.commit()
    except Exception:
        pass


def record_call(**kwargs) -> None:
    try:
        with get_session_factory()() as s:
            s.add(CallMetric(**kwargs))
            s.commit()
    except Exception:
        pass


# ── Readers ────────────────────────────────────────────────────────────

def uptime_percent(service: str = "api", hours: int = 24 * 30) -> float:
    since = datetime.utcnow() - timedelta(hours=hours)
    try:
        with get_session_factory()() as s:
            total = s.execute(
                select(func.count(UptimeProbe.id)).where(
                    UptimeProbe.service == service, UptimeProbe.ts >= since
                )
            ).scalar() or 0
            ok = s.execute(
                select(func.count(UptimeProbe.id)).where(
                    UptimeProbe.service == service, UptimeProbe.ts >= since,
                    UptimeProbe.ok.is_(True),
                )
            ).scalar() or 0
            if total == 0:
                return 100.0
            return round(ok / total * 100, 2)
    except Exception:
        return 100.0


def daily_trends(days: int = 7) -> dict[str, list[Any]]:
    """Aggregate the last `days` days of call metrics + uptime into lists for charting."""
    since = datetime.utcnow() - timedelta(days=days)
    day_labels: list[str] = []
    p95: list[int] = []
    up: list[float] = []
    calls: list[int] = []
    wer: list[float] = []

    try:
        with get_session_factory()() as s:
            for i in range(days - 1, -1, -1):
                day_start = (datetime.utcnow() - timedelta(days=i)).replace(
                    hour=0, minute=0, second=0, microsecond=0
                )
                day_end = day_start + timedelta(days=1)
                day_labels.append(day_start.strftime("%b %d"))

                # total_ms p95 for the day
                q = s.execute(
                    select(CallMetric.total_ms).where(
                        CallMetric.ts >= day_start, CallMetric.ts < day_end,
                        CallMetric.total_ms.is_not(None),
                    ).order_by(CallMetric.total_ms.asc())
                ).scalars().all()
                if q:
                    idx = max(0, int(len(q) * 0.95) - 1)
                    p95.append(int(q[idx]))
                else:
                    p95.append(0)

                call_count = s.execute(
                    select(func.count(CallMetric.id)).where(
                        CallMetric.ts >= day_start, CallMetric.ts < day_end,
                    )
                ).scalar() or 0
                calls.append(int(call_count))

                avg_wer = s.execute(
                    select(func.avg(CallMetric.wer)).where(
                        CallMetric.ts >= day_start, CallMetric.ts < day_end,
                        CallMetric.language == "hi", CallMetric.wer.is_not(None),
                    )
                ).scalar()
                wer.append(round(float(avg_wer), 2) if avg_wer else 0.0)

                # per-day uptime
                up_total = s.execute(
                    select(func.count(UptimeProbe.id)).where(
                        UptimeProbe.ts >= day_start, UptimeProbe.ts < day_end,
                    )
                ).scalar() or 0
                up_ok = s.execute(
                    select(func.count(UptimeProbe.id)).where(
                        UptimeProbe.ts >= day_start, UptimeProbe.ts < day_end,
                        UptimeProbe.ok.is_(True),
                    )
                ).scalar() or 0
                up.append(round(up_ok / up_total * 100, 2) if up_total else 100.0)
    except Exception:
        pass

    return {
        "days": day_labels,
        "p95_latency_ms": p95,
        "uptime_percent": up,
        "calls_handled": calls,
        "avg_hindi_wer": wer,
    }


def pipeline_stage_snapshot(hours: int = 24) -> list[dict[str, Any]] | None:
    """Compute p50 / p95 per pipeline stage from the last N hours of calls."""
    since = datetime.utcnow() - timedelta(hours=hours)
    stages = [
        ("Noise Reduction", CallMetric.noise_ms, 20),
        ("VAD", CallMetric.vad_ms, 15),
        ("STT (Deepgram)", CallMetric.stt_ms, 400),
        ("Emotion Analysis", CallMetric.emotion_ms, 80),
        ("LLM (Groq)", CallMetric.llm_ms, 600),
        ("TTS (ElevenLabs)", CallMetric.tts_ms, 700),
        ("EOS", CallMetric.eos_ms, 30),
    ]
    out: list[dict[str, Any]] = []
    try:
        with get_session_factory()() as s:
            for name, col, target in stages:
                vals = s.execute(
                    select(col).where(CallMetric.ts >= since, col.is_not(None)).order_by(col.asc())
                ).scalars().all()
                if not vals:
                    return None      # not enough data yet — caller falls back to defaults
                p50 = vals[len(vals) // 2]
                p95 = vals[max(0, int(len(vals) * 0.95) - 1)]
                out.append({"name": name, "p50": int(p50), "p95": int(p95), "target": target})
    except Exception:
        return None
    return out
