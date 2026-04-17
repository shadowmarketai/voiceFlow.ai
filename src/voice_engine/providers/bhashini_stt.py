"""
Bhashini STT — AI4Bharat IndicConformer via Bhashini/Dhruva API
================================================================
FREE government-hosted STT. Better Tamil dialect accuracy than Deepgram.
Covers 13 Indic languages with Dravidian + Indo-Aryan model variants.

Registration: https://bhashini.gov.in/ulca/user/register
Once registered, you get BHASHINI_USER_ID + BHASHINI_API_KEY at no cost.

Environment variables:
    BHASHINI_USER_ID    ULCA user ID from bhashini.gov.in
    BHASHINI_API_KEY    API key from bhashini.gov.in
"""

from __future__ import annotations

import base64
import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_BHASHINI_URL  = "https://dhruva-api.bhashini.gov.in/services/inference/pipeline"
_USER_ID       = os.getenv("BHASHINI_USER_ID", "")
_API_KEY       = os.getenv("BHASHINI_API_KEY", "")

# AI4Bharat IndicConformer service IDs per language
_STT_SERVICE_IDS: dict[str, str] = {
    # Dravidian languages
    "ta": "ai4bharat/conformer-multilingual-dravidian-gpu--t4",
    "te": "ai4bharat/conformer-multilingual-dravidian-gpu--t4",
    "kn": "ai4bharat/conformer-multilingual-dravidian-gpu--t4",
    "ml": "ai4bharat/conformer-multilingual-dravidian-gpu--t4",
    # Indo-Aryan languages
    "hi": "ai4bharat/conformer-hi-gpu--t4",
    "bn": "ai4bharat/conformer-multilingual-indo_aryan-gpu--t4",
    "mr": "ai4bharat/conformer-multilingual-indo_aryan-gpu--t4",
    "gu": "ai4bharat/conformer-multilingual-indo_aryan-gpu--t4",
    "pa": "ai4bharat/conformer-multilingual-indo_aryan-gpu--t4",
    "or": "ai4bharat/conformer-multilingual-indo_aryan-gpu--t4",
    "as": "ai4bharat/conformer-multilingual-indo_aryan-gpu--t4",
    "ur": "ai4bharat/conformer-multilingual-indo_aryan-gpu--t4",
    # Default
    "default": "ai4bharat/conformer-multilingual-dravidian-gpu--t4",
}

_SUPPORTED_LANGS = set(_STT_SERVICE_IDS.keys()) - {"default"}


def is_configured() -> bool:
    return bool(_USER_ID and _API_KEY)


async def bhashini_stt(
    audio_bytes: bytes,
    language: str = "ta",
    timeout: float = 8.0,
) -> dict[str, Any]:
    """
    Transcribe audio using AI4Bharat IndicConformer via Bhashini/Dhruva API.

    Returns dict matching the format used by transcribe_ensemble():
        {"text": str, "language": str, "confidence": float, "provider": "bhashini"}

    Args:
        audio_bytes: WAV audio bytes (16kHz mono PCM16)
        language:    ISO language code (ta, hi, te, kn, ml, bn, mr, gu, pa, or, as, ur)
        timeout:     request timeout in seconds
    """
    if not is_configured():
        raise RuntimeError("Bhashini not configured — set BHASHINI_USER_ID and BHASHINI_API_KEY")

    lang       = language.lower()[:2]
    service_id = _STT_SERVICE_IDS.get(lang, _STT_SERVICE_IDS["default"])
    audio_b64  = base64.b64encode(audio_bytes).decode()

    payload = {
        "pipelineTasks": [
            {
                "taskType": "asr",
                "config": {
                    "language":     {"sourceLanguage": lang},
                    "serviceId":    service_id,
                    "audioFormat":  "wav",
                    "samplingRate": 16000,
                },
            }
        ],
        "inputData": {
            "audio": [{"audioContent": audio_b64}]
        },
    }

    headers = {
        "Authorization": _API_KEY,
        "userID":        _USER_ID,
        "Content-Type":  "application/json",
    }

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(_BHASHINI_URL, json=payload, headers=headers)
        if resp.status_code != 200:
            raise RuntimeError(f"Bhashini STT error {resp.status_code}: {resp.text[:200]}")
        data = resp.json()

    pipeline_resp = data.get("pipelineResponse", [{}])
    if not pipeline_resp:
        return {"text": "", "language": lang, "confidence": 0.0, "provider": "bhashini"}

    outputs = pipeline_resp[0].get("output", [{}])
    text    = outputs[0].get("source", "") if outputs else ""
    conf    = float(outputs[0].get("confidence", 0.8)) if outputs else 0.8

    logger.debug("[Bhashini STT] lang=%s text='%s...'", lang, text[:60])
    return {
        "text":       text,
        "language":   lang,
        "confidence": conf,
        "provider":   "bhashini",
    }
