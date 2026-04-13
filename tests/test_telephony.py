"""
Tests for telephony providers and manager.
"""

import pytest

from integrations.telephony.providers.base import (
    CallDirection,
    CallRecord,
    CallStatus,
    ChannelType,
    PhoneNumber,
)
from integrations.telephony.providers.telecmi import TeleCMIProvider
from integrations.telephony.providers.bolna import BolnaProvider
from integrations.telephony.providers.vobiz import VobizProvider
from integrations.telephony.providers.exotel import ExotelProvider
from integrations.telephony.providers.twilio_provider import TwilioProvider
from integrations.telephony.providers.vonage_provider import VonageProvider
from integrations.telephony.providers.sip_provider import SIPProvider
from integrations.telephony.providers.webrtc_provider import WebRTCProvider
from integrations.telephony.manager import TelephonyManager


class TestProviderInit:
    """Test that all providers can be instantiated."""

    def test_telecmi_init(self):
        p = TeleCMIProvider()
        assert p.name == "telecmi"
        assert p.country_focus == "IN"
        assert p.cost_per_minute_inr == 1.2

    def test_bolna_init(self):
        p = BolnaProvider()
        assert p.name == "bolna"
        assert p.supports_streaming() is True

    def test_vobiz_init(self):
        p = VobizProvider()
        assert p.name == "vobiz"
        assert p.cost_per_minute_inr == 0.9  # Cheapest for bulk

    def test_exotel_init(self):
        p = ExotelProvider()
        assert p.name == "exotel"
        assert p.cost_per_minute_inr == 1.5

    def test_twilio_init(self):
        p = TwilioProvider()
        assert p.name == "twilio"
        assert p.cost_per_minute_inr == 4.5  # Most expensive

    def test_vonage_init(self):
        p = VonageProvider()
        assert p.name == "vonage"
        assert p.supports_streaming() is True

    def test_sip_init(self):
        p = SIPProvider()
        assert p.name == "sip"
        assert p.channel_type == ChannelType.SIP

    def test_webrtc_init(self):
        p = WebRTCProvider()
        assert p.name == "webrtc"
        assert p.cost_per_minute_inr == 0.0  # Free!
        assert p.channel_type == ChannelType.WEBRTC


class TestTelephonyManager:
    """Test unified telephony manager."""

    def test_manager_init(self):
        mgr = TelephonyManager()
        assert len(mgr.providers) == 8  # 7 providers + WebRTC

    def test_select_india_number(self):
        mgr = TelephonyManager()
        provider = mgr.select_provider("+919876543210")
        # Should select cheapest configured or first in priority
        assert provider in mgr.india_priority

    def test_select_international_number(self):
        mgr = TelephonyManager()
        provider = mgr.select_provider("+14155551234")
        assert provider in mgr.international_priority

    def test_select_webrtc(self):
        mgr = TelephonyManager()
        provider = mgr.select_provider("", call_type="webrtc")
        assert provider == "webrtc"

    def test_select_sip(self):
        mgr = TelephonyManager()
        provider = mgr.select_provider("", call_type="sip")
        assert provider == "sip"

    def test_select_bulk(self):
        mgr = TelephonyManager()
        provider = mgr.select_provider("+919876543210", call_type="bulk")
        assert provider in mgr.bulk_priority

    def test_select_ai_agent(self):
        mgr = TelephonyManager()
        provider = mgr.select_provider("+919876543210", call_type="ai_agent")
        assert provider in mgr.ai_agent_priority

    def test_preferred_provider_override(self):
        mgr = TelephonyManager()
        provider = mgr.select_provider("+919876543210", preferred_provider="twilio")
        # Twilio not configured (no env vars), so falls back
        assert provider in mgr.india_priority or provider == "twilio"

    def test_cost_estimation(self):
        mgr = TelephonyManager()
        estimate = mgr.estimate_cost("+919876543210", duration_minutes=10)
        assert estimate["currency"] == "INR"
        assert estimate["duration_minutes"] == 10
        assert "comparison" in estimate
        assert "telecmi" in estimate["comparison"]
        assert estimate["comparison"]["telecmi"]["cost_per_minute"] == 1.2

    def test_provider_status(self):
        mgr = TelephonyManager()
        status = mgr.get_provider_status()
        assert len(status) == 8
        assert "telecmi" in status
        assert "webrtc" in status
        assert status["webrtc"]["cost_per_minute_inr"] == 0.0
        assert status["webrtc"]["channel_type"] == "webrtc"


class TestWebhookParsing:
    """Test webhook parsing for each provider."""

    def test_telecmi_webhook(self):
        p = TeleCMIProvider()
        record = p.parse_webhook({
            "call_id": "abc123",
            "direction": "inbound",
            "status": "completed",
            "from": "+919876543210",
            "to": "+918012345678",
            "duration": 120,
            "cost": 2.4,
        })
        assert record.provider == "telecmi"
        assert record.status == CallStatus.COMPLETED
        assert record.direction == CallDirection.INBOUND
        assert record.duration_seconds == 120

    def test_twilio_webhook(self):
        p = TwilioProvider()
        record = p.parse_webhook({
            "CallSid": "CA123",
            "CallStatus": "completed",
            "Direction": "outbound",
            "From": "+14155551234",
            "To": "+919876543210",
            "CallDuration": 60,
        })
        assert record.provider == "twilio"
        assert record.status == CallStatus.COMPLETED
        assert record.direction == CallDirection.OUTBOUND

    def test_vonage_webhook(self):
        p = VonageProvider()
        record = p.parse_webhook({
            "uuid": "conv-123",
            "status": "answered",
            "direction": "inbound",
            "from": "919876543210",
            "to": "918012345678",
            "duration": 45,
        })
        assert record.provider == "vonage"
        assert record.status == CallStatus.IN_PROGRESS

    def test_sip_webhook(self):
        p = SIPProvider()
        record = p.parse_webhook({
            "call_id": "sip-001",
            "status": "ANSWER",
            "from": "+919876543210",
            "to": "+918012345678",
            "duration": 30,
        })
        assert record.provider == "sip"
        assert record.channel_type == ChannelType.SIP

    def test_webrtc_webhook(self):
        p = WebRTCProvider()
        record = p.parse_webhook({
            "session_id": "webrtc_abc",
            "status": "connected",
            "agent_id": "agent-1",
            "duration": 15,
        })
        assert record.provider == "webrtc"
        assert record.cost == 0.0
        assert record.channel_type == ChannelType.WEBRTC


class TestWebRTCSession:
    """Test WebRTC session management."""

    @pytest.mark.asyncio
    async def test_create_session(self):
        p = WebRTCProvider()
        result = await p.create_session(agent_id="agent-1", tenant_id="t-1")
        assert result["success"] is True
        assert "session_id" in result
        assert "ice_config" in result

    @pytest.mark.asyncio
    async def test_end_session(self):
        p = WebRTCProvider()
        session = await p.create_session(agent_id="a1")
        sid = session["session_id"]
        result = await p.end_call(sid)
        assert result["success"] is True

    def test_ice_config(self):
        p = WebRTCProvider()
        config = p.get_ice_config()
        assert "iceServers" in config
        assert len(config["iceServers"]) > 0

    def test_media_constraints(self):
        p = WebRTCProvider()
        constraints = p.get_media_constraints()
        assert constraints["audio"]["sampleRate"] == 16000
        assert constraints["video"] is False


class TestSIPProvider:
    """Test SIP provider specifics."""

    def test_sip_uri(self):
        import os
        os.environ["SIP_HOST"] = "pbx.example.com"
        p = SIPProvider()
        uri = p.get_sip_uri("+919876543210")
        assert "sip:+919876543210@pbx.example.com" in uri
        del os.environ["SIP_HOST"]

    def test_asterisk_dialplan(self):
        p = SIPProvider()
        dialplan = p.generate_asterisk_dialplan()
        assert "AudioSocket" in dialplan
        assert "voiceflow-ai" in dialplan
