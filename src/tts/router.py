"""
VoiceFlow TTS API Router
Adapted from tts_endpoints.py — imports fixed for VoiceFlow src/ structure
"""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from typing import Optional, List
import logging

from tts.service import get_tts_service
from tts.config import (
    TTSEngine, EmotionType, Language, TamilDialect,
    TTSRequest, TTSResponse, VoiceCloneRequest, VoiceCloneResponse,
    VoiceConfig, EMOTION_RESPONSE_MAPPING
)

logger = logging.getLogger(__name__)

tts_router = APIRouter(prefix="/api/v1/tts", tags=["Text-to-Speech"])


# =============================================================================
# SYNTHESIS
# =============================================================================

@tts_router.post("/synthesize", response_model=TTSResponse)
async def synthesize_speech(request: TTSRequest):
    """Convert text to speech with emotion and language control."""
    try:
        service = get_tts_service()
        return await service.synthesize(request)
    except Exception as e:
        logger.error(f"TTS synthesis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@tts_router.post("/synthesize/stream")
async def synthesize_stream(request: TTSRequest):
    """Stream audio generation for real-time applications."""
    try:
        service = get_tts_service()

        async def audio_generator():
            async for chunk in service.synthesize_stream(request):
                yield chunk

        return StreamingResponse(
            audio_generator(),
            media_type="audio/wav",
            headers={"Transfer-Encoding": "chunked", "Cache-Control": "no-cache"}
        )
    except Exception as e:
        logger.error(f"TTS streaming failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@tts_router.post("/synthesize/emotion-aware", response_model=TTSResponse)
async def synthesize_emotion_aware(
    text: str,
    language: Language = Language.TAMIL,
    detected_customer_emotion: str = Query(..., description="Detected emotion from customer speech"),
    use_case: Optional[str] = Query(None),
    dialect: Optional[TamilDialect] = None
):
    """Emotion-aware synthesis that responds appropriately to detected customer emotion."""
    try:
        service = get_tts_service()
        request = TTSRequest(
            text=text,
            language=language,
            dialect=dialect,
            detected_customer_emotion=detected_customer_emotion,
            use_case=use_case
        )
        return await service.synthesize(request)
    except Exception as e:
        logger.error(f"Emotion-aware synthesis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# VOICE CLONING
# =============================================================================

@tts_router.post("/voices/clone", response_model=VoiceCloneResponse)
async def clone_voice(request: VoiceCloneRequest):
    """Clone a voice from reference audio (min 10 seconds recommended)."""
    try:
        service = get_tts_service()
        return await service.clone_voice(request)
    except Exception as e:
        logger.error(f"Voice cloning failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@tts_router.get("/voices", response_model=List[VoiceConfig])
async def list_voices():
    """List all available cloned voices."""
    return get_tts_service().list_voices()


@tts_router.get("/voices/{voice_id}", response_model=VoiceConfig)
async def get_voice(voice_id: str):
    """Get details of a specific cloned voice."""
    voice = get_tts_service().get_voice(voice_id)
    if not voice:
        raise HTTPException(status_code=404, detail="Voice not found")
    return voice


@tts_router.delete("/voices/{voice_id}")
async def delete_voice(voice_id: str):
    """Delete a cloned voice."""
    success = await get_tts_service().delete_voice(voice_id)
    if not success:
        raise HTTPException(status_code=404, detail="Voice not found")
    return {"status": "deleted", "voice_id": voice_id}


# =============================================================================
# CONFIGURATION
# =============================================================================

@tts_router.get("/engines")
async def list_engines():
    """List available TTS engines with capabilities."""
    return get_tts_service().get_available_engines()


@tts_router.get("/use-cases")
async def get_use_case_recommendations():
    """Get recommended TTS engines for each use case."""
    return get_tts_service().get_use_case_recommendations()


@tts_router.get("/emotions")
async def list_emotions():
    """List available emotions and their descriptions."""
    return {
        "indic_parler": [
            {"name": "happy",        "description": "Cheerful, upbeat tone"},
            {"name": "sad",          "description": "Melancholic, low energy"},
            {"name": "angry",        "description": "Intense, sharp delivery"},
            {"name": "fear",         "description": "Anxious, trembling voice"},
            {"name": "surprise",     "description": "Amazed, rising intonation"},
            {"name": "disgust",      "description": "Disapproving tone"},
            {"name": "neutral",      "description": "Balanced, clear"},
            {"name": "command",      "description": "Authoritative, clear diction"},
            {"name": "news",         "description": "News anchor, professional"},
            {"name": "narration",    "description": "Storytelling, expressive"},
            {"name": "conversation", "description": "Friendly, natural"},
            {"name": "proper_noun",  "description": "Clear pronunciation of names"},
        ],
        "openvoice_v2": [
            {"name": "happy",    "description": "Cheerful"},
            {"name": "sad",      "description": "Slower, lower pitch"},
            {"name": "neutral",  "description": "Balanced delivery"},
            {"name": "excited",  "description": "High energy, fast pace"},
            {"name": "calm",     "description": "Soothing, gentle"},
        ]
    }


@tts_router.get("/languages")
async def list_languages():
    """List supported languages with dialect information."""
    return {
        "ta": {
            "name": "Tamil",
            "native_support": ["indic_parler", "indicf5", "svara", "openvoice_v2"],
            "dialects": [
                {"code": "chennai",     "name": "Chennai/North Tamil Nadu"},
                {"code": "kongu",       "name": "Kongu (Coimbatore)"},
                {"code": "madurai",     "name": "Madurai/Central"},
                {"code": "tirunelveli", "name": "Tirunelveli/Southern"},
                {"code": "standard",    "name": "Standard/Literary"},
            ]
        },
        "hi": {"name": "Hindi",     "native_support": ["indic_parler", "indicf5", "xtts_v2", "openvoice_v2"], "dialects": []},
        "te": {"name": "Telugu",    "native_support": ["indic_parler", "indicf5", "openvoice_v2"], "dialects": []},
        "kn": {"name": "Kannada",   "native_support": ["indic_parler", "indicf5", "openvoice_v2"], "dialects": []},
        "ml": {"name": "Malayalam", "native_support": ["indic_parler", "indicf5", "openvoice_v2"], "dialects": []},
        "en": {"name": "English",   "native_support": ["xtts_v2", "openvoice_v2", "indic_parler"],
               "notes": "Indic Parler-TTS provides Indian English accent"},
        "bn": {"name": "Bengali",   "native_support": ["indic_parler", "indicf5"], "dialects": []},
        "mr": {"name": "Marathi",   "native_support": ["indic_parler", "indicf5"], "dialects": []},
        "gu": {"name": "Gujarati",  "native_support": ["indic_parler", "indicf5"], "dialects": []},
        "pa": {"name": "Punjabi",   "native_support": ["indic_parler", "indicf5"], "dialects": []},
        "or": {"name": "Odia",      "native_support": ["indic_parler", "indicf5"], "dialects": []},
        "as": {"name": "Assamese",  "native_support": ["indic_parler", "indicf5"], "dialects": []},
    }


@tts_router.get("/emotion-mapping")
async def get_emotion_mapping():
    """Get customer emotion → AI response emotion mapping."""
    return EMOTION_RESPONSE_MAPPING


@tts_router.get("/health")
async def tts_health_check():
    """Check health status of TTS engines."""
    return await get_tts_service().health_check()


@tts_router.get("/preview")
async def preview_voice(
    text: str = Query(default="Hello! I am your AI voice assistant. How can I help you today?"),
    voice: str = Query(default="nova"),
    provider: str = Query(default="auto"),
    language: str = Query(default="en"),
):
    """Preview a voice using API-based TTS. Used by Voice Library for playback.

    Returns: {"audio_base64": str, "format": str, "provider": str}
    """
    try:
        from voice_engine.api_providers import synthesize_speech_api
        result = await synthesize_speech_api(
            text=text, language=language, voice_id=voice, provider=provider,
        )
        return result
    except Exception as e:
        logger.error("Voice preview failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
