"""
VoiceFlow Marketing AI - Voice AI Router
==========================================
Endpoints for voice processing, analysis retrieval, and aggregated stats.

Wraps the existing VoiceFlowEngine and VoiceAIService with proper
authentication, schemas, and database persistence.

API prefix: /api/v1/voice
Tags: Voice AI
"""

import asyncio
import logging
import os
import tempfile
import time
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from api.database import get_db
from api.permissions import require_permission
from api.models.voice import VoiceAnalysis, EmotionType, IntentType, DialectType
from api.schemas.common import PaginatedResponse
from api.schemas.voice import (
    VoiceAnalysisResponse,
    VoiceProcessRequest,
    VoiceProcessResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/voice", tags=["Voice AI"])


# ── Helpers ──────────────────────────────────────────────────────────


def _get_user_id(current_user: dict) -> Optional[int]:
    """Extract integer user_id from the current user dict."""
    raw = current_user.get("id", "")
    if isinstance(raw, int):
        return raw
    try:
        return int(raw)
    except (ValueError, TypeError):
        return 1


def _get_orm_db(conn) -> Session:
    """Ensure we have an ORM Session regardless of legacy/modern get_db."""
    if isinstance(conn, Session):
        return conn
    from api.database import get_session_factory
    return get_session_factory()()


def _get_voice_engine(request: Request):
    """Get the VoiceFlowEngine from app state (loaded at startup)."""
    engine = getattr(request.app.state, "voice_engine", None)
    if engine is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Voice engine not available. Check server startup logs.",
        )
    return engine


def _serialize_enum(val) -> Optional[str]:
    if val is None:
        return None
    if hasattr(val, "value"):
        return val.value
    return str(val)


def _serialize_datetime(dt) -> Optional[str]:
    if dt is None:
        return None
    return dt.isoformat()


def _analysis_to_dict(a: VoiceAnalysis) -> dict:
    """Convert a VoiceAnalysis ORM record to a response-compatible dict."""
    return {
        "id": a.id,
        "request_id": a.request_id,
        "transcription": a.transcription,
        "language": a.language,
        "dialect": _serialize_enum(a.dialect),
        "confidence": a.confidence,
        "emotion": _serialize_enum(a.emotion),
        "emotion_confidence": a.emotion_confidence,
        "emotion_scores": a.emotion_scores,
        "gen_z_score": a.gen_z_score or 0.0,
        "is_code_mixed": a.is_code_mixed or False,
        "languages_detected": a.languages_detected,
        "intent": _serialize_enum(a.intent),
        "intent_confidence": a.intent_confidence,
        "lead_score": a.lead_score or 0.0,
        "sentiment": a.sentiment or 0.0,
        "keywords": a.keywords,
        "source": a.source,
        "phone_number": a.phone_number,
        "processing_time_ms": a.processing_time_ms,
        "audio_duration_seconds": a.audio_duration_seconds,
        "created_at": _serialize_datetime(a.created_at),
    }


def _persist_analysis(
    db: Session,
    result_dict: dict,
    request_id: str,
    user_id: Optional[int],
    source: str = "api",
    phone_number: Optional[str] = None,
    audio_duration_s: Optional[float] = None,
) -> VoiceAnalysis:
    """Persist a voice analysis result to the database."""
    # Map emotion string to enum
    emotion_val = None
    if result_dict.get("emotion"):
        try:
            emotion_val = EmotionType(result_dict["emotion"])
        except ValueError:
            emotion_val = EmotionType.NEUTRAL

    # Map intent string to enum
    intent_val = None
    if result_dict.get("intent"):
        try:
            intent_val = IntentType(result_dict["intent"])
        except ValueError:
            intent_val = IntentType.INQUIRY

    # Map dialect string to enum
    dialect_val = None
    if result_dict.get("dialect"):
        try:
            dialect_val = DialectType(result_dict["dialect"])
        except ValueError:
            dialect_val = DialectType.UNKNOWN

    analysis = VoiceAnalysis(
        request_id=request_id,
        transcription=result_dict.get("transcription"),
        language=result_dict.get("language"),
        dialect=dialect_val,
        confidence=result_dict.get("confidence"),
        emotion=emotion_val,
        emotion_confidence=result_dict.get("emotion_confidence"),
        emotion_scores=result_dict.get("emotion_scores"),
        gen_z_score=result_dict.get("gen_z_score", 0.0),
        is_code_mixed=result_dict.get("is_code_mixed", False),
        languages_detected=result_dict.get("languages_detected"),
        intent=intent_val,
        intent_confidence=result_dict.get("intent_confidence"),
        lead_score=result_dict.get("lead_score", 0.0),
        sentiment=result_dict.get("sentiment", 0.0),
        keywords=result_dict.get("keywords"),
        processing_time_ms=result_dict.get("processing_time_ms"),
        audio_duration_seconds=audio_duration_s or result_dict.get("audio_duration_s"),
        source=source,
        phone_number=phone_number,
        user_id=user_id,
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    logger.info("Voice analysis persisted: id=%s, request_id=%s", analysis.id, request_id)
    return analysis


# =====================================================================
# PROCESS AUDIO (file upload)
# =====================================================================


@router.post(
    "/process",
    response_model=VoiceProcessResponse,
    summary="Process uploaded audio file",
)
async def process_audio(
    request: Request,
    file: UploadFile = File(..., description="Audio file (WAV, MP3, OGG)"),
    language: Optional[str] = None,
    enable_emotion: bool = True,
    enable_intent: bool = True,
    current_user: dict = Depends(require_permission("voiceAI", "create")),
    db: Session = Depends(get_db),
):
    """
    Upload an audio file for full voice analysis: transcription, emotion
    detection, dialect identification, Gen Z slang detection, marketing
    intent classification, and lead scoring.

    Results are persisted to the voice_analyses table.
    """
    engine = _get_voice_engine(request)
    session = _get_orm_db(db)
    user_id = _get_user_id(current_user)
    request_id = str(uuid.uuid4())

    # Read and save to temp file
    audio_bytes = await file.read()
    if len(audio_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty audio file",
        )

    # Limit file size to 50 MB
    if len(audio_bytes) > 50 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio file too large (max 50 MB)",
        )

    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: engine.process_audio(audio_path=tmp_path, language=language),
        )
    except Exception as exc:
        logger.error("Voice processing failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Voice processing failed: {exc}",
        )
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    # Build response dict
    response_data = {
        "request_id": request_id,
        "status": "completed",
        "transcription": result.transcription,
        "language": result.language,
        "dialect": result.dialect.value,
        "confidence": result.confidence,
        "emotion": result.emotion.value,
        "emotion_confidence": result.emotion_confidence,
        "emotion_scores": result.emotion_scores,
        "gen_z_score": result.gen_z_score,
        "slang_detected": result.slang_detected,
        "is_code_mixed": result.code_mixing.get("is_code_mixed", False),
        "languages_detected": result.code_mixing.get("languages", {}),
        "intent": result.intent.value,
        "intent_confidence": result.intent_confidence,
        "lead_score": result.lead_score,
        "sentiment": result.sentiment,
        "keywords": result.keywords,
        "processing_time_ms": result.processing_time_ms,
        "audio_duration_s": result.audio_duration_s,
        "timestamp": str(time.time()),
    }

    # Persist to DB
    try:
        _persist_analysis(
            db=session,
            result_dict=response_data,
            request_id=request_id,
            user_id=user_id,
            source="upload",
            audio_duration_s=result.audio_duration_s,
        )
    except Exception as exc:
        logger.warning("Failed to persist voice analysis: %s", exc)

    return VoiceProcessResponse(**response_data)


# =====================================================================
# PROCESS AUDIO FROM URL
# =====================================================================


@router.post(
    "/process-url",
    response_model=VoiceProcessResponse,
    summary="Process audio from URL",
)
async def process_audio_url(
    request: Request,
    body: VoiceProcessRequest,
    current_user: dict = Depends(require_permission("voiceAI", "create")),
    db: Session = Depends(get_db),
):
    """
    Process audio from a remote URL. Downloads the audio, then runs the
    full voice analysis pipeline.
    """
    if not body.audio_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="audio_url is required",
        )

    engine = _get_voice_engine(request)
    session = _get_orm_db(db)
    user_id = _get_user_id(current_user)
    request_id = str(uuid.uuid4())

    # Download audio
    try:
        import httpx
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(body.audio_url)
            resp.raise_for_status()
            audio_bytes = resp.content
    except Exception as exc:
        logger.error("Failed to download audio from URL: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to download audio: {exc}",
        )

    if len(audio_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Downloaded audio is empty",
        )

    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: engine.process_audio(audio_path=tmp_path, language=body.language),
        )
    except Exception as exc:
        logger.error("Voice processing failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Voice processing failed: {exc}",
        )
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    response_data = {
        "request_id": request_id,
        "status": "completed",
        "transcription": result.transcription,
        "language": result.language,
        "dialect": result.dialect.value,
        "confidence": result.confidence,
        "emotion": result.emotion.value,
        "emotion_confidence": result.emotion_confidence,
        "emotion_scores": result.emotion_scores,
        "gen_z_score": result.gen_z_score,
        "slang_detected": result.slang_detected,
        "is_code_mixed": result.code_mixing.get("is_code_mixed", False),
        "languages_detected": result.code_mixing.get("languages", {}),
        "intent": result.intent.value,
        "intent_confidence": result.intent_confidence,
        "lead_score": result.lead_score,
        "sentiment": result.sentiment,
        "keywords": result.keywords,
        "processing_time_ms": result.processing_time_ms,
        "audio_duration_s": result.audio_duration_s,
        "timestamp": str(time.time()),
    }

    # Persist to DB
    try:
        _persist_analysis(
            db=session,
            result_dict=response_data,
            request_id=request_id,
            user_id=user_id,
            source="url",
            audio_duration_s=result.audio_duration_s,
        )
    except Exception as exc:
        logger.warning("Failed to persist voice analysis: %s", exc)

    return VoiceProcessResponse(**response_data)


# =====================================================================
# VOICE RESPOND (STT -> LLM -> TTS)
# =====================================================================


@router.post(
    "/respond",
    summary="Full voice conversation turn: STT -> LLM -> TTS",
)
async def voice_respond(
    request: Request,
    file: UploadFile = File(..., description="Audio file from customer"),
    language: Optional[str] = None,
    system_prompt: str = "You are a helpful sales assistant. Keep responses under 40 words.",
    llm_provider: str = "groq",
    tts_language: str = "en",
    voice_id: Optional[str] = None,
    current_user: dict = Depends(require_permission("voiceAI", "create")),
    db: Session = Depends(get_db),
):
    """
    Full voice conversation turn: upload customer audio, get AI voice response.

    Pipeline: ASR (Whisper) -> Analysis -> LLM (Groq/Claude) -> TTS
    """
    session = _get_orm_db(db)
    user_id = _get_user_id(current_user)

    audio_bytes = await file.read()
    if len(audio_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty audio file",
        )

    try:
        from voice_engine.voice_ai_service import get_voice_ai_service, VoiceTurnRequest

        req = VoiceTurnRequest(
            audio_bytes=audio_bytes,
            language=language,
            system_prompt=system_prompt,
            llm_provider=llm_provider,
            tts_language=tts_language,
            voice_id=voice_id,
        )
        svc = get_voice_ai_service()
        turn = await svc.handle_turn(req)
        result = turn.to_dict()

        # Persist the analysis part
        request_id = str(uuid.uuid4())
        analysis = result.get("analysis", {})
        try:
            _persist_analysis(
                db=session,
                result_dict=analysis,
                request_id=request_id,
                user_id=user_id,
                source="voice_respond",
                audio_duration_s=analysis.get("audio_duration_s"),
            )
        except Exception as exc:
            logger.warning("Failed to persist voice respond analysis: %s", exc)

        return result

    except ImportError as exc:
        logger.error("Voice AI service import failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Voice AI service not available",
        )
    except Exception as exc:
        logger.error("Voice respond pipeline failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Voice respond failed: {exc}",
        )


# =====================================================================
# ANALYZE AND SPEAK
# =====================================================================


@router.post(
    "/analyze-and-speak",
    summary="Analyze customer audio + synthesize a response",
)
async def analyze_and_speak(
    request: Request,
    file: UploadFile = File(..., description="Audio file from customer"),
    response_text: str = "Thank you for your message.",
    tts_language: str = "en",
    voice_id: Optional[str] = None,
    current_user: dict = Depends(require_permission("voiceAI", "create")),
    db: Session = Depends(get_db),
):
    """
    Analyze customer audio (transcription, emotion, intent) and synthesize
    a given response text to audio.
    """
    session = _get_orm_db(db)
    user_id = _get_user_id(current_user)

    audio_bytes = await file.read()
    if len(audio_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty audio file",
        )

    try:
        from voice_engine.voice_ai_service import get_voice_ai_service

        svc = get_voice_ai_service()
        analysis = await svc.transcribe_and_analyze(audio_bytes)
        tts_result = await svc.generate_response_audio(
            text=response_text,
            language=tts_language,
            detected_customer_emotion=analysis.get("emotion"),
            voice_id=voice_id,
        )

        # Persist analysis
        request_id = str(uuid.uuid4())
        try:
            _persist_analysis(
                db=session,
                result_dict=analysis,
                request_id=request_id,
                user_id=user_id,
                source="analyze_and_speak",
                audio_duration_s=analysis.get("audio_duration_s"),
            )
        except Exception as exc:
            logger.warning("Failed to persist analyze-and-speak analysis: %s", exc)

        return {"analysis": analysis, "response_audio": tts_result}

    except ImportError as exc:
        logger.error("Voice AI service import failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Voice AI service not available",
        )
    except Exception as exc:
        logger.error("Analyze-and-speak pipeline failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analyze-and-speak failed: {exc}",
        )


# =====================================================================
# VOICE ANALYSES — LIST, DETAIL, STATS
# =====================================================================


@router.get(
    "/analyses",
    response_model=PaginatedResponse,
    summary="List voice analyses (paginated, filterable)",
)
async def list_analyses(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    emotion: Optional[str] = Query(None, description="Filter by emotion type"),
    intent: Optional[str] = Query(None, description="Filter by intent type"),
    dialect: Optional[str] = Query(None, description="Filter by dialect type"),
    source: Optional[str] = Query(None, description="Filter by source (upload, url, whatsapp, ivr)"),
    lead_id: Optional[int] = Query(None, description="Filter by lead ID"),
    current_user: dict = Depends(require_permission("voiceAI", "read")),
    db: Session = Depends(get_db),
):
    """Return a paginated list of stored voice analyses for the authenticated user."""
    session = _get_orm_db(db)
    user_id = _get_user_id(current_user)

    query = session.query(VoiceAnalysis).filter(VoiceAnalysis.user_id == user_id)

    if emotion:
        try:
            emotion_enum = EmotionType(emotion)
            query = query.filter(VoiceAnalysis.emotion == emotion_enum)
        except ValueError:
            logger.warning("Invalid emotion filter: %s", emotion)

    if intent:
        try:
            intent_enum = IntentType(intent)
            query = query.filter(VoiceAnalysis.intent == intent_enum)
        except ValueError:
            logger.warning("Invalid intent filter: %s", intent)

    if dialect:
        try:
            dialect_enum = DialectType(dialect)
            query = query.filter(VoiceAnalysis.dialect == dialect_enum)
        except ValueError:
            logger.warning("Invalid dialect filter: %s", dialect)

    if source:
        query = query.filter(VoiceAnalysis.source == source)

    if lead_id is not None:
        query = query.filter(VoiceAnalysis.lead_id == lead_id)

    total = query.count()
    analyses = query.order_by(VoiceAnalysis.created_at.desc()).offset(skip).limit(limit).all()

    items = [_analysis_to_dict(a) for a in analyses]

    return PaginatedResponse(
        items=items,
        total=total,
        page=(skip // limit) + 1 if limit > 0 else 1,
        page_size=limit,
    )


@router.get(
    "/analyses/stats",
    summary="Aggregated voice analysis stats",
)
async def analyses_stats(
    current_user: dict = Depends(require_permission("voiceAI", "read")),
    db: Session = Depends(get_db),
):
    """
    Return aggregated statistics over all voice analyses for the
    authenticated user: emotion distribution, intent breakdown, dialect
    counts, average lead score, and total analyses.
    """
    session = _get_orm_db(db)
    user_id = _get_user_id(current_user)

    base = session.query(VoiceAnalysis).filter(VoiceAnalysis.user_id == user_id)

    # Total count
    total_count = base.count()

    if total_count == 0:
        return {
            "total_analyses": 0,
            "emotion_distribution": {},
            "intent_breakdown": {},
            "dialect_counts": {},
            "avg_lead_score": 0.0,
            "avg_sentiment": 0.0,
            "avg_confidence": 0.0,
            "total_audio_duration_s": 0.0,
            "avg_processing_time_ms": 0.0,
            "source_counts": {},
        }

    # Emotion distribution
    emotion_rows = (
        session.query(VoiceAnalysis.emotion, func.count(VoiceAnalysis.id))
        .filter(VoiceAnalysis.user_id == user_id)
        .group_by(VoiceAnalysis.emotion)
        .all()
    )
    emotion_dist = {}
    for em, cnt in emotion_rows:
        key = em.value if (em and hasattr(em, "value")) else str(em)
        emotion_dist[key] = cnt

    # Intent breakdown
    intent_rows = (
        session.query(VoiceAnalysis.intent, func.count(VoiceAnalysis.id))
        .filter(VoiceAnalysis.user_id == user_id)
        .group_by(VoiceAnalysis.intent)
        .all()
    )
    intent_map = {}
    for it, cnt in intent_rows:
        key = it.value if (it and hasattr(it, "value")) else str(it)
        intent_map[key] = cnt

    # Dialect counts
    dialect_rows = (
        session.query(VoiceAnalysis.dialect, func.count(VoiceAnalysis.id))
        .filter(VoiceAnalysis.user_id == user_id)
        .group_by(VoiceAnalysis.dialect)
        .all()
    )
    dialect_map = {}
    for dl, cnt in dialect_rows:
        key = dl.value if (dl and hasattr(dl, "value")) else str(dl)
        dialect_map[key] = cnt

    # Source counts
    source_rows = (
        session.query(VoiceAnalysis.source, func.count(VoiceAnalysis.id))
        .filter(VoiceAnalysis.user_id == user_id)
        .group_by(VoiceAnalysis.source)
        .all()
    )
    source_map = {}
    for src, cnt in source_rows:
        source_map[str(src) if src else "unknown"] = cnt

    # Aggregates
    agg = (
        session.query(
            func.coalesce(func.avg(VoiceAnalysis.lead_score), 0.0),
            func.coalesce(func.avg(VoiceAnalysis.sentiment), 0.0),
            func.coalesce(func.avg(VoiceAnalysis.confidence), 0.0),
            func.coalesce(func.sum(VoiceAnalysis.audio_duration_seconds), 0.0),
            func.coalesce(func.avg(VoiceAnalysis.processing_time_ms), 0.0),
        )
        .filter(VoiceAnalysis.user_id == user_id)
        .first()
    )

    return {
        "total_analyses": total_count,
        "emotion_distribution": emotion_dist,
        "intent_breakdown": intent_map,
        "dialect_counts": dialect_map,
        "avg_lead_score": round(float(agg[0]), 2),
        "avg_sentiment": round(float(agg[1]), 4),
        "avg_confidence": round(float(agg[2]), 4),
        "total_audio_duration_s": round(float(agg[3]), 2),
        "avg_processing_time_ms": round(float(agg[4]), 2),
        "source_counts": source_map,
    }


@router.get(
    "/analyses/{analysis_id}",
    response_model=VoiceAnalysisResponse,
    summary="Get a single voice analysis by ID",
)
async def get_analysis(
    analysis_id: int,
    current_user: dict = Depends(require_permission("voiceAI", "read")),
    db: Session = Depends(get_db),
):
    """Return a single stored voice analysis by its ID."""
    session = _get_orm_db(db)
    user_id = _get_user_id(current_user)

    analysis = (
        session.query(VoiceAnalysis)
        .filter(VoiceAnalysis.id == analysis_id, VoiceAnalysis.user_id == user_id)
        .first()
    )
    if analysis is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Voice analysis not found",
        )

    return _analysis_to_dict(analysis)


# =====================================================================
# TTS SYNTHESIS (text → audio)
# =====================================================================


@router.post(
    "/synthesize",
    summary="Synthesize text to speech audio",
)
async def synthesize_speech(
    request: Request,
    body: dict,
    current_user: dict = Depends(require_permission("voiceAI", "create")),
):
    """
    Synthesize text to speech using the TTS engine.
    Accepts JSON body: {text, language, emotion, voice_id, speed, dialect, pace, pitch}.
    Returns base64-encoded audio and metadata.
    Falls back to edge-tts if ML engines are unavailable.
    """
    text = body.get("text", "")
    language = body.get("language", "ta")
    emotion = body.get("emotion")
    voice_id = body.get("voice_id")
    speed = float(body.get("speed", body.get("pace", 1.0)))

    if not text:
        raise HTTPException(status_code=400, detail="'text' is required")

    try:
        from voice_engine.voice_ai_service import get_voice_ai_service
        svc = get_voice_ai_service()
        result = await svc.generate_response_audio(
            text=text,
            language=language,
            detected_customer_emotion=emotion,
            voice_id=voice_id,
        )
        return {
            "audio_base64": result.get("audio_base64", ""),
            "format": result.get("audio_format", "wav"),
            "sample_rate": result.get("sample_rate", 22050),
            "tts_engine": result.get("tts_engine", "edge-tts"),
            "duration_ms": result.get("duration_ms", 0),
        }
    except ImportError:
        logger.warning("Voice AI service not available, trying edge-tts directly")
    except Exception as exc:
        logger.warning("TTS via voice_ai_service failed: %s, trying edge-tts", exc)

    # Fallback: edge-tts
    try:
        import edge_tts
        import base64

        voice_map = {
            "ta": "ta-IN-PallaviNeural",
            "hi": "hi-IN-SwaraNeural",
            "en": "en-IN-NeerjaNeural",
            "te": "te-IN-ShrutiNeural",
            "kn": "kn-IN-SapnaNeural",
            "ml": "ml-IN-SobhanaNeural",
        }
        voice_name = voice_map.get(language, "en-IN-NeerjaNeural")
        rate_str = f"+{int((speed - 1) * 100)}%" if speed >= 1 else f"{int((speed - 1) * 100)}%"

        communicate = edge_tts.Communicate(text, voice_name, rate=rate_str)
        audio_chunks = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_chunks.append(chunk["data"])

        if not audio_chunks:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="TTS produced no audio",
            )

        audio_bytes = b"".join(audio_chunks)
        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")

        return {
            "audio_base64": audio_b64,
            "format": "mp3",
            "sample_rate": 24000,
            "tts_engine": "edge-tts",
            "duration_ms": int(len(audio_bytes) / 24000 * 1000),
        }
    except Exception as exc:
        logger.error("All TTS engines failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"TTS synthesis failed: {exc}",
        )


@router.get(
    "/voices",
    summary="List available TTS voices",
)
async def list_tts_voices(
    language: Optional[str] = Query(None, description="Filter by language"),
    current_user: dict = Depends(require_permission("voiceAI", "read")),
):
    """List built-in and cloned voices available for TTS."""
    voices = [
        {"id": "ta-IN-PallaviNeural", "name": "Pallavi (Tamil Female)", "language": "ta", "engine": "edge-tts"},
        {"id": "ta-IN-ValluvarNeural", "name": "Valluvar (Tamil Male)", "language": "ta", "engine": "edge-tts"},
        {"id": "hi-IN-SwaraNeural", "name": "Swara (Hindi Female)", "language": "hi", "engine": "edge-tts"},
        {"id": "hi-IN-MadhurNeural", "name": "Madhur (Hindi Male)", "language": "hi", "engine": "edge-tts"},
        {"id": "en-IN-NeerjaNeural", "name": "Neerja (English Female)", "language": "en", "engine": "edge-tts"},
        {"id": "en-IN-PrabhatNeural", "name": "Prabhat (English Male)", "language": "en", "engine": "edge-tts"},
        {"id": "te-IN-ShrutiNeural", "name": "Shruti (Telugu Female)", "language": "te", "engine": "edge-tts"},
        {"id": "kn-IN-SapnaNeural", "name": "Sapna (Kannada Female)", "language": "kn", "engine": "edge-tts"},
        {"id": "ml-IN-SobhanaNeural", "name": "Sobhana (Malayalam Female)", "language": "ml", "engine": "edge-tts"},
    ]
    if language:
        voices = [v for v in voices if v["language"] == language]
    return {"voices": voices}


# ─── Speaker diarization (Deepgram Nova-2 `diarize=true`) ──────────────────

@router.post("/stt/diarize", summary="Transcribe audio with speaker separation")
async def stt_diarize(
    file: UploadFile = File(...),
    language: Optional[str] = Query(None, description="Optional language hint (e.g. 'en', 'hi', 'ta')"),
    current_user: dict = Depends(require_permission("voiceAI", "read")),
):
    """
    Run Deepgram Nova-2 with diarization enabled. Returns one segment
    per speaker turn with timestamps — ideal for analyzing call
    recordings, multi-party conferences, or quality scoring.

    Response shape:
      {
        "text":  "full transcript",
        "speakers": [
          {"speaker": 0, "text": "Hello, how may I help?", "start": 0.1, "end": 2.3},
          {"speaker": 1, "text": "I'd like to cancel",      "start": 2.8, "end": 4.2},
        ],
        "speaker_count": 2, ...
      }
    """
    import os
    api_key = os.getenv("DEEPGRAM_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Deepgram API key not configured")

    audio = await file.read()
    if not audio:
        raise HTTPException(status_code=400, detail="Empty audio file")

    from voice_engine.api_providers import _deepgram_stt
    try:
        return await _deepgram_stt(audio, api_key, language, diarize=True)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Diarization failed: {exc}")


# ── Corpus & Training Stats ───────────────────────────────────────────────────

@router.get("/corpus/stats")
async def get_corpus_stats(
    language: str = Query(default="ta", description="Language code (ta, hi, en, …)"),
    _: bool = Depends(require_permission("voice:read")),
):
    """
    Return corpus collection stats for the self-training flywheel.

    Shows total training pairs, estimated hours, and fine-tune readiness
    per language. Used by the Quality Dashboard and the MoshiFineTuneScheduler.
    """
    import os
    bucket   = os.getenv("TRAINING_S3_BUCKET", "voiceflow-training")
    endpoint = os.getenv("CORPUS_MINIO_ENDPOINT", "")
    if not endpoint:
        return {
            "language": language,
            "total_pairs": 0,
            "total_hours": 0.0,
            "new_pairs_since_last_finetune": 0,
            "new_hours_since_last_finetune": 0.0,
            "min_hours_to_trigger": float(os.getenv("FINETUNE_MIN_NEW_HOURS", "10")),
            "ready_to_finetune": False,
            "note": "MinIO not configured (CORPUS_MINIO_ENDPOINT not set)",
        }

    try:
        import aioboto3
        from voice_engine.fine_tune_scheduler import CorpusStats
        session = aioboto3.Session()
        stats   = CorpusStats(session)
        m       = await stats.measure(language)
        min_h   = float(os.getenv("FINETUNE_MIN_NEW_HOURS", "10"))
        return {
            "language":                    m.language,
            "total_pairs":                 m.total_pairs,
            "total_hours":                 round(m.total_hours, 2),
            "new_pairs_since_last_finetune": m.new_pairs_since_last,
            "new_hours_since_last_finetune": round(m.new_hours_since_last, 2),
            "min_hours_to_trigger":        min_h,
            "ready_to_finetune":           m.new_hours_since_last >= min_h,
            "bucket":                      bucket,
        }
    except ImportError:
        return {"error": "aioboto3 not installed", "language": language}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Corpus stats error: {exc}")


@router.post("/corpus/trigger-finetune")
async def trigger_finetune(
    request: Request,
    _: bool = Depends(require_permission("voice:admin")),
):
    """
    Manually trigger a Moshi fine-tune job for a language.

    Called by n8n/07_moshi_weekly_finetune.json when corpus has enough new data.
    Also callable from the admin dashboard for on-demand fine-tuning.

    Body: {"language": "ta", "new_hours": 12.5, "type": "incremental"}
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    language   = body.get("language", "ta")
    new_hours  = float(body.get("new_hours", 0))
    job_type   = body.get("type", "incremental")

    gpu_url = os.getenv("E2E_GPU_API_URL", "")
    if not gpu_url:
        return {
            "status":   "skipped",
            "language": language,
            "reason":   "E2E_GPU_API_URL not configured — set it to enable GPU fine-tuning",
        }

    try:
        from voice_engine.fine_tune_scheduler import GpuJobClient, CorpusStats
        import aioboto3

        # Record trigger timestamp in MinIO
        session = aioboto3.Session()
        stats   = CorpusStats(session)
        await stats.record_trigger(language)

        # Submit job to E2E GPU cluster
        client = GpuJobClient()
        job_id = await client.submit(language=language, corpus_hours=new_hours)

        logger.info(
            "[trigger-finetune] lang=%s hours=%.1f type=%s job_id=%s",
            language, new_hours, job_type, job_id,
        )
        return {
            "status":   "submitted",
            "language": language,
            "new_hours": new_hours,
            "type":     job_type,
            "job_id":   job_id,
        }
    except ImportError as exc:
        return {
            "status":   "error",
            "language": language,
            "reason":   f"Missing dependency: {exc}",
        }
    except Exception as exc:
        logger.exception("[trigger-finetune] failed for lang=%s: %s", language, exc)
        raise HTTPException(status_code=500, detail=f"Fine-tune trigger failed: {exc}")


@router.get("/calls/active-s2s-count")
async def get_active_s2s_count():
    """
    Return the number of currently active S2S WebSocket sessions.
    Used by the GPU watchdog (gpu_auto_shutdown.py) to decide whether
    to keep the L40S pod alive.
    """
    from voice_engine.orchestrator import active_s2s_count  # noqa: PLC0415
    return {"active_s2s_sessions": active_s2s_count()}


@router.get("/pipeline/status")
async def get_pipeline_status(
    _: bool = Depends(require_permission("voice:read")),
):
    """
    Return current S2S pipeline track availability.

    Used by the Quality Dashboard to show which tracks are live.
    """
    try:
        from voice_engine.pipeline_router import get_router
        router_instance = get_router()
        return {
            "tracks": router_instance.availability_snapshot(),
            "description": {
                "parallel":   "Track A — always on (Deepgram/Sarvam → Groq → Sarvam/ElevenLabs)",
                "gemini_s2s": "Track B — Gemini Live S2S (English enterprise, ~250ms)",
                "moshi":      "Track C — Moshi self-hosted S2S (Tamil premium, ~200ms)",
                "sarvam_s2s": "Track D — Sarvam S2S stub (flip flag when API launches)",
            },
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
