"""
WebRTC — Browser-based voice calls (zero telephony cost).

Enables voice calls directly from web browsers and mobile apps
without any telephony provider charges.
Uses: ICE/STUN/TURN for NAT traversal, Opus codec for audio.
Cost: Rs 0/min (only server bandwidth costs)
"""

import json
import logging
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from .base import (
    CallDirection,
    CallRecord,
    CallStatus,
    ChannelType,
    PhoneNumber,
    TelephonyProvider,
)

logger = logging.getLogger(__name__)


class WebRTCProvider(TelephonyProvider):
    """WebRTC provider for browser-based voice calls.

    No telephony charges — audio is transported over the internet
    via WebRTC (ICE + DTLS-SRTP). Ideal for:
    - Website widget voice calls
    - Mobile app voice chat
    - Internal support calls
    - Demo/testing without phone numbers

    Architecture:
      Browser ──WebRTC──> VoiceFlow API (WebSocket signaling)
                              │
                         STT → LLM → TTS
                              │
      Browser <──WebRTC── VoiceFlow API (audio response)
    """

    name = "webrtc"
    display_name = "WebRTC (Browser)"
    country_focus = "global"
    channel_type = ChannelType.WEBRTC
    cost_per_minute_inr = 0.0

    def __init__(self):
        self.enabled = os.getenv("WEBRTC_ENABLED", "true").lower() == "true"
        self.stun_servers = self._parse_stun_servers()
        self.turn_servers = self._parse_turn_servers()
        self._active_sessions: Dict[str, Dict[str, Any]] = {}

    def is_configured(self) -> bool:
        return self.enabled

    def supports_streaming(self) -> bool:
        return True

    def _parse_stun_servers(self) -> List[Dict[str, Any]]:
        servers_str = os.getenv(
            "WEBRTC_STUN_SERVERS", "stun:stun.l.google.com:19302"
        )
        return [{"urls": s.strip()} for s in servers_str.split(",") if s.strip()]

    def _parse_turn_servers(self) -> List[Dict[str, Any]]:
        turn_url = os.getenv("WEBRTC_TURN_URL", "")
        if not turn_url:
            return []
        return [
            {
                "urls": turn_url,
                "username": os.getenv("WEBRTC_TURN_USERNAME", ""),
                "credential": os.getenv("WEBRTC_TURN_PASSWORD", ""),
            }
        ]

    def get_ice_config(self) -> Dict[str, Any]:
        """Get ICE configuration for WebRTC peer connection.

        Returns config to be sent to the browser client.
        """
        return {
            "iceServers": self.stun_servers + self.turn_servers,
            "iceTransportPolicy": "all",
            "bundlePolicy": "max-bundle",
            "rtcpMuxPolicy": "require",
        }

    def get_media_constraints(self) -> Dict[str, Any]:
        """Get recommended media constraints for the browser."""
        return {
            "audio": {
                "echoCancellation": True,
                "noiseSuppression": True,
                "autoGainControl": True,
                "sampleRate": 16000,
                "channelCount": 1,
            },
            "video": False,
        }

    async def create_session(
        self,
        agent_id: str = "",
        tenant_id: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Create a new WebRTC session for a browser client.

        Returns session_id and ICE config for the client to establish
        the peer connection.
        """
        session_id = f"webrtc_{uuid.uuid4().hex[:12]}"
        session = {
            "session_id": session_id,
            "agent_id": agent_id,
            "tenant_id": tenant_id,
            "status": CallStatus.INITIATED.value,
            "created_at": datetime.now().isoformat(),
            "ice_config": self.get_ice_config(),
            "media_constraints": self.get_media_constraints(),
            "metadata": metadata or {},
        }
        self._active_sessions[session_id] = session

        logger.info("WebRTC session created: %s (agent=%s)", session_id, agent_id)

        return {
            "success": True,
            "provider": self.name,
            "session_id": session_id,
            "ice_config": session["ice_config"],
            "media_constraints": session["media_constraints"],
            "signaling_url": f"/api/v1/webrtc/signal/{session_id}",
        }

    async def handle_offer(
        self, session_id: str, sdp_offer: str
    ) -> Dict[str, Any]:
        """Handle WebRTC SDP offer from browser.

        In production, this creates a server-side peer connection
        using aiortc or similar library, generates an SDP answer,
        and sets up the audio pipeline.
        """
        if session_id not in self._active_sessions:
            return {"success": False, "error": "Session not found"}

        self._active_sessions[session_id]["status"] = CallStatus.IN_PROGRESS.value
        self._active_sessions[session_id]["offer_received_at"] = (
            datetime.now().isoformat()
        )

        logger.info("WebRTC offer received for session: %s", session_id)

        # In production: create aiortc RTCPeerConnection, set remote description,
        # create answer, and return it
        return {
            "success": True,
            "session_id": session_id,
            "type": "answer",
            "sdp": "",  # Server SDP answer would go here
        }

    async def handle_ice_candidate(
        self, session_id: str, candidate: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Handle ICE candidate from browser."""
        if session_id not in self._active_sessions:
            return {"success": False, "error": "Session not found"}

        candidates = self._active_sessions[session_id].setdefault(
            "ice_candidates", []
        )
        candidates.append(candidate)
        return {"success": True}

    async def make_call(
        self, from_number: str, to_number: str, webhook_url: str, **kwargs
    ) -> Dict[str, Any]:
        """For WebRTC, 'making a call' creates a session.

        from_number = session identifier (e.g., browser tab ID)
        to_number = agent ID
        """
        return await self.create_session(
            agent_id=to_number,
            tenant_id=kwargs.get("tenant_id", ""),
            metadata=kwargs.get("metadata"),
        )

    async def get_call(self, call_id: str) -> Dict[str, Any]:
        if call_id in self._active_sessions:
            return self._active_sessions[call_id]
        return {"error": "Session not found"}

    async def end_call(self, call_id: str) -> Dict[str, Any]:
        if call_id in self._active_sessions:
            session = self._active_sessions[call_id]
            session["status"] = CallStatus.COMPLETED.value
            session["ended_at"] = datetime.now().isoformat()
            logger.info("WebRTC session ended: %s", call_id)
            return {"success": True}
        return {"success": False, "error": "Session not found"}

    async def get_recording(self, call_id: str) -> Optional[str]:
        session = self._active_sessions.get(call_id, {})
        return session.get("recording_path")

    async def list_phone_numbers(self) -> List[PhoneNumber]:
        # WebRTC doesn't use phone numbers
        return []

    async def buy_phone_number(
        self, country: str = "IN", capabilities: Optional[List[str]] = None
    ) -> PhoneNumber:
        raise NotImplementedError("WebRTC does not use phone numbers")

    def parse_webhook(self, payload: Dict) -> CallRecord:
        """Parse WebRTC session event."""
        status_map = {
            "created": CallStatus.INITIATED,
            "connected": CallStatus.IN_PROGRESS,
            "disconnected": CallStatus.COMPLETED,
            "failed": CallStatus.FAILED,
        }
        return CallRecord(
            id=payload.get("session_id", f"webrtc_{uuid.uuid4().hex[:8]}"),
            provider=self.name,
            provider_call_id=payload.get("session_id", ""),
            channel_type=ChannelType.WEBRTC,
            direction=CallDirection.INBOUND,
            status=status_map.get(payload.get("status", ""), CallStatus.INITIATED),
            from_number=payload.get("browser_id", "browser"),
            to_number=payload.get("agent_id", ""),
            initiated_at=datetime.fromisoformat(
                payload.get("created_at", datetime.now().isoformat())
            ),
            duration_seconds=int(payload.get("duration", 0)),
            cost=0.0,
            currency="INR",
        )
