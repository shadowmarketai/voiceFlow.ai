"""
Real-time WebSocket layer
==========================
Generic pub/sub over WebSocket. Used for live updates anywhere in the
app: tickets, dashboard counts, notifications, etc.

Architecture:
  - ConnectionManager keeps a registry: connections[user_id] = {WebSocket, ...}
  - Plus channels[name] = set of user_ids (for tenant-scoped or role-scoped broadcasts)
  - Broadcast helpers: to_user, to_tenant, to_super_admins, to_all
  - Endpoint: /api/v1/ws — JWT-authenticated via ?token=<jwt> query param

Message envelope:
    { "type": "<event_type>", "payload": {...}, "ts": "<iso>" }

Events used so far:
    ticket.created          → broadcast to super_admins
    ticket.updated          → broadcast to super_admins + the tenant that owns it
    ticket.reply.created    → broadcast to super_admins + the tenant that owns it
    ticket.resolved         → same
"""

import asyncio
import datetime
import json
import logging
from typing import Optional

import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from starlette.websockets import WebSocketState

from api.config import settings
from api.database import db, USE_POSTGRES

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["WebSocket"])

_ph = "%s" if USE_POSTGRES else "?"


# ── Connection manager ─────────────────────────────────────────────


class ConnectionManager:
    """Tracks all active WebSocket connections and provides broadcast helpers.

    Each connection is associated with a user identity (id, email, role,
    is_super_admin, tenant_id) so broadcasts can target the right audience.
    """

    def __init__(self) -> None:
        # connection_id → (websocket, user_dict)
        self._connections: dict[str, tuple[WebSocket, dict]] = {}
        # user_id → set of connection_ids (one user may have multiple tabs open)
        self._user_index: dict[str, set[str]] = {}
        # tenant_id → set of connection_ids
        self._tenant_index: dict[str, set[str]] = {}
        # super-admin connection ids
        self._super_admins: set[str] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket, user: dict) -> str:
        await ws.accept()
        conn_id = f"c{id(ws)}"
        async with self._lock:
            self._connections[conn_id] = (ws, user)
            uid = user.get("id")
            if uid:
                self._user_index.setdefault(uid, set()).add(conn_id)
            tid = user.get("tenant_id")
            if tid:
                self._tenant_index.setdefault(tid, set()).add(conn_id)
            if user.get("is_super_admin"):
                self._super_admins.add(conn_id)
        logger.info("WS connect %s (user=%s, tenant=%s, super=%s)",
                    conn_id, user.get("email"), user.get("tenant_id"), user.get("is_super_admin"))
        return conn_id

    async def disconnect(self, conn_id: str) -> None:
        async with self._lock:
            entry = self._connections.pop(conn_id, None)
            if not entry:
                return
            _, user = entry
            uid = user.get("id")
            if uid and uid in self._user_index:
                self._user_index[uid].discard(conn_id)
                if not self._user_index[uid]:
                    del self._user_index[uid]
            tid = user.get("tenant_id")
            if tid and tid in self._tenant_index:
                self._tenant_index[tid].discard(conn_id)
                if not self._tenant_index[tid]:
                    del self._tenant_index[tid]
            self._super_admins.discard(conn_id)
        logger.info("WS disconnect %s", conn_id)

    async def _send(self, conn_id: str, message: dict) -> None:
        entry = self._connections.get(conn_id)
        if not entry:
            return
        ws, _ = entry
        if ws.client_state != WebSocketState.CONNECTED:
            return
        try:
            await ws.send_text(json.dumps(message))
        except Exception as exc:
            logger.warning("WS send to %s failed: %s", conn_id, exc)
            # Connection may be dead; remove it
            await self.disconnect(conn_id)

    async def broadcast(self, target_ids: set[str], event_type: str, payload: dict) -> None:
        envelope = {
            "type": event_type,
            "payload": payload,
            "ts": datetime.datetime.utcnow().isoformat(),
        }
        for cid in list(target_ids):
            await self._send(cid, envelope)

    async def to_user(self, user_id: str, event_type: str, payload: dict) -> None:
        await self.broadcast(self._user_index.get(user_id, set()), event_type, payload)

    async def to_tenant(self, tenant_id: str, event_type: str, payload: dict) -> None:
        await self.broadcast(self._tenant_index.get(tenant_id, set()), event_type, payload)

    async def to_super_admins(self, event_type: str, payload: dict) -> None:
        await self.broadcast(self._super_admins, event_type, payload)

    async def to_all(self, event_type: str, payload: dict) -> None:
        await self.broadcast(set(self._connections.keys()), event_type, payload)

    @property
    def stats(self) -> dict:
        return {
            "total_connections": len(self._connections),
            "unique_users": len(self._user_index),
            "tenants_connected": len(self._tenant_index),
            "super_admins_connected": len(self._super_admins),
        }


# ── Singleton instance ─────────────────────────────────────────────

manager = ConnectionManager()


# ── Auth: decode JWT from query param (browsers can't set headers on WS) ──


def _authenticate(token: str) -> Optional[dict]:
    """Decode the JWT and load the user from DB. Returns None on failure."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except jwt.PyJWTError as exc:
        logger.warning("WS auth failed: %s", exc)
        return None
    email = payload.get("sub")
    if not email:
        return None
    try:
        with db() as conn:
            row = conn.execute(
                f"SELECT id, email, name, role, is_active, is_super_admin, tenant_id "
                f"FROM users WHERE email={_ph}",
                (email,),
            ).fetchone()
            if not row:
                return None
            user = dict(row)
            if not user.get("is_active", 1):
                return None
            user["is_super_admin"] = bool(user.get("is_super_admin"))
            return user
    except Exception as exc:
        logger.error("WS auth DB error: %s", exc)
        return None


# ── WebSocket endpoint ─────────────────────────────────────────────


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(..., description="JWT access token"),
):
    """Authenticated WebSocket. Connect with /api/v1/ws?token=<jwt>."""
    user = _authenticate(token)
    if not user:
        await websocket.close(code=4401, reason="Unauthorized")
        return

    conn_id = await manager.connect(websocket, user)

    # Send a hello message
    await manager._send(conn_id, {
        "type": "hello",
        "payload": {
            "user_id": user["id"],
            "email": user["email"],
            "is_super_admin": user["is_super_admin"],
            "tenant_id": user.get("tenant_id"),
        },
        "ts": datetime.datetime.utcnow().isoformat(),
    })

    try:
        # Keep the connection alive. We don't expect client→server messages
        # for now (the client just listens). We do support a "ping" → "pong"
        # for keepalive from the client side.
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if msg.get("type") == "ping":
                await manager._send(conn_id, {
                    "type": "pong",
                    "payload": {},
                    "ts": datetime.datetime.utcnow().isoformat(),
                })
    except WebSocketDisconnect:
        await manager.disconnect(conn_id)
    except Exception as exc:
        logger.warning("WS error on %s: %s", conn_id, exc)
        await manager.disconnect(conn_id)


@router.get("/ws/stats")
async def ws_stats():
    """Diagnostic: how many WS clients are connected right now."""
    return manager.stats
