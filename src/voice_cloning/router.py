"""
Voice Cloning API Router
=========================
POST /api/v1/voice-clone/register    — Upload sample + create clone
POST /api/v1/voice-clone/synthesize  — Generate speech in cloned voice
GET  /api/v1/voice-clone/voices      — List all cloned voices
GET  /api/v1/voice-clone/voices/{id} — Get voice details
DELETE /api/v1/voice-clone/voices/{id} — Delete a cloned voice
POST /api/v1/voice-clone/quality-check — Check audio quality without cloning
"""

import logging
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from voice_cloning.cloner import get_voice_cloner

logger = logging.getLogger(__name__)

voice_clone_router = APIRouter(prefix="/api/v1/voice-clone", tags=["Voice Cloning"])


class SynthesizeRequest(BaseModel):
    voice_id: str
    text: str
    language: str = "en"
    speed: float = 1.0
    provider: str = "auto"


class QualityCheckResponse(BaseModel):
    duration_seconds: float
    snr_db: float
    duration_ok: bool
    snr_ok: bool
    ready: bool
    issues: list


# ── Register (upload + clone) ─────────────────────────────────────

@voice_clone_router.post("/register")
async def register_voice(
    audio_file: UploadFile = File(...),
    voice_name: str = Form("My Voice"),
    tenant_id: str = Form(""),
):
    """Upload audio sample and create a voice clone.

    Requirements:
    - Min 6 seconds audio (30s+ recommended for best quality)
    - WAV/MP3/OGG format
    - Single speaker, quiet room, no background music
    - 15dB+ SNR

    Returns voice_id, quality report, and status.
    """
    audio_bytes = await audio_file.read()

    if len(audio_bytes) < 1000:
        raise HTTPException(status_code=400, detail="Audio file too small")

    ext = "." + (audio_file.filename or "upload.wav").rsplit(".", 1)[-1].lower()
    if ext not in (".wav", ".mp3", ".ogg", ".flac", ".webm", ".m4a"):
        raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}")

    cloner = get_voice_cloner()
    result = cloner.register_voice(
        audio_bytes=audio_bytes,
        voice_name=voice_name,
        file_extension=ext,
        tenant_id=tenant_id,
    )

    return result


# ── Synthesize ─────────────────────────────────────────────────────

@voice_clone_router.post("/synthesize")
async def synthesize(request: SynthesizeRequest):
    """Generate speech in a cloned voice.

    Languages: en (English), hi (Hindi), ta (Tamil), te (Telugu),
               kn (Kannada), ml (Malayalam), bn (Bengali), mr (Marathi)
    """
    cloner = get_voice_cloner()

    if not cloner.get_voice(request.voice_id):
        raise HTTPException(status_code=404, detail="Voice not found")

    try:
        result = cloner.synthesize(
            voice_id=request.voice_id,
            text=request.text,
            language=request.language,
            speed=request.speed,
            provider=request.provider,
        )
        return result
    except Exception as exc:
        logger.error("Synthesis failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ── Quality Check ──────────────────────────────────────────────────

@voice_clone_router.post("/quality-check")
async def quality_check(audio_file: UploadFile = File(...)):
    """Check audio quality without creating a clone.

    Use this to validate a sample before committing to cloning.
    """
    from voice_cloning.preprocessor import AudioPreprocessor
    import tempfile
    import os

    audio_bytes = await audio_file.read()
    ext = "." + (audio_file.filename or "check.wav").rsplit(".", 1)[-1].lower()

    tmp = tempfile.mktemp(suffix=ext)
    with open(tmp, "wb") as f:
        f.write(audio_bytes)

    try:
        preprocessor = AudioPreprocessor()
        result = preprocessor.process(tmp)
        return result["quality"]
    finally:
        os.unlink(tmp)


# ── List / Get / Delete ────────────────────────────────────────────

@voice_clone_router.get("/voices")
async def list_voices(tenant_id: str = ""):
    """List all cloned voices."""
    cloner = get_voice_cloner()
    return {"voices": cloner.list_voices(tenant_id=tenant_id)}


@voice_clone_router.get("/voices/{voice_id}")
async def get_voice(voice_id: str):
    """Get details of a specific cloned voice."""
    cloner = get_voice_cloner()
    voice = cloner.get_voice(voice_id)
    if not voice:
        raise HTTPException(status_code=404, detail="Voice not found")
    return voice


@voice_clone_router.delete("/voices/{voice_id}")
async def delete_voice(voice_id: str):
    """Delete a cloned voice and its embeddings."""
    cloner = get_voice_cloner()
    if not cloner.delete_voice(voice_id):
        raise HTTPException(status_code=404, detail="Voice not found")
    return {"message": "Voice deleted", "voice_id": voice_id}
