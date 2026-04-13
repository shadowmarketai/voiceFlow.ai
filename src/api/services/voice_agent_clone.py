"""
VoiceFlow Marketing AI - Voice Clone Service
==============================================
Adapted from livekit-voice-agent/voice_clone.py for main backend integration.
Handles voice cloning via VoiceFlow TTS API.
"""

import base64
import io
import logging
import os
import uuid
import wave
from typing import Optional

import aiohttp
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.voice_agent import ClonedVoice
from api.config import settings

logger = logging.getLogger(__name__)

VOICEFLOW_API_URL = os.getenv("VOICEFLOW_API_URL", "http://localhost:8000")

MIN_REFERENCE_DURATION = 5.0
MAX_REFERENCE_DURATION = 60.0
MAX_REFERENCE_SIZE_MB = 20


def validate_reference_audio(audio_bytes: bytes) -> dict:
    """Validate reference audio for voice cloning."""
    if len(audio_bytes) > MAX_REFERENCE_SIZE_MB * 1024 * 1024:
        raise ValueError(f"Audio file too large (max {MAX_REFERENCE_SIZE_MB}MB)")

    try:
        with io.BytesIO(audio_bytes) as buf:
            with wave.open(buf, "rb") as wf:
                frames = wf.getnframes()
                rate = wf.getframerate()
                channels = wf.getnchannels()
                duration = frames / float(rate)
    except wave.Error:
        raise ValueError("Invalid WAV file. Please upload a valid WAV audio file.")

    if duration < MIN_REFERENCE_DURATION:
        raise ValueError(
            f"Audio too short ({duration:.1f}s). Minimum {MIN_REFERENCE_DURATION}s required."
        )
    if duration > MAX_REFERENCE_DURATION:
        raise ValueError(
            f"Audio too long ({duration:.1f}s). Maximum {MAX_REFERENCE_DURATION}s."
        )

    return {
        "duration_seconds": duration,
        "sample_rate": rate,
        "channels": channels,
        "format": "wav",
    }


async def clone_voice(
    db: AsyncSession,
    *,
    tenant_id: str,
    name: str,
    person_name: str,
    audio_bytes: bytes,
    language: str = "en",
    tts_engine: str = "indicf5",
) -> ClonedVoice:
    """Clone a marketing person's voice and store in DB."""
    audio_info = validate_reference_audio(audio_bytes)

    voices_dir = settings.VOICES_DIR
    os.makedirs(voices_dir, exist_ok=True)
    voice_dir = os.path.join(voices_dir, f"voice_{uuid.uuid4().hex[:12]}")
    os.makedirs(voice_dir, exist_ok=True)
    ref_path = os.path.join(voice_dir, "reference.wav")
    with open(ref_path, "wb") as f:
        f.write(audio_bytes)

    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
    internal_voice_id = None
    status = "processing"

    try:
        async with aiohttp.ClientSession() as http:
            resp = await http.post(
                f"{VOICEFLOW_API_URL}/api/v1/tts/clone",
                json={
                    "name": name,
                    "reference_audio_base64": audio_b64,
                    "engine": tts_engine,
                    "language": language,
                },
                timeout=aiohttp.ClientTimeout(total=60),
            )
            if resp.status == 200:
                data = await resp.json()
                internal_voice_id = data.get("voice_id")
                status = "ready"
                logger.info("Voice cloned successfully: %s", internal_voice_id)
            else:
                body = await resp.text()
                logger.error("Voice clone API returned %d: %s", resp.status, body[:200])
                status = "failed"
    except Exception as exc:
        logger.error("Voice clone API call failed: %s", exc)
        status = "failed"

    voice = ClonedVoice(
        tenant_id=tenant_id,
        name=name,
        person_name=person_name,
        reference_audio_path=ref_path,
        reference_duration_seconds=audio_info["duration_seconds"],
        tts_engine=tts_engine,
        internal_voice_id=internal_voice_id,
        language=language,
        status=status,
        is_active=status == "ready",
    )
    db.add(voice)
    await db.flush()
    await db.refresh(voice)
    return voice


async def list_voices(
    db: AsyncSession,
    tenant_id: str,
    active_only: bool = True,
) -> list[ClonedVoice]:
    """List all cloned voices for a tenant."""
    stmt = select(ClonedVoice).where(ClonedVoice.tenant_id == tenant_id)
    if active_only:
        stmt = stmt.where(ClonedVoice.is_active == True)  # noqa: E712
    stmt = stmt.order_by(ClonedVoice.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_voice(db: AsyncSession, voice_id: int) -> Optional[ClonedVoice]:
    """Get a specific cloned voice by ID."""
    return await db.get(ClonedVoice, voice_id)


async def delete_voice(db: AsyncSession, voice_id: int) -> bool:
    """Soft-delete a cloned voice (mark inactive)."""
    voice = await db.get(ClonedVoice, voice_id)
    if voice is None:
        return False
    voice.is_active = False
    voice.status = "deleted"
    return True


async def test_voice(
    voice_id: int,
    test_text: str = "Hello, this is a test of the cloned voice.",
    db: AsyncSession = None,
) -> Optional[bytes]:
    """Generate a sample audio clip using the cloned voice."""
    voice = await db.get(ClonedVoice, voice_id) if db else None
    if voice is None or voice.status != "ready":
        return None

    try:
        async with aiohttp.ClientSession() as http:
            resp = await http.post(
                f"{VOICEFLOW_API_URL}/api/v1/tts/synthesize",
                json={
                    "text": test_text,
                    "voice_id": voice.internal_voice_id,
                    "engine": voice.tts_engine,
                    "language": voice.language,
                },
                timeout=aiohttp.ClientTimeout(total=30),
            )
            if resp.status == 200:
                data = await resp.json()
                return base64.b64decode(data.get("audio_base64", ""))
    except Exception as exc:
        logger.error("Voice test synthesis failed: %s", exc)
    return None
