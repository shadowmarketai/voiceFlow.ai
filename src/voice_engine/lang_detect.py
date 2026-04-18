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

import re

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

_INDIC_LANG_CODES = {"hi", "ta", "te", "kn", "ml", "bn", "mr", "gu", "pa", "or",
                     "as", "ur", "ne", "kok", "mni", "sd", "sa"}

# Devanagari is shared by Hindi / Marathi / Nepali / Konkani / Sanskrit.
# When the user's channel hint is one of these, honour it — script alone
# can't disambiguate without a much heavier language-ID model.
_DEVANAGARI_FAMILY = {"hi", "mr", "ne", "kok", "sa"}
# Bengali script is shared by Bengali / Assamese / Manipuri (Meitei).
_BENGALI_SCRIPT_FAMILY = {"bn", "as", "mni"}

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


# ── Romanized Indic detection (Fix 1 from review) ───────────────────
# When users type Tamil/Hindi/Telugu in English letters ("Naan ippo busy"),
# Unicode script detection returns "en". This catches those cases via
# high-frequency romanized tokens + distinctive suffixes per language.

_ROMANIZED_MARKERS: dict[str, tuple[set[str], list[str]]] = {
    "ta": (
        # Tamil high-frequency words (romanized)
        {"naan", "nee", "enna", "eppo", "ippo", "inga", "anga", "illa",
         "irukku", "irukken", "irukka", "pannunga", "sollunga", "vaanga",
         "ponga", "thaan", "panna", "solla", "eppadi", "konjam", "romba",
         "paaru", "vanakkam", "nandri", "theriyum", "theriyathu", "venum",
         "vendaam", "pogalaam", "varalaam", "seri", "aama", "puriyuthu",
         "puriyala", "pannuven", "solren", "paarunga", "ketka", "kekka",
         "kudukka", "edukka", "podra", "podravaa", "podu", "panra"},
        # Tamil-distinctive suffixes
        [r"\w+nga\b", r"\w+ngo\b", r"\w+kku\b", r"\w+kkum\b", r"\w+la\b",
         r"\w+le\b", r"\w+nu\b", r"\w+dhu\b", r"\w+thu\b", r"\w+ven\b",
         r"\w+ren\b", r"\w+lam\b"],
    ),
    "hi": (
        # Hindi high-frequency words (romanized)
        {"mujhe", "kya", "kaise", "kahan", "kyun", "accha", "theek",
         "bahut", "abhi", "chaliye", "bolo", "batao", "karo", "haan",
         "nahi", "nahin", "aur", "lekin", "toh", "bhai", "yaar",
         "dekho", "suno", "chalo", "mera", "tera", "humara", "tumhara",
         "samajh", "samjho", "paise", "kitna", "kaun", "kiska",
         "matlab", "zaroor", "achha", "arey", "hoga", "hogi", "rehta",
         "rehti", "jaao", "aao", "bataiye", "dekhiye", "suniye",
         "chahiye", "milega", "milegi", "karenge", "jayenge"},
        # Hindi-distinctive suffixes
        [r"\w+iye\b", r"\w+ega\b", r"\w+egi\b", r"\w+enge\b",
         r"\w+ogi\b", r"\w+oge\b", r"\w+enge\b"],
    ),
    "te": (
        # Telugu
        {"nenu", "emi", "ela", "ikkada", "akkada", "cheppandi",
         "cheyyandi", "unnaru", "unnav", "ledu", "undi", "vundi",
         "randi", "vellu", "vastanu", "cheptanu", "emiti", "entha",
         "bagundi", "manchidi", "parledu", "avunu", "kaadu", "kavali",
         "raandi", "chudu", "chudandi", "namaskaram"},
        [r"\w+andi\b", r"\w+aru\b", r"\w+undi\b", r"\w+anu\b",
         r"\w+edi\b", r"\w+adu\b"],
    ),
    "kn": (
        # Kannada
        {"naanu", "enu", "hege", "illi", "alli", "helu", "maadu",
         "banni", "hogge", "illa", "ide", "idhey", "barri", "nodi",
         "kelsa", "madri", "namaskara", "hegidira", "chennagiide",
         "gotthu", "gotthilla", "beku", "beda", "hogi", "baa"},
        [r"\w+alli\b", r"\w+inda\b", r"\w+ige\b", r"\w+anu\b"],
    ),
    "ml": (
        # Malayalam
        {"njan", "entha", "enthanu", "ivide", "avide", "parayoo",
         "cheyyoo", "alle", "ille", "undu", "illa", "mathi",
         "sheriyaanu", "namaskkaram", "nanni", "ariyaam",
         "ariyilla", "venam", "venda", "varunnu", "pokunnu",
         "parayaam", "cheyyaam", "ninakku", "enikku", "avanu"},
        [r"\w+oo\b", r"\w+aanu\b", r"\w+ille\b", r"\w+aam\b",
         r"\w+unnu\b"],
    ),
}

_ROMANIZED_MIN_HITS = 2
_ROMANIZED_WORD_RE = re.compile(r"[a-zA-Z]+")


def detect_romanized_indic(text: str) -> dict:
    """Detect romanized Indic languages from Latin-script text.

    Returns {'language': code, 'confidence': float, 'markers_hit': int}
    or {'language': 'en', ...} if no pattern matches.
    """
    if not text:
        return {"language": "en", "confidence": 0.0, "markers_hit": 0}

    words = [w.lower() for w in _ROMANIZED_WORD_RE.findall(text)]
    if len(words) < 2:
        return {"language": "en", "confidence": 0.0, "markers_hit": 0}

    word_set = set(words)
    best_lang = "en"
    best_hits = 0
    best_conf = 0.0
    text_lower = text.lower()

    for lang, (marker_words, suffix_patterns) in _ROMANIZED_MARKERS.items():
        hits = len(word_set & marker_words)
        for pat in suffix_patterns:
            hits += len(re.findall(pat, text_lower))
        if hits > best_hits:
            best_hits = hits
            best_lang = lang
            best_conf = min(1.0, hits / max(1, len(words) * 0.3))

    if best_hits >= _ROMANIZED_MIN_HITS:
        return {"language": best_lang, "confidence": round(best_conf, 3),
                "markers_hit": best_hits}

    return {"language": "en", "confidence": 0.0, "markers_hit": 0}


def pick_tts_language(
    user_hint: str | None,
    stt_detected: str | None,
    text: str | None,
) -> tuple[str, str]:
    """Decide which language the TTS voice should speak in.

    Priority (highest first):
      1. STT-detected language if confident and Indic (STT has audio context).
      2. Text-script majority when it's Indic and beats the user hint.
         Script-ambiguous families (Devanagari, Bengali) honour the channel
         hint to disambiguate Marathi/Nepali/Konkani vs Hindi, Assamese/
         Manipuri vs Bengali.
      3. Channel-level user hint (dashboard setting).
      4. Default 'en'.

    Returns (chosen_language, reason). Reason is useful for debugging
    language-flip bugs and for surfacing in the `done` event.
    """
    # Accept 2-letter (en, hi) and 3-letter (mni, kok) codes.
    def _norm(x):
        if not x:
            return None
        return str(x).lower().split("-")[0]

    hint = _norm(user_hint)
    stt = _norm(stt_detected)
    text_detect = detect_language_text(text or "") if text else None

    if stt and stt in _INDIC_LANG_CODES:
        return stt, "stt_detected"

    if text_detect and text_detect["language"] in _INDIC_LANG_CODES:
        detected = text_detect["language"]
        if detected == "hi" and hint in _DEVANAGARI_FAMILY:
            return hint, "script_family_hint"
        if detected == "bn" and hint in _BENGALI_SCRIPT_FAMILY:
            return hint, "script_family_hint"
        return detected, "text_script_majority"

    # Romanized Indic detection — catches "Naan ippo busy" style text
    # that has no Unicode Indic characters at all.
    if text:
        # Use the advanced 3-signal Tamil detector for Tamil (phonemes +
        # function words + morphology) — much higher accuracy than simple
        # token matching for Tanglish detection.
        try:
            from voice_engine.tamil_detector import RomanizedTamilDetector
            _ta_det = RomanizedTamilDetector(channel_hint=hint)
            _ta_result = _ta_det.detect(text)
            if _ta_result.is_tamil and _ta_result.confidence >= 0.50:
                return "ta", "tamil_detector_3signal"
        except Exception:
            pass

        # Generic romanized detection for other Indic languages
        roman = detect_romanized_indic(text)
        if roman["language"] in _INDIC_LANG_CODES and roman["markers_hit"] >= _ROMANIZED_MIN_HITS:
            return roman["language"], "romanized_indic"

    if hint:
        return hint, "user_hint"

    if stt:
        return stt, "stt_fallback"

    return "en", "default"


def is_indic(lang: str | None) -> bool:
    return bool(lang) and lang.lower()[:2] in _INDIC_LANG_CODES
