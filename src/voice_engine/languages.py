"""
Language catalog — W5 Indic moat.

Central authoritative record of every language we route for. Each entry
captures:
  - script        : primary Unicode block (used by lang_detect)
  - native_name   : rendered name for UIs
  - sarvam        : bool, Sarvam STT+TTS support
  - deepgram_stt  : bool, Deepgram Nova-2 language support
  - elevenlabs    : bool, ElevenLabs multilingual-v2 support
  - edge_tts      : Edge-TTS voice name ('' if not supported)
  - routing       : {"stt": [...preferred providers], "tts": [...]}
  - dialect_hints : stable set of dialect codes the LLM prompt accepts

18 languages, covering >95% of Indian-language calls. Manipuri, Konkani,
and Nepali don't have premium-provider coverage yet; they route to
Edge-TTS (free, acceptable quality) + Deepgram-fallback for STT.
"""

from __future__ import annotations

from typing import Any

LANGUAGES: dict[str, dict[str, Any]] = {
    "en": {
        "script": "Latin", "native_name": "English",
        "sarvam": True, "deepgram_stt": True, "elevenlabs": True,
        "edge_tts": "en-IN-NeerjaNeural",
        "routing": {"stt": ["deepgram", "sarvam", "openai"],
                    "tts": ["elevenlabs", "sarvam", "openai", "edge"]},
        "dialect_hints": ["indian_english", "british", "american"],
    },
    "hi": {
        "script": "Devanagari", "native_name": "हिन्दी (Hindi)",
        "sarvam": True, "deepgram_stt": True, "elevenlabs": True,
        "edge_tts": "hi-IN-SwaraNeural",
        "routing": {"stt": ["deepgram", "sarvam"],
                    "tts": ["sarvam", "elevenlabs", "edge"]},
        "dialect_hints": ["standard", "haryanvi", "bhojpuri", "awadhi", "bihari", "rajasthani"],
    },
    "ta": {
        "script": "Tamil", "native_name": "தமிழ் (Tamil)",
        "sarvam": True, "deepgram_stt": False, "elevenlabs": True,
        "edge_tts": "ta-IN-PallaviNeural",
        "routing": {"stt": ["sarvam", "openai"],
                    "tts": ["sarvam", "elevenlabs", "edge"]},
        "dialect_hints": ["standard", "chennai", "madurai", "kongu", "nellai", "sri_lankan"],
    },
    "te": {
        "script": "Telugu", "native_name": "తెలుగు (Telugu)",
        "sarvam": True, "deepgram_stt": False, "elevenlabs": True,
        "edge_tts": "te-IN-ShrutiNeural",
        "routing": {"stt": ["sarvam", "openai"],
                    "tts": ["sarvam", "elevenlabs", "edge"]},
        "dialect_hints": ["standard", "telangana", "rayalaseema", "coastal_andhra"],
    },
    "kn": {
        "script": "Kannada", "native_name": "ಕನ್ನಡ (Kannada)",
        "sarvam": True, "deepgram_stt": False, "elevenlabs": True,
        "edge_tts": "kn-IN-SapnaNeural",
        "routing": {"stt": ["sarvam", "openai"],
                    "tts": ["sarvam", "elevenlabs", "edge"]},
        "dialect_hints": ["standard", "dharwad", "mangalore"],
    },
    "ml": {
        "script": "Malayalam", "native_name": "മലയാളം (Malayalam)",
        "sarvam": True, "deepgram_stt": False, "elevenlabs": True,
        "edge_tts": "ml-IN-SobhanaNeural",
        "routing": {"stt": ["sarvam", "openai"],
                    "tts": ["sarvam", "elevenlabs", "edge"]},
        "dialect_hints": ["standard", "thiruvananthapuram", "thrissur", "malabar"],
    },
    "bn": {
        "script": "Bengali", "native_name": "বাংলা (Bengali)",
        "sarvam": True, "deepgram_stt": False, "elevenlabs": True,
        "edge_tts": "bn-IN-TanishaaNeural",
        "routing": {"stt": ["sarvam", "openai"],
                    "tts": ["sarvam", "elevenlabs", "edge"]},
        "dialect_hints": ["standard", "bangladeshi", "rarhi"],
    },
    "mr": {
        "script": "Devanagari", "native_name": "मराठी (Marathi)",
        "sarvam": True, "deepgram_stt": False, "elevenlabs": True,
        "edge_tts": "mr-IN-AarohiNeural",
        "routing": {"stt": ["sarvam", "openai"],
                    "tts": ["sarvam", "elevenlabs", "edge"]},
        "dialect_hints": ["standard", "puneri", "varhadi", "kolhapuri"],
    },
    "gu": {
        "script": "Gujarati", "native_name": "ગુજરાતી (Gujarati)",
        "sarvam": True, "deepgram_stt": False, "elevenlabs": True,
        "edge_tts": "gu-IN-DhwaniNeural",
        "routing": {"stt": ["sarvam", "openai"],
                    "tts": ["sarvam", "elevenlabs", "edge"]},
        "dialect_hints": ["standard", "kathiyawadi", "surti"],
    },
    "pa": {
        "script": "Gurmukhi", "native_name": "ਪੰਜਾਬੀ (Punjabi)",
        "sarvam": True, "deepgram_stt": False, "elevenlabs": True,
        "edge_tts": "",  # Edge-TTS has no Punjabi-India voice as of 2026
        "routing": {"stt": ["sarvam", "openai"],
                    "tts": ["sarvam", "elevenlabs"]},
        "dialect_hints": ["standard", "majhi", "malwai", "doabi"],
    },
    "or": {
        "script": "Odia", "native_name": "ଓଡ଼ିଆ (Odia)",
        "sarvam": True, "deepgram_stt": False, "elevenlabs": True,
        "edge_tts": "",
        "routing": {"stt": ["sarvam", "openai"],
                    "tts": ["sarvam", "elevenlabs"]},
        "dialect_hints": ["standard", "koshli", "baleswari"],
    },
    "as": {
        "script": "Bengali", "native_name": "অসমীয়া (Assamese)",
        "sarvam": False, "deepgram_stt": False, "elevenlabs": True,
        "edge_tts": "",
        "routing": {"stt": ["openai", "sarvam"],  # Sarvam last-resort; OpenAI multilingual Whisper covers it
                    "tts": ["elevenlabs"]},
        "dialect_hints": ["standard", "kamrupi", "goalpariya"],
    },
    "ur": {
        "script": "Arabic", "native_name": "اردو (Urdu)",
        "sarvam": False, "deepgram_stt": True, "elevenlabs": True,
        "edge_tts": "ur-IN-GulNeural",
        "routing": {"stt": ["deepgram", "openai"],
                    "tts": ["elevenlabs", "edge"]},
        "dialect_hints": ["standard_india", "lucknowi", "pakistani"],
    },
    "ne": {
        "script": "Devanagari", "native_name": "नेपाली (Nepali)",
        "sarvam": False, "deepgram_stt": False, "elevenlabs": True,
        "edge_tts": "ne-NP-SagarNeural",
        "routing": {"stt": ["openai"],
                    "tts": ["elevenlabs", "edge"]},
        "dialect_hints": ["standard", "eastern", "western"],
    },
    "kok": {
        "script": "Devanagari", "native_name": "कोंकणी (Konkani)",
        "sarvam": False, "deepgram_stt": False, "elevenlabs": True,
        "edge_tts": "",
        "routing": {"stt": ["openai"],
                    "tts": ["elevenlabs"]},
        "dialect_hints": ["standard_goan", "bardeskari", "antruzi"],
    },
    "mni": {
        "script": "Bengali", "native_name": "ꯃꯤꯇꯩ / মণিপুরী (Manipuri)",
        "sarvam": False, "deepgram_stt": False, "elevenlabs": False,
        "edge_tts": "",
        "routing": {"stt": ["openai"],
                    "tts": ["edge", "elevenlabs"]},  # best-effort
        "dialect_hints": ["standard"],
    },
    "sd": {
        "script": "Arabic", "native_name": "سنڌي (Sindhi)",
        "sarvam": False, "deepgram_stt": False, "elevenlabs": True,
        "edge_tts": "",
        "routing": {"stt": ["openai"],
                    "tts": ["elevenlabs"]},
        "dialect_hints": ["standard"],
    },
    "sa": {
        "script": "Devanagari", "native_name": "संस्कृतम् (Sanskrit)",
        "sarvam": False, "deepgram_stt": False, "elevenlabs": False,
        "edge_tts": "",
        "routing": {"stt": ["openai"],
                    "tts": ["edge"]},  # very limited; ceremonial use
        "dialect_hints": ["standard"],
    },
}

INDIC_CODES = {c for c in LANGUAGES if c != "en"}


def get(code: str | None) -> dict[str, Any]:
    """Fetch language entry, falling back to English for unknown codes."""
    key = (code or "").lower().split("-")[0]
    return LANGUAGES.get(key) or LANGUAGES["en"]


def preferred_stt(code: str | None) -> list[str]:
    return get(code)["routing"]["stt"]


def preferred_tts(code: str | None) -> list[str]:
    return get(code)["routing"]["tts"]


def supported_dialects(code: str | None) -> list[str]:
    return get(code).get("dialect_hints", ["standard"])


def coverage_matrix() -> list[dict[str, Any]]:
    """Flat list for the /api/v1/languages endpoint + UI tables."""
    return [
        {
            "code": code,
            "native_name": info["native_name"],
            "script": info["script"],
            "sarvam": info["sarvam"],
            "deepgram_stt": info["deepgram_stt"],
            "elevenlabs": info["elevenlabs"],
            "edge_tts": bool(info["edge_tts"]),
            "preferred_stt": info["routing"]["stt"],
            "preferred_tts": info["routing"]["tts"],
            "dialects": info["dialect_hints"],
        }
        for code, info in LANGUAGES.items()
    ]
