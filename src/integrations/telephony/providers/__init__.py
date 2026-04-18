"""
VoiceFlow AI — Telephony Providers
====================================
7 providers with India-first routing:

Indian Providers (cost-optimized):
  - TeleCMI   — Primary India (~Rs 1.2/min)
  - Bolna     — AI voice agent platform
  - Vobiz     — Bulk voice + IVR
  - Exotel    — IVR focused (~Rs 1.5/min)

International Providers:
  - Twilio    — Global coverage (~Rs 4.5/min)
  - Vonage    — Global with India support

Direct Connect:
  - SIP       — Native SIP trunk (Asterisk/FreeSWITCH)
  - WebRTC    — Browser-based calls (zero telephony cost)
"""

from integrations.telephony.providers.base import (
    CallDirection,
    CallRecord,
    CallStatus,
    PhoneNumber,
    TelephonyProvider,
)
from integrations.telephony.providers.bolna import BolnaProvider
from integrations.telephony.providers.exotel import ExotelProvider
from integrations.telephony.providers.sip_provider import SIPProvider
from integrations.telephony.providers.telecmi import TeleCMIProvider
from integrations.telephony.providers.twilio_provider import TwilioProvider
from integrations.telephony.providers.vobiz import VobizProvider
from integrations.telephony.providers.vonage_provider import VonageProvider
from integrations.telephony.providers.webrtc_provider import WebRTCProvider

__all__ = [
    "TelephonyProvider",
    "CallStatus",
    "CallDirection",
    "CallRecord",
    "PhoneNumber",
    "TeleCMIProvider",
    "BolnaProvider",
    "VobizProvider",
    "ExotelProvider",
    "TwilioProvider",
    "VonageProvider",
    "SIPProvider",
    "WebRTCProvider",
]
