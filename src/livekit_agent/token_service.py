"""
LiveKit Token Service — Generate access tokens for rooms using PyJWT.
"""

import logging
import os
import time

import jwt

logger = logging.getLogger(__name__)

LIVEKIT_API_KEY = os.environ.get("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.environ.get("LIVEKIT_API_SECRET", "")
LIVEKIT_URL = os.environ.get("LIVEKIT_URL", "")

LIVEKIT_EMPTY_TIMEOUT = int(os.environ.get("LIVEKIT_EMPTY_TIMEOUT", "30"))
LIVEKIT_MAX_PARTICIPANTS = int(os.environ.get("LIVEKIT_MAX_PARTICIPANTS", "4"))


def create_token(
    identity: str,
    room: str,
    name: str | None = None,
    can_publish: bool = True,
    can_subscribe: bool = True,
    ttl: int = 3600,
) -> str:
    """Create a LiveKit access token (JWT) using PyJWT.

    Args:
        identity: Unique participant identity (e.g., user_id or "ai-agent")
        room: Room name to join
        name: Display name
        can_publish: Can publish audio/video tracks
        can_subscribe: Can subscribe to other tracks
        ttl: Token time-to-live in seconds

    Returns:
        JWT token string
    """
    if not LIVEKIT_API_KEY or not LIVEKIT_API_SECRET:
        raise ValueError("LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set")

    now = int(time.time())

    claims = {
        "iss": LIVEKIT_API_KEY,
        "sub": identity,
        "iat": now,
        "nbf": now,
        "exp": now + ttl,
        "name": name or identity,
        "video": {
            "room": room,
            "roomJoin": True,
            "canPublish": can_publish,
            "canSubscribe": can_subscribe,
            "canPublishData": True,
            "roomCreate": True,
            "roomConfig": {
                "emptyTimeout": LIVEKIT_EMPTY_TIMEOUT,
                "maxParticipants": LIVEKIT_MAX_PARTICIPANTS,
            },
        },
    }

    token = jwt.encode(claims, LIVEKIT_API_SECRET, algorithm="HS256")
    return token


def get_livekit_url() -> str:
    """Get LiveKit WebSocket URL."""
    return LIVEKIT_URL


def is_configured() -> bool:
    """Check if LiveKit is configured."""
    return bool(LIVEKIT_API_KEY and LIVEKIT_API_SECRET and LIVEKIT_URL)
