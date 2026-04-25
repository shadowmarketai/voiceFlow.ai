"""
VoiceFlow AI SaaS - Real-Time Voice Conversation Router
=========================================================
Core differentiator: WebSocket-powered live voice chat for the embeddable
widget. Supports bidirectional audio streaming, text fallback, multi-language
agents, and a complete REST API for widget integration.

Endpoints:
  WS   /api/v1/voice/conversation/ws           — Real-time voice conversation
  POST /api/v1/voice/conversation/start         — Start new session
  POST /api/v1/voice/conversation/{id}/message  — Send text message
  POST /api/v1/voice/conversation/{id}/audio    — Send audio chunk
  GET  /api/v1/voice/conversation/{id}/history   — Get conversation history
  POST /api/v1/voice/conversation/{id}/end      — End conversation
  GET  /api/v1/widget/agent/{agent_id}          — Public agent config
  GET  /api/v1/widget/embed.js                  — Embeddable JS widget
  GET  /api/v1/widget/embed.css                 — Widget stylesheet

API prefix: /api/v1
Tags: Voice Conversation, Widget
"""

import asyncio
import base64
import datetime
import json
import logging
import time
import uuid
from collections import defaultdict
from enum import Enum
from typing import Any

from fastapi import (
    APIRouter,
    File,
    HTTPException,
    Query,
    Request,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.responses import Response
from pydantic import BaseModel, Field

from api.config import settings

logger = logging.getLogger(__name__)


# =====================================================================
# Demo Agent Registry
# =====================================================================

DEMO_AGENTS: dict[str, dict[str, Any]] = {
    "sales-assistant-en": {
        "name": "Aria",
        "greeting": "Hi! I'm Aria, your AI sales assistant. How can I help you today?",
        "language": "en",
        "voice": "female-1",
        "personality": "professional, friendly, helpful",
        "system_prompt": (
            "You are Aria, a professional sales assistant. Keep responses "
            "concise (under 50 words). Be helpful and guide users toward "
            "purchasing decisions."
        ),
        "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=Aria",
        "theme": {"primary": "#6366f1", "bg": "#0f172a"},
        "allowed_domains": ["*"],
    },
    "support-assistant-hi": {
        "name": "Priya",
        "greeting": (
            "Namaste! Main Priya hoon, aapki madad ke liye. "
            "Kaise help kar sakti hoon?"
        ),
        "language": "hi",
        "voice": "female-hindi-1",
        "personality": "warm, patient, helpful, speaks Hinglish",
        "system_prompt": (
            "You are Priya, a customer support assistant for Indian customers. "
            "Speak in Hinglish (mix of Hindi and English). Keep responses under "
            "50 words. Be warm and patient."
        ),
        "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=Priya",
        "theme": {"primary": "#f59e0b", "bg": "#1e293b"},
        "allowed_domains": ["*"],
    },
    "support-assistant-ta": {
        "name": "Kavitha",
        "greeting": "Vanakkam! Naan Kavitha. Ungalukku eppadi udavi seiya mudiyum?",
        "language": "ta",
        "voice": "female-tamil-1",
        "personality": "respectful, clear, supportive",
        "system_prompt": (
            "You are Kavitha, a support assistant who speaks Tamil and English. "
            "Keep responses under 50 words. Be respectful and clear."
        ),
        "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=Kavitha",
        "theme": {"primary": "#10b981", "bg": "#1e293b"},
        "allowed_domains": ["*"],
    },
}


# =====================================================================
# Pydantic Schemas
# =====================================================================


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class ConversationMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: MessageRole
    text: str
    audio_base64: str | None = None
    emotion: str | None = None
    language: str | None = None
    confidence: float | None = None
    timestamp: str = Field(
        default_factory=lambda: datetime.datetime.utcnow().isoformat()
    )


class ConversationSession(BaseModel):
    session_id: str
    agent_id: str
    language: str
    started_at: str
    ended_at: str | None = None
    messages: list[ConversationMessage] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    # GAP 7 — caller identity for cross-call memory
    tenant_id: str = ""
    phone: str = ""


class StartConversationRequest(BaseModel):
    agent_id: str = "sales-assistant-en"
    language: str = "en"
    api_key: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    # GAP 7 — optional caller phone for cross-call memory
    phone: str | None = None
    tenant_id: str | None = None


class StartConversationResponse(BaseModel):
    session_id: str
    agent_id: str
    agent_name: str
    greeting: str
    language: str
    websocket_url: str


class TextMessageRequest(BaseModel):
    text: str
    language: str | None = None


class TextMessageResponse(BaseModel):
    message_id: str
    text: str
    audio_base64: str | None = None
    emotion: str | None = None
    format: str | None = None


class AudioMessageResponse(BaseModel):
    message_id: str
    transcription: str
    response_text: str
    response_audio_base64: str | None = None
    emotion: str | None = None
    language: str
    confidence: float
    format: str | None = None


class ConversationHistoryResponse(BaseModel):
    session_id: str
    agent_id: str
    agent_name: str
    message_count: int
    messages: list[ConversationMessage]
    started_at: str
    ended_at: str | None = None


class AgentConfigResponse(BaseModel):
    agent_id: str
    name: str
    greeting: str
    language: str
    voice: str
    avatar: str
    theme: dict[str, str]
    allowed_domains: list[str]


# =====================================================================
# In-Memory Session Store
# =====================================================================

_sessions: dict[str, ConversationSession] = {}

# Rate limiting: IP -> list of timestamps
_rate_limits: dict[str, list[float]] = defaultdict(list)
_UNAUTH_RATE_LIMIT = 10   # conversations/minute for unauthenticated
_AUTH_RATE_LIMIT = 100     # conversations/minute for authenticated


def _check_rate_limit(client_ip: str, authenticated: bool = False) -> bool:
    """Return True if the request is within rate limits, False if exceeded."""
    now = time.time()
    window = 60.0
    limit = _AUTH_RATE_LIMIT if authenticated else _UNAUTH_RATE_LIMIT

    key = f"conv:{client_ip}:{'auth' if authenticated else 'anon'}"
    timestamps = _rate_limits[key]

    # Purge old entries outside the window
    _rate_limits[key] = [ts for ts in timestamps if now - ts < window]

    if len(_rate_limits[key]) >= limit:
        return False

    _rate_limits[key].append(now)
    return True


def _get_session(session_id: str) -> ConversationSession:
    """Retrieve a session or raise 404."""
    session = _sessions.get(session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation session '{session_id}' not found",
        )
    return session


def _get_agent(agent_id: str) -> dict[str, Any]:
    """Retrieve an agent config or raise 404."""
    agent = DEMO_AGENTS.get(agent_id)
    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent '{agent_id}' not found",
        )
    return agent


def _validate_api_key(api_key: str | None) -> bool:
    """Validate an API key. Returns True for authenticated, False for anonymous.

    In demo mode, any non-empty key or empty key is accepted.
    Production should validate against DB.
    """
    if not api_key:
        return False
    # In production, look up api_key in the database
    # For now, accept any key of sufficient length
    return len(api_key) >= 10


# =====================================================================
# LLM Response Generation (graceful fallback)
# =====================================================================


async def _generate_llm_response(
    messages: list[dict[str, str]],
    system_prompt: str,
    language: str = "en",
) -> str:
    """Generate an LLM response using available providers.

    Priority: Gemini 2.5 Pro -> Groq -> Anthropic -> canned fallback.
    Response is cleaned for phone TTS (strip markdown, trim to 2 sentences).
    """
    from voice_engine.llm_output_cleaner import clean_for_tts as _clean

    raw_text: str | None = None

    # 1. Gemini 2.5 Pro (primary — best quality)
    google_key = getattr(settings, "GOOGLE_API_KEY", "") or ""
    if google_key:
        try:
            import httpx

            # Build Gemini contents (user/model roles only; system goes separately)
            gemini_contents = []
            for m in messages:
                role = "model" if m["role"] == "assistant" else "user"
                gemini_contents.append({"role": role, "parts": [{"text": m["content"]}]})

            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/"
                    f"gemini-2.5-pro:generateContent?key={google_key}",
                    json={
                        "system_instruction": {"parts": [{"text": system_prompt}]},
                        "contents": gemini_contents,
                        "generationConfig": {"maxOutputTokens": 200, "temperature": 0.7},
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
        except Exception as exc:
            logger.warning("Gemini LLM call failed: %s", exc)

    # 2. Groq (fast fallback)
    if not raw_text and getattr(settings, "GROQ_API_KEY", ""):
        try:
            import httpx

            full_messages = [{"role": "system", "content": system_prompt}] + messages
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "llama-3.3-70b-versatile",
                        "messages": full_messages,
                        "max_tokens": 150,
                        "temperature": 0.7,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                raw_text = data["choices"][0]["message"]["content"]
        except Exception as exc:
            logger.warning("Groq LLM call failed: %s", exc)

    # 3. Anthropic (second fallback)
    if not raw_text and getattr(settings, "ANTHROPIC_API_KEY", ""):
        try:
            import httpx

            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": settings.ANTHROPIC_API_KEY,
                        "anthropic-version": "2023-06-01",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "claude-haiku-4-5-20251001",
                        "max_tokens": 150,
                        "system": system_prompt,
                        "messages": [m for m in messages if m["role"] != "system"],
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                raw_text = data["content"][0]["text"]
        except Exception as exc:
            logger.warning("Anthropic LLM call failed: %s", exc)

    # 4. Canned fallback responses by language
    if not raw_text:
        import random

        fallbacks = {
            "en": [
                "I can help you with that. Could you tell me more about what you need?",
                "Let me help you find the right solution for you.",
                "Thanks for reaching out. How can I assist you further?",
                "I understand. Let me walk you through our options.",
            ],
            "hi": [
                "Main aapki madad kar sakti hoon. Aap kya dhundh rahe hain?",
                "Bilkul. Main aapko sahi solution dhundne mein madad karti hoon.",
                "Dhanyavaad. Main aapki aur kaise madad kar sakti hoon?",
                "Main samajh gayi. Chaliye options dekhte hain.",
            ],
            "ta": [
                "Ungalukku udavi seiya nan thayaar. Enna thevai endru sollunga.",
                "Nalla kelvi. Sariyana theervai kaana udavi seigiren.",
                "Nandri. Innum eppadi udavi seiya mudiyum?",
                "Purindhadhu. Namadhu vaaipaigalai paarpom.",
            ],
        }
        options = fallbacks.get(language, fallbacks["en"])
        raw_text = random.choice(options)

    # Clean for phone TTS: strip markdown, filler, trim to 2 sentences
    return _clean(raw_text, max_sentences=2)


# =====================================================================
# Voice Pipeline Helpers
# =====================================================================


async def _transcribe_audio(
    audio_bytes: bytes,
    language: str | None = None,
) -> dict[str, Any]:
    """Transcribe audio bytes. Uses voice engine if available, else mock."""
    try:
        from voice_engine.voice_ai_service import get_voice_ai_service

        svc = get_voice_ai_service()
        result = await svc.transcribe_and_analyze(audio_bytes, language=language)
        return {
            "text": result.get("transcription", ""),
            "language": result.get("language", language or "en"),
            "confidence": result.get("confidence", 0.0),
            "emotion": result.get("emotion"),
        }
    except (ImportError, Exception) as exc:
        logger.warning(
            "Voice engine not available for transcription, using mock: %s", exc
        )
        return {
            "text": "[Audio received - transcription service unavailable]",
            "language": language or "en",
            "confidence": 0.0,
            "emotion": "neutral",
        }


async def _synthesize_audio(
    text: str,
    language: str = "en",
    voice_id: str | None = None,
) -> str | None:
    """Synthesize text to audio. Returns base64-encoded audio or None."""
    try:
        from voice_engine.voice_ai_service import get_voice_ai_service

        svc = get_voice_ai_service()
        result = await svc.generate_response_audio(
            text=text,
            language=language,
            voice_id=voice_id,
        )
        return result.get("audio_base64")
    except (ImportError, Exception) as exc:
        logger.warning("Voice engine TTS not available: %s", exc)

    # Fallback: edge-tts
    try:
        import edge_tts

        voice_map = {
            "en": "en-IN-NeerjaNeural",
            "hi": "hi-IN-SwaraNeural",
            "ta": "ta-IN-PallaviNeural",
            "te": "te-IN-ShrutiNeural",
            "kn": "kn-IN-SapnaNeural",
            "ml": "ml-IN-SobhanaNeural",
        }
        voice_name = voice_map.get(language, "en-IN-NeerjaNeural")
        communicate = edge_tts.Communicate(text, voice_name)
        audio_chunks: list[bytes] = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_chunks.append(chunk["data"])

        if audio_chunks:
            audio_bytes = b"".join(audio_chunks)
            return base64.b64encode(audio_bytes).decode("utf-8")
    except Exception as exc:
        logger.warning("edge-tts fallback failed: %s", exc)

    return None


# =====================================================================
# Router: Voice Conversation (REST)
# =====================================================================

conversation_router = APIRouter(
    prefix="/api/v1/voice/conversation",
    tags=["Voice Conversation"],
)


@conversation_router.post(
    "/start",
    response_model=StartConversationResponse,
    summary="Start a new voice conversation session",
)
async def start_conversation(
    body: StartConversationRequest,
    request: Request,
):
    """Start a new conversation session with a voice agent.

    Returns the session_id and WebSocket URL for real-time communication.
    Greeting message is automatically added to the conversation history.
    """
    client_ip = request.client.host if request.client else "unknown"
    authenticated = _validate_api_key(body.api_key)

    if not _check_rate_limit(client_ip, authenticated):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please try again later.",
        )

    agent = _get_agent(body.agent_id)
    session_id = str(uuid.uuid4())
    now = datetime.datetime.utcnow().isoformat()

    # Create session with greeting as first message
    greeting_msg = ConversationMessage(
        role=MessageRole.ASSISTANT,
        text=agent["greeting"],
        language=agent["language"],
        emotion="friendly",
        timestamp=now,
    )

    session = ConversationSession(
        session_id=session_id,
        agent_id=body.agent_id,
        language=body.language or agent["language"],
        started_at=now,
        messages=[greeting_msg],
        metadata={
            "client_ip": client_ip,
            "authenticated": authenticated,
            **body.metadata,
        },
        # GAP 7 — carry caller identity for cross-call memory
        tenant_id=body.tenant_id or "",
        phone=body.phone or "",
    )
    _sessions[session_id] = session

    # Determine WS scheme
    ws_scheme = "wss" if request.url.scheme == "https" else "ws"
    ws_url = (
        f"{ws_scheme}://{request.url.netloc}"
        f"/api/v1/voice/conversation/ws"
        f"?agent_id={body.agent_id}&session_id={session_id}"
    )
    if body.api_key:
        ws_url += f"&api_key={body.api_key}"

    logger.info(
        "Conversation started: session=%s agent=%s language=%s ip=%s",
        session_id,
        body.agent_id,
        body.language,
        client_ip,
    )

    return StartConversationResponse(
        session_id=session_id,
        agent_id=body.agent_id,
        agent_name=agent["name"],
        greeting=agent["greeting"],
        language=agent["language"],
        websocket_url=ws_url,
    )


@conversation_router.post(
    "/{session_id}/message",
    response_model=TextMessageResponse,
    summary="Send a text message in a conversation",
)
async def send_text_message(
    session_id: str,
    body: TextMessageRequest,
    request: Request,
):
    """Send a text message and receive an AI text (and optionally audio) response."""
    session = _get_session(session_id)
    agent = _get_agent(session.agent_id)

    # Store user message
    user_msg = ConversationMessage(
        role=MessageRole.USER,
        text=body.text,
        language=body.language or session.language,
    )
    session.messages.append(user_msg)

    # Build conversation history for LLM
    llm_messages = [
        {"role": msg.role.value, "content": msg.text}
        for msg in session.messages
        if msg.role != MessageRole.SYSTEM
    ]

    # Generate response
    response_text = await _generate_llm_response(
        messages=llm_messages,
        system_prompt=agent["system_prompt"],
        language=session.language,
    )

    # Optionally synthesize audio
    audio_b64 = await _synthesize_audio(
        text=response_text,
        language=session.language,
        voice_id=agent.get("voice"),
    )

    # Store assistant message
    assistant_msg = ConversationMessage(
        role=MessageRole.ASSISTANT,
        text=response_text,
        audio_base64=audio_b64,
        language=session.language,
        emotion="friendly",
    )
    session.messages.append(assistant_msg)

    logger.info(
        "Text message processed: session=%s user_text=%s",
        session_id,
        body.text[:50],
    )

    return TextMessageResponse(
        message_id=assistant_msg.id,
        text=response_text,
        audio_base64=audio_b64,
        emotion="friendly",
        format="mp3" if audio_b64 else None,
    )


@conversation_router.post(
    "/{session_id}/audio",
    response_model=AudioMessageResponse,
    summary="Send an audio chunk in a conversation",
)
async def send_audio_message(
    session_id: str,
    request: Request,
    file: UploadFile = File(..., description="Audio file (WAV, MP3, WebM, OGG)"),
    language: str | None = None,
):
    """Upload an audio file, get transcription + AI voice response."""
    session = _get_session(session_id)
    agent = _get_agent(session.agent_id)

    audio_bytes = await file.read()
    if len(audio_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty audio file",
        )

    # 10 MB limit for audio chunks
    if len(audio_bytes) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio file too large (max 10 MB per chunk)",
        )

    # Transcribe
    transcription = await _transcribe_audio(
        audio_bytes,
        language=language or session.language,
    )

    # Store user message
    user_msg = ConversationMessage(
        role=MessageRole.USER,
        text=transcription["text"],
        language=transcription["language"],
        confidence=transcription["confidence"],
        emotion=transcription.get("emotion"),
    )
    session.messages.append(user_msg)

    # Build conversation history for LLM
    llm_messages = [
        {"role": msg.role.value, "content": msg.text}
        for msg in session.messages
        if msg.role != MessageRole.SYSTEM
    ]

    # Generate response
    response_text = await _generate_llm_response(
        messages=llm_messages,
        system_prompt=agent["system_prompt"],
        language=session.language,
    )

    # Synthesize response audio
    audio_b64 = await _synthesize_audio(
        text=response_text,
        language=session.language,
        voice_id=agent.get("voice"),
    )

    # Store assistant message
    assistant_msg = ConversationMessage(
        role=MessageRole.ASSISTANT,
        text=response_text,
        audio_base64=audio_b64,
        language=session.language,
        emotion="friendly",
    )
    session.messages.append(assistant_msg)

    logger.info(
        "Audio message processed: session=%s transcription=%s",
        session_id,
        transcription["text"][:50],
    )

    return AudioMessageResponse(
        message_id=assistant_msg.id,
        transcription=transcription["text"],
        response_text=response_text,
        response_audio_base64=audio_b64,
        emotion=transcription.get("emotion"),
        language=transcription["language"],
        confidence=transcription["confidence"],
        format="mp3" if audio_b64 else None,
    )


@conversation_router.get(
    "/{session_id}/history",
    response_model=ConversationHistoryResponse,
    summary="Get conversation history",
)
async def get_conversation_history(session_id: str):
    """Retrieve the full message history for a conversation session."""
    session = _get_session(session_id)
    agent = DEMO_AGENTS.get(session.agent_id, {})

    # Strip audio from history to reduce payload size
    messages = []
    for msg in session.messages:
        messages.append(ConversationMessage(
            id=msg.id,
            role=msg.role,
            text=msg.text,
            emotion=msg.emotion,
            language=msg.language,
            confidence=msg.confidence,
            timestamp=msg.timestamp,
            audio_base64=None,  # Omit audio from history endpoint
        ))

    return ConversationHistoryResponse(
        session_id=session.session_id,
        agent_id=session.agent_id,
        agent_name=agent.get("name", "Unknown Agent"),
        message_count=len(messages),
        messages=messages,
        started_at=session.started_at,
        ended_at=session.ended_at,
    )


@conversation_router.post(
    "/{session_id}/end",
    summary="End a conversation session",
)
async def end_conversation(session_id: str):
    """End a conversation session. The session data is retained for history."""
    session = _get_session(session_id)
    session.ended_at = datetime.datetime.utcnow().isoformat()

    message_count = len(session.messages)
    duration_s = 0.0
    try:
        start = datetime.datetime.fromisoformat(session.started_at)
        end = datetime.datetime.fromisoformat(session.ended_at)
        duration_s = (end - start).total_seconds()
    except (ValueError, TypeError):
        pass

    logger.info(
        "Conversation ended: session=%s messages=%d duration=%.1fs",
        session_id,
        message_count,
        duration_s,
    )

    return {
        "session_id": session_id,
        "status": "ended",
        "message_count": message_count,
        "duration_seconds": round(duration_s, 1),
        "ended_at": session.ended_at,
    }


# =====================================================================
# Router: Widget (Public)
# =====================================================================

widget_router = APIRouter(prefix="/api/v1/widget", tags=["Widget"])


@widget_router.get(
    "/agent/{agent_id}",
    response_model=AgentConfigResponse,
    summary="Get agent configuration for widget (public)",
)
async def get_agent_config(agent_id: str):
    """Public endpoint: returns agent display config for the embeddable widget.

    No authentication required. Designed for cross-origin widget embedding.
    """
    agent = _get_agent(agent_id)

    return AgentConfigResponse(
        agent_id=agent_id,
        name=agent["name"],
        greeting=agent["greeting"],
        language=agent["language"],
        voice=agent["voice"],
        avatar=agent["avatar"],
        theme=agent["theme"],
        allowed_domains=agent.get("allowed_domains", ["*"]),
    )


@widget_router.get("/agents", summary="List all available agents (public)")
async def list_agents():
    """Public endpoint: list all available demo agents."""
    agents = []
    for agent_id, agent in DEMO_AGENTS.items():
        agents.append({
            "agent_id": agent_id,
            "name": agent["name"],
            "language": agent["language"],
            "greeting": agent["greeting"],
            "avatar": agent["avatar"],
            "theme": agent["theme"],
        })
    return {"agents": agents}


@widget_router.get(
    "/embed.js",
    summary="Serve the embeddable JavaScript widget",
)
async def serve_embed_js(request: Request):
    """Serve the embeddable widget JavaScript.

    Usage in customer website:
      <script src="https://your-domain.com/api/v1/widget/embed.js"
              data-agent-id="sales-assistant-en"></script>
    """
    base_url = str(request.base_url).rstrip("/")
    api_base = f"{base_url}/api/v1"
    ws_scheme = "wss" if request.url.scheme == "https" else "ws"
    ws_base = f"{ws_scheme}://{request.url.netloc}/api/v1"

    js_content = _generate_embed_js(api_base, ws_base)
    return Response(
        content=js_content,
        media_type="application/javascript",
        headers={
            "Cache-Control": "public, max-age=3600",
            "Access-Control-Allow-Origin": "*",
        },
    )


@widget_router.get(
    "/embed.css",
    summary="Serve the widget stylesheet",
)
async def serve_embed_css():
    """Serve the embeddable widget CSS stylesheet."""
    css_content = _generate_embed_css()
    return Response(
        content=css_content,
        media_type="text/css",
        headers={
            "Cache-Control": "public, max-age=3600",
            "Access-Control-Allow-Origin": "*",
        },
    )


# =====================================================================
# WebSocket turn helpers
# =====================================================================


async def _handle_turn_parallel(
    websocket: WebSocket,
    audio: bytes,
    session: Any,
    agent: dict[str, Any],
) -> None:
    """
    Process one audio turn via the parallel pipeline (Track A):
    STT → LLM → TTS → send audio back.
    Non-interruptible version (legacy fallback).
    """
    # Transcribe
    transcription = await _transcribe_audio(audio, language=session.language)

    await websocket.send_text(json.dumps({
        "type": "transcription",
        "text": transcription["text"],
        "language": transcription["language"],
        "confidence": transcription["confidence"],
    }))

    user_msg = ConversationMessage(
        role=MessageRole.USER,
        text=transcription["text"],
        language=transcription["language"],
        confidence=transcription["confidence"],
        emotion=transcription.get("emotion"),
    )
    session.messages.append(user_msg)

    llm_messages = [
        {"role": m.role.value, "content": m.text}
        for m in session.messages
        if m.role != MessageRole.SYSTEM
    ]
    response_text = await _generate_llm_response(
        messages=llm_messages,
        system_prompt=agent["system_prompt"],
        language=session.language,
    )

    assistant_msg = ConversationMessage(
        role=MessageRole.ASSISTANT,
        text=response_text,
        language=session.language,
        emotion="friendly",
    )
    session.messages.append(assistant_msg)

    await websocket.send_text(json.dumps({
        "type": "text_response",
        "text": response_text,
        "emotion": "friendly",
        "message_id": assistant_msg.id,
    }))

    audio_b64 = await _synthesize_audio(
        text=response_text,
        language=session.language,
        voice_id=agent.get("voice"),
    )
    if audio_b64:
        await websocket.send_text(json.dumps({
            "type": "audio_response",
            "audio": audio_b64,
            "text": response_text,
            "emotion": "friendly",
            "format": "mp3",
            "message_id": assistant_msg.id,
        }))


async def _handle_turn_parallel_interruptible(
    websocket: WebSocket,
    audio: bytes,
    session: Any,
    agent: dict[str, Any],
    task_tracker: Any | None = None,
    interrupt_mgr: Any | None = None,
) -> None:
    """
    Interruptible parallel pipeline (Track A) with task tracking.

    Each async operation is wrapped in a tracked task so the interruption
    manager can cancel mid-flight if the user barges in.

    Flow:
      1. STT (tracked task — cancellable)
      2. LLM (tracked task — cancellable)
      3. TTS (tracked task — cancellable)
      4. Send audio chunks back

    If interrupt_mgr or task_tracker is None, behaves identically to
    _handle_turn_parallel (non-interruptible fallback).
    """
    sid = session.session_id

    # Fallback to non-interruptible if manager not available
    if not task_tracker:
        await _handle_turn_parallel(websocket, audio, session, agent)
        return

    # ── Step 1: STT (cancellable) ─────────────────────────────────────
    stt_task = asyncio.create_task(
        _transcribe_audio(audio, language=session.language),
    )
    task_tracker.track(sid, stt_task)

    try:
        transcription = await stt_task
    except asyncio.CancelledError:
        logger.info("STT cancelled by interrupt (session=%s)", sid)
        return

    await websocket.send_text(json.dumps({
        "type": "transcription",
        "text": transcription["text"],
        "language": transcription["language"],
        "confidence": transcription["confidence"],
    }))

    user_msg = ConversationMessage(
        role=MessageRole.USER,
        text=transcription["text"],
        language=transcription["language"],
        confidence=transcription["confidence"],
        emotion=transcription.get("emotion"),
    )
    session.messages.append(user_msg)

    # ── Step 2: LLM (cancellable) ─────────────────────────────────────
    llm_messages = [
        {"role": m.role.value, "content": m.text}
        for m in session.messages
        if m.role != MessageRole.SYSTEM
    ]
    llm_task = asyncio.create_task(
        _generate_llm_response(
            messages=llm_messages,
            system_prompt=agent["system_prompt"],
            language=session.language,
        ),
    )
    task_tracker.track(sid, llm_task)

    try:
        response_text = await llm_task
    except asyncio.CancelledError:
        logger.info("LLM cancelled by interrupt (session=%s)", sid)
        return

    assistant_msg = ConversationMessage(
        role=MessageRole.ASSISTANT,
        text=response_text,
        language=session.language,
        emotion="friendly",
    )
    session.messages.append(assistant_msg)

    await websocket.send_text(json.dumps({
        "type": "text_response",
        "text": response_text,
        "emotion": "friendly",
        "message_id": assistant_msg.id,
    }))

    # Update interrupt manager with what agent is about to say
    if interrupt_mgr:
        interrupt_mgr.set_agent_text(response_text)

    # ── Step 3: TTS (cancellable) ─────────────────────────────────────
    tts_task = asyncio.create_task(
        _synthesize_audio(
            text=response_text,
            language=session.language,
            voice_id=agent.get("voice"),
        ),
    )
    task_tracker.track(sid, tts_task)

    try:
        audio_b64 = await tts_task
    except asyncio.CancelledError:
        logger.info("TTS cancelled by interrupt (session=%s)", sid)
        return

    if audio_b64:
        await websocket.send_text(json.dumps({
            "type": "audio_response",
            "audio": audio_b64,
            "text": response_text,
            "emotion": "friendly",
            "format": "mp3",
            "message_id": assistant_msg.id,
        }))

    # Clean up completed tasks
    task_tracker.clear(sid)


async def _handle_turn_s2s(
    websocket: WebSocket,
    audio: bytes,
    session: Any,
    agent: dict[str, Any],
    client_tier: str,
) -> None:
    """
    Process one audio turn via the S2S orchestrator (Track B/C/D).
    The orchestrator yields PCM16 chunks which are base64-encoded and
    streamed back to the client as audio_response frames.
    """
    from voice_engine.orchestrator import S2SOrchestrator  # noqa: PLC0415

    transcript_holder: list[str] = []

    def on_transcript(text: str) -> None:
        transcript_holder.append(text)

    # Wrap the buffered audio as a single-item async iterator
    async def _one_shot():
        yield audio

    orch = S2SOrchestrator(
        system_prompt=agent["system_prompt"],
        language=session.language,
        client_tier=client_tier,
        # GAP 7 — enable cross-call memory for this session
        tenant_id=session.tenant_id,
        phone=session.phone,
    )

    audio_chunks: list[bytes] = []
    try:
        async for chunk in orch.stream(_one_shot(), call_id=session.session_id, on_transcript=on_transcript):
            if chunk:
                audio_chunks.append(chunk)
    except Exception as exc:
        logger.error("S2S orchestrator error (session=%s): %s", session.session_id, exc)
        # Fallback to parallel pipeline on S2S error
        await _handle_turn_parallel(websocket, audio, session, agent)
        return

    if transcript_holder:
        transcript_text = " ".join(transcript_holder)
        await websocket.send_text(json.dumps({
            "type": "transcription",
            "text": transcript_text,
            "language": session.language,
            "confidence": 0.95,
        }))
        user_msg = ConversationMessage(
            role=MessageRole.USER,
            text=transcript_text,
            language=session.language,
        )
        session.messages.append(user_msg)

    if audio_chunks:
        combined_pcm = b"".join(audio_chunks)
        audio_b64 = base64.b64encode(combined_pcm).decode()
        assistant_msg = ConversationMessage(
            role=MessageRole.ASSISTANT,
            text="[S2S audio response]",
            language=session.language,
            emotion="friendly",
        )
        session.messages.append(assistant_msg)
        await websocket.send_text(json.dumps({
            "type": "audio_response",
            "audio": audio_b64,
            "text": "",
            "emotion": "friendly",
            "format": "pcm16",
            "message_id": assistant_msg.id,
        }))


async def _fire_training_pipeline(session_id: str, language: str) -> None:
    """
    Fire-and-forget: submit completed call to the training corpus pipeline.
    Called at the end of every Track A (parallel) call.
    Errors are logged and swallowed — never block the call path.
    """
    try:
        from voice_engine.track_a_to_s2s_pipeline import TrackAToS2SPipeline  # noqa: PLC0415
        pipeline = TrackAToS2SPipeline()
        await pipeline.submit_session(session_id=session_id, language=language)
        logger.debug("[Training] Submitted session %s (lang=%s) to corpus", session_id, language)
    except Exception as exc:
        logger.debug("[Training] Corpus submission skipped for %s: %s", session_id, exc)


# =====================================================================
# WebSocket: Real-Time Voice Conversation
# =====================================================================

ws_router = APIRouter(prefix="/api/v1/voice/conversation", tags=["Voice Conversation WS"])


@ws_router.websocket("/ws")
async def voice_conversation_ws(
    websocket: WebSocket,
    agent_id: str = Query("sales-assistant-en"),
    session_id: str | None = Query(None),
    api_key: str | None = Query(None),
    language: str | None = Query(None),
    client_tier: str = Query("standard"),
    # GAP 7 — caller identity for cross-call memory
    phone: str | None = Query(None),
    tenant_id: str | None = Query(None),
):
    """Real-time WebSocket voice conversation endpoint.

    Protocol:
      Client -> Server:
        {"type": "audio_chunk", "data": "<base64>", "format": "webm"}
        {"type": "text", "text": "hello"}
        {"type": "end_turn"}
        {"type": "interrupt"}
        {"type": "ping"}

      Server -> Client:
        {"type": "audio_response", "audio": "<base64>", "text": "...", "emotion": "...", "format": "mp3"}
        {"type": "text_response", "text": "..."}
        {"type": "transcription", "text": "...", "language": "...", "confidence": 0.95}
        {"type": "error", "message": "..."}
        {"type": "session_started", "session_id": "...", "agent": {...}}
        {"type": "pong"}
    """
    # Validate agent
    agent = DEMO_AGENTS.get(agent_id)
    if agent is None:
        await websocket.close(code=4004, reason=f"Agent '{agent_id}' not found")
        return

    # Rate check
    client_ip = websocket.client.host if websocket.client else "unknown"
    authenticated = _validate_api_key(api_key)
    if not _check_rate_limit(client_ip, authenticated):
        await websocket.close(code=4029, reason="Rate limit exceeded")
        return

    await websocket.accept()

    # Create or resume session
    if session_id and session_id in _sessions:
        session = _sessions[session_id]
    else:
        session_id = session_id or str(uuid.uuid4())
        now = datetime.datetime.utcnow().isoformat()
        effective_language = language or agent["language"]

        greeting_msg = ConversationMessage(
            role=MessageRole.ASSISTANT,
            text=agent["greeting"],
            language=agent["language"],
            emotion="friendly",
            timestamp=now,
        )
        session = ConversationSession(
            session_id=session_id,
            agent_id=agent_id,
            language=effective_language,
            started_at=now,
            messages=[greeting_msg],
            metadata={"client_ip": client_ip, "authenticated": authenticated},
            # GAP 7 — carry caller identity for cross-call memory
            tenant_id=tenant_id or "",
            phone=phone or "",
        )
        _sessions[session_id] = session

    # Send session info and greeting
    try:
        await websocket.send_text(json.dumps({
            "type": "session_started",
            "session_id": session_id,
            "agent": {
                "id": agent_id,
                "name": agent["name"],
                "language": agent["language"],
                "avatar": agent["avatar"],
                "theme": agent["theme"],
            },
        }))
        await websocket.send_text(json.dumps({
            "type": "text_response",
            "text": agent["greeting"],
            "emotion": "friendly",
        }))
    except Exception as exc:
        logger.error("Failed to send initial WS messages: %s", exc)
        return

    logger.info(
        "WS voice conversation connected: session=%s agent=%s ip=%s",
        session_id,
        agent_id,
        client_ip,
    )

    # Audio buffer for chunked audio streaming
    audio_buffer: list[bytes] = []

    # ── Interruption manager setup ────────────────────────
    # Provides real barge-in: 3-layer false interrupt filtering
    # (duration gate → backchannel check → confidence gate)
    interrupt_mgr = None
    task_tracker = None
    agent_is_speaking = False
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
            language=session.language,
        )
        task_tracker = SessionTaskTracker()
        logger.info("Interruption manager enabled for session=%s", session_id)
    except Exception as exc:
        logger.warning(
            "Interruption manager not available (session=%s): %s — "
            "falling back to buffer-only interrupt",
            session_id,
            exc,
        )

    try:
        while True:
            raw = await websocket.receive_text()

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON",
                }))
                continue

            msg_type = msg.get("type", "")

            # ── Ping/Pong ────────────────────────────────────
            if msg_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
                continue

            # ── Text message ─────────────────────────────────
            if msg_type == "text":
                user_text = msg.get("text", "").strip()
                if not user_text:
                    continue

                # Store user message
                user_msg = ConversationMessage(
                    role=MessageRole.USER,
                    text=user_text,
                    language=session.language,
                )
                session.messages.append(user_msg)

                # Generate LLM response
                llm_messages = [
                    {"role": m.role.value, "content": m.text}
                    for m in session.messages
                    if m.role != MessageRole.SYSTEM
                ]
                response_text = await _generate_llm_response(
                    messages=llm_messages,
                    system_prompt=agent["system_prompt"],
                    language=session.language,
                )

                # Store assistant message
                assistant_msg = ConversationMessage(
                    role=MessageRole.ASSISTANT,
                    text=response_text,
                    language=session.language,
                    emotion="friendly",
                )
                session.messages.append(assistant_msg)

                # Send text response first
                await websocket.send_text(json.dumps({
                    "type": "text_response",
                    "text": response_text,
                    "emotion": "friendly",
                    "message_id": assistant_msg.id,
                }))

                # Synthesize and send audio (non-blocking)
                agent_is_speaking = True
                if interrupt_mgr:
                    interrupt_mgr.reset()
                audio_b64 = await _synthesize_audio(
                    text=response_text,
                    language=session.language,
                    voice_id=agent.get("voice"),
                )
                if audio_b64:
                    if interrupt_mgr:
                        interrupt_mgr.set_agent_text(response_text)
                    await websocket.send_text(json.dumps({
                        "type": "audio_response",
                        "audio": audio_b64,
                        "text": response_text,
                        "emotion": "friendly",
                        "format": "mp3",
                        "message_id": assistant_msg.id,
                    }))
                agent_is_speaking = False

            # ── Audio chunk ──────────────────────────────────
            elif msg_type == "audio_chunk":
                audio_data = msg.get("data", "")
                if not audio_data:
                    continue

                try:
                    decoded = base64.b64decode(audio_data)
                except Exception:
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": "Invalid base64 audio data",
                    }))
                    continue

                # ── Barge-in detection during agent playback ──
                if agent_is_speaking and interrupt_mgr:
                    decision = await interrupt_mgr.check(decoded)

                    if decision.action == InterruptAction.INTERRUPT:
                        # Real interrupt confirmed — cancel everything
                        agent_is_speaking = False

                        if task_tracker:
                            cancelled = await task_tracker.cancel_all(session_id)
                            logger.info(
                                "Interrupt: cancelled %d tasks (session=%s)",
                                cancelled,
                                session_id,
                            )

                        # Notify client to stop playback
                        await websocket.send_text(json.dumps({
                            "type": "interrupted",
                            "message": "Barge-in detected",
                            "reason": decision.reason,
                            "agent_partial_text": decision.agent_partial_text,
                        }))

                        # Inject interrupt context into conversation
                        if decision.agent_partial_text:
                            interrupt_note = ConversationMessage(
                                role=MessageRole.SYSTEM,
                                text=(
                                    f"[Agent was interrupted. Agent had said: "
                                    f"'{decision.agent_partial_text}'. "
                                    f"User interrupted with: "
                                    f"'{decision.transcript or '[speech]'}']"
                                ),
                                language=session.language,
                            )
                            session.messages.append(interrupt_note)

                        # Feed accumulated audio as the start of new input
                        if decision.accumulated_audio:
                            audio_buffer.clear()
                            audio_buffer.append(decision.accumulated_audio)

                        continue

                    if decision.action == InterruptAction.WAIT:
                        # Still checking — buffer audio but don't process yet
                        audio_buffer.append(decoded)
                        continue

                    # IGNORE — not speech, just buffer normally
                    # (don't add to buffer during playback if it's noise)
                    continue

                # Normal mode — agent not speaking, buffer audio
                audio_buffer.append(decoded)

            # ── End turn (process buffered audio) ────────────
            elif msg_type == "end_turn":
                if audio_buffer:
                    combined_audio = b"".join(audio_buffer)
                    audio_buffer.clear()

                    # Mark agent as speaking before processing
                    agent_is_speaking = True
                    if interrupt_mgr:
                        interrupt_mgr.reset()

                    # Premium/enterprise tiers route through S2S orchestrator
                    # for low-latency full-duplex audio (Track B/C/D).
                    # Standard/budget tiers use the parallel pipeline (Track A).
                    use_s2s = client_tier in ("premium", "enterprise")

                    if use_s2s:
                        await _handle_turn_s2s(
                            websocket=websocket,
                            audio=combined_audio,
                            session=session,
                            agent=agent,
                            client_tier=client_tier,
                        )
                    else:
                        await _handle_turn_parallel_interruptible(
                            websocket=websocket,
                            audio=combined_audio,
                            session=session,
                            agent=agent,
                            task_tracker=task_tracker,
                            interrupt_mgr=interrupt_mgr,
                        )

                    agent_is_speaking = False

            # ── Interrupt (explicit client interrupt) ────────
            elif msg_type == "interrupt":
                agent_is_speaking = False
                audio_buffer.clear()

                if task_tracker:
                    cancelled = await task_tracker.cancel_all(session_id)
                    logger.info(
                        "Explicit interrupt: cancelled %d tasks (session=%s)",
                        cancelled,
                        session_id,
                    )

                if interrupt_mgr:
                    interrupt_mgr.reset()

                await websocket.send_text(json.dumps({
                    "type": "interrupted",
                    "message": "Audio buffer cleared, tasks cancelled",
                }))

            else:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": f"Unknown message type: {msg_type}",
                }))

    except WebSocketDisconnect:
        logger.info("WS voice conversation disconnected: session=%s", session_id)
    except Exception as exc:
        logger.error(
            "WS voice conversation error: session=%s error=%s",
            session_id,
            exc,
        )
    finally:
        # Clean up interrupt tracking
        if task_tracker:
            task_tracker.cleanup_session(session_id)

        # Mark session as ended
        if session_id in _sessions:
            _sessions[session_id].ended_at = (
                datetime.datetime.utcnow().isoformat()
            )
        # Fire training pipeline for Track A calls (corpus flywheel)
        # Non-S2S (standard/budget) calls contribute to the Tamil training corpus.
        if client_tier not in ("premium", "enterprise"):
            asyncio.create_task(
                _fire_training_pipeline(session_id, session.language)
            )


# =====================================================================
# Embed JS/CSS Generation
# =====================================================================


def _generate_embed_js(api_base: str, ws_base: str) -> str:
    """Generate the embeddable widget JavaScript."""
    return f"""
(function() {{
  'use strict';

  // ── Configuration ──────────────────────────────────────
  var VOICEFLOW_API = '{api_base}';
  var VOICEFLOW_WS  = '{ws_base}';

  var script = document.currentScript;
  var agentId = script ? script.getAttribute('data-agent-id') : 'sales-assistant-en';
  var apiKey  = script ? script.getAttribute('data-api-key') : '';
  var position = script ? script.getAttribute('data-position') : 'bottom-right';

  // ── State ─────────────────────────────────────────────
  var sessionId = null;
  var ws = null;
  var isOpen = false;
  var isRecording = false;
  var mediaRecorder = null;
  var audioChunks = [];
  var agentConfig = null;

  // ── Load Agent Config ─────────────────────────────────
  function loadAgentConfig(cb) {{
    fetch(VOICEFLOW_API + '/widget/agent/' + agentId)
      .then(function(r) {{ return r.json(); }})
      .then(function(data) {{
        agentConfig = data;
        cb(data);
      }})
      .catch(function(err) {{
        console.warn('[VoiceFlow] Failed to load agent config:', err);
        agentConfig = {{
          name: 'AI Assistant',
          greeting: 'Hello! How can I help you?',
          theme: {{ primary: '#6366f1', bg: '#0f172a' }},
          avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Default'
        }};
        cb(agentConfig);
      }});
  }}

  // ── Create Widget DOM ─────────────────────────────────
  function createWidget(config) {{
    // Load CSS
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = VOICEFLOW_API + '/widget/embed.css';
    document.head.appendChild(link);

    // Container
    var container = document.createElement('div');
    container.id = 'vf-widget-container';
    container.className = 'vf-widget vf-' + position;

    // FAB button
    var fab = document.createElement('button');
    fab.id = 'vf-fab';
    fab.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
    fab.style.background = config.theme.primary;
    fab.onclick = toggleWidget;

    // Chat panel
    var panel = document.createElement('div');
    panel.id = 'vf-panel';
    panel.style.display = 'none';
    panel.innerHTML = [
      '<div class="vf-header" style="background:' + config.theme.primary + '">',
      '  <img src="' + config.avatar + '" class="vf-avatar" alt="' + config.name + '"/>',
      '  <div class="vf-header-info">',
      '    <span class="vf-agent-name">' + config.name + '</span>',
      '    <span class="vf-status">Online</span>',
      '  </div>',
      '  <button class="vf-close" onclick="document.getElementById(\\'vf-panel\\').style.display=\\'none\\'">&times;</button>',
      '</div>',
      '<div id="vf-messages" class="vf-messages"></div>',
      '<div class="vf-input-area">',
      '  <input id="vf-text-input" type="text" placeholder="Type a message..." />',
      '  <button id="vf-send-btn" class="vf-btn" style="background:' + config.theme.primary + '">',
      '    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
      '  </button>',
      '  <button id="vf-mic-btn" class="vf-btn vf-mic-btn" style="background:' + config.theme.primary + '">',
      '    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>',
      '  </button>',
      '</div>',
    ].join('\\n');

    container.appendChild(panel);
    container.appendChild(fab);
    document.body.appendChild(container);

    // Bind events
    document.getElementById('vf-send-btn').onclick = sendTextMessage;
    document.getElementById('vf-text-input').onkeydown = function(e) {{
      if (e.key === 'Enter') sendTextMessage();
    }};
    document.getElementById('vf-mic-btn').onclick = toggleRecording;
  }}

  // ── Toggle Widget ─────────────────────────────────────
  function toggleWidget() {{
    var panel = document.getElementById('vf-panel');
    isOpen = !isOpen;
    panel.style.display = isOpen ? 'flex' : 'none';
    if (isOpen && !sessionId) startSession();
  }}

  // ── Start Session ─────────────────────────────────────
  function startSession() {{
    fetch(VOICEFLOW_API + '/voice/conversation/start', {{
      method: 'POST',
      headers: {{ 'Content-Type': 'application/json' }},
      body: JSON.stringify({{ agent_id: agentId, api_key: apiKey }})
    }})
    .then(function(r) {{ return r.json(); }})
    .then(function(data) {{
      sessionId = data.session_id;
      addMessage(data.greeting, 'assistant');
      connectWebSocket();
    }})
    .catch(function(err) {{
      console.error('[VoiceFlow] Failed to start session:', err);
      addMessage('Connection failed. Please try again.', 'system');
    }});
  }}

  // ── WebSocket Connection ──────────────────────────────
  function connectWebSocket() {{
    if (ws) ws.close();
    var url = VOICEFLOW_WS + '/voice/conversation/ws?agent_id=' + agentId + '&session_id=' + sessionId;
    if (apiKey) url += '&api_key=' + apiKey;
    ws = new WebSocket(url);

    ws.onmessage = function(event) {{
      try {{
        var msg = JSON.parse(event.data);
        if (msg.type === 'text_response') {{
          addMessage(msg.text, 'assistant');
        }} else if (msg.type === 'audio_response' && msg.audio) {{
          playAudio(msg.audio, msg.format || 'mp3');
        }} else if (msg.type === 'transcription') {{
          addMessage(msg.text, 'user');
        }}
      }} catch(e) {{}}
    }};

    ws.onclose = function() {{
      setTimeout(function() {{
        if (isOpen && sessionId) connectWebSocket();
      }}, 3000);
    }};
  }}

  // ── Send Text ─────────────────────────────────────────
  function sendTextMessage() {{
    var input = document.getElementById('vf-text-input');
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMessage(text, 'user');
    if (ws && ws.readyState === WebSocket.OPEN) {{
      ws.send(JSON.stringify({{ type: 'text', text: text }}));
    }}
  }}

  // ── Voice Recording ───────────────────────────────────
  function toggleRecording() {{
    if (isRecording) {{
      stopRecording();
    }} else {{
      startRecording();
    }}
  }}

  function startRecording() {{
    navigator.mediaDevices.getUserMedia({{ audio: true }})
      .then(function(stream) {{
        mediaRecorder = new MediaRecorder(stream, {{ mimeType: 'audio/webm' }});
        audioChunks = [];
        mediaRecorder.ondataavailable = function(e) {{
          if (e.data.size > 0) audioChunks.push(e.data);
        }};
        mediaRecorder.onstop = function() {{
          var blob = new Blob(audioChunks, {{ type: 'audio/webm' }});
          var reader = new FileReader();
          reader.onloadend = function() {{
            var b64 = reader.result.split(',')[1];
            if (ws && ws.readyState === WebSocket.OPEN) {{
              ws.send(JSON.stringify({{ type: 'audio_chunk', data: b64, format: 'webm' }}));
              ws.send(JSON.stringify({{ type: 'end_turn' }}));
            }}
          }};
          reader.readAsDataURL(blob);
          stream.getTracks().forEach(function(t) {{ t.stop(); }});
        }};
        mediaRecorder.start();
        isRecording = true;
        document.getElementById('vf-mic-btn').classList.add('vf-recording');
      }})
      .catch(function(err) {{
        console.error('[VoiceFlow] Microphone access denied:', err);
      }});
  }}

  function stopRecording() {{
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {{
      mediaRecorder.stop();
    }}
    isRecording = false;
    document.getElementById('vf-mic-btn').classList.remove('vf-recording');
  }}

  // ── Audio Playback ────────────────────────────────────
  function playAudio(base64Audio, format) {{
    try {{
      var audio = new Audio('data:audio/' + format + ';base64,' + base64Audio);
      audio.play().catch(function() {{}});
    }} catch(e) {{}}
  }}

  // ── Message Display ───────────────────────────────────
  function addMessage(text, role) {{
    var container = document.getElementById('vf-messages');
    if (!container) return;
    var div = document.createElement('div');
    div.className = 'vf-message vf-message-' + role;
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }}

  // ── Initialize ────────────────────────────────────────
  loadAgentConfig(createWidget);
}})();
"""


def _generate_embed_css() -> str:
    """Generate the widget CSS stylesheet."""
    return """
/* VoiceFlow AI Widget Styles */
.vf-widget {
  position: fixed;
  z-index: 999999;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.vf-bottom-right { bottom: 24px; right: 24px; }
.vf-bottom-left  { bottom: 24px; left: 24px; }

#vf-fab {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  transition: transform 0.2s, box-shadow 0.2s;
}
#vf-fab:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 28px rgba(0,0,0,0.4);
}

#vf-panel {
  position: absolute;
  bottom: 72px;
  right: 0;
  width: 380px;
  max-width: calc(100vw - 32px);
  height: 560px;
  max-height: calc(100vh - 120px);
  background: #0f172a;
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 48px rgba(0,0,0,0.5);
  animation: vf-slide-up 0.3s ease-out;
}

@keyframes vf-slide-up {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}

.vf-header {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  gap: 12px;
  color: #fff;
  flex-shrink: 0;
}
.vf-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.3);
}
.vf-header-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.vf-agent-name {
  font-weight: 600;
  font-size: 15px;
}
.vf-status {
  font-size: 12px;
  opacity: 0.8;
}
.vf-close {
  background: none;
  border: none;
  color: #fff;
  font-size: 24px;
  cursor: pointer;
  padding: 4px 8px;
  opacity: 0.7;
  transition: opacity 0.15s;
}
.vf-close:hover { opacity: 1; }

.vf-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.vf-messages::-webkit-scrollbar { width: 4px; }
.vf-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }

.vf-message {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 14px;
  line-height: 1.45;
  word-wrap: break-word;
  animation: vf-fade-in 0.2s ease-out;
}

@keyframes vf-fade-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

.vf-message-assistant {
  align-self: flex-start;
  background: rgba(255,255,255,0.08);
  color: #e2e8f0;
  border-bottom-left-radius: 4px;
}
.vf-message-user {
  align-self: flex-end;
  background: #6366f1;
  color: #fff;
  border-bottom-right-radius: 4px;
}
.vf-message-system {
  align-self: center;
  background: transparent;
  color: #94a3b8;
  font-size: 12px;
  font-style: italic;
}

.vf-input-area {
  display: flex;
  padding: 12px;
  gap: 8px;
  border-top: 1px solid rgba(255,255,255,0.06);
  background: rgba(0,0,0,0.2);
  flex-shrink: 0;
}
#vf-text-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 24px;
  background: rgba(255,255,255,0.06);
  color: #e2e8f0;
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s;
}
#vf-text-input:focus {
  border-color: rgba(255,255,255,0.25);
}
#vf-text-input::placeholder { color: #64748b; }

.vf-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: opacity 0.15s;
}
.vf-btn:hover { opacity: 0.85; }

.vf-mic-btn.vf-recording {
  animation: vf-pulse 1s infinite;
  background: #ef4444 !important;
}

@keyframes vf-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
  50%      { box-shadow: 0 0 0 10px rgba(239,68,68,0); }
}

@media (max-width: 480px) {
  #vf-panel {
    width: calc(100vw - 16px);
    height: calc(100vh - 100px);
    bottom: 68px;
    right: -16px;
    border-radius: 16px 16px 0 0;
  }
}
"""


# =====================================================================
# Combined Router (to include in server.py)
# =====================================================================

router = APIRouter()
router.include_router(conversation_router)
router.include_router(widget_router)
router.include_router(ws_router)
