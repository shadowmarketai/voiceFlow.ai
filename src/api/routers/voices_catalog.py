"""
Real voice catalog — fetches live voices from ElevenLabs, Cartesia, Sarvam, Edge.

Endpoint: GET /api/v1/voices/catalog?language=ta

Replaces the hardcoded 9-voice list in src/api/routers/voice.py.
Aggregates from every provider with a configured API key. Caches
results in memory for 30 minutes since voice catalogs rarely change.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/voices", tags=["voices"])

_CACHE: dict[str, tuple[float, list[dict]]] = {}
_CACHE_TTL_SEC = 30 * 60

_EDGE_VOICES: list[dict] = [
    {"id": "en-IN-NeerjaNeural",   "name": "Neerja",   "engine": "edge", "language": "en", "gender": "female", "accent": "indian"},
    {"id": "en-IN-PrabhatNeural",  "name": "Prabhat",  "engine": "edge", "language": "en", "gender": "male",   "accent": "indian"},
    {"id": "hi-IN-SwaraNeural",    "name": "Swara",    "engine": "edge", "language": "hi", "gender": "female", "accent": "indian"},
    {"id": "hi-IN-MadhurNeural",   "name": "Madhur",   "engine": "edge", "language": "hi", "gender": "male",   "accent": "indian"},
    {"id": "ta-IN-PallaviNeural",  "name": "Pallavi",  "engine": "edge", "language": "ta", "gender": "female", "accent": "indian"},
    {"id": "ta-IN-ValluvarNeural", "name": "Valluvar", "engine": "edge", "language": "ta", "gender": "male",   "accent": "indian"},
    {"id": "te-IN-ShrutiNeural",   "name": "Shruti",   "engine": "edge", "language": "te", "gender": "female", "accent": "indian"},
    {"id": "te-IN-MohanNeural",    "name": "Mohan",    "engine": "edge", "language": "te", "gender": "male",   "accent": "indian"},
    {"id": "kn-IN-SapnaNeural",    "name": "Sapna",    "engine": "edge", "language": "kn", "gender": "female", "accent": "indian"},
    {"id": "kn-IN-GaganNeural",    "name": "Gagan",    "engine": "edge", "language": "kn", "gender": "male",   "accent": "indian"},
    {"id": "ml-IN-SobhanaNeural",  "name": "Sobhana",  "engine": "edge", "language": "ml", "gender": "female", "accent": "indian"},
    {"id": "ml-IN-MidhunNeural",   "name": "Midhun",   "engine": "edge", "language": "ml", "gender": "male",   "accent": "indian"},
    {"id": "bn-IN-TanishaaNeural", "name": "Tanishaa", "engine": "edge", "language": "bn", "gender": "female", "accent": "indian"},
    {"id": "mr-IN-AarohiNeural",   "name": "Aarohi",   "engine": "edge", "language": "mr", "gender": "female", "accent": "indian"},
    {"id": "gu-IN-DhwaniNeural",   "name": "Dhwani",   "engine": "edge", "language": "gu", "gender": "female", "accent": "indian"},
]
for v in _EDGE_VOICES:
    v.update({"description": f"{v['gender'].title()} Indian voice (free)", "preview_url": None, "tier": "free"})

_SARVAM_VOICES: list[dict] = [
    {"id": "meera",    "name": "Meera",    "gender": "female", "description": "warm, conversational"},
    {"id": "pavithra", "name": "Pavithra", "gender": "female", "description": "energetic, youthful"},
    {"id": "maitreyi", "name": "Maitreyi", "gender": "female", "description": "calm, professional"},
    {"id": "arvind",   "name": "Arvind",   "gender": "male",   "description": "authoritative, deep"},
    {"id": "amol",     "name": "Amol",     "gender": "male",   "description": "friendly, casual"},
    {"id": "amartya",  "name": "Amartya",  "gender": "male",   "description": "narrative, clear"},
]
_SARVAM_LANGS = ["hi", "ta", "te", "kn", "ml", "bn", "mr", "gu", "pa", "or", "en"]


def _norm_lang(code: str | None) -> str | None:
    if not code:
        return None
    return code.lower().split("-")[0][:2]


async def _fetch_elevenlabs_voices(api_key: str) -> list[dict]:
    """ElevenLabs GET /v1/voices — returns full library + cloned voices."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                "https://api.elevenlabs.io/v1/voices",
                headers={"xi-api-key": api_key},
            )
            r.raise_for_status()
            data = r.json()
    except Exception as exc:
        logger.warning("ElevenLabs voice fetch failed: %s", exc)
        return []

    out: list[dict] = []
    for v in data.get("voices", []):
        labels = v.get("labels") or {}
        out.append({
            "id":          v["voice_id"],
            "name":        v["name"],
            "engine":      "elevenlabs",
            "language":    "en",
            "_supports":   ["en", "hi", "ta", "te", "kn", "ml", "bn", "mr",
                            "gu", "pa", "or", "ur", "ar", "es", "fr",
                            "de", "ja", "ko", "zh", "ru", "it", "pt"],
            "gender":      labels.get("gender") or "female",
            "accent":      labels.get("accent")  or "american",
            "description": (labels.get("description") or "").lower() or v.get("description", ""),
            "preview_url": v.get("preview_url"),
            "tier":        "premium",
        })
    return out


async def _fetch_cartesia_voices(api_key: str) -> list[dict]:
    """Cartesia Sonic GET /voices — returns hosted + custom voices."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                "https://api.cartesia.ai/voices",
                headers={"X-API-Key": api_key, "Cartesia-Version": "2024-06-10"},
            )
            r.raise_for_status()
            data = r.json()
    except Exception as exc:
        logger.warning("Cartesia voice fetch failed: %s", exc)
        return []

    out: list[dict] = []
    raw = data if isinstance(data, list) else data.get("voices", [])
    for v in raw:
        lang = _norm_lang(v.get("language")) or "en"
        out.append({
            "id":          v.get("id", ""),
            "name":        v.get("name", "Unnamed"),
            "engine":      "cartesia",
            "language":    lang,
            "gender":      (v.get("gender") or "neutral").lower(),
            "accent":      v.get("accent") or "",
            "description": v.get("description") or "Sonic voice",
            "preview_url": v.get("preview_audio_url"),
            "tier":        "premium",
        })
    return out


def _expand_sarvam(api_key: str) -> list[dict]:
    """Expand the 6 Sarvam voices across the 11 supported Indic languages."""
    if not api_key:
        return []
    out: list[dict] = []
    for v in _SARVAM_VOICES:
        for lang in _SARVAM_LANGS:
            out.append({
                "id":          v["id"],
                "name":        v["name"],
                "engine":      "sarvam",
                "language":    lang,
                "gender":      v["gender"],
                "accent":      "indian",
                "description": v["description"] + " — Sarvam Bulbul TTS",
                "preview_url": None,
                "tier":        "premium",
            })
    return out


@router.get("/catalog")
async def voices_catalog(
    language: str | None = Query(None, description="Filter by ISO code (en, ta, hi, ...)"),
    engine: str | None = Query(None, description="Filter by engine"),
    refresh: bool = Query(False, description="Bypass cache and refetch from providers"),
):
    """Aggregated voice catalog from every configured TTS provider."""
    cache_key = "all"
    now = time.time()

    if not refresh and cache_key in _CACHE:
        ts, voices = _CACHE[cache_key]
        if now - ts < _CACHE_TTL_SEC:
            return _filter(voices, language, engine, cache_age=int(now - ts))

    eleven_key   = os.getenv("ELEVENLABS_API_KEY") or ""
    cartesia_key = os.getenv("CARTESIA_API_KEY") or ""
    sarvam_key   = os.getenv("SARVAM_API_KEY") or ""

    fetchers = []
    used: list[str] = []
    skipped: list[dict] = []

    if eleven_key:
        fetchers.append(_fetch_elevenlabs_voices(eleven_key)); used.append("elevenlabs")
    else:
        skipped.append({"name": "elevenlabs", "reason": "no_api_key"})

    if cartesia_key:
        fetchers.append(_fetch_cartesia_voices(cartesia_key)); used.append("cartesia")
    else:
        skipped.append({"name": "cartesia", "reason": "no_api_key"})

    results = await asyncio.gather(*fetchers, return_exceptions=True) if fetchers else []
    voices: list[dict] = []
    for r in results:
        if isinstance(r, Exception):
            logger.warning("Voice fetch raised: %s", r)
        elif isinstance(r, list):
            voices.extend(r)

    if sarvam_key:
        voices.extend(_expand_sarvam(sarvam_key)); used.append("sarvam")
    else:
        skipped.append({"name": "sarvam", "reason": "no_api_key"})

    voices.extend(_EDGE_VOICES); used.append("edge")

    _CACHE[cache_key] = (now, voices)
    return _filter(voices, language, engine, cache_age=0, used=used, skipped=skipped)


def _filter(voices: list[dict], language: str | None, engine: str | None,
            cache_age: int = 0, used: list[str] | None = None,
            skipped: list[dict] | None = None) -> dict[str, Any]:
    out = list(voices)
    if language:
        norm = _norm_lang(language)
        out = [v for v in out if v["language"] == norm or norm in v.get("_supports", [])]
    if engine:
        out = [v for v in out if v["engine"] == engine]

    tier_order = {"premium": 0, "free": 1}
    out.sort(key=lambda v: (tier_order.get(v.get("tier", "free"), 2),
                            v["engine"], v["name"]))

    return {
        "voices": out,
        "total": len(out),
        "cache_age_sec": cache_age,
        "providers_used":    used    if used is not None else None,
        "providers_skipped": skipped if skipped is not None else None,
    }


@router.post("/preview")
async def preview_voice(payload: dict):
    """Generate a 1-2 second preview clip for any voice."""
    voice_id = payload.get("voice_id")
    engine   = payload.get("engine", "auto")
    language = _norm_lang(payload.get("language", "en")) or "en"
    text     = (payload.get("text") or
                _DEFAULT_PREVIEW.get(language, _DEFAULT_PREVIEW["en"]))

    if not voice_id:
        raise HTTPException(400, "voice_id required")

    from voice_engine.api_providers import synthesize_speech_api
    try:
        result = await synthesize_speech_api(
            text=text, language=language, voice_id=voice_id, provider=engine,
        )
    except Exception as exc:
        logger.exception("preview_voice failed")
        raise HTTPException(500, f"Preview failed: {exc}")

    if not result.get("audio_base64"):
        raise HTTPException(502, "TTS provider returned no audio")

    return {
        "audio_base64": result["audio_base64"],
        "format":       result.get("format", "wav"),
        "engine":       result.get("provider", engine),
        "duration_ms":  result.get("duration_ms"),
    }


_DEFAULT_PREVIEW: dict[str, str] = {
    "en": "Hello! I'll be your AI assistant today. How can I help you?",
    "hi": "नमस्ते! मैं आपका AI सहायक हूँ। मैं आपकी कैसे मदद कर सकता हूँ?",
    "ta": "வணக்கம்! நான் உங்கள் AI உதவியாளர். உங்களுக்கு எப்படி உதவ முடியும்?",
    "te": "నమస్తే! నేను మీ AI సహాయకుడిని. మీకు ఎలా సహాయపడగలను?",
    "kn": "ನಮಸ್ಕಾರ! ನಾನು ನಿಮ್ಮ AI ಸಹಾಯಕ. ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?",
    "ml": "നമസ്കാരം! ഞാൻ നിങ്ങളുടെ AI സഹായിയാണ്. എങ്ങനെ സഹായിക്കാം?",
    "bn": "নমস্কার! আমি আপনার AI সহকারী। আপনাকে কীভাবে সাহায্য করতে পারি?",
    "mr": "नमस्कार! मी तुमचा AI सहाय्यक आहे. मी तुम्हाला कशी मदत करू शकतो?",
    "gu": "નમસ્તે! હું તમારો AI સહાયક છું. હું તમને કેવી રીતે મદદ કરી શકું?",
}
