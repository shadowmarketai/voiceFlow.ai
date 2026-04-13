"""
VoiceFlow Marketing AI - Voice Agent Router
=============================================
15 endpoints at /api/v1/agent for managing:
- Cloned voices (upload, list, get, delete, test)
- Knowledge base (add, bulk, list, update, delete)
- Call recordings (list, stats, get, audio stream, analyze)

Uses require_permission("voiceAI", ...) + get_async_db.
"""

import base64
import io
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_async_db
from api.permissions import require_permission
from api.schemas.voice_agent import (
    VoiceCloneRequest,
    VoiceResponse,
    VoiceTestRequest,
    KnowledgeAddRequest,
    KnowledgeBulkRequest,
    KnowledgeUpdateRequest,
    KnowledgeResponse,
    RecordingResponse,
)
from api.services import voice_agent_clone, voice_agent_knowledge, voice_agent_recordings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/agent", tags=["Voice Agent"])


# ---------------------------------------------------------------------------
# Tenant helper — ALWAYS derive tenant_id from authenticated user
# Never trust a tenant_id query parameter; that's a cross-tenant data leak.
# ---------------------------------------------------------------------------

def _tenant_id_for(user: dict) -> str:
    """Return the tenant_id for the authenticated user.

    Priority: user.tenant_id (real multi-tenant scope) → user.id (legacy fallback).
    Never trust caller-supplied tenant_id.
    """
    tid = user.get("tenant_id")
    if tid:
        return str(tid)
    # Legacy: each user is its own tenant when tenant_id is null
    return str(user.get("id", ""))


# ---------------------------------------------------------------------------
# Response converters
# ---------------------------------------------------------------------------

def _voice_to_response(v) -> VoiceResponse:
    return VoiceResponse(
        id=v.id,
        name=v.name,
        person_name=v.person_name,
        tts_engine=v.tts_engine,
        language=v.language,
        status=v.status,
        is_active=v.is_active,
        reference_duration_seconds=v.reference_duration_seconds,
        internal_voice_id=v.internal_voice_id,
        created_at=v.created_at.isoformat() if v.created_at else "",
    )


def _knowledge_to_response(d) -> KnowledgeResponse:
    return KnowledgeResponse(
        id=d.id,
        title=d.title,
        doc_type=d.doc_type,
        content=d.content,
        question=d.question,
        answer=d.answer,
        chunk_index=d.chunk_index,
        is_active=d.is_active,
        created_at=d.created_at.isoformat() if d.created_at else "",
    )


def _recording_to_response(r) -> RecordingResponse:
    return RecordingResponse(
        id=r.id,
        call_id=r.call_id,
        caller_number=r.caller_number,
        agent_voice_id=r.agent_voice_id,
        sip_provider=r.sip_provider,
        duration_seconds=r.duration_seconds,
        audio_format=r.audio_format,
        recording_size_bytes=r.recording_size_bytes,
        full_transcript=r.full_transcript,
        caller_emotion=r.caller_emotion,
        caller_intent=r.caller_intent,
        caller_sentiment=r.caller_sentiment,
        lead_score=r.lead_score,
        started_at=r.started_at.isoformat() if r.started_at else None,
        ended_at=r.ended_at.isoformat() if r.ended_at else None,
        created_at=r.created_at.isoformat() if r.created_at else "",
    )


# ===========================
# Voice Cloning Endpoints
# ===========================

@router.post("/voices/clone", response_model=VoiceResponse, status_code=201)
async def clone_voice_endpoint(
    file: UploadFile = File(..., description="Reference WAV audio (5-60 seconds)"),
    name: str = Query(..., description="Display name"),
    person_name: str = Query("", description="Person's name"),
    language: str = Query("en", description="Language code"),
    tts_engine: str = Query("indicf5", description="TTS engine"),
    db: AsyncSession = Depends(get_async_db),
    user: dict = Depends(require_permission("voiceAI", "create")),
):
    """Upload a marketing person's voice sample and clone it."""
    tenant_id = _tenant_id_for(user)
    audio_bytes = await file.read()
    try:
        cloned = await voice_agent_clone.clone_voice(
            db,
            tenant_id=tenant_id,
            name=name,
            person_name=person_name,
            audio_bytes=audio_bytes,
            language=language,
            tts_engine=tts_engine,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _voice_to_response(cloned)


@router.get("/voices", response_model=list[VoiceResponse])
async def list_voices_endpoint(
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_async_db),
    user: dict = Depends(require_permission("voiceAI", "read")),
):
    """List all cloned voices for the calling tenant."""
    tenant_id = _tenant_id_for(user)
    voices = await voice_agent_clone.list_voices(db, tenant_id, active_only=active_only)
    return [_voice_to_response(v) for v in voices]


@router.get("/voices/{voice_id}", response_model=VoiceResponse)
async def get_voice_endpoint(
    voice_id: int,
    db: AsyncSession = Depends(get_async_db),
    user: dict = Depends(require_permission("voiceAI", "read")),
):
    """Get details of a specific cloned voice."""
    v = await voice_agent_clone.get_voice(db, voice_id)
    if v is None:
        raise HTTPException(status_code=404, detail="Voice not found")
    return _voice_to_response(v)


@router.delete("/voices/{voice_id}")
async def delete_voice_endpoint(
    voice_id: int,
    db: AsyncSession = Depends(get_async_db),
    user: dict = Depends(require_permission("voiceAI", "delete")),
):
    """Delete a cloned voice."""
    deleted = await voice_agent_clone.delete_voice(db, voice_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Voice not found")
    return {"status": "deleted", "voice_id": voice_id}


@router.post("/voices/{voice_id}/test")
async def test_voice_endpoint(
    voice_id: int,
    body: VoiceTestRequest,
    db: AsyncSession = Depends(get_async_db),
    user: dict = Depends(require_permission("voiceAI", "read")),
):
    """Generate a sample audio clip with the cloned voice."""
    audio_bytes = await voice_agent_clone.test_voice(voice_id, body.text, db=db)
    if audio_bytes is None:
        raise HTTPException(status_code=400, detail="Voice not ready or not found")
    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
    return {"audio_base64": audio_b64, "format": "wav"}


# ===========================
# Knowledge Base Endpoints
# ===========================

@router.post("/knowledge", response_model=list[KnowledgeResponse], status_code=201)
async def add_knowledge_endpoint(
    body: KnowledgeAddRequest,
    db: AsyncSession = Depends(get_async_db),
    user: dict = Depends(require_permission("voiceAI", "create")),
):
    """Upload a document or FAQ to the knowledge base. Auto-chunks and embeds."""
    tenant_id = _tenant_id_for(user)
    docs = await voice_agent_knowledge.add_document(
        db,
        tenant_id=tenant_id,
        title=body.title,
        content=body.content,
        doc_type=body.doc_type,
        agent_id=body.agent_id,
        question=body.question,
        answer=body.answer,
    )
    return [_knowledge_to_response(d) for d in docs]


@router.post("/knowledge/bulk", status_code=201)
async def bulk_add_knowledge_endpoint(
    body: KnowledgeBulkRequest,
    db: AsyncSession = Depends(get_async_db),
    user: dict = Depends(require_permission("voiceAI", "create")),
):
    """Bulk upload documents/FAQs."""
    tenant_id = _tenant_id_for(user)
    count = await voice_agent_knowledge.bulk_add_documents(
        db,
        tenant_id=tenant_id,
        items=body.items,
        agent_id=body.agent_id,
    )
    return {"created": count}


@router.get("/knowledge", response_model=list[KnowledgeResponse])
async def list_knowledge_endpoint(
    agent_id: Optional[str] = Query(None),
    doc_type: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_async_db),
    user: dict = Depends(require_permission("voiceAI", "read")),
):
    """List knowledge documents for the calling tenant."""
    tenant_id = _tenant_id_for(user)
    docs = await voice_agent_knowledge.list_documents(
        db, tenant_id, agent_id=agent_id, doc_type=doc_type,
        limit=limit, offset=offset,
    )
    return [_knowledge_to_response(d) for d in docs]


@router.put("/knowledge/{doc_id}", response_model=KnowledgeResponse)
async def update_knowledge_endpoint(
    doc_id: int,
    body: KnowledgeUpdateRequest,
    db: AsyncSession = Depends(get_async_db),
    user: dict = Depends(require_permission("voiceAI", "update")),
):
    """Update a knowledge document. Re-embeds if content changes."""
    doc = await voice_agent_knowledge.update_document(
        db, doc_id,
        **body.model_dump(exclude_none=True),
    )
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return _knowledge_to_response(doc)


@router.delete("/knowledge/{doc_id}")
async def delete_knowledge_endpoint(
    doc_id: int,
    db: AsyncSession = Depends(get_async_db),
    user: dict = Depends(require_permission("voiceAI", "delete")),
):
    """Delete a knowledge document."""
    deleted = await voice_agent_knowledge.delete_document(db, doc_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"status": "deleted", "doc_id": doc_id}


# ===========================
# Recording Endpoints
# ===========================

@router.get("/recordings", response_model=list[RecordingResponse])
async def list_recordings_endpoint(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_async_db),
    user: dict = Depends(require_permission("voiceAI", "read")),
):
    """List call recordings for the calling tenant (paginated)."""
    tenant_id = _tenant_id_for(user)
    recs = await voice_agent_recordings.list_recordings(
        db, tenant_id=tenant_id, limit=limit, offset=offset,
    )
    return [_recording_to_response(r) for r in recs]


@router.get("/recordings/stats")
async def recording_stats_endpoint(
    db: AsyncSession = Depends(get_async_db),
    user: dict = Depends(require_permission("voiceAI", "read")),
):
    tenant_id = _tenant_id_for(user)
    """Get aggregate stats for call recordings."""
    stats = await voice_agent_recordings.get_recording_stats(db, tenant_id=tenant_id)
    return stats


@router.get("/recordings/{recording_id}", response_model=RecordingResponse)
async def get_recording_endpoint(
    recording_id: int,
    db: AsyncSession = Depends(get_async_db),
    user: dict = Depends(require_permission("voiceAI", "read")),
):
    """Get recording details including transcript and analysis."""
    rec = await voice_agent_recordings.get_recording(db, recording_id)
    if rec is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    return _recording_to_response(rec)


@router.get("/recordings/{recording_id}/audio")
async def get_recording_audio_endpoint(
    recording_id: int,
    db: AsyncSession = Depends(get_async_db),
    user: dict = Depends(require_permission("voiceAI", "read")),
):
    """Stream/download the call recording audio file."""
    audio_bytes, content_type = await voice_agent_recordings.get_recording_audio(
        db, recording_id,
    )
    if audio_bytes is None:
        raise HTTPException(status_code=404, detail="Audio not found")
    return StreamingResponse(
        io.BytesIO(audio_bytes),
        media_type=content_type,
        headers={"Content-Disposition": f"attachment; filename=recording-{recording_id}.wav"},
    )


@router.post("/recordings/{recording_id}/analyze")
async def analyze_recording_endpoint(
    recording_id: int,
    db: AsyncSession = Depends(get_async_db),
    user: dict = Depends(require_permission("voiceAI", "create")),
):
    """Run/re-run voice analysis on a recording."""
    rec = await voice_agent_recordings.analyze_recording(db, recording_id)
    if rec is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    return _recording_to_response(rec)
