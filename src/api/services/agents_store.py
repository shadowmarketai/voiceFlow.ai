"""
Voice agents persistent store — uses SQLAlchemy Core to bypass any
broken ORM mappers in the rest of the codebase.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select

from api.database import USE_POSTGRES, db, get_engine
from api.models.voice_agent_db import CallLog, ChannelConfig, VoiceAgent

logger = logging.getLogger(__name__)

_TABLES_ENSURED = False


def _ensure_tables() -> None:
    global _TABLES_ENSURED
    if _TABLES_ENSURED:
        return
    eng = get_engine()
    VoiceAgent.__table__.create(bind=eng, checkfirst=True)
    CallLog.__table__.create(bind=eng, checkfirst=True)
    ChannelConfig.__table__.create(bind=eng, checkfirst=True)
    _TABLES_ENSURED = True


# ── Agents CRUD ────────────────────────────────────────────────────────────

def _row_to_dict(row) -> dict[str, Any]:
    m = row._mapping
    return {
        "id": m["id"], "tenant_id": m["tenant_id"], "user_id": m["user_id"],
        "name": m["name"], "language": m["language"], "status": m["status"],
        "icon": m["icon"], "is_demo": bool(m["is_demo"]),
        "config": m["config"] or {},
        "conversations": int(m["conversations"] or 0),
        "created_at": m["created_at"].isoformat() if m["created_at"] else None,
        "updated_at": m["updated_at"].isoformat() if m["updated_at"] else None,
    }


def list_agents(tenant_id: str) -> list[dict[str, Any]]:
    _ensure_tables()
    eng = get_engine()
    t = VoiceAgent.__table__
    with eng.begin() as conn:
        rows = conn.execute(
            select(t).where(t.c.tenant_id == tenant_id).order_by(t.c.updated_at.desc())
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_agent(tenant_id: str, agent_id: str) -> dict[str, Any] | None:
    _ensure_tables()
    eng = get_engine()
    t = VoiceAgent.__table__
    with eng.begin() as conn:
        row = conn.execute(
            select(t).where(t.c.id == agent_id, t.c.tenant_id == tenant_id)
        ).first()
    return _row_to_dict(row) if row else None


class ProviderNotAllowedError(Exception):
    """Raised when agent config selects a provider tier not allowed by the tenant's plan."""
    pass


def validate_agent_providers(tenant_id: str, config: dict[str, Any]) -> dict[str, Any] | None:
    """Check that the agent's LLM (and optionally TTS) is allowed by the tenant's plan.

    Returns None if allowed, or a dict with error details if blocked.
    """
    from api.services.pricing import (
        COST_CATALOG,
        get_provider_tier,
        resolve_catalog_key,
    )

    llm_provider = config.get("llmProvider")
    if not llm_provider:
        return None  # no LLM selection to validate

    llm_model = config.get("llmModel") or "default"
    catalog_key = resolve_catalog_key("llm", llm_provider, llm_model)
    tier = get_provider_tier("llm", catalog_key)

    # Look up the tenant's plan → allowed tiers
    _ph = "%s" if USE_POSTGRES else "?"
    allowed_tiers = ["free", "budget", "standard"]  # safe default
    try:
        with db() as conn:
            # Get tenant's plan_id from platform_tenants
            row = conn.execute(
                f"SELECT plan_id FROM platform_tenants WHERE id={_ph}", (tenant_id,)
            ).fetchone()
            plan_id = dict(row).get("plan_id", "starter") if row else "starter"

            # Get allowed_provider_tiers from the plan
            plan_row = conn.execute(
                f"SELECT allowed_provider_tiers, plan_multiplier FROM plans WHERE id={_ph}",
                (plan_id,),
            ).fetchone()
            if plan_row:
                raw = dict(plan_row).get("allowed_provider_tiers")
                if raw:
                    allowed_tiers = json.loads(raw) if isinstance(raw, str) else raw
    except Exception as exc:
        logger.debug("Provider validation plan lookup: %s", exc)

    if tier not in allowed_tiers:
        llm_label = COST_CATALOG.get("llm", {}).get(catalog_key, {}).get("label", catalog_key)
        return {
            "allowed": False,
            "provider": llm_label,
            "tier": tier,
            "allowed_tiers": allowed_tiers,
            "reason": f"{llm_label} is a {tier.title()} tier provider. "
                      f"Your plan allows: {', '.join(t.title() for t in allowed_tiers)}. "
                      f"Upgrade your plan to use this provider.",
        }

    return None  # all good


def upsert_agent(tenant_id: str, agent_id: str | None, payload: dict[str, Any]) -> dict[str, Any]:
    """Insert or update. Returns the saved row."""
    # Validate provider access before saving
    config = payload.get("config") or {}
    validation_error = validate_agent_providers(tenant_id, config)
    if validation_error:
        raise ProviderNotAllowedError(validation_error["reason"])

    _ensure_tables()
    eng = get_engine()
    t = VoiceAgent.__table__
    aid = agent_id or payload.get("id") or f"agent-{uuid.uuid4().hex[:10]}"

    fields = {
        "tenant_id": tenant_id,
        "user_id": payload.get("user_id"),
        "name": payload.get("name") or "Untitled Agent",
        "language": payload.get("language"),
        "status": payload.get("status") or "draft",
        "icon": payload.get("icon"),
        "is_demo": bool(payload.get("is_demo", False)),
        "config": payload.get("config") or {},
        "conversations": int(payload.get("conversations") or 0),
        "updated_at": datetime.utcnow(),
    }

    with eng.begin() as conn:
        existing = conn.execute(
            select(t.c.id).where(t.c.id == aid, t.c.tenant_id == tenant_id)
        ).first()
        if existing:
            conn.execute(t.update().where(t.c.id == aid, t.c.tenant_id == tenant_id).values(**fields))
        else:
            conn.execute(t.insert().values(id=aid, created_at=datetime.utcnow(), **fields))
        row = conn.execute(select(t).where(t.c.id == aid)).first()
    return _row_to_dict(row)


def delete_agent(tenant_id: str, agent_id: str) -> bool:
    _ensure_tables()
    eng = get_engine()
    t = VoiceAgent.__table__
    with eng.begin() as conn:
        res = conn.execute(t.delete().where(t.c.id == agent_id, t.c.tenant_id == tenant_id))
    return (res.rowcount or 0) > 0


# ── Call Logs ──────────────────────────────────────────────────────────────

def log_call(tenant_id: str, **fields) -> dict[str, Any]:
    """Insert a call record. Caller passes any subset of CallLog columns."""
    _ensure_tables()
    eng = get_engine()
    t = CallLog.__table__
    cid = fields.get("id") or f"call-{uuid.uuid4().hex[:12]}"
    values = {
        "id": cid,
        "tenant_id": tenant_id,
        "agent_id": fields.get("agent_id"),
        "direction": fields.get("direction") or "inbound",
        "channel": fields.get("channel") or "webrtc",
        "from_addr": fields.get("from_addr"),
        "to_addr": fields.get("to_addr"),
        "started_at": fields.get("started_at") or datetime.utcnow(),
        "ended_at": fields.get("ended_at"),
        "duration_sec": fields.get("duration_sec"),
        "outcome": fields.get("outcome"),
        "sentiment": fields.get("sentiment"),
        "emotion": fields.get("emotion"),
        "transcript": fields.get("transcript"),
        "recording_url": fields.get("recording_url"),
        "cost_inr": fields.get("cost_inr"),
        "meta": fields.get("meta"),
    }
    with eng.begin() as conn:
        conn.execute(t.insert().values(**values))
    return values


def list_call_logs(tenant_id: str, limit: int = 50, offset: int = 0,
                   agent_id: str | None = None) -> list[dict[str, Any]]:
    _ensure_tables()
    eng = get_engine()
    t = CallLog.__table__
    with eng.begin() as conn:
        q = select(t).where(t.c.tenant_id == tenant_id)
        if agent_id:
            q = q.where(t.c.agent_id == agent_id)
        q = q.order_by(t.c.started_at.desc()).limit(limit).offset(offset)
        rows = conn.execute(q).fetchall()
    out = []
    for r in rows:
        m = r._mapping
        out.append({
            "id": m["id"], "tenant_id": m["tenant_id"], "agent_id": m["agent_id"],
            "direction": m["direction"], "channel": m["channel"],
            "from": m["from_addr"], "to": m["to_addr"],
            "started_at": m["started_at"].isoformat() if m["started_at"] else None,
            "ended_at": m["ended_at"].isoformat() if m["ended_at"] else None,
            "duration_sec": m["duration_sec"],
            "outcome": m["outcome"], "sentiment": m["sentiment"], "emotion": m["emotion"],
            "transcript": m["transcript"], "recording_url": m["recording_url"],
            "cost_inr": m["cost_inr"], "meta": m["meta"],
        })
    return out


# ── Channel Configs ────────────────────────────────────────────────────────

def list_channel_configs(tenant_id: str) -> list[dict[str, Any]]:
    _ensure_tables()
    eng = get_engine()
    t = ChannelConfig.__table__
    with eng.begin() as conn:
        rows = conn.execute(
            select(t).where(t.c.tenant_id == tenant_id)
        ).fetchall()
    return [
        {
            "id": r._mapping["id"], "channel": r._mapping["channel"],
            "config": r._mapping["config"] or {}, "enabled": bool(r._mapping["enabled"]),
            "updated_at": r._mapping["updated_at"].isoformat() if r._mapping["updated_at"] else None,
        }
        for r in rows
    ]


def upsert_channel_config(tenant_id: str, channel: str, config: dict[str, Any], enabled: bool = True) -> dict[str, Any]:
    _ensure_tables()
    eng = get_engine()
    t = ChannelConfig.__table__
    with eng.begin() as conn:
        existing = conn.execute(
            select(t.c.id).where(t.c.tenant_id == tenant_id, t.c.channel == channel)
        ).first()
        if existing:
            conn.execute(t.update().where(t.c.id == existing._mapping["id"]).values(
                config=config, enabled=enabled, updated_at=datetime.utcnow()
            ))
        else:
            conn.execute(t.insert().values(
                tenant_id=tenant_id, channel=channel, config=config, enabled=enabled,
                created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
            ))
    return {"channel": channel, "config": config, "enabled": enabled}
