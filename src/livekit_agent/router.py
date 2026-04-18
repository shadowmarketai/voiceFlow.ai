"""
LiveKit API Router — Room management, token generation, and agent spawning.
"""

import logging
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from livekit_agent.token_service import create_token, get_livekit_url, is_configured

logger = logging.getLogger(__name__)

livekit_router = APIRouter(prefix="/api/v1/livekit", tags=["LiveKit"])


class CreateRoomRequest(BaseModel):
    agent_id: str = ""
    agent_name: str = "AI Assistant"
    user_name: str = "User"
    room_name: str | None = None


class RoomTokenResponse(BaseModel):
    token: str
    livekit_url: str
    room_name: str
    identity: str
    agent_joined: bool = False


class LiveKitStatusResponse(BaseModel):
    configured: bool
    livekit_url: str
    agent_ready: bool = False


@livekit_router.get("/status")
async def livekit_status() -> LiveKitStatusResponse:
    """Check if LiveKit is configured and agent worker is available."""
    agent_ready = False
    try:
        from livekit_agent.voice_agent_worker import is_agent_ready
        agent_ready = is_agent_ready()
    except Exception:
        pass
    return LiveKitStatusResponse(
        configured=is_configured(),
        livekit_url=get_livekit_url(),
        agent_ready=agent_ready,
    )


@livekit_router.post("/token")
async def create_room_token(request: CreateRoomRequest) -> RoomTokenResponse:
    """Create a LiveKit room, return user token, and auto-spawn the AI agent.

    The AI agent worker joins the room automatically and starts listening.
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

    # Auto-spawn AI agent into the room
    agent_joined = False
    try:
        from livekit_agent.voice_agent_worker import spawn_agent, is_agent_ready
        if is_agent_ready():
            agent_joined = await spawn_agent(room_name, request.agent_id)
            if agent_joined:
                logger.info("AI agent spawned for room %s (agent_id=%s)", room_name, request.agent_id)
            else:
                logger.info("AI agent already running for room %s", room_name)
                agent_joined = True  # already running counts as joined
    except ImportError:
        logger.warning("LiveKit agents SDK not installed — voice call will work without AI agent")
    except Exception as exc:
        logger.warning("Failed to spawn AI agent for room %s: %s", room_name, exc)

    logger.info("LiveKit room token created: room=%s, identity=%s, agent=%s", room_name, identity, agent_joined)

    return RoomTokenResponse(
        token=token,
        livekit_url=get_livekit_url(),
        room_name=room_name,
        identity=identity,
        agent_joined=agent_joined,
    )


@livekit_router.post("/agent-token")
async def create_agent_token(request: CreateRoomRequest) -> RoomTokenResponse:
    """Create a token for the AI agent to join a room."""
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


@livekit_router.post("/agent-join")
async def join_agent_to_room(request: CreateRoomRequest):
    """Manually trigger the AI agent to join an existing room.

    Called if the agent didn't auto-join during token creation.
    """
    if not is_configured():
        raise HTTPException(status_code=503, detail="LiveKit not configured")

    if not request.room_name:
        raise HTTPException(status_code=400, detail="room_name is required")

    try:
        from livekit_agent.voice_agent_worker import spawn_agent, is_agent_ready
        if not is_agent_ready():
            raise HTTPException(status_code=503, detail="Agent worker not ready — missing API keys")
        started = await spawn_agent(request.room_name, request.agent_id)
        return {"success": True, "started": started, "room_name": request.room_name}
    except ImportError:
        raise HTTPException(status_code=503, detail="LiveKit agents SDK not installed")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to spawn agent: {exc}")
