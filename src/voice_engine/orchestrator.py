"""
S2S Orchestrator — unified entry point for all pipeline tracks
==============================================================

Usage:
    orch = S2SOrchestrator(system_prompt=..., language="ta", client_tier="premium")
    async for audio_chunk in orch.stream(audio_iterator):
        send_to_livekit(audio_chunk)

The orchestrator:
  1. Asks PipelineRouter for the right Track
  2. Falls back if the chosen Track is unhealthy at call-start
  3. Logs which track was used + fallback events
  4. For Track A (parallel pipeline), wraps the existing voice_ai_service

Track A (parallel pipeline) is always the last fallback — it never goes down.
"""

from __future__ import annotations

import logging
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

from voice_engine.pipeline_router import Track, get_router

logger = logging.getLogger(__name__)

# ── Active S2S session counter ────────────────────────────────────────────
# Incremented when a non-Track-A call starts, decremented when it ends.
# Queried by /api/v1/voice/calls/active-s2s-count for the GPU watchdog.

_active_s2s: int = 0


def active_s2s_count() -> int:
    """Return the number of currently active S2S (non-Track-A) sessions."""
    return _active_s2s


@dataclass
class CallMeta:
    call_id:        str
    language:       str     = "en"
    client_tier:    str     = "standard"
    track_used:     str     = ""
    track_fallback: str     = ""
    ttfa_ms:        float   = 0.0
    error:          str     = ""
    started_at:     float   = field(default_factory=time.time)
    # GAP 7 fields
    tenant_id:      str     = ""
    phone:          str     = ""


class S2SOrchestrator:
    """
    Unified stream entry point for all pipeline tracks.

    For Track A (parallel pipeline), `stream()` delegates to the existing
    `voice_ai_service.handle_turn_stream()` path. For Tracks B/C/D it calls
    the respective S2S provider directly.

    Args:
        system_prompt   — agent system prompt / persona
        language        — ISO language code (en, ta, hi, …)
        client_tier     — budget | standard | premium | enterprise
        force_track     — override routing (testing / agent builder setting)
    """

    def __init__(
        self,
        system_prompt: str = "",
        language: str = "en",
        client_tier: str = "standard",
        force_track: str | None = None,
        # GAP 7 — caller identity for cross-call memory
        tenant_id: str = "",
        phone: str = "",
    ):
        self.system_prompt = system_prompt
        self.language      = language
        self.client_tier   = client_tier
        self.force_track   = force_track
        self._router       = get_router()
        # GAP 7
        self.tenant_id     = tenant_id
        self.phone         = phone

    async def stream(
        self,
        audio_iterator: AsyncIterator[bytes],
        call_id: str = "",
        on_transcript=None,
    ) -> AsyncIterator[bytes]:
        """
        Stream audio in, receive audio chunks out.

        Yields PCM16 audio bytes for the phone leg.
        Falls back through tracks if primary is unavailable.
        """
        meta = CallMeta(
            call_id     = call_id,
            language    = self.language,
            client_tier = self.client_tier,
            tenant_id   = self.tenant_id,
            phone       = self.phone,
        )

        # ── GAP 7: load caller memory and inject into system prompt ──────────
        _caller_profile: dict  = {}
        _turn_buffer:    list  = []
        _memory_injected       = False

        if self.tenant_id and self.phone:
            try:
                from voice_engine.caller_memory import on_call_start
                _caller_profile, memory_block = await on_call_start(
                    self.tenant_id, self.phone, language=self.language
                )
                if memory_block:
                    self.system_prompt = memory_block + "\n\n" + self.system_prompt
                    _memory_injected   = True
                    logger.info(
                        "Orchestrator: GAP7 memory injected (calls=%d) call=%s",
                        _caller_profile.get("total_calls", 0), call_id,
                    )
            except Exception as _gap7_exc:
                logger.warning("Orchestrator: GAP7 load failed: %s", _gap7_exc)

        # Route decision
        chosen = self._router.route(
            language=self.language,
            client_tier=self.client_tier,
            force_track=self.force_track,
        )
        chosen = self._router.with_fallback(chosen)
        meta.track_used = chosen.value

        logger.info(
            "Orchestrator: call=%s lang=%s tier=%s → Track %s",
            call_id, self.language, self.client_tier, chosen.value,
        )

        t0 = time.time()
        first_chunk = True

        # Track active non-Track-A sessions for GPU watchdog
        global _active_s2s  # noqa: PLW0603
        is_s2s = chosen != Track.A
        if is_s2s:
            _active_s2s += 1

        _call_start_time = time.time()

        try:
            async for chunk in self._dispatch(chosen, audio_iterator, on_transcript):
                if first_chunk:
                    meta.ttfa_ms = (time.time() - t0) * 1000
                    logger.info("Track %s TTFA: %.0fms (call=%s)", chosen.value, meta.ttfa_ms, call_id)
                    first_chunk = False
                yield chunk
        except Exception as exc:
            meta.error = str(exc)
            logger.error("Track %s failed (%s) — falling back to Track A", chosen.value, exc)
            if chosen != Track.A:
                meta.track_fallback = Track.A.value
                async for chunk in self._dispatch(Track.A, audio_iterator, on_transcript):
                    yield chunk
        finally:
            if is_s2s:
                _active_s2s = max(0, _active_s2s - 1)

            # ── GAP 7: persist caller memory on call end ─────────────────────
            if self.tenant_id and self.phone:
                try:
                    from voice_engine.caller_memory import on_call_end
                    duration = time.time() - _call_start_time
                    await on_call_end(
                        tenant_id    = self.tenant_id,
                        phone        = self.phone,
                        profile      = _caller_profile,
                        turn_buffer  = _turn_buffer,
                        final_intent = _caller_profile.get("last_intent", ""),
                        outcome      = "completed" if not meta.error else "error",
                        language     = self.language,
                        duration_sec = duration,
                        call_id      = call_id,
                    )
                except Exception as _gap7_end_exc:
                    logger.warning("Orchestrator: GAP7 on_call_end failed: %s", _gap7_end_exc)

    async def _dispatch(
        self,
        track: Track,
        audio_iterator: AsyncIterator[bytes],
        on_transcript,
    ) -> AsyncIterator[bytes]:
        if track == Track.B:
            async for chunk in self._run_gemini(audio_iterator, on_transcript):
                yield chunk
        elif track == Track.C:
            async for chunk in self._run_moshi(audio_iterator, on_transcript):
                yield chunk
        elif track == Track.D:
            async for chunk in self._run_sarvam(audio_iterator, on_transcript):
                yield chunk
        else:
            # Track A — parallel pipeline
            async for chunk in self._run_parallel(audio_iterator, on_transcript):
                yield chunk

    # ── Track B: Gemini Live ─────────────────────────────────────────────────

    async def _run_gemini(self, audio_iterator, on_transcript) -> AsyncIterator[bytes]:
        from voice_engine.gemini_s2s import GeminiLiveS2S
        s2s = GeminiLiveS2S(
            system_prompt=self.system_prompt,
            language=self.language,
        )
        if not s2s.is_available:
            raise RuntimeError("GeminiLiveS2S not configured (GEMINI_API_KEY missing)")
        async for chunk in s2s.stream_call(audio_iterator, on_transcript=on_transcript):
            yield chunk

    # ── Track C: Moshi ──────────────────────────────────────────────────────

    async def _run_moshi(self, audio_iterator, on_transcript) -> AsyncIterator[bytes]:
        from voice_engine.gnani_s2s import MoshiS2S
        s2s = MoshiS2S()
        if not s2s.is_available:
            raise RuntimeError("MoshiS2S not configured (MOSHI_AVAILABLE missing)")
        async for chunk in s2s.stream_call(
            audio_iterator, system_prompt=self.system_prompt, language=self.language
        ):
            yield chunk

    # ── Track D: Sarvam S2S ──────────────────────────────────────────────────

    async def _run_sarvam(self, audio_iterator, on_transcript) -> AsyncIterator[bytes]:
        from voice_engine.gnani_s2s import SarvamS2S
        s2s = SarvamS2S()
        if not s2s.is_available:
            raise RuntimeError("SarvamS2S not configured")
        async for chunk in s2s.stream_call(
            audio_iterator, system_prompt=self.system_prompt, language=self.language
        ):
            yield chunk

    # ── Track A: parallel pipeline ───────────────────────────────────────────

    async def _run_parallel(self, audio_iterator, on_transcript) -> AsyncIterator[bytes]:
        """
        Track A — collect audio, run STT→LLM→TTS, yield TTS audio bytes.

        This wraps the existing voice_ai_service streaming path.
        The audio_iterator is consumed to a buffer, then processed.
        """
        # Collect audio to a buffer (parallel pipeline is not true streaming)
        chunks: list[bytes] = []
        async for chunk in audio_iterator:
            if chunk:
                chunks.append(chunk)
        audio_bytes = b"".join(chunks)

        if not audio_bytes:
            return

        try:
            from voice_engine.voice_ai_service import (
                VoiceAIService,
                VoiceTurnRequest,
            )
            svc = VoiceAIService()
            req = VoiceTurnRequest(
                audio_bytes=audio_bytes,
                language=self.language,
                tts_language=self.language,
                system_prompt=self.system_prompt,
            )
            async for chunk in svc.handle_turn_stream(req):
                if isinstance(chunk, bytes):
                    yield chunk
                elif isinstance(chunk, dict) and "audio" in chunk:
                    import base64
                    yield base64.b64decode(chunk["audio"])
        except Exception as exc:
            logger.error("Track A (parallel) error: %s", exc)
