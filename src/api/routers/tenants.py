"""
VoiceFlow Marketing AI - Tenants Router
=========================================
White-label multi-tenant management endpoints.
All tenant management endpoints require admin role.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from api.database import get_db
from api.models.tenant import Tenant, TenantContact
from api.permissions import require_permission
from api.schemas.common import PaginatedResponse
from api.schemas.tenant import (
    FeatureFlagsUpdate,
    TenantContactCreate,
    TenantContactResponse,
    TenantCreate,
    TenantResponse,
    TenantStatsResponse,
    TenantUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/tenants", tags=["White-Label"])


# ── Helpers ─────────────────────────────────────────────────────


def _tenant_to_dict(tenant: Tenant) -> dict:
    """Convert a Tenant ORM object to a dict."""
    return {
        "id": tenant.id,
        "name": tenant.name,
        "slug": tenant.slug,
        "domain": tenant.domain,
        "logo_url": tenant.logo_url,
        "favicon_url": tenant.favicon_url,
        "primary_color": tenant.primary_color,
        "secondary_color": tenant.secondary_color,
        "custom_css": tenant.custom_css,
        "contact_email": tenant.contact_email,
        "contact_phone": tenant.contact_phone,
        "address": tenant.address,
        "plan": tenant.plan,
        "max_users": tenant.max_users,
        "max_voice_minutes": tenant.max_voice_minutes,
        "max_leads": tenant.max_leads,
        "feature_flags": tenant.feature_flags,
        "settings": tenant.settings,
        "default_language": tenant.default_language,
        "default_currency": tenant.default_currency,
        "timezone": tenant.timezone,
        "industry": tenant.industry,
        "is_active": tenant.is_active,
        "trial_ends_at": tenant.trial_ends_at,
        "current_voice_minutes_used": tenant.current_voice_minutes_used,
        "current_lead_count": tenant.current_lead_count,
        # Business identity
        "company_type": tenant.company_type,
        "gstin": tenant.gstin,
        "pan_number": tenant.pan_number,
        "website_url": tenant.website_url,
        # Primary POC
        "owner_name": tenant.owner_name,
        "owner_email": tenant.owner_email,
        "owner_phone": tenant.owner_phone,
        # Billing / Contract
        "billing_email": tenant.billing_email,
        "billing_address": tenant.billing_address,
        "contract_start_date": tenant.contract_start_date,
        "contract_end_date": tenant.contract_end_date,
        "monthly_billing_amount": tenant.monthly_billing_amount,
        "payment_terms": tenant.payment_terms,
        # Onboarding
        "onboarding_status": tenant.onboarding_status,
        "onboarding_notes": tenant.onboarding_notes,
        "go_live_date": tenant.go_live_date,
        # CRM
        "tags": tenant.tags,
        "internal_notes": tenant.internal_notes,
        "created_at": tenant.created_at,
        "updated_at": tenant.updated_at,
    }


# ── GET / ───────────────────────────────────────────────────────


@router.get(
    "/",
    response_model=PaginatedResponse,
    summary="List tenants (admin only)",
)
async def list_tenants(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    is_active: bool | None = Query(None),
    plan: str | None = Query(None),
    search: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("tenants", "read")),
) -> PaginatedResponse:
    """List all tenants. Admin only."""
    query = db.query(Tenant).filter(Tenant.is_deleted == False)  # noqa: E712

    if is_active is not None:
        query = query.filter(Tenant.is_active == is_active)

    if plan:
        query = query.filter(Tenant.plan == plan)

    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            (Tenant.name.ilike(search_pattern))
            | (Tenant.slug.ilike(search_pattern))
            | (Tenant.domain.ilike(search_pattern))
        )

    total = query.count()
    offset = (page - 1) * page_size
    tenants = query.order_by(Tenant.created_at.desc()).offset(offset).limit(page_size).all()

    items = [TenantResponse(**_tenant_to_dict(t)) for t in tenants]
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


# ── POST / ──────────────────────────────────────────────────────


@router.post(
    "/",
    response_model=TenantResponse,
    status_code=201,
    summary="Create tenant (admin only)",
)
async def create_tenant(
    body: TenantCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("tenants", "create")),
) -> TenantResponse:
    """Create a new tenant. Admin only."""
    # Check slug uniqueness
    existing = db.query(Tenant).filter(Tenant.slug == body.slug).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Tenant with slug '{body.slug}' already exists",
        )

    # Check domain uniqueness (if provided)
    if body.domain:
        existing_domain = db.query(Tenant).filter(Tenant.domain == body.domain).first()
        if existing_domain:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Tenant with domain '{body.domain}' already exists",
            )

    tenant = Tenant(
        name=body.name,
        slug=body.slug,
        domain=body.domain,
        logo_url=body.logo_url,
        favicon_url=body.favicon_url,
        primary_color=body.primary_color,
        secondary_color=body.secondary_color,
        contact_email=body.contact_email,
        contact_phone=body.contact_phone,
        address=body.address,
        plan=body.plan,
        max_users=body.max_users,
        max_voice_minutes=body.max_voice_minutes,
        max_leads=body.max_leads,
        feature_flags=body.feature_flags,
        settings=body.settings,
        default_language=body.default_language,
        default_currency=body.default_currency,
        timezone=body.timezone,
        industry=body.industry,
        # Business identity
        company_type=body.company_type,
        gstin=body.gstin,
        pan_number=body.pan_number,
        website_url=body.website_url,
        # Primary POC
        owner_name=body.owner_name,
        owner_email=body.owner_email,
        owner_phone=body.owner_phone,
        # Billing / Contract
        billing_email=body.billing_email,
        billing_address=body.billing_address,
        contract_start_date=body.contract_start_date,
        contract_end_date=body.contract_end_date,
        monthly_billing_amount=body.monthly_billing_amount,
        payment_terms=body.payment_terms,
        # Onboarding
        onboarding_status=body.onboarding_status or "not_started",
        onboarding_notes=body.onboarding_notes,
        go_live_date=body.go_live_date,
        # CRM
        tags=body.tags,
        internal_notes=body.internal_notes,
        is_active=True,
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    logger.info("Tenant created: %s (slug=%s)", tenant.name, tenant.slug)
    return TenantResponse(**_tenant_to_dict(tenant))


# ── GET /{tenant_id} ───────────────────────────────────────────


@router.get(
    "/{tenant_id}",
    response_model=TenantResponse,
    summary="Get tenant detail",
)
async def get_tenant(
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("tenants", "read")),
) -> TenantResponse:
    """Get tenant detail by ID."""
    tenant = db.query(Tenant).filter(
        Tenant.id == tenant_id,
        Tenant.is_deleted == False,  # noqa: E712
    ).first()

    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant {tenant_id} not found",
        )

    return TenantResponse(**_tenant_to_dict(tenant))


# ── PUT /{tenant_id} ───────────────────────────────────────────


@router.put(
    "/{tenant_id}",
    response_model=TenantResponse,
    summary="Update tenant configuration",
)
async def update_tenant(
    tenant_id: int,
    body: TenantUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("tenants", "update")),
) -> TenantResponse:
    """Update a tenant's configuration (branding, domain, plan, etc.). Admin only."""
    tenant = db.query(Tenant).filter(
        Tenant.id == tenant_id,
        Tenant.is_deleted == False,  # noqa: E712
    ).first()

    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant {tenant_id} not found",
        )

    updates = body.model_dump(exclude_unset=True)

    # Validate domain uniqueness if changing
    if "domain" in updates and updates["domain"]:
        existing = db.query(Tenant).filter(
            Tenant.domain == updates["domain"],
            Tenant.id != tenant_id,
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Domain '{updates['domain']}' is already in use by another tenant",
            )

    for field, value in updates.items():
        setattr(tenant, field, value)

    db.commit()
    db.refresh(tenant)

    logger.info("Tenant updated: %s (id=%s)", tenant.name, tenant.id)
    return TenantResponse(**_tenant_to_dict(tenant))


# ── GET /{tenant_id}/features ──────────────────────────────────


@router.get(
    "/{tenant_id}/features",
    summary="Get tenant feature flags",
)
async def get_feature_flags(
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("tenants", "read")),
) -> dict:
    """Get the feature flags configuration for a tenant."""
    tenant = db.query(Tenant).filter(
        Tenant.id == tenant_id,
        Tenant.is_deleted == False,  # noqa: E712
    ).first()

    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant {tenant_id} not found",
        )

    return {
        "tenant_id": tenant.id,
        "tenant_name": tenant.name,
        "feature_flags": tenant.feature_flags or {},
    }


# ── PUT /{tenant_id}/features ──────────────────────────────────


@router.put(
    "/{tenant_id}/features",
    summary="Update tenant feature flags",
)
async def update_feature_flags(
    tenant_id: int,
    body: FeatureFlagsUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("tenants", "update")),
) -> dict:
    """Update the feature flags for a tenant. Admin only."""
    tenant = db.query(Tenant).filter(
        Tenant.id == tenant_id,
        Tenant.is_deleted == False,  # noqa: E712
    ).first()

    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant {tenant_id} not found",
        )

    # Merge with existing flags (deep merge)
    existing = tenant.feature_flags or {}
    existing.update(body.feature_flags)
    tenant.feature_flags = existing

    db.commit()
    db.refresh(tenant)

    logger.info("Feature flags updated for tenant %s", tenant.slug)
    return {
        "tenant_id": tenant.id,
        "tenant_name": tenant.name,
        "feature_flags": tenant.feature_flags,
    }


# ── GET /{tenant_id}/stats ─────────────────────────────────────


@router.get(
    "/{tenant_id}/stats",
    response_model=TenantStatsResponse,
    summary="Get tenant usage statistics",
)
async def get_tenant_stats(
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("tenants", "read")),
) -> TenantStatsResponse:
    """Get usage statistics for a tenant."""
    tenant = db.query(Tenant).filter(
        Tenant.id == tenant_id,
        Tenant.is_deleted == False,  # noqa: E712
    ).first()

    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant {tenant_id} not found",
        )

    # Count users for this tenant
    total_users = 0
    try:
        from api.models.user import User
        total_users = db.query(func.count(User.id)).filter(
            User.tenant_id == tenant_id,
        ).scalar() or 0
    except Exception:
        logger.warning("Could not count tenant users (User model may not have tenant_id)")

    # Calculate usage percentages
    users_pct = round((total_users / tenant.max_users * 100), 2) if tenant.max_users > 0 else 0.0
    voice_pct = (
        round((tenant.current_voice_minutes_used / tenant.max_voice_minutes * 100), 2)
        if tenant.max_voice_minutes > 0 else 0.0
    )
    leads_pct = (
        round((tenant.current_lead_count / tenant.max_leads * 100), 2)
        if tenant.max_leads > 0 else 0.0
    )

    return TenantStatsResponse(
        tenant_id=tenant.id,
        tenant_name=tenant.name,
        plan=tenant.plan,
        total_users=total_users,
        max_users=tenant.max_users,
        voice_minutes_used=tenant.current_voice_minutes_used,
        max_voice_minutes=tenant.max_voice_minutes,
        lead_count=tenant.current_lead_count,
        max_leads=tenant.max_leads,
        is_active=tenant.is_active,
        trial_ends_at=tenant.trial_ends_at,
        users_usage_percentage=users_pct,
        voice_usage_percentage=voice_pct,
        leads_usage_percentage=leads_pct,
    )


# ── Contacts ───────────────────────────────────────────────────────────


def _contact_to_dict(c: TenantContact) -> dict:
    return {
        "id": c.id,
        "tenant_id": c.tenant_id,
        "name": c.name,
        "email": c.email,
        "phone": c.phone,
        "designation": c.designation,
        "role": c.role,
        "is_primary": c.is_primary,
        "notes": c.notes,
        "created_at": c.created_at,
        "updated_at": c.updated_at,
    }


@router.get("/{tenant_id}/contacts", response_model=list[TenantContactResponse])
async def list_contacts(
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("tenants", "read")),
) -> list[TenantContactResponse]:
    """List all contacts for a tenant."""
    contacts = db.query(TenantContact).filter(TenantContact.tenant_id == tenant_id).all()
    return [TenantContactResponse(**_contact_to_dict(c)) for c in contacts]


@router.post("/{tenant_id}/contacts", response_model=TenantContactResponse, status_code=201)
async def add_contact(
    tenant_id: int,
    body: TenantContactCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("tenants", "update")),
) -> TenantContactResponse:
    """Add a named contact to a tenant."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id, Tenant.is_deleted == False).first()  # noqa: E712
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Tenant {tenant_id} not found")

    # If marking as primary, clear existing primary for same role
    if body.is_primary:
        db.query(TenantContact).filter(
            TenantContact.tenant_id == tenant_id,
            TenantContact.role == body.role,
            TenantContact.is_primary == True,  # noqa: E712
        ).update({"is_primary": False})

    contact = TenantContact(
        tenant_id=tenant_id,
        name=body.name,
        email=body.email,
        phone=body.phone,
        designation=body.designation,
        role=body.role,
        is_primary=body.is_primary,
        notes=body.notes,
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)

    logger.info("Contact added to tenant %s: %s (%s)", tenant_id, contact.name, contact.role)
    return TenantContactResponse(**_contact_to_dict(contact))


@router.put("/{tenant_id}/contacts/{contact_id}", response_model=TenantContactResponse)
async def update_contact(
    tenant_id: int,
    contact_id: int,
    body: TenantContactCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("tenants", "update")),
) -> TenantContactResponse:
    """Update a tenant contact."""
    contact = db.query(TenantContact).filter(
        TenantContact.id == contact_id,
        TenantContact.tenant_id == tenant_id,
    ).first()
    if not contact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")

    if body.is_primary and not contact.is_primary:
        db.query(TenantContact).filter(
            TenantContact.tenant_id == tenant_id,
            TenantContact.role == body.role,
            TenantContact.is_primary == True,  # noqa: E712
        ).update({"is_primary": False})

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(contact, field, value)

    db.commit()
    db.refresh(contact)
    return TenantContactResponse(**_contact_to_dict(contact))


@router.delete("/{tenant_id}/contacts/{contact_id}", status_code=204)
async def delete_contact(
    tenant_id: int,
    contact_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("tenants", "update")),
) -> None:
    """Delete a tenant contact."""
    contact = db.query(TenantContact).filter(
        TenantContact.id == contact_id,
        TenantContact.tenant_id == tenant_id,
    ).first()
    if not contact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")
    db.delete(contact)
    db.commit()
