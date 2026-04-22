"""
VoiceFlow AI - CRM Leads Router
=================================
Endpoints for the leads database:
  - POST /capture           — Universal ingest (all sources)
  - GET/POST/PUT/DELETE      — Lead CRUD
  - GET /pipeline            — Pipeline stats
  - POST /import             — CSV import
  - GET /export              — CSV export
  - POST /interactions       — Log interactions
  - GET /{id}/interactions   — Get lead interactions
"""

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.leads_database import get_leads_db
from api.permissions import require_permission
from api.schemas.leads import (
    ImportResult,
    InteractionCreateRequest,
    InteractionResponse,
    LeadCaptureRequest,
    LeadCaptureResponse,
    LeadCreateRequest,
    LeadListResponse,
    LeadResponse,
    LeadUpdateRequest,
    PipelineStats,
)
from api.services import leads_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/crm-leads", tags=["CRM Leads"])


# ── Tenant helper ──

def _tenant_id(user: dict) -> str:
    tid = user.get("tenant_id")
    return str(tid) if tid else str(user.get("id", ""))


# ── Response helpers ──

async def _lead_to_response(db: AsyncSession, lead) -> LeadResponse:
    tags = await leads_service.get_lead_tags(db, lead.id)
    custom_fields = await leads_service.get_lead_custom_fields(db, lead.id)
    return LeadResponse(
        id=str(lead.id),
        tenant_id=lead.tenant_id,
        name=lead.name,
        email=lead.email,
        phone=lead.phone,
        phone_country=lead.phone_country,
        business_name=lead.business_name,
        business_type=lead.business_type,
        business_size=lead.business_size,
        location_city=lead.location_city,
        location_state=lead.location_state,
        location_country=lead.location_country,
        source=lead.source,
        source_campaign=lead.source_campaign,
        source_medium=lead.source_medium,
        utm_source=lead.utm_source,
        utm_medium=lead.utm_medium,
        utm_campaign=lead.utm_campaign,
        intent=lead.intent,
        budget_range=lead.budget_range,
        timeline=lead.timeline,
        lead_score=lead.lead_score,
        qualification=lead.qualification,
        status=lead.status,
        disposition=getattr(lead, 'disposition', None),
        assigned_to=lead.assigned_to,
        notes=getattr(lead, 'notes', None),
        converted_at=lead.converted_at.isoformat() if lead.converted_at else None,
        deal_value=float(lead.deal_value) if lead.deal_value else None,
        consent_given=lead.consent_given,
        marketing_optin=lead.marketing_optin,
        created_at=lead.created_at.isoformat() if lead.created_at else "",
        updated_at=lead.updated_at.isoformat() if lead.updated_at else "",
        last_contacted_at=lead.last_contacted_at.isoformat() if lead.last_contacted_at else None,
        next_followup_at=lead.next_followup_at.isoformat() if lead.next_followup_at else None,
        tags=tags,
        custom_fields=custom_fields,
    )


# ===========================
# Universal Capture
# ===========================

@router.post("/capture", response_model=LeadCaptureResponse, status_code=201)
async def capture_lead_endpoint(
    body: LeadCaptureRequest,
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "create")),
):
    """Universal lead capture — deduplicates by phone, enriches existing leads."""
    tenant_id = _tenant_id(user)
    lead, is_new = await leads_service.capture_lead(
        db, tenant_id, body.model_dump()
    )
    return LeadCaptureResponse(
        lead_id=str(lead.id),
        is_new=is_new,
        lead_score=lead.lead_score,
        status=lead.status,
    )


# ===========================
# CRUD
# ===========================

@router.get("", response_model=LeadListResponse)
async def list_leads_endpoint(
    status: str | None = Query(None),
    qualification: str | None = Query(None),
    source: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "read")),
):
    """List leads with filters and pagination."""
    tenant_id = _tenant_id(user)
    leads, total = await leads_service.list_leads(
        db, tenant_id,
        status=status,
        qualification=qualification,
        source=source,
        search=search,
        page=page,
        per_page=per_page,
    )
    lead_responses = [await _lead_to_response(db, l) for l in leads]
    return LeadListResponse(
        leads=lead_responses,
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("", response_model=LeadResponse, status_code=201)
async def create_lead_endpoint(
    body: LeadCreateRequest,
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "create")),
):
    """Create a lead manually."""
    tenant_id = _tenant_id(user)
    data = body.model_dump()
    lead, _ = await leads_service.capture_lead(db, tenant_id, data)
    return await _lead_to_response(db, lead)


# ===========================
# Pipeline (MUST be before /{lead_id} routes)
# ===========================

@router.get("/pipeline/stats", response_model=PipelineStats)
async def pipeline_stats_endpoint(
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "read")),
):
    """Get lead pipeline stats by status."""
    tenant_id = _tenant_id(user)
    return await leads_service.get_pipeline_stats(db, tenant_id)


# ===========================
# Import / Export (MUST be before /{lead_id} routes)
# ===========================

@router.post("/import", response_model=ImportResult, status_code=201)
async def import_leads_endpoint(
    file: UploadFile = File(...),
    source: str = Form("csv"),
    tags: str = Form(""),
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "create")),
):
    """Import leads from CSV/Excel file."""
    tenant_id = _tenant_id(user)
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext not in ("csv", "txt"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    raw = await file.read()
    csv_text = raw.decode("utf-8", errors="replace")
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

    result = await leads_service.import_csv(
        db, tenant_id, csv_text, source=source, default_tags=tag_list
    )
    return ImportResult(**result)


@router.get("/export/csv")
async def export_leads_endpoint(
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "read")),
):
    """Export all leads as CSV download."""
    tenant_id = _tenant_id(user)
    csv_text = await leads_service.export_csv(db, tenant_id)

    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leads_export.csv"},
    )


# ===========================
# Interactions (MUST be before /{lead_id} routes)
# ===========================

@router.post("/interactions", status_code=201)
async def add_interaction_endpoint(
    body: InteractionCreateRequest,
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "create")),
):
    """Log an interaction (call, chat, email, etc.) with a lead."""
    interaction = await leads_service.add_interaction(
        db,
        lead_id=body.lead_id,
        channel=body.channel,
        direction=body.direction,
        content=body.content,
        metadata_json=body.metadata_json,
        sentiment=body.sentiment,
        intent_detected=body.intent_detected,
    )
    return InteractionResponse(
        id=str(interaction.id),
        lead_id=str(interaction.lead_id),
        channel=interaction.channel,
        direction=interaction.direction,
        content=interaction.content,
        sentiment=interaction.sentiment,
        intent_detected=interaction.intent_detected,
        created_at=interaction.created_at.isoformat() if interaction.created_at else "",
    )


# ===========================
# Single Lead CRUD (/{lead_id} routes LAST)
# ===========================

@router.get("/{lead_id}", response_model=LeadResponse)
async def get_lead_endpoint(
    lead_id: str,
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "read")),
):
    """Get a single lead by ID."""
    lead = await leads_service.get_lead(db, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return await _lead_to_response(db, lead)


@router.put("/{lead_id}", response_model=LeadResponse)
async def update_lead_endpoint(
    lead_id: str,
    body: LeadUpdateRequest,
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "update")),
):
    """Update a lead."""
    lead = await leads_service.update_lead(
        db, lead_id, body.model_dump(exclude_none=True)
    )
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return await _lead_to_response(db, lead)


@router.delete("/{lead_id}")
async def delete_lead_endpoint(
    lead_id: str,
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "delete")),
):
    """Soft-delete a lead."""
    deleted = await leads_service.delete_lead(db, lead_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"status": "deleted", "lead_id": lead_id}


@router.get("/{lead_id}/interactions", response_model=list[InteractionResponse])
async def list_interactions_endpoint(
    lead_id: str,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "read")),
):
    """Get all interactions for a lead."""
    interactions = await leads_service.list_interactions(
        db, lead_id, limit=limit
    )
    return [
        InteractionResponse(
            id=str(i.id),
            lead_id=str(i.lead_id),
            channel=i.channel,
            direction=i.direction,
            content=i.content,
            sentiment=i.sentiment,
            intent_detected=i.intent_detected,
            created_at=i.created_at.isoformat() if i.created_at else "",
        )
        for i in interactions
    ]
