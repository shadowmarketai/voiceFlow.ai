"""
VoiceFlow AI - CRM Integrations Router
========================================
Endpoints for connecting external CRMs and ad sources:
  - CRM connections (Zoho, HubSpot, Salesforce, etc.)
  - Ad source connections (Facebook, Google, IndiaMart, JustDial)
  - OAuth2 callback handler
  - Webhook receivers for ad platforms
  - Sync logs
"""

import hashlib
import hmac
import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from api.leads_database import get_leads_db
from api.models.leads import (
    AdSourceConnection,
    CrmConnection,
    SyncLog,
)
from api.permissions import require_permission
from api.schemas.leads import (
    AdSourceCreateRequest,
    AdSourceResponse,
    CrmConnectionCreateRequest,
    CrmConnectionResponse,
    LeadCaptureRequest,
    SyncLogResponse,
)
from api.services import leads_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/crm-integrations", tags=["CRM Integrations"])


def _tenant_id(user: dict) -> str:
    tid = user.get("tenant_id")
    return str(tid) if tid else str(user.get("id", ""))


# ============================================
# CRM Connections CRUD
# ============================================

@router.get("/crm", response_model=list[CrmConnectionResponse])
async def list_crm_connections(
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "read")),
):
    """List all CRM connections for the tenant."""
    tenant_id = _tenant_id(user)
    result = await db.execute(
        select(CrmConnection)
        .where(CrmConnection.tenant_id == tenant_id)
        .order_by(CrmConnection.created_at.desc())
    )
    connections = result.scalars().all()
    return [_crm_to_response(c) for c in connections]


@router.post("/crm", response_model=CrmConnectionResponse, status_code=201)
async def create_crm_connection(
    body: CrmConnectionCreateRequest,
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "create")),
):
    """Create a new CRM connection (API key or custom webhook)."""
    tenant_id = _tenant_id(user)

    # Check if already exists
    result = await db.execute(
        select(CrmConnection).where(
            CrmConnection.tenant_id == tenant_id,
            CrmConnection.provider == body.provider,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"CRM connection for {body.provider} already exists")

    conn = CrmConnection(
        tenant_id=tenant_id,
        provider=body.provider,
        display_name=body.display_name or body.provider.title(),
        api_key=body.api_key,
        webhook_url=body.webhook_url,
        field_mapping=body.field_mapping,
        sync_direction=body.sync_direction,
        sync_interval_minutes=body.sync_interval_minutes,
    )
    db.add(conn)
    await db.flush()
    return _crm_to_response(conn)


@router.delete("/crm/{connection_id}")
async def delete_crm_connection(
    connection_id: str,
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "delete")),
):
    """Delete a CRM connection."""
    result = await db.execute(
        select(CrmConnection).where(CrmConnection.id == uuid.UUID(connection_id))
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    await db.delete(conn)
    return {"status": "deleted"}


@router.post("/crm/{connection_id}/sync")
async def trigger_crm_sync(
    connection_id: str,
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "create")),
):
    """Manually trigger a CRM sync (import leads from external CRM)."""
    result = await db.execute(
        select(CrmConnection).where(CrmConnection.id == uuid.UUID(connection_id))
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    # Log sync start
    sync_log = SyncLog(
        tenant_id=conn.tenant_id,
        connection_type="crm",
        provider=conn.provider,
        direction="import",
        status="in_progress",
    )
    db.add(sync_log)

    # TODO: Implement actual CRM API calls per provider
    # For now, mark as completed with placeholder
    sync_log.status = "success"
    sync_log.completed_at = datetime.now(timezone.utc)
    conn.last_sync_at = datetime.now(timezone.utc)
    conn.last_sync_status = "success"
    await db.flush()

    return {
        "status": "sync_triggered",
        "provider": conn.provider,
        "sync_id": str(sync_log.id),
    }


# ============================================
# OAuth2 Flow (for Zoho, HubSpot, Salesforce)
# ============================================

OAUTH_CONFIGS = {
    "zoho": {
        "auth_url": "https://accounts.zoho.in/oauth/v2/auth",
        "token_url": "https://accounts.zoho.in/oauth/v2/token",
        "scopes": "ZohoCRM.modules.ALL,ZohoCRM.settings.ALL",
    },
    "hubspot": {
        "auth_url": "https://app.hubspot.com/oauth/authorize",
        "token_url": "https://api.hubapi.com/oauth/v1/token",
        "scopes": "crm.objects.contacts.read crm.objects.contacts.write",
    },
    "salesforce": {
        "auth_url": "https://login.salesforce.com/services/oauth2/authorize",
        "token_url": "https://login.salesforce.com/services/oauth2/token",
        "scopes": "api refresh_token",
    },
    "pipedrive": {
        "auth_url": "https://oauth.pipedrive.com/oauth/authorize",
        "token_url": "https://oauth.pipedrive.com/oauth/token",
        "scopes": "",
    },
}


@router.get("/oauth/authorize/{provider}")
async def oauth_authorize(
    provider: str,
    user: dict = Depends(require_permission("voiceAI", "create")),
):
    """Get OAuth2 authorization URL for a CRM provider."""
    if provider not in OAUTH_CONFIGS:
        raise HTTPException(status_code=400, detail=f"OAuth not supported for {provider}")

    config = OAUTH_CONFIGS[provider]
    client_id = os.environ.get(f"{provider.upper()}_CLIENT_ID", "")
    redirect_uri = os.environ.get(
        "OAUTH_REDIRECT_URI",
        "https://voice.shadowmarket.ai/api/v1/crm-integrations/oauth/callback"
    )

    if not client_id:
        raise HTTPException(status_code=500, detail=f"{provider.upper()}_CLIENT_ID not configured")

    tenant_id = _tenant_id(user)
    state = f"{tenant_id}_{provider}"

    auth_url = (
        f"{config['auth_url']}?"
        f"client_id={client_id}&"
        f"redirect_uri={redirect_uri}&"
        f"scope={config['scopes']}&"
        f"response_type=code&"
        f"state={state}&"
        f"access_type=offline"
    )

    return {"auth_url": auth_url, "provider": provider}


@router.get("/oauth/callback")
async def oauth_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_leads_db),
):
    """OAuth2 callback — exchanges code for tokens and stores them."""
    import aiohttp

    parts = state.split("_", 1)
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    tenant_id, provider = parts
    if provider not in OAUTH_CONFIGS:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

    config = OAUTH_CONFIGS[provider]
    client_id = os.environ.get(f"{provider.upper()}_CLIENT_ID", "")
    client_secret = os.environ.get(f"{provider.upper()}_CLIENT_SECRET", "")
    redirect_uri = os.environ.get(
        "OAUTH_REDIRECT_URI",
        "https://voice.shadowmarket.ai/api/v1/crm-integrations/oauth/callback"
    )

    # Exchange code for tokens
    async with aiohttp.ClientSession() as session:
        async with session.post(
            config["token_url"],
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
            },
        ) as resp:
            if resp.status != 200:
                error_text = await resp.text()
                logger.error("OAuth token exchange failed: %s", error_text)
                raise HTTPException(status_code=400, detail="OAuth token exchange failed")
            token_data = await resp.json()

    # Store connection
    result = await db.execute(
        select(CrmConnection).where(
            CrmConnection.tenant_id == tenant_id,
            CrmConnection.provider == provider,
        )
    )
    conn = result.scalar_one_or_none()

    if conn:
        conn.access_token = token_data.get("access_token")
        conn.refresh_token = token_data.get("refresh_token")
        conn.api_domain = token_data.get("api_domain")
        if token_data.get("expires_in"):
            from datetime import timedelta
            conn.token_expires_at = datetime.now(timezone.utc) + timedelta(
                seconds=token_data["expires_in"]
            )
        conn.is_active = True
    else:
        conn = CrmConnection(
            tenant_id=tenant_id,
            provider=provider,
            display_name=provider.title(),
            access_token=token_data.get("access_token"),
            refresh_token=token_data.get("refresh_token"),
            api_domain=token_data.get("api_domain"),
        )
        if token_data.get("expires_in"):
            from datetime import timedelta
            conn.token_expires_at = datetime.now(timezone.utc) + timedelta(
                seconds=token_data["expires_in"]
            )
        db.add(conn)

    await db.flush()
    await db.commit()

    # Redirect to frontend integrations page
    return {"status": "connected", "provider": provider}


# ============================================
# Ad Source Connections CRUD
# ============================================

@router.get("/ad-sources", response_model=list[AdSourceResponse])
async def list_ad_sources(
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "read")),
):
    """List all ad source connections."""
    tenant_id = _tenant_id(user)
    result = await db.execute(
        select(AdSourceConnection)
        .where(AdSourceConnection.tenant_id == tenant_id)
        .order_by(AdSourceConnection.created_at.desc())
    )
    sources = result.scalars().all()
    return [_adsource_to_response(s) for s in sources]


@router.post("/ad-sources", response_model=AdSourceResponse, status_code=201)
async def create_ad_source(
    body: AdSourceCreateRequest,
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "create")),
):
    """Create a new ad source connection."""
    tenant_id = _tenant_id(user)

    # Generate webhook URL for this tenant + provider
    webhook_secret = hashlib.sha256(
        f"{tenant_id}:{body.provider}:{os.urandom(16).hex()}".encode()
    ).hexdigest()[:32]

    base_url = os.environ.get("APP_URL", "https://voice.shadowmarket.ai")
    webhook_url = f"{base_url}/api/v1/crm-integrations/webhooks/{body.provider}/{tenant_id}"

    source = AdSourceConnection(
        tenant_id=tenant_id,
        provider=body.provider,
        display_name=body.display_name or body.provider.title(),
        auth_type=body.auth_type,
        credentials=body.credentials,
        webhook_url=webhook_url,
        webhook_secret=webhook_secret,
        polling_interval_minutes=body.polling_interval_minutes,
        auto_assign_agent_id=body.auto_assign_agent_id,
        default_tags=body.default_tags,
    )
    db.add(source)
    await db.flush()
    return _adsource_to_response(source)


@router.delete("/ad-sources/{source_id}")
async def delete_ad_source(
    source_id: str,
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "delete")),
):
    """Delete an ad source connection."""
    result = await db.execute(
        select(AdSourceConnection).where(AdSourceConnection.id == uuid.UUID(source_id))
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Ad source not found")
    await db.delete(source)
    return {"status": "deleted"}


# ============================================
# Webhook Receivers (for ad platforms)
# ============================================

@router.post("/webhooks/facebook/{tenant_id}")
async def facebook_webhook(
    tenant_id: str,
    request: Request,
    db: AsyncSession = Depends(get_leads_db),
):
    """Receive Facebook Lead Ad form submissions."""
    body = await request.json()
    logger.info("Facebook webhook for tenant %s: %s", tenant_id, body)

    # Parse Facebook Lead Ads payload
    entries = body.get("entry", [])
    created = 0

    for entry in entries:
        changes = entry.get("changes", [])
        for change in changes:
            if change.get("field") != "leadgen":
                continue
            value = change.get("value", {})
            lead_data = {
                "name": value.get("full_name"),
                "email": value.get("email"),
                "phone": value.get("phone_number"),
                "source": "facebook",
                "source_campaign": value.get("ad_name") or value.get("campaign_name"),
                "source_medium": "paid",
                "tags": ["facebook", "lead_ad"],
            }
            await leads_service.capture_lead(db, tenant_id, lead_data)
            created += 1

    await db.commit()
    return {"status": "ok", "leads_created": created}


@router.post("/webhooks/justdial/{tenant_id}")
async def justdial_webhook(
    tenant_id: str,
    request: Request,
    db: AsyncSession = Depends(get_leads_db),
):
    """Receive JustDial lead submissions."""
    body = await request.json()
    logger.info("JustDial webhook for tenant %s", tenant_id)

    lead_data = {
        "name": body.get("name") or body.get("leadname"),
        "phone": body.get("phone") or body.get("mobile"),
        "email": body.get("email"),
        "location_city": body.get("city") or body.get("area"),
        "business_type": body.get("category"),
        "source": "justdial",
        "source_medium": "organic",
        "tags": ["justdial"],
    }

    lead, is_new = await leads_service.capture_lead(db, tenant_id, lead_data)
    await db.commit()
    return {"status": "ok", "lead_id": str(lead.id), "is_new": is_new}


@router.post("/webhooks/indiamart/{tenant_id}")
async def indiamart_webhook(
    tenant_id: str,
    request: Request,
    db: AsyncSession = Depends(get_leads_db),
):
    """Receive IndiaMart lead submissions (or polled data)."""
    body = await request.json()
    logger.info("IndiaMart webhook for tenant %s", tenant_id)

    # IndiaMart can send single or batch
    leads_data = body if isinstance(body, list) else [body]
    created = 0

    for item in leads_data:
        lead_data = {
            "name": item.get("SENDER_NAME") or item.get("name"),
            "phone": item.get("SENDER_MOBILE") or item.get("mobile"),
            "email": item.get("SENDER_EMAIL") or item.get("email"),
            "location_city": item.get("SENDER_CITY") or item.get("city"),
            "location_state": item.get("SENDER_STATE") or item.get("state"),
            "business_name": item.get("SENDER_COMPANY") or item.get("company"),
            "intent": "inquiry",
            "source": "indiamart",
            "source_medium": "marketplace",
            "tags": ["indiamart"],
            "custom_fields": {},
        }
        product = item.get("QUERY_PRODUCT_NAME") or item.get("product")
        if product:
            lead_data["custom_fields"]["product_inquiry"] = product
        query = item.get("QUERY_MESSAGE") or item.get("message")
        if query:
            lead_data["custom_fields"]["inquiry_message"] = query

        await leads_service.capture_lead(db, tenant_id, lead_data)
        created += 1

    await db.commit()
    return {"status": "ok", "leads_processed": created}


@router.post("/webhooks/google/{tenant_id}")
async def google_webhook(
    tenant_id: str,
    request: Request,
    db: AsyncSession = Depends(get_leads_db),
):
    """Receive Google Ads form extension submissions."""
    body = await request.json()
    logger.info("Google Ads webhook for tenant %s", tenant_id)

    lead_data = {
        "name": body.get("name") or body.get("full_name"),
        "phone": body.get("phone") or body.get("phone_number"),
        "email": body.get("email"),
        "source": "google",
        "source_campaign": body.get("campaign_name"),
        "source_medium": "paid",
        "utm_source": "google",
        "utm_medium": "cpc",
        "utm_campaign": body.get("campaign_name"),
        "tags": ["google_ads"],
    }

    lead, is_new = await leads_service.capture_lead(db, tenant_id, lead_data)
    await db.commit()
    return {"status": "ok", "lead_id": str(lead.id), "is_new": is_new}


@router.post("/webhooks/generic/{tenant_id}")
async def generic_webhook(
    tenant_id: str,
    request: Request,
    db: AsyncSession = Depends(get_leads_db),
):
    """Generic webhook — accepts any JSON with name/email/phone fields."""
    body = await request.json()
    logger.info("Generic webhook for tenant %s", tenant_id)

    lead_data = {
        "name": body.get("name") or body.get("full_name"),
        "phone": body.get("phone") or body.get("mobile") or body.get("phone_number"),
        "email": body.get("email") or body.get("email_address"),
        "business_name": body.get("company") or body.get("business_name"),
        "location_city": body.get("city") or body.get("location"),
        "source": body.get("source", "webhook"),
        "source_campaign": body.get("campaign"),
        "tags": body.get("tags", ["webhook"]),
    }

    lead, is_new = await leads_service.capture_lead(db, tenant_id, lead_data)
    await db.commit()
    return {"status": "ok", "lead_id": str(lead.id), "is_new": is_new}


# ============================================
# Sync Logs
# ============================================

@router.get("/sync-logs", response_model=list[SyncLogResponse])
async def list_sync_logs(
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "read")),
):
    """Get recent sync logs."""
    tenant_id = _tenant_id(user)
    result = await db.execute(
        select(SyncLog)
        .where(SyncLog.tenant_id == tenant_id)
        .order_by(SyncLog.started_at.desc())
        .limit(limit)
    )
    logs = result.scalars().all()
    return [
        SyncLogResponse(
            id=str(l.id),
            tenant_id=l.tenant_id,
            connection_type=l.connection_type,
            provider=l.provider,
            direction=l.direction,
            status=l.status,
            records_processed=l.records_processed,
            records_created=l.records_created,
            records_updated=l.records_updated,
            records_skipped=l.records_skipped,
            started_at=l.started_at.isoformat() if l.started_at else "",
            completed_at=l.completed_at.isoformat() if l.completed_at else None,
        )
        for l in logs
    ]


# ============================================
# Response Converters
# ============================================

def _crm_to_response(c: CrmConnection) -> CrmConnectionResponse:
    return CrmConnectionResponse(
        id=str(c.id),
        tenant_id=c.tenant_id,
        provider=c.provider,
        display_name=c.display_name,
        sync_direction=c.sync_direction,
        sync_interval_minutes=c.sync_interval_minutes,
        last_sync_at=c.last_sync_at.isoformat() if c.last_sync_at else None,
        last_sync_status=c.last_sync_status,
        is_active=c.is_active,
        has_access_token=bool(c.access_token),
        has_api_key=bool(c.api_key),
        field_mapping=c.field_mapping,
        created_at=c.created_at.isoformat() if c.created_at else "",
    )


def _adsource_to_response(s: AdSourceConnection) -> AdSourceResponse:
    return AdSourceResponse(
        id=str(s.id),
        tenant_id=s.tenant_id,
        provider=s.provider,
        display_name=s.display_name,
        auth_type=s.auth_type,
        webhook_url=s.webhook_url,
        polling_interval_minutes=s.polling_interval_minutes,
        auto_assign_agent_id=s.auto_assign_agent_id,
        default_tags=s.default_tags,
        is_active=s.is_active,
        last_poll_at=s.last_poll_at.isoformat() if s.last_poll_at else None,
        created_at=s.created_at.isoformat() if s.created_at else "",
    )
