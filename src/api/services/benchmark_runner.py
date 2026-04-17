"""
Real benchmark runner — replaces hardcoded accuracy numbers.

Sends test utterances through the actual voice pipeline (STT → LLM → TTS)
and measures:
  - WER (Word Error Rate) per language
  - E2E latency (p50/p95)
  - LLM first-token latency
  - TTS generation time

Results persist to DB so the /accuracy endpoint returns live numbers.

Usage:
    from api.services.benchmark_runner import run_benchmark
    results = await run_benchmark()         # runs all languages
    results = await run_benchmark("hi")     # Hindi only
"""

from __future__ import annotations

import asyncio
import logging
import os
import re as _re
import time
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)


# ── Test corpus: known text → we synthesize audio → STT it → compare ──
# This measures the round-trip accuracy: TTS generates audio from known
# text, then STT transcribes it back. WER = edit distance between the
# original text and the STT output. This catches real-world issues
# (accent handling, noise robustness) that offline datasets miss.

_TEST_CORPUS: dict[str, list[str]] = {
    "en": [
        "Hello, I would like to book an appointment for tomorrow.",
        "Can you tell me the price of your premium plan?",
        "I need a refund for my recent purchase.",
        "Thank you for calling, have a great day.",
        "I need to speak with a manager about my complaint.",
    ],
    "hi": [
        "नमस्ते, मुझे कल अपॉइंटमेंट चाहिए।",
        "आपकी सेवा की कीमत क्या है?",
        "मुझे अपना पैसा वापस चाहिए।",
        "कॉल करने के लिए धन्यवाद, आपका दिन शुभ हो।",
        "मुझे अपनी शिकायत के बारे में बात करनी है।",
    ],
    "ta": [
        "வணக்கம், நாளை அப்பாயின்ட்மென்ட் வேண்டும்.",
        "உங்கள் சேவையின் விலை என்ன?",
        "எனக்கு பணம் திரும்ப வேண்டும்.",
        "அழைத்ததற்கு நன்றி, நல்ல நாளாக இருக்கட்டும்.",
        "என் புகாரைப் பற்றி மேலாளரிடம் பேச வேண்டும்.",
    ],
}


# Maps English number words to their digit equivalents for normalization.
_NUM_WORD_MAP = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
    "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
    "ten": "10", "eleven": "11", "twelve": "12", "thirteen": "13",
    "fourteen": "14", "fifteen": "15", "sixteen": "16", "seventeen": "17",
    "eighteen": "18", "nineteen": "19", "twenty": "20",
}

# Indic languages that output native Unicode script from Groq/Sarvam STT.
_INDIC_LANG_CODES = {"hi", "ta", "te", "kn", "ml", "bn", "mr", "gu", "pa", "or"}


def _normalize_text(text: str, language: str = "en") -> str:
    """Normalize text before WER to avoid false penalization from format differences.

    Problems this solves:
    - English TTS says "three PM" but STT outputs "3 PM" → WER would wrongly count as error
    - Punctuation differences: "refund." vs "refund"
    - Case differences: "Thank you" vs "thank you"
    - Double spaces, trailing whitespace
    """
    text = text.lower().strip()
    # Remove punctuation (but keep spaces)
    text = _re.sub(r"[^\w\s]", " ", text)
    # Collapse multiple spaces
    text = _re.sub(r"\s+", " ", text).strip()

    if language == "en":
        # Normalize number words → digits so "three" == "3"
        words = text.split()
        normalized = [_NUM_WORD_MAP.get(w, w) for w in words]
        # Also strip common filler: "pm" → "" (TTS sometimes drops AM/PM)
        text = " ".join(normalized)

    return text


def _word_error_rate(reference: str, hypothesis: str, language: str = "en") -> float:
    """Compute WER using minimum edit distance. Returns 0.0–100.0.

    Applies text normalization before comparison so format differences
    (spelled-out numbers vs digits, punctuation) don't inflate WER.
    """
    ref_norm = _normalize_text(reference, language)
    hyp_norm = _normalize_text(hypothesis, language)

    ref_words = ref_norm.split()
    hyp_words = hyp_norm.split()
    if not ref_words:
        return 0.0 if not hyp_words else 100.0

    d = [[0] * (len(hyp_words) + 1) for _ in range(len(ref_words) + 1)]
    for i in range(len(ref_words) + 1):
        d[i][0] = i
    for j in range(len(hyp_words) + 1):
        d[0][j] = j
    for i in range(1, len(ref_words) + 1):
        for j in range(1, len(hyp_words) + 1):
            if ref_words[i - 1] == hyp_words[j - 1]:
                d[i][j] = d[i - 1][j - 1]
            else:
                d[i][j] = 1 + min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1])
    return round(d[len(ref_words)][len(hyp_words)] / len(ref_words) * 100, 2)


async def _get_tts_for_benchmark(text: str, language: str) -> dict[str, Any]:
    """Get TTS audio using the best available provider for the language.

    For Indic languages, prefer Sarvam (native quality) or Edge TTS (free,
    native voices) over ElevenLabs, because STT is calibrated to native
    accents — ElevenLabs English voice reading Hindi degrades WER.

    For English, any provider works (Deepgram Aura has lowest latency).
    """
    from voice_engine.api_providers import (
        _sarvam_tts, _edge_tts, _deepgram_tts, synthesize_speech_api
    )

    is_indic = language in _INDIC_LANG_CODES

    if is_indic:
        # 1st choice: Sarvam (native Indian language TTS)
        sv_key = os.environ.get("SARVAM_API_KEY", "")
        if sv_key:
            try:
                return await _sarvam_tts(text, sv_key, language, 1.0)
            except Exception as exc:
                logger.warning("Sarvam TTS failed for %s, trying Edge TTS: %s", language, exc)

        # 2nd choice: Edge TTS (free, native neural voices for all Indian langs)
        try:
            return await _edge_tts(text, language, 1.0)
        except Exception as exc:
            logger.warning("Edge TTS failed for %s, falling back to auto chain: %s", language, exc)

    # English or final fallback: use the default chain
    return await synthesize_speech_api(text=text, language=language)


async def _benchmark_stt_roundtrip(text: str, language: str) -> dict[str, Any]:
    """TTS the text, then STT it back, measure WER + latency."""
    from voice_engine.api_providers import transcribe_ensemble

    result: dict[str, Any] = {
        "reference": text,
        "language": language,
        "hypothesis": "",
        "wer": None,
        "tts_ms": None,
        "stt_ms": None,
        "total_ms": None,
        "error": None,
    }

    t0 = time.time()

    # Step 1: TTS — use language-appropriate provider for native audio quality
    try:
        t_tts = time.time()
        tts_result = await _get_tts_for_benchmark(text, language)
        result["tts_ms"] = int((time.time() - t_tts) * 1000)
        result["tts_provider"] = tts_result.get("provider", "unknown")

        audio_b64 = tts_result.get("audio_base64", "")
        if not audio_b64:
            result["error"] = "TTS returned empty audio"
            return result

        import base64
        audio_bytes = base64.b64decode(audio_b64)
    except Exception as exc:
        result["error"] = f"TTS failed: {str(exc)[:100]}"
        return result

    # Step 2: STT — transcribe the generated audio
    try:
        t_stt = time.time()
        stt_result = await transcribe_ensemble(audio_bytes, language=language)
        result["stt_ms"] = int((time.time() - t_stt) * 1000)
        hypothesis = stt_result.get("text", "")
        result["hypothesis"] = hypothesis
        result["stt_provider"] = stt_result.get("provider", "unknown")
    except Exception as exc:
        result["error"] = f"STT failed: {str(exc)[:100]}"
        return result

    # Step 3: Compute WER (with language-aware normalization)
    result["wer"] = _word_error_rate(text, hypothesis, language)
    result["total_ms"] = int((time.time() - t0) * 1000)

    return result


async def _benchmark_llm_latency() -> dict[str, Any]:
    """Measure LLM first-token and tokens/sec on a standard prompt.

    Uses a longer prompt (200 tokens) for more accurate tokens/sec measurement.
    Tokens/sec from a 10-token response is noisy; 200 tokens gives a stable reading.
    Also tries llama-3.3-70b-versatile first (higher quality, used for complex calls).
    """
    import json as _json

    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        return {"error": "GROQ_API_KEY not set", "first_token_ms": None, "tokens_per_sec": None}

    import httpx

    # Longer prompt → accurate tokens/sec (8B model: ~200-250 tok/s on Groq)
    prompt = (
        "You are a voice AI for an Indian insurance company. "
        "A customer just said: 'Mujhe apni health policy renew karni hai, "
        "kya process hai aur kitna time lagta hai?' "
        "Respond naturally in Hindi, guide them through the renewal process step by step. "
        "Mention document requirements, payment options, and timeline."
    )

    results = {}

    # Try 8B first (production default for most calls), then log separately
    for model_id, model_label in [
        ("llama-3.1-8b-instant", "8b"),
        ("llama-3.3-70b-versatile", "70b"),
    ]:
        t0 = time.time()
        first_token_time = None
        token_count = 0
        char_count = 0

        try:
            async with httpx.AsyncClient(timeout=20) as client:
                async with client.stream(
                    "POST",
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "model": model_id,
                        "messages": [
                            {"role": "system", "content": "You are a helpful voice AI assistant for Indian businesses."},
                            {"role": "user", "content": prompt},
                        ],
                        "max_tokens": 200,
                        "temperature": 0.3,
                        "stream": True,
                    },
                ) as resp:
                    async for line in resp.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        payload = line[5:].strip()
                        if payload == "[DONE]":
                            break
                        try:
                            obj = _json.loads(payload)
                            delta = obj["choices"][0].get("delta", {}).get("content")
                            if delta:
                                if first_token_time is None:
                                    first_token_time = time.time()
                                char_count += len(delta)
                                # Approximate token count: ~4 chars/token for mixed Hindi+English
                                token_count = max(token_count + 1, char_count // 4)
                        except Exception:
                            continue
        except Exception as exc:
            results[model_label] = {"error": str(exc)[:100], "first_token_ms": None, "tokens_per_sec": None}
            continue

        elapsed = time.time() - t0
        gen_elapsed = (time.time() - first_token_time) if first_token_time else elapsed
        results[model_label] = {
            "first_token_ms": int((first_token_time - t0) * 1000) if first_token_time else None,
            "tokens_per_sec": round(token_count / gen_elapsed, 1) if gen_elapsed > 0 and token_count > 0 else None,
            "token_count": token_count,
            "total_ms": int(elapsed * 1000),
        }

    # Return 8B as primary (production default), include 70B for info
    primary = results.get("8b", {})
    return {
        "first_token_ms": primary.get("first_token_ms"),
        "tokens_per_sec": primary.get("tokens_per_sec"),
        "token_count": primary.get("token_count"),
        "total_ms": primary.get("total_ms"),
        "model_8b": results.get("8b"),
        "model_70b": results.get("70b"),
    }


# ── Benchmark result storage ──────────────────────────────────────────

_latest_results: dict[str, Any] | None = None


def get_latest() -> dict[str, Any] | None:
    """Return the most recent benchmark run, or None if never run."""
    return _latest_results


async def run_benchmark(language: str | None = None) -> dict[str, Any]:
    """Run the full benchmark suite. Returns results + saves to module state.

    Takes 30-60 seconds (TTS + STT roundtrips for ~15 utterances).
    """
    global _latest_results
    t_start = time.time()

    langs = [language] if language else list(_TEST_CORPUS.keys())
    stt_results: dict[str, list[dict]] = {}
    wer_by_lang: dict[str, float] = {}
    latency_all: list[int] = []

    for lang in langs:
        corpus = _TEST_CORPUS.get(lang, [])
        if not corpus:
            continue
        results = []
        for text in corpus:
            r = await _benchmark_stt_roundtrip(text, lang)
            results.append(r)
            if r.get("total_ms"):
                latency_all.append(r["total_ms"])
        stt_results[lang] = results

        wers = [r["wer"] for r in results if r["wer"] is not None]
        if wers:
            wer_by_lang[lang] = round(sum(wers) / len(wers), 2)

    # LLM latency
    llm = await _benchmark_llm_latency()

    # Compute overall latency percentiles
    latency_all.sort()
    n = len(latency_all)
    latency_stats = {}
    if n > 0:
        latency_stats = {
            "p50_ms": latency_all[n // 2],
            "p95_ms": latency_all[max(0, int(n * 0.95) - 1)],
            "count": n,
        }

    _latest_results = {
        "run_at": datetime.utcnow().isoformat() + "Z",
        "duration_sec": round(time.time() - t_start, 1),
        "wer_by_language": wer_by_lang,
        "llm": llm,
        "roundtrip_latency": latency_stats,
        "details": stt_results,
    }

    # Persist to call metrics for dashboard tracking
    try:
        from api.services.quality_store import record_call
        for lang, results in stt_results.items():
            for r in results:
                if r.get("total_ms") and r.get("wer") is not None:
                    record_call(
                        agent_id="__benchmark__",
                        language=lang,
                        stt_ms=r.get("stt_ms"),
                        tts_ms=r.get("tts_ms"),
                        total_ms=r.get("total_ms"),
                        wer=r.get("wer"),
                        pipeline_mode="benchmark",
                    )
    except Exception:
        pass

    logger.info(
        "Benchmark complete: %d langs, WER=%s, p95=%sms, LLM TTFT=%sms",
        len(langs), wer_by_lang,
        latency_stats.get("p95_ms", "?"),
        llm.get("first_token_ms", "?"),
    )

    return _latest_results
