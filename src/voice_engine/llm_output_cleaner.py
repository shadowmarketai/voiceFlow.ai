"""
LLM Output Cleaner — phone TTS pre-processor
=============================================
Call clean_for_tts() on every LLM response BEFORE sending to TTS.

Problems it solves:
  - LLM outputs markdown (**bold**, - bullets, ## headings) which TTS reads literally
  - AI filler openers ("Certainly!", "Great question!") sound robotic on phone
  - 4-5 sentence answers are too long for phone; callers lose focus after 2
  - Multiple newlines break TTS prosody
  - Indian number formatting (1500000 → "15 lakhs") for natural speech
"""

from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# Patterns
# ---------------------------------------------------------------------------

_MARKDOWN_SUBS: list[tuple[re.Pattern, str]] = [
    (re.compile(r'\*\*(.+?)\*\*'),          r'\1'),      # **bold**
    (re.compile(r'\*(.+?)\*'),               r'\1'),      # *italic*
    (re.compile(r'__(.+?)__'),               r'\1'),      # __underline__
    (re.compile(r'^#{1,6}\s+', re.M),        ''),         # ## Headings
    (re.compile(r'^[-•*+]\s+', re.M),        ''),         # - bullet points
    (re.compile(r'^\d+\.\s+', re.M),         ''),         # 1. numbered lists
    (re.compile(r'`{1,3}[^`]*`{1,3}'),       ''),         # `code` / ```block```
    (re.compile(r'\[([^\]]+)\]\([^)]+\)'),   r'\1'),      # [link text](url)
    (re.compile(r'!\[[^\]]*\]\([^)]+\)'),    ''),         # ![image](url)
    (re.compile(r'^>{1,}\s+', re.M),         ''),         # > blockquotes
    (re.compile(r'_{1,2}(.+?)_{1,2}'),       r'\1'),      # _italic_ / __bold__
    (re.compile(r'\n{2,}'),                  ' '),         # double newlines → space
    (re.compile(r'\n'),                      ' '),         # remaining newlines
]

# AI filler phrases that sound robotic on a phone call
_FILLER_STARTS: list[str] = [
    "Certainly! ",   "Certainly, ",   "Certainly.",
    "Of course! ",   "Of course, ",   "Of course.",
    "Absolutely! ",  "Absolutely, ",  "Absolutely.",
    "Sure! ",        "Sure, ",
    "Great question! ", "That's a great question! ", "That's a great question.",
    "I'd be happy to help ", "I'd be glad to ",
    "I understand that ", "I appreciate your ",
    "Thank you for asking ", "Thank you for that question",
    "That's an excellent question",
]

# ₹ formatting: replace large raw numbers with Indian lakh/crore notation
_LAKH  = 100_000
_CRORE = 10_000_000

_RUPEE_RE = re.compile(r'₹\s*([\d,]+)')


def _format_rupees(m: re.Match) -> str:
    num_str = m.group(1).replace(',', '')
    try:
        n = int(num_str)
    except ValueError:
        return m.group(0)
    if n >= _CRORE:
        val = n / _CRORE
        fval = f"{val:.1f}".rstrip('0').rstrip('.')
        return f"₹{fval} crore"
    if n >= _LAKH:
        val = n / _LAKH
        fval = f"{val:.1f}".rstrip('0').rstrip('.')
        return f"₹{fval} lakh"
    return f"₹{n:,}"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def clean_for_tts(text: str, max_sentences: int = 2) -> str:
    """Strip markdown, remove AI filler, format Indian numbers, trim to
    `max_sentences` for phone-call TTS delivery.

    Args:
        text:          Raw LLM output string
        max_sentences: Maximum sentences to keep (default 2 for phone calls)

    Returns:
        Clean plain text ready for TTS synthesis.
    """
    if not text:
        return text

    # 1. Strip filler openers (exact prefix match, case-sensitive)
    for filler in _FILLER_STARTS:
        if text.startswith(filler):
            text = text[len(filler):].lstrip()
            break

    # 2. Strip markdown
    for pattern, replacement in _MARKDOWN_SUBS:
        text = pattern.sub(replacement, text)

    # 3. Format Indian rupee amounts
    text = _RUPEE_RE.sub(_format_rupees, text)

    # 4. Collapse whitespace
    text = re.sub(r'\s+', ' ', text).strip()

    # 5. Trim to max_sentences
    # Split on sentence-ending punctuation followed by whitespace or end
    sentences = re.split(r'(?<=[.!?])\s+', text)
    sentences = [s.strip() for s in sentences if s.strip()]
    if len(sentences) > max_sentences:
        text = ' '.join(sentences[:max_sentences])
        # Ensure it ends with punctuation
        if text and text[-1] not in '.!?':
            text += '.'

    return text.strip()


def clean_stream_chunk(chunk: str) -> str:
    """Lightweight cleaner for streaming LLM tokens.
    Only strips markdown syntax — does NOT truncate sentences since
    the stream is still in flight. Call clean_for_tts() on the full
    accumulated text when building TTS chunks.
    """
    if not chunk:
        return chunk
    for pattern, replacement in _MARKDOWN_SUBS[:8]:   # skip newline subs
        chunk = pattern.sub(replacement, chunk)
    return chunk
