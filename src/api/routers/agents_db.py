"""
Voice Agents + Call Logs + Channel Configs — DB-backed CRUD.

Endpoints:
  GET    /api/v1/agents
  POST   /api/v1/agents
  GET    /api/v1/agents/{agent_id}
  PUT    /api/v1/agents/{agent_id}
  DELETE /api/v1/agents/{agent_id}

  GET    /api/v1/call-logs
  POST   /api/v1/call-logs                (typically called by the voice pipeline)

  GET    /api/v1/channels-configs
  PUT    /api/v1/channels-configs/{channel}
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query

from api.services import agents_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["agents-db"])


def _tenant(x_tenant_id: str | None) -> str:
    return x_tenant_id or "default"


# ── Agents ────────────────────────────────────────────────────────────────

@router.get("/agents")
def list_agents_route(x_tenant_id: str | None = Header(default=None)) -> dict[str, Any]:
    tenant_id = _tenant(x_tenant_id)
    return {"agents": agents_store.list_agents(tenant_id)}


@router.post("/agents", status_code=201)
def create_agent(payload: dict, x_tenant_id: str | None = Header(default=None)) -> dict[str, Any]:
    tenant_id = _tenant(x_tenant_id)
    return agents_store.upsert_agent(tenant_id, payload.get("id"), payload)


@router.get("/agents/{agent_id}")
def get_agent_route(agent_id: str, x_tenant_id: str | None = Header(default=None)) -> dict[str, Any]:
    tenant_id = _tenant(x_tenant_id)
    a = agents_store.get_agent(tenant_id, agent_id)
    if not a:
        raise HTTPException(404, "Agent not found")
    return a


@router.put("/agents/{agent_id}")
def update_agent_route(agent_id: str, payload: dict, x_tenant_id: str | None = Header(default=None)) -> dict[str, Any]:
    tenant_id = _tenant(x_tenant_id)
    return agents_store.upsert_agent(tenant_id, agent_id, payload)


@router.delete("/agents/{agent_id}")
def delete_agent_route(agent_id: str, x_tenant_id: str | None = Header(default=None)) -> dict[str, Any]:
    tenant_id = _tenant(x_tenant_id)
    ok = agents_store.delete_agent(tenant_id, agent_id)
    if not ok:
        raise HTTPException(404, "Agent not found")
    return {"success": True, "removed": agent_id}


# ── Call logs ─────────────────────────────────────────────────────────────

@router.get("/call-logs")
def list_call_logs_route(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    agent_id: str | None = Query(None),
    x_tenant_id: str | None = Header(default=None),
) -> dict[str, Any]:
    tenant_id = _tenant(x_tenant_id)
    return {"logs": agents_store.list_call_logs(tenant_id, limit, offset, agent_id)}


@router.post("/call-logs", status_code=201)
def insert_call_log(payload: dict, x_tenant_id: str | None = Header(default=None)) -> dict[str, Any]:
    tenant_id = _tenant(x_tenant_id)
    row = agents_store.log_call(tenant_id, **payload)
    return {"success": True, "id": row.get("id")}


# ── Channel configs ───────────────────────────────────────────────────────

@router.get("/channels-configs")
def list_channels_route(x_tenant_id: str | None = Header(default=None)) -> dict[str, Any]:
    tenant_id = _tenant(x_tenant_id)
    return {"channels": agents_store.list_channel_configs(tenant_id)}


@router.put("/channels-configs/{channel}")
def upsert_channel_route(channel: str, payload: dict, x_tenant_id: str | None = Header(default=None)) -> dict[str, Any]:
    tenant_id = _tenant(x_tenant_id)
    return agents_store.upsert_channel_config(
        tenant_id, channel,
        payload.get("config") or {},
        bool(payload.get("enabled", True)),
    )
