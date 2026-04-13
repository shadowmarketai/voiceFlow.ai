"""
Vonage (Nexmo) — International voice API with India support.

Benefits: Good India coverage, WebSocket streaming, SIP connect.
Cost: ~Rs 3-4/min for India outbound
Docs: https://developer.vonage.com/en/voice/voice-api/overview
"""

import base64
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


class VonageProvider(TelephonyProvider):
    name = "vonage"
    display_name = "Vonage"
    country_focus = "global"
    channel_type = ChannelType.PSTN
    cost_per_minute_inr = 3.5

    def __init__(self):
        self.api_key = os.getenv("VONAGE_API_KEY", "")
        self.api_secret = os.getenv("VONAGE_API_SECRET", "")
        self.application_id = os.getenv("VONAGE_APPLICATION_ID", "")
        self.private_key_path = os.getenv("VONAGE_PRIVATE_KEY_PATH", "")
        self.base_url = "https://api.nexmo.com"
        self.voice_url = "https://api.nexmo.com/v1/calls"

    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_secret)

    def supports_streaming(self) -> bool:
        return True  # Vonage WebSocket connect

    def _basic_auth(self) -> str:
        creds = base64.b64encode(
            f"{self.api_key}:{self.api_secret}".encode()
        ).decode()
        return f"Basic {creds}"

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": self._basic_auth(),
            "Content-Type": "application/json",
        }

    async def make_call(
        self, from_number: str, to_number: str, webhook_url: str, **kwargs
    ) -> Dict[str, Any]:
        """Initiate call via Vonage NCCO (Nexmo Call Control Object)."""
        ncco = kwargs.get("ncco") or [
            {
                "action": "talk",
                "text": kwargs.get(
                    "greeting", "Connecting you to our AI assistant."
                ),
                "language": kwargs.get("language", "en-IN"),
            },
            {
                "action": "connect",
                "endpoint": [{"type": "phone", "number": to_number}],
            },
        ]

        # If streaming is requested, use WebSocket connect
        stream_url = kwargs.get("stream_url")
        if stream_url:
            ncco = [
                {
                    "action": "connect",
                    "endpoint": [
                        {
                            "type": "websocket",
                            "uri": stream_url,
                            "content-type": "audio/l16;rate=16000",
                            "headers": {
                                "agent_id": kwargs.get("agent_id", ""),
                            },
                        }
                    ],
                }
            ]

        payload = {
            "to": [{"type": "phone", "number": to_number}],
            "from": {"type": "phone", "number": from_number},
            "ncco": ncco,
            "event_url": [webhook_url],
        }

        if kwargs.get("record", True):
            payload["ncco"].insert(0, {"action": "record", "eventUrl": [webhook_url]})

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                self.voice_url, headers=self._headers(), json=payload
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                return {
                    "success": True,
                    "provider": self.name,
                    "call_id": data.get("uuid") or data.get("conversation_uuid"),
                    "status": CallStatus.INITIATED.value,
                }
            return {"success": False, "provider": self.name, "error": resp.text}

    async def get_call(self, call_id: str) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{self.voice_url}/{call_id}", headers=self._headers()
            )
            return resp.json() if resp.status_code == 200 else {"error": resp.text}

    async def end_call(self, call_id: str) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.put(
                f"{self.voice_url}/{call_id}",
                headers=self._headers(),
                json={"action": "hangup"},
            )
            return {"success": resp.status_code in (200, 204)}

    async def get_recording(self, call_id: str) -> Optional[str]:
        call = await self.get_call(call_id)
        return call.get("recording_url")

    async def list_phone_numbers(self) -> List[PhoneNumber]:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{self.base_url}/account/numbers",
                params={"api_key": self.api_key, "api_secret": self.api_secret},
            )
            if resp.status_code != 200:
                return []
            return [
                PhoneNumber(
                    id=n.get("id", n.get("msisdn", "")),
                    number=f"+{n.get('msisdn', '')}",
                    provider=self.name,
                    friendly_name=n.get("msisdn", ""),
                    capabilities=n.get("features", ["VOICE"]),
                    monthly_cost=float(n.get("cost", 0)) * 85,
                    currency="INR",
                    is_active=True,
                )
                for n in resp.json().get("numbers", [])
            ]

    async def buy_phone_number(
        self, country: str = "IN", capabilities: Optional[List[str]] = None
    ) -> PhoneNumber:
        async with httpx.AsyncClient(timeout=15) as client:
            search = await client.get(
                f"{self.base_url}/number/search",
                params={
                    "api_key": self.api_key,
                    "api_secret": self.api_secret,
                    "country": country,
                    "features": "VOICE",
                },
            )
            if search.status_code != 200:
                raise RuntimeError("Vonage number search failed")
            numbers = search.json().get("numbers", [])
            if not numbers:
                raise RuntimeError("No Vonage numbers available")

            msisdn = numbers[0]["msisdn"]
            buy = await client.post(
                f"{self.base_url}/number/buy",
                data={
                    "api_key": self.api_key,
                    "api_secret": self.api_secret,
                    "country": country,
                    "msisdn": msisdn,
                },
            )
            if buy.status_code == 200:
                return PhoneNumber(
                    id=msisdn,
                    number=f"+{msisdn}",
                    provider=self.name,
                    friendly_name=msisdn,
                    capabilities=["voice"],
                    monthly_cost=float(numbers[0].get("cost", 0)) * 85,
                    currency="INR",
                )
            raise RuntimeError(f"Vonage buy failed: {buy.text}")

    def parse_webhook(self, payload: Dict) -> CallRecord:
        status_map = {
            "started": CallStatus.INITIATED,
            "ringing": CallStatus.RINGING,
            "answered": CallStatus.IN_PROGRESS,
            "completed": CallStatus.COMPLETED,
            "failed": CallStatus.FAILED,
            "busy": CallStatus.BUSY,
            "timeout": CallStatus.NO_ANSWER,
            "cancelled": CallStatus.CANCELLED,
            "rejected": CallStatus.FAILED,
            "unanswered": CallStatus.NO_ANSWER,
        }
        return CallRecord(
            id=f"vonage_{payload.get('uuid', payload.get('conversation_uuid', ''))}",
            provider=self.name,
            provider_call_id=payload.get("uuid", ""),
            direction=(
                CallDirection.INBOUND
                if payload.get("direction") == "inbound"
                else CallDirection.OUTBOUND
            ),
            status=status_map.get(payload.get("status", ""), CallStatus.INITIATED),
            from_number=payload.get("from", ""),
            to_number=payload.get("to", ""),
            initiated_at=datetime.fromisoformat(
                payload.get("timestamp", datetime.now().isoformat())
            ),
            duration_seconds=int(payload.get("duration", 0)),
            recording_url=payload.get("recording_url"),
            cost=float(payload.get("price", 0)) * 85,
            currency="INR",
        )
