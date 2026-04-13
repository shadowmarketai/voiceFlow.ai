"""
Call Processing Service
========================
Bridges telephony providers and the voice analysis pipeline.

When a call completes:
1. Download the recording from the telephony provider
2. Run voice analysis (ASR, emotion, intent, lead scoring)
3. Persist results to voice_analyses table
4. Link analysis to CRM lead (if phone matches)
5. Update lead score and status in CRM
"""

import asyncio
import logging
import os
import tempfile
import uuid
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.models.voice import VoiceAnalysis, EmotionType, IntentType, DialectType
from api.models.crm import Lead, LeadStatus

logger = logging.getLogger(__name__)


def _map_enum(value: Optional[str], enum_class, default=None):
    """Safely map a string value to an enum member."""
    if not value:
        return default
    try:
        return enum_class(value)
    except (ValueError, KeyError):
        return default


async def download_recording(recording_url: str, timeout: int = 60) -> Optional[bytes]:
    """Download a call recording from the telephony provider URL."""
    if not recording_url:
        return None
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(recording_url)
            resp.raise_for_status()
            if len(resp.content) == 0:
                logger.warning("Downloaded recording is empty: %s", recording_url)
                return None
            logger.info("Downloaded recording: %d bytes from %s", len(resp.content), recording_url)
            return resp.content
    except Exception as exc:
        logger.error("Failed to download recording from %s: %s", recording_url, exc)
        return None


async def run_voice_analysis(
    audio_bytes: bytes,
    voice_engine,
    language: Optional[str] = None,
) -> Optional[dict]:
    """Run voice analysis pipeline on audio bytes. Returns result dict."""
    if voice_engine is None:
        logger.warning("Voice engine not available, skipping analysis")
        return None

    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: voice_engine.process_audio(audio_path=tmp_path, language=language),
        )
        return {
            "transcription": result.transcription,
            "language": result.language,
            "dialect": result.dialect.value if hasattr(result.dialect, "value") else str(result.dialect),
            "confidence": result.confidence,
            "emotion": result.emotion.value if hasattr(result.emotion, "value") else str(result.emotion),
            "emotion_confidence": result.emotion_confidence,
            "emotion_scores": result.emotion_scores,
            "gen_z_score": result.gen_z_score,
            "slang_detected": result.slang_detected,
            "is_code_mixed": result.code_mixing.get("is_code_mixed", False),
            "languages_detected": result.code_mixing.get("languages", {}),
            "intent": result.intent.value if hasattr(result.intent, "value") else str(result.intent),
            "intent_confidence": result.intent_confidence,
            "lead_score": result.lead_score,
            "sentiment": result.sentiment,
            "keywords": result.keywords,
            "processing_time_ms": result.processing_time_ms,
            "audio_duration_s": result.audio_duration_s,
        }
    except Exception as exc:
        logger.error("Voice analysis failed: %s", exc)
        return None
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def persist_call_analysis(
    db: Session,
    analysis_result: dict,
    user_id: Optional[int],
    phone_number: Optional[str] = None,
    recording_url: Optional[str] = None,
    call_direction: Optional[str] = None,
    source: str = "telephony",
    provider_call_id: Optional[str] = None,
    lead_id: Optional[int] = None,
) -> VoiceAnalysis:
    """Persist voice analysis result from a call to the database."""
    request_id = str(uuid.uuid4())

    record = VoiceAnalysis(
        request_id=request_id,
        transcription=analysis_result.get("transcription"),
        language=analysis_result.get("language"),
        dialect=_map_enum(analysis_result.get("dialect"), DialectType, DialectType.UNKNOWN),
        confidence=analysis_result.get("confidence"),
        emotion=_map_enum(analysis_result.get("emotion"), EmotionType, EmotionType.NEUTRAL),
        emotion_confidence=analysis_result.get("emotion_confidence"),
        emotion_scores=analysis_result.get("emotion_scores"),
        gen_z_score=analysis_result.get("gen_z_score", 0.0),
        slang_detected=analysis_result.get("slang_detected"),
        is_code_mixed=analysis_result.get("is_code_mixed", False),
        languages_detected=analysis_result.get("languages_detected"),
        intent=_map_enum(analysis_result.get("intent"), IntentType, IntentType.INQUIRY),
        intent_confidence=analysis_result.get("intent_confidence"),
        lead_score=analysis_result.get("lead_score", 0.0),
        sentiment=analysis_result.get("sentiment", 0.0),
        keywords=analysis_result.get("keywords"),
        processing_time_ms=analysis_result.get("processing_time_ms"),
        audio_duration_seconds=analysis_result.get("audio_duration_s"),
        audio_url=recording_url,
        source=source,
        phone_number=phone_number,
        call_direction=call_direction,
        session_id=provider_call_id,
        user_id=user_id,
        lead_id=lead_id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    logger.info("Call analysis persisted: id=%s, phone=%s", record.id, phone_number)
    return record


def find_lead_by_phone(db: Session, user_id: int, phone: str) -> Optional[Lead]:
    """Find a CRM lead by phone number for a given user."""
    if not phone:
        return None
    # Normalize: strip +91, 0-prefix to get 10-digit
    clean = phone.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if clean.startswith("+91"):
        clean = clean[3:]
    elif clean.startswith("91") and len(clean) == 12:
        clean = clean[2:]
    elif clean.startswith("0") and len(clean) == 11:
        clean = clean[1:]

    stmt = select(Lead).where(Lead.user_id == user_id, Lead.phone == clean)
    return db.execute(stmt).scalar_one_or_none()


def update_lead_from_analysis(
    db: Session,
    lead: Lead,
    analysis: VoiceAnalysis,
) -> None:
    """Update CRM lead with voice analysis data (lead score, status)."""
    # Update lead score if voice score is higher
    voice_score = analysis.lead_score or 0.0
    if voice_score > (lead.lead_score or 0):
        lead.lead_score = voice_score

    # Auto-qualify leads with high scores and purchase intent
    if voice_score >= 70 and analysis.intent == IntentType.PURCHASE:
        if lead.status in (LeadStatus.NEW, LeadStatus.CONTACTED):
            lead.status = LeadStatus.QUALIFIED

    # Mark as contacted if still new
    if lead.status == LeadStatus.NEW:
        lead.status = LeadStatus.CONTACTED

    db.commit()
    logger.info("Lead %s updated: score=%.1f, status=%s", lead.id, lead.lead_score, lead.status.value)


async def process_call_recording(
    db: Session,
    voice_engine,
    recording_url: str,
    phone_number: Optional[str] = None,
    call_direction: Optional[str] = None,
    provider: Optional[str] = None,
    provider_call_id: Optional[str] = None,
    user_id: Optional[int] = None,
    duration_seconds: int = 0,
) -> Optional[dict]:
    """
    Full call processing pipeline:
    1. Download recording
    2. Run voice analysis
    3. Persist to DB
    4. Link to CRM lead
    5. Update lead score/status

    Returns dict with analysis_id, lead_id (if found), and analysis summary.
    """
    # 1. Download recording
    audio_bytes = await download_recording(recording_url)
    if not audio_bytes:
        logger.warning("No recording to process for call %s", provider_call_id)
        return None

    # 2. Run voice analysis
    analysis_result = await run_voice_analysis(audio_bytes, voice_engine)
    if not analysis_result:
        logger.warning("Voice analysis returned no results for call %s", provider_call_id)
        return None

    # 3. Find linked CRM lead
    lead = find_lead_by_phone(db, user_id, phone_number) if user_id and phone_number else None

    # 4. Persist analysis
    record = persist_call_analysis(
        db=db,
        analysis_result=analysis_result,
        user_id=user_id,
        phone_number=phone_number,
        recording_url=recording_url,
        call_direction=call_direction,
        source=f"telephony_{provider}" if provider else "telephony",
        provider_call_id=provider_call_id,
        lead_id=lead.id if lead else None,
    )

    # 5. Update CRM lead
    if lead:
        update_lead_from_analysis(db, lead, record)

    return {
        "analysis_id": record.id,
        "request_id": record.request_id,
        "lead_id": lead.id if lead else None,
        "lead_updated": lead is not None,
        "transcription": record.transcription,
        "emotion": record.emotion.value if record.emotion else None,
        "intent": record.intent.value if record.intent else None,
        "lead_score": record.lead_score,
        "duration_seconds": duration_seconds,
    }
