"""
LiveKit Voice Agent Worker — Production STT → RAG → LLM → TTS Pipeline
========================================================================
Joins a LiveKit room as an AI participant. Listens to user audio, transcribes
via Deepgram Nova-2, enriches with RAG knowledge, generates a reply via
the configured LLM, and speaks it back via OpenAI TTS (or ElevenLabs).

Architecture:
  1. Frontend calls POST /api/v1/livekit/token → gets room token
  2. Frontend calls POST /api/v1/livekit/agent-join → triggers this worker
  3. Worker joins the same room, subscribes to user audio
  4. STT (Deepgram) → RAG context → LLM (agent prompt) → TTS → publish audio

Agent config (prompt, voice, language, knowledge) is loaded from the DB
via the agent_id passed in room metadata.
"""

import asyncio
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

# Environment
LIVEKIT_URL = os.environ.get("LIVEKIT_URL", "")
LIVEKIT_API_KEY = os.environ.get("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.environ.get("LIVEKIT_API_SECRET", "")
DEEPGRAM_API_KEY = os.environ.get("DEEPGRAM_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")


def is_agent_ready() -> bool:
    """Check if all required keys are set for the agent worker."""
    return bool(LIVEKIT_URL and LIVEKIT_API_KEY and LIVEKIT_API_SECRET and DEEPGRAM_API_KEY)


async def _load_agent_config(agent_id: str) -> dict:
    """Load agent config from DB. Returns dict with prompt, voice, language, etc."""
    if not agent_id:
        return {
            "prompt": "You are a helpful AI voice assistant. Keep replies concise and natural. Respond in under 50 words.",
            "voice": "nova",
            "language": "en",
            "llm_provider": "openai",
            "llm_model": None,
        }

    try:
        from api.services.agents_store import get_agent
        agent = get_agent("default", agent_id)
        if agent:
            cfg = agent.get("config", {})
            return {
                "prompt": cfg.get("prompt", "You are a helpful AI voice assistant. Keep replies concise."),
                "voice": cfg.get("voice", "nova"),
                "language": agent.get("language", "English"),
                "llm_provider": cfg.get("llmProvider", "openai"),
                "llm_model": cfg.get("llmModel"),
                "agent_name": agent.get("name", "AI Agent"),
            }
    except Exception as exc:
        logger.warning("Failed to load agent config for %s: %s", agent_id, exc)

    return {
        "prompt": "You are a helpful AI voice assistant. Keep replies concise.",
        "voice": "nova",
        "language": "en",
        "llm_provider": "openai",
        "llm_model": None,
    }


async def _get_rag_context(user_text: str, agent_id: str) -> str:
    """Fetch RAG context for the user's message if knowledge base is available."""
    try:
        from api.database import get_async_session
        from api.services.voice_agent_knowledge import get_rag_context

        async for db in get_async_session():
            context = await get_rag_context(
                db, tenant_id="default", user_text=user_text,
                agent_id=agent_id, top_k=3,
            )
            return context
    except Exception as exc:
        logger.debug("RAG context not available: %s", exc)
    return ""


# Map language labels to Deepgram language codes
LANG_TO_DEEPGRAM = {
    "English": "en", "Hindi": "hi", "Tamil": "ta", "Telugu": "te",
    "Gujarati": "gu", "Bengali": "bn", "Kannada": "kn", "Odia": "or",
    "Assamese": "as", "Marathi": "mr", "Punjabi": "pa", "Malayalam": "ml",
    "Hindi + English": "hi", "Tamil + English": "ta", "Gujarati + English": "gu",
}


async def run_voice_agent(room_name: str, agent_id: str = "") -> None:
    """Spawn a LiveKit agent that joins the room and handles voice conversation.

    This is the core production pipeline:
      User audio → Deepgram STT → RAG enrichment → LLM → OpenAI TTS → audio back
    """
    try:
        from livekit import rtc
        from livekit.agents import llm as agents_llm, voice_assistant
        from livekit.plugins import deepgram as dg_plugin
        from livekit.plugins import openai as oai_plugin
    except ImportError as exc:
        logger.error("LiveKit agents SDK not installed: %s", exc)
        return

    # Silero VAD requires torch (~2GB) — excluded from prod requirements.
    # Fall back to built-in WebRTC VAD if silero is not available.
    try:
        from livekit.plugins import silero
        vad_plugin = silero.VAD.load()
        logger.info("Using Silero VAD")
    except ImportError:
        try:
            from livekit.agents.vad import WebRTCVAD
            vad_plugin = WebRTCVAD()
            logger.info("Using WebRTC VAD (silero not installed)")
        except Exception:
            vad_plugin = None
            logger.warning("No VAD available — voice turn detection will be basic")

    config = await _load_agent_config(agent_id)
    lang_code = LANG_TO_DEEPGRAM.get(config["language"], "en")

    logger.info(
        "Starting voice agent: room=%s, agent_id=%s, language=%s, provider=%s",
        room_name, agent_id, config["language"], config["llm_provider"],
    )

    # ── Build the pipeline components ─────────────────────────────

    # STT: Deepgram Nova-2
    stt_instance = dg_plugin.STT(
        api_key=DEEPGRAM_API_KEY,
        language=lang_code,
    )

    # LLM: OpenAI-compatible (works with Groq, OpenAI, etc.)
    # For production, OpenAI is most reliable for function calling + streaming
    llm_instance = oai_plugin.LLM(
        model=config.get("llm_model") or "gpt-4o-mini",
        api_key=OPENAI_API_KEY,
    )

    # TTS: OpenAI TTS (low latency, good quality)
    voice_name = config.get("voice", "nova")
    # Map custom voice names to OpenAI TTS voices
    openai_voices = {"nova", "alloy", "echo", "fable", "onyx", "shimmer"}
    tts_voice = voice_name if voice_name in openai_voices else "nova"
    tts_instance = oai_plugin.TTS(
        voice=tts_voice,
        api_key=OPENAI_API_KEY,
    )

    # VAD: resolved above (silero if installed, WebRTC fallback, or None)

    # ── Build system prompt with RAG ─────────────────────────────

    base_prompt = config["prompt"]

    # Create a chat context with the system prompt
    initial_ctx = agents_llm.ChatContext()
    initial_ctx.append(
        role="system",
        text=base_prompt,
    )

    # ── Connect to LiveKit room ─────────────────────────────────

    room = rtc.Room()

    try:
        await room.connect(
            LIVEKIT_URL,
            _generate_agent_token(room_name),
        )
        logger.info("Agent connected to room: %s", room_name)
    except Exception as exc:
        logger.error("Agent failed to connect to room %s: %s", room_name, exc)
        return

    # ── Create the voice assistant ──────────────────────────────

    class RAGAssistant(voice_assistant.VoiceAssistant):
        """Voice assistant with RAG enrichment before LLM calls."""

        async def _enrich_with_rag(self, user_text: str) -> str:
            """Add RAG context to the conversation if available."""
            rag_context = await _get_rag_context(user_text, agent_id)
            if rag_context:
                return (
                    f"Use the following knowledge base context to inform your answer. "
                    f"If the context is relevant, use it. If not, rely on your training.\n\n"
                    f"--- Knowledge Base ---\n{rag_context}\n--- End ---\n\n"
                    f"User said: {user_text}"
                )
            return user_text

    va_kwargs = dict(stt=stt_instance, llm=llm_instance, tts=tts_instance, chat_ctx=initial_ctx)
    if vad_plugin is not None:
        va_kwargs["vad"] = vad_plugin
    assistant = voice_assistant.VoiceAssistant(**va_kwargs)

    # Hook into user speech to inject RAG context
    @assistant.on("user_speech_committed")
    async def on_user_speech(msg):
        """Enrich user message with RAG context before LLM processes it."""
        if msg.content and agent_id:
            rag_context = await _get_rag_context(msg.content, agent_id)
            if rag_context:
                # Inject RAG as a system message just before the user's message
                assistant.chat_ctx.append(
                    role="system",
                    text=(
                        f"Relevant knowledge for this query:\n{rag_context}\n"
                        f"Use this to inform your response if relevant."
                    ),
                )

    assistant.start(room)

    logger.info("Voice agent started for room %s", room_name)

    # Keep the agent alive until the room closes
    await assistant.wait_for_close()
    await room.disconnect()
    logger.info("Voice agent disconnected from room %s", room_name)


def _generate_agent_token(room_name: str) -> str:
    """Generate a LiveKit access token for the agent participant."""
    from livekit_agent.token_service import create_token
    return create_token(
        identity="ai-agent",
        room=room_name,
        name="AI Voice Agent",
        can_publish=True,
        can_subscribe=True,
    )


# ── Entrypoint for spawning agent in background ────────────────

_active_agents: dict[str, asyncio.Task] = {}


async def spawn_agent(room_name: str, agent_id: str = "") -> bool:
    """Spawn an agent for a room. Returns True if started, False if already running."""
    if room_name in _active_agents:
        task = _active_agents[room_name]
        if not task.done():
            logger.info("Agent already running for room %s", room_name)
            return False

    async def _run():
        try:
            await run_voice_agent(room_name, agent_id)
        except Exception as exc:
            logger.error("Voice agent crashed for room %s: %s", room_name, exc)
        finally:
            _active_agents.pop(room_name, None)

    _active_agents[room_name] = asyncio.create_task(_run())
    return True


async def stop_agent(room_name: str) -> bool:
    """Stop a running agent for a room."""
    task = _active_agents.pop(room_name, None)
    if task and not task.done():
        task.cancel()
        return True
    return False
