"""
VoiceFlow Marketing AI - Call Recording Service
=================================================
Adapted from livekit-voice-agent/recordings.py for main backend integration.
Handles saving, retrieving, and analyzing call recordings.
"""

import base64
import logging
import os
from datetime import datetime
from typing import Optional

import aiohttp
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.voice_agent import CallRecording
from api.config import settings

logger = logging.getLogger(__name__)

VOICEFLOW_API_URL = os.getenv("VOICEFLOW_API_URL", "http://localhost:8000")
MAX_BLOB_SIZE = 5 * 1024 * 1024  # 5MB


async def save_recording(
    db: AsyncSession,
    *,
    call_id: str,
    caller_number: str,
    audio_bytes: bytes | None = None,
    transcript: str = "",
    transcript_json: list[dict] | None = None,
    duration_seconds: float = 0.0,
    agent_voice_id: str | None = None,
    sip_provider: str = "telecmi",
    tenant_id: str | None = None,
    started_at: datetime | None = None,
    ended_at: datetime | None = None,
    audio_format: str = "wav",
    sample_rate: int = 16000,
) -> CallRecording:
    """Save a call recording to disk and database."""
    recording_path = None
    recording_size = 0
    blob = None

    if audio_bytes:
        recordings_dir = settings.RECORDINGS_DIR
        os.makedirs(recordings_dir, exist_ok=True)
        filename = f"{call_id}.{audio_format}"
        recording_path = os.path.join(recordings_dir, filename)
        with open(recording_path, "wb") as f:
            f.write(audio_bytes)
        recording_size = len(audio_bytes)
        if recording_size <= MAX_BLOB_SIZE:
            blob = audio_bytes
        logger.info(
            "Recording saved: %s (%d bytes, %.1fs)",
            recording_path, recording_size, duration_seconds,
        )

    recording = CallRecording(
        call_id=call_id,
        caller_number=caller_number,
        agent_voice_id=agent_voice_id,
        sip_provider=sip_provider,
        recording_path=recording_path,
        recording_blob=blob,
        recording_size_bytes=recording_size,
        audio_format=audio_format,
        duration_seconds=duration_seconds,
        sample_rate=sample_rate,
        full_transcript=transcript,
        transcript_json=transcript_json,
        tenant_id=tenant_id,
        started_at=started_at,
        ended_at=ended_at,
    )
    db.add(recording)
    await db.flush()
    await db.refresh(recording)
    return recording


async def analyze_recording(
    db: AsyncSession,
    recording_id: int,
) -> CallRecording | None:
    """Run voice analysis on a stored recording via VoiceFlow backend."""
    recording = await db.get(CallRecording, recording_id)
    if recording is None:
        return None

    audio_bytes = None
    if recording.recording_path and os.path.exists(recording.recording_path):
        with open(recording.recording_path, "rb") as f:
            audio_bytes = f.read()
    elif recording.recording_blob:
        audio_bytes = recording.recording_blob

    if not audio_bytes:
        logger.warning("No audio data for recording %d", recording_id)
        return recording

    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
    try:
        async with aiohttp.ClientSession() as http:
            resp = await http.post(
                f"{VOICEFLOW_API_URL}/api/v1/voice/process",
                json={
                    "audio_base64": audio_b64,
                    "language": "en",
                    "analyze_emotion": True,
                    "analyze_intent": True,
                    "calculate_lead_score": True,
                },
                timeout=aiohttp.ClientTimeout(total=60),
            )
            if resp.status == 200:
                data = await resp.json()
                recording.caller_emotion = data.get("emotion", {}).get("primary")
                recording.caller_intent = data.get("intent", {}).get("primary")
                recording.caller_sentiment = data.get("sentiment", {}).get("score")
                recording.lead_score = data.get("lead_score")
                logger.info(
                    "Analysis complete for recording %d: emotion=%s, intent=%s",
                    recording_id,
                    recording.caller_emotion,
                    recording.caller_intent,
                )
            else:
                body = await resp.text()
                logger.error("Voice analysis API returned %d: %s", resp.status, body[:200])
    except Exception as exc:
        logger.error("Voice analysis failed for recording %d: %s", recording_id, exc)

    await db.flush()
    await db.refresh(recording)
    return recording


async def get_recording(db: AsyncSession, recording_id: int) -> Optional[CallRecording]:
    """Get a recording by ID."""
    return await db.get(CallRecording, recording_id)


async def list_recordings(
    db: AsyncSession,
    tenant_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[CallRecording]:
    """List recordings, optionally filtered by tenant."""
    stmt = select(CallRecording)
    if tenant_id:
        stmt = stmt.where(CallRecording.tenant_id == tenant_id)
    stmt = stmt.order_by(CallRecording.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_recording_audio(
    db: AsyncSession,
    recording_id: int,
) -> tuple[bytes | None, str]:
    """Get audio bytes for a recording. Tries disk first, then DB blob."""
    recording = await db.get(CallRecording, recording_id)
    if recording is None:
        return None, ""

    content_type = f"audio/{recording.audio_format}"

    if recording.recording_path and os.path.exists(recording.recording_path):
        with open(recording.recording_path, "rb") as f:
            return f.read(), content_type

    if recording.recording_blob:
        return recording.recording_blob, content_type

    return None, ""


async def get_recording_stats(
    db: AsyncSession,
    tenant_id: str | None = None,
) -> dict:
    """Get aggregate stats for recordings."""
    base = select(
        func.count(CallRecording.id).label("total_calls"),
        func.sum(CallRecording.duration_seconds).label("total_duration"),
        func.avg(CallRecording.duration_seconds).label("avg_duration"),
        func.avg(CallRecording.lead_score).label("avg_lead_score"),
        func.sum(CallRecording.recording_size_bytes).label("total_storage_bytes"),
    )
    if tenant_id:
        base = base.where(CallRecording.tenant_id == tenant_id)

    result = await db.execute(base)
    row = result.one()

    emotion_stmt = select(
        CallRecording.caller_emotion,
        func.count(CallRecording.id),
    ).where(
        CallRecording.caller_emotion.isnot(None)
    ).group_by(CallRecording.caller_emotion)
    if tenant_id:
        emotion_stmt = emotion_stmt.where(CallRecording.tenant_id == tenant_id)
    emotion_result = await db.execute(emotion_stmt)
    emotions = {e: c for e, c in emotion_result.all()}

    return {
        "total_calls": row.total_calls or 0,
        "total_duration_seconds": float(row.total_duration or 0),
        "avg_duration_seconds": float(row.avg_duration or 0),
        "avg_lead_score": float(row.avg_lead_score or 0),
        "total_storage_bytes": int(row.total_storage_bytes or 0),
        "emotion_distribution": emotions,
    }
