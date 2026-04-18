"""
Hume Expression Measurement — prosody emotion layer.
=====================================================

Sends user audio to Hume's Expression Measurement API and returns per-emotion
scores derived from vocal prosody (pitch, rate, energy). These scores are
language-agnostic — works identically for Tamil, Hindi, and English callers.

We use this ALONGSIDE Sarvam STT (not instead of it). Sarvam gives us the
Tamil transcript; Hume gives us the emotional state behind the words.

Emotions we act on:
  frustration  → softer/slower TTS + empathy prefix in LLM prompt
  confusion    → simpler re-explanation + example in LLM prompt
  anger        → immediate human-agent handoff if transfer enabled
  calmness     → normal pipeline, no adjustment
  sadness      → gentler tone, offer human support
  fear/distress→ immediate human handoff

Cost: Hume charges ~$0.001/sec of audio → ~₹0.08/min of calls.
Falls back silently to neutral if HUME_API_KEY is not set or API fails.

Environment variables:
  HUME_API_KEY   — Hume platform API key (https://platform.hume.ai)
"""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import time
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)

_HUME_API_KEY = os.getenv("HUME_API_KEY", "")

# Hume Expression Measurement inference endpoint
_HUME_BATCH_URL = "https://api.hume.ai/v0/batch/jobs"
_HUME_MODELS = {"prosody": {}}  # prosody = vocal emotion from tone/pitch/rate

# Emotion score keys returned by Hume prosody model that we map to our internal names
_HUME_TO_INTERNAL: dict[str, str] = {
    "Frustration": "frustration",
    "Confusion": "confusion",
    "Anger": "anger",
    "Calmness": "calmness",
    "Sadness": "sadness",
    "Fear": "fear",
    "Distress": "distress",
    "Joy": "joy",
    "Satisfaction": "satisfaction",
    "Contempt": "contempt",
    "Excitement": "excitement",
}

# Thresholds for action (0–1 scale)
FRUSTRATION_THRESHOLD = 0.55
CONFUSION_THRESHOLD   = 0.50
ANGER_THRESHOLD       = 0.65
SADNESS_THRESHOLD     = 0.55
FEAR_THRESHOLD        = 0.60
HANDOFF_THRESHOLD     = 0.70  # anger/fear above this → trigger human transfer


# ──────────────────────────────────────────────────────────────────────────────
# Hume API client (batch inference — latency ~600-900ms)
# ──────────────────────────────────────────────────────────────────────────────

async def _submit_batch_job(audio_b64: str, content_type: str = "audio/wav") -> str | None:
    """Submit a batch job to Hume and return job_id."""
    headers = {
        "X-Hume-Api-Key": _HUME_API_KEY,
        "Content-Type": "application/json",
    }
    payload = {
        "models": _HUME_MODELS,
        "urls": [],
        "transcription": {"language": None},  # language-agnostic prosody
        "notify": False,
    }
    # Embed audio directly as base64 file
    payload["files"] = [
        {
            "filename": "turn.wav",
            "content": audio_b64,
            "content_type": content_type,
        }
    ]
    try:
        async with aiohttp.ClientSession() as session, session.post(
            _HUME_BATCH_URL,
            headers=headers,
            json=payload,
            timeout=aiohttp.ClientTimeout(total=10),
        ) as resp:
            if resp.status not in (200, 201):
                body = await resp.text()
                logger.debug("emotion_engine: Hume submit %d — %s", resp.status, body[:200])
                return None
            data = await resp.json()
            return data.get("job_id")
    except Exception:
        logger.debug("emotion_engine: Hume submit failed", exc_info=True)
        return None


async def _poll_job(job_id: str, max_wait_s: float = 8.0) -> dict | None:
    """Poll Hume job until complete or timeout."""
    headers = {"X-Hume-Api-Key": _HUME_API_KEY}
    url = f"{_HUME_BATCH_URL}/{job_id}/predictions"
    deadline = time.monotonic() + max_wait_s
    interval = 0.4

    async with aiohttp.ClientSession() as session:
        while time.monotonic() < deadline:
            try:
                async with session.get(
                    url, headers=headers,
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as resp:
                    if resp.status == 200:
                        return await resp.json()
                    # 202 = still processing
            except Exception:
                pass
            await asyncio.sleep(interval)
            interval = min(interval * 1.4, 1.5)
    logger.debug("emotion_engine: Hume job %s timed out after %.1fs", job_id, max_wait_s)
    return None


def _extract_scores(predictions: list) -> dict[str, float]:
    """Flatten Hume predictions into a single averaged emotion score dict."""
    aggregated: dict[str, list[float]] = {}

    for file_pred in predictions:
        for model_output in file_pred.get("models", {}).get("prosody", {}).get("grouped_predictions", []):
            for segment in model_output.get("predictions", []):
                for emotion in segment.get("emotions", []):
                    name = emotion.get("name", "")
                    score = float(emotion.get("score", 0.0))
                    internal = _HUME_TO_INTERNAL.get(name)
                    if internal:
                        aggregated.setdefault(internal, []).append(score)

    return {k: round(sum(v) / len(v), 4) for k, v in aggregated.items() if v}


# ──────────────────────────────────────────────────────────────────────────────
# Fast text-based fallback (no API call, sub-ms)
# ──────────────────────────────────────────────────────────────────────────────

_FRUSTRATION_WORDS = {
    # English
    "not working", "broken", "useless", "terrible", "horrible", "awful",
    "ridiculous", "pathetic", "waste", "cancel", "refund", "escalate",
    "manager", "supervisor", "disgusting", "fed up", "sick of",
    # Tamil
    "வேலை செய்யல", "கஷ்டம்", "பிரச்சனை", "தொந்தரவு", "கோபம்",
    "திருப்தியில்லை", "மோசமான", "நிராகரிக்கிறேன்",
    # Hindi romanized
    "kaam nahi karta", "bakwaas", "bekar", "manager bulao", "cancel karo",
}

_CONFUSION_WORDS = {
    "don't understand", "what do you mean", "confused", "explain again",
    "what", "huh", "sorry", "repeat", "not clear", "how", "which",
    # Tamil
    "புரியவில்லை", "மீண்டும் சொல்லுங்கள்", "என்ன",
    # Hindi
    "samajh nahi aaya", "dobara batao", "kya matlab",
}

_ANGER_WORDS = {
    "unacceptable", "lawsuit", "court", "complaint", "consumer forum",
    "fraud", "cheat", "scam", "police", "legal action",
    # Tamil
    "நீதிமன்றம்", "புகார்", "மோசடி", "வழக்கு",
}


def _text_emotion_fallback(text: str) -> dict[str, float]:
    """Fast keyword-based emotion detection as fallback when Hume is unavailable."""
    if not text:
        return {"calmness": 0.8}

    lower = text.lower()
    scores: dict[str, float] = {"calmness": 0.6}

    frust_hits = sum(1 for w in _FRUSTRATION_WORDS if w in lower)
    conf_hits  = sum(1 for w in _CONFUSION_WORDS if w in lower)
    anger_hits = sum(1 for w in _ANGER_WORDS if w in lower)

    if frust_hits:
        scores["frustration"] = min(0.4 + frust_hits * 0.2, 0.95)
        scores["calmness"] = max(0.0, scores["calmness"] - 0.3)
    if conf_hits:
        scores["confusion"] = min(0.35 + conf_hits * 0.15, 0.90)
    if anger_hits:
        scores["anger"] = min(0.5 + anger_hits * 0.25, 0.99)
        scores["frustration"] = max(scores.get("frustration", 0.0), 0.6)
        scores["calmness"] = 0.0

    return {k: round(v, 3) for k, v in scores.items()}


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────

async def analyse_emotion(
    audio_bytes: bytes,
    transcript: str = "",
) -> dict[str, Any]:
    """
    Return emotion analysis for a caller turn.

    Returns:
      {
        "emotion":           str   — dominant emotion name
        "emotion_confidence": float — 0–1
        "emotion_scores":    dict  — {emotion_name: score, ...}
        "needs_handoff":     bool  — True if anger/fear above HANDOFF_THRESHOLD
        "source":            str   — "hume" | "text_fallback" | "default"
      }
    """
    scores: dict[str, float] = {}
    source = "default"

    if _HUME_API_KEY:
        try:
            audio_b64 = base64.b64encode(audio_bytes).decode()
            job_id = await _submit_batch_job(audio_b64)
            if job_id:
                predictions = await _poll_job(job_id)
                if predictions:
                    scores = _extract_scores(predictions)
                    source = "hume"
        except Exception:
            logger.debug("emotion_engine: Hume API error, falling back", exc_info=True)

    if not scores and transcript:
        scores = _text_emotion_fallback(transcript)
        source = "text_fallback"

    if not scores:
        return {
            "emotion": "neutral",
            "emotion_confidence": 0.0,
            "emotion_scores": {},
            "needs_handoff": False,
            "source": "default",
        }

    dominant = max(scores.items(), key=lambda kv: kv[1])
    needs_handoff = (
        scores.get("anger", 0) >= HANDOFF_THRESHOLD
        or scores.get("fear", 0) >= HANDOFF_THRESHOLD
        or scores.get("distress", 0) >= HANDOFF_THRESHOLD
    )

    return {
        "emotion": dominant[0],
        "emotion_confidence": round(dominant[1], 3),
        "emotion_scores": scores,
        "needs_handoff": needs_handoff,
        "source": source,
    }


def build_emotion_prompt_prefix(scores: dict[str, float], language: str = "en") -> str:
    """
    Return a system-prompt injection based on detected emotion.
    Prepend this to the agent's system prompt before the LLM call.
    """
    frustration = scores.get("frustration", 0.0)
    confusion   = scores.get("confusion", 0.0)
    anger       = scores.get("anger", 0.0)
    sadness     = scores.get("sadness", 0.0)

    parts: list[str] = []

    if anger >= ANGER_THRESHOLD:
        if language == "ta":
            parts.append(
                "வாடிக்கையாளர் மிகவும் கோபமாக இருக்கிறார். "
                "மிக அமைதியாகவும் மரியாதையாகவும் பேசுங்கள். "
                "உடனே human agent க்கு transfer செய்ய கேளுங்கள்."
            )
        else:
            parts.append(
                "[CALLER IS ANGRY] Stay very calm and respectful. "
                "Acknowledge the frustration immediately. Offer to transfer to a human agent."
            )

    elif frustration >= FRUSTRATION_THRESHOLD:
        if language == "ta":
            parts.append(
                "வாடிக்கையாளர் கோபமாக அல்லது சலிப்பாக இருக்கிறார். "
                "மென்மையான தொனியில் பேசுங்கள். "
                "முதலில் 'மன்னிக்கவும்' என்று சொல்லுங்கள். "
                "பதில்களை சுருக்கமாகவும் நேரடியாகவும் வையுங்கள்."
            )
        else:
            parts.append(
                "[CALLER IS FRUSTRATED] Use a softer, slower tone. "
                "Start with a brief apology. Keep answers short and direct. "
                "Do not be overly cheerful."
            )

    elif confusion >= CONFUSION_THRESHOLD:
        if language == "ta":
            parts.append(
                "வாடிக்கையாளருக்கு புரியவில்லை என்று தெரிகிறது. "
                "மீண்டும் எளிமையாக விளக்குங்கள். ஒரு உதாரணம் கொடுங்கள். "
                "ஒரே நேரத்தில் ஒரு தகவல் மட்டும் சொல்லுங்கள்."
            )
        else:
            parts.append(
                "[CALLER IS CONFUSED] Re-explain in simpler terms. "
                "Give a concrete example. Explain one thing at a time. "
                "Ask 'Does that make sense?' after explaining."
            )

    elif sadness >= SADNESS_THRESHOLD:
        if language == "ta":
            parts.append(
                "வாடிக்கையாளர் கஷ்டத்தில் இருக்கிறார். "
                "அன்பாகவும் அக்கறையுடனும் பேசுங்கள்."
            )
        else:
            parts.append(
                "[CALLER SEEMS DISTRESSED] Be gentle and empathetic. "
                "Acknowledge their situation before moving to solutions."
            )

    return "\n".join(parts)
