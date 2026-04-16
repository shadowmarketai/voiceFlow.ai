"""
Background uptime monitor — polls internal endpoints every N seconds and
persists each tick to `quality_uptime_probes`. Rolled up by
quality_store.uptime_percent().

W3.2 — also probes each STT/LLM/TTS provider every PROVIDER_PROBE_INTERVAL
seconds (default 300s / 5 min) and records into `quality_provider_probes`.

Started in api.server._register_lifecycle on app startup.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time

import httpx

from api.services.quality_store import record_provider_probe, record_uptime_probe

log = logging.getLogger(__name__)


DEFAULT_INTERVAL_SEC = int(os.getenv("UPTIME_PROBE_INTERVAL", "60"))
PROVIDER_PROBE_INTERVAL_SEC = int(os.getenv("PROVIDER_PROBE_INTERVAL", "300"))
DEFAULT_BASE_URL = os.getenv("UPTIME_PROBE_BASE_URL", "http://127.0.0.1:8001")

# Self-probe checks (cheap — no auth, no external network)
CHECKS = [
    ("api", "/api/health", 500),
    ("docs", "/docs", 500),
    ("quality", "/api/v1/quality/uptime", 500),
]


async def _self_tick(client: httpx.AsyncClient, base_url: str):
    """Probe local endpoints and record uptime_probe rows."""
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


async def _provider_tick():
    """Probe each STT/LLM/TTS provider once and persist results.

    Imported lazily so app startup isn't blocked by quality router import errors.
    """
    try:
        from api.routers.quality import PROBES, _probe
    except Exception as exc:
        log.warning("provider probe skipped — quality router import failed: %s", exc)
        return

    for category, probes in PROBES.items():
        tasks = [_probe(*p) for p in probes]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, Exception) or not isinstance(r, dict):
                continue
            if r.get("status") == "not_configured":
                continue
            record_provider_probe(
                category=category,
                provider=r["name"],
                latency_ms=r.get("latency_ms"),
                ok=r.get("ok", False),
                http_status=r.get("http_status"),
                note=r.get("status"),
            )


async def run_forever(interval: int = DEFAULT_INTERVAL_SEC,
                      base_url: str = DEFAULT_BASE_URL) -> None:
    log.info("uptime monitor starting — self=%ds provider=%ds base=%s",
             interval, PROVIDER_PROBE_INTERVAL_SEC, base_url)
    ticks = 0
    provider_every = max(1, PROVIDER_PROBE_INTERVAL_SEC // max(1, interval))
    async with httpx.AsyncClient() as client:
        while True:
            try:
                await _self_tick(client, base_url)
                if ticks % provider_every == 0:
                    await _provider_tick()
            except Exception as exc:
                log.warning("uptime probe tick failed: %s", exc)
            ticks += 1
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
