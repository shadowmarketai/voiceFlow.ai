"""
Filler / Acknowledgment Engine — GAP-4 Zero-Perceived-Latency
==============================================================

Pre-synthesizes short acknowledgment phrases in every language the agent
speaks.  At turn-end the engine immediately returns a cached audio clip so
the caller hears the agent "thinking" instead of dead silence.

Design
------
* <50 ms to first filler byte — audio is pre-computed, never synthesized live
* Lazy per-language warmup — no change to agent creation flow; first call to
  ensure_warmed() fires a background asyncio task
* Round-robin rotation so the same phrase is never played back-to-back
* Emotion-aware routing — negative emotion picks from an empathy pool
* Skip-safe — get_filler() returns None cleanly when the cache is still cold
* Voice-scoped — different voice_id values get their own cache bucket so the
  filler always sounds like the agent, not a generic voice

Phrase length guide
-------------------
Keep all phrases ≤ 4 words.  TTS for 4 English words ≈ 0.8 s.  Any longer
risks the filler still playing when the real first audio chunk arrives,
causing an abrupt crossfade.
"""

from __future__ import annotations

import asyncio
import logging
import random

logger = logging.getLogger(__name__)


# ─── Phrase catalogue ───────────────────────────────────────────────────────
# Keys: ISO-639-1 language code.
# Keys suffixed "_empathy": played when caller sounds angry/sad/distressed.

_PHRASES: dict[str, list[str]] = {
    # ── English ──────────────────────────────────────────────────────────
    "en": [
        "Sure",
        "Let me check that",
        "Right",
        "Of course",
        "One moment",
    ],
    "en_empathy": [
        "I understand",
        "Of course, I'm here to help",
        "I hear you",
    ],
    # ── Hindi ────────────────────────────────────────────────────────────
    "hi": [
        "हाँ",
        "एक मिनट",
        "ज़रूर",
        "देखता हूँ",
        "बिल्कुल",
    ],
    "hi_empathy": [
        "समझ गया",
        "बिल्कुल मदद करूँगा",
    ],
    # ── Tamil ────────────────────────────────────────────────────────────
    "ta": [
        "சரி",
        "ஒரு நிமிஷம்",
        "நிச்சயமாக",
        "பார்க்கிறேன்",
        "தெரிந்துகொள்கிறேன்",
    ],
    "ta_empathy": [
        "புரிகிறது",
        "நிச்சயமாக உதவுவேன்",
    ],
    # ── Telugu ───────────────────────────────────────────────────────────
    "te": [
        "అవును",
        "ఒక్క నిమిషం",
        "తప్పకుండా",
        "చూస్తాను",
    ],
    "te_empathy": [
        "అర్థమైంది",
        "తప్పకుండా సహాయం చేస్తాను",
    ],
    # ── Kannada ──────────────────────────────────────────────────────────
    "kn": [
        "ಸರಿ",
        "ಒಂದು ನಿಮಿಷ",
        "ನಿಶ್ಚಿತವಾಗಿ",
        "ನೋಡುತ್ತೇನೆ",
    ],
    "kn_empathy": [
        "ಅರ್ಥವಾಯಿತು",
        "ಖಂಡಿತ ಸಹಾಯ ಮಾಡುತ್ತೇನೆ",
    ],
    # ── Malayalam ────────────────────────────────────────────────────────
    "ml": [
        "ശരി",
        "ഒരു നിമിഷം",
        "തീർച്ചയായും",
        "നോക്കാം",
    ],
    "ml_empathy": [
        "മനസ്സിലായി",
        "തീർച്ചയായും സഹായിക്കാം",
    ],
    # ── Bengali ──────────────────────────────────────────────────────────
    "bn": [
        "হ্যাঁ",
        "একটু দেখি",
        "অবশ্যই",
        "এক মিনিট",
    ],
    "bn_empathy": [
        "বুঝতে পেরেছি",
        "অবশ্যই সাহায্য করব",
    ],
    # ── Marathi ──────────────────────────────────────────────────────────
    "mr": [
        "हो",
        "एक मिनिट",
        "नक्की",
        "बघतो",
    ],
    "mr_empathy": [
        "समजलो",
        "नक्की मदत करतो",
    ],
    # ── Gujarati ─────────────────────────────────────────────────────────
    "gu": [
        "હા",
        "એક મિનિટ",
        "ચોક્કસ",
        "જોઉં છું",
    ],
    "gu_empathy": [
        "સમજ્યો",
        "ચોક્કસ મદદ કરીશ",
    ],
    # ── Punjabi ──────────────────────────────────────────────────────────
    "pa": [
        "ਹਾਂ",
        "ਇੱਕ ਮਿੰਟ",
        "ਜ਼ਰੂਰ",
        "ਵੇਖਦਾ ਹਾਂ",
    ],
    "pa_empathy": [
        "ਸਮਝ ਗਿਆ",
        "ਜ਼ਰੂਰ ਮਦਦ ਕਰਾਂਗਾ",
    ],
    # ── Odia ─────────────────────────────────────────────────────────────
    "or": [
        "ହଁ",
        "ଏକ ମିନିଟ",
        "ନିଶ୍ଚୟ",
        "ଦେଖୁଛି",
    ],
    # ── Urdu ─────────────────────────────────────────────────────────────
    "ur": [
        "ہاں",
        "ایک منٹ",
        "ضرور",
        "دیکھتا ہوں",
    ],
    "ur_empathy": [
        "سمجھ گیا",
        "ضرور مدد کروں گا",
    ],
}

# Emotions that trigger the empathy phrase pool
_NEGATIVE_EMOTIONS = frozenset({"anger", "frustration", "sadness", "fear", "distress"})


# ─── Engine ─────────────────────────────────────────────────────────────────

class FillerEngine:
    """
    Manages pre-synthesized filler audio clips per (language, voice_id) pair.

    All cache mutation happens inside the asyncio event loop — no locking needed.
    """

    def __init__(self) -> None:
        # Maps cache_key → list[audio_base64]
        self._cache: dict[str, list[str]] = {}
        # Cache keys currently being synthesized (prevents duplicate warmup)
        self._warming: set[str] = set()
        # Round-robin index per cache key
        self._idx: dict[str, int] = {}

    # ── public ────────────────────────────────────────────────────────────

    def ensure_warmed(
        self,
        language: str,
        voice_id: str | None = None,
    ) -> None:
        """Schedule background synthesis for *language* if not already cached.

        Call this on every turn — it is a no-op once the language is hot.
        The warmup runs as an asyncio background task; the calling coroutine
        is never blocked.
        """
        lang = _norm(language)
        key = _key(lang, voice_id)
        if key in self._cache or key in self._warming:
            return
        self._warming.add(key)
        try:
            asyncio.get_running_loop().create_task(
                self._warm(lang, voice_id, key),
                name=f"filler-warmup-{lang}",
            )
            logger.debug("FillerEngine: warmup scheduled for lang=%s", lang)
        except RuntimeError:
            # No running event loop at this point — warmup deferred until next call
            self._warming.discard(key)

    def get_filler(
        self,
        language: str,
        emotion: str | None = None,
        voice_id: str | None = None,
    ) -> str | None:
        """Return a pre-synthesized audio_base64 clip, or None if cache is cold.

        Uses a round-robin so the caller never hears the same phrase twice
        in consecutive turns.
        """
        lang = _norm(language)
        key = _key(lang, voice_id)

        # Empathy pool for negative caller emotions
        if emotion in _NEGATIVE_EMOTIONS:
            emp_key = _key(f"{lang}_empathy", voice_id)
            pool = self._cache.get(emp_key)
            active_key = emp_key if pool else key
            pool = pool or self._cache.get(key)
        else:
            active_key = key
            pool = self._cache.get(key)

        if not pool:
            return None  # still warming or synthesis failed entirely

        # Use active_key for rotation so empathy and regular pools rotate independently
        idx = self._idx.get(active_key, 0)
        self._idx[active_key] = (idx + 1) % len(pool)
        return pool[idx]

    def should_skip(self, cache_hit: bool = False) -> bool:
        """Return True when the real response is already ready — no filler needed."""
        return cache_hit

    # ── internal ──────────────────────────────────────────────────────────

    async def _warm(
        self,
        lang: str,
        voice_id: str | None,
        primary_key: str,
    ) -> None:
        """Synthesize all phrases (regular + empathy) for *lang* concurrently."""
        from voice_engine.api_providers import synthesize_speech_api

        jobs: list[tuple[str, str]] = []  # (cache_key, phrase)

        for phrase in (_PHRASES.get(lang) or _PHRASES["en"]):
            jobs.append((primary_key, phrase))

        emp_phrases = _PHRASES.get(f"{lang}_empathy", [])
        if emp_phrases:
            emp_key = _key(f"{lang}_empathy", voice_id)
            for phrase in emp_phrases:
                jobs.append((emp_key, phrase))

        # Fire all TTS calls concurrently
        tasks = [
            asyncio.create_task(
                synthesize_speech_api(phrase, language=lang, voice_id=voice_id)
            )
            for _, phrase in jobs
        ]

        buckets: dict[str, list[str]] = {}
        for (cache_key, phrase), task in zip(jobs, tasks):
            try:
                result = await task
                audio = result.get("audio_base64", "")
                if audio:
                    buckets.setdefault(cache_key, []).append(audio)
                    logger.debug("FillerEngine cached [%s] %r", lang, phrase)
            except Exception as exc:
                logger.debug("FillerEngine synthesis failed [%s] %r: %s", lang, phrase, exc)

        for cache_key, clips in buckets.items():
            random.shuffle(clips)          # randomise start position
            self._cache[cache_key] = clips

        self._warming.discard(primary_key)
        cached_count = len(self._cache.get(primary_key, []))
        logger.info("FillerEngine ready: lang=%s phrases=%d", lang, cached_count)


# ─── Helpers ────────────────────────────────────────────────────────────────

def _norm(language: str) -> str:
    """Normalise to 2-char lowercase language code."""
    return (language or "en")[:2].lower()


def _key(lang: str, voice_id: str | None) -> str:
    """Unique cache key per (language, voice)."""
    return f"{lang}::{voice_id or 'default'}"


# ─── Singleton ───────────────────────────────────────────────────────────────

_engine: FillerEngine | None = None


def get_filler_engine() -> FillerEngine:
    global _engine
    if _engine is None:
        _engine = FillerEngine()
    return _engine
