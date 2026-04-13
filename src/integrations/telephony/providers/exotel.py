"""
Exotel — Indian IVR-focused telephony provider.

Cost: ~Rs 1.5-2/min
Benefits: Excellent IVR (ExoML), good for call centers.
Docs: https://developer.exotel.com/
"""

import json
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


class ExotelProvider(TelephonyProvider):
    name = "exotel"
    display_name = "Exotel"
    country_focus = "IN"
    channel_type = ChannelType.PSTN
    cost_per_minute_inr = 1.5

    def __init__(self):
        self.api_key = os.getenv("EXOTEL_API_KEY", "")
        self.api_token = os.getenv("EXOTEL_API_TOKEN", "")
        self.sid = os.getenv("EXOTEL_SID", "")
        self.subdomain = os.getenv("EXOTEL_SUBDOMAIN", "api.exotel.com")
        self.base_url = f"https://{self.subdomain}/v1/Accounts/{self.sid}"

    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_token and self.sid)

    def _auth(self):
        return (self.api_key, self.api_token)

    async def make_call(
        self, from_number: str, to_number: str, webhook_url: str, **kwargs
    ) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{self.base_url}/Calls/connect",
                auth=self._auth(),
                data={
                    "From": from_number,
                    "To": to_number,
                    "CallerId": kwargs.get("caller_id", from_number),
                    "Url": webhook_url,
                    "Record": "true" if kwargs.get("record", True) else "false",
                    "TimeLimit": kwargs.get("timeout", 3600),
                    "CustomField": json.dumps(kwargs.get("metadata", {})),
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "success": True,
                    "provider": self.name,
                    "call_id": data.get("Call", {}).get("Sid"),
                    "status": CallStatus.INITIATED.value,
                }
            return {"success": False, "provider": self.name, "error": resp.text}

    async def get_call(self, call_id: str) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{self.base_url}/Calls/{call_id}", auth=self._auth()
            )
            return resp.json() if resp.status_code == 200 else {"error": resp.text}

    async def end_call(self, call_id: str) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{self.base_url}/Calls/{call_id}",
                auth=self._auth(),
                data={"Status": "completed"},
            )
            return {"success": resp.status_code == 200}

    async def get_recording(self, call_id: str) -> Optional[str]:
        call = await self.get_call(call_id)
        return call.get("Call", {}).get("RecordingUrl")

    async def list_phone_numbers(self) -> List[PhoneNumber]:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{self.base_url}/IncomingPhoneNumbers", auth=self._auth()
            )
            if resp.status_code != 200:
                return []
            return [
                PhoneNumber(
                    id=n["Sid"],
                    number=n["PhoneNumber"],
                    provider=self.name,
                    friendly_name=n.get("FriendlyName", n["PhoneNumber"]),
                    capabilities=["voice"],
                    monthly_cost=n.get("MonthlyRental", 500),
                    is_active=True,
                )
                for n in resp.json().get("IncomingPhoneNumbers", [])
            ]

    async def buy_phone_number(
        self, country: str = "IN", capabilities: Optional[List[str]] = None
    ) -> PhoneNumber:
        raise NotImplementedError(
            "Exotel requires manual approval — contact support to provision numbers"
        )

    def parse_webhook(self, payload: Dict) -> CallRecord:
        status_map = {
            "initiated": CallStatus.INITIATED,
            "ringing": CallStatus.RINGING,
            "in-progress": CallStatus.IN_PROGRESS,
            "completed": CallStatus.COMPLETED,
            "failed": CallStatus.FAILED,
            "busy": CallStatus.BUSY,
            "no-answer": CallStatus.NO_ANSWER,
        }
        return CallRecord(
            id=f"exotel_{payload.get('CallSid')}",
            provider=self.name,
            provider_call_id=payload.get("CallSid", ""),
            direction=(
                CallDirection.INBOUND
                if payload.get("Direction") == "incoming"
                else CallDirection.OUTBOUND
            ),
            status=status_map.get(
                payload.get("Status", "").lower(), CallStatus.INITIATED
            ),
            from_number=payload.get("From", ""),
            to_number=payload.get("To", ""),
            initiated_at=datetime.fromisoformat(
                payload.get("StartTime", datetime.now().isoformat())
            ),
            answered_at=(
                datetime.fromisoformat(payload["AnswerTime"])
                if payload.get("AnswerTime")
                else None
            ),
            ended_at=(
                datetime.fromisoformat(payload["EndTime"])
                if payload.get("EndTime")
                else None
            ),
            duration_seconds=int(payload.get("Duration", 0)),
            recording_url=payload.get("RecordingUrl"),
            cost=float(payload.get("Price", 0)),
            currency="INR",
        )

    def generate_exoml(self, action: str, **params) -> str:
        """Generate ExoML response for IVR flows."""
        templates = {
            "say": '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n    <Say language="{language}">{text}</Say>\n</Response>',
            "play": '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n    <Play>{audio_url}</Play>\n</Response>',
            "record": '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n    <Record maxLength="{max_length}" action="{callback_url}"/>\n</Response>',
            "gather": '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n    <Gather numDigits="{num_digits}" action="{callback_url}">\n        <Say>{prompt}</Say>\n    </Gather>\n</Response>',
            "hangup": '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n    <Hangup/>\n</Response>',
        }
        defaults = {
            "language": "en-IN",
            "text": "",
            "audio_url": "",
            "max_length": 60,
            "callback_url": "",
            "num_digits": 1,
            "prompt": "Please enter your choice",
        }
        defaults.update(params)
        template = templates.get(action, templates["hangup"])
        return template.format(**defaults)
