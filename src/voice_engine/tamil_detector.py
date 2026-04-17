"""
Romanized Tamil Phonetic Detector
───────────────────────────────────
Problem: W2.2 in VoiceFlow AI uses Unicode script range detection (0x0B80-0x0BFF)
to identify Tamil. This works for Unicode Tamil script but FAILS for Tanglish —
Tamil typed in English letters, which is how 80%+ of Tamil Nadu users actually type.

Example failures with Unicode-only detection:
  "Naan ippo busy ah irukken" → detected as English ❌ (should be Tamil)
  "Enna price sollunga"       → detected as English ❌ (should be Tamil)  
  "Doctor appointment fix pannunga" → English ❌
  "Seri da, naalaikku vaanga" → English ❌

This module detects romanized Tamil through three signal layers:
  1. Phoneme pattern matching (Tamil phonemes that don't occur in English)
  2. Tamil function word lexicon (grammatical particles unique to Tamil)
  3. Morphological suffix detection (agglutinative Tamil word endings)

Combined confidence score → language decision.
"""

import re
import unicodedata
from dataclasses import dataclass
from typing import Optional


# ─── SIGNAL 1: TAMIL-SPECIFIC PHONEME PATTERNS ───────────────────────────────
# These consonant clusters and vowel patterns appear in Tamil romanization
# but are statistically rare or absent in standard English words.

TAMIL_PHONEME_PATTERNS = [
    # Retroflex consonants — the defining feature of Dravidian phonology
    # ட (ṭa), ண (ṇa), ள (ḷa), ழ (ḻa), ற (ṟa)
    (r"zh",           3.0, "retroflex_zha"),     # ழ — uniquely Tamil, not in Hindi
    (r"nh",           2.0, "nasal_nh"),
    (r"\btr\b",       1.5, "tr_word"),
    (r"ndh",          2.5, "retroflex_nd"),
    (r"tth",          2.0, "geminate_t"),
    (r"nnh",          2.0, "geminate_n"),
    (r"llh",          2.0, "geminate_l"),

    # Vowel length markers common in Tamil romanization
    (r"aa(?!r)",      1.5, "long_a"),            # paattu, vaango, maadu
    (r"ii",           1.5, "long_i"),            # niinga, viidu
    (r"uu",           1.5, "long_u"),            # puutu, muunu
    (r"ee(?!k|n$)",   1.5, "long_e"),            # peesi, veetu

    # Consonant clusters unique to Tamil transliteration
    (r"pp(?!le|er|y|ing)",  1.5, "geminate_p"),  # ippo, apporam
    (r"kk",           1.5, "geminate_k"),        # akka, pokka
    (r"tt(?!er|le|ing|ed|y)", 1.5, "geminate_t2"), # athu, patta
    (r"rr",           1.5, "geminate_r"),        # arra, porra

    # Common Tamil word patterns
    (r"inga\b",       2.5, "inga_suffix"),       # vaanga, poonga, pesinga
    (r"unga\b",       2.5, "unga_suffix"),       # sollunge, pannunge
    (r"ille\b",       3.0, "ille_neg"),          # theriyille, varille
    (r"illa\b",       2.5, "illa_neg"),          # illai form
    (r"kku\b",        2.0, "dative_kku"),        # enakku, avanakku
    (r"ku\b",         1.5, "dative_ku"),         # short form
    (r"oda\b",        2.0, "oda_possessive"),    # avangoda, nammoda
    (r"ula\b",        1.5, "locative_ula"),
    (r"le\b",         1.0, "locative_le"),       # veetule, angele
    (r"kitte\b",      2.5, "kitte_with"),        # avankitte, ennakitte
    (r"kitta\b",      2.5, "kitta_with"),
]

# Compile all patterns once at import time
_COMPILED_PHONEME = [
    (re.compile(pat, re.IGNORECASE), score, name)
    for pat, score, name in TAMIL_PHONEME_PATTERNS
]


# ─── SIGNAL 2: TAMIL FUNCTION WORD LEXICON ────────────────────────────────────
# Grammatical particles, pronouns, verbs that are unmistakably Tamil.
# These are high-confidence signals — if you see "naan" or "avan" it's Tamil.

TAMIL_FUNCTION_WORDS = {
    # Pronouns
    "naan":    4.0,   # I
    "naanum":  4.0,   # I also
    "nee":     4.0,   # you (informal)
    "neenga":  4.0,   # you (formal/plural)
    "neengalum": 4.0,
    "avan":    4.0,   # he
    "aval":    4.0,   # she
    "avanga":  4.0,   # they
    "avangalum": 4.0,
    "namma":   4.0,   # our/we (inclusive)
    "nammalum": 4.0,
    "oru":     3.0,   # a/an/one
    "avaru":   4.0,   # he/she (respectful)

    # Demonstratives
    "antha":   3.5,   # that
    "antha":   3.5,
    "inga":    2.5,   # here (can clash)
    "ange":    3.5,   # there
    "inge":    3.5,   # here
    "ippo":    4.0,   # now
    "apporam": 4.0,   # after that
    "appo":    3.5,   # then
    "innum":   3.5,   # still/more
    "inniku":  4.0,   # today

    # Common verbs / copulas
    "irukku":  4.0,   # is/are/exists
    "irukken": 4.0,   # I am
    "irukka":  4.0,   # is it?
    "irukkinga": 4.0, # you are (formal)
    "vaanga":  4.0,   # come (polite imp.)
    "vanga":   3.5,   # come
    "ponga":   4.0,   # go (polite imp.)
    "poonga":  4.0,
    "pannunga": 4.0,  # do (polite imp.)
    "pannu":   3.5,   # do
    "paarunga": 4.0,  # see (polite imp.)
    "paaru":   3.5,   # see
    "sollunga": 4.0,  # say/tell (polite)
    "sollu":   3.5,
    "pesinga": 4.0,   # talk (polite)
    "pesu":    3.0,
    "kelunga": 4.0,   # ask (polite)
    "kelu":    3.0,
    "kudunga": 4.0,   # give (polite)
    "kudu":    3.0,
    "vidu":    3.0,   # let go / leave
    "mudiyum": 4.0,   # can/possible
    "mudiyadu": 4.0,  # cannot
    "theriyum": 4.0,  # will know / known
    "theriyadu": 4.0, # don't know
    "theriyale": 4.0, # don't know (alt)
    "vendam":  4.0,   # don't want
    "venum":   4.0,   # want/need
    "vendum":  4.0,
    "aagum":   3.5,   # will become/ok
    "aagadu":  3.5,   # won't work

    # Question words
    "enna":    3.5,   # what
    "yenna":   3.5,   # what (alt)
    "yaaru":   4.0,   # who
    "yaar":    3.5,   # who (short)
    "enga":    3.5,   # where
    "engeyada": 4.0,
    "eppo":    4.0,   # when
    "eppadi":  4.0,   # how
    "yeppo":   4.0,   # when (alt)
    "yen":     3.0,   # why
    "yenpa":   3.5,   # why (formal)
    "evvalavu": 4.0,  # how much

    # Discourse markers / fillers
    "seri":    3.5,   # ok/alright
    "sari":    3.0,   # ok/alright (alt)
    "aama":    3.5,   # yes
    "aamaa":   3.5,   # yes (emphatic)
    "illa":    3.0,   # no
    "illai":   3.5,   # no (formal)
    "illama":  3.5,   # without
    "da":      2.0,   # casual particle (low confidence — too short)
    "di":      2.0,   # feminine casual particle
    "ra":      1.5,   # present tense marker
    "nga":     2.5,   # respect/plural marker
    "nu":      2.0,   # quotative marker
    "pola":    3.0,   # like/seems
    "maadhiri": 4.0,  # like/similar
    "dhaan":   3.5,   # only/exactly (emphatic)
    "thaane":  3.5,   # isn't it?
    "la":      1.5,   # locative/focus (short — low confidence)
    "le":      1.5,

    # Time/common nouns
    "naalaikku": 4.0, # tomorrow
    "naalai":  3.5,   # tomorrow (short)
    "nethu":   4.0,   # yesterday
    "munnadi": 3.5,   # before/in front
    "pinnadi": 3.5,   # behind
    "kaasu":   3.5,   # money
    "viidu":   3.5,   # house
    "ooru":    3.5,   # town/village
}


# ─── SIGNAL 3: MORPHOLOGICAL SUFFIXES ────────────────────────────────────────
# Tamil is agglutinative — words grow by stacking suffixes.
# These patterns catch words we haven't seen before.

TAMIL_SUFFIX_PATTERNS = [
    # Verb endings
    (r"\w{3,}kiren\b",  3.0, "present_1s"),    # paarkiren, vandukiren
    (r"\w{3,}kirom\b",  3.0, "present_1p"),    # pokirom
    (r"\w{3,}kiraai\b", 3.0, "present_2s"),
    (r"\w{3,}kiraan\b", 3.0, "present_3sm"),
    (r"\w{3,}kiral\b",  3.0, "present_3sf"),
    (r"\w{3,}kiraar\b", 3.0, "present_3hr"),
    (r"\w{3,}uveen\b",  2.5, "future_1s"),
    (r"\w{3,}ven\b",    2.0, "future_1s_short"),
    (r"\w{3,}ttaan\b",  2.5, "past_3sm"),
    (r"\w{3,}ndhaan\b", 2.5, "past_3sm_alt"),
    (r"\w{3,}ttaal\b",  2.5, "past_3sf"),
    (r"\w{3,}ttaar\b",  2.5, "past_3hr"),

    # Noun case suffixes
    (r"\w{3,}ukku\b",   2.5, "dative"),        # enakku, avanukku
    (r"\w{3,}kkaga\b",  2.5, "benefactive"),
    (r"\w{3,}ooda\b",   2.5, "instrumental"),
    (r"\w{3,}aala\b",   2.5, "instrumental_alt"),
    (r"\w{3,}ilirundhu\b", 3.5, "ablative"),
    (r"\w{3,}ulla\b",   2.0, "locative_ulla"),
    (r"\w{3,}kaaga\b",  2.5, "purpose"),

    # Common verbal nouns / gerunds
    (r"\w{3,}radhu\b",  3.0, "gerund_radhu"),  # poradhu, varadhu
    (r"\w{3,}radu\b",   3.0, "gerund_radu"),
    (r"\w{3,}vadu\b",   2.5, "gerund_vadu"),
    (r"\w{3,}thal\b",   2.5, "verbal_noun"),

    # Plural markers
    (r"\w{3,}gal\b",    2.0, "plural_gal"),    # viidugal, aadugal
    (r"\w{3,}kal\b",    2.0, "plural_kal"),
    (r"\w{3,}ngal\b",   2.5, "plural_ngal"),
]

_COMPILED_SUFFIX = [
    (re.compile(pat, re.IGNORECASE), score, name)
    for pat, score, name in TAMIL_SUFFIX_PATTERNS
]


# ─── UNICODE SCRIPT DETECTION (existing method, kept as Signal 4) ─────────────

def _unicode_tamil_ratio(text: str) -> float:
    """Ratio of Unicode Tamil script characters in text."""
    if not text:
        return 0.0
    tamil_chars = sum(
        1 for c in text
        if '\u0B80' <= c <= '\u0BFF'  # Tamil Unicode block
    )
    # Only count actual characters, not spaces/punctuation
    total = sum(1 for c in text if c.isalpha())
    return tamil_chars / total if total > 0 else 0.0


# ─── RESULT DATACLASS ────────────────────────────────────────────────────────

@dataclass
class DetectionResult:
    language: str              # "ta" | "en" | "hi" | "mixed"
    confidence: float          # 0.0 – 1.0
    is_tamil: bool
    signals: dict              # breakdown of what fired
    raw_score: float           # unnormalized Tamil score
    text_length: int

    def __str__(self):
        signals_str = ", ".join(
            f"{k}={v:.1f}" for k, v in self.signals.items() if v > 0
        )
        return (
            f"DetectionResult(lang={self.language}, "
            f"conf={self.confidence:.2f}, "
            f"signals=[{signals_str}])"
        )


# ─── MAIN DETECTOR ───────────────────────────────────────────────────────────

class RomanizedTamilDetector:
    """
    Detects whether a string contains Tamil language content,
    including romanized Tanglish that Unicode detection misses.

    Decision thresholds:
        score >= 6.0  → Tamil (high confidence)
        score >= 3.0  → Tamil (moderate confidence)
        score >= 1.5  → Mixed / Tanglish
        score <  1.5  → Not Tamil
    """

    THRESHOLD_HIGH   = 6.0
    THRESHOLD_MEDIUM = 3.0
    THRESHOLD_LOW    = 1.5
    UNICODE_BOOST    = 20.0   # Unicode Tamil chars are definitive

    def __init__(self, channel_hint: Optional[str] = None):
        """
        channel_hint: tenant-level language hint ("ta", "hi", "en", etc.)
        When set, biases detection toward that language on ambiguous inputs.
        """
        self.channel_hint = channel_hint
        self._hint_bias = 1.5 if channel_hint == "ta" else 1.0

    def detect(self, text: str) -> DetectionResult:
        """
        Main detection method. Returns DetectionResult with full breakdown.
        Call this per-utterance during a live call.
        """
        if not text or not text.strip():
            return DetectionResult(
                language="en", confidence=0.0, is_tamil=False,
                signals={}, raw_score=0.0, text_length=0
            )

        text_clean = text.strip()
        words = re.findall(r"[a-zA-Z\u0B80-\u0BFF]+", text_clean)

        signals = {
            "unicode": 0.0,
            "function_words": 0.0,
            "phoneme_patterns": 0.0,
            "morphology": 0.0,
            "channel_hint": 0.0,
        }

        # ── Signal 4: Unicode Tamil (definitive)
        unicode_ratio = _unicode_tamil_ratio(text_clean)
        if unicode_ratio >= 0.10:
            signals["unicode"] = unicode_ratio * self.UNICODE_BOOST

        # ── Signal 2: Function word lexicon
        for word in words:
            word_lower = word.lower()
            if word_lower in TAMIL_FUNCTION_WORDS:
                signals["function_words"] += TAMIL_FUNCTION_WORDS[word_lower]

        # ── Signal 1: Phoneme patterns (on full text)
        text_lower = text_clean.lower()
        for pattern, score, name in _COMPILED_PHONEME:
            matches = pattern.findall(text_lower)
            if matches:
                signals["phoneme_patterns"] += score * len(matches)

        # ── Signal 3: Morphological suffixes
        for pattern, score, name in _COMPILED_SUFFIX:
            matches = pattern.findall(text_lower)
            if matches:
                signals["morphology"] += score * len(matches)

        # ── Channel hint bias
        if self.channel_hint == "ta" and any(
            signals[k] > 0 for k in ["function_words", "phoneme_patterns", "morphology"]
        ):
            signals["channel_hint"] = 2.0

        # ── Total score
        raw_score = sum(signals.values())

        # ── Normalize by text length (longer text = more signal, less noise)
        # Avoid over-penalizing short utterances
        word_count = max(len(words), 1)
        normalized_score = raw_score / (1 + 0.1 * max(word_count - 5, 0))

        # ── Apply channel hint bias
        normalized_score *= self._hint_bias

        # ── Decision
        if normalized_score >= self.THRESHOLD_HIGH:
            language = "ta"
            confidence = min(0.97, 0.75 + (normalized_score - self.THRESHOLD_HIGH) * 0.02)
            is_tamil = True
        elif normalized_score >= self.THRESHOLD_MEDIUM:
            language = "ta"
            confidence = 0.60 + (normalized_score - self.THRESHOLD_MEDIUM) * 0.05
            is_tamil = True
        elif normalized_score >= self.THRESHOLD_LOW:
            language = "mixed"
            confidence = 0.40 + normalized_score * 0.05
            is_tamil = True   # treat mixed as Tamil for TTS routing
        else:
            language = "en"
            confidence = max(0.5, 1.0 - normalized_score * 0.2)
            is_tamil = False

        return DetectionResult(
            language=language,
            confidence=round(confidence, 3),
            is_tamil=is_tamil,
            signals=signals,
            raw_score=round(normalized_score, 2),
            text_length=len(words),
        )

    def detect_language(self, text: str) -> str:
        """Simple string-returning wrapper for use in pick_tts_language()."""
        return self.detect(text).language

    def is_tamil(self, text: str) -> bool:
        """Returns True if text is Tamil or Tanglish."""
        return self.detect(text).is_tamil


# ─── INTEGRATION: DROP-IN REPLACEMENT FOR lang_detect.py ────────────────────

def pick_tts_language(
    transcript: str,
    stt_detected_lang: Optional[str] = None,
    channel_hint: Optional[str] = None,
) -> str:
    """
    Fuses three signals to decide TTS language:
      1. STT audio-level detection (most reliable for clear speech)
      2. Text script analysis — Unicode + romanized Tamil detection
      3. Channel-level hint from tenant config

    Replaces the Unicode-only implementation in W2.2.
    Now correctly handles Tanglish.

    Returns ISO 639-1 language code: "ta", "hi", "en", etc.
    """

    detector = RomanizedTamilDetector(channel_hint=channel_hint)

    # ── Priority 1: STT audio-level detection (high confidence)
    if stt_detected_lang and stt_detected_lang != "en":
        # STT says non-English — trust it unless text strongly disagrees
        result = detector.detect(transcript)
        if result.confidence < 0.30:
            # Text detection strongly disagrees — go with STT
            return stt_detected_lang
        # Both agree or text is more certain — use text-based result
        return result.language if result.is_tamil else stt_detected_lang

    # ── Priority 2: Text-based detection (handles Tanglish)
    result = detector.detect(transcript)
    if result.is_tamil and result.confidence >= 0.50:
        return result.language  # "ta" or "mixed" → "ta"

    # ── Priority 3: Channel hint as tiebreaker
    if channel_hint and result.confidence < 0.40:
        return channel_hint

    # ── Default
    return result.language if result.is_tamil else "en"


# ─── TESTS ────────────────────────────────────────────────────────────────────

def run_tests():
    """
    Run against the failure cases from W2.2 review + extended set.
    All should detect as Tamil.
    """

    detector = RomanizedTamilDetector()

    test_cases = [
        # (text, expected_is_tamil, description)

        # ── Original failure cases from the review
        ("Naan ippo busy ah irukken", True, "busy statement"),
        ("Enna price sollunga", True, "price inquiry"),
        ("Doctor appointment fix pannunga", True, "appointment request"),
        ("Seri da, naalaikku vaanga", True, "scheduling"),

        # ── Pure Tanglish
        ("Naalaikku appointment venum", True, "appointment needed"),
        ("Enna price ah irukku", True, "price question"),
        ("Innum kொஞ்சம் wait pannunga", True, "wait request"),  # mixed script
        ("Avanga inge varavillai", True, "they didn't come"),
        ("Nee inge varadha?", True, "are you coming here?"),
        ("Ippo free ah irukkinga?", True, "are you free now?"),
        ("Evvalavu aagum?", True, "how much will it cost?"),
        ("Yaaru pesringga?", True, "who is speaking?"),
        ("Eppo varuveengga?", True, "when will you come?"),

        # ── Code-switched sentences
        ("I want to book appointment pannunga", True, "mixed english-tamil"),
        ("Please inga come pannunga", True, "mixed request"),
        ("Price enna sollunga", True, "price with tamil verbs"),
        ("My phone number 9841234567 ku call pannunga", True, "call request"),
        ("okay antha file ku access venum", True, "access request"),

        # ── Morphology-heavy
        ("Avangalukku theriyavillai", True, "they didn't know"),
        ("Naan pokirendata theriyuma?", True, "do you know I'm going?"),
        ("Avan varuvaan nu sollavillai", True, "he didn't say he'd come"),

        # ── Tamil-specific words
        ("Sari paathukalam", True, "alright let's see"),
        ("Aama varuven", True, "yes i'll come"),
        ("Illai theriyadu", True, "no, don't know"),

        # ── Should NOT detect as Tamil
        ("Hello how are you?", False, "pure english"),
        ("I need help with my order", False, "english order"),
        ("Thank you for calling", False, "english greeting"),
        ("What is your price?", False, "english price question"),
        ("Can you please call me back?", False, "english callback"),
        ("My name is Kumar", False, "english with indian name"),

        # ── Unicode Tamil (original method should still work)
        ("நாளை appointment வேணும்", True, "unicode tamil"),
        ("வணக்கம்", True, "unicode greeting"),
    ]

    passed = 0
    failed = 0
    print(f"\n{'─'*70}")
    print(f"{'TEXT':<45} {'EXPECTED':<10} {'GOT':<10} {'SCORE':<8} STATUS")
    print(f"{'─'*70}")

    for text, expected_tamil, desc in test_cases:
        result = detector.detect(text)
        got_tamil = result.is_tamil
        status = "✅" if got_tamil == expected_tamil else "❌"
        if got_tamil == expected_tamil:
            passed += 1
        else:
            failed += 1
        print(
            f"{text[:44]:<45} "
            f"{'Tamil' if expected_tamil else 'English':<10} "
            f"{'Tamil' if got_tamil else 'English':<10} "
            f"{result.raw_score:<8.1f} "
            f"{status} {desc}"
        )

    print(f"{'─'*70}")
    print(f"Results: {passed}/{len(test_cases)} passed ({passed/len(test_cases)*100:.0f}%)")

    # Show signal breakdown for a few examples
    print("\n── Signal Breakdown Examples ──")
    examples = [
        "Naan ippo busy ah irukken",
        "Doctor appointment fix pannunga",
        "Evvalavu aagum?",
        "Hello how are you?",
    ]
    for ex in examples:
        r = detector.detect(ex)
        print(f"\n  '{ex}'")
        print(f"  → {r}")

    return passed, failed


if __name__ == "__main__":
    passed, failed = run_tests()
    exit(0 if failed == 0 else 1)
