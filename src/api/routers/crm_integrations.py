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
        select(CrmConnection).where(CrmConnection.id == connection_id)
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
        select(CrmConnection).where(CrmConnection.id == connection_id)
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
        select(AdSourceConnection).where(AdSourceConnection.id == source_id)
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Ad source not found")
    await db.delete(source)
    return {"status": "deleted"}


# ============================================
# Webhook Receivers (for ad platforms)
# ============================================

@router.get("/webhooks/facebook")
async def facebook_webhook_verify(request: Request):
    """Handle Facebook webhook verification challenge (single global endpoint)."""
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    verify_token = os.environ.get("FACEBOOK_WEBHOOK_VERIFY_TOKEN", "voiceflow_fb_verify")
    if mode == "subscribe" and token == verify_token:
        logger.info("Facebook webhook verified")
        return int(challenge)
    raise HTTPException(status_code=403, detail="Verification failed")


# Keep old tenant-specific URL for backwards compatibility
@router.get("/webhooks/facebook/{tenant_id}")
async def facebook_webhook_verify_legacy(tenant_id: str, request: Request):
    return await facebook_webhook_verify(request)


async def _find_tenant_by_page_id(db: AsyncSession, page_id: str):
    """Find which tenant owns a Facebook page by checking stored credentials."""
    result = await db.execute(
        select(AdSourceConnection).where(
            AdSourceConnection.provider == "facebook",
            AdSourceConnection.is_active == True,
        )
    )
    connections = result.scalars().all()

    for conn in connections:
        creds = conn.credentials or {}
        # Check subscribed_forms for matching page_id
        for form in creds.get("subscribed_forms", []):
            if str(form.get("page_id")) == str(page_id):
                return conn.tenant_id, conn
        # Also store page_ids at connection level if available
        if str(page_id) in [str(p) for p in creds.get("page_ids", [])]:
            return conn.tenant_id, conn

    return None, None


async def _process_fb_lead(db: AsyncSession, tenant_id: str, conn, page_id: str, leadgen_id: str, value: dict):
    """Fetch full lead data from Graph API and save to CRM."""
    import aiohttp

    if not leadgen_id or not conn or not conn.credentials:
        # Fallback: use whatever data is in the webhook payload
        lead_data = {
            "name": value.get("full_name", ""),
            "email": value.get("email", ""),
            "phone": value.get("phone_number", ""),
            "source": "facebook",
            "source_campaign": value.get("ad_name") or value.get("campaign_name"),
            "source_medium": "paid",
            "tags": ["facebook", "lead_ad"],
        }
        await leads_service.capture_lead(db, tenant_id, lead_data)
        return True

    try:
        user_token = conn.credentials["access_token"]
        page_token = await _get_fb_page_token(user_token, page_id)

        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"https://graph.facebook.com/v21.0/{leadgen_id}",
                params={"access_token": page_token, "fields": "id,created_time,field_data,ad_id,ad_name,campaign_name,form_id"},
            ) as resp:
                if resp.status != 200:
                    logger.warning("Failed to fetch lead %s: %s", leadgen_id, await resp.text())
                    return False
                lead_detail = await resp.json()

        field_data = {f["name"].lower(): f["values"][0] if f.get("values") else ""
                      for f in lead_detail.get("field_data", [])}

        name = (
            field_data.get("full_name") or field_data.get("full name")
            or field_data.get("name") or field_data.get("first_name", "")
        )
        last_name = field_data.get("last_name") or field_data.get("last name") or ""
        if last_name and name:
            name = f"{name} {last_name}"

        lead_data = {
            "name": name,
            "email": field_data.get("email") or field_data.get("email_address") or field_data.get("work_email") or "",
            "phone": field_data.get("phone_number") or field_data.get("phone") or field_data.get("mobile_number") or field_data.get("mobile") or "",
            "business_name": field_data.get("company_name") or field_data.get("company") or field_data.get("business_name") or "",
            "location_city": field_data.get("city") or field_data.get("location") or "",
            "location_state": field_data.get("state") or "",
            "location_country": field_data.get("country") or "",
            "source": "facebook",
            "source_campaign": lead_detail.get("ad_name") or lead_detail.get("campaign_name") or f"form_{lead_detail.get('form_id', '')}",
            "source_medium": "paid",
            "tags": ["facebook", "lead_ad"],
        }

        await leads_service.capture_lead(db, tenant_id, lead_data)
        return True

    except Exception as exc:
        logger.error("Error fetching FB lead %s: %s", leadgen_id, exc)
        return False


@router.post("/webhooks/facebook")
async def facebook_webhook_global(
    request: Request,
    db: AsyncSession = Depends(get_leads_db),
):
    """Global Facebook webhook — routes leads to correct tenant by page_id."""
    body = await request.json()
    logger.info("Facebook webhook (global): %s", body)

    entries = body.get("entry", [])
    created = 0

    for entry in entries:
        page_id = str(entry.get("id", ""))
        tenant_id, conn = await _find_tenant_by_page_id(db, page_id)

        if not tenant_id:
            logger.warning("No tenant found for Facebook page %s — skipping", page_id)
            continue

        changes = entry.get("changes", [])
        for change in changes:
            if change.get("field") != "leadgen":
                continue
            value = change.get("value", {})
            leadgen_id = value.get("leadgen_id")

            if await _process_fb_lead(db, tenant_id, conn, page_id, leadgen_id, value):
                created += 1

    await db.commit()
    return {"status": "ok", "leads_created": created}


# Keep old tenant-specific URL for backwards compatibility
@router.post("/webhooks/facebook/{tenant_id}")
async def facebook_webhook_legacy(
    tenant_id: str,
    request: Request,
    db: AsyncSession = Depends(get_leads_db),
):
    """Legacy per-tenant Facebook webhook — redirects to global handler."""
    return await facebook_webhook_global(request, db)


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
# Facebook Lead Ads — Pages & Forms
# ============================================

@router.post("/facebook/token")
async def facebook_save_token(
    request: Request,
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "create")),
):
    """Save Facebook user access token (from FB Login SDK on frontend)."""
    body = await request.json()
    access_token = body.get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="access_token required")

    tenant_id = _tenant_id(user)

    # Exchange for long-lived token
    import aiohttp
    fb_app_id = os.environ.get("FACEBOOK_APP_ID", "")
    fb_app_secret = os.environ.get("FACEBOOK_APP_SECRET", "")

    long_token = access_token
    if fb_app_id and fb_app_secret:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    "https://graph.facebook.com/v21.0/oauth/access_token",
                    params={
                        "grant_type": "fb_exchange_token",
                        "client_id": fb_app_id,
                        "client_secret": fb_app_secret,
                        "fb_exchange_token": access_token,
                    },
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        long_token = data.get("access_token", access_token)
        except Exception as exc:
            logger.warning("FB long-lived token exchange failed: %s", exc)

    # Store in ad_source_connections
    result = await db.execute(
        select(AdSourceConnection).where(
            AdSourceConnection.tenant_id == tenant_id,
            AdSourceConnection.provider == "facebook",
        )
    )
    conn = result.scalar_one_or_none()
    if conn:
        conn.credentials = {"access_token": long_token}
    else:
        conn = AdSourceConnection(
            tenant_id=tenant_id,
            provider="facebook",
            display_name="Facebook Lead Ads",
            auth_type="oauth2",
            credentials={"access_token": long_token},
        )
        db.add(conn)
    await db.flush()
    await db.commit()

    return {"status": "connected"}


@router.get("/facebook/pages")
async def facebook_get_pages(
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "read")),
):
    """Get list of Facebook pages the user manages."""
    import aiohttp

    tenant_id = _tenant_id(user)
    result = await db.execute(
        select(AdSourceConnection).where(
            AdSourceConnection.tenant_id == tenant_id,
            AdSourceConnection.provider == "facebook",
        )
    )
    conn = result.scalar_one_or_none()
    if not conn or not conn.credentials or not conn.credentials.get("access_token"):
        raise HTTPException(status_code=400, detail="Facebook not connected. Click 'Continue with Facebook' first.")

    token = conn.credentials["access_token"]
    async with aiohttp.ClientSession() as session:
        async with session.get(
            "https://graph.facebook.com/v21.0/me/accounts",
            params={"access_token": token, "fields": "id,name,access_token"},
        ) as resp:
            if resp.status != 200:
                error = await resp.text()
                raise HTTPException(status_code=400, detail=f"Facebook API error: {error}")
            data = await resp.json()

    pages = [{"id": p["id"], "name": p["name"], "access_token": p.get("access_token", "")} for p in data.get("data", [])]
    return {"pages": pages}


async def _get_fb_page_token(user_token: str, page_id: str) -> str:
    """Get the page access token for a specific page using the user token."""
    import aiohttp
    async with aiohttp.ClientSession() as session:
        async with session.get(
            "https://graph.facebook.com/v21.0/me/accounts",
            params={"access_token": user_token, "fields": "id,access_token"},
        ) as resp:
            if resp.status != 200:
                raise HTTPException(status_code=400, detail="Failed to get page token")
            data = await resp.json()
    for p in data.get("data", []):
        if p["id"] == page_id:
            return p["access_token"]
    raise HTTPException(status_code=400, detail="Page not found or no access")


@router.get("/facebook/forms/{page_id}")
async def facebook_get_forms(
    page_id: str,
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "read")),
):
    """Get lead gen forms for a specific Facebook page."""
    import aiohttp

    tenant_id = _tenant_id(user)
    result = await db.execute(
        select(AdSourceConnection).where(
            AdSourceConnection.tenant_id == tenant_id,
            AdSourceConnection.provider == "facebook",
        )
    )
    conn = result.scalar_one_or_none()
    if not conn or not conn.credentials:
        raise HTTPException(status_code=400, detail="Facebook not connected")

    user_token = conn.credentials["access_token"]
    page_token = await _get_fb_page_token(user_token, page_id)

    async with aiohttp.ClientSession() as session:
        async with session.get(
            f"https://graph.facebook.com/v21.0/{page_id}/leadgen_forms",
            params={"access_token": page_token, "fields": "id,name,status"},
        ) as resp:
            if resp.status != 200:
                error = await resp.text()
                raise HTTPException(status_code=400, detail=f"Facebook API error: {error}")
            data = await resp.json()

    forms = [{"id": f["id"], "name": f["name"], "status": f.get("status", "")} for f in data.get("data", [])]
    return {"forms": forms}


@router.post("/facebook/subscribe")
async def facebook_subscribe_form(
    request: Request,
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "create")),
):
    """Subscribe to a Facebook lead gen form to receive leads via webhook."""
    body = await request.json()
    page_id = body.get("page_id")
    page_name = body.get("page_name", "")
    form_id = body.get("form_id")
    form_name = body.get("form_name", "")

    if not page_id or not form_id:
        raise HTTPException(status_code=400, detail="page_id and form_id required")

    tenant_id = _tenant_id(user)

    # Subscribe the page to leadgen webhook
    result = await db.execute(
        select(AdSourceConnection).where(
            AdSourceConnection.tenant_id == tenant_id,
            AdSourceConnection.provider == "facebook",
        )
    )
    conn = result.scalar_one_or_none()
    if not conn or not conn.credentials:
        raise HTTPException(status_code=400, detail="Facebook not connected")

    # Subscribe the page to leadgen webhooks via Graph API
    import aiohttp
    try:
        user_token = conn.credentials["access_token"]
        page_token = await _get_fb_page_token(user_token, page_id)
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"https://graph.facebook.com/v21.0/{page_id}/subscribed_apps",
                params={"access_token": page_token, "subscribed_fields": "leadgen"},
            ) as resp:
                if resp.status == 200:
                    logger.info("Page %s subscribed to leadgen webhooks", page_id)
                else:
                    logger.warning("Failed to subscribe page %s to webhooks: %s", page_id, await resp.text())
    except Exception as exc:
        logger.warning("Webhook subscription failed for page %s: %s", page_id, exc)

    # Store the form subscription in credentials
    creds = conn.credentials or {}
    forms = creds.get("subscribed_forms", [])
    # Avoid duplicates
    if not any(f.get("form_id") == form_id for f in forms):
        forms.append({
            "page_id": page_id,
            "page_name": page_name,
            "form_id": form_id,
            "form_name": form_name,
        })
    creds["subscribed_forms"] = forms
    # Also track page_ids for webhook routing (page_id → tenant lookup)
    page_ids = list(set(creds.get("page_ids", []) + [page_id]))
    creds["page_ids"] = page_ids
    conn.credentials = creds
    conn.is_active = True
    await db.flush()
    await db.commit()

    return {"status": "subscribed", "form_id": form_id, "page_name": page_name}


@router.get("/facebook/subscribed-forms")
async def facebook_list_subscribed_forms(
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "read")),
):
    """List all subscribed Facebook lead forms."""
    tenant_id = _tenant_id(user)
    result = await db.execute(
        select(AdSourceConnection).where(
            AdSourceConnection.tenant_id == tenant_id,
            AdSourceConnection.provider == "facebook",
        )
    )
    conn = result.scalar_one_or_none()
    if not conn or not conn.credentials:
        return {"forms": [], "connected": False}

    forms = conn.credentials.get("subscribed_forms", [])
    return {"forms": forms, "connected": True}


@router.delete("/facebook/forms/{form_id}")
async def facebook_unsubscribe_form(
    form_id: str,
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "delete")),
):
    """Remove a subscribed Facebook form."""
    tenant_id = _tenant_id(user)
    result = await db.execute(
        select(AdSourceConnection).where(
            AdSourceConnection.tenant_id == tenant_id,
            AdSourceConnection.provider == "facebook",
        )
    )
    conn = result.scalar_one_or_none()
    if not conn or not conn.credentials:
        raise HTTPException(status_code=404, detail="Facebook not connected")

    creds = conn.credentials or {}
    forms = [f for f in creds.get("subscribed_forms", []) if f.get("form_id") != form_id]
    creds["subscribed_forms"] = forms
    conn.credentials = creds
    await db.flush()
    await db.commit()

    return {"status": "removed"}


@router.post("/facebook/pull-leads")
async def facebook_pull_leads(
    request: Request,
    db: AsyncSession = Depends(get_leads_db),
    user: dict = Depends(require_permission("voiceAI", "create")),
):
    """Pull all existing leads from subscribed Facebook Lead Ad forms into the CRM."""
    import aiohttp

    tenant_id = _tenant_id(user)
    result = await db.execute(
        select(AdSourceConnection).where(
            AdSourceConnection.tenant_id == tenant_id,
            AdSourceConnection.provider == "facebook",
        )
    )
    conn = result.scalar_one_or_none()
    if not conn or not conn.credentials:
        raise HTTPException(status_code=400, detail="Facebook not connected")

    user_token = conn.credentials.get("access_token")
    if not user_token:
        raise HTTPException(status_code=400, detail="No Facebook access token")

    body = await request.json()
    page_id = body.get("page_id")
    form_id = body.get("form_id")

    if not page_id:
        raise HTTPException(status_code=400, detail="page_id required")

    # Get page access token
    page_token = await _get_fb_page_token(user_token, page_id)

    # If form_id provided, pull leads from that specific form
    # Otherwise pull from all forms on the page
    form_ids = []
    if form_id:
        form_ids = [form_id]
    else:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"https://graph.facebook.com/v21.0/{page_id}/leadgen_forms",
                params={"access_token": page_token, "fields": "id,name,status"},
            ) as resp:
                if resp.status == 200:
                    forms_data = await resp.json()
                    form_ids = [f["id"] for f in forms_data.get("data", [])]

    total_imported = 0
    total_skipped = 0

    for fid in form_ids:
        # Paginate through all leads for each form
        url = f"https://graph.facebook.com/v21.0/{fid}/leads"
        params = {"access_token": page_token, "fields": "id,created_time,field_data,ad_id,ad_name,campaign_name,form_id", "limit": "100"}

        while url:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as resp:
                    if resp.status != 200:
                        logger.warning("Failed to fetch leads for form %s: %s", fid, await resp.text())
                        break
                    leads_data = await resp.json()

            for fb_lead in leads_data.get("data", []):
                field_data = {f["name"].lower(): f["values"][0] if f.get("values") else ""
                              for f in fb_lead.get("field_data", [])}

                # Map all common Facebook form field name variants
                name = (
                    field_data.get("full_name") or field_data.get("full name")
                    or field_data.get("name") or field_data.get("first_name", "")
                )
                last_name = field_data.get("last_name") or field_data.get("last name") or ""
                if last_name and name:
                    name = f"{name} {last_name}"

                lead_data = {
                    "name": name,
                    "email": (
                        field_data.get("email") or field_data.get("email_address")
                        or field_data.get("work_email") or ""
                    ),
                    "phone": (
                        field_data.get("phone_number") or field_data.get("phone")
                        or field_data.get("mobile_number") or field_data.get("mobile")
                        or field_data.get("contact_number") or ""
                    ),
                    "business_name": (
                        field_data.get("company_name") or field_data.get("company")
                        or field_data.get("business_name") or field_data.get("organization")
                        or ""
                    ),
                    "location_city": field_data.get("city") or field_data.get("location") or "",
                    "location_state": field_data.get("state") or field_data.get("province") or "",
                    "location_country": field_data.get("country") or "",
                    "source": "facebook",
                    "source_campaign": fb_lead.get("campaign_name") or fb_lead.get("ad_name") or f"form_{fid}",
                    "source_medium": "paid",
                    "tags": ["facebook", "lead_ad", "imported"],
                }

                # Collect ALL form fields + FB metadata as custom_fields
                known_keys = {
                    "full_name", "full name", "name", "first_name", "last_name", "last name",
                    "email", "email_address", "work_email",
                    "phone_number", "phone", "mobile_number", "mobile", "contact_number",
                    "company_name", "company", "business_name", "organization",
                    "city", "location", "state", "province", "country",
                }
                custom_fields = {k: v for k, v in field_data.items() if k not in known_keys and v}
                # Add Facebook metadata
                custom_fields["fb_lead_id"] = fb_lead.get("id", "")
                custom_fields["fb_created_time"] = fb_lead.get("created_time", "")
                custom_fields["fb_form_id"] = fid
                custom_fields["fb_platform"] = "facebook"
                if fb_lead.get("ad_name"):
                    custom_fields["fb_ad_name"] = fb_lead["ad_name"]
                if fb_lead.get("campaign_name"):
                    custom_fields["fb_campaign_name"] = fb_lead["campaign_name"]
                if fb_lead.get("form_id"):
                    custom_fields["fb_form_id"] = fb_lead["form_id"]
                # Get form name from our forms list if available
                for sf in (conn.credentials or {}).get("subscribed_forms", []):
                    if sf.get("form_id") == fid:
                        custom_fields["fb_form_name"] = sf.get("form_name", "")
                        custom_fields["fb_page_name"] = sf.get("page_name", "")
                        break
                lead_data["custom_fields"] = custom_fields

                # Skip leads with no contact info
                if not lead_data["email"] and not lead_data["phone"] and not lead_data["name"]:
                    total_skipped += 1
                    continue

                _lead, is_new = await leads_service.capture_lead(db, tenant_id, lead_data)
                if is_new:
                    total_imported += 1
                else:
                    total_skipped += 1

            # Next page
            paging = leads_data.get("paging", {})
            url = paging.get("next")
            params = {}  # next URL already has params

    await db.commit()

    return {
        "status": "done",
        "imported": total_imported,
        "skipped": total_skipped,
        "message": f"Imported {total_imported} new leads, {total_skipped} skipped (duplicates or empty)",
    }


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
