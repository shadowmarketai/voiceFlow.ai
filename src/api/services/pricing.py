"""
Pricing catalog + cost calculator for VoiceFlow AI.

All provider costs are per-minute INR (already averaged for typical call load:
~500 tokens in + 150 tokens out per turn × 3 turns/min for LLMs,
~600 chars/min for TTS).

To update a cost, change it here — all UI + call settlement uses this table.
"""

from __future__ import annotations

from typing import Any

COST_CATALOG: dict[str, dict[str, dict[str, Any]]] = {
    "stt": {
        "deepgram_nova2":  {"label": "Deepgram Nova-2",    "cost": 0.36, "badge": "Fastest"},
        "sarvam":          {"label": "Sarvam AI (Indic)",  "cost": 0.50, "badge": "Indian"},
        "openai_whisper":  {"label": "OpenAI Whisper",     "cost": 0.51, "badge": "Accurate"},
        "groq_whisper":    {"label": "Groq Whisper",       "cost": 0.12, "badge": "Ultra-fast"},
        "google_stt":      {"label": "Google STT",         "cost": 0.72, "badge": "Reliable"},
        "assembly_ai":     {"label": "Assembly AI",        "cost": 0.59, "badge": "Smart"},
    },
    "llm": {
        "groq_llama3_8b":  {"label": "Groq Llama-3 8B",    "cost": 0.04,  "badge": "Budget"},
        "gemini_flash":    {"label": "Gemini Flash",        "cost": 0.08,  "badge": "Budget"},
        "groq_llama3_70b": {"label": "Groq Llama-3 70B",   "cost": 0.25,  "badge": "Standard"},
        "gpt4o_mini":      {"label": "GPT-4o Mini",         "cost": 0.42,  "badge": "Standard"},
        "claude_haiku":    {"label": "Claude Haiku 4.5",    "cost": 0.50,  "badge": "Standard"},
        "deepseek":        {"label": "DeepSeek",            "cost": 0.35,  "badge": "Standard"},
        "gemini_25_hd":    {"label": "Gemini 2.5 HD",       "cost": 1.27,  "badge": "Premium"},
        "claude_sonnet":   {"label": "Claude Sonnet 4.6",   "cost": 3.80,  "badge": "Premium"},
        "gpt4o":           {"label": "GPT-4o",              "cost": 6.33,  "badge": "Premium"},
        "claude_opus":     {"label": "Claude Opus 4.6",     "cost": 19.00, "badge": "Ultra"},
    },
    "tts": {
        "cartesia":            {"label": "Cartesia Sonic",       "cost": 0.02, "badge": "Fastest"},
        "deepgram_aura":       {"label": "Deepgram Aura",        "cost": 0.07, "badge": "Fast"},
        "google_tts":          {"label": "Google TTS",           "cost": 0.07, "badge": "Reliable"},
        "azure_neural":        {"label": "Azure Neural",         "cost": 0.08, "badge": "Reliable"},
        "edge_tts":            {"label": "Edge TTS",             "cost": 0.00, "badge": "Free"},
        "elevenlabs_flash":    {"label": "ElevenLabs Flash",     "cost": 0.09, "badge": "Quality"},
        "elevenlabs_standard": {"label": "ElevenLabs Standard",  "cost": 0.15, "badge": "Highest"},
        "openai_tts":          {"label": "OpenAI TTS HD",        "cost": 0.19, "badge": "Quality"},
        "sarvam":              {"label": "Sarvam AI (Indic)",    "cost": 0.50, "badge": "Indian"},
    },
    "telephony": {
        "airtel":  {"label": "Airtel API",      "cost": 0.80, "badge": "Cheapest"},
        "telnyx":  {"label": "Telnyx",          "cost": 0.90, "badge": "Low"},
        "telecmi": {"label": "TeleCMI (India)", "cost": 1.00, "badge": "India"},
        "plivo":   {"label": "Plivo",           "cost": 1.10, "badge": "Standard"},
        "exotel":  {"label": "Exotel",          "cost": 1.20, "badge": "Standard"},
        "twilio":  {"label": "Twilio",          "cost": 1.50, "badge": "Premium"},
        "vonage":  {"label": "Vonage",          "cost": 1.80, "badge": "Premium"},
        "webrtc":  {"label": "WebRTC (free)",   "cost": 0.00, "badge": "Free"},
    },
}


PRESETS = [
    {"id": "low_latency",  "name": "Low Latency",  "icon": "zap",
     "stt": "deepgram_nova2", "llm": "groq_llama3_8b", "tts": "cartesia",        "telephony": "exotel"},
    {"id": "high_quality", "name": "High Quality", "icon": "sparkles",
     "stt": "deepgram_nova2", "llm": "claude_haiku",   "tts": "elevenlabs_flash", "telephony": "twilio"},
    {"id": "budget",       "name": "Budget",       "icon": "wallet",
     "stt": "groq_whisper",   "llm": "gemini_flash",   "tts": "edge_tts",         "telephony": "airtel"},
    {"id": "tamil_native", "name": "Indic Native", "icon": "globe",
     "stt": "sarvam",         "llm": "claude_haiku",   "tts": "sarvam",           "telephony": "exotel"},
    {"id": "premium",      "name": "Premium",      "icon": "crown",
     "stt": "deepgram_nova2", "llm": "claude_opus",    "tts": "elevenlabs_standard", "telephony": "twilio"},
]


# Recharge packs — (amount_inr, bonus_inr, label)
RECHARGE_PACKS = [
    {"amount": 500,   "bonus": 0,    "label": "Starter"},
    {"amount": 1000,  "bonus": 0,    "label": "Basic"},
    {"amount": 2500,  "bonus": 100,  "label": "Standard", "popular": True},
    {"amount": 5000,  "bonus": 300,  "label": "Business"},
    {"amount": 10000, "bonus": 800,  "label": "Pro"},
    {"amount": 25000, "bonus": 2500, "label": "Enterprise"},
]

GST_RATE = 0.18


def _lookup(category: str, key: str) -> float:
    """Return per-minute cost for a provider; 0 for unknown."""
    return float(COST_CATALOG.get(category, {}).get(key, {}).get("cost", 0.0))


def calculate_cost(
    stt: str,
    llm: str,
    tts: str,
    telephony: str,
    platform_fee_paise: int = 100,
    ai_markup_pct: int = 20,
    telephony_markup_pct: int = 10,
    min_floor_paise: int = 250,
    tenant_fee_paise: int = 0,
    tenant_ai_markup_pct: int = 0,
    duration_min: float = 1.0,
    view: str = "user",          # "super" | "tenant" | "user"
) -> dict[str, Any]:
    """
    Three-tier white-label cost calculator.

        raw providers
         + platform markup + platform fee   = tenant_cost  (what we charge the tenant)
         + tenant markup + tenant fee       = user_price   (what the tenant's end user pays)

    `view` controls how much detail is returned:
        super  → everything including our raw cost + both margins
        tenant → tenant sees "your cost to us" + their markup + end-user price
        user   → only the final end-user total, no fee breakdown
    """
    stt_cost = _lookup("stt", stt)
    llm_cost = _lookup("llm", llm)
    tts_cost = _lookup("tts", tts)
    tel_cost = _lookup("telephony", telephony)

    ai_raw = stt_cost + llm_cost + tts_cost
    platform_fee = platform_fee_paise / 100.0
    tenant_fee = tenant_fee_paise / 100.0

    # Tier 1: platform → tenant
    ai_after_platform = round(ai_raw * (1 + ai_markup_pct / 100.0), 4)
    tel_after_platform = round(tel_cost * (1 + telephony_markup_pct / 100.0), 4)
    tenant_cost = round(
        max(platform_fee + ai_after_platform + tel_after_platform, min_floor_paise / 100.0), 2
    )

    # Tier 2: tenant → user
    ai_after_tenant = round(ai_after_platform * (1 + tenant_ai_markup_pct / 100.0), 4)
    user_price = round(tenant_fee + ai_after_tenant + tel_after_platform + platform_fee, 2)
    # If tenant added no markup, price == tenant_cost
    user_price = max(user_price, tenant_cost)

    # Margins
    our_raw = round(ai_raw + tel_cost, 2)
    our_margin = round(tenant_cost - our_raw, 2)
    our_margin_pct = round((our_margin / tenant_cost) * 100, 1) if tenant_cost else 0.0
    tenant_margin = round(user_price - tenant_cost, 2)
    tenant_margin_pct = round((tenant_margin / user_price) * 100, 1) if user_price else 0.0

    common_breakdown = {
        "stt": {"label": COST_CATALOG["stt"].get(stt, {}).get("label", stt), "raw": stt_cost},
        "llm": {"label": COST_CATALOG["llm"].get(llm, {}).get("label", llm), "raw": llm_cost},
        "tts": {"label": COST_CATALOG["tts"].get(tts, {}).get("label", tts), "raw": tts_cost},
        "telephony": {"label": COST_CATALOG["telephony"].get(telephony, {}).get("label", telephony), "raw": tel_cost},
    }

    out: dict[str, Any] = {
        "per_minute": user_price,
        "total": round(user_price * duration_min, 2),
        "duration_min": duration_min,
        "config": {"stt": stt, "llm": llm, "tts": tts, "telephony": telephony},
    }

    if view == "super":
        out["breakdown"] = {
            **common_breakdown,
            "ai_raw_total": round(ai_raw, 2),
            "ai_after_platform": ai_after_platform,
            "ai_after_tenant": ai_after_tenant,
            "telephony_billed": tel_after_platform,
            "platform_fee": platform_fee,
            "tenant_fee": tenant_fee,
        }
        out.update({
            "tenant_cost": tenant_cost,
            "user_price": user_price,
            "our_raw_cost": our_raw,
            "our_margin": our_margin,
            "our_margin_pct": our_margin_pct,
            "tenant_margin": tenant_margin,
            "tenant_margin_pct": tenant_margin_pct,
        })
    elif view == "tenant":
        # Tenant sees what we charge them + the margin they're adding.
        # They do NOT see our raw cost.
        out["breakdown"] = {
            **common_breakdown,
            "tenant_cost_per_min": tenant_cost,
            "ai_after_tenant": ai_after_tenant,
            "tenant_fee": tenant_fee,
        }
        out.update({
            "tenant_cost": tenant_cost,
            "user_price": user_price,
            "tenant_margin": tenant_margin,
            "tenant_margin_pct": tenant_margin_pct,
        })
    else:   # user view — hide everything sensitive
        out["breakdown"] = {
            **common_breakdown,
            "ai_total_billed": ai_after_tenant,
            "telephony_billed": tel_after_platform,
            # No fee line items — just the total
        }

    return out


def recharge_summary(amount_inr: float) -> dict[str, Any]:
    """Compute GST + bonus for a recharge amount."""
    bonus = 0
    for pack in sorted(RECHARGE_PACKS, key=lambda p: -p["amount"]):
        if amount_inr >= pack["amount"]:
            bonus = pack["bonus"]
            break
    gst = round(amount_inr * GST_RATE / (1 + GST_RATE), 2)   # inclusive GST
    net = round(amount_inr - gst, 2)
    credits = round(net + bonus, 2)
    return {
        "you_pay": amount_inr,
        "gst": gst,
        "net_after_gst": net,
        "bonus": bonus,
        "credits": credits,
        "minutes_at_rs350": int(credits / 3.50),
    }
