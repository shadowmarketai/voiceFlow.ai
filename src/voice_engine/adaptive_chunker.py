"""
Adaptive TTS Chunker — GAP 3 First-Chunk Optimization
=======================================================
Replaces the fixed sentence-boundary chunker with a three-phase strategy
that gets audio playing in the user's ear as fast as possible.

Phase 0 — first chunk:   3-5 words OR first clause boundary  → TTS fires ~30-80ms
Phase 1 — second chunk:  next clause (comma/semicolon/colon)  → TTS while chunk 0 plays
Phase 2+ — remaining:    full sentence boundaries              → best prosody

Why this order:
  The human ear tolerates slightly clipped prosody on the opening few words
  because context has not been established yet.  By chunk 2 the listener
  already knows the topic, so full-sentence TTS sounds natural.

Language awareness:
  Indic languages (Hindi, Tamil, Telugu, etc.) have longer function words and
  clause-final particles.  Firing on just 3 words often cuts mid-particle and
  sounds wrong.  We raise the first-chunk threshold to 5 words for Indic.
"""

from __future__ import annotations

import re

# Languages that need a higher first-chunk word count
_INDIC_LANGS = {"hi", "ta", "te", "kn", "ml", "bn", "mr", "gu", "pa", "or", "as", "ur"}

# Clause boundary: comma, semicolon, colon, Devanagari danda (।)
# The \s after the punctuation ensures we only split on actual word boundaries.
_CLAUSE_RE = re.compile(r"[,;:\u0964]\s")

# Sentence boundary: ASCII terminators + Devanagari/double danda
_SENT_RE = re.compile(r"[\.\?\!\u0964\u0965]\s")

# N-word prefix matcher — filled in _flush_first via format
_WORD_N_RE_CACHE: dict[int, re.Pattern] = {}


def _word_n_re(n: int) -> re.Pattern:
    if n not in _WORD_N_RE_CACHE:
        # Trailing \s is REQUIRED (not optional) so we only fire after the Nth
        # word is fully received.  Without this, "Thank you f" (mid-word) would
        # incorrectly match as 3 "words".
        _WORD_N_RE_CACHE[n] = re.compile(r"(\S+(?:\s+\S+){%d})\s" % (n - 1))
    return _WORD_N_RE_CACHE[n]


class AdaptiveChunker:
    """
    Stateful chunker — feed LLM tokens one at a time, receive TTS chunks back.

    Usage::

        chunker = AdaptiveChunker(language="en")
        async for token in llm_stream:
            chunk = chunker.feed(token)
            if chunk:
                fire_tts(chunk)
        # end of stream
        final = chunker.flush()
        if final:
            fire_tts(final)
    """

    def __init__(self, language: str = "en") -> None:
        lang = (language or "en")[:2].lower()
        self._is_indic = lang in _INDIC_LANGS
        # First chunk word threshold: 3 for English, 5 for Indic
        self._first_n: int = 5 if self._is_indic else 3
        self._buf: str = ""
        self._phase: int = 0  # 0=first, 1=second, 2+=sentence-only

    # ── public API ────────────────────────────────────────────────────────────

    def feed(self, token: str) -> str | None:
        """Accumulate a token.  Returns a chunk to send to TTS if ready."""
        self._buf += token
        return self._try_flush()

    def flush(self) -> str | None:
        """Force-flush remaining buffer at end of LLM stream."""
        text = self._buf.strip()
        if not text:
            return None
        self._buf = ""
        self._phase += 1
        return text

    # ── internal flush logic ─────────────────────────────────────────────────

    def _try_flush(self) -> str | None:
        if not self._buf.strip():
            return None
        if self._phase == 0:
            return self._flush_first()
        if self._phase == 1:
            return self._flush_clause_or_sentence()
        return self._flush_sentence()

    def _flush_first(self) -> str | None:
        """Phase 0: fire on whichever boundary comes first in the buffer.

        Priority order by buffer position (earliest wins):
          1. Sentence end  — fires if ≥1 word (Indic) or ≥2 words (Latin)
          2. Clause end    — fires if ≥2 words
          3. N-word cut    — hard limit so we never wait too long
        """
        text = self._buf

        # --- collect candidate (end_position, chunk_text, remaining_buf) ---
        candidates: list[tuple[int, str, str]] = []

        # Sentence boundary — any complete sentence (even 1 word) is valid.
        # ("Great!" alone is a natural first chunk; clause boundary still
        #  needs ≥2 words to avoid tiny fragments like "Hi,")
        m = _SENT_RE.search(text)
        if m:
            before = text[: m.start() + 1].strip()
            if len(before.split()) >= 1:
                candidates.append((m.end(), before, text[m.end() :]))

        # Clause boundary
        m = _CLAUSE_RE.search(text)
        if m:
            before = text[: m.start() + 1].strip()
            if len(before.split()) >= 2:
                candidates.append((m.end(), before, text[m.end() :]))

        # N-word hard cut (confirmed complete word via trailing \s)
        m = _word_n_re(self._first_n).match(text)
        if m:
            chunk = m.group(1).strip()
            candidates.append((m.end(), chunk, text[m.end() :]))

        if not candidates:
            return None

        # Pick earliest trigger in the buffer
        _, chunk, remaining = min(candidates, key=lambda c: c[0])
        self._buf = remaining
        self._phase += 1
        return chunk

    def _flush_clause_or_sentence(self) -> str | None:
        """Phase 1: clause boundary preferred, sentence boundary as fallback."""
        text = self._buf

        m = _CLAUSE_RE.search(text)
        if m:
            before = text[: m.start() + 1].strip()
            # Require at least 3 words so we don't split on a leading comma
            if len(before.split()) >= 3:
                self._buf = text[m.end():]
                self._phase += 1
                return before

        return self._flush_sentence()

    def _flush_sentence(self) -> str | None:
        """Phase 2+: full sentence boundary only."""
        text = self._buf
        m = _SENT_RE.search(text)
        if m:
            chunk = text[: m.start() + 1].strip()
            self._buf = text[m.end():]
            self._phase += 1
            return chunk
        return None
