"""
W6.2 — LLM+TTS response cache.

For FAQ-heavy agents ("what are your hours", "do you ship to Chennai")
the same question comes in thousands of times with trivial variation.
Caching the LLM text *and* the TTS audio means a hit skips the entire
pipeline — zero STT/LLM/TTS cost, latency drops to ~30ms.

Backend:
  - Redis if REDIS_URL is set (shared across pods).
  - Else in-memory LRU with TTL (per-process).

Keying:
  sha256(agent_id || language || normalized_text)
  normalized = lower + strip punct + collapse whitespace.

Opt-in via env var RESPONSE_CACHE_ENABLED=true (default false during rollout).
Agents that handle personalised flows should leave it off.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import time
from collections import OrderedDict
from typing import Any

log = logging.getLogger(__name__)

ENABLED = os.getenv("RESPONSE_CACHE_ENABLED", "false").lower() == "true"
TTL_SECONDS = int(os.getenv("RESPONSE_CACHE_TTL", "3600"))
MAX_CHARS = int(os.getenv("RESPONSE_CACHE_MAX_CHARS", "120"))
LRU_MAX = int(os.getenv("RESPONSE_CACHE_LRU_MAX", "5000"))

_PUNCT_RE = re.compile(r"[^\w\s\u0900-\u0DFF\u0600-\u06FF]+")


def _normalize(text: str) -> str:
    t = (text or "").strip().lower()
    t = _PUNCT_RE.sub("", t)
    t = re.sub(r"\s+", " ", t)
    return t


def _key(agent_id: str | None, language: str | None, text: str) -> str:
    raw = f"{agent_id or ''}|{(language or '').lower()}|{_normalize(text)}"
    return "voiceflow:cache:" + hashlib.sha256(raw.encode()).hexdigest()[:32]


# ── Backend adapters ─────────────────────────────────────────────────────

class _MemoryBackend:
    def __init__(self, max_items: int):
        self._data: OrderedDict[str, tuple[float, str]] = OrderedDict()
        self._max = max_items

    def get(self, key: str) -> dict | None:
        row = self._data.get(key)
        if not row:
            return None
        expires_at, value = row
        if time.time() > expires_at:
            self._data.pop(key, None)
            return None
        self._data.move_to_end(key)
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return None

    def set(self, key: str, value: dict, ttl: int) -> None:
        self._data[key] = (time.time() + ttl, json.dumps(value))
        self._data.move_to_end(key)
        while len(self._data) > self._max:
            self._data.popitem(last=False)


class _RedisBackend:
    def __init__(self, url: str):
        import redis as redis_lib
        self._r = redis_lib.from_url(url, socket_connect_timeout=2, decode_responses=True)
        # Ping once to surface connection errors at startup
        self._r.ping()

    def get(self, key: str) -> dict | None:
        raw = self._r.get(key)
        if not raw:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None

    def set(self, key: str, value: dict, ttl: int) -> None:
        self._r.set(key, json.dumps(value), ex=ttl)


_backend = None


def _get_backend():
    global _backend
    if _backend is not None:
        return _backend
    url = os.environ.get("REDIS_URL", "")
    if url:
        try:
            _backend = _RedisBackend(url)
            log.info("response_cache: using Redis")
            return _backend
        except Exception as exc:
            log.warning("response_cache: Redis init failed (%s), falling back to memory", exc)
    _backend = _MemoryBackend(LRU_MAX)
    log.info("response_cache: using in-memory LRU (max=%d)", LRU_MAX)
    return _backend


# ── Public API ───────────────────────────────────────────────────────────

_hits = 0
_misses = 0
_skipped = 0


def lookup(agent_id: str | None, language: str | None, text: str) -> dict | None:
    """Return cached payload or None. No-op when cache is disabled.

    We only cache SHORT user inputs — long/personalised questions rarely
    repeat verbatim and caching them wastes memory.
    """
    global _hits, _misses, _skipped
    if not ENABLED:
        return None
    if not text or len(text) > MAX_CHARS:
        _skipped += 1
        return None
    b = _get_backend()
    result = b.get(_key(agent_id, language, text))
    if result:
        _hits += 1
        return result
    _misses += 1
    return None


def store(agent_id: str | None, language: str | None, text: str, payload: dict) -> None:
    """Cache a completed turn's text + audio. Payload must be small JSON
    (~100KB with base64 audio) — we cap audio to 10s clips upstream."""
    if not ENABLED:
        return
    if not text or len(text) > MAX_CHARS:
        return
    try:
        b = _get_backend()
        b.set(_key(agent_id, language, text), payload, TTL_SECONDS)
    except Exception as exc:
        log.warning("response_cache.store failed: %s", exc)


def stats() -> dict[str, Any]:
    total = _hits + _misses
    return {
        "enabled": ENABLED,
        "backend": "redis" if os.environ.get("REDIS_URL") else "memory",
        "ttl_seconds": TTL_SECONDS,
        "hits": _hits,
        "misses": _misses,
        "skipped": _skipped,
        "hit_rate_pct": round(_hits / total * 100, 1) if total else None,
    }
