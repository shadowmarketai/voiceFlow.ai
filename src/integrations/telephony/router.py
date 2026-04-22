"""
VoiceFlow AI — Telephony API Router
=====================================
Unified API across 7 telephony providers + WebRTC.
"""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from .manager import TelephonyManager
from .providers.base import CallDirection, CallStatus

logger = logging.getLogger(__name__)

telephony_router = APIRouter(prefix="/api/v1/telephony", tags=["Telephony"])
telephony_manager = TelephonyManager()


# ── Request Models ──────────────────────────────────────────────

class MakeCallRequest(BaseModel):
    from_number: str
    to_number: str
    webhook_url: str
    provider: str | None = None
    call_type: str = "standard"  # standard | ai_agent | bulk | webrtc | sip
    record: bool = True
    agent_id: str | None = None
    metadata: dict[str, Any] | None = None


class RealtimeCallRequest(BaseModel):
    from_number: str
    to_number: str
    agent_id: str
    tenant_id: str = ""
    language: str = "en"
    provider: str | None = None


class BulkCallRequest(BaseModel):
    phone_numbers: list[str]
    from_number: str
    webhook_url: str
    audio_url: str | None = None
    tts_text: str | None = None
    tts_language: str = "hi"
    campaign_name: str = ""
    provider: str = "vobiz"


class CostEstimateRequest(BaseModel):
    to_number: str
    duration_minutes: float
    provider: str | None = None


class WebRTCSessionRequest(BaseModel):
    agent_id: str = ""
    tenant_id: str = ""
    metadata: dict[str, Any] | None = None


class WebRTCOfferRequest(BaseModel):
    sdp: str


class WebRTCCandidateRequest(BaseModel):
    candidate: dict[str, Any]


# ── Standard Call Endpoints ─────────────────────────────────────

@telephony_router.post("/call/realtime")
async def make_realtime_call(request: RealtimeCallRequest, req: Request):
    """Make outbound call with live AI agent (real-time voice engine).

    This initiates a phone call where the AI voice agent handles the
    conversation in real-time using STT → LLM → TTS pipeline with
    barge-in support.

    The call audio streams through our realtime bridge WebSocket.
    No recording download needed — conversation happens live.
    """
    # Build the stream URL pointing to our realtime bridge
    host = req.headers.get("host", "localhost:8000")
    scheme = "wss" if req.url.scheme == "https" else "ws"
    stream_url = (
        f"{scheme}://{host}/api/v1/telephony/stream/twilio/ws"
        f"?agent_id={request.agent_id}"
        f"&language={request.language}"
        f"&tenant_id={request.tenant_id}"
    )

    result = await telephony_manager.make_realtime_call(
        from_number=request.from_number,
        to_number=request.to_number,
        stream_url=stream_url,
        agent_id=request.agent_id,
        preferred_provider=request.provider,
    )
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result


@telephony_router.post("/call")
async def make_call(request: MakeCallRequest):
    """Make outbound call with automatic provider selection."""
    kwargs: dict[str, Any] = {"record": request.record}
    if request.agent_id:
        kwargs["agent_id"] = request.agent_id
    if request.metadata:
        kwargs["metadata"] = request.metadata

    result = await telephony_manager.make_call(
        from_number=request.from_number,
        to_number=request.to_number,
        webhook_url=request.webhook_url,
        preferred_provider=request.provider,
        call_type=request.call_type,
        **kwargs,
    )
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result


@telephony_router.get("/call/{provider}/{call_id}")
async def get_call(provider: str, call_id: str):
    """Get call details from a specific provider."""
    p = telephony_manager.get_provider(provider)
    return await p.get_call(call_id)


@telephony_router.post("/call/{provider}/{call_id}/end")
async def end_call(provider: str, call_id: str):
    """End an active call."""
    p = telephony_manager.get_provider(provider)
    return await p.end_call(call_id)


# ── Bulk Calling ────────────────────────────────────────────────

@telephony_router.post("/bulk-call")
async def bulk_call(request: BulkCallRequest):
    """Bulk voice broadcast (via Vobiz or Bolna)."""
    provider = telephony_manager.get_provider(request.provider)

    if request.provider == "vobiz" and hasattr(provider, "broadcast"):
        result = await provider.broadcast(
            phone_numbers=request.phone_numbers,
            audio_url=request.audio_url,
            tts_text=request.tts_text,
            tts_language=request.tts_language,
            webhook_url=request.webhook_url,
            campaign_name=request.campaign_name,
        )
    elif request.provider == "bolna" and hasattr(provider, "make_batch_calls"):
        result = await provider.make_batch_calls(
            agent_id=request.campaign_name,  # Use campaign_name as agent_id
            phone_numbers=request.phone_numbers,
            from_number=request.from_number,
            webhook_url=request.webhook_url,
        )
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Provider {request.provider} does not support bulk calling. Use 'vobiz' or 'bolna'.",
        )

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result


# ── Phone Numbers ───────────────────────────────────────────────

@telephony_router.get("/numbers")
async def list_numbers():
    """List all phone numbers across all providers."""
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
                "currency": n.currency,
                "is_active": n.is_active,
            }
            for n in numbers
        ]
    }


# ── Cost Estimation ─────────────────────────────────────────────

@telephony_router.post("/cost-estimate")
async def estimate_cost(request: CostEstimateRequest):
    """Estimate call cost across all providers."""
    return telephony_manager.estimate_cost(
        to_number=request.to_number,
        duration_minutes=request.duration_minutes,
        provider=request.provider,
    )


# ── Provider Status ─────────────────────────────────────────────

@telephony_router.get("/providers")
async def list_providers():
    """List all telephony providers and their status."""
    return telephony_manager.get_provider_status()


# ── Webhooks (all providers) ───────────────────────────────────

VALID_PROVIDERS = {"telecmi", "bolna", "vobiz", "exotel", "twilio", "vonage", "sip", "webrtc"}


@telephony_router.post("/webhooks/{provider}")
async def telephony_webhook(provider: str, request: Request):
    """Handle telephony webhooks from any provider."""
    if provider not in VALID_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

    payload = await request.json()
    call_record = telephony_manager.parse_webhook(provider, payload)

    # Process completed calls through voice analysis pipeline
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
                    user_id=1,
                    duration_seconds=call_record.duration_seconds,
                )
                logger.info(
                    "Call %s processed: analysis_id=%s",
                    call_record.id,
                    result.get("analysis_id") if result else None,
                )
            finally:
                db.close()
        except Exception as exc:
            logger.warning("Call processing failed for %s: %s", call_record.id, exc)

    # Update campaign stats if this call belongs to a campaign
    try:
        campaign_id = payload.get("campaign_id") or call_record.__dict__.get("campaign_id")
        if campaign_id:
            from api.database import get_session_factory
            from api.models.campaign import Campaign

            with get_session_factory()() as db:
                campaign = db.get(Campaign, int(campaign_id))
                if campaign:
                    campaign.total_calls_made = (campaign.total_calls_made or 0) + 1
                    if call_record.status == CallStatus.COMPLETED and call_record.duration_seconds > 2:
                        campaign.calls_connected = (campaign.calls_connected or 0) + 1
                    db.commit()
                    logger.info("Campaign %s stats updated: dialed=%d connected=%d",
                                campaign_id, campaign.total_calls_made, campaign.calls_connected)
    except Exception as exc:
        logger.warning("Campaign stats update failed: %s", exc)

    return {"status": "processed", "call_id": call_record.id, "provider": provider}


# ── WebRTC Endpoints ───────────────────────────────────────────

webrtc_router = APIRouter(prefix="/api/v1/webrtc", tags=["WebRTC"])


@webrtc_router.post("/session")
async def create_webrtc_session(request: WebRTCSessionRequest):
    """Create a new WebRTC session for browser-based voice calls."""
    provider = telephony_manager.get_provider("webrtc")
    result = await provider.create_session(
        agent_id=request.agent_id,
        tenant_id=request.tenant_id,
        metadata=request.metadata,
    )
    if not result.get("success"):
        raise HTTPException(status_code=500, detail="Failed to create WebRTC session")
    return result


@webrtc_router.post("/signal/{session_id}/offer")
async def webrtc_offer(session_id: str, request: WebRTCOfferRequest):
    """Handle WebRTC SDP offer from browser."""
    provider = telephony_manager.get_provider("webrtc")
    result = await provider.handle_offer(session_id, request.sdp)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result


@webrtc_router.post("/signal/{session_id}/ice")
async def webrtc_ice_candidate(session_id: str, request: WebRTCCandidateRequest):
    """Handle ICE candidate from browser."""
    provider = telephony_manager.get_provider("webrtc")
    result = await provider.handle_ice_candidate(session_id, request.candidate)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result


@webrtc_router.post("/signal/{session_id}/end")
async def webrtc_end_session(session_id: str):
    """End a WebRTC session."""
    provider = telephony_manager.get_provider("webrtc")
    return await provider.end_call(session_id)


@webrtc_router.get("/ice-config")
async def get_ice_config():
    """Get ICE server configuration for WebRTC clients."""
    provider = telephony_manager.get_provider("webrtc")
    return {
        "ice_config": provider.get_ice_config(),
        "media_constraints": provider.get_media_constraints(),
    }
