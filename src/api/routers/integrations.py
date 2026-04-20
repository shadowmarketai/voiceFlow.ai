"""
VoiceFlow AI - Integrations Router
=====================================
Persist/retrieve third-party integration connections (HubSpot, Zoho, etc.)
stored per-user in the user_integrations table.

Endpoints:
  GET  /api/v1/integrations/          - list all connections for current user
  POST /api/v1/integrations/{id}/connect  - save/update a connection
  DELETE /api/v1/integrations/{id}    - remove a connection
"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from api.database import USE_POSTGRES, db
from api.dependencies import get_current_active_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/integrations", tags=["Integrations"])

_PH = "%s" if USE_POSTGRES else "?"


# ── helpers ────────────────────────────────────────────────────────────────

def _ensure_table(conn):
    """Create user_integrations table if it doesn't exist (idempotent)."""
    if USE_POSTGRES:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_integrations (
                id           SERIAL PRIMARY KEY,
                user_id      TEXT NOT NULL,
                tenant_id    TEXT,
                provider_id  TEXT NOT NULL,
                provider_name TEXT,
                is_connected SMALLINT NOT NULL DEFAULT 0,
                config       TEXT DEFAULT '{}',
                connected_at TEXT,
                created_at   TEXT DEFAULT NOW()::TEXT,
                updated_at   TEXT DEFAULT NOW()::TEXT,
                UNIQUE(user_id, provider_id)
            )
        """)
    else:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_integrations (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id       TEXT NOT NULL,
                tenant_id     TEXT,
                provider_id   TEXT NOT NULL,
                provider_name TEXT,
                is_connected  INTEGER NOT NULL DEFAULT 0,
                config        TEXT DEFAULT '{}',
                connected_at  TEXT,
                created_at    TEXT DEFAULT (datetime('now')),
                updated_at    TEXT DEFAULT (datetime('now')),
                UNIQUE(user_id, provider_id)
            )
        """)


# ── endpoints ──────────────────────────────────────────────────────────────

@router.get("/")
def list_integrations(user: dict = Depends(get_current_active_user)):
    """Return all integration connections for the current user."""
    user_id = user.get("id") or user.get("sub")
    tenant_id = user.get("tenant_id", "")

    with db() as conn:
        _ensure_table(conn)
        rows = conn.execute(
            f"SELECT provider_id, provider_name, is_connected, config, connected_at "
            f"FROM user_integrations WHERE user_id={_PH}",
            (user_id,),
        ).fetchall()

    import json
    connections = {}
    for row in rows:
        if row[2]:  # is_connected
            try:
                cfg = json.loads(row[3] or "{}")
            except Exception:
                cfg = {}
            connections[row[0]] = {
                "connected": True,
                "provider_name": row[1] or row[0],
                "config": cfg,
                "connected_at": row[4],
            }

    return {"connections": connections, "tenant_id": tenant_id}


@router.post("/{provider_id}/connect")
def connect_integration(
    provider_id: str,
    body: dict,
    user: dict = Depends(get_current_active_user),
):
    """Save or update an integration connection."""
    user_id = user.get("id") or user.get("sub")
    tenant_id = user.get("tenant_id", "")
    provider_name = body.get("provider_name", provider_id)
    config = body.get("config", {})

    import json
    from datetime import datetime

    config_str = json.dumps(config)
    now = datetime.utcnow().isoformat()

    with db() as conn:
        _ensure_table(conn)
        existing = conn.execute(
            f"SELECT id FROM user_integrations WHERE user_id={_PH} AND provider_id={_PH}",
            (user_id, provider_id),
        ).fetchone()

        if existing:
            conn.execute(
                f"UPDATE user_integrations SET is_connected=1, config={_PH}, "
                f"provider_name={_PH}, connected_at={_PH}, updated_at={_PH} "
                f"WHERE user_id={_PH} AND provider_id={_PH}",
                (config_str, provider_name, now, now, user_id, provider_id),
            )
        else:
            conn.execute(
                f"INSERT INTO user_integrations "
                f"(user_id, tenant_id, provider_id, provider_name, is_connected, config, connected_at, created_at, updated_at) "
                f"VALUES ({_PH},{_PH},{_PH},{_PH},1,{_PH},{_PH},{_PH},{_PH})",
                (user_id, tenant_id, provider_id, provider_name, config_str, now, now, now),
            )

    logger.info("Integration connected: user=%s provider=%s", user_id, provider_id)
    return {"status": "connected", "provider_id": provider_id}


@router.delete("/{provider_id}")
def disconnect_integration(
    provider_id: str,
    user: dict = Depends(get_current_active_user),
):
    """Remove an integration connection."""
    user_id = user.get("id") or user.get("sub")

    with db() as conn:
        _ensure_table(conn)
        conn.execute(
            f"DELETE FROM user_integrations WHERE user_id={_PH} AND provider_id={_PH}",
            (user_id, provider_id),
        )

    logger.info("Integration disconnected: user=%s provider=%s", user_id, provider_id)
    return {"status": "disconnected", "provider_id": provider_id}
