"""
STT + TTS accuracy benchmark runner.

Runs a corpus of (audio_path, reference_text, language) samples through every
configured STT provider, computes WER per-language, then generates TTS audio
and scores it with a simple heuristic MOS. Results post to the quality API so
the Testing Dashboard picks them up.

Usage:
    python scripts/benchmark_accuracy.py                # uses data/benchmarks/manifest.json
    python scripts/benchmark_accuracy.py --dry-run      # no DB writes
    python scripts/benchmark_accuracy.py --only stt     # STT only
    python scripts/benchmark_accuracy.py --only tts     # TTS only
    python scripts/benchmark_accuracy.py --manifest path/to/custom.json

Manifest format (JSON):
    {
      "stt_samples": [
        {"audio": "data/benchmarks/hi_001.wav", "text": "नमस्ते कैसे हैं आप", "lang": "hi"},
        ...
      ],
      "tts_prompts": [
        {"text": "Hello, how can I help?", "lang": "en"},
        {"text": "नमस्ते, मैं आपकी कैसे मदद कर सकता हूँ", "lang": "hi"}
      ]
    }
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import statistics
import sys
import time
from pathlib import Path

# Allow running directly (`python scripts/benchmark_accuracy.py`)
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s — %(message)s")
log = logging.getLogger("benchmark")


# ── WER ─────────────────────────────────────────────────────────────

def _wer(ref: str, hyp: str) -> float:
    """Simple word-error-rate: Levenshtein distance / reference length."""
    r = ref.strip().split()
    h = hyp.strip().split()
    if not r:
        return 1.0 if h else 0.0
    # edit-distance matrix
    d = [[0] * (len(h) + 1) for _ in range(len(r) + 1)]
    for i in range(len(r) + 1):
        d[i][0] = i
    for j in range(len(h) + 1):
        d[0][j] = j
    for i in range(1, len(r) + 1):
        for j in range(1, len(h) + 1):
            cost = 0 if r[i - 1] == h[j - 1] else 1
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
    return d[-1][-1] / len(r)


# ── Heuristic MOS ───────────────────────────────────────────────────

def _heuristic_mos(audio_bytes: bytes) -> float:
    """
    Very rough MOS proxy: scores audio length + dynamic range.
    Replace with a trained MOS-Net model for real evaluation.
    """
    if not audio_bytes or len(audio_bytes) < 1024:
        return 1.0
    # Decode a handful of PCM samples to estimate energy stability.
    try:
        import wave
        import io
        import struct

        with wave.open(io.BytesIO(audio_bytes), "rb") as w:
            frames = w.readframes(min(w.getnframes(), 16000))
            samples = struct.unpack(f"{len(frames)//2}h", frames)
            rms = (sum(s * s for s in samples) / max(1, len(samples))) ** 0.5
            peak = max(abs(s) for s in samples) if samples else 0
            if peak == 0:
                return 2.0
            ratio = rms / peak
            # Good TTS has ratio ~0.25-0.4, natural dynamic range
            base = 4.8 - abs(ratio - 0.3) * 4
            return max(2.0, min(4.9, round(base, 2)))
    except Exception:
        # Non-WAV (mp3/opus) — fall back to a size heuristic
        return round(3.8 + min(1.0, len(audio_bytes) / 200_000), 2)


# ── Benchmark drivers ──────────────────────────────────────────────

async def _run_stt(samples: list[dict]) -> dict[str, dict]:
    from voice_engine.api_providers import (
        deepgram_stt, groq_whisper_stt, openai_whisper_stt, sarvam_stt,
    )

    providers = {
        "Deepgram": deepgram_stt,
        "Groq Whisper": groq_whisper_stt,
        "OpenAI Whisper": openai_whisper_stt,
        "Sarvam": sarvam_stt,
    }

    per_provider: dict[str, dict] = {}
    for pname, fn in providers.items():
        by_lang: dict[str, list[float]] = {}
        latencies: list[int] = []
        for s in samples:
            audio_path = Path(s["audio"])
            if not audio_path.exists():
                log.warning("Missing audio %s — skip", audio_path)
                continue
            audio = audio_path.read_bytes()
            t0 = time.perf_counter()
            try:
                hyp = await fn(audio, language=s.get("lang"))
            except Exception as exc:
                log.warning("%s failed on %s: %s", pname, audio_path.name, exc)
                continue
            latencies.append(int((time.perf_counter() - t0) * 1000))
            by_lang.setdefault(s["lang"], []).append(_wer(s["text"], hyp or ""))

        per_provider[pname] = {
            "wer_by_lang": {k: round(statistics.mean(v), 4) for k, v in by_lang.items()},
            "latency_p50_ms": int(statistics.median(latencies)) if latencies else None,
            "samples": sum(len(v) for v in by_lang.values()),
        }
    return per_provider


async def _run_tts(prompts: list[dict]) -> dict[str, dict]:
    from voice_engine.api_providers import (
        elevenlabs_tts, sarvam_tts, openai_tts, deepgram_tts, edge_tts as edge_tts_fn,
    )

    providers = {
        "ElevenLabs": elevenlabs_tts,
        "Sarvam": sarvam_tts,
        "OpenAI": openai_tts,
        "Deepgram Aura": deepgram_tts,
        "Edge TTS": edge_tts_fn,
    }

    per_provider: dict[str, dict] = {}
    for pname, fn in providers.items():
        mos_by_lang: dict[str, list[float]] = {}
        latencies: list[int] = []
        for p in prompts:
            t0 = time.perf_counter()
            try:
                audio = await fn(p["text"], language=p["lang"])
            except Exception as exc:
                log.warning("%s failed: %s", pname, exc)
                continue
            latencies.append(int((time.perf_counter() - t0) * 1000))
            mos = _heuristic_mos(audio if isinstance(audio, bytes) else b"")
            mos_by_lang.setdefault(p["lang"], []).append(mos)

        per_provider[pname] = {
            "mos_by_lang": {k: round(statistics.mean(v), 2) for k, v in mos_by_lang.items()},
            "latency_p50_ms": int(statistics.median(latencies)) if latencies else None,
            "samples": sum(len(v) for v in mos_by_lang.values()),
        }
    return per_provider


# ── Ingest to quality store ─────────────────────────────────────────

def _write_to_store(results: dict, dry_run: bool) -> None:
    if dry_run:
        log.info("dry-run — skipping DB writes")
        return
    try:
        from api.services.quality_store import record_call
    except Exception as exc:
        log.warning("Cannot import quality_store (%s) — skipping DB writes", exc)
        return

    # Use the best STT WER (lowest) per language as the call record's wer field.
    # Same for TTS MOS (highest).
    stt = results.get("stt", {})
    tts = results.get("tts", {})
    best_wer: dict[str, float] = {}
    for _prov, data in stt.items():
        for lang, wer in data.get("wer_by_lang", {}).items():
            if lang not in best_wer or wer < best_wer[lang]:
                best_wer[lang] = wer
    best_mos: dict[str, float] = {}
    for _prov, data in tts.items():
        for lang, mos in data.get("mos_by_lang", {}).items():
            if lang not in best_mos or mos > best_mos[lang]:
                best_mos[lang] = mos

    for lang, wer in best_wer.items():
        record_call(
            language=lang,
            wer=wer,
            tts_mos=best_mos.get(lang),
            agent_id="benchmark-run",
        )
        log.info("stored benchmark row for lang=%s wer=%.4f mos=%s",
                 lang, wer, best_mos.get(lang))


# ── CLI ─────────────────────────────────────────────────────────────

def _default_manifest() -> dict:
    return {
        "stt_samples": [],
        "tts_prompts": [
            {"text": "Hello, how can I help you today?", "lang": "en"},
            {"text": "नमस्ते, मैं आपकी कैसे मदद कर सकता हूँ", "lang": "hi"},
            {"text": "வணக்கம், நான் எப்படி உங்களுக்கு உதவ முடியும்", "lang": "ta"},
        ],
    }


async def _main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", default="data/benchmarks/manifest.json")
    ap.add_argument("--only", choices=["stt", "tts"], default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--output", default=None, help="Write JSON report to this path")
    args = ap.parse_args()

    manifest_path = Path(args.manifest)
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    else:
        log.warning("No manifest at %s — using default TTS-only prompts", manifest_path)
        manifest = _default_manifest()

    results: dict = {}
    if args.only != "tts" and manifest.get("stt_samples"):
        log.info("Running STT benchmark (%d samples)...", len(manifest["stt_samples"]))
        results["stt"] = await _run_stt(manifest["stt_samples"])
    if args.only != "stt" and manifest.get("tts_prompts"):
        log.info("Running TTS benchmark (%d prompts)...", len(manifest["tts_prompts"]))
        results["tts"] = await _run_tts(manifest["tts_prompts"])

    _write_to_store(results, args.dry_run)

    report = json.dumps(results, indent=2, ensure_ascii=False)
    if args.output:
        Path(args.output).write_text(report, encoding="utf-8")
        log.info("wrote report → %s", args.output)
    print(report)


if __name__ == "__main__":
    asyncio.run(_main())
