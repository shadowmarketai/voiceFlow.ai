"""
TeleCMI — Primary Indian telephony provider.

Cost: ~Rs 1.2/min outbound, ~Rs 0.8/min inbound
Benefits: 70% cheaper than Twilio for India, native Indian support.
Docs: https://doc.telecmi.com/
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


class TeleCMIProvider(TelephonyProvider):
    name = "telecmi"
    display_name = "TeleCMI"
    country_focus = "IN"
    channel_type = ChannelType.PSTN
    cost_per_minute_inr = 1.2

    def __init__(self):
        self.api_key = os.getenv("TELECMI_API_KEY", "")
        self.api_secret = os.getenv("TELECMI_API_SECRET", "")
        self.account_id = os.getenv("TELECMI_ACCOUNT_ID", "")
        self.base_url = "https://rest.telecmi.com/v2"

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def make_call(
        self, from_number: str, to_number: str, webhook_url: str, **kwargs
    ) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{self.base_url}/call/dial",
                headers=self._headers(),
                json={
                    "from": from_number,
                    "to": to_number,
                    "callback_url": webhook_url,
                    "recording": kwargs.get("record", True),
                    "timeout": kwargs.get("timeout", 60),
                    "custom_data": kwargs.get("metadata", {}),
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "success": True,
                    "provider": self.name,
                    "call_id": data.get("call_id"),
                    "status": CallStatus.INITIATED.value,
                }
            return {"success": False, "provider": self.name, "error": resp.text}

    async def get_call(self, call_id: str) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{self.base_url}/call/{call_id}", headers=self._headers()
            )
            return resp.json() if resp.status_code == 200 else {"error": resp.text}

    async def end_call(self, call_id: str) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{self.base_url}/call/{call_id}/hangup", headers=self._headers()
            )
            return {"success": resp.status_code == 200}

    async def get_recording(self, call_id: str) -> Optional[str]:
        call = await self.get_call(call_id)
        return call.get("recording_url")

    async def list_phone_numbers(self) -> List[PhoneNumber]:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{self.base_url}/numbers", headers=self._headers()
            )
            if resp.status_code != 200:
                return []
            return [
                PhoneNumber(
                    id=n["id"],
                    number=n["number"],
                    provider=self.name,
                    friendly_name=n.get("friendly_name", n["number"]),
                    capabilities=n.get("capabilities", ["voice"]),
                    monthly_cost=n.get("monthly_cost", 500),
                    is_active=n.get("active", True),
                )
                for n in resp.json().get("numbers", [])
            ]

    async def buy_phone_number(
        self, country: str = "IN", capabilities: Optional[List[str]] = None
    ) -> PhoneNumber:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{self.base_url}/numbers/buy",
                headers=self._headers(),
                json={
                    "country": country,
                    "type": "local",
                    "capabilities": capabilities or ["voice"],
                },
            )
            if resp.status_code == 200:
                d = resp.json()
                return PhoneNumber(
                    id=d["id"],
                    number=d["number"],
                    provider=self.name,
                    friendly_name=d["number"],
                    capabilities=d.get("capabilities", ["voice"]),
                    monthly_cost=d.get("monthly_cost", 500),
                )
            raise RuntimeError(f"TeleCMI buy_phone_number failed: {resp.text}")

    def parse_webhook(self, payload: Dict) -> CallRecord:
        status_map = {
            "initiated": CallStatus.INITIATED,
            "ringing": CallStatus.RINGING,
            "answered": CallStatus.IN_PROGRESS,
            "completed": CallStatus.COMPLETED,
            "failed": CallStatus.FAILED,
            "busy": CallStatus.BUSY,
            "no-answer": CallStatus.NO_ANSWER,
        }
        return CallRecord(
            id=f"telecmi_{payload.get('call_id')}",
            provider=self.name,
            provider_call_id=payload.get("call_id", ""),
            direction=(
                CallDirection.INBOUND
                if payload.get("direction") == "inbound"
                else CallDirection.OUTBOUND
            ),
            status=status_map.get(payload.get("status", ""), CallStatus.INITIATED),
            from_number=payload.get("from", ""),
            to_number=payload.get("to", ""),
            initiated_at=datetime.fromisoformat(
                payload.get("start_time", datetime.now().isoformat())
            ),
            answered_at=(
                datetime.fromisoformat(payload["answer_time"])
                if payload.get("answer_time")
                else None
            ),
            ended_at=(
                datetime.fromisoformat(payload["end_time"])
                if payload.get("end_time")
                else None
            ),
            duration_seconds=int(payload.get("duration", 0)),
            recording_url=payload.get("recording_url"),
            cost=float(payload.get("cost", 0)),
            currency="INR",
        )
