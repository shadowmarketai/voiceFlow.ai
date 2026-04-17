"""
Smart Turn Detection — Tamil-aware end-of-utterance + backchannel guard.
========================================================================

Problem with naive silence-based VAD:
  1. Tamil speech has natural micro-pauses mid-sentence — fixed 500ms silence
     timeout cuts the caller off mid-thought.
  2. Backchannel tokens ("சரி", "ஆமா", "mm-hmm") should NOT trigger a full
     agent turn — they're acknowledgements, not questions.
  3. Trailing-off speech ("um...", "ஒரு நிமிடம்...") needs longer silence.

Solution — two-stage detection:
  Stage 1: Backchannel guard  — if transcript is ONLY a backchannel token,
           return TurnSignal.BACKCHANNEL so the caller pipeline suppresses
           the LLM call and keeps listening.
  Stage 2: Completion classifier — score the transcript for how "complete"
           the utterance is: full sentence = high score (shorter silence ok),
           trailing off = low score (wait longer), question = mid score.

Sentiment handoff: if emotion scores contain anger/fear above threshold
AND the agent has transfer_number configured, raise TurnSignal.HANDOFF so
voice_ai_service.py can initiate a warm transfer before generating any LLM
response.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class TurnSignal(str, Enum):
    PROCEED   = "proceed"    # Normal: run STT → LLM → TTS
    BACKCHANNEL = "backchannel"  # Suppress LLM: caller just acknowledged
    WAIT      = "wait"       # Extend silence window: utterance incomplete
    HANDOFF   = "handoff"    # Transfer to human immediately


@dataclass
class TurnDecision:
    signal: TurnSignal
    reason: str
    recommended_silence_ms: int = 700   # how long to wait for next speech
    emotion_prefix: str = ""            # inject into LLM prompt if non-empty


# ──────────────────────────────────────────────────────────────────────────────
# Backchannel token lists (per language)
# ──────────────────────────────────────────────────────────────────────────────

_BACKCHANNELS: dict[str, set[str]] = {
    "ta": {
        "சரி", "ஆமா", "ஆம்", "சரிதான்", "ஓகே", "ok", "okay",
        "mm", "mmm", "hmm", "hm", "ஹ்ம்", "ஆ", "ஆமாம்",
        "புரிகிறது", "புரிஞ்சது", "தெரியும்",
        "sari", "aama", "ama", "seri", "ok da", "okay da",
    },
    "hi": {
        "हाँ", "हां", "ठीक है", "ठीक", "अच्छा", "ok", "okay",
        "समझ गया", "समझ गई", "जी", "जी हाँ", "जी हां",
        "haan", "han", "thik hai", "theek", "accha", "ji",
        "mm", "mmm", "hmm",
    },
    "en": {
        "ok", "okay", "yes", "yeah", "yep", "sure", "right",
        "i see", "got it", "understood", "mm", "mmm", "hmm",
        "uh-huh", "uh huh",
    },
}

# Phrases that signal caller wants a human — trigger HANDOFF regardless of emotion
_HANDOFF_PHRASES: dict[str, list[str]] = {
    "ta": [
        "human agent", "ஒரு மனிதன்", "staff ஐ கூப்பிடுங்கள்",
        "உங்கள் manager", "transfer பண்ணுங்கள்", "வேற ஆளு",
        "மனுஷன் வேணும்", "real person", "direct பண்ணுங்கள்",
    ],
    "hi": [
        "human agent", "manager bulao", "supervisor", "transfer karo",
        "asli insaan", "banda chahiye", "real person",
    ],
    "en": [
        "speak to a human", "speak to an agent", "talk to a person",
        "transfer me", "get me a manager", "supervisor",
        "real person", "human agent", "i want to talk to someone",
    ],
}


# ──────────────────────────────────────────────────────────────────────────────
# Sentence completion scoring
# ──────────────────────────────────────────────────────────────────────────────

# Sentence-ending patterns per language
_END_PATTERNS: dict[str, re.Pattern] = {
    "ta": re.compile(r"[\.!\?।॥\u0BFE\u0BFF]$"),
    "hi": re.compile(r"[\.!\?।॥]$"),
    "en": re.compile(r"[\.!\?]$"),
}

# Trailing-off signals (incomplete utterance)
_TRAILING_WORDS = {
    "um", "uh", "err", "like", "so", "and", "but", "because",
    "ஒரு நிமிடம்", "அது", "இது", "என்னன்னா",
    "matlab", "woh", "toh",
}


def _completion_score(text: str, lang: str) -> float:
    """
    0.0 = clearly incomplete  1.0 = clearly complete.
    Based on punctuation, word count, trailing words.
    """
    if not text:
        return 0.5

    stripped = text.strip()
    words = stripped.split()
    n = len(words)

    score = 0.5  # neutral start

    # Ends with sentence-end punctuation → complete
    pattern = _END_PATTERNS.get(lang, _END_PATTERNS["en"])
    if pattern.search(stripped):
        score += 0.35

    # Longer utterance → more likely complete
    if n >= 8:
        score += 0.15
    elif n >= 4:
        score += 0.05
    elif n <= 2:
        score -= 0.15  # very short — might be trailing

    # Ends with trailing word → incomplete
    last_word = words[-1].lower().rstrip(".,!?") if words else ""
    if last_word in _TRAILING_WORDS:
        score -= 0.35

    # Ends with a question word → likely complete (question)
    question_starters = {"என்ன", "எப்போது", "எங்கே", "எவ்வளவு",
                         "what", "when", "where", "how much", "why",
                         "kya", "kab", "kahan", "kitna"}
    if last_word in question_starters or stripped.endswith("?"):
        score += 0.2

    return max(0.0, min(1.0, score))


def _silence_budget_ms(completion: float, lang: str) -> int:
    """
    Map completion score to recommended silence window.
    Tamil gets wider windows because it has natural micro-pauses.
    """
    base = 900 if lang == "ta" else 700
    # Low completion → wait longer; high completion → respond sooner
    extra = int((1.0 - completion) * 600)
    return base + extra


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────

def evaluate_turn(
    transcript: str,
    language: str = "en",
    emotion_result: dict[str, Any] | None = None,
    transfer_enabled: bool = True,
) -> TurnDecision:
    """
    Decide what the voice pipeline should do with this caller turn.

    Args:
        transcript:        STT output for this turn
        language:          detected language code
        emotion_result:    output of emotion_engine.analyse_emotion()
        transfer_enabled:  whether the agent has a transfer_number configured

    Returns TurnDecision with .signal, .reason, .recommended_silence_ms,
    and .emotion_prefix (ready to prepend to the system prompt).
    """
    text = (transcript or "").strip()
    lang = (language or "en")[:2].lower()

    # ── 1. Empty transcript ────────────────────────────────────────────────
    if not text:
        return TurnDecision(
            signal=TurnSignal.WAIT,
            reason="empty_transcript",
            recommended_silence_ms=1200,
        )

    lower = text.lower()

    # ── 2. Explicit human-handoff request ─────────────────────────────────
    phrases = _HANDOFF_PHRASES.get(lang, []) + _HANDOFF_PHRASES["en"]
    for phrase in phrases:
        if phrase.lower() in lower:
            return TurnDecision(
                signal=TurnSignal.HANDOFF,
                reason=f"explicit_handoff_request: '{phrase}'",
                recommended_silence_ms=0,
            )

    # ── 3. Emotion-based handoff ──────────────────────────────────────────
    em = emotion_result or {}
    if em.get("needs_handoff") and transfer_enabled:
        dominant = em.get("emotion", "anger")
        score = em.get("emotion_confidence", 0.0)
        return TurnDecision(
            signal=TurnSignal.HANDOFF,
            reason=f"emotion_handoff: {dominant}={score:.2f}",
            recommended_silence_ms=0,
        )

    # ── 4. Backchannel guard ──────────────────────────────────────────────
    bc_set = _BACKCHANNELS.get(lang, set()) | _BACKCHANNELS["en"]
    # Normalise: strip punctuation, lowercase
    normalised = re.sub(r"[^\w\s]", "", lower).strip()
    if normalised in bc_set or lower.rstrip(".,!?") in bc_set:
        return TurnDecision(
            signal=TurnSignal.BACKCHANNEL,
            reason="backchannel_token",
            recommended_silence_ms=1500,
        )

    # ── 5. Completion scoring → silence budget ────────────────────────────
    completion = _completion_score(text, lang)
    silence_ms = _silence_budget_ms(completion, lang)

    # Build emotion prefix for LLM prompt (if emotions detected)
    emotion_prefix = ""
    scores = em.get("emotion_scores", {})
    if scores:
        from voice_engine.emotion_engine import build_emotion_prompt_prefix
        emotion_prefix = build_emotion_prompt_prefix(scores, language=lang)

    if completion < 0.3:
        return TurnDecision(
            signal=TurnSignal.WAIT,
            reason=f"low_completion_score={completion:.2f}",
            recommended_silence_ms=silence_ms,
            emotion_prefix=emotion_prefix,
        )

    return TurnDecision(
        signal=TurnSignal.PROCEED,
        reason=f"completion={completion:.2f}",
        recommended_silence_ms=silence_ms,
        emotion_prefix=emotion_prefix,
    )
