"""
LiveKit Token Service — Generate access tokens for rooms.
"""

import logging
import os
import time
import json
import hmac
import hashlib
import base64
from typing import Optional

logger = logging.getLogger(__name__)

LIVEKIT_API_KEY = os.environ.get("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.environ.get("LIVEKIT_API_SECRET", "")
LIVEKIT_URL = os.environ.get("LIVEKIT_URL", "")

# W6.3 — idle-room kill. Empty rooms are auto-deleted after this many
# seconds so WebRTC bandwidth/CPU doesn't keep burning on abandoned
# sessions. 30s default — short enough to close abandoned calls
# quickly, long enough that a reconnect grace period still works.
LIVEKIT_EMPTY_TIMEOUT = int(os.environ.get("LIVEKIT_EMPTY_TIMEOUT", "30"))
# Max participants per room — keeps a leaked token from spinning up
# a 100-person room and chewing bandwidth.
LIVEKIT_MAX_PARTICIPANTS = int(os.environ.get("LIVEKIT_MAX_PARTICIPANTS", "4"))


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def create_token(
    identity: str,
    room: str,
    name: Optional[str] = None,
    can_publish: bool = True,
    can_subscribe: bool = True,
    ttl: int = 3600,
) -> str:
    """Create a LiveKit access token (JWT).

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

    header = _b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())

    # W6.3 — roomConfig inside the video claim auto-applies on first
    # participant join. LiveKit server enforces emptyTimeout + maxParticipants
    # so we don't need a separate room creation RPC.
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

    payload = _b64url_encode(json.dumps(claims).encode())
    signature = _b64url_encode(
        hmac.new(
            LIVEKIT_API_SECRET.encode(),
            f"{header}.{payload}".encode(),
            hashlib.sha256,
        ).digest()
    )

    return f"{header}.{payload}.{signature}"


def get_livekit_url() -> str:
    """Get LiveKit WebSocket URL."""
    return LIVEKIT_URL


def is_configured() -> bool:
    """Check if LiveKit is configured."""
    return bool(LIVEKIT_API_KEY and LIVEKIT_API_SECRET and LIVEKIT_URL)
