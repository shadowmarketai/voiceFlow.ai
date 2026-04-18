"""
AI-powered analytics — W12.

Post-call analytics endpoints:
- Sentiment trends over time
- Topic clustering from transcripts
- Conversion funnel tracking
- AI coaching tips

All read from existing quality_call_metrics + csat_ratings tables.
Heavy ML (topic clustering) is deferred to a background worker;
here we expose the API shape and aggregation endpoints.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from api.database import get_session_factory
from api.dependencies import get_current_active_user
from api.models.quality_metrics import CallMetric, CsatRating

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/analytics", tags=["analytics-ai"])


@router.get("/sentiment-trend")
async def sentiment_trend(
    days: int = 30,
    agent_id: str | None = None,
    user: dict = Depends(get_current_active_user),
):
    """Daily average CSAT as a sentiment proxy over the last N days.

    Returns [{day, avg_score, count}].
    """
    since = datetime.utcnow() - timedelta(days=days)
    try:
        with get_session_factory()() as s:
            q = select(
                func.date(CsatRating.ts).label("day"),
                func.avg(CsatRating.score).label("avg"),
                func.count(CsatRating.id).label("n"),
            ).where(CsatRating.ts >= since).group_by(func.date(CsatRating.ts))
            if agent_id:
                q = q.where(CsatRating.agent_id == agent_id)
            rows = s.execute(q.order_by("day")).all()
            return {
                "days": days,
                "trend": [
                    {"day": str(r.day), "avg_score": round(float(r.avg), 2), "count": int(r.n)}
                    for r in rows
                ],
            }
    except Exception as exc:
        logger.warning("sentiment_trend failed: %s", exc)
        return {"days": days, "trend": []}


@router.get("/topic-distribution")
async def topic_distribution(
    days: int = 30,
    user: dict = Depends(get_current_active_user),
):
    """Language distribution as a topic proxy (true topic clustering needs NLP worker).

    Returns language-based distribution until the NLP worker ships.
    """
    since = datetime.utcnow() - timedelta(days=days)
    try:
        with get_session_factory()() as s:
            rows = s.execute(
                select(
                    CallMetric.language,
                    func.count(CallMetric.id).label("n"),
                ).where(
                    CallMetric.ts >= since, CallMetric.language.is_not(None)
                ).group_by(CallMetric.language)
            ).all()
            total = sum(r.n for r in rows) or 1
            return {
                "days": days,
                "topics": [
                    {
                        "topic": f"calls_in_{r.language}" if r.language else "unknown",
                        "language": r.language,
                        "count": int(r.n),
                        "pct": round(r.n / total * 100, 1),
                    }
                    for r in sorted(rows, key=lambda r: -r.n)
                ],
                "note": "True topic clustering lands in W12 NLP worker phase.",
            }
    except Exception as exc:
        logger.warning("topic_distribution failed: %s", exc)
        return {"days": days, "topics": []}


@router.get("/conversion-funnel")
async def conversion_funnel(
    days: int = 30,
    user: dict = Depends(get_current_active_user),
):
    """Funnel: total calls → completed → resolved first-call → high CSAT (4+).

    Each stage is a count + % of total. Gives visibility into where
    calls drop off.
    """
    since = datetime.utcnow() - timedelta(days=days)
    try:
        with get_session_factory()() as s:
            total = s.execute(
                select(func.count(CallMetric.id)).where(CallMetric.ts >= since)
            ).scalar() or 0
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
            high_csat = s.execute(
                select(func.count(CsatRating.id)).where(
                    CsatRating.ts >= since, CsatRating.score >= 4
                )
            ).scalar() or 0

            def _pct(n):
                return round(n / total * 100, 1) if total else 0

            return {
                "days": days,
                "funnel": [
                    {"stage": "Total calls", "count": total, "pct": 100},
                    {"stage": "Completed", "count": completed, "pct": _pct(completed)},
                    {"stage": "Resolved (FCR)", "count": fcr, "pct": _pct(fcr)},
                    {"stage": "High CSAT (4+)", "count": high_csat, "pct": _pct(high_csat)},
                ],
            }
    except Exception as exc:
        logger.warning("conversion_funnel failed: %s", exc)
        return {"days": days, "funnel": []}


@router.get("/performance-insights")
async def performance_insights(
    days: int = 7,
    user: dict = Depends(get_current_active_user),
):
    """Performance insights based on recent call metrics.

    Rules-based threshold checks — NOT LLM-generated. Each insight
    fires when a metric crosses a known threshold. Honest labelling:
    this is deterministic logic, not AI inference.
    """
    since = datetime.utcnow() - timedelta(days=days)
    tips: list[dict[str, Any]] = []
    try:
        with get_session_factory()() as s:
            # Average p95 latency
            totals = s.execute(
                select(CallMetric.total_ms).where(
                    CallMetric.ts >= since, CallMetric.total_ms.is_not(None)
                ).order_by(CallMetric.total_ms.asc())
            ).scalars().all()
            if totals:
                n = len(totals)
                p95 = int(totals[max(0, int(n * 0.95) - 1)])
                if p95 > 1200:
                    tips.append({
                        "priority": "high",
                        "area": "latency",
                        "tip": f"p95 latency is {p95}ms (target <900ms). Switch more traffic to the streaming pipeline (POST /respond-stream) — it cuts TTFA by ~40%.",
                    })
                elif p95 > 900:
                    tips.append({
                        "priority": "medium",
                        "area": "latency",
                        "tip": f"p95 is {p95}ms — close to target. Consider enabling response_cache for FAQ-heavy agents (RESPONSE_CACHE_ENABLED=true).",
                    })

            # CSAT
            csat_rows = s.execute(
                select(CsatRating.score).where(CsatRating.ts >= since)
            ).scalars().all()
            if csat_rows:
                avg = sum(csat_rows) / len(csat_rows)
                low_pct = sum(1 for r in csat_rows if r <= 2) / len(csat_rows) * 100
                if avg < 3.5:
                    tips.append({
                        "priority": "high",
                        "area": "csat",
                        "tip": f"Average CSAT is {avg:.1f}/5 — review low-scoring call transcripts and tune agent prompts.",
                    })
                if low_pct > 20:
                    tips.append({
                        "priority": "medium",
                        "area": "csat",
                        "tip": f"{low_pct:.0f}% of ratings are 1-2 stars. Check if the agent is hallucinating — enable India-grounded prompts if not already on.",
                    })

            # Completion rate
            total_calls = s.execute(
                select(func.count(CallMetric.id)).where(CallMetric.ts >= since)
            ).scalar() or 0
            completed_calls = s.execute(
                select(func.count(CallMetric.id)).where(
                    CallMetric.ts >= since, CallMetric.completed.is_(True)
                )
            ).scalar() or 0
            if total_calls > 10:
                completion = completed_calls / total_calls * 100
                if completion < 90:
                    tips.append({
                        "priority": "high",
                        "area": "completion",
                        "tip": f"Call completion is {completion:.0f}% — many calls are dropping. Check VAD sensitivity and network quality.",
                    })

    except Exception as exc:
        logger.warning("coaching_tips failed: %s", exc)

    if not tips:
        tips.append({
            "priority": "info",
            "area": "general",
            "tip": "All metrics look healthy! Keep monitoring the Quality Dashboard for trends.",
        })

    return {"days": days, "method": "rules_based", "tips": tips}
