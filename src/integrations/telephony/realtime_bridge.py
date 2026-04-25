"""
Telephony Real-Time Bridge — Live bidirectional audio between phone calls and voice engine.
============================================================================================

Problem:
  Current telephony integration is post-call only (record → download → analyze).
  For real-time AI voice agents on phone calls, we need a live audio loop:

    Phone caller ←→ Telephony Provider ←→ This Bridge ←→ Voice Engine
                                                        (STT → LLM → TTS)

This module bridges:
  - Twilio Media Streams (WebSocket) — bidirectional audio via mulaw/8kHz
  - TeleCMI streaming (if supported) — via their WebSocket API
  - Generic SIP/WebSocket — any provider sending raw audio over WS

Audio format conversion:
  Phone (mulaw 8kHz mono) ←→ Voice Engine (PCM16 16kHz mono)

The InterruptionManager is wired in so phone callers get barge-in support.

Usage:
  # In FastAPI, mount the WebSocket endpoint:
  app.include_router(realtime_bridge_router)

  # When making a call, point the stream URL to this bridge:
  twilio.make_call_with_stream(
      from_number="+91...",
      to_number="+91...",
      stream_url="wss://yourdomain.com/api/v1/telephony/stream/ws",
  )
"""

from __future__ import annotations

import asyncio
import audioop
import base64
import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

realtime_bridge_router = APIRouter(
    prefix="/api/v1/telephony/stream",
    tags=["Telephony Realtime"],
)


# ---------------------------------------------------------------------------
# Audio conversion helpers
# ---------------------------------------------------------------------------

def mulaw_to_pcm16(mulaw_bytes: bytes) -> bytes:
    """Convert mulaw 8kHz (Twilio format) to PCM16 linear."""
    return audioop.ulaw2lin(mulaw_bytes, 2)


def pcm16_to_mulaw(pcm_bytes: bytes) -> bytes:
    """Convert PCM16 linear to mulaw (for sending back to Twilio)."""
    return audioop.lin2ulaw(pcm_bytes, 2)


def resample_8k_to_16k(pcm_bytes: bytes) -> bytes:
    """Upsample PCM16 from 8kHz to 16kHz for STT/VAD (simple linear interp)."""
    return audioop.ratecv(pcm_bytes, 2, 1, 8000, 16000, None)[0]


def resample_16k_to_8k(pcm_bytes: bytes) -> bytes:
    """Downsample PCM16 from 16kHz to 8kHz for telephony playback."""
    return audioop.ratecv(pcm_bytes, 2, 1, 16000, 8000, None)[0]


# ---------------------------------------------------------------------------
# Call session state
# ---------------------------------------------------------------------------

@dataclass
class RealtimeCallSession:
    """Tracks state for one live phone call."""
    session_id: str
    call_sid: str = ""           # Provider's call ID (Twilio CallSid, etc.)
    agent_id: str = ""           # Voice agent to use
    tenant_id: str = ""
    language: str = "en"
    provider: str = "twilio"     # twilio | telecmi | generic

    # Audio state
    stream_sid: str = ""         # Twilio's stream SID
    audio_buffer: list[bytes] = field(default_factory=list)
    is_agent_speaking: bool = False

    # Conversation context
    messages: list[dict[str, str]] = field(default_factory=list)
    system_prompt: str = "You are a helpful voice assistant. Keep responses under 40 words."

    # Metrics
    started_at: float = 0.0
    turns_count: int = 0
    total_audio_seconds: float = 0.0

    # Task tracking for cancellation
    active_tasks: list[asyncio.Task] = field(default_factory=list)

    # GAP-6: did the agent's last response end with a question?
    # When True the EOS engine uses 200ms silence threshold for the next turn.
    last_agent_asked_question: bool = False


# Active sessions registry
_active_calls: dict[str, RealtimeCallSession] = {}


# ---------------------------------------------------------------------------
# Twilio Media Streams WebSocket
# ---------------------------------------------------------------------------

@realtime_bridge_router.websocket("/twilio/ws")
async def twilio_media_stream_ws(
    websocket: WebSocket,
    agent_id: str = Query(""),
    language: str = Query("en"),
    tenant_id: str = Query(""),
):
    """Twilio Media Streams WebSocket endpoint.

    Twilio sends/receives real-time audio as mulaw/8kHz base64 chunks.

    Protocol (Twilio → Server):
      {"event": "connected", "protocol": "Call", "version": "1.0.0"}
      {"event": "start", "streamSid": "...", "start": {"callSid": "...", ...}}
      {"event": "media", "media": {"payload": "<base64 mulaw>", "timestamp": "..."}}
      {"event": "stop", "streamSid": "..."}

    Protocol (Server → Twilio):
      {"event": "media", "streamSid": "...", "media": {"payload": "<base64 mulaw>"}}
      {"event": "clear", "streamSid": "..."}  — flush Twilio's audio buffer (for barge-in)
    """
    await websocket.accept()

    session_id = str(uuid.uuid4())
    session = RealtimeCallSession(
        session_id=session_id,
        agent_id=agent_id,
        tenant_id=tenant_id,
        language=language,
        provider="twilio",
        started_at=time.time(),
    )
    _active_calls[session_id] = session

    # Initialize voice engine + interruption manager
    voice_svc = None
    interrupt_mgr = None
    task_tracker = None

    try:
        from voice_engine.voice_ai_service import get_voice_ai_service
        voice_svc = get_voice_ai_service()
    except Exception as exc:
        logger.error("Voice engine not available for telephony bridge: %s", exc)

    try:
        from voice_engine.interruption_manager import (
            InterruptAction,
            InterruptionManager,
            SessionTaskTracker,
        )
        from voice_engine.vad.vad_engine import VADEngine

        _vad = VADEngine(provider="auto", threshold=0.5)
        interrupt_mgr = InterruptionManager(
            vad_engine=_vad,
            language=language,
        )
        task_tracker = SessionTaskTracker()
    except Exception as exc:
        logger.warning("Interruption manager not available: %s", exc)

    # EOS engine for turn detection (GAP-6: dynamic linguistic threshold)
    eos_engine = None
    _indic = language in ("ta", "hi", "te", "kn", "ml", "bn", "mr", "gu", "pa", "or", "ur")
    try:
        from voice_engine.eos.eos_engine import EOSConfig, EOSEngine
        eos_engine = EOSEngine(EOSConfig(
            min_silence_ms=600 if _indic else 500,
            indian_language_mode=_indic,
            dynamic_threshold=True,
            language=language,
        ))
    except Exception as exc:
        logger.warning("EOS engine not available: %s", exc)

    logger.info(
        "Twilio stream connected: session=%s agent=%s lang=%s",
        session_id, agent_id, language,
    )

    # GAP-6: question flag lives on session so _process_phone_turn can update it

    # Silence accumulator for EOS detection
    silence_start: float | None = None
    SILENCE_THRESHOLD_MS = 600 if _indic else 500

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            event = msg.get("event", "")

            # ── Connected ─────────────────────────────────────
            if event == "connected":
                logger.info("Twilio stream protocol connected: session=%s", session_id)

            # ── Start (call metadata) ─────────────────────────
            elif event == "start":
                start_data = msg.get("start", {})
                session.stream_sid = msg.get("streamSid", "")
                session.call_sid = start_data.get("callSid", "")

                # Extract custom parameters (agent_id, language, etc.)
                custom_params = start_data.get("customParameters", {})
                if custom_params.get("agent_id"):
                    session.agent_id = custom_params["agent_id"]
                if custom_params.get("language"):
                    session.language = custom_params["language"]
                    if interrupt_mgr:
                        interrupt_mgr.update_language(session.language)

                logger.info(
                    "Twilio call started: callSid=%s streamSid=%s agent=%s",
                    session.call_sid, session.stream_sid, session.agent_id,
                )

                # Load agent config and set system prompt
                await _load_agent_config(session)

                # Send initial greeting if configured
                greeting = await _generate_greeting(session, voice_svc)
                if greeting:
                    session.is_agent_speaking = True
                    if interrupt_mgr:
                        interrupt_mgr.reset()
                        interrupt_mgr.set_agent_text(greeting["text"])
                    await _send_audio_to_twilio(
                        websocket, session.stream_sid, greeting["audio_bytes"],
                    )
                    session.is_agent_speaking = False

            # ── Media (audio chunk from caller) ───────────────
            elif event == "media":
                media = msg.get("media", {})
                payload = media.get("payload", "")
                if not payload:
                    continue

                # Decode mulaw → PCM16 → upsample to 16kHz
                mulaw_bytes = base64.b64decode(payload)
                pcm_8k = mulaw_to_pcm16(mulaw_bytes)
                pcm_16k = resample_8k_to_16k(pcm_8k)

                session.total_audio_seconds += len(mulaw_bytes) / 8000

                # ── Barge-in check during agent playback ──────
                if session.is_agent_speaking and interrupt_mgr:
                    decision = await interrupt_mgr.check(pcm_16k, sample_rate=16000)

                    if decision.action == InterruptAction.INTERRUPT:
                        session.is_agent_speaking = False

                        # Cancel active tasks
                        if task_tracker:
                            await task_tracker.cancel_all(session_id)

                        # Tell Twilio to stop playing audio immediately
                        await _clear_twilio_audio(websocket, session.stream_sid)

                        # Feed interrupted audio as start of new turn
                        session.audio_buffer.clear()
                        if decision.accumulated_audio:
                            session.audio_buffer.append(decision.accumulated_audio)

                        # Add interrupt context to conversation
                        if decision.agent_partial_text:
                            session.messages.append({
                                "role": "system",
                                "content": (
                                    f"[Agent was interrupted. Said: "
                                    f"'{decision.agent_partial_text}'. "
                                    f"Caller interrupted with: "
                                    f"'{decision.transcript or '[speech]'}']"
                                ),
                            })

                        logger.info(
                            "Phone barge-in: session=%s reason=%s",
                            session_id, decision.reason,
                        )
                        silence_start = None
                        continue

                    if decision.action.value == "wait":
                        session.audio_buffer.append(pcm_16k)
                        continue

                    # IGNORE — noise during playback, skip
                    continue

                # ── Normal mode: buffer + EOS detection ───────
                session.audio_buffer.append(pcm_16k)

                if eos_engine:
                    import numpy as np
                    audio_array = np.frombuffer(pcm_16k, dtype=np.int16).astype(np.float32) / 32768.0
                    # GAP-6: pass agent_asked_question so yes/no answers get 200ms threshold
                    eos_result = eos_engine.process_chunk(
                        audio_array,
                        sample_rate=16000,
                        agent_asked_question=session.last_agent_asked_question,
                    )

                    if eos_result.is_end_of_speech and session.audio_buffer:
                        # Turn complete — process it
                        combined = b"".join(session.audio_buffer)
                        session.audio_buffer.clear()
                        eos_engine.reset()
                        silence_start = None
                        # GAP-6: reset question flag — only valid for one turn
                        session.last_agent_asked_question = False

                        # Process turn in background
                        turn_task = asyncio.create_task(
                            _process_phone_turn(
                                websocket=websocket,
                                session=session,
                                audio_pcm16=combined,
                                voice_svc=voice_svc,
                                interrupt_mgr=interrupt_mgr,
                                task_tracker=task_tracker,
                            ),
                        )
                        if task_tracker:
                            task_tracker.track(session_id, turn_task)

            # ── Stop (call ended) ─────────────────────────────
            elif event == "stop":
                logger.info(
                    "Twilio stream stopped: session=%s callSid=%s duration=%.1fs turns=%d",
                    session_id, session.call_sid,
                    time.time() - session.started_at, session.turns_count,
                )
                break

    except WebSocketDisconnect:
        logger.info("Twilio stream disconnected: session=%s", session_id)
    except Exception as exc:
        logger.error("Twilio stream error: session=%s error=%s", session_id, exc)
    finally:
        if task_tracker:
            task_tracker.cleanup_session(session_id)
        _active_calls.pop(session_id, None)

        # Fire post-call processing
        asyncio.create_task(_post_call_processing(session))


# ---------------------------------------------------------------------------
# Generic provider WebSocket (TeleCMI, custom SIP, etc.)
# ---------------------------------------------------------------------------

@realtime_bridge_router.websocket("/generic/ws")
async def generic_stream_ws(
    websocket: WebSocket,
    agent_id: str = Query(""),
    language: str = Query("en"),
    tenant_id: str = Query(""),
    provider: str = Query("telecmi"),
    audio_format: str = Query("pcm16"),  # pcm16 | mulaw
    sample_rate: int = Query(16000),      # 8000 | 16000
):
    """Generic real-time audio WebSocket for any telephony provider.

    Protocol (Provider → Server):
      {"type": "start", "call_id": "...", "from": "+91...", "to": "+91..."}
      {"type": "audio", "data": "<base64 audio>"}
      {"type": "stop"}

    Protocol (Server → Provider):
      {"type": "audio", "data": "<base64 audio>"}
      {"type": "clear"}  — flush playback buffer (barge-in)
    """
    await websocket.accept()

    session_id = str(uuid.uuid4())
    session = RealtimeCallSession(
        session_id=session_id,
        agent_id=agent_id,
        tenant_id=tenant_id,
        language=language,
        provider=provider,
        started_at=time.time(),
    )
    _active_calls[session_id] = session

    # Initialize engines (same as Twilio handler)
    voice_svc = None
    interrupt_mgr = None
    task_tracker = None

    try:
        from voice_engine.voice_ai_service import get_voice_ai_service
        voice_svc = get_voice_ai_service()
    except Exception:
        pass

    try:
        from voice_engine.interruption_manager import (
            InterruptAction,
            InterruptionManager,
            SessionTaskTracker,
        )
        from voice_engine.vad.vad_engine import VADEngine

        _vad = VADEngine(provider="auto", threshold=0.5)
        interrupt_mgr = InterruptionManager(vad_engine=_vad, language=language)
        task_tracker = SessionTaskTracker()
    except Exception:
        pass

    eos_engine = None
    _indic_g = language in ("ta", "hi", "te", "kn", "ml", "bn", "mr", "gu", "pa", "or", "ur")
    try:
        from voice_engine.eos.eos_engine import EOSConfig, EOSEngine
        eos_engine = EOSEngine(EOSConfig(
            min_silence_ms=600 if _indic_g else 500,
            indian_language_mode=_indic_g,
            dynamic_threshold=True,
            language=language,
        ))
    except Exception:
        pass

    logger.info(
        "Generic stream connected: session=%s provider=%s agent=%s format=%s@%dHz",
        session_id, provider, agent_id, audio_format, sample_rate,
    )

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type", "")

            if msg_type == "start":
                session.call_sid = msg.get("call_id", "")
                await _load_agent_config(session)
                logger.info("Generic call started: call_id=%s", session.call_sid)

            elif msg_type == "audio":
                audio_data = msg.get("data", "")
                if not audio_data:
                    continue

                raw_bytes = base64.b64decode(audio_data)

                # Convert to PCM16 16kHz (our internal format)
                if audio_format == "mulaw":
                    pcm_bytes = mulaw_to_pcm16(raw_bytes)
                else:
                    pcm_bytes = raw_bytes

                if sample_rate == 8000:
                    pcm_16k = resample_8k_to_16k(pcm_bytes)
                else:
                    pcm_16k = pcm_bytes

                # Barge-in check
                if session.is_agent_speaking and interrupt_mgr:
                    decision = await interrupt_mgr.check(pcm_16k, sample_rate=16000)

                    if decision.action == InterruptAction.INTERRUPT:
                        session.is_agent_speaking = False
                        if task_tracker:
                            await task_tracker.cancel_all(session_id)

                        await websocket.send_text(json.dumps({"type": "clear"}))

                        session.audio_buffer.clear()
                        if decision.accumulated_audio:
                            session.audio_buffer.append(decision.accumulated_audio)

                        if decision.agent_partial_text:
                            session.messages.append({
                                "role": "system",
                                "content": (
                                    f"[Interrupted. Agent said: '{decision.agent_partial_text}']"
                                ),
                            })
                        continue

                    if decision.action.value == "wait":
                        session.audio_buffer.append(pcm_16k)
                        continue
                    continue

                # Buffer + EOS detection
                session.audio_buffer.append(pcm_16k)

                if eos_engine:
                    import numpy as np
                    audio_array = np.frombuffer(pcm_16k, dtype=np.int16).astype(np.float32) / 32768.0
                    # GAP-6: pass agent_asked_question so yes/no answers get 200ms threshold
                    eos_result = eos_engine.process_chunk(
                        audio_array,
                        sample_rate=16000,
                        agent_asked_question=session.last_agent_asked_question,
                    )

                    if eos_result.is_end_of_speech and session.audio_buffer:
                        combined = b"".join(session.audio_buffer)
                        session.audio_buffer.clear()
                        eos_engine.reset()
                        # GAP-6: reset question flag — only valid for one turn
                        session.last_agent_asked_question = False

                        turn_task = asyncio.create_task(
                            _process_generic_turn(
                                websocket=websocket,
                                session=session,
                                audio_pcm16=combined,
                                voice_svc=voice_svc,
                                interrupt_mgr=interrupt_mgr,
                                task_tracker=task_tracker,
                                output_format=audio_format,
                                output_sample_rate=sample_rate,
                            ),
                        )
                        if task_tracker:
                            task_tracker.track(session_id, turn_task)

            elif msg_type == "stop":
                logger.info("Generic stream stopped: session=%s", session_id)
                break

    except WebSocketDisconnect:
        logger.info("Generic stream disconnected: session=%s", session_id)
    except Exception as exc:
        logger.error("Generic stream error: session=%s error=%s", session_id, exc)
    finally:
        if task_tracker:
            task_tracker.cleanup_session(session_id)
        _active_calls.pop(session_id, None)
        asyncio.create_task(_post_call_processing(session))


# ---------------------------------------------------------------------------
# Turn processing (shared by both Twilio and generic)
# ---------------------------------------------------------------------------

async def _process_phone_turn(
    websocket: WebSocket,
    session: RealtimeCallSession,
    audio_pcm16: bytes,
    voice_svc: Any,
    interrupt_mgr: Any | None,
    task_tracker: Any | None,
) -> None:
    """Process one caller turn via handle_turn_stream (GAP 2/3/4 enabled).

    Event flow:
      filler      → play immediately so caller hears something in <50 ms
      audio_chunk → stream each TTS phrase to Twilio as it arrives
      done        → turn complete, update conversation history
    """
    session.turns_count += 1

    if not voice_svc:
        logger.warning("No voice engine — cannot process phone turn")
        return

    try:
        from voice_engine.voice_ai_service import VoiceTurnRequest

        # Pass conversation history so the agent remembers prior turns
        request = VoiceTurnRequest(
            audio_bytes=audio_pcm16,
            language=session.language,
            system_prompt=session.system_prompt,
            tts_language=session.language,
            tenant_id=session.tenant_id,
            conversation_history=list(session.messages),
        )

        full_text = ""
        filler_played = False
        first_real_chunk = True

        async for event in voice_svc.handle_turn_stream(request):
            ev_type = event.get("type", "")

            if ev_type == "stt":
                user_text = event.get("text", "")
                if user_text.strip():
                    session.messages.append({"role": "user", "content": user_text})

            elif ev_type == "filler":
                # Play pre-synthesised filler immediately so caller hears the agent
                audio_b64 = event.get("audio_base64", "")
                if audio_b64 and not filler_played:
                    filler_played = True
                    session.is_agent_speaking = True
                    filler_bytes = base64.b64decode(audio_b64)
                    await _send_audio_to_twilio(websocket, session.stream_sid, filler_bytes)

            elif ev_type == "audio_chunk":
                audio_b64 = event.get("audio_base64", "")
                if audio_b64:
                    if first_real_chunk:
                        first_real_chunk = False
                        # If filler is playing Twilio clears it on the next media packet;
                        # we send a clear to flush the buffer immediately so real audio
                        # starts without overlap.
                        if filler_played:
                            await _clear_twilio_audio(websocket, session.stream_sid)
                        session.is_agent_speaking = True
                        if interrupt_mgr:
                            interrupt_mgr.reset()

                    chunk_bytes = base64.b64decode(audio_b64)
                    await _send_audio_to_twilio(websocket, session.stream_sid, chunk_bytes)

            elif ev_type == "done":
                full_text = event.get("text", "")
                if full_text:
                    session.messages.append({"role": "assistant", "content": full_text})
                    if interrupt_mgr:
                        interrupt_mgr.set_agent_text(full_text)
                    # GAP-6: flag yes/no questions so next turn uses 200ms threshold
                    session.last_agent_asked_question = full_text.rstrip().endswith("?")
                session.is_agent_speaking = False

            elif ev_type == "error":
                logger.warning(
                    "Phone turn stream error: session=%s msg=%s",
                    session.session_id, event.get("message", ""),
                )

    except asyncio.CancelledError:
        logger.info("Phone turn cancelled (barge-in): session=%s", session.session_id)
        session.is_agent_speaking = False
    except Exception as exc:
        logger.error("Phone turn error: session=%s error=%s", session.session_id, exc)
        session.is_agent_speaking = False


async def _process_generic_turn(
    websocket: WebSocket,
    session: RealtimeCallSession,
    audio_pcm16: bytes,
    voice_svc: Any,
    interrupt_mgr: Any | None,
    task_tracker: Any | None,
    output_format: str = "pcm16",
    output_sample_rate: int = 16000,
) -> None:
    """Process one turn for generic provider via handle_turn_stream (GAP 2/3/4 enabled)."""
    session.turns_count += 1

    if not voice_svc:
        return

    try:
        from voice_engine.voice_ai_service import VoiceTurnRequest

        # Pass conversation history so the agent remembers prior turns
        request = VoiceTurnRequest(
            audio_bytes=audio_pcm16,
            language=session.language,
            system_prompt=session.system_prompt,
            tts_language=session.language,
            tenant_id=session.tenant_id,
            conversation_history=list(session.messages),
        )

        full_text = ""
        filler_played = False
        first_real_chunk = True

        async for event in voice_svc.handle_turn_stream(request):
            ev_type = event.get("type", "")

            if ev_type == "stt":
                user_text = event.get("text", "")
                if user_text.strip():
                    session.messages.append({"role": "user", "content": user_text})

            elif ev_type == "filler":
                audio_b64 = event.get("audio_base64", "")
                if audio_b64 and not filler_played:
                    filler_played = True
                    session.is_agent_speaking = True
                    filler_bytes = base64.b64decode(audio_b64)
                    # Convert to provider output format
                    if output_sample_rate == 8000:
                        filler_bytes = resample_16k_to_8k(filler_bytes)
                    if output_format == "mulaw":
                        filler_bytes = pcm16_to_mulaw(filler_bytes)
                    await websocket.send_text(json.dumps({
                        "type": "audio",
                        "data": base64.b64encode(filler_bytes).decode(),
                    }))

            elif ev_type == "audio_chunk":
                audio_b64 = event.get("audio_base64", "")
                if audio_b64:
                    if first_real_chunk:
                        first_real_chunk = False
                        if filler_played:
                            await websocket.send_text(json.dumps({"type": "clear"}))
                        session.is_agent_speaking = True
                        if interrupt_mgr:
                            interrupt_mgr.reset()

                    chunk_bytes = base64.b64decode(audio_b64)
                    if output_sample_rate == 8000:
                        chunk_bytes = resample_16k_to_8k(chunk_bytes)
                    if output_format == "mulaw":
                        chunk_bytes = pcm16_to_mulaw(chunk_bytes)
                    await websocket.send_text(json.dumps({
                        "type": "audio",
                        "data": base64.b64encode(chunk_bytes).decode(),
                    }))

            elif ev_type == "done":
                full_text = event.get("text", "")
                if full_text:
                    session.messages.append({"role": "assistant", "content": full_text})
                    if interrupt_mgr:
                        interrupt_mgr.set_agent_text(full_text)
                    # GAP-6: flag yes/no questions so next turn uses 200ms threshold
                    session.last_agent_asked_question = full_text.rstrip().endswith("?")
                session.is_agent_speaking = False

            elif ev_type == "error":
                logger.warning(
                    "Generic turn stream error: session=%s msg=%s",
                    session.session_id, event.get("message", ""),
                )

    except asyncio.CancelledError:
        session.is_agent_speaking = False
    except Exception as exc:
        logger.error("Generic turn error: session=%s error=%s", session.session_id, exc)
        session.is_agent_speaking = False


# ---------------------------------------------------------------------------
# Twilio audio helpers
# ---------------------------------------------------------------------------

async def _send_audio_to_twilio(
    websocket: WebSocket,
    stream_sid: str,
    audio_bytes: bytes,
) -> None:
    """Send audio back to Twilio as mulaw base64 chunks.

    Twilio expects:
      {"event": "media", "streamSid": "...", "media": {"payload": "<base64 mulaw>"}}

    Audio must be mulaw 8kHz mono. We chunk to ~20ms frames for smooth playback.
    """
    # Convert to mulaw 8kHz
    pcm_8k = resample_16k_to_8k(audio_bytes)
    mulaw = pcm16_to_mulaw(pcm_8k)

    # Send in ~20ms chunks (160 bytes at 8kHz mulaw)
    chunk_size = 160
    for i in range(0, len(mulaw), chunk_size):
        chunk = mulaw[i:i + chunk_size]
        payload = base64.b64encode(chunk).decode()
        await websocket.send_text(json.dumps({
            "event": "media",
            "streamSid": stream_sid,
            "media": {"payload": payload},
        }))


async def _clear_twilio_audio(websocket: WebSocket, stream_sid: str) -> None:
    """Tell Twilio to flush its audio playback buffer (for barge-in).

    This immediately stops any audio being played to the caller.
    """
    await websocket.send_text(json.dumps({
        "event": "clear",
        "streamSid": stream_sid,
    }))


# ---------------------------------------------------------------------------
# Agent config + greeting
# ---------------------------------------------------------------------------

async def _load_agent_config(session: RealtimeCallSession) -> None:
    """Load voice agent config from DB and set system prompt."""
    if not session.agent_id:
        return

    try:
        from api.services.agents_store import get_agent_by_id

        agent = await get_agent_by_id(session.agent_id, tenant_id=session.tenant_id)
        if agent:
            config = agent.get("config", {})
            session.system_prompt = config.get(
                "prompt",
                session.system_prompt,
            )
            session.language = config.get("language", session.language)
            logger.info(
                "Loaded agent config: agent=%s lang=%s",
                session.agent_id, session.language,
            )
    except Exception as exc:
        logger.warning("Failed to load agent config: %s", exc)


async def _generate_greeting(
    session: RealtimeCallSession,
    voice_svc: Any,
) -> dict[str, Any] | None:
    """Generate and synthesize greeting audio for call start."""
    if not voice_svc:
        return None

    # Default greetings by language
    greetings = {
        "en": "Hello! How can I help you today?",
        "hi": "Namaste! Main aapki kaise madad kar sakti hoon?",
        "ta": "Vanakkam! Ungalukku eppadi udavi seiya mudiyum?",
    }
    lang = session.language[:2]
    greeting_text = greetings.get(lang, greetings["en"])

    try:
        tts_result = await voice_svc.generate_response_audio(
            text=greeting_text,
            language=session.language,
        )
        audio_b64 = tts_result.get("audio_base64", "")
        if audio_b64:
            session.messages.append({"role": "assistant", "content": greeting_text})
            return {
                "text": greeting_text,
                "audio_bytes": base64.b64decode(audio_b64),
            }
    except Exception as exc:
        logger.warning("Greeting synthesis failed: %s", exc)

    return None


# ---------------------------------------------------------------------------
# Post-call processing
# ---------------------------------------------------------------------------

async def _post_call_processing(session: RealtimeCallSession) -> None:
    """Fire post-call analysis: summarize conversation, update CRM lead, log call."""
    try:
        from api.services.agents_store import log_call

        duration = time.time() - session.started_at if session.started_at else 0

        await log_call(
            tenant_id=session.tenant_id or "default",
            agent_id=session.agent_id,
            direction="inbound",
            channel="phone",
            from_addr=session.call_sid,
            to_addr="",
            duration_sec=int(duration),
            outcome="completed",
            transcript="\n".join(
                f"{'Caller' if m['role'] == 'user' else 'Agent'}: {m['content']}"
                for m in session.messages
                if m["role"] in ("user", "assistant")
            ),
            metadata={
                "provider": session.provider,
                "session_id": session.session_id,
                "turns": session.turns_count,
                "language": session.language,
            },
        )
        logger.info(
            "Post-call logged: session=%s turns=%d duration=%ds",
            session.session_id, session.turns_count, int(duration),
        )
    except Exception as exc:
        logger.debug("Post-call processing failed: %s", exc)


# ---------------------------------------------------------------------------
# Admin API — active calls status
# ---------------------------------------------------------------------------

@realtime_bridge_router.get("/active")
async def list_active_calls():
    """List currently active real-time phone calls."""
    return {
        "active_calls": [
            {
                "session_id": s.session_id,
                "call_sid": s.call_sid,
                "agent_id": s.agent_id,
                "provider": s.provider,
                "language": s.language,
                "turns": s.turns_count,
                "duration_seconds": int(time.time() - s.started_at) if s.started_at else 0,
                "is_agent_speaking": s.is_agent_speaking,
            }
            for s in _active_calls.values()
        ],
        "total": len(_active_calls),
    }
