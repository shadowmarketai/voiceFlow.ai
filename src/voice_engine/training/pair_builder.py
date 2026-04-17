"""
Training Pair Builder — Track A calls → Moshi S2S training pairs
================================================================
NumPy/soundfile-based implementation for production corpus building.
Uses librosa for pitch-shift if available; falls back to WAV header trick.

Usage (3 lines at end of every Track A call):

    from voice_engine.training.pair_builder import extract_pairs_from_vad, save_pairs_to_corpus

    pairs = extract_pairs_from_vad(
        user_audio_np, agent_audio_np,
        vad_segments,
        {"language": detected_language, "domain": agent_config["domain"]},
    )
    asyncio.create_task(save_pairs_to_corpus(pairs, corpus_root, call_id, dpdp_consent))

VAD segments format (from Deepgram diarization):
    [{"start": 1.2, "end": 3.4, "speaker": "user", "transcript": "..."}]

The async version (save_pairs_to_minio) uploads directly to MinIO/S3
and can be used instead of local filesystem storage.

Environment variables:
    CORPUS_ROOT            local fallback path (default: /data/corpus)
    TRAINING_S3_BUCKET     MinIO training bucket (default: voiceflow-training)
    CORPUS_MINIO_ENDPOINT  e.g. http://minio:9000
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import json
import logging
import os
import time
import uuid
import wave
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

SR = 16000
_CORPUS_ROOT = os.getenv("CORPUS_ROOT", "/data/corpus")
_MIN_DUR_S   = 2.0
_MAX_DUR_S   = 30.0
_MIN_SNR_DB  = 18.0
_MAX_SILENCE = 0.70


# ─────────────────────────────────────────────────────────────────────────────
# Data class
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class TrainingPair:
    user_audio:        bytes          # WAV bytes
    agent_audio:       bytes          # WAV bytes
    user_transcript:   str
    agent_transcript:  str
    language:          str
    domain:            str
    duration_sec:      float
    quality_score:     float
    pair_id:           str = field(default_factory=lambda: str(uuid.uuid4())[:12])


# ─────────────────────────────────────────────────────────────────────────────
# Audio quality helpers (numpy optional — pure-Python fallback)
# ─────────────────────────────────────────────────────────────────────────────

def _load_wav_np(wav_bytes: bytes):
    """Load WAV bytes as numpy float32 array at SR=16000. Returns array or None."""
    try:
        import numpy as np
        import soundfile as sf
        arr, rate = sf.read(io.BytesIO(wav_bytes), dtype="float32", always_2d=False)
        if rate != SR:
            try:
                import resampy
                arr = resampy.resample(arr, rate, SR)
            except ImportError:
                pass  # use as-is (rate mismatch tolerated for quality checks)
        return arr
    except Exception:
        return None


def _compute_snr_np(audio) -> float:
    try:
        import numpy as np
        signal = float(np.mean(audio ** 2))
        noise  = float(np.percentile(np.abs(audio), 5) ** 2)
        return 10 * float(np.log10((signal + 1e-10) / (noise + 1e-10)))
    except Exception:
        return 25.0  # assume acceptable if numpy unavailable


def _silence_ratio_np(audio) -> float:
    try:
        import numpy as np
        return float(np.sum(np.abs(audio) < 0.01)) / max(1, len(audio))
    except Exception:
        return 0.3


def _is_quality_ok(wav_bytes: bytes) -> tuple[bool, float]:
    dur = _wav_duration(wav_bytes)
    if dur < _MIN_DUR_S or dur > _MAX_DUR_S:
        return False, 0.0

    audio = _load_wav_np(wav_bytes)
    if audio is None:
        return True, 0.7  # can't check, assume ok

    snr = _compute_snr_np(audio)
    if snr < _MIN_SNR_DB:
        return False, 0.0

    silence = _silence_ratio_np(audio)
    if silence > _MAX_SILENCE:
        return False, 0.0

    score = min(1.0, snr / 40) * 0.6 + (1.0 - silence) * 0.4
    return True, round(score, 3)


def _wav_duration(wav_bytes: bytes) -> float:
    try:
        with wave.open(io.BytesIO(wav_bytes)) as wf:
            return wf.getnframes() / wf.getframerate()
    except Exception:
        return max(0.0, (len(wav_bytes) - 44) / (SR * 2))


def _slice_wav_from_np(audio_np, start_s: float, end_s: float) -> bytes | None:
    """Slice a numpy float32 audio array to a WAV bytes segment."""
    try:
        import numpy as np
        import soundfile as sf
        s_idx = int(start_s * SR)
        e_idx = int(end_s   * SR)
        sliced = audio_np[s_idx:e_idx]
        if len(sliced) == 0:
            return None
        buf = io.BytesIO()
        sf.write(buf, sliced, SR, format="WAV", subtype="PCM_16")
        return buf.getvalue()
    except Exception as exc:
        logger.debug("WAV slice error: %s", exc)
        return None


def _anonymise_audio(wav_bytes: bytes) -> bytes:
    """Pitch-shift ±2 semitones to prevent voice re-identification."""
    try:
        import librosa
        import numpy as np
        import soundfile as sf
        import random
        audio_np, rate = librosa.load(io.BytesIO(wav_bytes), sr=SR, mono=True)
        shift    = random.uniform(-2.0, 2.0)
        shifted  = librosa.effects.pitch_shift(audio_np, sr=rate, n_steps=shift)
        buf = io.BytesIO()
        sf.write(buf, shifted, rate, format="WAV", subtype="PCM_16")
        return buf.getvalue()
    except ImportError:
        # librosa not installed — use header-only pitch shift (DPDP compliant)
        return _pitch_shift_header(wav_bytes)
    except Exception as exc:
        logger.debug("Pitch shift error: %s", exc)
        return wav_bytes


def _pitch_shift_header(wav_bytes: bytes) -> bytes:
    """Lightweight pitch shift: changes sample rate header by ±2 semitones."""
    import random
    shift  = random.choice([-2, -1, 1, 2])
    factor = 2 ** (shift / 12)
    try:
        with wave.open(io.BytesIO(wav_bytes)) as wf:
            params = wf.getparams()
            frames = wf.readframes(wf.getnframes())
        buf = io.BytesIO()
        with wave.open(buf, "wb") as out:
            out.setparams(params._replace(framerate=int(params.framerate * factor)))
            out.writeframes(frames)
        return buf.getvalue()
    except Exception:
        return wav_bytes


# ─────────────────────────────────────────────────────────────────────────────
# Core extraction
# ─────────────────────────────────────────────────────────────────────────────

def extract_pairs_from_vad(
    user_audio_bytes: bytes,
    agent_audio_bytes: bytes,
    vad_segments: list[dict],
    metadata: dict,
) -> list[TrainingPair]:
    """
    Split a full call into user↔agent training pairs using VAD timestamps.

    Args:
        user_audio_bytes:  full call user audio as WAV bytes
        agent_audio_bytes: full call agent audio as WAV bytes
        vad_segments: list of {"start": float, "end": float, "speaker": str, "transcript": str}
        metadata: {"language": str, "domain": str}

    Returns list of TrainingPair (max 8 per call, quality-filtered).
    """
    try:
        import numpy as np
        import soundfile as sf
        user_np, _  = sf.read(io.BytesIO(user_audio_bytes),  dtype="float32", always_2d=False)
        agent_np, _ = sf.read(io.BytesIO(agent_audio_bytes), dtype="float32", always_2d=False)
        use_numpy = True
    except Exception:
        user_np  = None
        agent_np = None
        use_numpy = False

    language = metadata.get("language", "ta")
    domain   = metadata.get("domain",   "general")
    pairs: list[TrainingPair] = []

    user_segs  = [s for s in vad_segments if s.get("speaker") == "user"]
    agent_segs = [s for s in vad_segments if s.get("speaker") == "agent"]

    for user_seg in user_segs[:12]:  # process up to 12 user turns
        agent_resp = next(
            (a for a in agent_segs if a.get("start", 0) >= user_seg.get("end", 0)),
            None,
        )
        if agent_resp is None:
            continue

        if use_numpy:
            u_wav = _slice_wav_from_np(user_np,  user_seg["start"],  user_seg["end"])
            a_wav = _slice_wav_from_np(agent_np, agent_resp["start"], agent_resp["end"])
        else:
            u_wav = None
            a_wav = None

        if not u_wav or not a_wav:
            continue

        u_ok, u_score = _is_quality_ok(u_wav)
        a_ok, a_score = _is_quality_ok(a_wav)
        if not (u_ok and a_ok):
            continue

        u_dur = _wav_duration(u_wav)
        a_dur = _wav_duration(a_wav)

        pairs.append(TrainingPair(
            user_audio       = _anonymise_audio(u_wav),
            agent_audio      = a_wav,
            user_transcript  = user_seg.get("transcript", ""),
            agent_transcript = agent_resp.get("transcript", ""),
            language         = language,
            domain           = domain,
            duration_sec     = round(u_dur + a_dur, 2),
            quality_score    = round((u_score + a_score) / 2, 3),
        ))

        if len(pairs) >= 8:
            break

    logger.info(
        "[PairBuilder] extracted %d pairs (lang=%s domain=%s)",
        len(pairs), language, domain,
    )
    return pairs


# ─────────────────────────────────────────────────────────────────────────────
# Local filesystem save
# ─────────────────────────────────────────────────────────────────────────────

async def save_pairs_to_corpus(
    pairs: list[TrainingPair],
    corpus_root: str = _CORPUS_ROOT,
    call_id: str = "",
    consent_given: bool = True,
) -> int:
    """
    Save training pairs to a local directory structure:
        corpus_root/<language>/<domain>/<pair_id>/user.wav
        corpus_root/<language>/<domain>/<pair_id>/agent.wav
        corpus_root/<language>/<domain>/<pair_id>/meta.json

    Returns number of pairs saved.
    """
    if not consent_given:
        logger.info("[PairBuilder] Skipping %s — no consent", call_id)
        return 0

    saved = 0
    loop  = asyncio.get_event_loop()

    for pair in pairs:
        def _write(p=pair):
            lang_dir = os.path.join(corpus_root, p.language, p.domain, p.pair_id)
            os.makedirs(lang_dir, exist_ok=True)

            with open(os.path.join(lang_dir, "user.wav"),  "wb") as f:
                f.write(p.user_audio)
            with open(os.path.join(lang_dir, "agent.wav"), "wb") as f:
                f.write(p.agent_audio)

            meta = {
                "pair_id":          p.pair_id,
                "call_id":          hashlib.sha256((call_id or "").encode()).hexdigest()[:12],
                "language":         p.language,
                "domain":           p.domain,
                "user_transcript":  p.user_transcript,
                "agent_transcript": p.agent_transcript,
                "duration_sec":     p.duration_sec,
                "quality_score":    p.quality_score,
                "created_at":       time.time(),
                "schema_version":   "1",
            }
            with open(os.path.join(lang_dir, "meta.json"), "w", encoding="utf-8") as f:
                json.dump(meta, f, ensure_ascii=False, indent=2)
            return True

        try:
            await loop.run_in_executor(None, _write)
            saved += 1
        except Exception as exc:
            logger.warning("[PairBuilder] Save failed for pair %s: %s", pair.pair_id, exc)

    logger.info("[PairBuilder] call=%s saved %d/%d pairs to %s", call_id, saved, len(pairs), corpus_root)
    return saved


# ─────────────────────────────────────────────────────────────────────────────
# MinIO/S3 async save
# ─────────────────────────────────────────────────────────────────────────────

async def save_pairs_to_minio(
    pairs: list[TrainingPair],
    call_id: str = "",
    consent_given: bool = True,
    bucket: str | None = None,
) -> int:
    """
    Upload training pairs directly to MinIO/S3 (production path).
    Falls back to local filesystem if aioboto3 not installed.
    """
    if not consent_given:
        return 0

    _bucket   = bucket or os.getenv("TRAINING_S3_BUCKET", "voiceflow-training")
    _endpoint = os.getenv("CORPUS_MINIO_ENDPOINT", "")
    _ak       = os.getenv("CORPUS_MINIO_ACCESS_KEY", os.getenv("AWS_ACCESS_KEY_ID", ""))
    _sk       = os.getenv("CORPUS_MINIO_SECRET_KEY", os.getenv("AWS_SECRET_ACCESS_KEY", ""))

    try:
        import aioboto3
    except ImportError:
        logger.info("[PairBuilder] aioboto3 not installed — saving locally instead")
        return await save_pairs_to_corpus(pairs, _CORPUS_ROOT, call_id, consent_given)

    session = aioboto3.Session()
    saved   = 0

    for pair in pairs:
        prefix = (
            f"training-corpus/{pair.language}/{pair.domain}/"
            f"{hashlib.sha256((call_id or '').encode()).hexdigest()[:12]}/{pair.pair_id}"
        )
        meta = {
            "pair_id":          pair.pair_id,
            "call_id":          hashlib.sha256((call_id or "").encode()).hexdigest()[:12],
            "language":         pair.language,
            "domain":           pair.domain,
            "user_transcript":  pair.user_transcript,
            "agent_transcript": pair.agent_transcript,
            "duration_sec":     pair.duration_sec,
            "quality_score":    pair.quality_score,
            "created_at":       time.time(),
            "schema_version":   "1",
        }
        try:
            async with session.client(
                "s3",
                endpoint_url=_endpoint or None,
                aws_access_key_id=_ak,
                aws_secret_access_key=_sk,
            ) as s3:
                try:
                    await s3.head_bucket(Bucket=_bucket)
                except Exception:
                    await s3.create_bucket(Bucket=_bucket)

                await asyncio.gather(
                    s3.put_object(Bucket=_bucket, Key=f"{prefix}/user.wav",
                                  Body=pair.user_audio, ContentType="audio/wav"),
                    s3.put_object(Bucket=_bucket, Key=f"{prefix}/agent.wav",
                                  Body=pair.agent_audio, ContentType="audio/wav"),
                    s3.put_object(Bucket=_bucket, Key=f"{prefix}/meta.json",
                                  Body=json.dumps(meta, ensure_ascii=False).encode(),
                                  ContentType="application/json"),
                )
            saved += 1
        except Exception as exc:
            logger.warning("[PairBuilder] MinIO upload failed for pair %s: %s", pair.pair_id, exc)

    logger.info("[PairBuilder] call=%s uploaded %d/%d pairs to MinIO", call_id, saved, len(pairs))
    return saved
