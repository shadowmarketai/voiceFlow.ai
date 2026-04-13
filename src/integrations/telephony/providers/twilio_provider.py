"""
Twilio — International telephony provider (fallback for non-India).

Cost: ~Rs 4.5/min for India (use TeleCMI/Bolna instead for India calls)
Benefits: Global coverage, mature APIs, WebSocket streaming.
Docs: https://www.twilio.com/docs/voice
"""

import logging
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

from .base import (
    CallDirection,
    CallRecord,
    CallStatus,
    ChannelType,
    PhoneNumber,
    TelephonyProvider,
)

logger = logging.getLogger(__name__)


class TwilioProvider(TelephonyProvider):
    name = "twilio"
    display_name = "Twilio"
    country_focus = "global"
    channel_type = ChannelType.PSTN
    cost_per_minute_inr = 4.5

    def __init__(self):
        self.account_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
        self.auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
        self.base_url = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}"

    def is_configured(self) -> bool:
        return bool(self.account_sid and self.auth_token)

    def supports_streaming(self) -> bool:
        return True  # Twilio Media Streams

    def _auth(self):
        return (self.account_sid, self.auth_token)

    async def make_call(
        self, from_number: str, to_number: str, webhook_url: str, **kwargs
    ) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{self.base_url}/Calls.json",
                auth=self._auth(),
                data={
                    "From": from_number,
                    "To": to_number,
                    "Url": webhook_url,
                    "Record": "true" if kwargs.get("record", True) else "false",
                    "Timeout": kwargs.get("timeout", 60),
                    "StatusCallback": kwargs.get("status_callback", webhook_url),
                },
            )
            if resp.status_code == 201:
                data = resp.json()
                return {
                    "success": True,
                    "provider": self.name,
                    "call_id": data.get("sid"),
                    "status": CallStatus.INITIATED.value,
                }
            return {"success": False, "provider": self.name, "error": resp.text}

    async def make_call_with_stream(
        self,
        from_number: str,
        to_number: str,
        stream_url: str,
        **kwargs,
    ) -> Dict[str, Any]:
        """Initiate call with Twilio Media Streams for real-time audio."""
        twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="{stream_url}">
            <Parameter name="agent_id" value="{kwargs.get('agent_id', '')}"/>
        </Stream>
    </Connect>
</Response>"""

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{self.base_url}/Calls.json",
                auth=self._auth(),
                data={
                    "From": from_number,
                    "To": to_number,
                    "Twiml": twiml,
                    "Record": "true" if kwargs.get("record", True) else "false",
                },
            )
            if resp.status_code == 201:
                return {
                    "success": True,
                    "provider": self.name,
                    "call_id": resp.json().get("sid"),
                    "streaming": True,
                }
            return {"success": False, "provider": self.name, "error": resp.text}

    async def get_call(self, call_id: str) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{self.base_url}/Calls/{call_id}.json", auth=self._auth()
            )
            return resp.json() if resp.status_code == 200 else {"error": resp.text}

    async def end_call(self, call_id: str) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{self.base_url}/Calls/{call_id}.json",
                auth=self._auth(),
                data={"Status": "completed"},
            )
            return {"success": resp.status_code == 200}

    async def get_recording(self, call_id: str) -> Optional[str]:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{self.base_url}/Calls/{call_id}/Recordings.json",
                auth=self._auth(),
            )
            if resp.status_code == 200:
                recordings = resp.json().get("recordings", [])
                if recordings:
                    return recordings[0].get("media_url")
        return None

    async def list_phone_numbers(self) -> List[PhoneNumber]:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{self.base_url}/IncomingPhoneNumbers.json", auth=self._auth()
            )
            if resp.status_code != 200:
                return []
            return [
                PhoneNumber(
                    id=n["sid"],
                    number=n["phone_number"],
                    provider=self.name,
                    friendly_name=n.get("friendly_name", n["phone_number"]),
                    capabilities=self._parse_caps(n.get("capabilities", {})),
                    monthly_cost=float(n.get("monthly_price", 1.0)) * 85,
                    currency="INR",
                    is_active=n.get("status") == "in-use",
                )
                for n in resp.json().get("incoming_phone_numbers", [])
            ]

    async def buy_phone_number(
        self, country: str = "IN", capabilities: Optional[List[str]] = None
    ) -> PhoneNumber:
        async with httpx.AsyncClient(timeout=15) as client:
            search = await client.get(
                f"{self.base_url}/AvailablePhoneNumbers/{country}/Local.json",
                auth=self._auth(),
            )
            if search.status_code != 200:
                raise RuntimeError("No Twilio numbers available")
            available = search.json().get("available_phone_numbers", [])
            if not available:
                raise RuntimeError("No Twilio numbers available")

            buy = await client.post(
                f"{self.base_url}/IncomingPhoneNumbers.json",
                auth=self._auth(),
                data={"PhoneNumber": available[0]["phone_number"]},
            )
            if buy.status_code == 201:
                d = buy.json()
                return PhoneNumber(
                    id=d["sid"],
                    number=d["phone_number"],
                    provider=self.name,
                    friendly_name=d["phone_number"],
                    capabilities=["voice"],
                    monthly_cost=float(d.get("monthly_price", 1.0)) * 85,
                    currency="INR",
                )
            raise RuntimeError(f"Twilio buy failed: {buy.text}")

    def parse_webhook(self, payload: Dict) -> CallRecord:
        status_map = {
            "queued": CallStatus.INITIATED,
            "ringing": CallStatus.RINGING,
            "in-progress": CallStatus.IN_PROGRESS,
            "completed": CallStatus.COMPLETED,
            "failed": CallStatus.FAILED,
            "busy": CallStatus.BUSY,
            "no-answer": CallStatus.NO_ANSWER,
            "canceled": CallStatus.CANCELLED,
        }
        return CallRecord(
            id=f"twilio_{payload.get('CallSid')}",
            provider=self.name,
            provider_call_id=payload.get("CallSid", ""),
            direction=(
                CallDirection.INBOUND
                if payload.get("Direction") == "inbound"
                else CallDirection.OUTBOUND
            ),
            status=status_map.get(
                payload.get("CallStatus", "").lower(), CallStatus.INITIATED
            ),
            from_number=payload.get("From", ""),
            to_number=payload.get("To", ""),
            initiated_at=datetime.now(),
            duration_seconds=int(payload.get("CallDuration", 0)),
            recording_url=payload.get("RecordingUrl"),
        )

    @staticmethod
    def _parse_caps(caps: Dict) -> List[str]:
        return [k for k, v in caps.items() if v and k in ("voice", "sms", "mms")]
