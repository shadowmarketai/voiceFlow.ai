"""
Vobiz — Indian bulk voice calling & IVR platform.

Vobiz specializes in high-volume outbound voice campaigns,
OBD (Outbound Dialer), IVR flows, and voice broadcasting.
Best for: Bulk campaigns, political campaigns, notification calls.
Docs: https://www.vobiz.in/
Cost: ~Rs 0.8-1.2/min (volume-based pricing)
"""

import hashlib
import hmac
import logging
import os
from datetime import datetime
from typing import Any

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


class VobizProvider(TelephonyProvider):
    name = "vobiz"
    display_name = "Vobiz"
    country_focus = "IN"
    channel_type = ChannelType.PSTN
    cost_per_minute_inr = 0.9  # Cheapest for bulk

    def __init__(self):
        self.api_key = os.getenv("VOBIZ_API_KEY", "")
        self.api_secret = os.getenv("VOBIZ_API_SECRET", "")
        self.sender_id = os.getenv("VOBIZ_SENDER_ID", "")
        self.base_url = "https://api.vobiz.in/v1"

    def is_configured(self) -> bool:
        return bool(self.api_key and self.sender_id)

    def _headers(self) -> dict[str, str]:
        return {
            "X-Api-Key": self.api_key,
            "Content-Type": "application/json",
        }

    def verify_webhook_signature(self, payload: bytes, signature: str) -> bool:
        """Verify Vobiz webhook HMAC signature."""
        if not self.api_secret:
            return True
        computed = hmac.new(
            self.api_secret.encode(), payload, hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(computed, signature)

    async def make_call(
        self, from_number: str, to_number: str, webhook_url: str, **kwargs
    ) -> dict[str, Any]:
        """Single outbound call via Vobiz OBD."""
        payload = {
            "sender_id": self.sender_id,
            "to": to_number,
            "callback_url": webhook_url,
            "audio_url": kwargs.get("audio_url"),  # Pre-recorded audio
            "tts_text": kwargs.get("tts_text"),  # Or TTS text
            "tts_language": kwargs.get("tts_language", "hi"),  # Hindi default
            "retry_count": kwargs.get("retry_count", 2),
            "dtmf_enabled": kwargs.get("dtmf_enabled", True),
            "record": kwargs.get("record", True),
        }
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{self.base_url}/voice/call",
                headers=self._headers(),
                json=payload,
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                return {
                    "success": True,
                    "provider": self.name,
                    "call_id": data.get("call_id") or data.get("request_id"),
                    "status": CallStatus.INITIATED.value,
                }
            return {"success": False, "provider": self.name, "error": resp.text}

    async def broadcast(
        self,
        phone_numbers: list[str],
        audio_url: str | None = None,
        tts_text: str | None = None,
        tts_language: str = "hi",
        webhook_url: str = "",
        campaign_name: str = "",
        schedule_time: str | None = None,
    ) -> dict[str, Any]:
        """Vobiz voice broadcast — send same message to many numbers.

        Ideal for:
        - Marketing campaigns
        - Payment reminders
        - OTP delivery via voice
        - Election/political campaigns
        """
        payload = {
            "sender_id": self.sender_id,
            "numbers": phone_numbers,
            "callback_url": webhook_url,
            "campaign_name": campaign_name or f"voiceflow_{datetime.now().strftime('%Y%m%d_%H%M')}",
        }
        if audio_url:
            payload["audio_url"] = audio_url
        elif tts_text:
            payload["tts_text"] = tts_text
            payload["tts_language"] = tts_language
        else:
            return {"success": False, "error": "audio_url or tts_text required"}

        if schedule_time:
            payload["schedule_time"] = schedule_time

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{self.base_url}/voice/broadcast",
                headers=self._headers(),
                json=payload,
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                return {
                    "success": True,
                    "campaign_id": data.get("campaign_id"),
                    "total_numbers": len(phone_numbers),
                    "status": "queued",
                }
            return {"success": False, "error": resp.text}

    async def create_ivr(
        self,
        name: str,
        welcome_audio_url: str,
        dtmf_actions: dict[str, str],
        webhook_url: str = "",
    ) -> dict[str, Any]:
        """Create Vobiz IVR flow.

        dtmf_actions maps keypress to action:
          {"1": "transfer:+919876543210", "2": "play:audio_url", "9": "repeat"}
        """
        payload = {
            "name": name,
            "welcome_audio": welcome_audio_url,
            "dtmf_mapping": dtmf_actions,
            "callback_url": webhook_url,
            "max_retries": 3,
            "no_input_timeout": 10,
        }
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{self.base_url}/ivr/create",
                headers=self._headers(),
                json=payload,
            )
            if resp.status_code in (200, 201):
                return {"success": True, "ivr": resp.json()}
            return {"success": False, "error": resp.text}

    async def get_call(self, call_id: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{self.base_url}/voice/status/{call_id}",
                headers=self._headers(),
            )
            return resp.json() if resp.status_code == 200 else {"error": resp.text}

    async def end_call(self, call_id: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{self.base_url}/voice/hangup/{call_id}",
                headers=self._headers(),
            )
            return {"success": resp.status_code == 200}

    async def get_recording(self, call_id: str) -> str | None:
        call = await self.get_call(call_id)
        return call.get("recording_url")

    async def list_phone_numbers(self) -> list[PhoneNumber]:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{self.base_url}/numbers", headers=self._headers()
            )
            if resp.status_code != 200:
                return []
            return [
                PhoneNumber(
                    id=n.get("id", ""),
                    number=n.get("number", ""),
                    provider=self.name,
                    friendly_name=n.get("label", n.get("number", "")),
                    capabilities=["voice"],
                    monthly_cost=n.get("cost", 0),
                )
                for n in resp.json().get("numbers", [])
            ]

    async def buy_phone_number(
        self, country: str = "IN", capabilities: list[str] | None = None
    ) -> PhoneNumber:
        raise NotImplementedError(
            "Vobiz numbers are provisioned via dashboard: https://panel.vobiz.in"
        )

    def parse_webhook(self, payload: dict) -> CallRecord:
        status_map = {
            "ANSWER": CallStatus.IN_PROGRESS,
            "NOANSWER": CallStatus.NO_ANSWER,
            "BUSY": CallStatus.BUSY,
            "FAILED": CallStatus.FAILED,
            "COMPLETED": CallStatus.COMPLETED,
            "INITIATED": CallStatus.INITIATED,
        }
        return CallRecord(
            id=f"vobiz_{payload.get('call_id', payload.get('request_id', ''))}",
            provider=self.name,
            provider_call_id=payload.get("call_id", payload.get("request_id", "")),
            direction=CallDirection.OUTBOUND,  # Vobiz is primarily outbound
            status=status_map.get(
                payload.get("status", "").upper(), CallStatus.INITIATED
            ),
            from_number=payload.get("sender_id", self.sender_id),
            to_number=payload.get("to", payload.get("number", "")),
            initiated_at=datetime.fromisoformat(
                payload.get("start_time", datetime.now().isoformat())
            ),
            duration_seconds=int(payload.get("duration", 0)),
            recording_url=payload.get("recording_url"),
            cost=float(payload.get("cost", 0)),
            currency="INR",
            metadata={
                "dtmf_input": payload.get("dtmf_input"),
                "campaign_id": payload.get("campaign_id"),
            },
        )
