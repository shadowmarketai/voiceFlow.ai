"""
Bolna — Indian AI voice agent telephony platform.

Bolna is a purpose-built platform for AI voice agents in India.
Supports: Outbound campaigns, inbound routing, real-time transcription.
Docs: https://docs.bolna.dev/
Cost: Usage-based, competitive with TeleCMI for AI agent use cases.
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


class BolnaProvider(TelephonyProvider):
    name = "bolna"
    display_name = "Bolna"
    country_focus = "IN"
    channel_type = ChannelType.PSTN
    cost_per_minute_inr = 1.5

    def __init__(self):
        self.api_key = os.getenv("BOLNA_API_KEY", "")
        self.base_url = "https://api.bolna.dev/v1"

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def supports_streaming(self) -> bool:
        return True  # Bolna supports real-time audio streaming

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def create_agent(
        self,
        name: str,
        welcome_message: str = "Hello, how can I help you today?",
        language: str = "hi",
        llm_provider: str = "groq",
        llm_model: str = "llama3-8b-8192",
        voice_id: Optional[str] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Create a Bolna voice agent.

        This is Bolna-specific: agents are first-class objects that handle
        the STT -> LLM -> TTS pipeline on Bolna's infrastructure.
        """
        agent_config = {
            "agent_config": {
                "agent_name": name,
                "agent_welcome_message": welcome_message,
            },
            "agent_prompts": {
                "task_1": {
                    "system_prompt": kwargs.get(
                        "system_prompt",
                        "You are a helpful Indian customer service agent. Respond in the customer's language.",
                    ),
                }
            },
            "agent_task": {
                "task_1": {
                    "tools_config": {
                        "llm_agent": {
                            "provider": llm_provider,
                            "model": llm_model,
                            "max_tokens": 200,
                        },
                        "synthesizer": {
                            "provider": kwargs.get("tts_provider", "elevenlabs"),
                            "provider_config": {
                                "voice_id": voice_id or "default",
                                "language": language,
                            },
                        },
                        "transcriber": {
                            "provider": kwargs.get("stt_provider", "deepgram"),
                            "language": language,
                        },
                    }
                }
            },
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{self.base_url}/agent/create",
                headers=self._headers(),
                json=agent_config,
            )
            if resp.status_code in (200, 201):
                return {"success": True, "agent": resp.json()}
            return {"success": False, "error": resp.text}

    async def make_call(
        self, from_number: str, to_number: str, webhook_url: str, **kwargs
    ) -> Dict[str, Any]:
        """Initiate outbound call via Bolna.

        Requires an agent_id — Bolna routes calls through voice agents.
        """
        agent_id = kwargs.get("agent_id")
        if not agent_id:
            return {
                "success": False,
                "provider": self.name,
                "error": "agent_id required for Bolna calls",
            }

        payload = {
            "agent_id": agent_id,
            "recipient_phone_number": to_number,
            "from_phone_number": from_number,
            "webhook_url": webhook_url,
            "metadata": kwargs.get("metadata", {}),
        }
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{self.base_url}/call/make",
                headers=self._headers(),
                json=payload,
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                return {
                    "success": True,
                    "provider": self.name,
                    "call_id": data.get("call_id") or data.get("id"),
                    "status": CallStatus.INITIATED.value,
                }
            return {"success": False, "provider": self.name, "error": resp.text}

    async def make_batch_calls(
        self,
        agent_id: str,
        phone_numbers: List[str],
        from_number: str,
        webhook_url: str,
    ) -> Dict[str, Any]:
        """Bolna batch calling for outbound campaigns."""
        payload = {
            "agent_id": agent_id,
            "phone_numbers": phone_numbers,
            "from_phone_number": from_number,
            "webhook_url": webhook_url,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{self.base_url}/call/batch",
                headers=self._headers(),
                json=payload,
            )
            if resp.status_code in (200, 201):
                return {"success": True, "batch": resp.json()}
            return {"success": False, "error": resp.text}

    async def get_call(self, call_id: str) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{self.base_url}/call/{call_id}", headers=self._headers()
            )
            return resp.json() if resp.status_code == 200 else {"error": resp.text}

    async def end_call(self, call_id: str) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{self.base_url}/call/{call_id}/end", headers=self._headers()
            )
            return {"success": resp.status_code == 200}

    async def get_recording(self, call_id: str) -> Optional[str]:
        call = await self.get_call(call_id)
        return call.get("recording_url")

    async def get_transcript(self, call_id: str) -> Optional[Dict[str, Any]]:
        """Get call transcript (Bolna-specific — returns full conversation)."""
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{self.base_url}/call/{call_id}/transcript",
                headers=self._headers(),
            )
            return resp.json() if resp.status_code == 200 else None

    async def list_phone_numbers(self) -> List[PhoneNumber]:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{self.base_url}/phone-numbers", headers=self._headers()
            )
            if resp.status_code != 200:
                return []
            return [
                PhoneNumber(
                    id=n.get("id", ""),
                    number=n.get("phone_number", ""),
                    provider=self.name,
                    friendly_name=n.get("label", n.get("phone_number", "")),
                    capabilities=["voice"],
                    monthly_cost=n.get("monthly_cost", 0),
                )
                for n in resp.json().get("phone_numbers", [])
            ]

    async def buy_phone_number(
        self, country: str = "IN", capabilities: Optional[List[str]] = None
    ) -> PhoneNumber:
        raise NotImplementedError(
            "Bolna phone numbers are provisioned via dashboard: https://app.bolna.dev"
        )

    def parse_webhook(self, payload: Dict) -> CallRecord:
        status_map = {
            "initiated": CallStatus.INITIATED,
            "ringing": CallStatus.RINGING,
            "in_progress": CallStatus.IN_PROGRESS,
            "completed": CallStatus.COMPLETED,
            "failed": CallStatus.FAILED,
            "busy": CallStatus.BUSY,
            "no_answer": CallStatus.NO_ANSWER,
        }
        return CallRecord(
            id=f"bolna_{payload.get('call_id', payload.get('id', ''))}",
            provider=self.name,
            provider_call_id=payload.get("call_id", payload.get("id", "")),
            direction=(
                CallDirection.INBOUND
                if payload.get("direction") == "inbound"
                else CallDirection.OUTBOUND
            ),
            status=status_map.get(payload.get("status", ""), CallStatus.INITIATED),
            from_number=payload.get("from_phone_number", ""),
            to_number=payload.get("to_phone_number", payload.get("recipient_phone_number", "")),
            initiated_at=datetime.fromisoformat(
                payload.get("created_at", datetime.now().isoformat())
            ),
            duration_seconds=int(payload.get("duration", 0)),
            recording_url=payload.get("recording_url"),
            cost=float(payload.get("cost", 0)),
            currency="INR",
            metadata={
                "agent_id": payload.get("agent_id"),
                "transcript": payload.get("transcript"),
            },
        )
