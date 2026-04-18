"""
VoiceFlow Marketing AI - Indian Telephony Providers
====================================================
Multi-provider telephony support for India

Providers:
- TeleCMI (Primary for India - 70% cheaper than Twilio)
- Exotel (IVR focused)
- Twilio (International fallback)

Cost comparison:
- Twilio: ~₹4-5/min
- TeleCMI: ~₹1.2-1.5/min
- Exotel: ~₹1.5-2/min
"""

import json
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any

import httpx


class CallStatus(Enum):
    """Call status"""
    INITIATED = "initiated"
    RINGING = "ringing"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    BUSY = "busy"
    NO_ANSWER = "no_answer"
    CANCELLED = "cancelled"


class CallDirection(Enum):
    """Call direction"""
    INBOUND = "inbound"
    OUTBOUND = "outbound"


@dataclass
class PhoneNumber:
    """Phone number entity"""
    id: str
    number: str                     # E.164 format
    provider: str                   # telecmi, exotel, twilio
    friendly_name: str
    capabilities: list[str]         # voice, sms
    monthly_cost: float
    is_active: bool = True
    assigned_to: str | None = None  # Assistant ID
    created_at: datetime = None


@dataclass
class CallRecord:
    """Call record"""
    id: str
    provider: str
    provider_call_id: str

    direction: CallDirection
    status: CallStatus

    from_number: str
    to_number: str

    # Timing
    initiated_at: datetime
    answered_at: datetime | None = None
    ended_at: datetime | None = None
    duration_seconds: int = 0

    # Recording
    recording_url: str | None = None
    recording_duration: int = 0

    # Cost
    cost: float = 0.0
    currency: str = "INR"

    # Metadata
    tenant_id: str | None = None
    assistant_id: str | None = None
    lead_id: str | None = None


class TelephonyProvider(ABC):
    """Abstract base class for telephony providers"""

    @abstractmethod
    async def make_call(
        self,
        from_number: str,
        to_number: str,
        webhook_url: str,
        **kwargs
    ) -> dict[str, Any]:
        """Initiate outbound call"""
        pass

    @abstractmethod
    async def get_call(self, call_id: str) -> dict[str, Any]:
        """Get call details"""
        pass

    @abstractmethod
    async def end_call(self, call_id: str) -> dict[str, Any]:
        """End active call"""
        pass

    @abstractmethod
    async def get_recording(self, call_id: str) -> str | None:
        """Get call recording URL"""
        pass

    @abstractmethod
    async def list_phone_numbers(self) -> list[PhoneNumber]:
        """List available phone numbers"""
        pass

    @abstractmethod
    async def buy_phone_number(
        self,
        country: str = "IN",
        capabilities: list[str] = None
    ) -> PhoneNumber:
        """Purchase new phone number"""
        pass

    @abstractmethod
    def parse_webhook(self, payload: dict) -> CallRecord:
        """Parse webhook payload into CallRecord"""
        pass


class TeleCMIProvider(TelephonyProvider):
    """
    TeleCMI - Primary Indian telephony provider
    
    Benefits:
    - 70% cheaper than Twilio for India
    - Native Indian support
    - Good call quality
    
    Pricing:
    - Outbound: ~₹1.2/min
    - Inbound: ~₹0.8/min
    """

    def __init__(self):
        self.api_key = os.getenv("TELECMI_API_KEY")
        self.api_secret = os.getenv("TELECMI_API_SECRET")
        self.account_id = os.getenv("TELECMI_ACCOUNT_ID")
        self.base_url = "https://rest.telecmi.com/v2"

    def _get_headers(self) -> dict[str, str]:
        """Get API headers"""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    async def make_call(
        self,
        from_number: str,
        to_number: str,
        webhook_url: str,
        **kwargs
    ) -> dict[str, Any]:
        """
        Initiate outbound call via TeleCMI
        """
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/call/dial",
                headers=self._get_headers(),
                json={
                    "from": from_number,
                    "to": to_number,
                    "callback_url": webhook_url,
                    "recording": kwargs.get("record", True),
                    "dtmf": kwargs.get("dtmf", ""),
                    "timeout": kwargs.get("timeout", 60),
                    "custom_data": kwargs.get("metadata", {})
                }
            )

            if response.status_code == 200:
                data = response.json()
                return {
                    "success": True,
                    "provider": "telecmi",
                    "call_id": data.get("call_id"),
                    "status": CallStatus.INITIATED.value,
                    "from": from_number,
                    "to": to_number
                }
            else:
                return {
                    "success": False,
                    "provider": "telecmi",
                    "error": response.text
                }

    async def get_call(self, call_id: str) -> dict[str, Any]:
        """Get call details"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/call/{call_id}",
                headers=self._get_headers()
            )

            if response.status_code == 200:
                return response.json()
            return {"error": response.text}

    async def end_call(self, call_id: str) -> dict[str, Any]:
        """End active call"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/call/{call_id}/hangup",
                headers=self._get_headers()
            )
            return {"success": response.status_code == 200}

    async def get_recording(self, call_id: str) -> str | None:
        """Get call recording URL"""
        call = await self.get_call(call_id)
        return call.get("recording_url")

    async def list_phone_numbers(self) -> list[PhoneNumber]:
        """List available phone numbers"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/numbers",
                headers=self._get_headers()
            )

            if response.status_code == 200:
                data = response.json()
                return [
                    PhoneNumber(
                        id=num["id"],
                        number=num["number"],
                        provider="telecmi",
                        friendly_name=num.get("friendly_name", num["number"]),
                        capabilities=num.get("capabilities", ["voice"]),
                        monthly_cost=num.get("monthly_cost", 500),
                        is_active=num.get("active", True)
                    )
                    for num in data.get("numbers", [])
                ]
            return []

    async def buy_phone_number(
        self,
        country: str = "IN",
        capabilities: list[str] = None
    ) -> PhoneNumber:
        """Purchase new phone number"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/numbers/buy",
                headers=self._get_headers(),
                json={
                    "country": country,
                    "type": "local",
                    "capabilities": capabilities or ["voice"]
                }
            )

            if response.status_code == 200:
                data = response.json()
                return PhoneNumber(
                    id=data["id"],
                    number=data["number"],
                    provider="telecmi",
                    friendly_name=data["number"],
                    capabilities=data.get("capabilities", ["voice"]),
                    monthly_cost=data.get("monthly_cost", 500)
                )
            raise Exception(f"Failed to buy number: {response.text}")

    def parse_webhook(self, payload: dict) -> CallRecord:
        """Parse TeleCMI webhook payload"""
        # Map TeleCMI status to our status
        status_map = {
            "initiated": CallStatus.INITIATED,
            "ringing": CallStatus.RINGING,
            "answered": CallStatus.IN_PROGRESS,
            "completed": CallStatus.COMPLETED,
            "failed": CallStatus.FAILED,
            "busy": CallStatus.BUSY,
            "no-answer": CallStatus.NO_ANSWER
        }

        return CallRecord(
            id=f"telecmi_{payload.get('call_id')}",
            provider="telecmi",
            provider_call_id=payload.get("call_id"),
            direction=CallDirection.INBOUND if payload.get("direction") == "inbound" else CallDirection.OUTBOUND,
            status=status_map.get(payload.get("status"), CallStatus.INITIATED),
            from_number=payload.get("from"),
            to_number=payload.get("to"),
            initiated_at=datetime.fromisoformat(payload.get("start_time", datetime.now().isoformat())),
            answered_at=datetime.fromisoformat(payload["answer_time"]) if payload.get("answer_time") else None,
            ended_at=datetime.fromisoformat(payload["end_time"]) if payload.get("end_time") else None,
            duration_seconds=int(payload.get("duration", 0)),
            recording_url=payload.get("recording_url"),
            cost=float(payload.get("cost", 0)),
            currency="INR"
        )

    async def send_sms(
        self,
        from_number: str,
        to_number: str,
        message: str
    ) -> dict[str, Any]:
        """Send SMS via TeleCMI"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/sms/send",
                headers=self._get_headers(),
                json={
                    "from": from_number,
                    "to": to_number,
                    "message": message
                }
            )

            return {
                "success": response.status_code == 200,
                "provider": "telecmi",
                "message_id": response.json().get("message_id") if response.status_code == 200 else None,
                "error": response.text if response.status_code != 200 else None
            }


class ExotelProvider(TelephonyProvider):
    """
    Exotel - IVR focused Indian provider
    
    Benefits:
    - Excellent IVR capabilities
    - ExoML for call flows
    - Good for call centers
    
    Pricing:
    - Outbound: ~₹1.5-2/min
    - IVR: Custom pricing
    """

    def __init__(self):
        self.api_key = os.getenv("EXOTEL_API_KEY")
        self.api_token = os.getenv("EXOTEL_API_TOKEN")
        self.sid = os.getenv("EXOTEL_SID")
        self.subdomain = os.getenv("EXOTEL_SUBDOMAIN", "api.exotel.com")
        self.base_url = f"https://{self.subdomain}/v1/Accounts/{self.sid}"

    def _get_auth(self):
        """Get basic auth tuple"""
        return (self.api_key, self.api_token)

    async def make_call(
        self,
        from_number: str,
        to_number: str,
        webhook_url: str,
        **kwargs
    ) -> dict[str, Any]:
        """
        Initiate outbound call via Exotel
        """
        caller_id = kwargs.get("caller_id", from_number)

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/Calls/connect",
                auth=self._get_auth(),
                data={
                    "From": from_number,
                    "To": to_number,
                    "CallerId": caller_id,
                    "Url": webhook_url,
                    "Record": "true" if kwargs.get("record", True) else "false",
                    "TimeLimit": kwargs.get("timeout", 3600),
                    "CustomField": json.dumps(kwargs.get("metadata", {}))
                }
            )

            if response.status_code == 200:
                data = response.json()
                call_data = data.get("Call", {})
                return {
                    "success": True,
                    "provider": "exotel",
                    "call_id": call_data.get("Sid"),
                    "status": CallStatus.INITIATED.value,
                    "from": from_number,
                    "to": to_number
                }
            else:
                return {
                    "success": False,
                    "provider": "exotel",
                    "error": response.text
                }

    async def get_call(self, call_id: str) -> dict[str, Any]:
        """Get call details"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/Calls/{call_id}",
                auth=self._get_auth()
            )

            if response.status_code == 200:
                return response.json()
            return {"error": response.text}

    async def end_call(self, call_id: str) -> dict[str, Any]:
        """End active call"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/Calls/{call_id}",
                auth=self._get_auth(),
                data={"Status": "completed"}
            )
            return {"success": response.status_code == 200}

    async def get_recording(self, call_id: str) -> str | None:
        """Get call recording URL"""
        call = await self.get_call(call_id)
        return call.get("Call", {}).get("RecordingUrl")

    async def list_phone_numbers(self) -> list[PhoneNumber]:
        """List ExoPhones (virtual numbers)"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/IncomingPhoneNumbers",
                auth=self._get_auth()
            )

            if response.status_code == 200:
                data = response.json()
                return [
                    PhoneNumber(
                        id=num["Sid"],
                        number=num["PhoneNumber"],
                        provider="exotel",
                        friendly_name=num.get("FriendlyName", num["PhoneNumber"]),
                        capabilities=["voice"],
                        monthly_cost=num.get("MonthlyRental", 500),
                        is_active=True
                    )
                    for num in data.get("IncomingPhoneNumbers", [])
                ]
            return []

    async def buy_phone_number(
        self,
        country: str = "IN",
        capabilities: list[str] = None
    ) -> PhoneNumber:
        """
        Request new ExoPhone
        Note: Exotel requires manual approval for new numbers
        """
        # Exotel doesn't have direct API for buying numbers
        # This would typically be done through their dashboard
        raise NotImplementedError("Contact Exotel support to provision new numbers")

    def parse_webhook(self, payload: dict) -> CallRecord:
        """Parse Exotel webhook payload"""
        status_map = {
            "initiated": CallStatus.INITIATED,
            "ringing": CallStatus.RINGING,
            "in-progress": CallStatus.IN_PROGRESS,
            "completed": CallStatus.COMPLETED,
            "failed": CallStatus.FAILED,
            "busy": CallStatus.BUSY,
            "no-answer": CallStatus.NO_ANSWER
        }

        return CallRecord(
            id=f"exotel_{payload.get('CallSid')}",
            provider="exotel",
            provider_call_id=payload.get("CallSid"),
            direction=CallDirection.INBOUND if payload.get("Direction") == "incoming" else CallDirection.OUTBOUND,
            status=status_map.get(payload.get("Status", "").lower(), CallStatus.INITIATED),
            from_number=payload.get("From"),
            to_number=payload.get("To"),
            initiated_at=datetime.fromisoformat(payload.get("StartTime", datetime.now().isoformat())),
            answered_at=datetime.fromisoformat(payload["AnswerTime"]) if payload.get("AnswerTime") else None,
            ended_at=datetime.fromisoformat(payload["EndTime"]) if payload.get("EndTime") else None,
            duration_seconds=int(payload.get("Duration", 0)),
            recording_url=payload.get("RecordingUrl"),
            cost=float(payload.get("Price", 0)),
            currency="INR"
        )

    def generate_exoml(
        self,
        action: str,
        **params
    ) -> str:
        """
        Generate ExoML response for IVR flows
        """
        if action == "say":
            return f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say language="{params.get('language', 'en-IN')}">{params.get('text', '')}</Say>
</Response>"""

        elif action == "play":
            return f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Play>{params.get('audio_url', '')}</Play>
</Response>"""

        elif action == "record":
            return f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Record maxLength="{params.get('max_length', 60)}" action="{params.get('callback_url', '')}"/>
</Response>"""

        elif action == "gather":
            return f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather numDigits="{params.get('num_digits', 1)}" action="{params.get('callback_url', '')}">
        <Say>{params.get('prompt', 'Please enter your choice')}</Say>
    </Gather>
</Response>"""

        elif action == "dial":
            return f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Dial callerId="{params.get('caller_id', '')}">
        <Number>{params.get('number', '')}</Number>
    </Dial>
</Response>"""

        elif action == "hangup":
            return """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Hangup/>
</Response>"""

        else:
            return """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>Thank you for calling.</Say>
    <Hangup/>
</Response>"""


class TwilioProvider(TelephonyProvider):
    """
    Twilio - International fallback provider
    
    Use for:
    - International calls
    - Backup when Indian providers fail
    
    Pricing:
    - India outbound: ~₹4-5/min
    - International: Varies by country
    """

    def __init__(self):
        self.account_sid = os.getenv("TWILIO_ACCOUNT_SID")
        self.auth_token = os.getenv("TWILIO_AUTH_TOKEN")
        self.base_url = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}"

    def _get_auth(self):
        return (self.account_sid, self.auth_token)

    async def make_call(
        self,
        from_number: str,
        to_number: str,
        webhook_url: str,
        **kwargs
    ) -> dict[str, Any]:
        """Initiate outbound call via Twilio"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/Calls.json",
                auth=self._get_auth(),
                data={
                    "From": from_number,
                    "To": to_number,
                    "Url": webhook_url,
                    "Record": "true" if kwargs.get("record", True) else "false",
                    "Timeout": kwargs.get("timeout", 60),
                    "StatusCallback": kwargs.get("status_callback", webhook_url)
                }
            )

            if response.status_code == 201:
                data = response.json()
                return {
                    "success": True,
                    "provider": "twilio",
                    "call_id": data.get("sid"),
                    "status": CallStatus.INITIATED.value,
                    "from": from_number,
                    "to": to_number
                }
            else:
                return {
                    "success": False,
                    "provider": "twilio",
                    "error": response.text
                }

    async def get_call(self, call_id: str) -> dict[str, Any]:
        """Get call details"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/Calls/{call_id}.json",
                auth=self._get_auth()
            )

            if response.status_code == 200:
                return response.json()
            return {"error": response.text}

    async def end_call(self, call_id: str) -> dict[str, Any]:
        """End active call"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/Calls/{call_id}.json",
                auth=self._get_auth(),
                data={"Status": "completed"}
            )
            return {"success": response.status_code == 200}

    async def get_recording(self, call_id: str) -> str | None:
        """Get call recording URL"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/Calls/{call_id}/Recordings.json",
                auth=self._get_auth()
            )

            if response.status_code == 200:
                recordings = response.json().get("recordings", [])
                if recordings:
                    return recordings[0].get("media_url")
        return None

    async def list_phone_numbers(self) -> list[PhoneNumber]:
        """List Twilio phone numbers"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/IncomingPhoneNumbers.json",
                auth=self._get_auth()
            )

            if response.status_code == 200:
                data = response.json()
                return [
                    PhoneNumber(
                        id=num["sid"],
                        number=num["phone_number"],
                        provider="twilio",
                        friendly_name=num.get("friendly_name", num["phone_number"]),
                        capabilities=self._parse_capabilities(num.get("capabilities", {})),
                        monthly_cost=num.get("monthly_price", 1.0) * 85,  # Convert USD to INR
                        is_active=num.get("status") == "in-use"
                    )
                    for num in data.get("incoming_phone_numbers", [])
                ]
            return []

    async def buy_phone_number(
        self,
        country: str = "IN",
        capabilities: list[str] = None
    ) -> PhoneNumber:
        """Purchase Twilio phone number"""
        # First, search for available numbers
        async with httpx.AsyncClient() as client:
            search_response = await client.get(
                f"{self.base_url}/AvailablePhoneNumbers/{country}/Local.json",
                auth=self._get_auth()
            )

            if search_response.status_code != 200:
                raise Exception("No numbers available")

            available = search_response.json().get("available_phone_numbers", [])
            if not available:
                raise Exception("No numbers available")

            number = available[0]["phone_number"]

            # Purchase the number
            buy_response = await client.post(
                f"{self.base_url}/IncomingPhoneNumbers.json",
                auth=self._get_auth(),
                data={"PhoneNumber": number}
            )

            if buy_response.status_code == 201:
                data = buy_response.json()
                return PhoneNumber(
                    id=data["sid"],
                    number=data["phone_number"],
                    provider="twilio",
                    friendly_name=data["phone_number"],
                    capabilities=["voice"],
                    monthly_cost=data.get("monthly_price", 1.0) * 85
                )
            raise Exception(f"Failed to buy number: {buy_response.text}")

    def parse_webhook(self, payload: dict) -> CallRecord:
        """Parse Twilio webhook payload"""
        status_map = {
            "queued": CallStatus.INITIATED,
            "ringing": CallStatus.RINGING,
            "in-progress": CallStatus.IN_PROGRESS,
            "completed": CallStatus.COMPLETED,
            "failed": CallStatus.FAILED,
            "busy": CallStatus.BUSY,
            "no-answer": CallStatus.NO_ANSWER,
            "canceled": CallStatus.CANCELLED
        }

        return CallRecord(
            id=f"twilio_{payload.get('CallSid')}",
            provider="twilio",
            provider_call_id=payload.get("CallSid"),
            direction=CallDirection.INBOUND if payload.get("Direction") == "inbound" else CallDirection.OUTBOUND,
            status=status_map.get(payload.get("CallStatus", "").lower(), CallStatus.INITIATED),
            from_number=payload.get("From"),
            to_number=payload.get("To"),
            initiated_at=datetime.now(),
            duration_seconds=int(payload.get("CallDuration", 0)),
            recording_url=payload.get("RecordingUrl")
        )

    def _parse_capabilities(self, caps: dict) -> list[str]:
        """Parse Twilio capabilities"""
        result = []
        if caps.get("voice"):
            result.append("voice")
        if caps.get("sms"):
            result.append("sms")
        if caps.get("mms"):
            result.append("mms")
        return result


class TelephonyManager:
    """
    Unified telephony management across providers
    
    Features:
    - Automatic provider selection based on cost
    - Failover between providers
    - Unified API across providers
    """

    def __init__(self):
        self.providers: dict[str, TelephonyProvider] = {
            "telecmi": TeleCMIProvider(),
            "exotel": ExotelProvider(),
            "twilio": TwilioProvider()
        }

        # Cost per minute by provider (INR)
        self.cost_per_minute = {
            "telecmi": 1.2,
            "exotel": 1.5,
            "twilio": 4.5
        }

        # Provider priority for India
        self.india_priority = ["telecmi", "exotel", "twilio"]

        # Provider priority for international
        self.international_priority = ["twilio"]

    def get_provider(self, provider_name: str) -> TelephonyProvider:
        """Get specific provider"""
        if provider_name not in self.providers:
            raise ValueError(f"Unknown provider: {provider_name}")
        return self.providers[provider_name]

    def select_provider(
        self,
        to_number: str,
        preferred_provider: str = None
    ) -> str:
        """
        Select best provider based on destination
        """
        if preferred_provider and preferred_provider in self.providers:
            return preferred_provider

        # Check if Indian number
        if to_number.startswith("+91") or to_number.startswith("91"):
            return self.india_priority[0]

        # International
        return self.international_priority[0]

    async def make_call(
        self,
        from_number: str,
        to_number: str,
        webhook_url: str,
        preferred_provider: str = None,
        **kwargs
    ) -> dict[str, Any]:
        """
        Make call with automatic provider selection and failover
        """
        provider_name = self.select_provider(to_number, preferred_provider)

        # Try primary provider
        provider = self.providers[provider_name]
        result = await provider.make_call(from_number, to_number, webhook_url, **kwargs)

        if result.get("success"):
            return result

        # Failover to other providers
        priority_list = (
            self.india_priority if to_number.startswith("+91")
            else self.international_priority
        )

        for fallback_name in priority_list:
            if fallback_name != provider_name:
                fallback_provider = self.providers[fallback_name]
                result = await fallback_provider.make_call(
                    from_number, to_number, webhook_url, **kwargs
                )
                if result.get("success"):
                    result["failover"] = True
                    result["original_provider"] = provider_name
                    return result

        return result

    async def list_all_numbers(self) -> list[PhoneNumber]:
        """List phone numbers from all providers"""
        all_numbers = []

        for provider_name, provider in self.providers.items():
            try:
                numbers = await provider.list_phone_numbers()
                all_numbers.extend(numbers)
            except Exception as e:
                print(f"Error listing numbers from {provider_name}: {e}")

        return all_numbers

    def estimate_cost(
        self,
        to_number: str,
        duration_minutes: float,
        provider: str = None
    ) -> dict[str, Any]:
        """
        Estimate call cost
        """
        if not provider:
            provider = self.select_provider(to_number)

        cost_per_min = self.cost_per_minute.get(provider, 2.0)
        total_cost = cost_per_min * duration_minutes

        return {
            "provider": provider,
            "duration_minutes": duration_minutes,
            "cost_per_minute": cost_per_min,
            "total_cost": total_cost,
            "currency": "INR",
            "comparison": {
                name: {
                    "cost_per_minute": cpm,
                    "total_cost": cpm * duration_minutes,
                    "savings": (self.cost_per_minute["twilio"] - cpm) * duration_minutes
                }
                for name, cpm in self.cost_per_minute.items()
            }
        }

    def parse_webhook(
        self,
        provider: str,
        payload: dict
    ) -> CallRecord:
        """Parse webhook from any provider"""
        return self.providers[provider].parse_webhook(payload)


# ============================================
# FastAPI Router
# ============================================

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

telephony_router = APIRouter(prefix="/api/v1/telephony", tags=["Telephony"])

# Initialize manager
telephony_manager = TelephonyManager()


class MakeCallRequest(BaseModel):
    from_number: str
    to_number: str
    webhook_url: str
    provider: str = None
    record: bool = True


class CostEstimateRequest(BaseModel):
    to_number: str
    duration_minutes: float
    provider: str = None


@telephony_router.post("/call")
async def make_call(request: MakeCallRequest):
    """Make outbound call"""
    result = await telephony_manager.make_call(
        from_number=request.from_number,
        to_number=request.to_number,
        webhook_url=request.webhook_url,
        preferred_provider=request.provider,
        record=request.record
    )

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))

    return result


@telephony_router.get("/numbers")
async def list_numbers():
    """List all phone numbers"""
    numbers = await telephony_manager.list_all_numbers()
    return {
        "numbers": [
            {
                "id": n.id,
                "number": n.number,
                "provider": n.provider,
                "friendly_name": n.friendly_name,
                "capabilities": n.capabilities,
                "monthly_cost": n.monthly_cost,
                "is_active": n.is_active
            }
            for n in numbers
        ]
    }


@telephony_router.post("/cost-estimate")
async def estimate_cost(request: CostEstimateRequest):
    """Estimate call cost"""
    return telephony_manager.estimate_cost(
        to_number=request.to_number,
        duration_minutes=request.duration_minutes,
        provider=request.provider
    )


@telephony_router.post("/webhooks/{provider}")
async def telephony_webhook(provider: str, request: Request, payload: dict):
    """Handle telephony webhooks — parse call record and trigger voice analysis."""
    if provider not in ["telecmi", "exotel", "twilio"]:
        raise HTTPException(status_code=400, detail="Unknown provider")

    call_record = telephony_manager.parse_webhook(provider, payload)

    # Process completed calls with recordings through voice analysis pipeline
    if (
        call_record.status == CallStatus.COMPLETED
        and call_record.recording_url
        and call_record.duration_seconds > 2
    ):
        try:
            from api.database import get_session_factory
            from api.services.call_processing_service import process_call_recording

            voice_engine = getattr(request.app.state, "voice_engine", None)
            db = get_session_factory()()
            try:
                # Determine phone to match against CRM (use the other party's number)
                phone = (
                    call_record.to_number
                    if call_record.direction == CallDirection.OUTBOUND
                    else call_record.from_number
                )
                result = await process_call_recording(
                    db=db,
                    voice_engine=voice_engine,
                    recording_url=call_record.recording_url,
                    phone_number=phone,
                    call_direction=call_record.direction.value,
                    provider=provider,
                    provider_call_id=call_record.provider_call_id,
                    user_id=1,  # Default user; override via tenant mapping
                    duration_seconds=call_record.duration_seconds,
                )
                import logging
                logging.getLogger(__name__).info(
                    "Call %s processed: analysis_id=%s, lead_updated=%s",
                    call_record.id,
                    result.get("analysis_id") if result else None,
                    result.get("lead_updated") if result else False,
                )
            finally:
                db.close()
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning(
                "Call processing failed for %s: %s", call_record.id, exc,
            )

    return {"status": "processed", "call_id": call_record.id}
