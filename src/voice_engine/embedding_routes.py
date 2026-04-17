"""
VoiceFlow AI — Voice Clone API Routes
Wires EmbeddingStore into your existing FastAPI app.

Drop this file into: api/assistant-api/internal/voice/routes.py
Register in main.py: app.include_router(voice_router)
"""

import logging
import time
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .embedding_store import EmbeddingStore, VoiceNotFoundError

logger = logging.getLogger(__name__)
voice_router = APIRouter(prefix="/api/v1/voice-clone", tags=["voice-clone"])


# ─── DEPENDENCY: get store instance ──────────────────────────────────────────
# In your app startup, set app.state.embedding_store = store
def get_store(request) -> EmbeddingStore:
    return request.app.state.embedding_store


# ─── MODELS ───────────────────────────────────────────────────────────────────
class VoiceRegisterResponse(BaseModel):
    voice_id: str
    tenant_id: str
    quality: dict
    message: str

class VoiceSynthRequest(BaseModel):
    voice_id: str
    text: str
    language: str = "ta"
    speed: float = 1.0
    stream: bool = False


# ─── ROUTES ───────────────────────────────────────────────────────────────────

@voice_router.post("/register", response_model=VoiceRegisterResponse)
async def register_voice(
    voice_name: str,
    audio_file: UploadFile = File(...),
    tenant_id: str = Depends(get_current_tenant),  # your existing auth dep
    store: EmbeddingStore = Depends(get_store),
):
    """
    Upload audio sample → extract embedding → persist to all storage layers.
    Audio is preprocessed (noise reduction, SNR check) before extraction.
    """
    import uuid, soundfile as sf, numpy as np, io as _io

    voice_id = str(uuid.uuid4())[:8]
    audio_bytes = await audio_file.read()

    # ── Preprocess
    from voice_engine.preprocessor import AudioPreprocessor
    preprocessor = AudioPreprocessor()
    audio_data, sr = sf.read(_io.BytesIO(audio_bytes))
    processed = preprocessor.process_array(audio_data, sr)
    quality = processed["quality_score"]

    if not quality["ready"]:
        raise HTTPException(
            status_code=400,
            detail=f"Sample quality too low. Duration: {quality['duration']}s "
                   f"(need 6s+), SNR: {quality['snr_db']}dB (need 20dB+)"
        )

    # ── Extract embedding on GPU
    from voice_engine.encoder import get_encoder
    encoder = get_encoder()  # singleton — loaded once at startup

    # Save preprocessed audio to temp buffer
    temp_buf = _io.BytesIO()
    sf.write(temp_buf, processed["audio"], processed["sr"], format="WAV")
    temp_buf.seek(0)

    gpt_cond_latent, speaker_embedding = encoder.extract_embedding_from_bytes(
        temp_buf.read()
    )

    # ── Persist to all 3 layers
    await store.save(
        tenant_id=tenant_id,
        voice_id=voice_id,
        gpt_cond_latent=gpt_cond_latent,
        speaker_embedding=speaker_embedding,
        metadata={
            "voice_name": voice_name,
            "original_filename": audio_file.filename,
            "duration_sec": quality["duration"],
            "snr_db": quality["snr_db"],
            "registered_at": time.time(),
        },
    )

    # ── Persist voice_id to DB (so DPDP erasure can find it)
    await db_insert_voice(tenant_id, voice_id, voice_name)

    return VoiceRegisterResponse(
        voice_id=voice_id,
        tenant_id=tenant_id,
        quality=quality,
        message="Voice clone ready. Embedding persisted across all storage layers.",
    )


@voice_router.post("/synthesize")
async def synthesize(
    req: VoiceSynthRequest,
    tenant_id: str = Depends(get_current_tenant),
    store: EmbeddingStore = Depends(get_store),
):
    """
    Generate speech using a registered voice clone.
    Loads embedding from cache (L1 → L2 → L3 automatically).
    """
    try:
        gpt_cond_latent, speaker_embedding = await store.load(tenant_id, req.voice_id)
    except VoiceNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Voice {req.voice_id} not found. It may have been deleted."
        )

    from voice_engine.synthesizer import synthesize_speech
    audio_bytes = await synthesize_speech(
        text=req.text,
        language=req.language,
        gpt_cond_latent=gpt_cond_latent,
        speaker_embedding=speaker_embedding,
        speed=req.speed,
        stream=req.stream,
    )

    return JSONResponse(
        content={"audio_base64": audio_bytes, "voice_id": req.voice_id},
        headers={"X-Cache-Layer": "L1"},  # add cache layer header for debugging
    )


@voice_router.delete("/{voice_id}")
async def delete_voice(
    voice_id: str,
    tenant_id: str = Depends(get_current_tenant),
    store: EmbeddingStore = Depends(get_store),
):
    """Delete a voice clone from all storage layers."""
    result = await store.delete(tenant_id, voice_id)
    await db_delete_voice(tenant_id, voice_id)

    return {
        "deleted": True,
        "voice_id": voice_id,
        "storage_layers_cleared": result,
    }


@voice_router.get("/metrics")
async def get_store_metrics(
    store: EmbeddingStore = Depends(get_store),
):
    """Debug endpoint — shows cache hit rates and layer availability."""
    return await store.metrics()


# ─── STARTUP / SHUTDOWN LIFECYCLE ────────────────────────────────────────────
"""
Add this to your main FastAPI app (main.py or app.py):

    from voice.embedding_store import EmbeddingStore, StorageConfig
    from voice.routes import voice_router
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # ── STARTUP ──────────────────────────────────
        config = StorageConfig(
            redis_url=os.getenv("REDIS_URL", "redis://localhost:6379/2"),
            s3_bucket=os.getenv("EMBEDDING_S3_BUCKET", "voiceflow-embeddings"),
            s3_endpoint=os.getenv("S3_ENDPOINT", ""),  # empty = AWS
            aws_access_key=os.getenv("AWS_ACCESS_KEY_ID", ""),
            aws_secret_key=os.getenv("AWS_SECRET_ACCESS_KEY", ""),
            aws_region=os.getenv("AWS_REGION", "ap-south-1"),
        )
        store = EmbeddingStore(config)
        await store.connect()
        app.state.embedding_store = store

        yield  # app runs here

        # ── SHUTDOWN ─────────────────────────────────
        # Nothing to teardown — connections close naturally

    app = FastAPI(lifespan=lifespan)
    app.include_router(voice_router)
"""
