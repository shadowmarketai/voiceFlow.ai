"""
DPDP-Compliant Corpus Collection Pipeline
==========================================

Collects training pairs (user audio ↔ agent text) from live calls for
weekly Moshi fine-tuning.  Pipeline stages:

  1. DPDP Consent Check  — skip if user has not granted corpus consent
  2. Quality Filter       — SNR > 20 dB, duration 3–30 s, language confidence > 0.85
  3. Training Pair Build  — bundle audio + metadata as JSON manifest
  4. MinIO/S3 Upload      — organised: corpus/<lang>/<domain>/<call_id>.json
                            audio files: corpus-audio/<lang>/<call_id>_user.wav

Called fire-and-forget from handle_turn() via asyncio.create_task() so it
never adds latency to the voice pipeline.

Environment variables:
  CORPUS_BUCKET            MinIO bucket name (default: voiceflow-corpus)
  CORPUS_MINIO_ENDPOINT    e.g. http://minio:9000 (empty = AWS S3)
  CORPUS_MINIO_ACCESS_KEY
  CORPUS_MINIO_SECRET_KEY
  CORPUS_MIN_SNR_DB        minimum SNR in dB (default: 20)
  CORPUS_MIN_DURATION_S    minimum audio duration in seconds (default: 3)
  CORPUS_MAX_DURATION_S    maximum audio duration in seconds (default: 30)
  CORPUS_MIN_CONF          minimum STT language confidence (default: 0.85)
"""

from __future__ import annotations

import json
import logging
import math
import os
import struct
import uuid
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Config from env
# ──────────────────────────────────────────────────────────────────────────────

_BUCKET = os.getenv("CORPUS_BUCKET", "voiceflow-corpus")
_MINIO_ENDPOINT = os.getenv("CORPUS_MINIO_ENDPOINT", "")
_ACCESS_KEY = os.getenv("CORPUS_MINIO_ACCESS_KEY", os.getenv("AWS_ACCESS_KEY_ID", ""))
_SECRET_KEY = os.getenv("CORPUS_MINIO_SECRET_KEY", os.getenv("AWS_SECRET_ACCESS_KEY", ""))
_REGION = os.getenv("CORPUS_AWS_REGION", "ap-south-1")
_MIN_SNR = float(os.getenv("CORPUS_MIN_SNR_DB", "20"))
_MIN_DUR = float(os.getenv("CORPUS_MIN_DURATION_S", "3"))
_MAX_DUR = float(os.getenv("CORPUS_MAX_DURATION_S", "30"))
_MIN_CONF = float(os.getenv("CORPUS_MIN_CONF", "0.85"))

# Lazy-initialised aioboto3 session (so import stays fast when S3 not configured)
_S3_SESSION: Any = None


def _get_s3_session():
    global _S3_SESSION
    if _S3_SESSION is None:
        try:
            import aioboto3  # type: ignore
            _S3_SESSION = aioboto3.Session(
                aws_access_key_id=_ACCESS_KEY,
                aws_secret_access_key=_SECRET_KEY,
                region_name=_REGION,
            )
        except ImportError:
            logger.warning("corpus_collector: aioboto3 not installed — uploads disabled")
    return _S3_SESSION


# ──────────────────────────────────────────────────────────────────────────────
# Stage 1 — DPDP consent check
# ──────────────────────────────────────────────────────────────────────────────

async def _has_corpus_consent(user_id: str | None, tenant_id: str | None) -> bool:
    """Return True only if an active corpus-collection consent record exists."""
    if not user_id:
        return False
    try:
        from sqlalchemy import and_, select

        from api.database import get_async_session
        from api.models.dpdp import ConsentRecord

        async for session in get_async_session():
            stmt = (
                select(ConsentRecord)
                .where(
                    and_(
                        ConsentRecord.user_id == user_id,
                        ConsentRecord.purpose == "corpus_collection",
                        ConsentRecord.granted.is_(True),
                        ConsentRecord.revoked_at.is_(None),
                    )
                )
                .limit(1)
            )
            result = await session.execute(stmt)
            row = result.scalar_one_or_none()
            return row is not None
    except Exception:
        logger.debug("corpus_collector: consent check failed — skipping", exc_info=True)
        return False


# ──────────────────────────────────────────────────────────────────────────────
# Stage 2 — Quality filter
# ──────────────────────────────────────────────────────────────────────────────

def _parse_wav_duration(audio_bytes: bytes) -> float:
    """Return duration in seconds for a WAV byte blob; fallback -1 on error."""
    try:
        # Minimal WAV header parse — fmt chunk starts at byte 12
        if audio_bytes[:4] != b"RIFF":
            # Not WAV — estimate from raw size (16-bit 16kHz mono)
            return len(audio_bytes) / (2 * 16000)
        # fmt chunk: num_channels@22, sample_rate@24, bits_per_sample@34, data size in data chunk
        num_channels = struct.unpack_from("<H", audio_bytes, 22)[0]
        sample_rate = struct.unpack_from("<I", audio_bytes, 24)[0]
        bits_per_sample = struct.unpack_from("<H", audio_bytes, 34)[0]
        bytes_per_sample = bits_per_sample // 8

        # Walk chunks looking for "data"
        offset = 12
        while offset + 8 <= len(audio_bytes):
            chunk_id = audio_bytes[offset:offset + 4]
            chunk_size = struct.unpack_from("<I", audio_bytes, offset + 4)[0]
            if chunk_id == b"data":
                num_frames = chunk_size // (num_channels * bytes_per_sample)
                return num_frames / sample_rate
            offset += 8 + chunk_size
        return -1
    except Exception:
        return -1


def _estimate_snr_db(audio_bytes: bytes) -> float:
    """
    Rough SNR estimate: RMS of loudest 10% of frames vs quietest 10%.
    Returns SNR in dB; -inf on failure.
    """
    try:
        import numpy as np

        # Strip WAV header if present
        if audio_bytes[:4] == b"RIFF":
            # data chunk payload starts after the header
            offset = 12
            payload = b""
            while offset + 8 <= len(audio_bytes):
                chunk_id = audio_bytes[offset:offset + 4]
                chunk_size = struct.unpack_from("<I", audio_bytes, offset + 4)[0]
                if chunk_id == b"data":
                    payload = audio_bytes[offset + 8: offset + 8 + chunk_size]
                    break
                offset += 8 + chunk_size
        else:
            payload = audio_bytes

        samples = np.frombuffer(payload, dtype=np.int16).astype(np.float32)
        if len(samples) < 160:
            return -1.0

        frame_size = 160  # 10ms @ 16kHz
        frames = [samples[i:i + frame_size] for i in range(0, len(samples) - frame_size, frame_size)]
        rms_vals = [math.sqrt(max(float(np.mean(f ** 2)), 1e-10)) for f in frames]
        rms_vals.sort()
        n10 = max(1, len(rms_vals) // 10)
        signal_rms = float(np.mean(rms_vals[-n10:]))
        noise_rms = float(np.mean(rms_vals[:n10]))
        if noise_rms < 1e-10:
            return 60.0
        return 20.0 * math.log10(signal_rms / noise_rms)
    except Exception:
        return -1.0


def _quality_filter(
    audio_bytes: bytes,
    language_confidence: float,
) -> tuple[bool, str]:
    """
    Returns (passes, reason_if_failed).
    """
    duration = _parse_wav_duration(audio_bytes)
    if duration != -1 and duration < _MIN_DUR:
        return False, f"duration {duration:.1f}s < {_MIN_DUR}s"
    if duration != -1 and duration > _MAX_DUR:
        return False, f"duration {duration:.1f}s > {_MAX_DUR}s"

    snr = _estimate_snr_db(audio_bytes)
    if snr != -1 and snr < _MIN_SNR:
        return False, f"SNR {snr:.1f} dB < {_MIN_SNR} dB"

    if language_confidence > 0 and language_confidence < _MIN_CONF:
        return False, f"lang confidence {language_confidence:.2f} < {_MIN_CONF}"

    return True, ""


# ──────────────────────────────────────────────────────────────────────────────
# Stage 3 — Training pair builder
# ──────────────────────────────────────────────────────────────────────────────

def _build_training_pair(
    call_id: str,
    user_audio_bytes: bytes,
    agent_text: str,
    language: str,
    domain: str,
    stt_transcript: str,
    stt_confidence: float,
    duration_s: float,
    snr_db: float,
) -> dict:
    return {
        "schema_version": "1.0",
        "call_id": call_id,
        "collected_at": datetime.now(UTC).isoformat(),
        "language": language,
        "domain": domain,
        "user_turn": {
            "audio_key": f"corpus-audio/{language}/{call_id}_user.wav",
            "transcript": stt_transcript,
            "duration_s": round(duration_s, 3),
            "snr_db": round(snr_db, 2),
            "language_confidence": round(stt_confidence, 4),
        },
        "agent_turn": {
            "text": agent_text,
        },
        "quality": {
            "passes_snr": snr_db >= _MIN_SNR,
            "passes_duration": _MIN_DUR <= duration_s <= _MAX_DUR,
            "passes_confidence": stt_confidence >= _MIN_CONF,
        },
    }


# ──────────────────────────────────────────────────────────────────────────────
# Stage 4 — MinIO / S3 upload
# ──────────────────────────────────────────────────────────────────────────────

async def _upload_pair(
    call_id: str,
    language: str,
    domain: str,
    manifest: dict,
    user_audio_bytes: bytes,
) -> bool:
    session = _get_s3_session()
    if session is None:
        logger.debug("corpus_collector: no S3 session — skipping upload")
        return False

    manifest_key = f"corpus/{language}/{domain}/{call_id}.json"
    audio_key = f"corpus-audio/{language}/{call_id}_user.wav"

    extra_kwargs: dict = {}
    if _MINIO_ENDPOINT:
        extra_kwargs["endpoint_url"] = _MINIO_ENDPOINT

    try:
        async with session.client("s3", **extra_kwargs) as s3:
            # Ensure bucket exists (MinIO: create if missing)
            try:
                await s3.head_bucket(Bucket=_BUCKET)
            except Exception:
                await s3.create_bucket(Bucket=_BUCKET)

            # Upload manifest JSON
            await s3.put_object(
                Bucket=_BUCKET,
                Key=manifest_key,
                Body=json.dumps(manifest, ensure_ascii=False).encode("utf-8"),
                ContentType="application/json",
            )

            # Upload raw WAV
            await s3.put_object(
                Bucket=_BUCKET,
                Key=audio_key,
                Body=user_audio_bytes,
                ContentType="audio/wav",
            )

        logger.info("corpus_collector: saved %s (%s/%s)", call_id, language, domain)
        return True

    except Exception:
        logger.warning("corpus_collector: upload failed for %s", call_id, exc_info=True)
        return False


# ──────────────────────────────────────────────────────────────────────────────
# Public entry point
# ──────────────────────────────────────────────────────────────────────────────

async def collect(
    *,
    user_audio_bytes: bytes,
    agent_text: str,
    language: str,
    stt_result: dict,
    user_id: str | None = None,
    tenant_id: str | None = None,
    domain: str = "general",
) -> None:
    """
    Fire-and-forget corpus collection for a single call turn.

    Args:
        user_audio_bytes:  Raw audio from the user (WAV preferred, but any format works)
        agent_text:        Final LLM response text
        language:          Detected language code (e.g. "hi", "ta", "en")
        stt_result:        dict with at least {"transcript": str, "confidence": float}
        user_id:           User identifier for DPDP consent lookup
        tenant_id:         Tenant identifier for DPDP consent lookup
        domain:            Call domain / use-case label (e.g. "real_estate", "support")
    """
    try:
        # Stage 1: DPDP consent
        if not await _has_corpus_consent(user_id, tenant_id):
            return

        transcript = stt_result.get("transcript", "") or ""
        confidence = float(stt_result.get("confidence", 0.0) or 0.0)

        # Stage 2: Quality filter
        passes, reason = _quality_filter(user_audio_bytes, confidence)
        if not passes:
            logger.debug("corpus_collector: filtered (%s)", reason)
            return

        duration = _parse_wav_duration(user_audio_bytes)
        snr = _estimate_snr_db(user_audio_bytes)
        call_id = str(uuid.uuid4())
        lang_short = (language or "un")[:5].lower()

        # Stage 3: Build training pair
        manifest = _build_training_pair(
            call_id=call_id,
            user_audio_bytes=user_audio_bytes,
            agent_text=agent_text,
            language=lang_short,
            domain=domain,
            stt_transcript=transcript,
            stt_confidence=confidence,
            duration_s=max(duration, 0),
            snr_db=max(snr, 0),
        )

        # Stage 4: Upload
        await _upload_pair(
            call_id=call_id,
            language=lang_short,
            domain=domain,
            manifest=manifest,
            user_audio_bytes=user_audio_bytes,
        )

    except Exception:
        # Never let corpus collection crash the voice pipeline
        logger.warning("corpus_collector: unexpected error", exc_info=True)
