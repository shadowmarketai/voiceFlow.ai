"""
VoiceFlow AI — WhatsApp Business API Integration
=================================================
Multi-channel voice AI via WhatsApp Cloud API.

Features:
- Receive text/voice messages from WhatsApp
- Process voice notes through Voice AI pipeline
- Respond with text and audio messages
- Webhook verification for Meta API
- Conversation session management per phone number
"""

import base64
import hashlib
import hmac
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional

import httpx

from api.config import settings

logger = logging.getLogger(__name__)


# ── Configuration ─────────────────────────────────────────────────

WHATSAPP_API_URL = "https://graph.facebook.com/v18.0"
WHATSAPP_PHONE_ID = getattr(settings, "WHATSAPP_PHONE_NUMBER_ID", "")
WHATSAPP_TOKEN = getattr(settings, "WHATSAPP_ACCESS_TOKEN", "")
WHATSAPP_VERIFY_TOKEN = getattr(settings, "WHATSAPP_VERIFY_TOKEN", "voiceflow-whatsapp-verify-2026")
WHATSAPP_APP_SECRET = getattr(settings, "WHATSAPP_APP_SECRET", "")


# ── Data Models ───────────────────────────────────────────────────


@dataclass
class WhatsAppMessage:
    """Parsed incoming WhatsApp message."""
    message_id: str
    from_number: str
    timestamp: str
    message_type: str  # text, audio, image, document, interactive
    text: Optional[str] = None
    audio_id: Optional[str] = None
    audio_mime_type: Optional[str] = None
    display_name: Optional[str] = None


@dataclass
class WhatsAppSession:
    """Conversation session per phone number."""
    session_id: str
    phone_number: str
    agent_id: str
    messages: list = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_activity: datetime = field(default_factory=datetime.utcnow)
    language: str = "en"
    context: dict = field(default_factory=dict)


# ── In-memory session store ───────────────────────────────────────

_sessions: dict[str, WhatsAppSession] = {}
SESSION_TIMEOUT = timedelta(hours=24)


def _get_or_create_session(phone_number: str, agent_id: str = "support-assistant-hi") -> WhatsAppSession:
    """Get existing session or create new one for a phone number."""
    if phone_number in _sessions:
        session = _sessions[phone_number]
        if datetime.utcnow() - session.last_activity < SESSION_TIMEOUT:
            session.last_activity = datetime.utcnow()
            return session
    session = WhatsAppSession(
        session_id=str(uuid.uuid4()),
        phone_number=phone_number,
        agent_id=agent_id,
    )
    _sessions[phone_number] = session
    return session


# ── WhatsApp Cloud API Client ────────────────────────────────────


class WhatsAppClient:
    """WhatsApp Business Cloud API client."""

    def __init__(self) -> None:
        self._http = httpx.AsyncClient(timeout=30.0)

    @property
    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {WHATSAPP_TOKEN}",
            "Content-Type": "application/json",
        }

    async def send_text(self, to: str, text: str) -> dict:
        """Send a text message."""
        url = f"{WHATSAPP_API_URL}/{WHATSAPP_PHONE_ID}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "text",
            "text": {"body": text},
        }
        resp = await self._http.post(url, json=payload, headers=self._headers)
        resp.raise_for_status()
        return resp.json()

    async def send_audio(self, to: str, audio_url: str) -> dict:
        """Send an audio message via URL."""
        url = f"{WHATSAPP_API_URL}/{WHATSAPP_PHONE_ID}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "audio",
            "audio": {"link": audio_url},
        }
        resp = await self._http.post(url, json=payload, headers=self._headers)
        resp.raise_for_status()
        return resp.json()

    async def send_interactive_buttons(
        self, to: str, body: str, buttons: list[dict]
    ) -> dict:
        """Send an interactive message with buttons."""
        url = f"{WHATSAPP_API_URL}/{WHATSAPP_PHONE_ID}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "interactive",
            "interactive": {
                "type": "button",
                "body": {"text": body},
                "action": {
                    "buttons": [
                        {
                            "type": "reply",
                            "reply": {"id": b["id"], "title": b["title"]},
                        }
                        for b in buttons[:3]
                    ]
                },
            },
        }
        resp = await self._http.post(url, json=payload, headers=self._headers)
        resp.raise_for_status()
        return resp.json()

    async def download_media(self, media_id: str) -> bytes:
        """Download media (audio/image) from WhatsApp servers."""
        url = f"{WHATSAPP_API_URL}/{media_id}"
        resp = await self._http.get(url, headers=self._headers)
        resp.raise_for_status()
        media_url = resp.json().get("url")
        if not media_url:
            raise ValueError("No media URL returned")
        media_resp = await self._http.get(media_url, headers=self._headers)
        media_resp.raise_for_status()
        return media_resp.content

    async def mark_read(self, message_id: str) -> None:
        """Mark a message as read."""
        url = f"{WHATSAPP_API_URL}/{WHATSAPP_PHONE_ID}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "status": "read",
            "message_id": message_id,
        }
        try:
            await self._http.post(url, json=payload, headers=self._headers)
        except Exception as exc:
            logger.warning("Failed to mark message as read: %s", exc)


# ── Singleton ─────────────────────────────────────────────────────

_client: Optional[WhatsAppClient] = None


def get_whatsapp_client() -> WhatsAppClient:
    global _client
    if _client is None:
        _client = WhatsAppClient()
    return _client


# ── Message parsing ───────────────────────────────────────────────


def parse_webhook_message(body: dict) -> Optional[WhatsAppMessage]:
    """Parse an incoming WhatsApp webhook payload into a WhatsAppMessage."""
    try:
        entry = body.get("entry", [{}])[0]
        changes = entry.get("changes", [{}])[0]
        value = changes.get("value", {})
        messages = value.get("messages", [])
        if not messages:
            return None
        msg = messages[0]
        contacts = value.get("contacts", [{}])
        display_name = contacts[0].get("profile", {}).get("name") if contacts else None

        parsed = WhatsAppMessage(
            message_id=msg.get("id", ""),
            from_number=msg.get("from", ""),
            timestamp=msg.get("timestamp", ""),
            message_type=msg.get("type", "text"),
            display_name=display_name,
        )

        if parsed.message_type == "text":
            parsed.text = msg.get("text", {}).get("body", "")
        elif parsed.message_type == "audio":
            audio = msg.get("audio", {})
            parsed.audio_id = audio.get("id")
            parsed.audio_mime_type = audio.get("mime_type")
        elif parsed.message_type == "interactive":
            interactive = msg.get("interactive", {})
            if interactive.get("type") == "button_reply":
                parsed.text = interactive.get("button_reply", {}).get("title", "")

        return parsed
    except (IndexError, KeyError) as exc:
        logger.warning("Failed to parse WhatsApp message: %s", exc)
        return None


def verify_webhook_signature(payload: bytes, signature: str) -> bool:
    """Verify the X-Hub-Signature-256 header from Meta."""
    if not WHATSAPP_APP_SECRET:
        return True  # Skip verification in development
    expected = hmac.new(
        WHATSAPP_APP_SECRET.encode(), payload, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)
