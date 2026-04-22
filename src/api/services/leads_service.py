"""
VoiceFlow AI - Leads Service
==============================
Business logic for the leads database:
  - Universal capture (dedupe by tenant + phone)
  - Lead scoring
  - CRUD operations
  - CSV import/export
  - Pipeline stats
  - Interaction logging
"""

import csv
import io
import logging
import re
import uuid as _uuid
from datetime import datetime, timezone

from sqlalchemy import func, select, update, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.leads import (
    Lead, LeadInteraction, LeadCustomField, LeadTag,
)

logger = logging.getLogger(__name__)


# ============================================
# Phone normalization
# ============================================

def normalize_phone(phone: str | None, country: str | None = None) -> str | None:
    """Normalize phone to E.164 format."""
    if not phone:
        return None
    digits = re.sub(r"[^\d+]", "", phone.strip())
    if not digits:
        return None
    # Already E.164
    if digits.startswith("+"):
        return digits
    # Indian numbers
    if (country or "").upper() == "IN" or len(digits) == 10:
        return f"+91{digits[-10:]}"
    # Assume international if 11+ digits
    if len(digits) >= 11:
        return f"+{digits}"
    return digits


# ============================================
# Lead Scoring
# ============================================

SOURCE_WEIGHTS = {
    "referral": 30, "voiceflow": 25, "indiamart": 25, "justdial": 20,
    "facebook": 15, "google": 15, "linkedin": 15, "website": 10,
    "csv": 5, "manual": 5, "hubspot": 20, "zoho": 20, "salesforce": 20,
}


def calculate_lead_score(lead: Lead) -> int:
    """Calculate a 0-100 lead score based on data completeness + source quality."""
    score = 0

    # Source quality (0-30)
    score += SOURCE_WEIGHTS.get(lead.source, 5)

    # Data completeness (0-40)
    if lead.name:
        score += 5
    if lead.email:
        score += 10
    if lead.phone:
        score += 10
    if lead.business_name:
        score += 5
    if lead.business_type:
        score += 5
    if lead.location_city:
        score += 5

    # Intent signals (0-30)
    if lead.intent in ("purchase", "buy", "demo"):
        score += 20
    elif lead.intent in ("inquiry", "quote"):
        score += 10
    if lead.budget_range:
        score += 5
    if lead.timeline in ("immediate", "1-3mo"):
        score += 5

    return min(score, 100)


# ============================================
# Capture (Universal Ingest + Dedupe)
# ============================================

async def capture_lead(
    db: AsyncSession,
    tenant_id: str,
    data: dict,
) -> tuple[Lead, bool]:
    """Capture a lead — dedupe by (tenant_id + phone), enrich if exists.

    Returns (lead, is_new).
    """
    phone = normalize_phone(data.get("phone"), data.get("phone_country"))
    email = data.get("email")

    # Try to find existing by phone first, then email
    existing = None
    if phone:
        result = await db.execute(
            select(Lead).where(
                and_(
                    Lead.tenant_id == tenant_id,
                    Lead.phone == phone,
                    Lead.deleted_at.is_(None),
                )
            )
        )
        existing = result.scalar_one_or_none()

    if not existing and email:
        result = await db.execute(
            select(Lead).where(
                and_(
                    Lead.tenant_id == tenant_id,
                    Lead.email == email,
                    Lead.deleted_at.is_(None),
                )
            )
        )
        existing = result.scalar_one_or_none()

    if existing:
        # Enrich: fill blank fields, don't overwrite existing data
        enrichable_fields = [
            "name", "email", "business_name", "business_type", "business_size",
            "location_city", "location_state", "location_country",
            "intent", "budget_range", "timeline",
        ]
        for field in enrichable_fields:
            new_val = data.get(field)
            if new_val and not getattr(existing, field, None):
                setattr(existing, field, new_val)

        if phone and not existing.phone:
            existing.phone = phone
        existing.updated_at = datetime.now(timezone.utc)
        existing.lead_score = calculate_lead_score(existing)

        # Update qualification based on new score
        if existing.lead_score >= 70:
            existing.qualification = "hot"
        elif existing.lead_score >= 40:
            existing.qualification = "warm"

        await db.flush()

        # Add tags
        await _set_tags(db, existing.id, data.get("tags", []))
        await _set_custom_fields(db, existing.id, data.get("custom_fields", {}))

        return existing, False

    # Create new lead
    lead = Lead(
        tenant_id=tenant_id,
        name=data.get("name"),
        email=email,
        phone=phone,
        phone_country=data.get("phone_country"),
        business_name=data.get("business_name"),
        business_type=data.get("business_type"),
        business_size=data.get("business_size"),
        location_city=data.get("location_city"),
        location_state=data.get("location_state"),
        location_country=data.get("location_country"),
        source=data.get("source", "manual"),
        source_campaign=data.get("source_campaign"),
        source_medium=data.get("source_medium"),
        utm_source=data.get("utm_source"),
        utm_medium=data.get("utm_medium"),
        utm_campaign=data.get("utm_campaign"),
        intent=data.get("intent"),
        budget_range=data.get("budget_range"),
        timeline=data.get("timeline"),
        consent_given=data.get("consent_given", False),
        consent_source=data.get("consent_source"),
        consent_at=datetime.now(timezone.utc) if data.get("consent_given") else None,
        marketing_optin=data.get("marketing_optin", False),
    )
    lead.lead_score = calculate_lead_score(lead)
    if lead.lead_score >= 70:
        lead.qualification = "hot"
    elif lead.lead_score >= 40:
        lead.qualification = "warm"

    db.add(lead)
    await db.flush()

    # Add tags + custom fields
    await _set_tags(db, lead.id, data.get("tags", []))
    await _set_custom_fields(db, lead.id, data.get("custom_fields", {}))

    return lead, True


# ============================================
# CRUD Operations
# ============================================

async def get_lead(db: AsyncSession, lead_id: str) -> Lead | None:
    result = await db.execute(
        select(Lead).where(Lead.id == lead_id, Lead.deleted_at.is_(None))
    )
    return result.scalar_one_or_none()


async def list_leads(
    db: AsyncSession,
    tenant_id: str,
    status: str | None = None,
    qualification: str | None = None,
    source: str | None = None,
    disposition: str | None = None,
    search: str | None = None,
    page: int = 1,
    per_page: int = 50,
) -> tuple[list[Lead], int]:
    """List leads with filters, returns (leads, total_count)."""
    query = select(Lead).where(
        Lead.tenant_id == tenant_id,
        Lead.deleted_at.is_(None),
    )

    if status:
        query = query.where(Lead.status == status)
    if qualification:
        query = query.where(Lead.qualification == qualification)
    if source:
        query = query.where(Lead.source == source)
    if disposition:
        if disposition == "unwanted":
            query = query.where(Lead.disposition.in_(["not_interested", "wrong_enquiry", "dnc"]))
        else:
            query = query.where(Lead.disposition == disposition)
    if search:
        search_filter = or_(
            Lead.name.ilike(f"%{search}%"),
            Lead.email.ilike(f"%{search}%"),
            Lead.phone.ilike(f"%{search}%"),
            Lead.business_name.ilike(f"%{search}%"),
        )
        query = query.where(search_filter)

    # Count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginate
    query = query.order_by(Lead.created_at.desc())
    query = query.offset((page - 1) * per_page).limit(per_page)

    result = await db.execute(query)
    return result.scalars().all(), total


async def update_lead(
    db: AsyncSession,
    lead_id: str,
    updates: dict,
) -> Lead | None:
    """Update a lead's fields."""
    lead = await get_lead(db, lead_id)
    if not lead:
        return None

    tags = updates.pop("tags", None)
    custom_fields = updates.pop("custom_fields", None)

    for key, value in updates.items():
        if value is not None and hasattr(lead, key):
            setattr(lead, key, value)

    lead.updated_at = datetime.now(timezone.utc)
    lead.lead_score = calculate_lead_score(lead)
    await db.flush()

    if tags is not None:
        await _set_tags(db, lead_id, tags)
    if custom_fields is not None:
        await _set_custom_fields(db, lead_id, custom_fields)

    return lead


async def delete_lead(db: AsyncSession, lead_id: str) -> bool:
    """Soft-delete a lead."""
    lead = await get_lead(db, lead_id)
    if not lead:
        return False
    lead.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    return True


# ============================================
# Pipeline Stats
# ============================================

async def get_pipeline_stats(db: AsyncSession, tenant_id: str) -> dict:
    """Get lead counts by status and disposition."""
    result = await db.execute(
        select(Lead.status, func.count(Lead.id))
        .where(Lead.tenant_id == tenant_id, Lead.deleted_at.is_(None))
        .group_by(Lead.status)
    )
    stats = {row[0]: row[1] for row in result.all()}
    total = sum(stats.values())

    # Disposition counts
    disp_result = await db.execute(
        select(Lead.disposition, func.count(Lead.id))
        .where(
            Lead.tenant_id == tenant_id,
            Lead.deleted_at.is_(None),
            Lead.disposition.isnot(None),
            Lead.disposition != "",
        )
        .group_by(Lead.disposition)
    )
    disp_stats = {row[0]: row[1] for row in disp_result.all()}

    unwanted = disp_stats.get("not_interested", 0) + disp_stats.get("wrong_enquiry", 0) + disp_stats.get("dnc", 0)

    return {
        "new": stats.get("new", 0),
        "contacted": stats.get("contacted", 0),
        "nurturing": stats.get("nurturing", 0),
        "converted": stats.get("converted", 0),
        "lost": stats.get("lost", 0),
        "total": total,
        "dispositions": {
            "follow_up": disp_stats.get("follow_up", 0),
            "callback": disp_stats.get("callback", 0),
            "site_visit": disp_stats.get("site_visit", 0),
            "quotation_sent": disp_stats.get("quotation_sent", 0),
            "negotiation": disp_stats.get("negotiation", 0),
            "booked": disp_stats.get("booked", 0),
            "unwanted": unwanted,
        },
    }


# ============================================
# Interactions
# ============================================

async def add_interaction(
    db: AsyncSession,
    lead_id: str,
    channel: str,
    direction: str = "inbound",
    content: str | None = None,
    metadata_json: dict | None = None,
    sentiment: str | None = None,
    intent_detected: str | None = None,
) -> LeadInteraction:
    """Log an interaction with a lead."""
    interaction = LeadInteraction(
        lead_id=lead_id,
        channel=channel,
        direction=direction,
        content=content,
        metadata_json=metadata_json,
        sentiment=sentiment,
        intent_detected=intent_detected,
    )
    db.add(interaction)

    # Update last_contacted_at on the lead
    await db.execute(
        update(Lead)
        .where(Lead.id == lead_id)
        .values(last_contacted_at=datetime.now(timezone.utc))
    )
    await db.flush()
    return interaction


async def list_interactions(
    db: AsyncSession,
    lead_id: str,
    limit: int = 50,
) -> list[LeadInteraction]:
    result = await db.execute(
        select(LeadInteraction)
        .where(LeadInteraction.lead_id == lead_id)
        .order_by(LeadInteraction.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


# ============================================
# CSV Import
# ============================================

async def import_csv(
    db: AsyncSession,
    tenant_id: str,
    csv_text: str,
    source: str = "csv",
    default_tags: list[str] | None = None,
) -> dict:
    """Import leads from CSV text. Returns import stats."""
    reader = csv.DictReader(io.StringIO(csv_text))
    stats = {"total_rows": 0, "created": 0, "updated": 0, "skipped": 0, "errors": []}

    # Normalize header names
    if not reader.fieldnames:
        return stats

    field_map = {}
    for f in reader.fieldnames:
        fl = f.strip().lower()
        if fl in ("name", "full_name", "fullname", "contact_name"):
            field_map[f] = "name"
        elif fl in ("email", "email_address", "e-mail"):
            field_map[f] = "email"
        elif fl in ("phone", "mobile", "phone_number", "contact", "mobile_number"):
            field_map[f] = "phone"
        elif fl in ("company", "business", "business_name", "company_name"):
            field_map[f] = "business_name"
        elif fl in ("city", "location", "location_city"):
            field_map[f] = "location_city"
        elif fl in ("state", "location_state"):
            field_map[f] = "location_state"
        elif fl in ("type", "business_type", "industry"):
            field_map[f] = "business_type"
        elif fl in ("source", "lead_source"):
            field_map[f] = "source"
        elif fl in ("status",):
            field_map[f] = "status"

    for row_num, row in enumerate(reader, 1):
        stats["total_rows"] += 1
        try:
            data = {}
            for csv_col, our_field in field_map.items():
                val = row.get(csv_col, "").strip()
                if val:
                    data[our_field] = val

            if not data.get("phone") and not data.get("email"):
                stats["skipped"] += 1
                continue

            data["source"] = data.get("source", source)
            data["tags"] = default_tags or []

            lead, is_new = await capture_lead(db, tenant_id, data)
            if is_new:
                stats["created"] += 1
            else:
                stats["updated"] += 1

        except Exception as exc:
            stats["skipped"] += 1
            stats["errors"].append(f"Row {row_num}: {exc}")

    return stats


# ============================================
# CSV Export
# ============================================

async def export_csv(db: AsyncSession, tenant_id: str) -> str:
    """Export all active leads as CSV text."""
    leads, _ = await list_leads(db, tenant_id, per_page=10000)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Name", "Email", "Phone", "Business Name", "Business Type",
        "City", "State", "Source", "Status", "Qualification",
        "Lead Score", "Created At",
    ])

    for lead in leads:
        writer.writerow([
            lead.name, lead.email, lead.phone, lead.business_name,
            lead.business_type, lead.location_city, lead.location_state,
            lead.source, lead.status, lead.qualification,
            lead.lead_score,
            lead.created_at.isoformat() if lead.created_at else "",
        ])

    return output.getvalue()


# ============================================
# Tags & Custom Fields helpers
# ============================================

async def _set_tags(db: AsyncSession, lead_id: str, tags: list[str]):
    """Replace all tags for a lead."""
    if not tags:
        return
    # Delete existing
    await db.execute(
        select(LeadTag).where(LeadTag.lead_id == lead_id)
    )
    # Use raw delete
    from sqlalchemy import delete
    await db.execute(delete(LeadTag).where(LeadTag.lead_id == lead_id))

    for tag in set(tags):
        db.add(LeadTag(lead_id=lead_id, tag=tag.strip().lower()))
    await db.flush()


async def _set_custom_fields(db: AsyncSession, lead_id: str, fields: dict[str, str]):
    """Upsert custom fields for a lead."""
    if not fields:
        return
    for key, value in fields.items():
        result = await db.execute(
            select(LeadCustomField).where(
                LeadCustomField.lead_id == lead_id,
                LeadCustomField.field_key == key,
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.field_value = value
        else:
            db.add(LeadCustomField(
                lead_id=lead_id,
                field_key=key,
                field_value=value,
            ))
    await db.flush()


async def get_lead_tags(db: AsyncSession, lead_id: str) -> list[str]:
    result = await db.execute(
        select(LeadTag.tag).where(LeadTag.lead_id == lead_id)
    )
    return [row[0] for row in result.all()]


async def get_lead_custom_fields(db: AsyncSession, lead_id: str) -> dict[str, str]:
    result = await db.execute(
        select(LeadCustomField.field_key, LeadCustomField.field_value)
        .where(LeadCustomField.lead_id == lead_id)
    )
    return {row[0]: row[1] for row in result.all()}
