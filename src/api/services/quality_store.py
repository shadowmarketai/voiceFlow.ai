"""
Quality metrics store — helpers for persisting + querying telemetry.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import Integer, func, select

from api.database import get_session_factory
from api.models.quality_metrics import CallMetric, CsatRating, ProviderProbe, UptimeProbe

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

def provider_uptime_summary(hours: int = 24) -> dict[str, Any]:
    """Per-provider uptime % + avg latency over the last `hours` window.

    Returns { category: [ {provider, ok_pct, avg_latency_ms, samples} ... ] }.
    """
    since = datetime.utcnow() - timedelta(hours=hours)
    out: dict[str, list[dict[str, Any]]] = {"stt": [], "llm": [], "tts": []}
    try:
        with get_session_factory()() as s:
            rows = s.execute(
                select(
                    ProviderProbe.category,
                    ProviderProbe.provider,
                    func.count(ProviderProbe.id).label("total"),
                    func.sum(ProviderProbe.ok.cast(Integer)).label("ok_count"),
                    func.avg(ProviderProbe.latency_ms).label("avg_ms"),
                ).where(ProviderProbe.ts >= since)
                .group_by(ProviderProbe.category, ProviderProbe.provider)
            ).all()
            for r in rows:
                if r.category not in out:
                    continue
                total = int(r.total or 0)
                ok_count = int(r.ok_count or 0)
                out[r.category].append({
                    "provider": r.provider,
                    "ok_pct": round(ok_count / total * 100, 2) if total else None,
                    "avg_latency_ms": round(float(r.avg_ms), 1) if r.avg_ms else None,
                    "samples": total,
                })
    except Exception:
        pass
    return out


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


def latency_summary(hours: int = 24 * 7) -> dict[str, Any]:
    """W1.4 — rolling p50/p95/p99 for total_ms and ttfa_ms, split by pipeline_mode.

    Returns:
      {
        "window_hours": int,
        "target_p95_ms": 900,
        "overall": {p50,p95,p99,count, pct_under_target},
        "stream":  {ttfa_p50,ttfa_p95,ttfa_p99,total_p95,count,pct_under_target},
        "serial":  {p50,p95,p99,count,pct_under_target},
      }
    """
    since = datetime.utcnow() - timedelta(hours=hours)
    target = 900
    empty_row = {"p50": None, "p95": None, "p99": None, "count": 0,
                 "pct_under_target": None}
    out: dict[str, Any] = {
        "window_hours": hours,
        "target_p95_ms": target,
        "overall": dict(empty_row),
        "stream": {**empty_row, "ttfa_p50": None, "ttfa_p95": None, "ttfa_p99": None},
        "serial": dict(empty_row),
    }

    def _pcts(vals: list[int]) -> dict[str, Any]:
        if not vals:
            return dict(empty_row)
        n = len(vals)
        vals = sorted(vals)
        p50 = vals[n // 2]
        p95 = vals[min(n - 1, max(0, int(n * 0.95) - 1))]
        p99 = vals[min(n - 1, max(0, int(n * 0.99) - 1))]
        under = sum(1 for v in vals if v <= target)
        return {
            "p50": int(p50), "p95": int(p95), "p99": int(p99),
            "count": n, "pct_under_target": round(under / n * 100, 1),
        }

    try:
        with get_session_factory()() as s:
            # Overall (total_ms across all modes)
            totals = s.execute(
                select(CallMetric.total_ms).where(
                    CallMetric.ts >= since, CallMetric.total_ms.is_not(None),
                )
            ).scalars().all()
            out["overall"] = _pcts([int(v) for v in totals])

            # Serial (pipeline_mode='serial' or NULL for legacy rows)
            serial_totals = s.execute(
                select(CallMetric.total_ms).where(
                    CallMetric.ts >= since, CallMetric.total_ms.is_not(None),
                    (CallMetric.pipeline_mode == "serial") | (CallMetric.pipeline_mode.is_(None)),
                )
            ).scalars().all()
            out["serial"] = _pcts([int(v) for v in serial_totals])

            # Stream — both ttfa and total
            stream_ttfa = s.execute(
                select(CallMetric.ttfa_ms).where(
                    CallMetric.ts >= since, CallMetric.pipeline_mode == "stream",
                    CallMetric.ttfa_ms.is_not(None),
                )
            ).scalars().all()
            stream_total = s.execute(
                select(CallMetric.total_ms).where(
                    CallMetric.ts >= since, CallMetric.pipeline_mode == "stream",
                    CallMetric.total_ms.is_not(None),
                )
            ).scalars().all()
            ttfa_stats = _pcts([int(v) for v in stream_ttfa])
            total_stats = _pcts([int(v) for v in stream_total])
            out["stream"] = {
                "ttfa_p50": ttfa_stats["p50"],
                "ttfa_p95": ttfa_stats["p95"],
                "ttfa_p99": ttfa_stats["p99"],
                "total_p95": total_stats["p95"],
                "count": ttfa_stats["count"],
                "pct_under_target": ttfa_stats["pct_under_target"],
            }
    except Exception:
        pass

    return out


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


# ── CSAT (customer satisfaction) ──────────────────────────────────────────

def record_csat(score: int, call_id: str | None = None, agent_id: str | None = None,
                comment: str | None = None, language: str | None = None) -> None:
    try:
        score = max(1, min(5, int(score)))
        with get_session_factory()() as s:
            s.add(CsatRating(
                score=score, call_id=call_id, agent_id=agent_id,
                comment=comment, language=language,
            ))
            s.commit()
    except Exception:
        pass


def csat_summary(days: int = 30) -> dict[str, Any]:
    since = datetime.utcnow() - timedelta(days=days)
    try:
        with get_session_factory()() as s:
            rows = s.execute(
                select(CsatRating.score).where(CsatRating.ts >= since)
            ).scalars().all()
            if not rows:
                return {"count": 0, "avg": None, "distribution": {i: 0 for i in range(1, 6)}, "promoters_pct": None}
            count = len(rows)
            avg = round(sum(rows) / count, 2)
            dist = {i: 0 for i in range(1, 6)}
            for r in rows:
                if 1 <= r <= 5:
                    dist[r] += 1
            # NPS-style promoter % (scores 4–5)
            promoters = sum(1 for r in rows if r >= 4)
            return {
                "count": count, "avg": avg, "distribution": dist,
                "promoters_pct": round(promoters / count * 100, 1),
            }
    except Exception:
        return {"count": 0, "avg": None, "distribution": {i: 0 for i in range(1, 6)}, "promoters_pct": None}


# ── Operational metrics — completion / FCR / AHT ──────────────────────────

def operational_summary(days: int = 30) -> dict[str, Any]:
    since = datetime.utcnow() - timedelta(days=days)
    try:
        with get_session_factory()() as s:
            total = s.execute(
                select(func.count(CallMetric.id)).where(CallMetric.ts >= since)
            ).scalar() or 0
            if total == 0:
                return {"total_calls": 0, "completion_rate": None,
                        "fcr_rate": None, "avg_handle_time_sec": None}
            completed = s.execute(
                select(func.count(CallMetric.id)).where(
                    CallMetric.ts >= since, CallMetric.completed.is_(True)
                )
            ).scalar() or 0
            fcr = s.execute(
                select(func.count(CallMetric.id)).where(
                    CallMetric.ts >= since, CallMetric.resolved_first_call.is_(True)
                )
            ).scalar() or 0
            aht = s.execute(
                select(func.avg(CallMetric.duration_sec)).where(
                    CallMetric.ts >= since, CallMetric.duration_sec.is_not(None)
                )
            ).scalar()
            return {
                "total_calls": int(total),
                "completion_rate": round(completed / total * 100, 1),
                "fcr_rate": round(fcr / total * 100, 1),
                "avg_handle_time_sec": round(float(aht), 1) if aht else None,
            }
    except Exception:
        return {"total_calls": 0, "completion_rate": None,
                "fcr_rate": None, "avg_handle_time_sec": None}
