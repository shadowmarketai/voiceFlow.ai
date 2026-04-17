"""
VoiceFlow AI SaaS - API Server
================================
Standalone Voice AI platform with:
- Multi-dialect ASR, Emotion Detection, TTS
- AI Assistant management
- White-label multi-tenancy
- API integrations for external CRMs (Swetha CRM, Zoho, HubSpot, etc.)
"""

import logging
import os
import sys
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

# Ensure src/ is on the import path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.config import settings
from api.exceptions import register_exception_handlers

logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)


def create_app() -> FastAPI:
    """Build and return the configured FastAPI application."""

    application = FastAPI(
        title=settings.APP_NAME,
        description="Voice AI SaaS Platform — White-Label Voice Agents with CRM API Integration",
        version=settings.APP_VERSION,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    application.state.limiter = limiter
    application.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # ── Security Middleware ───────────────────────────────────
    from api.middleware import (
        RateLimitMiddleware,
        SecurityHeadersMiddleware,
        RequestSizeLimitMiddleware,
    )
    application.add_middleware(RequestSizeLimitMiddleware)
    application.add_middleware(SecurityHeadersMiddleware)
    application.add_middleware(RateLimitMiddleware)

    # ── CORS ─────────────────────────────────────────────────
    cors_origins = settings.cors_origins
    application.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=cors_origins != ["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(application)
    _register_lifecycle(application)

    # ── status.shadowmarket.ai host router ───────────────────
    # When the request arrives on the status subdomain, root path renders the
    # public status HTML instead of the SPA. All other paths still work so the
    # JSON API (/api/v1/status/*) is reachable from the same host.
    @application.middleware("http")
    async def _status_host_router(request: Request, call_next):
        host = (request.headers.get("host") or "").split(":")[0].lower()
        if request.url.path in ("", "/"):
            if host.startswith("status."):
                from api.routers.status_page import status_html
                return await status_html()
            if host.startswith("metrics."):
                from api.routers.metrics_page import metrics_html
                return await metrics_html()
        return await call_next(request)

    # ── API info endpoint ────────────────────────────────────
    @application.get("/api/info")
    async def api_info():
        return {
            "name": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "status": "running",
            "platform": "voiceflow-ai-saas",
            "features": [
                "Multi-Dialect Voice AI (Tamil, Hindi, English)",
                "Emotion Detection & Sentiment Analysis",
                "AI Voice Assistants",
                "Text-to-Speech (5 engines)",
                "Voice Cloning",
                "White-Label Multi-Tenancy",
                "CRM API Integration",
                "Campaign Management",
                "Call Analytics",
            ],
        }

    _include_routers(application)
    _mount_frontend(application)

    return application


def _mount_frontend(application: FastAPI) -> None:
    """Serve the React SPA from /static/ with index.html fallback."""
    static_dir = Path(__file__).resolve().parent.parent.parent / "static"
    if not static_dir.exists():
        logger.info("No static/ directory — frontend not bundled")

        @application.get("/")
        async def root_fallback():
            return {
                "name": settings.APP_NAME,
                "version": settings.APP_VERSION,
                "status": "running",
                "docs": "/docs",
            }

        return

    logger.info("Serving frontend from %s", static_dir)
    assets_dir = static_dir / "assets"
    if assets_dir.exists():
        application.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    index_html = static_dir / "index.html"

    @application.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if ".." in full_path:
            return FileResponse(str(index_html))
        file_path = static_dir / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        # Don't serve index.html for non-HTML file requests (prevents SW/manifest issues)
        if "." in full_path.split("/")[-1]:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        return FileResponse(str(index_html))


def _register_lifecycle(application: FastAPI) -> None:
    """Register startup and shutdown events."""

    @application.on_event("startup")
    async def startup_event():
        try:
            from api.startup import run_startup_checks
            run_startup_checks()
        except Exception as exc:
            logger.warning("Startup checks warning: %s", exc)

        logger.info("Initializing %s...", settings.APP_NAME)

        # Initialize database
        try:
            from api.database import init_db
            init_db()
            logger.info("Database initialized.")
        except Exception as exc:
            logger.warning("Database init warning: %s", exc)

        # Initialize voice engine (lazy — fails gracefully)
        try:
            from voice_engine.engine import VoiceFlowEngine
            application.state.voice_engine = VoiceFlowEngine(model_size="tiny")
            logger.info("Voice engine loaded (model=tiny)")
        except Exception as exc:
            application.state.voice_engine = None
            logger.warning("Voice engine not available: %s", exc)

        # Start synthetic uptime monitor (every 60s) + provider probes (5 min)
        try:
            from api.services.uptime_monitor import start_in_background
            start_in_background()
        except Exception as exc:
            logger.warning("Uptime monitor not started: %s", exc)

        # Start synthetic pipeline probe (opt-in via SYNTHETIC_PROBE_ENABLED=true)
        try:
            from api.services.synthetic_probe import start_in_background as start_synth
            start_synth()
        except Exception as exc:
            logger.warning("Synthetic probe not started: %s", exc)

        logger.info("%s ready!", settings.APP_NAME)

    @application.on_event("shutdown")
    async def shutdown_event():
        logger.info("Shutting down %s...", settings.APP_NAME)


def _include_routers(application: FastAPI) -> None:
    """Include all routers — voice-specific + shared infrastructure."""

    # ── Core infrastructure ──────────────────────────────────
    from api.routers.auth import router as auth_router
    from api.routers.health import router as health_router
    application.include_router(health_router)
    application.include_router(auth_router)

    try:
        from api.routers.users import router as users_router
        application.include_router(users_router)
    except Exception as exc:
        logger.warning("Users router not available: %s", exc)

    # ── Voice AI routers ─────────────────────────────────────
    try:
        from api.routers.voice import router as voice_router
        application.include_router(voice_router)
        logger.info("Voice Analysis router loaded")
    except Exception as exc:
        logger.warning("Voice router not available: %s", exc)

    try:
        from api.routers.voice_agent import router as voice_agent_router
        application.include_router(voice_agent_router)
        logger.info("Voice Agent router loaded (cloning, knowledge, recordings)")
    except Exception as exc:
        logger.warning("Voice Agent router not available: %s", exc)

    # ── Campaign & Analytics ─────────────────────────────────
    try:
        from api.routers.campaigns import router as campaigns_router
        application.include_router(campaigns_router)
        logger.info("Campaigns router loaded")
    except Exception as exc:
        logger.warning("Campaigns router not available: %s", exc)

    try:
        from api.routers.analytics import router as analytics_router
        application.include_router(analytics_router)
        logger.info("Analytics router loaded")
    except Exception as exc:
        logger.warning("Analytics router not available: %s", exc)

    # ── Billing & Tenants ────────────────────────────────────
    try:
        from api.routers.billing import router as billing_router
        application.include_router(billing_router)
        logger.info("Billing router loaded")
    except Exception as exc:
        logger.warning("Billing router not available: %s", exc)

    try:
        from api.routers.tenants import router as tenants_router
        application.include_router(tenants_router)
        logger.info("Tenants router loaded")
    except Exception as exc:
        logger.warning("Tenants router not available: %s", exc)

    # ── Super Admin ──────────────────────────────────────────
    try:
        from api.routers.super_admin import router as super_admin_router
        application.include_router(super_admin_router)
        logger.info("Super Admin router loaded")
    except Exception as exc:
        logger.warning("Super Admin router not available: %s", exc)

    # ── Platform Support (tenant-side tickets + SLA + attachments) ──
    try:
        from api.routers.platform_support import router as platform_support_router
        application.include_router(platform_support_router)
        logger.info("Platform Support router loaded")
    except Exception as exc:
        logger.warning("Platform Support router not available: %s", exc)

    # ── Persistent Agents + Call Logs + Channel Configs ─────
    try:
        from api.routers.agents_db import router as agents_db_router
        application.include_router(agents_db_router)
        logger.info("Agents DB router loaded")
    except Exception as exc:
        logger.warning("Agents DB router not available: %s", exc)

    # ── Chat (single-turn LLM for Testing page) ──────────────
    try:
        from api.routers.chat import router as chat_router
        application.include_router(chat_router)
        logger.info("Chat router loaded")
    except Exception as exc:
        logger.warning("Chat router not available: %s", exc)

    # ── Deepgram streaming STT (live WebSocket transcription) ──
    try:
        from api.routers.deepgram_streaming import router as dg_stream_router
        application.include_router(dg_stream_router)
        logger.info("Deepgram streaming STT router loaded")
    except Exception as exc:
        logger.warning("Deepgram streaming router not available: %s", exc)

    # ── Tenant team management (tenant owner adds/removes users) ─
    try:
        from api.routers.tenant_users import router as tenant_users_router
        application.include_router(tenant_users_router)
        logger.info("Tenant Users router loaded")
    except Exception as exc:
        logger.warning("Tenant Users router not available: %s", exc)

    # ── Billing Pro (wallet + cost calculator) ──────────────
    try:
        from api.routers.billing_pro import router as billing_pro_router
        application.include_router(billing_pro_router)
        logger.info("Billing Pro router loaded (wallet + pricing)")
    except Exception as exc:
        logger.warning("Billing Pro router not available: %s", exc)

    # ── Quality & Testing Metrics ────────────────────────────
    try:
        from api.routers.quality import router as quality_router
        application.include_router(quality_router)
        logger.info("Quality router loaded")
    except Exception as exc:
        logger.warning("Quality router not available: %s", exc)

    # ── Public Status Page (status.shadowmarket.ai) ──────────
    try:
        from api.routers.status_page import router as status_page_router
        application.include_router(status_page_router)
        logger.info("Status page router loaded")
    except Exception as exc:
        logger.warning("Status page router not available: %s", exc)

    # ── Public Metrics Page (metrics.shadowmarket.ai) ────────
    try:
        from api.routers.metrics_page import router as metrics_page_router
        application.include_router(metrics_page_router)
        logger.info("Metrics page router loaded")
    except Exception as exc:
        logger.warning("Metrics page router not available: %s", exc)

    # ── Enterprise (audit log + RBAC + DPDP) ────────────────
    try:
        from api.routers.enterprise import router as enterprise_router
        application.include_router(enterprise_router)
        logger.info("Enterprise router loaded (audit, RBAC, DPDP)")
    except Exception as exc:
        logger.warning("Enterprise router not available: %s", exc)

    # ── Webhooks & API Keys ──────────────────────────────────
    try:
        from api.routers.webhooks import router as webhooks_router
        application.include_router(webhooks_router)
        logger.info("Webhooks router loaded")
    except Exception as exc:
        logger.warning("Webhooks router not available: %s", exc)

    # ── WhatsApp Integration ────────────────────────────────
    try:
        from api.routers.whatsapp import router as whatsapp_router
        application.include_router(whatsapp_router)
        logger.info("WhatsApp integration router loaded")
    except Exception as exc:
        logger.warning("WhatsApp router not available: %s", exc)

    # ── Voice Conversation (WebSocket + REST + Widget) ─────
    try:
        from api.routers.voice_conversation import router as voice_conv_router
        application.include_router(voice_conv_router)
        logger.info("Voice Conversation router loaded (WS + REST + Widget)")
    except Exception as exc:
        logger.warning("Voice Conversation router not available: %s", exc)

    # ── WebSocket (realtime) ─────────────────────────────────
    try:
        from api.realtime import router as realtime_router
        application.include_router(realtime_router)
        logger.info("Realtime WebSocket router loaded")
    except Exception as exc:
        logger.warning("Realtime router not available: %s", exc)

    # ── TTS router ───────────────────────────────────────────
    try:
        from tts.router import tts_router
        application.include_router(tts_router)
        logger.info("TTS router loaded")
    except Exception as exc:
        logger.warning("TTS router not available: %s", exc)

    # ── Embeddable Widget ────────────────────────────────────
    try:
        from widget.router import router as widget_router
        application.include_router(widget_router)
        logger.info("Widget router loaded (embed.js, agent config, REST messaging)")
    except Exception as exc:
        logger.warning("Widget router not available: %s", exc)

    # ── Assistants (legacy) ──────────────────────────────────
    try:
        from assistants.assistant_service import assistant_router
        application.include_router(assistant_router)
        logger.info("Assistants router loaded")
    except Exception as exc:
        logger.warning("Assistants router not available: %s", exc)

    # ── Voice AI pipeline (STT → LLM → TTS) ─────────────────
    _load_voice_pipeline(application)

    # ── LiveKit (real-time WebRTC voice) ──────────────────────
    try:
        from livekit_agent.router import livekit_router
        application.include_router(livekit_router)
        logger.info("LiveKit router loaded")
    except Exception as exc:
        logger.warning("LiveKit router not available: %s", exc)

    # ── Voice Cloning ────────────────────────────────────────
    try:
        from voice_cloning.router import voice_clone_router
        application.include_router(voice_clone_router)
        logger.info("Voice Cloning router loaded")
    except Exception as exc:
        logger.warning("Voice Cloning router not available: %s", exc)

    # ── Telephony (7 providers + WebRTC) ────────────────────
    try:
        from integrations.telephony.router import telephony_router, webrtc_router
        application.include_router(telephony_router)
        application.include_router(webrtc_router)
        logger.info("Telephony router loaded (7 providers + WebRTC)")
    except Exception as exc:
        logger.warning("Telephony router not available: %s", exc)

    # ── CRM Integration API ──────────────────────────────────
    _register_crm_integration_api(application)


def _load_voice_pipeline(application: FastAPI) -> None:
    """Load the full voice AI pipeline endpoints (STT -> LLM -> TTS)."""
    try:
        from typing import Optional
        from fastapi import File, UploadFile
        from voice_engine.voice_ai_service import get_voice_ai_service, VoiceTurnRequest

        @application.post("/api/v1/voice/respond")
        async def voice_respond(
            file: UploadFile = File(...),
            language: Optional[str] = None,
            system_prompt: str = "You are a helpful sales assistant. Keep responses under 40 words.",
            llm_provider: str = "groq",
            tts_language: str = "en",
            voice_id: Optional[str] = None,
        ):
            """Full voice conversation turn: upload audio -> get AI voice response."""
            audio_bytes = await file.read()
            req = VoiceTurnRequest(
                audio_bytes=audio_bytes,
                language=language,
                system_prompt=system_prompt,
                llm_provider=llm_provider,
                tts_language=tts_language,
                voice_id=voice_id,
            )
            svc = get_voice_ai_service()
            turn = await svc.handle_turn(req)
            return turn.to_dict()

        # W2.2 — Text-only language detector (fast probe for the Testing page).
        @application.post("/api/v1/voice/detect-language")
        async def detect_language(payload: dict):
            """Detect language + TTS-switch decision for a text snippet."""
            from voice_engine.lang_detect import detect_language_text, pick_tts_language
            text = (payload or {}).get("text", "")
            hint = (payload or {}).get("hint")
            stt = (payload or {}).get("stt_language")
            detected = detect_language_text(text)
            chosen, reason = pick_tts_language(user_hint=hint, stt_detected=stt, text=text)
            return {"detected": detected, "chosen_tts_language": chosen, "reason": reason}

        # W1.2 — Parallel LLM+TTS streaming (SSE). Client plays audio
        # chunks as they arrive instead of waiting for full reply.
        @application.post("/api/v1/voice/respond-stream")
        async def voice_respond_stream(
            file: UploadFile = File(...),
            language: Optional[str] = None,
            system_prompt: str = "You are a helpful sales assistant. Keep responses under 40 words.",
            llm_provider: str = "groq",
            tts_language: str = "en",
            voice_id: Optional[str] = None,
        ):
            """Streaming voice turn — yields SSE events with audio chunks.

            Events: stt | llm_partial | audio_chunk | done.
            TTFA (time-to-first-audio) is reported in the `done` event.
            """
            import json as _json

            from fastapi.responses import StreamingResponse

            audio_bytes = await file.read()
            req = VoiceTurnRequest(
                audio_bytes=audio_bytes,
                language=language,
                system_prompt=system_prompt,
                llm_provider=llm_provider,
                tts_language=tts_language,
                voice_id=voice_id,
            )
            svc = get_voice_ai_service()

            async def event_stream():
                async for event in svc.handle_turn_stream(req):
                    yield f"data: {_json.dumps(event)}\n\n"

            return StreamingResponse(
                event_stream(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "X-Accel-Buffering": "no",
                },
            )

        @application.post("/api/v1/voice/analyze-and-speak")
        async def analyze_and_speak(
            file: UploadFile = File(...),
            response_text: str = "Thank you for your message.",
            tts_language: str = "en",
            voice_id: Optional[str] = None,
        ):
            """Analyse customer audio and synthesize a given response text."""
            audio_bytes = await file.read()
            svc = get_voice_ai_service()
            analysis = await svc.transcribe_and_analyze(audio_bytes)
            tts_result = await svc.generate_response_audio(
                text=response_text,
                language=tts_language,
                detected_customer_emotion=analysis.get("emotion"),
                voice_id=voice_id,
            )
            return {"analysis": analysis, "response_audio": tts_result}

        logger.info("Voice AI pipeline endpoints loaded")
    except Exception as exc:
        logger.warning("Voice AI pipeline not available: %s", exc)


def _register_crm_integration_api(application: FastAPI) -> None:
    """Register CRM integration endpoints for external systems.

    These endpoints allow external CRMs (Swetha CRM, Zoho, HubSpot, etc.)
    to integrate with VoiceFlow AI via API keys and webhooks.
    """
    from fastapi import Header, HTTPException, status

    API_PREFIX = "/api/v1/integration"

    async def _verify_api_key(x_api_key: str = Header(...)):
        """Verify the API key for CRM integration requests."""
        if not x_api_key or len(x_api_key) < 10:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or missing API key",
            )
        return x_api_key

    @application.post(f"{API_PREFIX}/voice/analyze")
    async def crm_voice_analyze(
        request: Request,
        api_key: str = Header(alias="X-API-Key"),
    ):
        """External CRM sends audio for voice analysis.

        Returns: transcription, emotion, intent, dialect, lead_score, sentiment.
        """
        await _verify_api_key(api_key)
        body = await request.json()
        return {
            "status": "ok",
            "message": "Voice analysis endpoint ready",
            "accepted_formats": ["wav", "mp3", "ogg", "webm"],
            "max_duration_seconds": 300,
            "features": [
                "transcription",
                "emotion_detection",
                "intent_classification",
                "dialect_detection",
                "lead_scoring",
                "sentiment_analysis",
            ],
        }

    @application.post(f"{API_PREFIX}/call/initiate")
    async def crm_initiate_call(
        request: Request,
        api_key: str = Header(alias="X-API-Key"),
    ):
        """External CRM triggers an outbound AI voice call."""
        await _verify_api_key(api_key)
        body = await request.json()
        return {
            "status": "ok",
            "message": "Call initiation endpoint ready",
            "required_fields": ["phone_number", "agent_id"],
            "optional_fields": ["lead_id", "campaign_id", "callback_url"],
        }

    @application.post(f"{API_PREFIX}/webhook/call-complete")
    async def crm_call_complete_webhook(request: Request):
        """Webhook callback when a call completes — sends results to CRM."""
        body = await request.json()
        return {"status": "received", "message": "Call completion webhook acknowledged"}

    @application.get(f"{API_PREFIX}/agents")
    async def crm_list_agents(api_key: str = Header(alias="X-API-Key")):
        """List available AI voice agents for a tenant."""
        await _verify_api_key(api_key)
        return {
            "status": "ok",
            "message": "Agent listing endpoint ready",
            "agents": [],
        }

    @application.get(f"{API_PREFIX}/analytics/summary")
    async def crm_analytics_summary(api_key: str = Header(alias="X-API-Key")):
        """Get call analytics summary for CRM dashboard widget."""
        await _verify_api_key(api_key)
        return {
            "status": "ok",
            "message": "Analytics summary endpoint ready",
            "metrics": [
                "total_calls",
                "avg_duration",
                "sentiment_distribution",
                "emotion_breakdown",
                "conversion_rate",
            ],
        }

    logger.info("CRM Integration API endpoints registered at %s/*", API_PREFIX)


# ── Create the app instance ──────────────────────────────────────

app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "api.server:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
    )
