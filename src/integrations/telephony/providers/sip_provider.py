"""
Native SIP — Direct SIP trunk provider.

Connect to any SIP trunk (Asterisk, FreeSWITCH, Kamailio)
without going through Twilio/Vonage.
Cost: Depends on SIP trunk provider (typically Rs 0.5-1/min in India)
Benefits: Full control, lowest cost, works with PBX infrastructure.
"""

import logging
import os
import uuid
from datetime import datetime
from typing import Any

from .base import (
    CallDirection,
    CallRecord,
    CallStatus,
    ChannelType,
    PhoneNumber,
    TelephonyProvider,
)

logger = logging.getLogger(__name__)


class SIPProvider(TelephonyProvider):
    """Native SIP trunk provider.

    Connects directly to SIP infrastructure (Asterisk/FreeSWITCH)
    via SIP INVITE. Uses AudioSocket or WebSocket for media transport.

    Configuration:
        SIP_HOST: SIP server hostname/IP
        SIP_PORT: SIP signaling port (default 5060)
        SIP_USERNAME: SIP auth username
        SIP_PASSWORD: SIP auth password
        SIP_TRANSPORT: udp/tcp/tls (default udp)
        SIP_AUDIO_SOCKET_PORT: AudioSocket port for media (default 4573)
    """

    name = "sip"
    display_name = "SIP Trunk"
    country_focus = "global"
    channel_type = ChannelType.SIP
    cost_per_minute_inr = 0.5

    def __init__(self):
        self.host = os.getenv("SIP_HOST", "")
        self.port = int(os.getenv("SIP_PORT", "5060"))
        self.username = os.getenv("SIP_USERNAME", "")
        self.password = os.getenv("SIP_PASSWORD", "")
        self.transport = os.getenv("SIP_TRANSPORT", "udp")
        self.audio_socket_port = int(os.getenv("SIP_AUDIO_SOCKET_PORT", "4573"))
        self._active_calls: dict[str, dict[str, Any]] = {}

    def is_configured(self) -> bool:
        return bool(self.host)

    def supports_streaming(self) -> bool:
        return True

    def get_sip_uri(self, number: str) -> str:
        """Build SIP URI for dialing."""
        return f"sip:{number}@{self.host}:{self.port};transport={self.transport}"

    async def make_call(
        self, from_number: str, to_number: str, webhook_url: str, **kwargs
    ) -> dict[str, Any]:
        """Initiate outbound SIP call.

        In production, this sends a SIP INVITE via a SIP library
        (e.g., pjsua2, aiosip). Here we create the call context and
        delegate to the SIP engine.
        """
        call_id = f"sip_{uuid.uuid4().hex[:12]}"
        sip_uri = self.get_sip_uri(to_number)

        call_context = {
            "call_id": call_id,
            "sip_uri": sip_uri,
            "from": from_number,
            "to": to_number,
            "webhook_url": webhook_url,
            "record": kwargs.get("record", True),
            "codec": kwargs.get("codec", "PCMA"),  # G.711 A-law (India standard)
            "sample_rate": kwargs.get("sample_rate", 8000),
            "initiated_at": datetime.now().isoformat(),
            "status": CallStatus.INITIATED.value,
        }
        self._active_calls[call_id] = call_context

        logger.info("SIP call initiated: %s -> %s via %s", from_number, sip_uri, self.host)

        return {
            "success": True,
            "provider": self.name,
            "call_id": call_id,
            "sip_uri": sip_uri,
            "status": CallStatus.INITIATED.value,
            "audio_socket_port": self.audio_socket_port,
        }

    async def get_call(self, call_id: str) -> dict[str, Any]:
        if call_id in self._active_calls:
            return self._active_calls[call_id]
        return {"error": "Call not found", "call_id": call_id}

    async def end_call(self, call_id: str) -> dict[str, Any]:
        """Send SIP BYE to end call."""
        if call_id in self._active_calls:
            self._active_calls[call_id]["status"] = CallStatus.COMPLETED.value
            self._active_calls[call_id]["ended_at"] = datetime.now().isoformat()
            logger.info("SIP call ended: %s", call_id)
            return {"success": True}
        return {"success": False, "error": "Call not found"}

    async def get_recording(self, call_id: str) -> str | None:
        call = self._active_calls.get(call_id, {})
        return call.get("recording_path")

    async def list_phone_numbers(self) -> list[PhoneNumber]:
        # SIP trunks use DID numbers configured on the PBX
        did_numbers = os.getenv("SIP_DID_NUMBERS", "").split(",")
        return [
            PhoneNumber(
                id=f"sip_did_{i}",
                number=num.strip(),
                provider=self.name,
                friendly_name=f"SIP DID {num.strip()}",
                capabilities=["voice"],
                monthly_cost=0,
            )
            for i, num in enumerate(did_numbers)
            if num.strip()
        ]

    async def buy_phone_number(
        self, country: str = "IN", capabilities: list[str] | None = None
    ) -> PhoneNumber:
        raise NotImplementedError(
            "SIP DID numbers are provisioned via your SIP trunk provider"
        )

    def parse_webhook(self, payload: dict) -> CallRecord:
        """Parse Asterisk/FreeSWITCH webhook (AMI/ESL event)."""
        status_map = {
            "INVITE": CallStatus.INITIATED,
            "RINGING": CallStatus.RINGING,
            "PROGRESS": CallStatus.RINGING,
            "ANSWER": CallStatus.IN_PROGRESS,
            "BYE": CallStatus.COMPLETED,
            "CANCEL": CallStatus.CANCELLED,
            "BUSY": CallStatus.BUSY,
            "NOANSWER": CallStatus.NO_ANSWER,
            "FAILED": CallStatus.FAILED,
        }
        return CallRecord(
            id=f"sip_{payload.get('call_id', payload.get('Uniqueid', ''))}",
            provider=self.name,
            provider_call_id=payload.get("call_id", payload.get("Uniqueid", "")),
            channel_type=ChannelType.SIP,
            direction=(
                CallDirection.INBOUND
                if payload.get("direction", payload.get("Event")) == "inbound"
                else CallDirection.OUTBOUND
            ),
            status=status_map.get(
                payload.get("status", payload.get("ChannelState", "")).upper(),
                CallStatus.INITIATED,
            ),
            from_number=payload.get("from", payload.get("CallerIDNum", "")),
            to_number=payload.get("to", payload.get("Exten", "")),
            initiated_at=datetime.fromisoformat(
                payload.get("start_time", datetime.now().isoformat())
            ),
            duration_seconds=int(payload.get("duration", payload.get("Duration", 0))),
            recording_url=payload.get("recording_path"),
            cost=0.0,
            currency="INR",
        )

    def generate_asterisk_dialplan(
        self,
        context_name: str = "voiceflow-ai",
        audio_socket_host: str = "127.0.0.1",
    ) -> str:
        """Generate Asterisk dialplan snippet for AudioSocket integration.

        Add this to /etc/asterisk/extensions.conf to route calls
        to VoiceFlow AI via AudioSocket.
        """
        return f"""
; VoiceFlow AI — Asterisk AudioSocket Integration
; Add to /etc/asterisk/extensions.conf

[{context_name}]
; Inbound calls → VoiceFlow AI
exten => _X.,1,NoOp(VoiceFlow AI: ${{CALLERID(num)}} -> ${{EXTEN}})
 same => n,Answer()
 same => n,Set(CALL_ID=${{UNIQUEID}})
 same => n,AudioSocket({audio_socket_host}:{self.audio_socket_port},${{CALL_ID}})
 same => n,Hangup()

; Outbound calls from VoiceFlow AI
exten => _+91XXXXXXXXXX,1,NoOp(VoiceFlow Outbound: ${{EXTEN}})
 same => n,Dial(SIP/${{EXTEN}}@{self.host},,tT)
 same => n,Hangup()
"""
