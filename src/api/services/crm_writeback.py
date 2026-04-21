"""
VoiceFlow AI - CRM Write-back Service
=======================================
Pushes call data (transcript, recording, score, emotion) back to
the client's external CRM after each call completes.

Supports: Zoho, HubSpot, Salesforce, Pipedrive, Custom Webhook.
"""

import logging
from datetime import datetime, timezone

import aiohttp
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.leads import CrmConnection, Lead, SyncLog
from api.services import leads_service

logger = logging.getLogger(__name__)


async def push_call_to_crm(
    db: AsyncSession,
    tenant_id: str,
    lead_phone: str | None,
    call_data: dict,
):
    """Push call results to all active CRM connections for this tenant.

    Called after every call completes. Finds the lead by phone,
    updates lead status, logs interaction, then pushes to external CRM.

    call_data keys:
        call_id, transcript, recording_url, duration_seconds,
        emotion, intent, sentiment, lead_score, summary
    """
    # 1. Find lead by phone
    lead = None
    if lead_phone:
        phone = leads_service.normalize_phone(lead_phone)
        if phone:
            result = await db.execute(
                select(Lead).where(
                    Lead.tenant_id == tenant_id,
                    Lead.phone == phone,
                    Lead.deleted_at.is_(None),
                )
            )
            lead = result.scalar_one_or_none()

    # 2. Update lead if found
    if lead:
        if call_data.get("lead_score"):
            lead.lead_score = call_data["lead_score"]
        if call_data.get("intent"):
            lead.intent = call_data["intent"]
        if lead.status == "new":
            lead.status = "contacted"
        lead.last_contacted_at = datetime.now(timezone.utc)

        # Update qualification based on score
        if lead.lead_score >= 70:
            lead.qualification = "hot"
        elif lead.lead_score >= 40:
            lead.qualification = "warm"

        # Log interaction
        await leads_service.add_interaction(
            db,
            lead_id=lead.id,
            channel="voiceflow",
            direction="outbound",
            content=call_data.get("transcript"),
            metadata_json={
                "call_id": call_data.get("call_id"),
                "duration": call_data.get("duration_seconds"),
                "recording_url": call_data.get("recording_url"),
                "emotion": call_data.get("emotion"),
                "summary": call_data.get("summary"),
            },
            sentiment=_sentiment_label(call_data.get("sentiment")),
            intent_detected=call_data.get("intent"),
        )

    # 3. Push to all active CRM connections
    result = await db.execute(
        select(CrmConnection).where(
            CrmConnection.tenant_id == tenant_id,
            CrmConnection.is_active.is_(True),
            CrmConnection.sync_direction.in_(["export", "bidirectional"]),
        )
    )
    connections = result.scalars().all()

    for conn in connections:
        try:
            await _push_to_provider(conn, lead, call_data)
            _log_sync(db, conn, "success", 1)
        except Exception as exc:
            logger.error("CRM write-back to %s failed: %s", conn.provider, exc)
            _log_sync(db, conn, "failed", 0, str(exc))

    await db.flush()


async def _push_to_provider(conn: CrmConnection, lead: Lead | None, call_data: dict):
    """Push call data to a specific CRM provider."""
    provider = conn.provider

    # Build the note/activity text
    note_text = _build_note(call_data)

    if provider == "zoho":
        await _push_zoho(conn, lead, call_data, note_text)
    elif provider == "hubspot":
        await _push_hubspot(conn, lead, call_data, note_text)
    elif provider == "salesforce":
        await _push_salesforce(conn, lead, call_data, note_text)
    elif provider == "custom" and conn.webhook_url:
        await _push_webhook(conn.webhook_url, lead, call_data)
    else:
        logger.info("No push handler for provider: %s", provider)


def _build_note(call_data: dict) -> str:
    """Build a human-readable note from call data."""
    parts = ["--- VoiceFlow AI Call Summary ---"]
    if call_data.get("summary"):
        parts.append(f"Summary: {call_data['summary']}")
    if call_data.get("duration_seconds"):
        mins = int(call_data["duration_seconds"]) // 60
        secs = int(call_data["duration_seconds"]) % 60
        parts.append(f"Duration: {mins}m {secs}s")
    if call_data.get("emotion"):
        parts.append(f"Emotion: {call_data['emotion']}")
    if call_data.get("intent"):
        parts.append(f"Intent: {call_data['intent']}")
    if call_data.get("lead_score"):
        parts.append(f"Lead Score: {call_data['lead_score']}/100")
    if call_data.get("recording_url"):
        parts.append(f"Recording: {call_data['recording_url']}")
    return "\n".join(parts)


async def _push_zoho(conn: CrmConnection, lead: Lead | None, call_data: dict, note: str):
    """Push to Zoho CRM — create/update lead + add note."""
    if not conn.access_token:
        return

    domain = conn.api_domain or "https://www.zohoapis.in"
    headers = {"Authorization": f"Zoho-oauthtoken {conn.access_token}"}

    async with aiohttp.ClientSession() as session:
        # Add note
        if lead and lead.phone:
            # Search for lead in Zoho by phone
            search_url = f"{domain}/crm/v2/Leads/search?phone={lead.phone}"
            async with session.get(search_url, headers=headers) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    records = data.get("data", [])
                    if records:
                        zoho_id = records[0]["id"]
                        # Add note
                        note_url = f"{domain}/crm/v2/Leads/{zoho_id}/Notes"
                        await session.post(note_url, headers=headers, json={
                            "data": [{"Note_Title": "VoiceFlow Call", "Note_Content": note}]
                        })


async def _push_hubspot(conn: CrmConnection, lead: Lead | None, call_data: dict, note: str):
    """Push to HubSpot — create engagement (call activity)."""
    if not conn.access_token:
        return

    headers = {"Authorization": f"Bearer {conn.access_token}"}

    async with aiohttp.ClientSession() as session:
        # Create a call engagement
        engagement_data = {
            "engagement": {"type": "CALL", "active": False},
            "metadata": {
                "body": note,
                "status": "COMPLETED",
                "durationMilliseconds": int((call_data.get("duration_seconds", 0)) * 1000),
            },
        }
        await session.post(
            "https://api.hubapi.com/engagements/v1/engagements",
            headers=headers,
            json=engagement_data,
        )


async def _push_salesforce(conn: CrmConnection, lead: Lead | None, call_data: dict, note: str):
    """Push to Salesforce — create Task record."""
    if not conn.access_token:
        return

    domain = conn.api_domain or "https://login.salesforce.com"
    headers = {"Authorization": f"Bearer {conn.access_token}"}

    async with aiohttp.ClientSession() as session:
        task_data = {
            "Subject": "VoiceFlow AI Call",
            "Description": note,
            "Status": "Completed",
            "Priority": "Normal",
            "Type": "Call",
        }
        await session.post(
            f"{domain}/services/data/v58.0/sobjects/Task",
            headers=headers,
            json=task_data,
        )


async def _push_webhook(webhook_url: str, lead: Lead | None, call_data: dict):
    """Push to a custom webhook URL."""
    payload = {
        "event": "call_completed",
        "lead": {
            "name": lead.name if lead else None,
            "phone": lead.phone if lead else None,
            "email": lead.email if lead else None,
            "score": lead.lead_score if lead else None,
            "status": lead.status if lead else None,
        },
        "call": call_data,
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(
            webhook_url,
            json=payload,
            timeout=aiohttp.ClientTimeout(total=10),
        ) as resp:
            if resp.status >= 400:
                logger.warning("Webhook %s returned %d", webhook_url, resp.status)


def _sentiment_label(score: float | None) -> str | None:
    if score is None:
        return None
    if score >= 0.3:
        return "positive"
    if score <= -0.3:
        return "negative"
    return "neutral"


def _log_sync(db, conn, status, count, error=None):
    """Helper to create a sync log entry."""
    log = SyncLog(
        tenant_id=conn.tenant_id,
        connection_type="crm",
        provider=conn.provider,
        direction="export",
        status=status,
        records_processed=count,
        records_created=0,
        records_updated=count if status == "success" else 0,
        errors=[error] if error else None,
        completed_at=datetime.now(timezone.utc),
    )
    db.add(log)
