"""
Background uptime monitor — polls internal endpoints every N seconds and
persists each tick to `quality_uptime_probes`. Rolled up by
quality_store.uptime_percent().

Started in api.server._register_lifecycle on app startup.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time

import httpx

from api.services.quality_store import record_uptime_probe

log = logging.getLogger(__name__)


DEFAULT_INTERVAL_SEC = int(os.getenv("UPTIME_PROBE_INTERVAL", "60"))
DEFAULT_BASE_URL = os.getenv("UPTIME_PROBE_BASE_URL", "http://127.0.0.1:8001")

# (service-key, relative-url, expected-status-max)
CHECKS = [
    ("api", "/api/health", 500),
    ("docs", "/docs", 500),
    ("quality", "/api/v1/quality/uptime", 500),
]


async def _tick(client: httpx.AsyncClient, base_url: str):
    for service, path, max_ok in CHECKS:
        t0 = time.perf_counter()
        ok = False
        try:
            resp = await client.get(f"{base_url}{path}", timeout=5.0)
            ok = resp.status_code < max_ok
        except Exception:
            ok = False
        latency_ms = int((time.perf_counter() - t0) * 1000)
        record_uptime_probe(service=service, ok=ok, latency_ms=latency_ms)


async def run_forever(interval: int = DEFAULT_INTERVAL_SEC,
                      base_url: str = DEFAULT_BASE_URL) -> None:
    log.info("uptime monitor starting — %s every %ds", base_url, interval)
    async with httpx.AsyncClient() as client:
        while True:
            try:
                await _tick(client, base_url)
            except Exception as exc:
                log.warning("uptime probe tick failed: %s", exc)
            await asyncio.sleep(interval)


_task: asyncio.Task | None = None


def start_in_background(loop: asyncio.AbstractEventLoop | None = None) -> None:
    """Kick off the probe loop. Safe to call multiple times (no-op on second)."""
    global _task
    if _task and not _task.done():
        return
    if os.getenv("UPTIME_PROBE_ENABLED", "true").lower() != "true":
        log.info("uptime monitor disabled via UPTIME_PROBE_ENABLED=false")
        return
    loop = loop or asyncio.get_event_loop()
    _task = loop.create_task(run_forever())
    log.info("uptime monitor scheduled")
