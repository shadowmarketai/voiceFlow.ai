"""
Telephony Provider — Base classes and shared types.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any


class CallStatus(Enum):
    INITIATED = "initiated"
    RINGING = "ringing"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    BUSY = "busy"
    NO_ANSWER = "no_answer"
    CANCELLED = "cancelled"


class CallDirection(Enum):
    INBOUND = "inbound"
    OUTBOUND = "outbound"


class ChannelType(Enum):
    """Transport channel type."""
    PSTN = "pstn"          # Traditional phone network
    SIP = "sip"            # SIP trunk
    WEBRTC = "webrtc"      # Browser-based
    WEBSOCKET = "websocket"  # WebSocket audio stream


@dataclass
class PhoneNumber:
    id: str
    number: str                     # E.164 format
    provider: str
    friendly_name: str
    capabilities: list[str]         # voice, sms
    monthly_cost: float
    currency: str = "INR"
    is_active: bool = True
    assigned_to: str | None = None
    created_at: datetime | None = None


@dataclass
class CallRecord:
    id: str
    provider: str
    provider_call_id: str
    direction: CallDirection
    status: CallStatus
    from_number: str
    to_number: str
    initiated_at: datetime
    channel_type: ChannelType = ChannelType.PSTN
    answered_at: datetime | None = None
    ended_at: datetime | None = None
    duration_seconds: int = 0
    recording_url: str | None = None
    recording_duration: int = 0
    cost: float = 0.0
    currency: str = "INR"
    tenant_id: str | None = None
    assistant_id: str | None = None
    lead_id: str | None = None
    metadata: dict[str, Any] | None = None


class TelephonyProvider(ABC):
    """Abstract base class for all telephony providers."""

    name: str = "base"
    display_name: str = "Base Provider"
    country_focus: str = "global"
    channel_type: ChannelType = ChannelType.PSTN
    cost_per_minute_inr: float = 0.0

    @abstractmethod
    async def make_call(
        self,
        from_number: str,
        to_number: str,
        webhook_url: str,
        **kwargs,
    ) -> dict[str, Any]:
        """Initiate outbound call."""

    @abstractmethod
    async def get_call(self, call_id: str) -> dict[str, Any]:
        """Get call details."""

    @abstractmethod
    async def end_call(self, call_id: str) -> dict[str, Any]:
        """End active call."""

    @abstractmethod
    async def get_recording(self, call_id: str) -> str | None:
        """Get call recording URL."""

    @abstractmethod
    async def list_phone_numbers(self) -> list[PhoneNumber]:
        """List available phone numbers."""

    @abstractmethod
    async def buy_phone_number(
        self,
        country: str = "IN",
        capabilities: list[str] | None = None,
    ) -> PhoneNumber:
        """Purchase new phone number."""

    @abstractmethod
    def parse_webhook(self, payload: dict) -> CallRecord:
        """Parse webhook payload into CallRecord."""

    def is_configured(self) -> bool:
        """Check if provider has required credentials configured."""
        return False

    def supports_streaming(self) -> bool:
        """Whether provider supports real-time audio streaming."""
        return False
