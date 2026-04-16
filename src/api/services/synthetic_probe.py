"""
Synthetic pipeline probe — W3.3.

On-demand:
    await run_synthetic_turn() -> dict with latency + ok

Background (opt-in via SYNTHETIC_PROBE_ENABLED=true):
    start_in_background() schedules a probe every SYNTHETIC_PROBE_INTERVAL
    seconds (default 900s / 15 min). Each tick does one LLM roundtrip and
    writes a CallMetric row so the Quality Dashboard can filter it out via
    agent_id == "__synthetic__".

LLM-only by default (STT/TTS reachability is covered by provider probes).
Keeps API-credit burn bounded; upgrade to full STT→LLM→TTS when the user
explicitly flips SYNTHETIC_FULL_PIPELINE=true.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any

import httpx

from api.services.quality_store import record_call, record_uptime_probe

log = logging.getLogger(__name__)

DEFAULT_INTERVAL_SEC = int(os.getenv("SYNTHETIC_PROBE_INTERVAL", "900"))
ENABLED = os.getenv("SYNTHETIC_PROBE_ENABLED", "false").lower() == "true"
FULL_PIPELINE = os.getenv("SYNTHETIC_FULL_PIPELINE", "false").lower() == "true"

_PROBE_PROMPT = "Reply with the single word OK."
_AGENT_ID = "__synthetic__"


async def _probe_llm_groq() -> dict[str, Any]:
    """One Groq chat roundtrip — cheapest proxy for 'LLM path is alive'."""
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        return {"ok": False, "latency_ms": None, "note": "no GROQ_API_KEY"}
    t0 = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": "llama-3.1-8b-instant",
                    "messages": [
                        {"role": "system", "content": "You are a health probe."},
                        {"role": "user", "content": _PROBE_PROMPT},
                    ],
                    "max_tokens": 4,
                    "temperature": 0.0,
                },
            )
        latency_ms = int((time.perf_counter() - t0) * 1000)
        ok = resp.status_code == 200
        return {"ok": ok, "latency_ms": latency_ms, "http_status": resp.status_code}
    except Exception as exc:
        return {"ok": False, "latency_ms": None, "note": str(exc)[:80]}


async def run_synthetic_turn() -> dict[str, Any]:
    """Run one synthetic pipeline turn. Persist to CallMetric + UptimeProbe."""
    t0 = time.perf_counter()
    llm = await _probe_llm_groq()
    total_ms = int((time.perf_counter() - t0) * 1000)

    record_call(
        agent_id=_AGENT_ID,
        language="en",
        duration_sec=total_ms / 1000.0,
        llm_ms=llm.get("latency_ms"),
        total_ms=total_ms,
        intent_ok=bool(llm.get("ok")),
        completed=bool(llm.get("ok")),
    )
    record_uptime_probe(service="synthetic_call", ok=bool(llm.get("ok")), latency_ms=total_ms)

    if not llm.get("ok"):
        # Capture in Sentry when configured — surfaces in release dashboards.
        try:
            import sentry_sdk
            sentry_sdk.capture_message(
                f"Synthetic pipeline probe failed: {llm.get('note') or llm.get('http_status')}",
                level="warning",
            )
        except Exception:
            pass

    return {"ok": bool(llm.get("ok")), "total_ms": total_ms, "llm": llm}


async def _run_forever(interval: int):
    log.info("synthetic probe starting — every %ds (full=%s)", interval, FULL_PIPELINE)
    # Warm-up delay so app fully starts before first probe.
    await asyncio.sleep(min(60, interval))
    while True:
        try:
            r = await run_synthetic_turn()
            if not r["ok"]:
                log.warning("synthetic probe failed: %s", r.get("llm"))
        except Exception as exc:
            log.warning("synthetic probe errored: %s", exc)
        await asyncio.sleep(interval)


_task: asyncio.Task | None = None


def start_in_background(loop: asyncio.AbstractEventLoop | None = None) -> None:
    """Schedule periodic synthetic probes. No-op unless SYNTHETIC_PROBE_ENABLED=true."""
    global _task
    if not ENABLED:
        log.info("synthetic probe disabled (set SYNTHETIC_PROBE_ENABLED=true to enable)")
        return
    if _task and not _task.done():
        return
    loop = loop or asyncio.get_event_loop()
    _task = loop.create_task(_run_forever(DEFAULT_INTERVAL_SEC))
    log.info("synthetic probe scheduled")
