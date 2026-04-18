"""
VoiceFlow Marketing AI - Voice Agent Schemas
==============================================
Pydantic v2 schemas for voice cloning, knowledge base, and recordings.
KB-008: NO 'any' type — every field explicitly typed.
"""


from pydantic import BaseModel, ConfigDict, Field

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
    person_name: str | None = None
    tts_engine: str
    language: str
    status: str
    is_active: bool
    reference_duration_seconds: float
    internal_voice_id: str | None = None
    created_at: str


class VoiceTestRequest(BaseModel):
    text: str = Field("Hello, this is a test of the cloned voice.", max_length=500)


# ── Knowledge Base ─────────────────────────────────────────────

class KnowledgeAddRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    content: str = Field(..., min_length=1)
    doc_type: str = Field("document", description="document, faq, product_catalog, script")
    scope: str = Field("agent", description="global | campaign | agent")
    agent_id: str | None = None
    campaign_id: str | None = None
    tenant_id: str = Field("default")
    question: str | None = None
    answer: str | None = None


class KnowledgeBulkRequest(BaseModel):
    tenant_id: str = Field("default")
    scope: str = Field("agent")
    agent_id: str | None = None
    campaign_id: str | None = None
    items: list[dict] = Field(..., min_length=1)


class KnowledgeUpdateRequest(BaseModel):
    title: str | None = None
    content: str | None = None
    question: str | None = None
    answer: str | None = None
    is_active: bool | None = None


class KnowledgeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    doc_type: str
    scope: str = "agent"
    agent_id: str | None = None
    campaign_id: str | None = None
    content: str
    question: str | None = None
    answer: str | None = None
    chunk_index: int
    is_active: bool
    created_at: str


# ── Recordings ─────────────────────────────────────────────────

class RecordingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    call_id: str
    caller_number: str
    agent_voice_id: str | None = None
    sip_provider: str
    duration_seconds: float
    audio_format: str
    recording_size_bytes: int
    full_transcript: str | None = None
    caller_emotion: str | None = None
    caller_intent: str | None = None
    caller_sentiment: float | None = None
    lead_score: float | None = None
    started_at: str | None = None
    ended_at: str | None = None
    created_at: str
