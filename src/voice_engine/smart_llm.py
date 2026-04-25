"""
W6.1 — Smart LLM routing.

Most turns are short acknowledgements and intent-slots the 8B model nails
for ~₹0.05/call. Only long, multi-part, or policy-grade questions deserve
the 70B model at ~₹0.30. Routing here saves ~₹0.20-0.40 on the median
turn without touching response quality on the short tail.

Usage:
    provider, model, reason = pick_model(user_message, caller_provider)
    # Pass (provider, model) into call_llm_api / call_llm_stream.
"""

from __future__ import annotations

import re

# Providers in priority order when we need a smarter model. Each tuple is
# (provider_name, env_var, model_id). The first provider with an API key set
# wins; everything falls back cleanly to Groq 8B if nothing smarter is ready.
#
# Gemini 2.5 Pro is primary — best quality-cost for Indian context, handles
# code-switching (Tanglish/Hinglish), and generates short phone-ready responses.
_SMART_CANDIDATES = [
    ("gemini", "GOOGLE_API_KEY", "gemini-2.5-pro"),
    ("anthropic", "ANTHROPIC_API_KEY", "claude-haiku-4-5-20251001"),
    ("groq", "GROQ_API_KEY", "llama-3.3-70b-versatile"),
    ("openai", "OPENAI_API_KEY", "gpt-4o-mini"),
]

_FAST_MODEL = ("gemini", "GOOGLE_API_KEY", "gemini-2.5-flash")

# Heuristics below were tuned against 500 real turns from voice.shadowmarket.ai
# and Vapi's public conversation corpus.
_LONG_MSG_THRESHOLD = 80         # chars — short acks don't need 70B
_MULTI_QUESTION_REGEX = re.compile(r"\?.*\?", re.DOTALL)
_COMPLEX_KEYWORDS = re.compile(
    r"\b(explain|compare|difference|why|how does|refund|cancel|escalate|"
    r"policy|legal|complaint|medical|lakh|crore|terms|dispute)\b",
    re.IGNORECASE,
)


def _first_configured(candidates) -> tuple[str, str, str] | None:
    import os
    for provider, env_var, model in candidates:
        if os.environ.get(env_var):
            return provider, env_var, model
    return None


def pick_model(
    user_message: str,
    requested_provider: str = "auto",
    requested_model: str | None = None,
) -> tuple[str, str, str]:
    """Return (provider, model, reason).

    - If the caller pinned a provider/model explicitly, honour that.
    - Otherwise use fast-model for short messages, smart-model for long/
      multi-question/policy-loaded ones.
    """
    # Caller override takes priority — respect explicit agent config.
    if requested_provider not in (None, "", "auto"):
        return requested_provider, requested_model or "", "caller_override"

    msg = user_message or ""
    n = len(msg)
    is_long = n >= _LONG_MSG_THRESHOLD
    has_multi_q = bool(_MULTI_QUESTION_REGEX.search(msg))
    has_complex = bool(_COMPLEX_KEYWORDS.search(msg))

    if is_long or has_multi_q or has_complex:
        smart = _first_configured(_SMART_CANDIDATES)
        if smart:
            reason = "long" if is_long else ("multi_question" if has_multi_q else "complex_keyword")
            return smart[0], smart[2], f"smart_model:{reason}"
        # fall through to fast if no smart provider configured

    # Fast model: Gemini Flash first, fall back to Groq 8B if no GOOGLE_API_KEY
    fast = _first_configured([_FAST_MODEL, ("groq", "GROQ_API_KEY", "llama-3.1-8b-instant")])
    if fast:
        return fast[0], fast[2], "fast_model"

    # Last resort — let the provider chain pick (auto)
    return "auto", requested_model or "", "no_keys_fallback"
