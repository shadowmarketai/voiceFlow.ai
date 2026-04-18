"""
Simple text chat endpoint — used by the Testing page's text-input flow.

Wraps voice_engine.api_providers.call_llm_api so the front-end can do a
single POST and get back a real LLM reply (Groq → Gemini → OpenAI →
Anthropic → Deepseek fallback chain).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str
    system_prompt: str | None = "You are a helpful AI voice assistant. Keep replies concise."
    provider: str | None = "auto"     # auto / groq / gemini / openai / anthropic / deepseek
    model: str | None = None
    language: str | None = None


class ChatResponse(BaseModel):
    text: str
    provider: str
    latency_ms: float


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    """Single-turn text chat. Returns the AI reply + which provider answered."""
    if not req.message or not req.message.strip():
        raise HTTPException(400, "Empty message")

    try:
        from voice_engine.api_providers import call_llm_api
    except Exception as exc:
        logger.error("Cannot import LLM providers: %s", exc)
        raise HTTPException(503, "LLM module unavailable")

    sys_prompt = req.system_prompt or ""
    if req.language:
        sys_prompt = (sys_prompt + f"\n\nReply in {req.language}.").strip()

    try:
        result = await call_llm_api(
            system_prompt=sys_prompt,
            user_message=req.message,
            provider=req.provider or "auto",
            model=req.model,
        )
    except Exception as exc:
        logger.warning("Chat call failed: %s", exc)
        raise HTTPException(502, f"LLM call failed: {exc}")

    return ChatResponse(
        text=result.get("text", ""),
        provider=result.get("provider", "unknown"),
        latency_ms=float(result.get("latency_ms", 0)),
    )
