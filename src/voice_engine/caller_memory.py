"""
Cross-Call Memory — Redis-backed caller profile store.
=======================================================

Every time a caller's phone number is seen, we:
  1. Load their profile from Redis at call start
  2. Inject known context into the LLM system prompt
  3. Extract new entities (name, intent, price, date) from each turn
  4. Persist updated profile back to Redis after the call

Result: the agent remembers callers across sessions.

  "Good morning Mr. Kumar, calling about the Velachery property viewing
   we discussed last Tuesday?"

No competitor in the TN/Kerala market does this today.

Storage layout (Redis key: caller:<E164_phone>):
  {
    "phone":           "+919876543210",
    "name":            "Kumar",
    "language":        "ta",
    "last_call_ts":    "2026-04-17T10:23:00Z",
    "last_intent":     "property_viewing",
    "call_count":      3,
    "entities": {
      "price_discussed":    "₹45L",
      "property_location":  "Velachery",
      "appointment_date":   "2026-04-22",
      "appointment_time":   "10:00 AM",
    },
    "emotion_history": ["frustrated", "neutral", "satisfied"],
    "notes":           ["interested in 2BHK", "prefers morning calls"],
  }

Environment variables:
  REDIS_URL   — already required by the platform (default redis://localhost:6379/0)
  CALLER_MEMORY_TTL_DAYS  — profile TTL (default 90 days)
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

_TTL_SECONDS = int(os.getenv("CALLER_MEMORY_TTL_DAYS", "90")) * 86400
_REDIS_URL   = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Lazy Redis client
_redis_client: Any = None


def _get_redis():
    global _redis_client
    if _redis_client is None:
        try:
            import redis.asyncio as aioredis
            _redis_client = aioredis.from_url(_REDIS_URL, decode_responses=True)
        except ImportError:
            logger.warning("caller_memory: redis package not available")
    return _redis_client


def _caller_key(phone: str) -> str:
    # Normalise to strip spaces/dashes; keep + prefix
    clean = re.sub(r"[\s\-\(\)]", "", phone or "")
    return f"caller:{clean}"


# ──────────────────────────────────────────────────────────────────────────────
# Profile load / save
# ──────────────────────────────────────────────────────────────────────────────

async def load_profile(phone: str) -> dict[str, Any] | None:
    """Return caller profile dict or None if not found / Redis unavailable."""
    if not phone:
        return None
    r = _get_redis()
    if r is None:
        return None
    try:
        raw = await r.get(_caller_key(phone))
        return json.loads(raw) if raw else None
    except Exception:
        logger.debug("caller_memory: load failed for %s", phone, exc_info=True)
        return None


async def save_profile(phone: str, profile: dict[str, Any]) -> None:
    """Persist caller profile. Creates or updates. TTL = CALLER_MEMORY_TTL_DAYS."""
    if not phone:
        return
    r = _get_redis()
    if r is None:
        return
    try:
        profile["last_saved_ts"] = datetime.now(timezone.utc).isoformat()
        await r.set(_caller_key(phone), json.dumps(profile, ensure_ascii=False),
                    ex=_TTL_SECONDS)
    except Exception:
        logger.debug("caller_memory: save failed for %s", phone, exc_info=True)


# ──────────────────────────────────────────────────────────────────────────────
# Entity extraction (fast keyword-based, no extra API call)
# ──────────────────────────────────────────────────────────────────────────────

# Patterns for common entities in Indian voice calls
_NAME_PATTERNS = [
    re.compile(r"(?:my name is|i am|i'm|naan|naanu|naam hai)\s+([A-Za-z\u0B80-\u0BFF\u0900-\u097F]{2,30})", re.I),
    re.compile(r"(?:ennoda peyar|en peyar|mera naam)\s+([A-Za-z\u0B80-\u0BFF\u0900-\u097F]{2,30})", re.I),
]
_PHONE_PATTERN   = re.compile(r"\b(?:\+91|0)?[6-9]\d{9}\b")
_PRICE_PATTERNS  = [
    re.compile(r"(?:₹|rs\.?|inr)\s*([\d,]+(?:\s*(?:lakh|lac|L|cr|crore|k))?)", re.I),
    re.compile(r"([\d,]+)\s*(?:lakh|lac|L|cr|crore)\b", re.I),
]
_DATE_PATTERN    = re.compile(
    r"\b(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|"
    r"(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|"
    r"tomorrow|today|next week|"
    r"திங்கள்|செவ்வாய்|புதன்|வியாழன்|வெள்ளி|சனி|ஞாயிறு|"
    r"நாளை|இன்று))\b",
    re.I,
)
_TIME_PATTERN    = re.compile(r"\b(\d{1,2}(?::\d{2})?\s*(?:am|pm|மணி|மணிக்கு))\b", re.I)
_LOCATION_WORDS  = {
    # Chennai localities
    "velachery", "adyar", "anna nagar", "t nagar", "tambaram", "porur",
    "omr", "ecr", "sholinganallur", "perambur", "chromepet", "pallavaram",
    "guindy", "kodambakkam", "nungambakkam", "mylapore", "besant nagar",
    # Pan-TN
    "coimbatore", "madurai", "trichy", "salem", "tirunelveli", "vellore",
    "erode", "tirupur", "thanjavur", "pondicherry",
    # Pan-India
    "bangalore", "bengaluru", "hyderabad", "mumbai", "delhi", "pune",
}


def extract_entities(text: str) -> dict[str, str]:
    """Extract call entities from a single turn transcript."""
    if not text:
        return {}
    found: dict[str, str] = {}
    lower = text.lower()

    for pat in _NAME_PATTERNS:
        m = pat.search(text)
        if m:
            found["caller_name"] = m.group(1).strip().title()
            break

    m = _PHONE_PATTERN.search(text)
    if m:
        found["alt_phone"] = m.group(0)

    for pat in _PRICE_PATTERNS:
        m = pat.search(text)
        if m:
            found["price_discussed"] = m.group(0).strip()
            break

    m = _DATE_PATTERN.search(text, re.I)
    if m:
        found["appointment_date"] = m.group(1)

    m = _TIME_PATTERN.search(text, re.I)
    if m:
        found["appointment_time"] = m.group(1)

    for loc in _LOCATION_WORDS:
        if loc in lower:
            found["property_location"] = loc.title()
            break

    return found


# ──────────────────────────────────────────────────────────────────────────────
# System-prompt injection
# ──────────────────────────────────────────────────────────────────────────────

def build_memory_prompt(profile: dict[str, Any], language: str = "en") -> str:
    """
    Return a block to prepend to the agent's system prompt.
    Empty string if profile is empty or None.
    """
    if not profile:
        return ""

    name        = profile.get("name") or profile.get("caller_name", "")
    call_count  = profile.get("call_count", 0)
    last_intent = profile.get("last_intent", "")
    last_call   = (profile.get("last_call_ts", "") or "")[:10]
    entities    = profile.get("entities", {})
    notes       = profile.get("notes", [])

    if call_count == 0:
        return ""

    if language == "ta":
        lines = ["[திரும்பி அழைக்கும் வாடிக்கையாளர் — முன்பு பேசியதை நினைவில் வையுங்கள்]"]
        if name:
            lines.append(f"பெயர்: {name}")
        if call_count > 1:
            lines.append(f"மொத்த அழைப்புகள்: {call_count}")
        if last_call:
            lines.append(f"கடைசி அழைப்பு: {last_call}")
        if last_intent:
            lines.append(f"கடைசி தேவை: {last_intent}")
        for k, v in entities.items():
            lines.append(f"{k}: {v}")
        if notes:
            lines.append("குறிப்புகள்: " + "; ".join(notes[:3]))
    elif language == "hi":
        lines = ["[वापस आए caller — पिछली बातचीत याद रखें]"]
        if name:
            lines.append(f"नाम: {name}")
        if call_count > 1:
            lines.append(f"कुल कॉल: {call_count}")
        if last_call:
            lines.append(f"अंतिम कॉल: {last_call}")
        if last_intent:
            lines.append(f"पिछला उद्देश्य: {last_intent}")
        for k, v in entities.items():
            lines.append(f"{k}: {v}")
        if notes:
            lines.append("नोट्स: " + "; ".join(notes[:3]))
    else:
        lines = ["[RETURNING CALLER — use their history below]"]
        if name:
            lines.append(f"Name: {name}")
        if call_count > 1:
            lines.append(f"Total calls: {call_count}")
        if last_call:
            lines.append(f"Last call: {last_call}")
        if last_intent:
            lines.append(f"Last intent: {last_intent}")
        for k, v in entities.items():
            lines.append(f"{k}: {v}")
        if notes:
            lines.append("Notes: " + "; ".join(notes[:3]))

    return "\n".join(lines)


# ──────────────────────────────────────────────────────────────────────────────
# Call lifecycle helpers
# ──────────────────────────────────────────────────────────────────────────────

async def on_call_start(phone: str, language: str = "en") -> tuple[dict, str]:
    """
    Load profile at call start.
    Returns (profile, memory_prompt_block).
    Profile is {} (empty dict) for first-time callers.
    """
    profile = await load_profile(phone) or {}
    prompt_block = build_memory_prompt(profile, language=language)
    if profile:
        logger.info("caller_memory: returning caller %s (calls=%d)", phone[-4:],
                    profile.get("call_count", 0))
    return profile, prompt_block


async def on_turn_end(
    phone: str,
    profile: dict[str, Any],
    transcript: str,
    agent_text: str,
    intent: str = "",
    language: str = "en",
    emotion: str = "neutral",
) -> None:
    """
    Update profile after each turn. Extracts entities, updates emotion history,
    increments call count on first turn of a call.
    Call save_profile() at call end to persist.
    """
    if not phone:
        return

    # Extract new entities from this turn
    new_entities = extract_entities(transcript)
    profile.setdefault("entities", {}).update(
        {k: v for k, v in new_entities.items() if v}
    )

    # Update name at profile level if extracted
    if "caller_name" in new_entities and not profile.get("name"):
        profile["name"] = new_entities["caller_name"]

    # Intent
    if intent:
        profile["last_intent"] = intent

    # Language preference
    profile["language"] = language

    # Emotion timeline (keep last 10)
    history = profile.get("emotion_history", [])
    if emotion and emotion != "neutral":
        history.append(emotion)
        profile["emotion_history"] = history[-10:]


async def on_call_end(
    phone: str,
    profile: dict[str, Any],
    final_intent: str = "",
    note: str = "",
) -> None:
    """
    Finalise and persist profile. Call once when the call ends.
    """
    if not phone:
        return

    profile["call_count"] = profile.get("call_count", 0) + 1
    profile["last_call_ts"] = datetime.now(timezone.utc).isoformat()
    if final_intent:
        profile["last_intent"] = final_intent
    if note:
        notes = profile.get("notes", [])
        notes.append(note)
        profile["notes"] = notes[-20:]  # keep last 20

    await save_profile(phone, profile)
    logger.info("caller_memory: saved profile for %s (calls=%d)",
                phone[-4:] if len(phone) >= 4 else phone,
                profile.get("call_count", 0))
