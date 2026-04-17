"""
Voice Cloning API Router — W10 GA
===================================
POST /api/v1/voice-clone/register    — Upload sample + create clone
POST /api/v1/voice-clone/synthesize  — Generate speech in cloned voice
GET  /api/v1/voice-clone/voices      — List all cloned voices (tenant-isolated)
GET  /api/v1/voice-clone/voices/{id} — Get voice details
DELETE /api/v1/voice-clone/voices/{id} — Delete a cloned voice
POST /api/v1/voice-clone/quality-check — Check audio quality without cloning
POST /api/v1/voice-clone/elevenlabs-clone — Clone via ElevenLabs API (Pro)
"""

import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from voice_cloning.cloner import get_voice_cloner

logger = logging.getLogger(__name__)

voice_clone_router = APIRouter(prefix="/api/v1/voice-clone", tags=["Voice Cloning"])


def _get_user():
    """Optional auth — returns user dict or empty dict for backwards compat."""
    try:
        from api.dependencies import get_current_active_user
        return Depends(get_current_active_user)
    except Exception:
        return None


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
    language: str = Form("en"),
    description: str = Form(""),
):
    """Upload audio sample and create a voice clone.

    Requirements:
    - Min 6 seconds audio (30s+ recommended for best quality)
    - WAV/MP3/OGG format
    - Single speaker, quiet room, no background music
    - 15dB+ SNR

    Returns voice_id, quality report, and status.
    W10 — now persists to the voice_library DB table.
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

    # W10 — persist to DB for cross-restart survival + tenant isolation
    try:
        from api.services.voice_library import save_voice
        save_voice(
            voice_id=result.get("voice_id", ""),
            voice_name=voice_name,
            tenant_id=tenant_id,
            provider=result.get("provider", "local"),
            sample_path=result.get("sample_path"),
            embedding_path=result.get("embedding_path"),
            language=language,
            quality_snr_db=result.get("quality", {}).get("snr_db"),
            quality_duration_s=result.get("quality", {}).get("duration_seconds"),
            description=description,
        )
    except Exception as exc:
        logger.warning("voice_library save failed (voice still usable): %s", exc)

    return result


@voice_clone_router.post("/elevenlabs-clone")
async def elevenlabs_clone(
    audio_file: UploadFile = File(...),
    voice_name: str = Form("My Voice"),
    tenant_id: str = Form(""),
    language: str = Form("en"),
    description: str = Form(""),
):
    """Clone via ElevenLabs 'Add Voice' API (Pro tier).

    Sends the audio directly to ElevenLabs, gets back a voice_id that
    can be used with their TTS. Higher quality than local cloning.
    Requires ELEVENLABS_API_KEY.
    """
    import httpx

    api_key = os.environ.get("ELEVENLABS_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="ELEVENLABS_API_KEY not configured")

    audio_bytes = await audio_file.read()
    if len(audio_bytes) < 1000:
        raise HTTPException(status_code=400, detail="Audio file too small")

    filename = audio_file.filename or "sample.wav"

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.elevenlabs.io/v1/voices/add",
                headers={"xi-api-key": api_key},
                data={"name": voice_name, "description": description or f"Cloned for tenant {tenant_id}"},
                files={"files": (filename, audio_bytes)},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"ElevenLabs API error: {exc.response.text[:200]}",
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"ElevenLabs clone failed: {str(exc)[:200]}")

    el_voice_id = data.get("voice_id", "")

    # Persist to library
    try:
        from api.services.voice_library import save_voice
        save_voice(
            voice_id=f"el_{el_voice_id[:20]}",
            voice_name=voice_name,
            tenant_id=tenant_id,
            provider="elevenlabs",
            provider_voice_id=el_voice_id,
            language=language,
            description=description,
        )
    except Exception as exc:
        logger.warning("voice_library save failed: %s", exc)

    return {
        "voice_id": el_voice_id,
        "voice_name": voice_name,
        "provider": "elevenlabs",
        "status": "ready",
    }


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
    """List all cloned voices (W10 — tenant-isolated, DB-backed)."""
    # Prefer DB source; fall back to in-memory for backwards compat
    try:
        from api.services.voice_library import list_voices as db_list
        db_voices = db_list(tenant_id=tenant_id)
        if db_voices:
            return {"voices": db_voices, "source": "db"}
    except Exception:
        pass
    cloner = get_voice_cloner()
    return {"voices": cloner.list_voices(tenant_id=tenant_id), "source": "memory"}


@voice_clone_router.get("/voices/{voice_id}")
async def get_voice(voice_id: str):
    """Get details of a specific cloned voice."""
    try:
        from api.services.voice_library import get_voice as db_get
        v = db_get(voice_id)
        if v:
            return v
    except Exception:
        pass
    cloner = get_voice_cloner()
    voice = cloner.get_voice(voice_id)
    if not voice:
        raise HTTPException(status_code=404, detail="Voice not found")
    return voice


@voice_clone_router.delete("/voices/{voice_id}")
async def delete_voice(voice_id: str, tenant_id: str = ""):
    """Delete a cloned voice and its embeddings."""
    # Soft-delete in DB
    try:
        from api.services.voice_library import delete_voice as db_del
        db_del(voice_id, tenant_id)
    except Exception:
        pass
    # Also remove from in-memory registry
    cloner = get_voice_cloner()
    cloner.delete_voice(voice_id)
    return {"message": "Voice deleted", "voice_id": voice_id}
