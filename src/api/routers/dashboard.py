"""
Dashboard API — real-time stats from call_logs DB.
"""

import logging
from datetime import datetime, timedelta, UTC

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, case, extract
from sqlalchemy.orm import Session

from api.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/dashboard", tags=["Dashboard"])


def _get_call_log_model():
    from api.models.voice_agent_db import CallLog
    return CallLog


def _get_agent_model():
    from api.models.voice_agent_db import VoiceAgent
    return VoiceAgent


# ── Dashboard Summary Stats ─────────────────────────────────

@router.get("/stats")
async def dashboard_stats(db: Session = Depends(get_db)):
    """Get real-time dashboard stats from call_logs table."""
    CallLog = _get_call_log_model()
    VoiceAgent = _get_agent_model()

    now = datetime.now(UTC)
    week_ago = now - timedelta(days=7)

    # Total conversations (all time)
    total_calls = db.execute(
        select(func.count()).select_from(CallLog)
    ).scalar() or 0

    # This week's calls
    week_calls = db.execute(
        select(func.count()).select_from(CallLog)
        .where(CallLog.started_at >= week_ago)
    ).scalar() or 0

    # Previous week for trend
    two_weeks_ago = now - timedelta(days=14)
    prev_week_calls = db.execute(
        select(func.count()).select_from(CallLog)
        .where(CallLog.started_at >= two_weeks_ago, CallLog.started_at < week_ago)
    ).scalar() or 0

    trend_pct = 0.0
    if prev_week_calls > 0:
        trend_pct = round(((week_calls - prev_week_calls) / prev_week_calls) * 100, 1)

    # Total minutes used
    total_minutes = db.execute(
        select(func.sum(CallLog.duration_sec)).select_from(CallLog)
    ).scalar() or 0
    total_minutes = round(total_minutes / 60, 0)

    # Active agents (agents with calls in last 24h)
    day_ago = now - timedelta(hours=24)
    active_agents = db.execute(
        select(func.count(func.distinct(CallLog.agent_id))).select_from(CallLog)
        .where(CallLog.started_at >= day_ago, CallLog.agent_id.isnot(None))
    ).scalar() or 0

    # Total agents
    try:
        total_agents = db.execute(
            select(func.count()).select_from(VoiceAgent)
        ).scalar() or 0
    except Exception:
        total_agents = active_agents or 1

    # Average sentiment score (positive=5, neutral=3, negative=1)
    sentiment_rows = db.execute(
        select(CallLog.sentiment, func.count())
        .group_by(CallLog.sentiment)
    ).all()
    sentiment_map = {'positive': 5.0, 'neutral': 3.0, 'negative': 1.0}
    total_s = sum(cnt for _, cnt in sentiment_rows)
    if total_s > 0:
        weighted = sum(sentiment_map.get(s or 'neutral', 3.0) * cnt for s, cnt in sentiment_rows)
        satisfaction = round(weighted / total_s, 1)
    else:
        satisfaction = 0.0

    return {
        "total_conversations": total_calls,
        "week_conversations": week_calls,
        "trend_pct": trend_pct,
        "active_agents": active_agents,
        "total_agents": total_agents,
        "total_minutes": int(total_minutes),
        "satisfaction_score": satisfaction,
    }


# ── Recent Activity (for Real-Time Activity feed) ───────────

@router.get("/recent-activity")
async def recent_activity(limit: int = 10, db: Session = Depends(get_db)):
    """Get most recent call logs for the real-time activity feed."""
    CallLog = _get_call_log_model()

    rows = db.execute(
        select(CallLog)
        .order_by(CallLog.started_at.desc())
        .limit(limit)
    ).scalars().all()

    # Build agent name lookup
    agent_names = {}
    try:
        VoiceAgent = _get_agent_model()
        agents = db.execute(select(VoiceAgent)).scalars().all()
        for a in agents:
            agent_names[a.id] = a.name
    except Exception:
        pass

    calls = []
    for r in rows:
        duration_sec = r.duration_sec or 0
        mins = int(duration_sec // 60)
        secs = int(duration_sec % 60)

        # Determine status
        status = "COMPLETED"
        if r.ended_at is None:
            status = "ACTIVE"
        elif r.outcome and "fail" in (r.outcome or "").lower():
            status = "FAILED"

        calls.append({
            "id": r.id,
            "phone": r.from_addr or r.to_addr or "Unknown",
            "agent": agent_names.get(r.agent_id, r.agent_id or "AI Agent"),
            "agent_id": r.agent_id,
            "duration": f"{mins}:{secs:02d}",
            "duration_sec": duration_sec,
            "status": status,
            "language": (r.meta or {}).get("language", "en"),
            "emotion": r.emotion or "neutral",
            "sentiment": r.sentiment or "neutral",
            "direction": r.direction or "test",
            "channel": r.channel or "testing_playground",
            "started_at": r.started_at.isoformat() + "Z" if r.started_at else None,
            "transcript_preview": (r.transcript or "")[:100],
        })

    return {"calls": calls, "total": len(calls)}


# ── Hourly Volume (for chart) ───────────────────────────────

@router.get("/hourly-volume")
async def hourly_volume(db: Session = Depends(get_db)):
    """Get call volume by hour for today (for the chart)."""
    CallLog = _get_call_log_model()

    now = datetime.now(UTC)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    rows = db.execute(
        select(
            extract('hour', CallLog.started_at).label('hour'),
            func.count().label('calls'),
        )
        .where(CallLog.started_at >= today_start)
        .group_by('hour')
        .order_by('hour')
    ).all()

    # Build 24-hour array
    hourly = {}
    for hour, count in rows:
        hourly[int(hour)] = count

    result = []
    for h in range(24):
        label = f"{h}:00" if h >= 10 else f"0{h}:00"
        if h == 0:
            label = "12AM"
        elif h < 12:
            label = f"{h}AM"
        elif h == 12:
            label = "12PM"
        else:
            label = f"{h-12}PM"
        result.append({"hour": label, "calls": hourly.get(h, 0)})

    return {"data": result, "date": today_start.strftime("%Y-%m-%d")}


# ── Live Calls (active, not ended) ──────────────────────────

@router.get("/live")
async def live_calls(db: Session = Depends(get_db)):
    """Get currently active calls (ended_at is NULL or recent)."""
    CallLog = _get_call_log_model()

    # Active = ended_at is NULL, or ended within last 30 seconds
    now = datetime.now(UTC)
    recent_threshold = now - timedelta(seconds=30)

    rows = db.execute(
        select(CallLog)
        .where(
            (CallLog.ended_at.is_(None)) |
            (CallLog.ended_at >= recent_threshold)
        )
        .order_by(CallLog.started_at.desc())
        .limit(20)
    ).scalars().all()

    # Agent name lookup
    agent_names = {}
    try:
        VoiceAgent = _get_agent_model()
        agents = db.execute(select(VoiceAgent)).scalars().all()
        for a in agents:
            agent_names[a.id] = a.name
    except Exception:
        pass

    calls = []
    for r in rows:
        duration_sec = r.duration_sec or 0
        if r.ended_at is None and r.started_at:
            duration_sec = (now - r.started_at.replace(tzinfo=UTC if r.started_at.tzinfo is None else r.started_at.tzinfo)).total_seconds()
        mins = int(duration_sec // 60)
        secs = int(duration_sec % 60)

        calls.append({
            "id": r.id,
            "phone": r.from_addr or r.to_addr or "Unknown",
            "agent": agent_names.get(r.agent_id, r.agent_id or "AI Agent"),
            "agent_id": r.agent_id,
            "duration": f"{mins}:{secs:02d}",
            "duration_sec": duration_sec,
            "status": "active" if r.ended_at is None else "completed",
            "language": (r.meta or {}).get("language", "en"),
            "emotion": r.emotion or "neutral",
            "sentiment": r.sentiment or "neutral",
            "direction": r.direction or "test",
            "started_at": r.started_at.isoformat() + "Z" if r.started_at else None,
            "transcript_preview": (r.transcript or "")[:100],
        })

    return {"calls": calls, "active_count": sum(1 for c in calls if c["status"] == "active")}
