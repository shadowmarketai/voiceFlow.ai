"""
VoiceFlow AI — Widget Serving & API Router
============================================
Serves the embeddable widget JS/CSS and handles widget-specific
REST endpoints (agent config, text messages, etc.).

Endpoints:
  GET  /api/v1/widget/embed.js           — Serve the widget script
  GET  /api/v1/widget/embed.css           — Serve the widget stylesheet
  GET  /api/v1/widget/agent/{agent_id}    — Agent config for widget init
  POST /api/v1/widget/message             — REST fallback for text messages
"""

import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/widget", tags=["Widget"])

WIDGET_DIR = Path(__file__).resolve().parent


# ── Schemas ───────────────────────────────────────────────────────────


class WidgetMessageRequest(BaseModel):
    """Incoming text message from the embeddable widget."""

    agent_id: str
    session_id: str
    text: str
    language: str = "en"

    model_config = ConfigDict(from_attributes=True)


class WidgetMessageResponse(BaseModel):
    """AI response sent back to the widget."""

    text: str
    audio_base64: Optional[str] = None
    audio_format: str = "wav"
    session_id: str

    model_config = ConfigDict(from_attributes=True)


# ── Serve static widget files ─────────────────────────────────────────


@router.get("/embed.js", include_in_schema=False)
async def serve_widget_js():
    """Serve the embeddable widget JavaScript file."""
    js_path = WIDGET_DIR / "embed.js"
    if not js_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Widget script not found",
        )
    return FileResponse(
        str(js_path),
        media_type="application/javascript",
        headers={
            "Cache-Control": "public, max-age=3600",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.get("/embed.css", include_in_schema=False)
async def serve_widget_css():
    """Serve the embeddable widget stylesheet."""
    css_path = WIDGET_DIR / "embed.css"
    if not css_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Widget stylesheet not found",
        )
    return FileResponse(
        str(css_path),
        media_type="text/css",
        headers={
            "Cache-Control": "public, max-age=3600",
            "Access-Control-Allow-Origin": "*",
        },
    )


# ── Agent config endpoint ─────────────────────────────────────────────


@router.get(
    "/agent/{agent_id}",
    summary="Get widget agent configuration",
    response_class=JSONResponse,
)
async def get_widget_agent_config(agent_id: str):
    """
    Return the agent configuration needed by the embeddable widget.

    This is a public endpoint (no auth required) since it is called by
    the widget script running on any third-party website.

    In production this would look up the agent by ID in the database.
    For now, return sensible defaults that prove the widget works end-to-end.
    """
    # TODO: Look up agent from DB using agent_id + tenant resolution
    # For now return defaults per agent_id convention
    configs = {
        "default": {
            "name": "VoiceFlow Assistant",
            "avatar_url": "",
            "greeting": "Hello! I'm your AI assistant. How can I help you today?",
            "primary_color": "#6366f1",
            "accent_color": "#8b5cf6",
            "theme": "dark",
            "language": "en",
            "voice_enabled": True,
        },
        "sales-assistant-en": {
            "name": "Sales Assistant",
            "avatar_url": "",
            "greeting": "Hi there! I'm here to help you find the perfect solution. What are you looking for?",
            "primary_color": "#6366f1",
            "accent_color": "#8b5cf6",
            "theme": "dark",
            "language": "en",
            "voice_enabled": True,
        },
        "support-agent-en": {
            "name": "Support Agent",
            "avatar_url": "",
            "greeting": "Welcome! How can I assist you today?",
            "primary_color": "#0891b2",
            "accent_color": "#06b6d4",
            "theme": "dark",
            "language": "en",
            "voice_enabled": True,
        },
    }

    config = configs.get(agent_id, configs["default"])
    config["agent_id"] = agent_id
    return JSONResponse(
        content=config,
        headers={"Access-Control-Allow-Origin": "*"},
    )


# ── Widget text message endpoint (REST fallback) ──────────────────────


@router.post(
    "/message",
    response_model=WidgetMessageResponse,
    summary="Send a text message from the widget (REST fallback)",
)
async def widget_send_message(body: WidgetMessageRequest):
    """
    Handle a text message from the embeddable widget when WebSocket
    is not available. Runs the full pipeline: interpret text -> LLM -> TTS.

    Returns the AI text response and optionally an audio base64 response.
    """
    # Try to use the voice AI service for a full pipeline response
    try:
        from voice_engine.voice_ai_service import get_voice_ai_service

        svc = get_voice_ai_service()

        # Use the LLM to generate a response
        llm_response = await svc.generate_text_response(
            text=body.text,
            system_prompt=(
                "You are a helpful AI assistant embedded on a website. "
                "Keep responses concise (under 60 words), friendly, and helpful."
            ),
            language=body.language,
        )
        response_text = llm_response.get("text", body.text)

        # Generate TTS audio
        tts_result = await svc.generate_response_audio(
            text=response_text,
            language=body.language,
        )

        return WidgetMessageResponse(
            text=response_text,
            audio_base64=tts_result.get("audio_base64"),
            audio_format=tts_result.get("audio_format", "wav"),
            session_id=body.session_id,
        )
    except (ImportError, AttributeError) as exc:
        logger.warning("Voice AI service not available for widget: %s", exc)
    except Exception as exc:
        logger.warning("Widget pipeline error: %s", exc)

    # Fallback: echo-style response when service is unavailable
    return WidgetMessageResponse(
        text=f"Thank you for your message. Our team will get back to you shortly.",
        audio_base64=None,
        audio_format="wav",
        session_id=body.session_id,
    )
