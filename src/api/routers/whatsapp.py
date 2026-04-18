"""
VoiceFlow AI — WhatsApp Webhook Router
========================================
Handles incoming WhatsApp messages, processes voice notes through
the Voice AI pipeline, and sends responses.

Endpoints:
- GET  /api/v1/whatsapp/webhook  — Meta verification challenge
- POST /api/v1/whatsapp/webhook  — Incoming message handler
- GET  /api/v1/whatsapp/status   — Integration status
- POST /api/v1/whatsapp/send     — Send message (internal API)
"""

import logging

from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from integrations.whatsapp.whatsapp_service import WhatsAppSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/whatsapp", tags=["WhatsApp"])


# ── Schemas ──────────────────────────────────────────────────────


class SendMessageRequest(BaseModel):
    to: str
    message: str
    agent_id: str = "support-assistant-hi"
    include_voice: bool = False


class SendMessageResponse(BaseModel):
    status: str
    message_id: str | None = None
    voice_sent: bool = False


# ── Webhook Verification (GET) ───────────────────────────────────


@router.get("/webhook")
async def verify_webhook(
    mode: str = Query(alias="hub.mode", default=""),
    token: str = Query(alias="hub.verify_token", default=""),
    challenge: str = Query(alias="hub.challenge", default=""),
) -> PlainTextResponse:
    """Meta webhook verification endpoint.

    When you register the webhook URL in Meta Developer Console,
    Meta sends a GET request with hub.mode, hub.verify_token, and hub.challenge.
    We verify the token and return the challenge.
    """
    from integrations.whatsapp.whatsapp_service import WHATSAPP_VERIFY_TOKEN

    if mode == "subscribe" and token == WHATSAPP_VERIFY_TOKEN:
        logger.info("WhatsApp webhook verified successfully")
        return PlainTextResponse(content=challenge, status_code=200)

    logger.warning("WhatsApp webhook verification failed: mode=%s", mode)
    raise HTTPException(status_code=403, detail="Verification failed")


# ── Incoming Message Handler (POST) ──────────────────────────────


@router.post("/webhook")
async def handle_webhook(
    request: Request,
    x_hub_signature_256: str | None = Header(None),
):
    """Handle incoming WhatsApp messages.

    Flow:
    1. Parse the webhook payload
    2. If text message → generate AI text response
    3. If voice note → download audio → Voice AI pipeline → respond with text + audio
    4. Send response back via WhatsApp
    """
    body_bytes = await request.body()
    body = await request.json()

    # Verify signature in production
    from integrations.whatsapp.whatsapp_service import (
        _get_or_create_session,
        get_whatsapp_client,
        parse_webhook_message,
        verify_webhook_signature,
    )

    if x_hub_signature_256:
        if not verify_webhook_signature(body_bytes, x_hub_signature_256):
            raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse message
    message = parse_webhook_message(body)
    if not message:
        return {"status": "ok", "detail": "No actionable message"}

    logger.info(
        "WhatsApp message from %s (%s): type=%s",
        message.from_number,
        message.display_name,
        message.message_type,
    )

    client = get_whatsapp_client()

    # Mark as read
    await client.mark_read(message.message_id)

    # Get or create session
    session = _get_or_create_session(message.from_number)

    try:
        if message.message_type == "text" and message.text:
            # Text message → LLM response
            response_text = await _generate_text_response(
                message.text, session
            )
            session.messages.append({"role": "user", "text": message.text})
            session.messages.append({"role": "assistant", "text": response_text})

            await client.send_text(message.from_number, response_text)

        elif message.message_type == "audio" and message.audio_id:
            # Voice note → download → process → respond
            audio_bytes = await client.download_media(message.audio_id)
            result = await _process_voice_message(audio_bytes, session)

            session.messages.append({
                "role": "user",
                "text": result.get("transcription", ""),
                "type": "voice",
            })

            # Send text transcription + AI response
            transcript_msg = f"🎤 You said: \"{result.get('transcription', '...')}\""
            await client.send_text(message.from_number, transcript_msg)

            response_text = result.get("response_text", "")
            if response_text:
                await client.send_text(message.from_number, response_text)
                session.messages.append({"role": "assistant", "text": response_text})

        else:
            await client.send_text(
                message.from_number,
                "I can help you with text and voice messages. "
                "Send me a text or record a voice note! 🎤",
            )

    except Exception as exc:
        logger.error("Error processing WhatsApp message: %s", exc)
        try:
            await client.send_text(
                message.from_number,
                "Sorry, I encountered an error. Please try again.",
            )
        except Exception:
            pass

    return {"status": "ok"}


# ── Send Message (Internal API) ──────────────────────────────────


@router.post("/send", response_model=SendMessageResponse)
async def send_message(req: SendMessageRequest):
    """Send a WhatsApp message (called from dashboard or API)."""
    from integrations.whatsapp.whatsapp_service import get_whatsapp_client

    client = get_whatsapp_client()
    try:
        result = await client.send_text(req.to, req.message)
        msg_id = result.get("messages", [{}])[0].get("id")
        return SendMessageResponse(status="sent", message_id=msg_id)
    except Exception as exc:
        logger.error("Failed to send WhatsApp message: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ── Status ────────────────────────────────────────────────────────


@router.get("/status")
async def whatsapp_status():
    """Check WhatsApp integration status."""
    from integrations.whatsapp.whatsapp_service import (
        WHATSAPP_PHONE_ID,
        WHATSAPP_TOKEN,
        _sessions,
    )

    configured = bool(WHATSAPP_PHONE_ID and WHATSAPP_TOKEN)
    return {
        "status": "configured" if configured else "not_configured",
        "phone_number_id": WHATSAPP_PHONE_ID[:6] + "..." if WHATSAPP_PHONE_ID else None,
        "active_sessions": len(_sessions),
        "setup_guide": {
            "step_1": "Create a Meta Developer Account at developers.facebook.com",
            "step_2": "Create a WhatsApp Business App",
            "step_3": "Set WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN in .env",
            "step_4": "Set webhook URL to: https://your-domain.com/api/v1/whatsapp/webhook",
            "step_5": "Subscribe to 'messages' webhook field",
        },
    }


# ── AI Response Helpers ───────────────────────────────────────────


async def _generate_text_response(
    text: str, session: WhatsAppSession
) -> str:
    """Generate an AI response for a text message."""
    try:
        from api.routers.voice_conversation import _generate_llm_response
        return await _generate_llm_response(text, session.agent_id)
    except ImportError:
        pass

    # Fallback: simple response
    greetings = {"hi", "hello", "hey", "namaste", "vanakkam", "hola"}
    if text.strip().lower() in greetings:
        return "Namaste! 🙏 How can I help you today? You can ask me anything or send a voice message."

    return (
        f"Thanks for your message! I received: \"{text[:100]}\". "
        "I'm your AI voice assistant. Ask me anything or send a voice note for voice-based help! 🎤"
    )


async def _process_voice_message(
    audio_bytes: bytes, session: WhatsAppSession
) -> dict:
    """Process a voice note through the Voice AI pipeline."""
    result = {
        "transcription": "",
        "response_text": "",
        "emotion": "neutral",
        "language": "en",
    }

    # Try voice engine
    try:
        from voice_engine.voice_ai_service import get_voice_ai_service

        svc = get_voice_ai_service()
        analysis = await svc.transcribe_and_analyze(audio_bytes)
        result["transcription"] = analysis.get("transcription", "")
        result["emotion"] = analysis.get("emotion", "neutral")
        result["language"] = analysis.get("language", "en")

        # Generate response
        if result["transcription"]:
            result["response_text"] = await _generate_text_response(
                result["transcription"], session
            )
        return result
    except Exception as exc:
        logger.warning("Voice engine not available for WhatsApp: %s", exc)

    result["transcription"] = "[Voice message received - processing not available]"
    result["response_text"] = (
        "I received your voice message! Voice processing is being set up. "
        "For now, please send me a text message and I'll help you right away. 🎤"
    )
    return result
