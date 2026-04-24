"""
IndiaMart Lead Poller
=====================
Background service that polls IndiaMart's CRM API every 5 minutes
to fetch new buyer inquiries and ingest them as leads.

IndiaMart API: https://mapi.indiamart.com/wservce/crm/crmListing/v2/
Required param: glusr_crm_key (the CRM key from IndiaMart dashboard)
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

import aiohttp
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.leads import AdSourceConnection, SyncLog
from api.services import leads_service

logger = logging.getLogger(__name__)

INDIAMART_API_URL = "https://mapi.indiamart.com/wservce/crm/crmListing/v2/"
DEFAULT_POLL_INTERVAL = 300  # 5 minutes


async def fetch_indiamart_leads(
    crm_key: str,
    start_time: str | None = None,
    end_time: str | None = None,
) -> list[dict]:
    """Call IndiaMart CRM API and return lead records."""
    params = {"glusr_crm_key": crm_key}
    if start_time:
        params["start_time"] = start_time
    if end_time:
        params["end_time"] = end_time

    async with aiohttp.ClientSession() as session:
        async with session.get(INDIAMART_API_URL, params=params, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            if resp.status != 200:
                text = await resp.text()
                logger.error("IndiaMart API error %s: %s", resp.status, text[:200])
                return []
            data = await resp.json(content_type=None)

    # IndiaMart returns {"STATUS": "SUCCESS", "TOTAL_RECORDS": N, ...} with records in list
    if isinstance(data, dict):
        status = data.get("STATUS", "").upper()
        if status == "SUCCESS":
            # Records are in the response as a list under various keys
            # or the response itself is a list of records
            records = data.get("JEESSION") or data.get("records") or []
            if not records and "JEESSION" not in data:
                # Some API versions return flat list
                return []
            return records if isinstance(records, list) else []
        code = data.get("CODE")
        if code == "ABORTSESSION":
            logger.warning("IndiaMart API: session expired or invalid key")
            return []
        # If the response is a list of lead dicts directly
        if "SENDER_NAME" in data or "UNIQUE_QUERY_ID" in data:
            return [data]
        logger.warning("IndiaMart API unexpected response: %s", str(data)[:300])
        return []

    if isinstance(data, list):
        return data

    return []


def _map_indiamart_lead(item: dict) -> dict:
    """Map IndiaMart API fields to our lead capture format."""
    lead_data = {
        "name": item.get("SENDER_NAME") or item.get("name"),
        "phone": item.get("SENDER_MOBILE") or item.get("SENDER_MOBILE_ALT") or item.get("mobile"),
        "email": item.get("SENDER_EMAIL") or item.get("SENDER_EMAIL_ALT") or item.get("email"),
        "location_city": item.get("SENDER_CITY") or item.get("city"),
        "location_state": item.get("SENDER_STATE") or item.get("state"),
        "location_country": item.get("SENDER_COUNTRY_ISO") or "IN",
        "business_name": item.get("SENDER_COMPANY") or item.get("company"),
        "business_type": item.get("SENDER_COMPANY_TYPE"),
        "intent": "inquiry",
        "source": "indiamart",
        "source_medium": "marketplace",
        "source_campaign": item.get("QUERY_PRODUCT_NAME"),
        "phone_country": "IN",
        "tags": ["indiamart"],
        "custom_fields": {},
    }

    # Rich detail fields
    product = item.get("QUERY_PRODUCT_NAME") or item.get("product")
    if product:
        lead_data["custom_fields"]["product_inquiry"] = product

    message = item.get("QUERY_MESSAGE") or item.get("message") or item.get("QUERY_MCAT_NAME")
    if message:
        lead_data["custom_fields"]["inquiry_message"] = message

    quantity = item.get("QUERY_QTY")
    if quantity:
        lead_data["custom_fields"]["quantity"] = str(quantity)

    unit = item.get("QUERY_UNIT")
    if unit:
        lead_data["custom_fields"]["unit"] = unit

    query_id = item.get("UNIQUE_QUERY_ID")
    if query_id:
        lead_data["custom_fields"]["indiamart_query_id"] = str(query_id)

    query_time = item.get("QUERY_TIME")
    if query_time:
        lead_data["custom_fields"]["inquiry_time"] = query_time

    sender_address = item.get("SENDER_ADDRESS")
    if sender_address:
        lead_data["custom_fields"]["address"] = sender_address

    return lead_data


async def poll_indiamart_for_tenant(
    db: AsyncSession,
    connection: AdSourceConnection,
) -> dict:
    """Poll IndiaMart API for a single tenant's connection and ingest leads."""
    credentials = connection.credentials or {}
    crm_key = credentials.get("api_key") or credentials.get("crm_key")
    if not crm_key:
        return {"error": "No CRM key configured", "created": 0, "updated": 0}

    # Calculate time window: from last_poll_at (or 24h ago) to now
    now = datetime.now(timezone.utc)
    ist_offset = timedelta(hours=5, minutes=30)

    if connection.last_poll_at:
        start_dt = connection.last_poll_at - timedelta(minutes=2)  # 2min overlap for safety
    else:
        start_dt = now - timedelta(hours=24)

    # IndiaMart API expects IST timestamps: DD-Mon-YYYY HH:MM:SS
    start_ist = start_dt + ist_offset
    end_ist = now + ist_offset
    start_time = start_ist.strftime("%d-%b-%Y %H:%M:%S")
    end_time = end_ist.strftime("%d-%b-%Y %H:%M:%S")

    logger.info(
        "Polling IndiaMart for tenant %s (window: %s to %s)",
        connection.tenant_id, start_time, end_time,
    )

    # Log sync start
    sync_log = SyncLog(
        tenant_id=connection.tenant_id,
        connection_type="ad_source",
        provider="indiamart",
        direction="import",
        status="running",
        started_at=now,
        records_processed=0,
    )
    db.add(sync_log)
    await db.flush()

    try:
        records = await fetch_indiamart_leads(crm_key, start_time, end_time)
    except Exception as exc:
        logger.error("IndiaMart API call failed for tenant %s: %s", connection.tenant_id, exc)
        sync_log.status = "failed"
        sync_log.errors = [str(exc)[:500]]
        sync_log.completed_at = datetime.now(timezone.utc)
        connection.last_poll_at = now
        await db.flush()
        return {"error": str(exc), "created": 0, "updated": 0}

    created = 0
    updated = 0

    for item in records:
        # Skip empty/invalid records
        name = item.get("SENDER_NAME") or item.get("name")
        phone = item.get("SENDER_MOBILE") or item.get("mobile")
        email = item.get("SENDER_EMAIL") or item.get("email")
        if not phone and not email:
            continue

        lead_data = _map_indiamart_lead(item)
        try:
            lead, is_new = await leads_service.capture_lead(
                db, connection.tenant_id, lead_data
            )
            if is_new:
                created += 1
            else:
                updated += 1
        except Exception as exc:
            logger.warning("Failed to capture IndiaMart lead: %s", exc)

    # Update connection and sync log
    connection.last_poll_at = now
    sync_log.status = "success"
    sync_log.records_processed = created + updated
    sync_log.records_created = created
    sync_log.records_updated = updated
    sync_log.completed_at = datetime.now(timezone.utc)
    await db.flush()
    await db.commit()

    logger.info(
        "IndiaMart poll done for tenant %s: %d records, %d new, %d updated",
        connection.tenant_id, len(records), created, updated,
    )
    return {"created": created, "updated": updated, "total_fetched": len(records)}


async def poll_all_indiamart_connections(session_factory):
    """Poll all active IndiaMart connections across all tenants."""
    async with session_factory() as db:
        result = await db.execute(
            select(AdSourceConnection).where(
                AdSourceConnection.provider == "indiamart",
                AdSourceConnection.is_active.is_(True),
            )
        )
        connections = result.scalars().all()

    for conn in connections:
        try:
            async with session_factory() as db:
                # Re-fetch within this session
                result = await db.execute(
                    select(AdSourceConnection).where(AdSourceConnection.id == conn.id)
                )
                fresh_conn = result.scalar_one_or_none()
                if fresh_conn and fresh_conn.is_active:
                    await poll_indiamart_for_tenant(db, fresh_conn)
        except Exception as exc:
            logger.error("IndiaMart poll error for connection %s: %s", conn.id, exc)


async def indiamart_poll_loop(session_factory, interval: int = DEFAULT_POLL_INTERVAL):
    """Background loop that polls IndiaMart every `interval` seconds."""
    logger.info("IndiaMart poller started (interval=%ds)", interval)
    # Initial delay to let the app fully start
    await asyncio.sleep(15)

    while True:
        try:
            await poll_all_indiamart_connections(session_factory)
        except Exception as exc:
            logger.error("IndiaMart poll loop error: %s", exc)
        await asyncio.sleep(interval)


def start_indiamart_poller():
    """Start the IndiaMart poller as a background task. Call from app startup."""
    from api.leads_database import get_leads_session_factory

    factory = get_leads_session_factory()
    if factory is None:
        logger.warning("IndiaMart poller: leads DB not available, skipping")
        return

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(indiamart_poll_loop(factory))
    except RuntimeError:
        # No running loop — fallback (shouldn't happen in FastAPI startup)
        asyncio.get_event_loop().create_task(indiamart_poll_loop(factory))

    logger.info("IndiaMart background poller scheduled")
