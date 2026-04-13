"""
VoiceFlow Marketing AI - Campaigns Router
==========================================
Campaign management: CRUD, lifecycle control, and performance metrics.

All endpoints require authentication. Campaigns are tenant-isolated via user_id.
Budget is in INR. Audience criteria must be valid JSON.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from api.database import get_db
from api.permissions import require_permission
from api.models.campaign import (
    Campaign,
    CampaignStatus as ModelCampaignStatus,
    CampaignType as ModelCampaignType,
    CampaignPlatform as ModelCampaignPlatform,
)
from api.schemas.campaign import (
    CampaignCreate,
    CampaignUpdate,
    CampaignResponse,
    CampaignStatsResponse,
)
from api.schemas.common import MessageResponse, PaginatedResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/campaigns", tags=["Campaigns"])


# ── Helpers ───────────────────────────────────────────────────────


def _get_user_id(current_user: dict) -> int:
    """Extract numeric user_id from the current user dict.

    The legacy auth system may return a string id like 'user-001'.
    For ORM Campaign rows (integer FK) we need a real int.  When the
    value is not castable, fall back to 1 (demo user).
    """
    raw = current_user.get("id", 1)
    if isinstance(raw, int):
        return raw
    try:
        return int(raw)
    except (ValueError, TypeError):
        return 1


def _map_campaign_type(value: Optional[str]) -> Optional[ModelCampaignType]:
    """Map schema enum string to model enum, or None."""
    if value is None:
        return None
    try:
        return ModelCampaignType(value)
    except ValueError:
        return None


def _map_campaign_platform(value: Optional[str]) -> Optional[ModelCampaignPlatform]:
    if value is None:
        return None
    try:
        return ModelCampaignPlatform(value)
    except ValueError:
        return None


def _campaign_to_response(c: Campaign) -> CampaignResponse:
    """Convert a Campaign ORM object into a CampaignResponse schema."""
    return CampaignResponse(
        id=str(c.id),
        name=c.name,
        description=c.description,
        campaign_type=c.campaign_type.value if c.campaign_type else None,
        platform=c.platform.value if c.platform else None,
        status=c.status.value if c.status else "draft",
        audience_type=c.audience_type,
        audience_criteria=c.audience_criteria,
        audience_size=c.audience_size,
        budget=c.budget,
        spent=c.spent or 0.0,
        currency=c.currency or "INR",
        impressions=c.impressions or 0,
        clicks=c.clicks or 0,
        conversions=c.conversions or 0,
        start_date=c.start_date.isoformat() if c.start_date else None,
        end_date=c.end_date.isoformat() if c.end_date else None,
        created_at=c.created_at.isoformat() if c.created_at else None,
        updated_at=c.updated_at.isoformat() if c.updated_at else None,
    )


def _get_campaign_or_404(
    db: Session,
    campaign_id: int,
    user_id: int,
) -> Campaign:
    """Fetch a campaign owned by the user, or raise 404."""
    campaign = (
        db.query(Campaign)
        .filter(
            Campaign.id == campaign_id,
            Campaign.user_id == user_id,
            Campaign.is_deleted == False,  # noqa: E712
        )
        .first()
    )
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign {campaign_id} not found",
        )
    return campaign


# ── GET / — List campaigns (paginated, filterable) ───────────────


@router.get(
    "/",
    response_model=PaginatedResponse,
    summary="List campaigns",
)
async def list_campaigns(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status"),
    platform: Optional[str] = Query(None, description="Filter by platform"),
    campaign_type: Optional[str] = Query(None, alias="type", description="Filter by campaign type"),
    search: Optional[str] = Query(None, description="Search by name"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("campaigns", "read")),
) -> PaginatedResponse:
    """List campaigns for the authenticated user with pagination and optional filters."""
    user_id = _get_user_id(current_user)

    query = db.query(Campaign).filter(
        Campaign.user_id == user_id,
        Campaign.is_deleted == False,  # noqa: E712
    )

    # Apply filters
    if status_filter:
        try:
            model_status = ModelCampaignStatus(status_filter)
            query = query.filter(Campaign.status == model_status)
        except ValueError:
            pass  # ignore invalid status filter

    if platform:
        try:
            model_platform = ModelCampaignPlatform(platform)
            query = query.filter(Campaign.platform == model_platform)
        except ValueError:
            pass

    if campaign_type:
        try:
            model_type = ModelCampaignType(campaign_type)
            query = query.filter(Campaign.campaign_type == model_type)
        except ValueError:
            pass

    if search:
        query = query.filter(Campaign.name.ilike(f"%{search}%"))

    # Total count
    total = query.count()

    # Paginate
    offset = (page - 1) * page_size
    campaigns = (
        query.order_by(Campaign.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    items = [_campaign_to_response(c) for c in campaigns]

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


# ── POST / — Create campaign ─────────────────────────────────────


@router.post(
    "/",
    response_model=CampaignResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create campaign",
)
async def create_campaign(
    body: CampaignCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("campaigns", "create")),
) -> CampaignResponse:
    """Create a new marketing campaign.

    Budget must be in INR. audience_criteria must be valid JSON.
    """
    user_id = _get_user_id(current_user)

    campaign = Campaign(
        name=body.name,
        description=body.description,
        campaign_type=_map_campaign_type(body.campaign_type.value if body.campaign_type else None),
        platform=_map_campaign_platform(body.platform.value if body.platform else None),
        status=ModelCampaignStatus.DRAFT,
        audience_type=body.audience_type,
        audience_criteria=body.audience_criteria,
        budget=body.budget,
        currency=body.currency or "INR",
        user_id=user_id,
    )

    # Parse dates if provided
    if body.start_date:
        try:
            campaign.start_date = datetime.fromisoformat(body.start_date)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid start_date format. Use ISO 8601.",
            )
    if body.end_date:
        try:
            campaign.end_date = datetime.fromisoformat(body.end_date)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid end_date format. Use ISO 8601.",
            )

    db.add(campaign)
    db.commit()
    db.refresh(campaign)

    logger.info("Campaign created: id=%s name='%s' user=%s", campaign.id, campaign.name, user_id)
    return _campaign_to_response(campaign)


# ── GET /{campaign_id} — Get campaign detail ─────────────────────


@router.get(
    "/{campaign_id}",
    response_model=CampaignResponse,
    summary="Get campaign detail",
)
async def get_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("campaigns", "read")),
) -> CampaignResponse:
    """Get campaign detail with performance metrics."""
    user_id = _get_user_id(current_user)
    campaign = _get_campaign_or_404(db, campaign_id, user_id)
    return _campaign_to_response(campaign)


# ── PUT /{campaign_id} — Update campaign ─────────────────────────


@router.put(
    "/{campaign_id}",
    response_model=CampaignResponse,
    summary="Update campaign",
)
async def update_campaign(
    campaign_id: int,
    body: CampaignUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("campaigns", "update")),
) -> CampaignResponse:
    """Update an existing campaign. Only provided fields are modified."""
    user_id = _get_user_id(current_user)
    campaign = _get_campaign_or_404(db, campaign_id, user_id)

    update_data = body.model_dump(exclude_none=True)

    for field_name, value in update_data.items():
        if field_name == "campaign_type":
            setattr(campaign, field_name, _map_campaign_type(value.value if hasattr(value, "value") else value))
        elif field_name == "platform":
            setattr(campaign, field_name, _map_campaign_platform(value.value if hasattr(value, "value") else value))
        elif field_name == "status":
            try:
                setattr(campaign, field_name, ModelCampaignStatus(value.value if hasattr(value, "value") else value))
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid status: {value}",
                )
        elif field_name in ("start_date", "end_date"):
            if value:
                try:
                    setattr(campaign, field_name, datetime.fromisoformat(value))
                except ValueError:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid {field_name} format. Use ISO 8601.",
                    )
        else:
            setattr(campaign, field_name, value)

    db.commit()
    db.refresh(campaign)

    logger.info("Campaign updated: id=%s user=%s", campaign.id, user_id)
    return _campaign_to_response(campaign)


# ── DELETE /{campaign_id} — Delete campaign ──────────────────────


@router.delete(
    "/{campaign_id}",
    response_model=MessageResponse,
    summary="Delete campaign",
)
async def delete_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("campaigns", "delete")),
) -> MessageResponse:
    """Soft-delete a campaign. Only draft or cancelled campaigns can be deleted."""
    user_id = _get_user_id(current_user)
    campaign = _get_campaign_or_404(db, campaign_id, user_id)

    deletable_statuses = {ModelCampaignStatus.DRAFT, ModelCampaignStatus.CANCELLED}
    if campaign.status not in deletable_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete campaign with status '{campaign.status.value}'. "
                   f"Only draft or cancelled campaigns can be deleted.",
        )

    campaign.is_deleted = True
    campaign.deleted_at = datetime.now(timezone.utc)
    campaign.deleted_by = user_id

    db.commit()
    db.refresh(campaign)

    logger.info("Campaign deleted: id=%s user=%s", campaign_id, user_id)
    return MessageResponse(message=f"Campaign {campaign_id} deleted successfully")


# ── POST /{campaign_id}/start — Start campaign ──────────────────


@router.post(
    "/{campaign_id}/start",
    response_model=CampaignResponse,
    summary="Start campaign",
)
async def start_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("campaigns", "update")),
) -> CampaignResponse:
    """Start a campaign (transition to active status).

    Campaign must be in draft or scheduled status.
    """
    user_id = _get_user_id(current_user)
    campaign = _get_campaign_or_404(db, campaign_id, user_id)

    startable = {ModelCampaignStatus.DRAFT, ModelCampaignStatus.SCHEDULED}
    if campaign.status not in startable:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot start campaign with status '{campaign.status.value}'. "
                   f"Campaign must be draft or scheduled.",
        )

    campaign.status = ModelCampaignStatus.ACTIVE
    if not campaign.start_date:
        campaign.start_date = datetime.now(timezone.utc)

    db.commit()
    db.refresh(campaign)

    # Trigger telephony execution (async, non-blocking)
    try:
        from api.services.campaign_execution import execute_campaign
        import asyncio

        asyncio.create_task(execute_campaign(
            campaign_id=campaign.id,
            campaign_name=campaign.name,
            phone_numbers=[],  # Load from contact list in production
            from_number="",    # Load from tenant config
            provider="vobiz",  # Default bulk provider
            language="hi",
        ))
        logger.info("Campaign execution triggered: id=%s", campaign_id)
    except Exception as exc:
        logger.warning("Campaign execution trigger failed (campaign still active): %s", exc)

    logger.info("Campaign started: id=%s user=%s", campaign_id, user_id)
    return _campaign_to_response(campaign)


# ── POST /{campaign_id}/pause — Pause campaign ──────────────────


@router.post(
    "/{campaign_id}/pause",
    response_model=CampaignResponse,
    summary="Pause campaign",
)
async def pause_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("campaigns", "update")),
) -> CampaignResponse:
    """Pause an active campaign."""
    user_id = _get_user_id(current_user)
    campaign = _get_campaign_or_404(db, campaign_id, user_id)

    if campaign.status != ModelCampaignStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot pause campaign with status '{campaign.status.value}'. "
                   f"Campaign must be active.",
        )

    campaign.status = ModelCampaignStatus.PAUSED
    db.commit()
    db.refresh(campaign)

    logger.info("Campaign paused: id=%s user=%s", campaign_id, user_id)
    return _campaign_to_response(campaign)


# ── POST /{campaign_id}/resume — Resume paused campaign ─────────


@router.post(
    "/{campaign_id}/resume",
    response_model=CampaignResponse,
    summary="Resume paused campaign",
)
async def resume_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("campaigns", "update")),
) -> CampaignResponse:
    """Resume a paused campaign."""
    user_id = _get_user_id(current_user)
    campaign = _get_campaign_or_404(db, campaign_id, user_id)

    if campaign.status != ModelCampaignStatus.PAUSED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot resume campaign with status '{campaign.status.value}'. "
                   f"Campaign must be paused.",
        )

    campaign.status = ModelCampaignStatus.ACTIVE
    db.commit()
    db.refresh(campaign)

    logger.info("Campaign resumed: id=%s user=%s", campaign_id, user_id)
    return _campaign_to_response(campaign)


# ── GET /{campaign_id}/stats — Campaign performance stats ────────


@router.get(
    "/{campaign_id}/stats",
    response_model=CampaignStatsResponse,
    summary="Campaign performance stats",
)
async def get_campaign_stats(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("campaigns", "read")),
) -> CampaignStatsResponse:
    """Get campaign performance metrics including impressions, clicks, conversions, and ROI."""
    user_id = _get_user_id(current_user)
    campaign = _get_campaign_or_404(db, campaign_id, user_id)

    total_contacts = campaign.audience_size or 0
    dialed = campaign.total_calls_made or 0
    connected = campaign.calls_connected or 0
    converted = campaign.conversions or 0

    connect_rate = (connected / dialed * 100) if dialed > 0 else 0.0
    conversion_rate = (converted / connected * 100) if connected > 0 else 0.0
    progress = (dialed / total_contacts * 100) if total_contacts > 0 else 0.0

    return CampaignStatsResponse(
        campaign_id=str(campaign.id),
        name=campaign.name,
        status=campaign.status.value if campaign.status else "draft",
        total_contacts=total_contacts,
        dialed=dialed,
        connected=connected,
        converted=converted,
        connect_rate=round(connect_rate, 2),
        conversion_rate=round(conversion_rate, 2),
        progress=round(progress, 2),
    )
