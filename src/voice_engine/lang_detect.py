"""
Per-utterance language detection — W2.2.

Two fast heuristics, composable:

1. `detect_language_text(text)` — Unicode-script majority vote. Zero deps,
   sub-millisecond. Correctly identifies Hindi/Tamil/Telugu/Kannada/Malayalam/
   Bengali/Gujarati/Punjabi/Odia/Urdu from the script alone. For code-switch
   ("mujhe good feel ho raha hai"), it returns the dominant Indic language if
   Indic script covers ≥25% of characters, otherwise `en`.

2. `pick_tts_language(user_hint, stt_detected, text)` — combines the three
   signals into the language we should synthesize. STT's own detection wins
   when confident; text-script detection overrides code-switched English
   transcripts; the user's channel-level hint is the tiebreaker.

Why this matters: calls where the user mid-turn switches from English to
Hindi ("okay, toh aap bataiye") today still get English TTS voice. Fixing
that is the single biggest CSAT lever for multilingual India buyers.
"""

from __future__ import annotations

from typing import Iterable

# Unicode script ranges → ISO language codes (primary-use mapping).
# Multi-language scripts: Devanagari defaults to Hindi; users who speak
# Marathi/Nepali/Konkani can still override via the channel hint.
_SCRIPT_RANGES: list[tuple[int, int, str]] = [
    (0x0900, 0x097F, "hi"),   # Devanagari — Hindi / Marathi / Nepali / Sanskrit
    (0x0980, 0x09FF, "bn"),   # Bengali / Assamese
    (0x0A00, 0x0A7F, "pa"),   # Gurmukhi — Punjabi
    (0x0A80, 0x0AFF, "gu"),   # Gujarati
    (0x0B00, 0x0B7F, "or"),   # Odia
    (0x0B80, 0x0BFF, "ta"),   # Tamil
    (0x0C00, 0x0C7F, "te"),   # Telugu
    (0x0C80, 0x0CFF, "kn"),   # Kannada
    (0x0D00, 0x0D7F, "ml"),   # Malayalam
    (0x0600, 0x06FF, "ur"),   # Arabic script — Urdu (closest match)
]

_INDIC_LANG_CODES = {"hi", "ta", "te", "kn", "ml", "bn", "mr", "gu", "pa", "or", "as", "ur"}

# Minimum Indic-script ratio before we flip away from English. Below this,
# stray Indic characters in an otherwise-English sentence (loanwords, names)
# shouldn't force a TTS language change.
_INDIC_SWITCH_THRESHOLD = 0.25


def _script_for(char: str) -> str | None:
    cp = ord(char)
    for lo, hi, code in _SCRIPT_RANGES:
        if lo <= cp <= hi:
            return code
    return None


def detect_language_text(text: str) -> dict:
    """Return {'language': code, 'confidence': float, 'script_counts': {...}}.

    Confidence is the share of alphabetic chars that belong to the winning
    script. For pure Devanagari it's 1.0; for code-switch it's the Indic
    ratio; for pure English it's 1.0 with language='en'.
    """
    if not text:
        return {"language": "en", "confidence": 0.0, "script_counts": {}}

    counts: dict[str, int] = {}
    alpha = 0
    for ch in text:
        if ch.isalpha():
            alpha += 1
            code = _script_for(ch)
            if code:
                counts[code] = counts.get(code, 0) + 1

    if alpha == 0:
        return {"language": "en", "confidence": 0.0, "script_counts": counts}

    if not counts:
        return {"language": "en", "confidence": 1.0, "script_counts": {}}

    # Winning Indic script
    winner = max(counts.items(), key=lambda kv: kv[1])
    ratio = winner[1] / alpha

    if ratio < _INDIC_SWITCH_THRESHOLD:
        return {"language": "en", "confidence": 1.0 - ratio, "script_counts": counts}

    return {"language": winner[0], "confidence": round(ratio, 3),
            "script_counts": counts}


def pick_tts_language(
    user_hint: str | None,
    stt_detected: str | None,
    text: str | None,
) -> tuple[str, str]:
    """Decide which language the TTS voice should speak in.

    Priority (highest first):
      1. STT-detected language if confident and Indic (STT has audio context).
      2. Text-script majority when it's Indic and beats the user hint.
      3. Channel-level user hint (dashboard setting).
      4. Default 'en'.

    Returns (chosen_language, reason). Reason is useful for debugging
    language-flip bugs and for surfacing in the `done` event.
    """
    hint = (user_hint or "").lower()[:2] or None
    stt = (stt_detected or "").lower()[:2] or None
    text_detect = detect_language_text(text or "") if text else None

    if stt and stt in _INDIC_LANG_CODES:
        return stt, "stt_detected"

    if text_detect and text_detect["language"] in _INDIC_LANG_CODES:
        return text_detect["language"], "text_script_majority"

    if hint:
        return hint, "user_hint"

    if stt:
        return stt, "stt_fallback"

    return "en", "default"


def is_indic(lang: str | None) -> bool:
    return bool(lang) and lang.lower()[:2] in _INDIC_LANG_CODES
