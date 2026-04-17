"""
PipelineRouter — Track A / B / C / D routing + auto-fallback
=============================================================

Routes every call to the best available pipeline based on:
  1. language   — Indic → Track A default; Tamil premium → Track C
  2. client_tier — premium/enterprise English → Track B (Gemini Live)
  3. availability flags — updated every 30s by a health-check task

Track mapping:
  A  — Parallel pipeline  (Deepgram/Sarvam → Groq → Sarvam/ElevenLabs)
  B  — Gemini Live S2S    (English enterprise, ~250ms TTFA)
  C  — Moshi S2S          (self-hosted Tamil, ~200ms TTFA, E2E GPU)
  D  — Sarvam S2S         (stub — flip flag when API launches)

Fallback chain (hard-coded):
  C → A     (if Moshi GPU is down, fall back to parallel)
  B → A     (if Gemini API is down, fall back to parallel)
  D → C → A
"""

from __future__ import annotations

import asyncio
import logging
import os
from enum import Enum

logger = logging.getLogger(__name__)


class Track(str, Enum):
    A = "parallel"      # always on
    B = "gemini_s2s"    # Gemini Live
    C = "moshi"         # self-hosted Moshi
    D = "sarvam_s2s"    # Sarvam S2S (stub)


# Indic language codes that go to Tamil/Indic S2S when available
_INDIC_CODES = {
    "ta", "hi", "te", "kn", "ml", "bn", "mr", "gu",
    "pa", "or", "as", "ur", "ne", "kok", "mni",
}

_PREMIUM_TIERS = {"premium", "enterprise"}


class PipelineRouter:
    """
    Stateless router — call `.route()` per call to get the right Track.

    Availability flags are toggled by the HealthCheckWorker background task.
    All flags are False by default; Track A is always treated as available.
    """

    def __init__(self):
        self._availability: dict[Track, bool] = {
            Track.A: True,   # always available
            Track.B: False,  # set True when GEMINI_API_KEY is set
            Track.C: False,  # set True when MOSHI_AVAILABLE=true
            Track.D: False,  # set True when SARVAM_S2S_AVAILABLE=true
        }
        # Auto-enable based on env vars at startup
        if os.getenv("GEMINI_API_KEY"):
            self._availability[Track.B] = True
        if os.getenv("MOSHI_AVAILABLE", "").lower() in ("1", "true"):
            self._availability[Track.C] = True
        if os.getenv("SARVAM_S2S_AVAILABLE", "").lower() in ("1", "true"):
            self._availability[Track.D] = True

    # ── Public API ───────────────────────────────────────────────────────────

    def route(
        self,
        language: str = "en",
        client_tier: str = "standard",
        force_track: str | None = None,
    ) -> Track:
        """
        Return the best Track for this call.

        Args:
            language:    ISO language code (en, ta, hi, …)
            client_tier: budget | standard | premium | enterprise
            force_track: override routing (for testing / agent builder)
        """
        if force_track:
            t = self._resolve_track(force_track)
            if t and self._is_available(t):
                return t

        lang = (language or "en").lower()
        tier = (client_tier or "standard").lower()

        # Tamil / Indic languages
        if lang in _INDIC_CODES:
            if lang == "ta" and tier in _PREMIUM_TIERS and self._is_available(Track.C):
                return Track.C          # Tamil Moshi (self-hosted, lowest cost)
            if self._is_available(Track.D):
                return Track.D          # Sarvam S2S for any Indic (when available)
            return Track.A              # Parallel pipeline (default for all Indic)

        # English
        if lang == "en":
            if tier in _PREMIUM_TIERS and self._is_available(Track.B):
                return Track.B          # Gemini Live for English premium
            return Track.A

        # All other languages → parallel
        return Track.A

    def is_track_available(self, track: Track) -> bool:
        return self._is_available(track)

    def set_availability(self, track: Track, available: bool) -> None:
        if track == Track.A:
            return  # Track A always on
        old = self._availability.get(track)
        self._availability[track] = available
        if old != available:
            logger.info("Track %s availability → %s", track.value, available)

    def availability_snapshot(self) -> dict[str, bool]:
        return {t.value: v for t, v in self._availability.items()}

    # ── Fallback ─────────────────────────────────────────────────────────────

    def with_fallback(self, track: Track) -> Track:
        """
        Return the track to use, falling back as needed.
          C → A
          B → A
          D → C → A
        """
        if track == Track.A or self._is_available(track):
            return track
        if track == Track.D and self._is_available(Track.C):
            logger.info("Track D unavailable → falling back to Track C")
            return Track.C
        logger.info("Track %s unavailable → falling back to Track A", track.value)
        return Track.A

    # ── Internals ────────────────────────────────────────────────────────────

    def _is_available(self, track: Track) -> bool:
        return self._availability.get(track, False)

    @staticmethod
    def _resolve_track(name: str) -> Track | None:
        _map = {
            "a": Track.A, "parallel": Track.A,
            "b": Track.B, "gemini": Track.B, "gemini_s2s": Track.B,
            "c": Track.C, "moshi": Track.C,
            "d": Track.D, "sarvam": Track.D, "sarvam_s2s": Track.D,
        }
        return _map.get(name.lower())


# ─────────────────────────────────────────────────────────────────────────────
# Singleton + health check worker
# ─────────────────────────────────────────────────────────────────────────────

_router = PipelineRouter()


def get_router() -> PipelineRouter:
    return _router


class HealthCheckWorker:
    """
    Background task that pings all S2S providers every 30s and updates
    PipelineRouter availability flags.

    Start at app startup:
        worker = HealthCheckWorker()
        asyncio.create_task(worker.run())
    """

    def __init__(self, interval_s: int = 30):
        self._interval = interval_s
        self._running  = False

    async def run(self) -> None:
        self._running = True
        logger.info("HealthCheckWorker started (interval=%ds)", self._interval)
        while self._running:
            await self._check_all()
            await asyncio.sleep(self._interval)

    def stop(self) -> None:
        self._running = False

    async def _check_all(self) -> None:
        router = get_router()
        checks = [
            self._check_gemini(router),
            self._check_moshi(router),
            self._check_sarvam(router),
        ]
        await asyncio.gather(*checks, return_exceptions=True)

    @staticmethod
    async def _check_gemini(router: PipelineRouter) -> None:
        try:
            from voice_engine.gemini_s2s import GeminiS2SHealthCheck
            ok = await asyncio.wait_for(GeminiS2SHealthCheck.is_healthy(), timeout=5)
            router.set_availability(Track.B, ok)
        except Exception as exc:
            logger.debug("Gemini health check error: %s", exc)
            router.set_availability(Track.B, False)

    @staticmethod
    async def _check_moshi(router: PipelineRouter) -> None:
        try:
            from voice_engine.gnani_s2s import MoshiS2S
            moshi = MoshiS2S()
            if not moshi.is_available:
                router.set_availability(Track.C, False)
                return
            import websockets
            url = moshi._ws_url()
            async with websockets.connect(url, close_timeout=3) as ws:
                pass
            router.set_availability(Track.C, True)
        except Exception:
            router.set_availability(Track.C, False)

    @staticmethod
    async def _check_sarvam(router: PipelineRouter) -> None:
        try:
            from voice_engine.gnani_s2s import SarvamS2S
            sarvam = SarvamS2S()
            router.set_availability(Track.D, sarvam.is_available)
        except Exception:
            router.set_availability(Track.D, False)
