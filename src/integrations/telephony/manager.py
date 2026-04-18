"""
VoiceFlow AI — Unified Telephony Manager
==========================================
Routes calls through 7 providers with India-first cost optimization.

Provider Priority (India +91):
  1. TeleCMI  — Rs 1.2/min (cheapest PSTN)
  2. Vobiz    — Rs 0.9/min (bulk campaigns)
  3. Bolna    — Rs 1.5/min (AI agent calls)
  4. Exotel   — Rs 1.5/min (IVR flows)
  5. Twilio   — Rs 4.5/min (fallback)
  6. Vonage   — Rs 3.5/min (fallback)

Direct Connect (zero telephony cost):
  - SIP      — Rs 0.5/min (trunk dependent)
  - WebRTC   — Rs 0/min (browser calls)
"""

import logging
from typing import Any

from .providers import (
    BolnaProvider,
    CallRecord,
    ExotelProvider,
    PhoneNumber,
    SIPProvider,
    TeleCMIProvider,
    TelephonyProvider,
    TwilioProvider,
    VobizProvider,
    VonageProvider,
    WebRTCProvider,
)

logger = logging.getLogger(__name__)


class TelephonyManager:
    """Unified telephony manager with automatic provider selection and failover.

    Features:
    - India-first cost optimization
    - Automatic failover across providers
    - WebRTC for zero-cost browser calls
    - SIP for direct PBX integration
    - Bulk calling via Vobiz
    - AI agent calls via Bolna
    """

    def __init__(self):
        self._providers: dict[str, TelephonyProvider] = {
            "telecmi": TeleCMIProvider(),
            "bolna": BolnaProvider(),
            "vobiz": VobizProvider(),
            "exotel": ExotelProvider(),
            "twilio": TwilioProvider(),
            "vonage": VonageProvider(),
            "sip": SIPProvider(),
            "webrtc": WebRTCProvider(),
        }

        # Priority order for Indian numbers (+91)
        self.india_priority = [
            "telecmi", "vobiz", "bolna", "exotel", "twilio", "vonage"
        ]
        # Priority order for international
        self.international_priority = ["twilio", "vonage"]
        # For AI agent calls
        self.ai_agent_priority = ["bolna", "telecmi", "twilio"]
        # For bulk campaigns
        self.bulk_priority = ["vobiz", "telecmi", "exotel"]

    @property
    def providers(self) -> dict[str, TelephonyProvider]:
        return self._providers

    def get_provider(self, name: str) -> TelephonyProvider:
        if name not in self._providers:
            raise ValueError(f"Unknown provider: {name}")
        return self._providers[name]

    def get_configured_providers(self) -> dict[str, TelephonyProvider]:
        """Return only providers that have credentials configured."""
        return {
            name: p for name, p in self._providers.items() if p.is_configured()
        }

    def select_provider(
        self,
        to_number: str,
        preferred_provider: str | None = None,
        call_type: str = "standard",
    ) -> str:
        """Select best provider based on destination and call type.

        Args:
            to_number: Destination number (E.164)
            preferred_provider: Override automatic selection
            call_type: "standard" | "ai_agent" | "bulk" | "webrtc" | "sip"

        Returns:
            Provider name string
        """
        if preferred_provider and preferred_provider in self._providers:
            provider = self._providers[preferred_provider]
            if provider.is_configured():
                return preferred_provider

        if call_type == "webrtc":
            return "webrtc"
        if call_type == "sip":
            return "sip"

        # Select priority list based on call type
        if call_type == "ai_agent":
            priority = self.ai_agent_priority
        elif call_type == "bulk":
            priority = self.bulk_priority
        elif to_number.startswith("+91") or to_number.startswith("91"):
            priority = self.india_priority
        else:
            priority = self.international_priority

        # Return first configured provider
        for name in priority:
            if self._providers[name].is_configured():
                return name

        # Absolute fallback
        return priority[0] if priority else "telecmi"

    async def make_call(
        self,
        from_number: str,
        to_number: str,
        webhook_url: str,
        preferred_provider: str | None = None,
        call_type: str = "standard",
        **kwargs,
    ) -> dict[str, Any]:
        """Make call with automatic provider selection and failover."""
        provider_name = self.select_provider(
            to_number, preferred_provider, call_type
        )
        provider = self._providers[provider_name]
        result = await provider.make_call(from_number, to_number, webhook_url, **kwargs)

        if result.get("success"):
            result["provider"] = provider_name
            return result

        # Failover
        is_india = to_number.startswith("+91") or to_number.startswith("91")
        priority = self.india_priority if is_india else self.international_priority

        for fallback_name in priority:
            if fallback_name == provider_name:
                continue
            fallback = self._providers[fallback_name]
            if not fallback.is_configured():
                continue

            logger.info(
                "Failing over from %s to %s for %s",
                provider_name, fallback_name, to_number,
            )
            result = await fallback.make_call(
                from_number, to_number, webhook_url, **kwargs
            )
            if result.get("success"):
                result["failover"] = True
                result["original_provider"] = provider_name
                result["provider"] = fallback_name
                return result

        return result

    async def list_all_numbers(self) -> list[PhoneNumber]:
        """List phone numbers from all configured providers."""
        all_numbers: list[PhoneNumber] = []
        for name, provider in self._providers.items():
            if not provider.is_configured():
                continue
            try:
                numbers = await provider.list_phone_numbers()
                all_numbers.extend(numbers)
            except Exception as exc:
                logger.warning("Error listing numbers from %s: %s", name, exc)
        return all_numbers

    def estimate_cost(
        self,
        to_number: str,
        duration_minutes: float,
        provider: str | None = None,
    ) -> dict[str, Any]:
        """Estimate call cost across all providers."""
        if not provider:
            provider = self.select_provider(to_number)

        selected = self._providers[provider]
        total = selected.cost_per_minute_inr * duration_minutes

        comparison = {}
        for name, p in self._providers.items():
            if p.channel_type.value in ("webrtc", "sip"):
                continue
            comparison[name] = {
                "cost_per_minute": p.cost_per_minute_inr,
                "total_cost": p.cost_per_minute_inr * duration_minutes,
                "savings_vs_twilio": (
                    self._providers["twilio"].cost_per_minute_inr
                    - p.cost_per_minute_inr
                )
                * duration_minutes,
            }

        return {
            "provider": provider,
            "duration_minutes": duration_minutes,
            "cost_per_minute": selected.cost_per_minute_inr,
            "total_cost": total,
            "currency": "INR",
            "comparison": comparison,
        }

    def parse_webhook(self, provider: str, payload: dict) -> CallRecord:
        """Parse webhook from any provider."""
        return self._providers[provider].parse_webhook(payload)

    def get_provider_status(self) -> dict[str, Any]:
        """Get status of all providers (for admin dashboard)."""
        return {
            name: {
                "display_name": p.display_name,
                "configured": p.is_configured(),
                "country_focus": p.country_focus,
                "channel_type": p.channel_type.value,
                "cost_per_minute_inr": p.cost_per_minute_inr,
                "supports_streaming": p.supports_streaming(),
            }
            for name, p in self._providers.items()
        }
