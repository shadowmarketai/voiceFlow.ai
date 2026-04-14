"""
API-based Voice Providers — Production Pipeline
=================================================
Works without local ML models (no torch, whisper, transformers).
Uses cloud APIs: Deepgram (STT), ElevenLabs (TTS), Groq/Claude (LLM).

Provider chain (tries in order, falls through on failure):
  STT: Deepgram → OpenAI Whisper API → (error)
  LLM: Groq → Anthropic Claude → OpenAI GPT-4 → stub
  TTS: ElevenLabs → Edge TTS → (error)
"""

import base64
import logging
import os
import tempfile
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)


# ── STT (Speech-to-Text) ────────────────────────────────────────

async def transcribe_audio_api(
    audio_bytes: bytes,
    language: Optional[str] = None,
    provider: str = "auto",
) -> Dict[str, Any]:
    """Transcribe audio using cloud API.

    Returns: {"text": str, "language": str, "provider": str, "confidence": float}
    """
    # --- Deepgram ---
    if provider in ("auto", "deepgram"):
        api_key = os.environ.get("DEEPGRAM_API_KEY", "")
        if api_key:
            try:
                result = await _deepgram_stt(audio_bytes, api_key, language)
                return result
            except Exception as e:
                logger.warning("Deepgram STT failed: %s", e)

    # --- OpenAI Whisper API ---
    if provider in ("auto", "openai"):
        api_key = os.environ.get("OPENAI_API_KEY", "")
        if api_key:
            try:
                result = await _openai_stt(audio_bytes, api_key, language)
                return result
            except Exception as e:
                logger.warning("OpenAI Whisper API failed: %s", e)

    # --- Groq Whisper API ---
    if provider in ("auto", "groq"):
        api_key = os.environ.get("GROQ_API_KEY", "")
        if api_key:
            try:
                result = await _groq_stt(audio_bytes, api_key, language)
                return result
            except Exception as e:
                logger.warning("Groq STT failed: %s", e)

    return {"text": "", "language": language or "en", "provider": "none", "confidence": 0.0,
            "error": "No STT provider available — set DEEPGRAM_API_KEY or OPENAI_API_KEY"}


async def _deepgram_stt(audio_bytes: bytes, api_key: str, language: Optional[str]) -> Dict[str, Any]:
    """Deepgram Nova-2 STT — fastest, best for real-time."""
    params = {
        "model": "nova-2",
        "smart_format": "true",
        "punctuate": "true",
        "diarize": "false",
    }
    if language:
        params["language"] = language

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.deepgram.com/v1/listen",
            headers={
                "Authorization": f"Token {api_key}",
                "Content-Type": "audio/wav",
            },
            params=params,
            content=audio_bytes,
        )
        resp.raise_for_status()
        data = resp.json()

    channels = data.get("results", {}).get("channels", [{}])
    alt = channels[0].get("alternatives", [{}])[0] if channels else {}

    return {
        "text": alt.get("transcript", ""),
        "language": data.get("results", {}).get("channels", [{}])[0].get("detected_language", language or "en"),
        "provider": "deepgram",
        "confidence": alt.get("confidence", 0.0),
    }


async def _openai_stt(audio_bytes: bytes, api_key: str, language: Optional[str]) -> Dict[str, Any]:
    """OpenAI Whisper API."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(audio_bytes)
        f.flush()
        tmp_path = f.name

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            with open(tmp_path, "rb") as audio_file:
                resp = await client.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    files={"file": ("audio.wav", audio_file, "audio/wav")},
                    data={"model": "whisper-1", "language": language or ""},
                )
            resp.raise_for_status()
            data = resp.json()
    finally:
        os.unlink(tmp_path)

    return {
        "text": data.get("text", ""),
        "language": language or "en",
        "provider": "openai_whisper",
        "confidence": 0.9,
    }


async def _groq_stt(audio_bytes: bytes, api_key: str, language: Optional[str]) -> Dict[str, Any]:
    """Groq Whisper API — fast inference."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(audio_bytes)
        f.flush()
        tmp_path = f.name

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            with open(tmp_path, "rb") as audio_file:
                resp = await client.post(
                    "https://api.groq.com/openai/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    files={"file": ("audio.wav", audio_file, "audio/wav")},
                    data={"model": "whisper-large-v3", "language": language or ""},
                )
            resp.raise_for_status()
            data = resp.json()
    finally:
        os.unlink(tmp_path)

    return {
        "text": data.get("text", ""),
        "language": language or "en",
        "provider": "groq_whisper",
        "confidence": 0.95,
    }


# ── TTS (Text-to-Speech) ────────────────────────────────────────

async def synthesize_speech_api(
    text: str,
    language: str = "en",
    voice_id: Optional[str] = None,
    provider: str = "auto",
    speed: float = 1.0,
) -> Dict[str, Any]:
    """Synthesize speech using cloud API.

    Returns: {"audio_base64": str, "format": str, "provider": str, "latency_ms": float}
    """
    import time
    t_start = time.time()

    # --- ElevenLabs ---
    if provider in ("auto", "elevenlabs"):
        api_key = os.environ.get("ELEVENLABS_API_KEY", "")
        if api_key:
            try:
                result = await _elevenlabs_tts(text, api_key, voice_id, speed)
                result["latency_ms"] = (time.time() - t_start) * 1000
                return result
            except Exception as e:
                logger.warning("ElevenLabs TTS failed: %s", e)

    # --- OpenAI TTS ---
    if provider in ("auto", "openai"):
        api_key = os.environ.get("OPENAI_API_KEY", "")
        if api_key:
            try:
                result = await _openai_tts(text, api_key, voice_id, speed)
                result["latency_ms"] = (time.time() - t_start) * 1000
                return result
            except Exception as e:
                logger.warning("OpenAI TTS failed: %s", e)

    # --- Edge TTS (free, no API key needed) ---
    try:
        result = await _edge_tts(text, language, speed)
        result["latency_ms"] = (time.time() - t_start) * 1000
        return result
    except Exception as e:
        logger.warning("Edge TTS failed: %s", e)

    return {"audio_base64": "", "format": "wav", "provider": "none", "latency_ms": 0,
            "error": "No TTS provider available"}


async def _elevenlabs_tts(text: str, api_key: str, voice_id: Optional[str], speed: float) -> Dict[str, Any]:
    """ElevenLabs TTS — highest quality voice synthesis."""
    # Default voices: Rachel (calm female), Drew (warm male)
    vid = voice_id or "21m00Tcm4TlvDq8ikWAM"  # Rachel

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{vid}",
            headers={
                "xi-api-key": api_key,
                "Content-Type": "application/json",
            },
            json={
                "text": text,
                "model_id": "eleven_flash_v2_5",
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75,
                    "speed": speed,
                },
            },
        )
        resp.raise_for_status()
        audio_bytes = resp.content

    return {
        "audio_base64": base64.b64encode(audio_bytes).decode(),
        "format": "mp3",
        "provider": "elevenlabs",
        "sample_rate": 44100,
    }


async def _openai_tts(text: str, api_key: str, voice_id: Optional[str], speed: float) -> Dict[str, Any]:
    """OpenAI TTS — 6 voices, multilingual."""
    voice = voice_id or "nova"  # nova = friendly female

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.openai.com/v1/audio/speech",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "tts-1",
                "input": text,
                "voice": voice,
                "speed": speed,
                "response_format": "mp3",
            },
        )
        resp.raise_for_status()
        audio_bytes = resp.content

    return {
        "audio_base64": base64.b64encode(audio_bytes).decode(),
        "format": "mp3",
        "provider": "openai_tts",
        "sample_rate": 24000,
    }


async def _edge_tts(text: str, language: str, speed: float) -> Dict[str, Any]:
    """Microsoft Edge TTS — free, no API key, many Indian voices."""
    import edge_tts

    voice_map = {
        "ta": "ta-IN-PallaviNeural",
        "hi": "hi-IN-SwaraNeural",
        "te": "te-IN-ShrutiNeural",
        "kn": "kn-IN-SapnaNeural",
        "ml": "ml-IN-SobhanaNeural",
        "bn": "bn-IN-TanishaaNeural",
        "mr": "mr-IN-AarohiNeural",
        "gu": "gu-IN-DhwaniNeural",
        "en": "en-IN-NeerjaNeural",
    }
    voice = voice_map.get(language, "en-IN-NeerjaNeural")
    rate_str = f"{int((speed - 1) * 100):+d}%"

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        tmp_path = f.name

    try:
        comm = edge_tts.Communicate(text, voice, rate=rate_str)
        await comm.save(tmp_path)
        with open(tmp_path, "rb") as f:
            audio_bytes = f.read()
    finally:
        os.unlink(tmp_path)

    return {
        "audio_base64": base64.b64encode(audio_bytes).decode(),
        "format": "mp3",
        "provider": "edge_tts",
        "sample_rate": 24000,
    }


# ── LLM (Language Model) ────────────────────────────────────────
# Already implemented in voice_ai_service.py as _call_llm()
# Groq → Anthropic Claude → OpenAI → stub fallback
