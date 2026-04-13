"""
VoiceFlow Marketing AI - Voice Agent Schemas
==============================================
Pydantic v2 schemas for voice cloning, knowledge base, and recordings.
KB-008: NO 'any' type — every field explicitly typed.
"""

from typing import Optional

from pydantic import BaseModel, Field, ConfigDict


# ── Voice Cloning ──────────────────────────────────────────────

class VoiceCloneRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Display name for the voice")
    person_name: str = Field("", max_length=255, description="Marketing person's name")
    language: str = Field("en", max_length=10, description="Language code (en, ta, hi, etc.)")
    tts_engine: str = Field("indicf5", description="TTS engine: indicf5, openvoice_v2, xtts_v2")
    tenant_id: str = Field("default", description="Tenant ID for multi-tenant isolation")


class VoiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    person_name: Optional[str] = None
    tts_engine: str
    language: str
    status: str
    is_active: bool
    reference_duration_seconds: float
    internal_voice_id: Optional[str] = None
    created_at: str


class VoiceTestRequest(BaseModel):
    text: str = Field("Hello, this is a test of the cloned voice.", max_length=500)


# ── Knowledge Base ─────────────────────────────────────────────

class KnowledgeAddRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    content: str = Field(..., min_length=1)
    doc_type: str = Field("document", description="document, faq, product_catalog, script")
    agent_id: Optional[str] = None
    tenant_id: str = Field("default")
    question: Optional[str] = None
    answer: Optional[str] = None


class KnowledgeBulkRequest(BaseModel):
    tenant_id: str = Field("default")
    agent_id: Optional[str] = None
    items: list[dict] = Field(..., min_length=1)


class KnowledgeUpdateRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    question: Optional[str] = None
    answer: Optional[str] = None
    is_active: Optional[bool] = None


class KnowledgeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    doc_type: str
    content: str
    question: Optional[str] = None
    answer: Optional[str] = None
    chunk_index: int
    is_active: bool
    created_at: str


# ── Recordings ─────────────────────────────────────────────────

class RecordingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    call_id: str
    caller_number: str
    agent_voice_id: Optional[str] = None
    sip_provider: str
    duration_seconds: float
    audio_format: str
    recording_size_bytes: int
    full_transcript: Optional[str] = None
    caller_emotion: Optional[str] = None
    caller_intent: Optional[str] = None
    caller_sentiment: Optional[float] = None
    lead_score: Optional[float] = None
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    created_at: str
