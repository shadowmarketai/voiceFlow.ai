"""
Cross-Call Memory — GAP 7
==========================
Permanent caller profiles stored in voiceflow_crm PostgreSQL database.
Redis acts as a read-through cache (speed); Postgres is the source of truth.

Storage:
  Postgres  → voiceflow_crm.caller_memories  (permanent, scoped by tenant)
  Redis     → caller:<tenant>:<phone_hash>   (TTL cache, 90 days)

Privacy:
  Raw phone numbers are NEVER stored anywhere.
  All lookups use SHA-256 of the E.164-normalised phone number.

Call lifecycle:
  on_call_start()  → load profile, return memory prompt block for system prompt
  on_turn_end()    → extract entities, accumulate in-memory (no DB write yet)
  on_call_end()    → Groq LLM summarise → upsert Postgres → update Redis

System prompt injection (example — Tamil):
  [திரும்பி அழைக்கும் வாடிக்கையாளர்]
  பெயர்: Kumar
  மொத்த அழைப்புகள்: 3
  கடைசி அழைப்பு: 2026-04-17
  price_discussed: ₹45L
  property_location: Velachery

Environment variables:
  DATABASE_URL_CRM         — voiceflow_crm PostgreSQL URL
  REDIS_URL                — Redis (default redis://localhost:6379/0)
  CALLER_MEMORY_TTL_DAYS   — Redis TTL in days (default 90)
  GROQ_API_KEY             — Groq API key for call summarisation
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger(__name__)

_REDIS_URL       = os.getenv("REDIS_URL", "redis://localhost:6379/0")
_TTL_SECONDS     = int(os.getenv("CALLER_MEMORY_TTL_DAYS", "90")) * 86400
_GROQ_API_KEY    = os.getenv("GROQ_API_KEY", "")
_SUMMARY_MODEL   = "llama3-8b-8192"   # cheap + fast for call summaries

# ─────────────────────────────────────────────────────────────────────────────
# Redis (lazy-init, optional)
# ─────────────────────────────────────────────────────────────────────────────

_redis_client: Any = None


def _get_redis():
    global _redis_client
    if _redis_client is None:
        try:
            import redis.asyncio as aioredis
            _redis_client = aioredis.from_url(_REDIS_URL, decode_responses=True)
        except ImportError:
            logger.warning("caller_memory: redis package not available — cache disabled")
    return _redis_client


# ─────────────────────────────────────────────────────────────────────────────
# Phone hashing + Redis key
# ─────────────────────────────────────────────────────────────────────────────

def _hash_phone(phone: str) -> str:
    """Return SHA-256 hex of E.164-normalised phone number."""
    clean = re.sub(r"[\s\-\(\)]", "", phone or "")
    return hashlib.sha256(clean.encode()).hexdigest()


def _redis_key(tenant_id: str, phone_hash: str) -> str:
    return f"caller:{tenant_id}:{phone_hash}"


# ─────────────────────────────────────────────────────────────────────────────
# Postgres load / save
# ─────────────────────────────────────────────────────────────────────────────

async def _pg_load(tenant_id: str, phone_hash: str) -> dict[str, Any] | None:
    """Load caller profile from voiceflow_crm Postgres. Returns None if not found."""
    try:
        from api.multi_db import crm_session
        from api.models.caller_memory_model import CallerMemory
        from sqlalchemy import select

        async with crm_session() as session:
            result = await session.execute(
                select(CallerMemory).where(
                    CallerMemory.tenant_id == tenant_id,
                    CallerMemory.phone_hash == phone_hash,
                )
            )
            row = result.scalar_one_or_none()
            if row is None:
                return None
            return {
                "id":             row.id,
                "tenant_id":      row.tenant_id,
                "phone_hash":     row.phone_hash,
                "name":           row.caller_name,
                "language":       row.language_pref,
                "key_facts":      row.key_facts or {},
                "conv_summaries": row.conv_summaries or [],
                "emotion_history":row.emotion_history or [],
                "total_calls":    row.total_calls,
                "last_call_at":   row.last_call_at,
                "last_intent":    row.last_intent,
                "notes":          row.notes or [],
            }
    except Exception:
        logger.debug("caller_memory: pg_load failed", exc_info=True)
        return None


async def _pg_upsert(tenant_id: str, phone_hash: str, profile: dict[str, Any]) -> int | None:
    """Upsert caller profile into voiceflow_crm Postgres. Returns row id."""
    try:
        from api.multi_db import crm_session
        from api.models.caller_memory_model import CallerMemory
        from sqlalchemy import select

        async with crm_session() as session:
            result = await session.execute(
                select(CallerMemory).where(
                    CallerMemory.tenant_id == tenant_id,
                    CallerMemory.phone_hash == phone_hash,
                )
            )
            row = result.scalar_one_or_none()

            now_iso = datetime.now(UTC).isoformat()

            if row is None:
                row = CallerMemory(
                    tenant_id      = tenant_id,
                    phone_hash     = phone_hash,
                    caller_name    = profile.get("name"),
                    language_pref  = profile.get("language", "en"),
                    key_facts      = profile.get("key_facts", {}),
                    conv_summaries = profile.get("conv_summaries", []),
                    emotion_history= profile.get("emotion_history", []),
                    total_calls    = profile.get("total_calls", 0),
                    last_call_at   = profile.get("last_call_at", now_iso),
                    last_intent    = profile.get("last_intent"),
                    notes          = profile.get("notes", []),
                )
                session.add(row)
            else:
                if profile.get("name"):
                    row.caller_name     = profile["name"]
                row.language_pref       = profile.get("language", row.language_pref)
                row.key_facts           = {**(row.key_facts or {}), **profile.get("key_facts", {})}
                row.conv_summaries      = profile.get("conv_summaries", row.conv_summaries or [])
                row.emotion_history     = profile.get("emotion_history", row.emotion_history or [])
                row.total_calls         = profile.get("total_calls", row.total_calls)
                row.last_call_at        = profile.get("last_call_at", now_iso)
                if profile.get("last_intent"):
                    row.last_intent     = profile["last_intent"]
                row.notes               = profile.get("notes", row.notes or [])
                row.updated_at          = now_iso

            await session.flush()
            return row.id

    except Exception:
        logger.error("caller_memory: pg_upsert failed", exc_info=True)
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Redis cache helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _cache_get(key: str) -> dict[str, Any] | None:
    r = _get_redis()
    if r is None:
        return None
    try:
        raw = await r.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


async def _cache_set(key: str, profile: dict[str, Any]) -> None:
    r = _get_redis()
    if r is None:
        return
    try:
        await r.set(key, json.dumps(profile, ensure_ascii=False), ex=_TTL_SECONDS)
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────────────────
# Load profile  (Redis → Postgres fallback)
# ─────────────────────────────────────────────────────────────────────────────

async def load_profile(tenant_id: str, phone: str) -> dict[str, Any]:
    """
    Load caller profile. Returns {} for first-time callers.
    Order: Redis cache → Postgres → empty dict.
    """
    if not phone or not tenant_id:
        return {}

    phone_hash = _hash_phone(phone)
    rkey       = _redis_key(tenant_id, phone_hash)

    # 1. Redis (fast path)
    profile = await _cache_get(rkey)
    if profile is not None:
        logger.debug("caller_memory: cache HIT for %s", phone[-4:])
        return profile

    # 2. Postgres (durable store)
    profile = await _pg_load(tenant_id, phone_hash)
    if profile is not None:
        await _cache_set(rkey, profile)          # warm the cache
        logger.info(
            "caller_memory: returning caller tenant=%s calls=%d",
            tenant_id, profile.get("total_calls", 0),
        )
        return profile

    return {}


# ─────────────────────────────────────────────────────────────────────────────
# Groq LLM call summariser
# ─────────────────────────────────────────────────────────────────────────────

async def _summarise_call(turns: list[dict[str, str]], language: str = "en") -> tuple[str, dict]:
    """
    Call Groq llama3-8b to produce a 2-3 sentence summary + key fact extraction.
    Returns (summary_text, key_facts_dict).
    Falls back to a simple concatenation if Groq is unavailable.
    """
    if not _GROQ_API_KEY or not turns:
        # Fallback: last 3 caller utterances joined
        snippets = [t.get("caller", "") for t in turns[-3:] if t.get("caller")]
        return " | ".join(snippets) or "Call completed.", {}

    # Build transcript text (caller lines only for brevity, keep < 800 tokens)
    lines: list[str] = []
    for t in turns:
        if t.get("caller"):
            lines.append(f"Caller: {t['caller']}")
        if t.get("agent"):
            lines.append(f"Agent: {t['agent']}")
    transcript = "\n".join(lines[-30:])   # last 30 lines

    lang_instruction = {
        "ta": "Respond in Tamil (Tamil script).",
        "hi": "Respond in Hindi (Devanagari script).",
    }.get(language, "Respond in English.")

    system = (
        "You are a concise call-summary assistant. "
        "Given a voice call transcript, produce:\n"
        "1. A 2-3 sentence plain-language summary of what was discussed.\n"
        "2. A JSON object of key facts: budget, property_type, location, "
        "appointment_date, appointment_time, caller_name (extract only what is present).\n\n"
        f"{lang_instruction}\n\n"
        "Output format (strict):\n"
        "SUMMARY: <text>\n"
        "FACTS: <json object>"
    )

    try:
        from groq import AsyncGroq
        client = AsyncGroq(api_key=_GROQ_API_KEY)
        response = await client.chat.completions.create(
            model=_SUMMARY_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": f"Transcript:\n{transcript}"},
            ],
            max_tokens=300,
            temperature=0.2,
        )
        text = response.choices[0].message.content or ""

        summary  = ""
        key_facts: dict = {}

        for line in text.splitlines():
            if line.startswith("SUMMARY:"):
                summary = line[len("SUMMARY:"):].strip()
            elif line.startswith("FACTS:"):
                raw_json = line[len("FACTS:"):].strip()
                try:
                    key_facts = json.loads(raw_json)
                except json.JSONDecodeError:
                    pass

        if not summary:
            summary = text[:300].strip()

        return summary, key_facts

    except Exception as exc:
        logger.warning("caller_memory: Groq summary failed (%s) — using fallback", exc)
        snippets = [t.get("caller", "") for t in turns[-3:] if t.get("caller")]
        return " | ".join(snippets) or "Call completed.", {}


# ─────────────────────────────────────────────────────────────────────────────
# Entity extraction (fast keyword-based, no API call)
# ─────────────────────────────────────────────────────────────────────────────

_NAME_PATTERNS = [
    re.compile(r"(?:my name is|i am|i'm|naan|naanu|naam hai)\s+([A-Za-z\u0B80-\u0BFF\u0900-\u097F]{2,30})", re.I),
    re.compile(r"(?:ennoda peyar|en peyar|mera naam)\s+([A-Za-z\u0B80-\u0BFF\u0900-\u097F]{2,30})", re.I),
]
_PRICE_PATTERNS = [
    re.compile(r"(?:₹|rs\.?|inr)\s*([\d,]+(?:\s*(?:lakh|lac|L|cr|crore|k))?)", re.I),
    re.compile(r"([\d,]+)\s*(?:lakh|lac|L|cr|crore)\b", re.I),
]
_DATE_PATTERN = re.compile(
    r"\b(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|"
    r"(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|"
    r"tomorrow|today|next week|"
    r"திங்கள்|செவ்வாய்|புதன்|வியாழன்|வெள்ளி|சனி|ஞாயிறு|நாளை|இன்று))\b",
    re.I,
)
_TIME_PATTERN    = re.compile(r"\b(\d{1,2}(?::\d{2})?\s*(?:am|pm|மணி|மணிக்கு))\b", re.I)
_LOCATION_WORDS  = {
    "velachery","adyar","anna nagar","t nagar","tambaram","porur",
    "omr","ecr","sholinganallur","perambur","chromepet","pallavaram",
    "guindy","kodambakkam","nungambakkam","mylapore","besant nagar",
    "coimbatore","madurai","trichy","salem","tirunelveli","vellore",
    "erode","tirupur","thanjavur","pondicherry",
    "bangalore","bengaluru","hyderabad","mumbai","delhi","pune",
}


def extract_entities(text: str) -> dict[str, str]:
    """Extract named entities from a single turn transcript (fast, no API)."""
    if not text:
        return {}
    found: dict[str, str] = {}
    lower = text.lower()

    for pat in _NAME_PATTERNS:
        m = pat.search(text)
        if m:
            found["caller_name"] = m.group(1).strip().title()
            break

    for pat in _PRICE_PATTERNS:
        m = pat.search(text)
        if m:
            found["price_discussed"] = m.group(0).strip()
            break

    m = _DATE_PATTERN.search(text)
    if m:
        found["appointment_date"] = m.group(1)

    m = _TIME_PATTERN.search(text)
    if m:
        found["appointment_time"] = m.group(1)

    for loc in _LOCATION_WORDS:
        if loc in lower:
            found["property_location"] = loc.title()
            break

    return found


# ─────────────────────────────────────────────────────────────────────────────
# System-prompt memory block builder
# ─────────────────────────────────────────────────────────────────────────────

def build_memory_prompt(profile: dict[str, Any], language: str = "en") -> str:
    """
    Return a block to prepend to the agent system prompt.
    Returns empty string for new callers (no history yet).
    """
    if not profile or profile.get("total_calls", 0) == 0:
        return ""

    name         = profile.get("name") or profile.get("caller_name", "")
    call_count   = profile.get("total_calls", 0)
    last_intent  = profile.get("last_intent", "")
    last_call    = (profile.get("last_call_at") or "")[:10]
    key_facts    = profile.get("key_facts", {})
    notes        = profile.get("notes", [])
    summaries    = profile.get("conv_summaries", [])
    last_summary = summaries[-1].get("summary", "") if summaries else ""

    if language == "ta":
        lines = ["[திரும்பி அழைக்கும் வாடிக்கையாளர் — முன்பு பேசியதை நினைவில் வையுங்கள்]"]
        if name:           lines.append(f"பெயர்: {name}")
        if call_count > 1: lines.append(f"மொத்த அழைப்புகள்: {call_count}")
        if last_call:      lines.append(f"கடைசி அழைப்பு: {last_call}")
        if last_intent:    lines.append(f"கடைசி தேவை: {last_intent}")
        if last_summary:   lines.append(f"கடைசி அழைப்பு சுருக்கம்: {last_summary}")
        for k, v in key_facts.items():
            lines.append(f"{k}: {v}")
        if notes:          lines.append("குறிப்புகள்: " + "; ".join(notes[:3]))

    elif language == "hi":
        lines = ["[वापस आए caller — पिछली बातचीत याद रखें]"]
        if name:           lines.append(f"नाम: {name}")
        if call_count > 1: lines.append(f"कुल कॉल: {call_count}")
        if last_call:      lines.append(f"अंतिम कॉल: {last_call}")
        if last_intent:    lines.append(f"पिछला उद्देश्य: {last_intent}")
        if last_summary:   lines.append(f"पिछली कॉल सारांश: {last_summary}")
        for k, v in key_facts.items():
            lines.append(f"{k}: {v}")
        if notes:          lines.append("नोट्स: " + "; ".join(notes[:3]))

    else:
        lines = ["[RETURNING CALLER — use their history below]"]
        if name:           lines.append(f"Name: {name}")
        if call_count > 1: lines.append(f"Total calls: {call_count}")
        if last_call:      lines.append(f"Last call: {last_call}")
        if last_intent:    lines.append(f"Last intent: {last_intent}")
        if last_summary:   lines.append(f"Last call summary: {last_summary}")
        for k, v in key_facts.items():
            lines.append(f"{k}: {v}")
        if notes:          lines.append("Notes: " + "; ".join(notes[:3]))

    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# Call lifecycle  (public API used by orchestrator)
# ─────────────────────────────────────────────────────────────────────────────

async def on_call_start(
    tenant_id: str,
    phone: str,
    language: str = "en",
) -> tuple[dict, str]:
    """
    Called when a call begins.
    Returns (profile, memory_prompt_block).
    profile is {} for first-time callers — the memory block will be empty.
    """
    profile      = await load_profile(tenant_id, phone)
    prompt_block = build_memory_prompt(profile, language=language)
    return profile, prompt_block


async def on_turn_end(
    phone: str,
    profile: dict[str, Any],
    transcript: str,
    agent_text: str,
    turn_buffer: list[dict[str, str]],
    intent: str     = "",
    language: str   = "en",
    emotion: str    = "neutral",
) -> None:
    """
    Called after each STT→LLM→TTS cycle.
    Updates the in-memory profile dict and appends to turn_buffer (no DB write).
    turn_buffer is a list of {"caller": ..., "agent": ...} dicts for the summariser.
    """
    if not phone:
        return

    # Accumulate turn for later summarisation
    turn_buffer.append({"caller": transcript, "agent": agent_text})

    # Extract entities from caller speech
    new_entities = extract_entities(transcript)
    profile.setdefault("key_facts", {}).update(
        {k: v for k, v in new_entities.items() if v}
    )

    # Promote caller_name to top-level profile
    if "caller_name" in new_entities and not profile.get("name"):
        profile["name"] = new_entities["caller_name"]

    if intent:
        profile["last_intent"] = intent

    profile["language"] = language

    # Update emotion history (keep last 10)
    if emotion and emotion != "neutral":
        history = profile.get("emotion_history", [])
        history.append(emotion)
        profile["emotion_history"] = history[-10:]


async def on_call_end(
    tenant_id:   str,
    phone:       str,
    profile:     dict[str, Any],
    turn_buffer: list[dict[str, str]],
    final_intent: str = "",
    outcome:      str = "",
    note:         str = "",
    language:     str = "en",
    duration_sec: float = 0.0,
    call_id:      str = "",
) -> int | None:
    """
    Called when the call ends.
    1. Groq-summarises the call using turn_buffer.
    2. Appends summary to conv_summaries.
    3. Upserts to Postgres (permanent).
    4. Updates Redis cache.
    Returns the caller_memory row id (or None on failure).
    """
    if not phone or not tenant_id:
        return None

    phone_hash = _hash_phone(phone)
    now_iso    = datetime.now(UTC).isoformat()

    # Finalise profile fields
    profile["total_calls"] = profile.get("total_calls", 0) + 1
    profile["last_call_at"] = now_iso
    if final_intent:
        profile["last_intent"] = final_intent
    if note:
        notes = profile.get("notes", [])
        notes.append(note)
        profile["notes"] = notes[-20:]

    # Groq summarisation
    summary_text, llm_facts = await _summarise_call(turn_buffer, language=language)

    # Merge LLM-extracted facts into key_facts
    profile.setdefault("key_facts", {}).update(
        {k: v for k, v in llm_facts.items() if v}
    )

    # Append to conv_summaries (keep last 20 calls)
    summaries = profile.get("conv_summaries", [])
    summaries.append({
        "date":         now_iso[:10],
        "summary":      summary_text,
        "intent":       final_intent or profile.get("last_intent", ""),
        "outcome":      outcome,
        "duration_sec": round(duration_sec),
        "call_id":      call_id,
    })
    profile["conv_summaries"] = summaries[-20:]

    # 1. Write to Postgres (source of truth)
    row_id = await _pg_upsert(tenant_id, phone_hash, profile)

    # 2. Update Redis cache
    rkey = _redis_key(tenant_id, phone_hash)
    await _cache_set(rkey, profile)

    logger.info(
        "caller_memory: saved tenant=%s calls=%d summary_len=%d",
        tenant_id, profile.get("total_calls", 0), len(summary_text),
    )
    return row_id
