"""
VoiceFlow AI - Channels Config Router
========================================
Persist/retrieve per-user channel configurations (Web Widget, WhatsApp,
Phone, API) stored in the tenant_channels table.

Endpoints:
  GET /api/v1/channels/config              - list all channel configs for current user
  PUT /api/v1/channels/config/{channel_id} - save/update a channel config
"""

import logging

from fastapi import APIRouter, Depends

from api.database import USE_POSTGRES, db
from api.dependencies import get_current_active_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/channels", tags=["Channels"])

_PH = "%s" if USE_POSTGRES else "?"


# ── helpers ────────────────────────────────────────────────────────────────

def _ensure_table(conn):
    """Create tenant_channels table if it doesn't exist (idempotent)."""
    if USE_POSTGRES:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tenant_channels (
                id           SERIAL PRIMARY KEY,
                user_id      TEXT NOT NULL,
                tenant_id    TEXT,
                channel_id   TEXT NOT NULL,
                channel_name TEXT,
                config       TEXT DEFAULT '{}',
                status       TEXT DEFAULT 'needs_setup',
                updated_at   TEXT DEFAULT NOW()::TEXT,
                UNIQUE(user_id, channel_id)
            )
        """)
    else:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tenant_channels (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id      TEXT NOT NULL,
                tenant_id    TEXT,
                channel_id   TEXT NOT NULL,
                channel_name TEXT,
                config       TEXT DEFAULT '{}',
                status       TEXT DEFAULT 'needs_setup',
                updated_at   TEXT DEFAULT (datetime('now')),
                UNIQUE(user_id, channel_id)
            )
        """)


# ── endpoints ──────────────────────────────────────────────────────────────

@router.get("/config")
def list_channel_configs(user: dict = Depends(get_current_active_user)):
    """Return all channel configurations for the current user."""
    user_id = user.get("id") or user.get("sub")

    with db() as conn:
        _ensure_table(conn)
        rows = conn.execute(
            f"SELECT channel_id, channel_name, config, status, updated_at "
            f"FROM tenant_channels WHERE user_id={_PH}",
            (user_id,),
        ).fetchall()

    import json
    configs = {}
    for row in rows:
        try:
            cfg = json.loads(row[2] or "{}")
        except Exception:
            cfg = {}
        configs[row[0]] = {
            "channel_name": row[1] or row[0],
            "config": cfg,
            "status": row[3] or "needs_setup",
            "updated_at": row[4],
        }

    return {"configs": configs}


@router.put("/config/{channel_id}")
def save_channel_config(
    channel_id: str,
    body: dict,
    user: dict = Depends(get_current_active_user),
):
    """Save or update a channel configuration."""
    user_id = user.get("id") or user.get("sub")
    tenant_id = user.get("tenant_id", "")
    channel_name = body.get("channel_name", channel_id)
    config = body.get("config", {})
    status = body.get("status", "configured")

    import json
    from datetime import datetime

    config_str = json.dumps(config)
    now = datetime.utcnow().isoformat()

    with db() as conn:
        _ensure_table(conn)
        existing = conn.execute(
            f"SELECT id FROM tenant_channels WHERE user_id={_PH} AND channel_id={_PH}",
            (user_id, channel_id),
        ).fetchone()

        if existing:
            conn.execute(
                f"UPDATE tenant_channels SET config={_PH}, status={_PH}, "
                f"channel_name={_PH}, updated_at={_PH} "
                f"WHERE user_id={_PH} AND channel_id={_PH}",
                (config_str, status, channel_name, now, user_id, channel_id),
            )
        else:
            conn.execute(
                f"INSERT INTO tenant_channels "
                f"(user_id, tenant_id, channel_id, channel_name, config, status, updated_at) "
                f"VALUES ({_PH},{_PH},{_PH},{_PH},{_PH},{_PH},{_PH})",
                (user_id, tenant_id, channel_id, channel_name, config_str, status, now),
            )

    logger.info("Channel config saved: user=%s channel=%s status=%s", user_id, channel_id, status)
    return {"status": "saved", "channel_id": channel_id, "channel_status": status}
