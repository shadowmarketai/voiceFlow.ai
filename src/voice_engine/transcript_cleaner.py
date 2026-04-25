"""
Transcript quality filter — clean and validate STT output before sending to LLM.

Pipeline
--------
1. Strip leading/trailing whitespace and collapse internal whitespace
2. Remove isolated noise tokens (um, uh, hmm, ...)
3. Normalize repeated punctuation
4. Validate minimum word count (default: 3 words)
5. Reject pure filler / backchannel responses

Usage
-----
    from voice_engine.transcript_cleaner import clean_transcript, is_valid_transcript

    cleaned = clean_transcript(raw_text)
    if not is_valid_transcript(cleaned):
        return  # skip LLM
"""
from __future__ import annotations

import re

# ── Noise tokens ────────────────────────────────────────────────────────────
# Single tokens that carry zero semantic value. Extend as needed.
_NOISE_TOKENS_EN = {
    "um", "uh", "hmm", "hm", "ah", "oh", "er", "erm",
    "mhm", "mm", "mmm", "ugh", "eh", "eh?",
}

# Indic fillers (transliterated) — Deepgram sometimes surfaces these
_NOISE_TOKENS_INDIC = {
    "haan", "acha", "achha", "theek", "theek hai",
    "hmm", "hm", "ha", "woh", "yeh",
}

_ALL_NOISE = _NOISE_TOKENS_EN | _NOISE_TOKENS_INDIC

# ── Repeated‑word regex ─────────────────────────────────────────────────────
_RE_REPEAT = re.compile(r"\b(\w+)( \1){2,}\b", re.IGNORECASE)

# ── Multi‑whitespace / multi‑punctuation ────────────────────────────────────
_RE_MULTI_SPACE = re.compile(r"\s+")
_RE_MULTI_PUNCT = re.compile(r"([.!?,;])\1+")


def clean_transcript(text: str) -> str:
    """Return a cleaned version of the STT transcript.

    Does NOT raise; always returns a string (possibly empty).
    """
    if not text:
        return ""

    # 1. Collapse whitespace
    text = _RE_MULTI_SPACE.sub(" ", text).strip()

    # 2. Normalize repeated punctuation
    text = _RE_MULTI_PUNCT.sub(r"\1", text)

    # 3. Remove trailing noise fragments at end of sentence
    #    e.g. "Hello, how are you, um" → "Hello, how are you"
    words = text.split()
    while words and words[-1].lower().rstrip(".,?!") in _ALL_NOISE:
        words.pop()

    # 4. Remove leading noise fragments
    while words and words[0].lower().rstrip(".,?!") in _ALL_NOISE:
        words.pop(0)

    # 5. Collapse triple+ repeats of the same word
    rejoined = " ".join(words)
    rejoined = _RE_REPEAT.sub(lambda m: m.group(1), rejoined)

    return rejoined.strip()


def is_valid_transcript(
    text: str,
    min_words: int = 3,
    min_chars: int = 8,
) -> bool:
    """Return True if the transcript is substantial enough to send to the LLM.

    Rejects:
    - Empty strings
    - Single noise tokens
    - Strings shorter than min_chars
    - Strings with fewer than min_words meaningful words
    """
    if not text:
        return False

    stripped = text.strip()
    if len(stripped) < min_chars:
        return False

    words = [w.lower().rstrip(".,?!") for w in stripped.split()]
    meaningful = [w for w in words if w not in _ALL_NOISE and len(w) > 1]

    return len(meaningful) >= min_words


def normalize_for_llm(text: str, max_words: int = 200) -> str:
    """Final normalization before sending to LLM.

    - Sentence-case if all-caps
    - Trim to max_words
    - Ensure ends with punctuation
    """
    if not text:
        return text

    words = text.split()

    # Trim if too long
    if len(words) > max_words:
        words = words[:max_words]
        text = " ".join(words) + "…"
    else:
        text = " ".join(words)

    # Sentence-case if everything is upper
    if text == text.upper() and any(c.isalpha() for c in text):
        text = text.capitalize()

    # Ensure punctuation
    if text and text[-1] not in ".!?…":
        text += "."

    return text
