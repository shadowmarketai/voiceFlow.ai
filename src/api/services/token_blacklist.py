"""
Token blacklist — W8.1.

When a user logs out or refreshes, the old token's JTI gets blacklisted
so it can't be replayed. Uses Redis if available, else in-memory set
with TTL garbage collection.

Usage:
    from api.services.token_blacklist import blacklist_token, is_blacklisted

    blacklist_token(jti="abc123", expires_at=datetime(...))
    if is_blacklisted(jti="abc123"):
        raise 401
"""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime
from typing import Optional

log = logging.getLogger(__name__)


class _MemoryBlacklist:
    """In-process set with TTL eviction. Good enough for single-pod deploys."""

    def __init__(self):
        self._data: dict[str, float] = {}
        self._last_gc = time.time()

    def add(self, jti: str, expires_at: float) -> None:
        self._data[jti] = expires_at
        self._maybe_gc()

    def contains(self, jti: str) -> bool:
        exp = self._data.get(jti)
        if exp is None:
            return False
        if time.time() > exp:
            self._data.pop(jti, None)
            return False
        return True

    def _maybe_gc(self):
        now = time.time()
        if now - self._last_gc < 300:
            return
        self._last_gc = now
        self._data = {k: v for k, v in self._data.items() if v > now}


class _RedisBlacklist:
    def __init__(self, url: str):
        import redis as redis_lib
        self._r = redis_lib.from_url(url, socket_connect_timeout=2, decode_responses=True)
        self._r.ping()

    def add(self, jti: str, expires_at: float) -> None:
        ttl = max(1, int(expires_at - time.time()))
        self._r.set(f"token_blacklist:{jti}", "1", ex=ttl)

    def contains(self, jti: str) -> bool:
        return bool(self._r.exists(f"token_blacklist:{jti}"))


_backend: Optional[_MemoryBlacklist | _RedisBlacklist] = None


def _get():
    global _backend
    if _backend is not None:
        return _backend
    url = os.environ.get("REDIS_URL", "")
    if url:
        try:
            _backend = _RedisBlacklist(url)
            log.info("token_blacklist: using Redis")
            return _backend
        except Exception as exc:
            log.warning("token_blacklist: Redis init failed (%s), in-memory fallback", exc)
    _backend = _MemoryBlacklist()
    log.info("token_blacklist: using in-memory")
    return _backend


def blacklist_token(jti: str, expires_at: datetime | float) -> None:
    """Add a JTI to the blacklist. Entries auto-expire when the token would."""
    if not jti:
        return
    exp = expires_at.timestamp() if isinstance(expires_at, datetime) else float(expires_at)
    try:
        _get().add(jti, exp)
    except Exception as exc:
        log.warning("blacklist_token failed: %s", exc)


def is_blacklisted(jti: str | None) -> bool:
    """Check if a JTI is on the blacklist."""
    if not jti:
        return False
    try:
        return _get().contains(jti)
    except Exception:
        return False
