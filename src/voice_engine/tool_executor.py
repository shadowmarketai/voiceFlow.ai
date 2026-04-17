"""
n8n Function Calling — Agent Tool Use via Webhooks.
====================================================

Bridges Groq/OpenAI function-calling with your n8n automation stack.
Every n8n webhook = one callable tool. The LLM decides which tool to call
and with what arguments; we execute it and return the result for the agent
to speak aloud.

Supported tools (configurable per agent via TOOLS list or DB):
  book_appointment  → Google Calendar via n8n
  send_whatsapp     → WhatsApp Business via n8n
  check_availability → Calendar availability check
  update_crm        → Zoho / HubSpot lead update
  send_payment_link → Razorpay payment link SMS
  send_sms          → Twilio/Exotel SMS

Usage in voice pipeline:
  result = await execute_llm_turn_with_tools(
      system_prompt, user_text, tools=agent_tools,
      provider="groq", model="llama-3.3-70b-versatile"
  )
  # result["text"]         — final spoken response (after tool execution)
  # result["tool_calls"]   — list of tools that fired
  # result["tool_results"] — raw webhook responses

Environment variables:
  N8N_BASE_URL      — e.g. https://n8n.shadowmarket.ai (no trailing slash)
  N8N_WEBHOOK_KEY   — optional Bearer token for n8n webhook security
  TOOL_TIMEOUT_S    — per-tool HTTP timeout in seconds (default 8)
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_N8N_BASE    = os.getenv("N8N_BASE_URL", "").rstrip("/")
_N8N_KEY     = os.getenv("N8N_WEBHOOK_KEY", "")
_TIMEOUT_S   = float(os.getenv("TOOL_TIMEOUT_S", "8"))


# ──────────────────────────────────────────────────────────────────────────────
# Built-in tool definitions (OpenAI function-calling schema)
# ──────────────────────────────────────────────────────────────────────────────

DEFAULT_TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "book_appointment",
            "description": "Book an appointment for the caller. Use when caller wants to schedule a visit, meeting, or consultation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "caller_name": {"type": "string", "description": "Full name of the caller"},
                    "phone":       {"type": "string", "description": "Caller phone number"},
                    "date":        {"type": "string", "description": "Appointment date (DD/MM/YYYY or natural language)"},
                    "time":        {"type": "string", "description": "Appointment time (e.g. 10:00 AM)"},
                    "purpose":     {"type": "string", "description": "Reason for appointment"},
                    "location":    {"type": "string", "description": "Property or clinic location if applicable"},
                },
                "required": ["caller_name", "phone", "date", "time"],
            },
            "webhook": "/webhook/book-appointment",
        },
    },
    {
        "type": "function",
        "function": {
            "name": "send_whatsapp",
            "description": "Send a WhatsApp message or document to the caller. Use when caller asks to receive brochure, price list, location map, or confirmation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "phone":        {"type": "string", "description": "Recipient phone number with country code"},
                    "message":      {"type": "string", "description": "Text message to send"},
                    "document_url": {"type": "string", "description": "URL of document to send (optional)"},
                    "template":     {"type": "string", "description": "WhatsApp template name if applicable"},
                },
                "required": ["phone", "message"],
            },
            "webhook": "/webhook/send-whatsapp",
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_availability",
            "description": "Check available appointment slots or property availability for a given date.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date":     {"type": "string", "description": "Date to check availability for"},
                    "resource": {"type": "string", "description": "What to check: doctor, property_visit, showroom_slot"},
                },
                "required": ["date"],
            },
            "webhook": "/webhook/check-availability",
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_crm",
            "description": "Update or create a CRM lead record with caller details.",
            "parameters": {
                "type": "object",
                "properties": {
                    "phone":    {"type": "string"},
                    "name":     {"type": "string"},
                    "email":    {"type": "string"},
                    "intent":   {"type": "string", "description": "e.g. property_viewing, loan_enquiry, appointment"},
                    "budget":   {"type": "string"},
                    "notes":    {"type": "string"},
                    "stage":    {"type": "string", "description": "lead pipeline stage: new, contacted, qualified, converted"},
                },
                "required": ["phone"],
            },
            "webhook": "/webhook/update-crm",
        },
    },
    {
        "type": "function",
        "function": {
            "name": "send_payment_link",
            "description": "Send a Razorpay payment link via SMS to the caller for advance booking or token amount.",
            "parameters": {
                "type": "object",
                "properties": {
                    "phone":       {"type": "string"},
                    "amount_inr":  {"type": "number", "description": "Amount in INR"},
                    "description": {"type": "string", "description": "Purpose of payment"},
                    "expiry_mins": {"type": "integer", "description": "Link validity in minutes (default 60)"},
                },
                "required": ["phone", "amount_inr", "description"],
            },
            "webhook": "/webhook/send-payment-link",
        },
    },
    {
        "type": "function",
        "function": {
            "name": "send_sms",
            "description": "Send a plain SMS to the caller — confirmation, address, or callback time.",
            "parameters": {
                "type": "object",
                "properties": {
                    "phone":   {"type": "string"},
                    "message": {"type": "string"},
                },
                "required": ["phone", "message"],
            },
            "webhook": "/webhook/send-sms",
        },
    },
]

# Map tool name → webhook path
_WEBHOOK_MAP: dict[str, str] = {
    t["function"]["name"]: t["function"]["webhook"]
    for t in DEFAULT_TOOLS
}


# ──────────────────────────────────────────────────────────────────────────────
# Webhook executor
# ──────────────────────────────────────────────────────────────────────────────

async def _call_webhook(tool_name: str, arguments: dict) -> dict[str, Any]:
    """POST to the corresponding n8n webhook and return the JSON response."""
    path = _WEBHOOK_MAP.get(tool_name, f"/webhook/{tool_name}")
    url  = f"{_N8N_BASE}{path}"

    if not _N8N_BASE:
        logger.info("tool_executor: N8N_BASE_URL not set — simulating %s", tool_name)
        return {"status": "simulated", "tool": tool_name, "args": arguments}

    headers = {"Content-Type": "application/json"}
    if _N8N_KEY:
        headers["Authorization"] = f"Bearer {_N8N_KEY}"

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_S) as client:
            resp = await client.post(url, json=arguments, headers=headers)
            resp.raise_for_status()
            try:
                return resp.json()
            except Exception:
                return {"status": "ok", "raw": resp.text[:500]}
    except httpx.HTTPStatusError as e:
        logger.warning("tool_executor: %s webhook HTTP %d", tool_name, e.response.status_code)
        return {"status": "error", "code": e.response.status_code}
    except Exception as e:
        logger.warning("tool_executor: %s webhook failed — %s", tool_name, e)
        return {"status": "error", "message": str(e)}


# ──────────────────────────────────────────────────────────────────────────────
# LLM turn with tool use (Groq OpenAI-compat function calling)
# ──────────────────────────────────────────────────────────────────────────────

def _groq_tool_schema(tools: list[dict]) -> list[dict]:
    """Strip webhook field — Groq only wants the standard function schema."""
    clean = []
    for t in tools:
        fn = {k: v for k, v in t["function"].items() if k != "webhook"}
        clean.append({"type": "function", "function": fn})
    return clean


async def execute_llm_turn_with_tools(
    system_prompt: str,
    user_message: str,
    tools: list[dict] | None = None,
    provider: str = "groq",
    model: str = "llama-3.3-70b-versatile",
    language: str = "en",
) -> dict[str, Any]:
    """
    Run one LLM turn with function-calling enabled.

    Returns:
      {
        "text":         str   — final spoken text (after tool results injected)
        "tool_calls":   list  — [{"name": ..., "args": ...}, ...]
        "tool_results": list  — raw webhook responses
        "provider":     str
        "latency_ms":   float
      }
    """
    import time
    t0 = time.time()

    active_tools = tools or DEFAULT_TOOLS
    groq_key = os.getenv("GROQ_API_KEY", "")

    if not groq_key:
        # No key — fall back to plain LLM call
        from voice_engine.api_providers import call_llm_api
        result = await call_llm_api(system_prompt, user_message,
                                    provider=provider, model=model)
        return {**result, "tool_calls": [], "tool_results": []}

    messages = [
        {"role": "system",  "content": system_prompt},
        {"role": "user",    "content": user_message},
    ]

    tool_calls_fired: list[dict] = []
    tool_results: list[dict] = []

    # ── Round 1: LLM decides whether to call a tool ──────────────────────────
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {groq_key}",
                     "Content-Type": "application/json"},
            json={
                "model":       model,
                "messages":    messages,
                "tools":       _groq_tool_schema(active_tools),
                "tool_choice": "auto",
                "max_tokens":  512,
                "temperature": 0.3,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    choice  = data["choices"][0]
    message = choice["message"]

    # No tool call → return text directly
    if choice["finish_reason"] != "tool_calls" or not message.get("tool_calls"):
        text = message.get("content") or ""
        return {
            "text": text, "tool_calls": [], "tool_results": [],
            "provider": "groq", "latency_ms": (time.time() - t0) * 1000,
        }

    # ── Round 2: Execute each tool call in parallel ───────────────────────────
    import asyncio

    async def _run_one(tc: dict) -> tuple[str, dict, dict]:
        fn    = tc["function"]
        name  = fn["name"]
        try:
            args = json.loads(fn.get("arguments", "{}"))
        except Exception:
            args = {}
        tool_calls_fired.append({"name": name, "args": args, "id": tc["id"]})
        result = await _call_webhook(name, args)
        tool_results.append(result)
        return tc["id"], name, result

    raw_tcs = message["tool_calls"]
    executed = await asyncio.gather(*[_run_one(tc) for tc in raw_tcs])

    # ── Round 3: Feed tool results back to LLM for final spoken response ──────
    messages.append(message)  # assistant turn with tool_calls
    for call_id, name, result in executed:
        messages.append({
            "role":         "tool",
            "tool_call_id": call_id,
            "name":         name,
            "content":      json.dumps(result, ensure_ascii=False),
        })

    # Language instruction for the final response
    lang_hint = {
        "ta": "Respond in Tamil (தமிழ்). Keep it under 40 words.",
        "hi": "Respond in Hindi. Keep it under 40 words.",
    }.get(language, "Keep response under 40 words.")

    messages.append({"role": "user", "content": lang_hint})

    async with httpx.AsyncClient(timeout=30) as client:
        resp2 = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {groq_key}",
                     "Content-Type": "application/json"},
            json={
                "model":       model,
                "messages":    messages,
                "max_tokens":  256,
                "temperature": 0.4,
            },
        )
        resp2.raise_for_status()
        data2 = resp2.json()

    final_text = data2["choices"][0]["message"].get("content", "")
    logger.info("tool_executor: fired %s → %s",
                [t["name"] for t in tool_calls_fired], final_text[:60])

    return {
        "text":         final_text,
        "tool_calls":   tool_calls_fired,
        "tool_results": tool_results,
        "provider":     "groq",
        "latency_ms":   (time.time() - t0) * 1000,
    }
