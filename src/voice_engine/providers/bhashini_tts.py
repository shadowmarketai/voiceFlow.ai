"""
Bhashini TTS — AI4Bharat IndicTTS via Bhashini/Dhruva API
==========================================================
FREE government-hosted TTS for 11 Indic languages.
Supports male and female voices per language.

Covered languages: ta, te, kn, ml, hi, mr, bn, gu, pa, or, as

Environment variables:
    BHASHINI_USER_ID    ULCA user ID
    BHASHINI_API_KEY    API key

Registration: https://bhashini.gov.in/ulca/user/register
"""

from __future__ import annotations

import base64
import logging
import os

import httpx

logger = logging.getLogger(__name__)

_BHASHINI_URL  = "https://dhruva-api.bhashini.gov.in/services/inference/pipeline"
_USER_ID       = os.getenv("BHASHINI_USER_ID", "")
_API_KEY       = os.getenv("BHASHINI_API_KEY", "")

# AI4Bharat IndicTTS service IDs
_TTS_SERVICE_IDS: dict[str, str] = {
    # Dravidian
    "ta": "ai4bharat/indic-tts-coqui-dravidian-gpu--t4",
    "te": "ai4bharat/indic-tts-coqui-dravidian-gpu--t4",
    "kn": "ai4bharat/indic-tts-coqui-dravidian-gpu--t4",
    "ml": "ai4bharat/indic-tts-coqui-dravidian-gpu--t4",
    # Indo-Aryan
    "hi": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "mr": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "bn": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "gu": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "pa": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "or": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "as": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    "default": "ai4bharat/indic-tts-coqui-dravidian-gpu--t4",
}

# Sampling rate returned by IndicTTS (8kHz PCM)
_TTS_SAMPLING_RATE = 8000


def is_configured() -> bool:
    return bool(_USER_ID and _API_KEY)


async def bhashini_tts(
    text: str,
    language: str = "ta",
    gender: str = "female",
    timeout: float = 8.0,
) -> bytes:
    """
    Synthesize speech using AI4Bharat IndicTTS via Bhashini/Dhruva API.

    Returns WAV bytes at 8kHz (suitable for telephony / Twilio).

    Args:
        text:     text to synthesize
        language: ISO language code
        gender:   "female" or "male"
        timeout:  request timeout in seconds
    """
    if not is_configured():
        raise RuntimeError("Bhashini not configured — set BHASHINI_USER_ID and BHASHINI_API_KEY")

    lang       = language.lower()[:2]
    service_id = _TTS_SERVICE_IDS.get(lang, _TTS_SERVICE_IDS["default"])

    payload = {
        "pipelineTasks": [
            {
                "taskType": "tts",
                "config": {
                    "language":     {"sourceLanguage": lang},
                    "serviceId":    service_id,
                    "gender":       gender,
                    "samplingRate": _TTS_SAMPLING_RATE,
                },
            }
        ],
        "inputData": {
            "input": [{"source": text}]
        },
    }

    headers = {
        "Authorization": _API_KEY,
        "userID":        _USER_ID,
        "Content-Type":  "application/json",
    }

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(_BHASHINI_URL, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    pipeline_resp = data.get("pipelineResponse", [{}])
    if not pipeline_resp:
        raise RuntimeError("Bhashini TTS: empty pipeline response")

    audio_list = pipeline_resp[0].get("audio", [{}])
    if not audio_list:
        raise RuntimeError("Bhashini TTS: no audio in response")

    audio_b64 = audio_list[0].get("audioContent", "")
    if not audio_b64:
        raise RuntimeError("Bhashini TTS: empty audioContent")

    audio_bytes = base64.b64decode(audio_b64)
    logger.debug(
        "[Bhashini TTS] lang=%s gender=%s text='%s...' bytes=%d",
        lang, gender, text[:40], len(audio_bytes),
    )
    return audio_bytes
