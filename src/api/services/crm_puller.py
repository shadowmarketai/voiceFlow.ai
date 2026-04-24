"""
VoiceFlow AI - CRM Lead Puller
================================
Pulls leads FROM external CRMs (Zoho, HubSpot, Salesforce) INTO VoiceFlow.

Called when:
  - User clicks "Sync Now" on the integrations page
  - (Future) Scheduled background sync every N minutes

Auth: uses OAuth tokens stored in CrmConnection.access_token.
Tokens refreshed automatically when expired (HTTP 401).
"""

import logging
from datetime import datetime, timedelta, timezone

import aiohttp
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.leads import CrmConnection, SyncLog
from api.services import leads_service

logger = logging.getLogger(__name__)


# ============================================
# Zoho CRM
# ============================================

async def _refresh_zoho_token(conn: CrmConnection, db: AsyncSession) -> bool:
    """Refresh Zoho OAuth token using refresh_token."""
    if not conn.refresh_token:
        return False

    creds = conn.credentials or {}
    client_id = creds.get("client_id") or ""
    client_secret = creds.get("client_secret") or ""

    token_url = "https://accounts.zoho.in/oauth/v2/token"
    params = {
        "grant_type": "refresh_token",
        "refresh_token": conn.refresh_token,
        "client_id": client_id,
        "client_secret": client_secret,
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(token_url, params=params) as resp:
            if resp.status != 200:
                return False
            data = await resp.json()
            new_token = data.get("access_token")
            if not new_token:
                return False
            conn.access_token = new_token
            await db.flush()
            return True


async def pull_zoho_leads(conn: CrmConnection, db: AsyncSession) -> dict:
    """Pull leads from Zoho CRM and ingest into VoiceFlow."""
    if not conn.access_token:
        return {"error": "No access token. Reconnect Zoho.", "created": 0, "updated": 0}

    domain = conn.api_domain or "https://www.zohoapis.in"
    headers = {"Authorization": f"Zoho-oauthtoken {conn.access_token}"}

    created = updated = page = 0
    has_more = True

    # Pull from last sync time (or 30 days ago)
    if conn.last_sync_at:
        since = conn.last_sync_at - timedelta(minutes=5)
    else:
        since = datetime.now(timezone.utc) - timedelta(days=30)

    modified_since = since.strftime("%Y-%m-%dT%H:%M:%S+00:00")

    async with aiohttp.ClientSession() as session:
        while has_more:
            page += 1
            url = f"{domain}/crm/v2/Leads"
            params = {
                "page": page,
                "per_page": 200,
                "sort_by": "Modified_Time",
                "sort_order": "desc",
            }

            async with session.get(url, headers=headers, params=params) as resp:
                if resp.status == 401:
                    refreshed = await _refresh_zoho_token(conn, db)
                    if refreshed:
                        headers["Authorization"] = f"Zoho-oauthtoken {conn.access_token}"
                        async with session.get(url, headers=headers, params=params) as resp2:
                            if resp2.status != 200:
                                break
                            data = await resp2.json()
                    else:
                        return {"error": "Token expired, reconnect Zoho", "created": 0, "updated": 0}
                elif resp.status != 200:
                    text = await resp.text()
                    logger.error("Zoho API error %s: %s", resp.status, text[:200])
                    break
                else:
                    data = await resp.json()

            records = data.get("data", [])
            info = data.get("info", {})
            has_more = info.get("more_records", False)

            for item in records:
                # Stop if older than our window
                modified = item.get("Modified_Time", "")
                if modified and modified < modified_since:
                    has_more = False
                    break

                lead_data = _map_zoho_lead(item)
                if not lead_data.get("phone") and not lead_data.get("email"):
                    continue
                try:
                    _, is_new = await leads_service.capture_lead(
                        db, conn.tenant_id, lead_data
                    )
                    if is_new:
                        created += 1
                    else:
                        updated += 1
                except Exception as exc:
                    logger.warning("Zoho lead capture failed: %s", exc)

    return {"created": created, "updated": updated}


def _map_zoho_lead(item: dict) -> dict:
    name_parts = [item.get("First_Name") or "", item.get("Last_Name") or ""]
    name = " ".join(p for p in name_parts if p).strip() or item.get("Full_Name") or ""
    return {
        "name": name,
        "phone": item.get("Phone") or item.get("Mobile"),
        "email": item.get("Email"),
        "location_city": item.get("City"),
        "location_state": item.get("State"),
        "location_country": item.get("Country") or "IN",
        "business_name": item.get("Company"),
        "source": "zoho",
        "source_medium": "crm_sync",
        "tags": ["zoho"],
        "custom_fields": {
            "zoho_lead_id": str(item.get("id") or ""),
            "lead_status": item.get("Lead_Status") or "",
            "lead_source": item.get("Lead_Source") or "",
        },
    }


# ============================================
# HubSpot CRM
# ============================================

async def pull_hubspot_leads(conn: CrmConnection, db: AsyncSession) -> dict:
    """Pull contacts from HubSpot and ingest into VoiceFlow."""
    if not conn.access_token:
        return {"error": "No access token. Reconnect HubSpot.", "created": 0, "updated": 0}

    headers = {
        "Authorization": f"Bearer {conn.access_token}",
        "Content-Type": "application/json",
    }

    created = updated = 0
    after = None  # pagination cursor

    # Properties to fetch
    properties = "firstname,lastname,phone,email,city,state,country,company,hs_lead_status,lifecyclestage"

    async with aiohttp.ClientSession() as session:
        while True:
            params: dict = {"limit": 100, "properties": properties}
            if after:
                params["after"] = after

            async with session.get(
                "https://api.hubapi.com/crm/v3/objects/contacts",
                headers=headers,
                params=params,
            ) as resp:
                if resp.status == 401:
                    return {"error": "HubSpot token expired. Reconnect.", "created": 0, "updated": 0}
                if resp.status != 200:
                    text = await resp.text()
                    logger.error("HubSpot API error %s: %s", resp.status, text[:200])
                    break
                data = await resp.json()

            results = data.get("results", [])
            paging = data.get("paging", {})
            after = paging.get("next", {}).get("after")

            for item in results:
                props = item.get("properties", {})
                lead_data = _map_hubspot_contact(item["id"], props)
                if not lead_data.get("phone") and not lead_data.get("email"):
                    continue
                try:
                    _, is_new = await leads_service.capture_lead(
                        db, conn.tenant_id, lead_data
                    )
                    if is_new:
                        created += 1
                    else:
                        updated += 1
                except Exception as exc:
                    logger.warning("HubSpot contact capture failed: %s", exc)

            if not after or not results:
                break

    return {"created": created, "updated": updated}


def _map_hubspot_contact(contact_id: str, props: dict) -> dict:
    name_parts = [props.get("firstname") or "", props.get("lastname") or ""]
    name = " ".join(p for p in name_parts if p).strip()
    return {
        "name": name,
        "phone": props.get("phone"),
        "email": props.get("email"),
        "location_city": props.get("city"),
        "location_state": props.get("state"),
        "location_country": props.get("country") or "IN",
        "business_name": props.get("company"),
        "source": "hubspot",
        "source_medium": "crm_sync",
        "tags": ["hubspot"],
        "custom_fields": {
            "hubspot_contact_id": contact_id,
            "lead_status": props.get("hs_lead_status") or "",
            "lifecycle_stage": props.get("lifecyclestage") or "",
        },
    }


# ============================================
# Salesforce
# ============================================

async def pull_salesforce_leads(conn: CrmConnection, db: AsyncSession) -> dict:
    """Pull Lead records from Salesforce and ingest into VoiceFlow."""
    if not conn.access_token:
        return {"error": "No access token. Reconnect Salesforce.", "created": 0, "updated": 0}

    domain = conn.api_domain or "https://login.salesforce.com"
    headers = {
        "Authorization": f"Bearer {conn.access_token}",
        "Content-Type": "application/json",
    }

    created = updated = 0

    # SOQL query for leads modified since last sync
    if conn.last_sync_at:
        since = conn.last_sync_at - timedelta(minutes=5)
        since_str = since.strftime("%Y-%m-%dT%H:%M:%SZ")
        where = f"WHERE LastModifiedDate >= {since_str}"
    else:
        where = ""

    soql = (
        f"SELECT Id,FirstName,LastName,Phone,MobilePhone,Email,"
        f"City,State,Country,Company,Status,LeadSource "
        f"FROM Lead {where} ORDER BY LastModifiedDate DESC LIMIT 2000"
    )

    next_url = f"{domain}/services/data/v58.0/query?q={soql}"

    async with aiohttp.ClientSession() as session:
        while next_url:
            async with session.get(next_url, headers=headers) as resp:
                if resp.status == 401:
                    return {"error": "Salesforce token expired. Reconnect.", "created": 0, "updated": 0}
                if resp.status != 200:
                    text = await resp.text()
                    logger.error("Salesforce API error %s: %s", resp.status, text[:200])
                    break
                data = await resp.json()

            records = data.get("records", [])
            next_records_url = data.get("nextRecordsUrl")
            next_url = f"{domain}{next_records_url}" if next_records_url else None

            for item in records:
                lead_data = _map_salesforce_lead(item)
                if not lead_data.get("phone") and not lead_data.get("email"):
                    continue
                try:
                    _, is_new = await leads_service.capture_lead(
                        db, conn.tenant_id, lead_data
                    )
                    if is_new:
                        created += 1
                    else:
                        updated += 1
                except Exception as exc:
                    logger.warning("Salesforce lead capture failed: %s", exc)

    return {"created": created, "updated": updated}


def _map_salesforce_lead(item: dict) -> dict:
    name_parts = [item.get("FirstName") or "", item.get("LastName") or ""]
    name = " ".join(p for p in name_parts if p).strip()
    return {
        "name": name,
        "phone": item.get("Phone") or item.get("MobilePhone"),
        "email": item.get("Email"),
        "location_city": item.get("City"),
        "location_state": item.get("State"),
        "location_country": item.get("Country") or "IN",
        "business_name": item.get("Company"),
        "source": "salesforce",
        "source_medium": "crm_sync",
        "tags": ["salesforce"],
        "custom_fields": {
            "salesforce_lead_id": item.get("Id") or "",
            "lead_status": item.get("Status") or "",
            "lead_source": item.get("LeadSource") or "",
        },
    }


# ============================================
# Dispatcher
# ============================================

async def pull_leads_from_crm(conn: CrmConnection, db: AsyncSession) -> dict:
    """Dispatch to the right provider's pull function."""
    provider = conn.provider

    if provider == "zoho":
        return await pull_zoho_leads(conn, db)
    elif provider == "hubspot":
        return await pull_hubspot_leads(conn, db)
    elif provider == "salesforce":
        return await pull_salesforce_leads(conn, db)
    else:
        return {"error": f"No pull handler for provider: {provider}", "created": 0, "updated": 0}
