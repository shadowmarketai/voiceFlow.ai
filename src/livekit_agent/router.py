"""
LiveKit API Router — Room management and token generation.
"""

import logging
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from livekit_agent.token_service import create_token, get_livekit_url, is_configured

logger = logging.getLogger(__name__)

livekit_router = APIRouter(prefix="/api/v1/livekit", tags=["LiveKit"])


class CreateRoomRequest(BaseModel):
    agent_id: str = ""
    agent_name: str = "AI Assistant"
    user_name: str = "User"
    room_name: Optional[str] = None


class RoomTokenResponse(BaseModel):
    token: str
    livekit_url: str
    room_name: str
    identity: str


class LiveKitStatusResponse(BaseModel):
    configured: bool
    livekit_url: str


@livekit_router.get("/status")
async def livekit_status() -> LiveKitStatusResponse:
    """Check if LiveKit is configured."""
    return LiveKitStatusResponse(
        configured=is_configured(),
        livekit_url=get_livekit_url(),
    )


@livekit_router.post("/token")
async def create_room_token(request: CreateRoomRequest) -> RoomTokenResponse:
    """Create a LiveKit room and return access token for the user.

    The AI agent will auto-join when the room is created.
    """
    if not is_configured():
        raise HTTPException(status_code=503, detail="LiveKit not configured")

    room_name = request.room_name or f"voiceflow-{uuid.uuid4().hex[:8]}"
    identity = f"user-{uuid.uuid4().hex[:6]}"

    token = create_token(
        identity=identity,
        room=room_name,
        name=request.user_name,
        can_publish=True,
        can_subscribe=True,
    )

    logger.info("LiveKit room token created: room=%s, identity=%s", room_name, identity)

    return RoomTokenResponse(
        token=token,
        livekit_url=get_livekit_url(),
        room_name=room_name,
        identity=identity,
    )


@livekit_router.post("/agent-token")
async def create_agent_token(request: CreateRoomRequest) -> RoomTokenResponse:
    """Create a token for the AI agent to join a room.

    Used by the backend agent worker to join and process audio.
    """
    if not is_configured():
        raise HTTPException(status_code=503, detail="LiveKit not configured")

    room_name = request.room_name or f"voiceflow-{uuid.uuid4().hex[:8]}"

    token = create_token(
        identity="ai-agent",
        room=room_name,
        name=request.agent_name,
        can_publish=True,
        can_subscribe=True,
    )

    return RoomTokenResponse(
        token=token,
        livekit_url=get_livekit_url(),
        room_name=room_name,
        identity="ai-agent",
    )
