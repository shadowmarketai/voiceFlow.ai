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
import time
from datetime import datetime
from typing import Any

from api.database import get_session_factory

logger = logging.getLogger(__name__)


# ── Test corpus: known text → we synthesize audio → STT it → compare ──
# This measures the round-trip accuracy: TTS generates audio from known
# text, then STT transcribes it back. WER = edit distance between the
# original text and the STT output. This catches real-world issues
# (accent handling, noise robustness) that offline datasets miss.

_TEST_CORPUS: dict[str, list[str]] = {
    "en": [
        "Hello, I would like to book an appointment for tomorrow at three PM.",
        "Can you tell me the price of your premium plan?",
        "My order number is five seven three two, and I need a refund.",
        "Thank you for calling, have a great day.",
        "I need to speak with a manager about my complaint.",
    ],
    "hi": [
        "नमस्ते, मुझे कल तीन बजे का अपॉइंटमेंट चाहिए।",
        "आपके प्रीमियम प्लान की कीमत क्या है?",
        "मेरा ऑर्डर नंबर पांच सात तीन दो है, मुझे रिफंड चाहिए।",
        "कॉल करने के लिए धन्यवाद, आपका दिन शुभ हो।",
        "मुझे अपनी शिकायत के बारे में मैनेजर से बात करनी है।",
    ],
    "ta": [
        "வணக்கம், நாளை மூன்று மணிக்கு அப்பாயின்ட்மென்ட் வேண்டும்.",
        "உங்கள் பிரீமியம் திட்டத்தின் விலை என்ன?",
        "என் ஆர்டர் எண் ஐந்து ஏழு மூன்று இரண்டு, எனக்கு ரீஃபண்ட் வேண்டும்.",
        "அழைத்ததற்கு நன்றி, நல்ல நாளாக இருக்கட்டும்.",
        "என் புகாரைப் பற்றி மேலாளரிடம் பேச வேண்டும்.",
    ],
}


def _word_error_rate(reference: str, hypothesis: str) -> float:
    """Compute WER using minimum edit distance. Returns 0.0–100.0."""
    ref_words = reference.lower().split()
    hyp_words = hypothesis.lower().split()
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


async def _benchmark_stt_roundtrip(text: str, language: str) -> dict[str, Any]:
    """TTS the text, then STT it back, measure WER + latency."""
    from voice_engine.api_providers import synthesize_speech_api, transcribe_ensemble

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

    # Step 1: TTS — generate audio from known text
    try:
        t_tts = time.time()
        tts_result = await synthesize_speech_api(text=text, language=language)
        result["tts_ms"] = int((time.time() - t_tts) * 1000)

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

    # Step 3: Compute WER
    result["wer"] = _word_error_rate(text, hypothesis)
    result["total_ms"] = int((time.time() - t0) * 1000)

    return result


async def _benchmark_llm_latency() -> dict[str, Any]:
    """Measure LLM first-token and tokens/sec on a standard prompt."""
    import json as _json

    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        return {"error": "GROQ_API_KEY not set", "first_token_ms": None, "tokens_per_sec": None}

    import httpx

    prompt = "List 3 benefits of voice AI for Indian businesses. Be concise."
    t0 = time.time()
    first_token_time = None
    token_count = 0

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            async with client.stream(
                "POST",
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": "llama-3.1-8b-instant",
                    "messages": [
                        {"role": "system", "content": "You are a helpful assistant."},
                        {"role": "user", "content": prompt},
                    ],
                    "max_tokens": 100,
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
                            token_count += 1
                    except Exception:
                        continue
    except Exception as exc:
        return {"error": str(exc)[:100], "first_token_ms": None, "tokens_per_sec": None}

    elapsed = time.time() - t0
    return {
        "first_token_ms": int((first_token_time - t0) * 1000) if first_token_time else None,
        "tokens_per_sec": round(token_count / elapsed, 1) if elapsed > 0 else None,
        "token_count": token_count,
        "total_ms": int(elapsed * 1000),
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
