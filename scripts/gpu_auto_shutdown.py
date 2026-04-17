#!/usr/bin/env python3
"""
GPU Auto-Shutdown Worker
========================
Monitors active S2S calls on the E2E GPU server.
Shuts down the GPU pod after IDLE_TIMEOUT_MIN minutes of no active S2S calls.
Auto-starts the pod when a new S2S call is initiated.

Run on the E2E GPU server:
    python scripts/gpu_auto_shutdown.py

Or as a systemd service / Docker sidecar alongside the Moshi server.

Environment variables:
    IDLE_TIMEOUT_MIN    minutes of idle before shutdown (default: 10)
    CHECK_INTERVAL_S    seconds between checks (default: 30)
    E2E_POD_ID          E2E Networks pod ID (from e2enetworks.com dashboard)
    E2E_API_KEY         E2E Networks API key
    E2E_PROJECT_ID      E2E Networks project ID
    MOSHI_SERVER_URL    Moshi WebSocket server URL (default: ws://localhost:8998)
    STATUS_PORT         Port to expose /status endpoint (default: 9010)

Cost savings:
    L4 GPU at ₹17/hr × idle hours avoided:
    10 calls/day × 8hr call windows = 16hr active → 8hr idle = ₹136/day = ₹4,080/mo saved
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [gpu-shutdown] %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

_IDLE_TIMEOUT_MIN  = int(os.getenv("IDLE_TIMEOUT_MIN", "10"))
_CHECK_INTERVAL_S  = int(os.getenv("CHECK_INTERVAL_S", "30"))
_E2E_POD_ID        = os.getenv("E2E_POD_ID", "")
_E2E_API_KEY       = os.getenv("E2E_API_KEY", "")
_E2E_PROJECT_ID    = os.getenv("E2E_PROJECT_ID", "")
_MOSHI_URL         = os.getenv("MOSHI_SERVER_URL", "ws://localhost:8998")
_STATUS_PORT       = int(os.getenv("STATUS_PORT", "9010"))

_E2E_BASE          = "https://api.e2enetworks.com/myaccount/api/v1"


# ─────────────────────────────────────────────────────────────────────────────
# Call activity tracker
# ─────────────────────────────────────────────────────────────────────────────

class CallTracker:
    """Tracks active S2S call count in shared state."""

    def __init__(self):
        self._active_calls: dict[str, float] = {}  # call_id → start_ts
        self._last_activity: float = time.time()

    def register_call(self, call_id: str) -> None:
        self._active_calls[call_id] = time.time()
        self._last_activity = time.time()
        logger.info("Call started: %s (active=%d)", call_id, len(self._active_calls))

    def end_call(self, call_id: str) -> None:
        self._active_calls.pop(call_id, None)
        self._last_activity = time.time()
        logger.info("Call ended: %s (active=%d)", call_id, len(self._active_calls))

    @property
    def active_count(self) -> int:
        return len(self._active_calls)

    @property
    def idle_seconds(self) -> float:
        return time.time() - self._last_activity

    @property
    def is_idle(self) -> bool:
        return self.active_count == 0 and self.idle_seconds >= (_IDLE_TIMEOUT_MIN * 60)

    def to_dict(self) -> dict:
        return {
            "active_calls": self.active_count,
            "idle_seconds": round(self.idle_seconds),
            "idle_timeout_min": _IDLE_TIMEOUT_MIN,
            "will_shutdown_in_s": max(
                0, _IDLE_TIMEOUT_MIN * 60 - int(self.idle_seconds)
            ) if self.active_count == 0 else None,
        }


_tracker = CallTracker()


# ─────────────────────────────────────────────────────────────────────────────
# E2E GPU API
# ─────────────────────────────────────────────────────────────────────────────

class E2EGpuManager:
    """Controls E2E Networks GPU pod lifecycle."""

    def __init__(self):
        self._headers = {
            "Authorization": f"Bearer {_E2E_API_KEY}",
            "Content-Type": "application/json",
        }

    async def get_pod_status(self) -> str:
        """Returns: running | stopped | starting | stopping | unknown"""
        if not _E2E_POD_ID or not _E2E_API_KEY:
            return "unknown"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{_E2E_BASE}/gpu/pods/{_E2E_POD_ID}/",
                    headers=self._headers,
                    params={"apikey": _E2E_API_KEY},
                )
                data = resp.json()
                return data.get("data", {}).get("status", "unknown").lower()
        except Exception as exc:
            logger.warning("E2E status check failed: %s", exc)
            return "unknown"

    async def shutdown_pod(self) -> bool:
        """Stop the GPU pod. Returns True if API call succeeded."""
        if not _E2E_POD_ID or not _E2E_API_KEY:
            logger.info("No E2E credentials — simulating shutdown (dry run)")
            return True
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{_E2E_BASE}/gpu/pods/{_E2E_POD_ID}/stop/",
                    headers=self._headers,
                    params={"apikey": _E2E_API_KEY},
                )
                if resp.status_code in (200, 202):
                    logger.info("E2E GPU pod shutdown initiated (pod=%s)", _E2E_POD_ID)
                    return True
                logger.warning("E2E shutdown response: %d %s", resp.status_code, resp.text[:100])
                return False
        except Exception as exc:
            logger.error("E2E shutdown failed: %s", exc)
            return False

    async def start_pod(self) -> bool:
        """Start the GPU pod. Called by VoiceFlow API when S2S call arrives."""
        if not _E2E_POD_ID or not _E2E_API_KEY:
            logger.info("No E2E credentials — simulating start (dry run)")
            return True
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{_E2E_BASE}/gpu/pods/{_E2E_POD_ID}/start/",
                    headers=self._headers,
                    params={"apikey": _E2E_API_KEY},
                )
                return resp.status_code in (200, 202)
        except Exception as exc:
            logger.error("E2E start failed: %s", exc)
            return False


# ─────────────────────────────────────────────────────────────────────────────
# Moshi active-session counter (via WebSocket probe)
# ─────────────────────────────────────────────────────────────────────────────

async def probe_moshi_active_sessions() -> int:
    """
    Probe the Moshi server's /status endpoint for active session count.
    Falls back to 0 if unreachable (server starting or stopped).
    """
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            resp = await client.get(
                f"{_MOSHI_URL.replace('ws://', 'http://').replace('wss://', 'https://')}/status"
            )
            data = resp.json()
            return int(data.get("active_sessions", 0))
    except Exception:
        return 0


# ─────────────────────────────────────────────────────────────────────────────
# Status HTTP server (for health checks)
# ─────────────────────────────────────────────────────────────────────────────

class StatusHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps(_tracker.to_dict()).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass  # suppress access logs


def _start_status_server():
    server = HTTPServer(("0.0.0.0", _STATUS_PORT), StatusHandler)
    Thread(target=server.serve_forever, daemon=True).start()
    logger.info("Status server on :%d", _STATUS_PORT)


# ─────────────────────────────────────────────────────────────────────────────
# Main loop
# ─────────────────────────────────────────────────────────────────────────────

async def main():
    _start_status_server()
    gpu = E2EGpuManager()
    shutdown_triggered = False

    logger.info(
        "GPU auto-shutdown monitor started — idle timeout: %dmin, check every: %ds",
        _IDLE_TIMEOUT_MIN, _CHECK_INTERVAL_S,
    )

    while True:
        await asyncio.sleep(_CHECK_INTERVAL_S)

        # Use Moshi session count as ground truth if available
        moshi_sessions = await probe_moshi_active_sessions()
        if moshi_sessions > 0 and _tracker.active_count == 0:
            _tracker._last_activity = time.time()
            logger.info("Moshi reports %d active sessions — resetting idle timer", moshi_sessions)

        if _tracker.is_idle and not shutdown_triggered:
            logger.info(
                "GPU idle for %.0f minutes — initiating shutdown",
                _tracker.idle_seconds / 60,
            )
            status = await gpu.get_pod_status()
            if status not in ("stopped", "stopping"):
                ok = await gpu.shutdown_pod()
                if ok:
                    shutdown_triggered = True
                    logger.info("GPU pod shutdown complete. Saves ~₹%.0f/day", 17 / 24 * _IDLE_TIMEOUT_MIN)
        elif not _tracker.is_idle:
            if shutdown_triggered:
                logger.info("Activity resumed — reset shutdown flag")
            shutdown_triggered = False


if __name__ == "__main__":
    asyncio.run(main())
