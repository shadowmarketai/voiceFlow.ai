#!/usr/bin/env python3
"""
IndicVoices Tamil Corpus Downloader
=====================================
Downloads conversational/extempore Tamil audio from AI4Bharat IndicVoices
dataset for Moshi fine-tuning.

Run this on your KVM4 or a dev machine with 50GB+ free disk space.
Takes ~2 hours to download 5,000 samples on a 100Mbps connection.

Usage:
    pip install datasets huggingface_hub soundfile numpy
    python scripts/download_indicvoices.py

    # Download more samples (default 5000):
    python scripts/download_indicvoices.py --samples 10000

    # Different language:
    python scripts/download_indicvoices.py --language hi --samples 3000

Output:
    corpus/<language>/indicvoices/<000001>.wav
    corpus/<language>/indicvoices/<000001>.json
    corpus/<language>/indicvoices/manifest.jsonl   ← ready for Moshi fine-tune

Target:
    80+ hours before first fine-tune (5000 samples ≈ 8-10hrs)
    Run monthly as more samples become available.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("download_indicvoices")


def parse_args():
    p = argparse.ArgumentParser(description="Download IndicVoices corpus for Moshi fine-tuning")
    p.add_argument("--language", default="ta",   help="Language code (ta, hi, te, kn, ml, bn, mr, gu)")
    p.add_argument("--samples",  type=int, default=5000, help="Max samples to download")
    p.add_argument("--output",   default="./corpus", help="Output directory root")
    p.add_argument("--min-snr",  type=float, default=18.0, help="Minimum SNR threshold (dB)")
    p.add_argument("--styles",   default="extempore,conversational",
                   help="Comma-separated speaking styles to keep")
    p.add_argument("--upload-minio", action="store_true",
                   help="Also upload to MinIO TRAINING_S3_BUCKET after download")
    return p.parse_args()


def check_deps():
    missing = []
    for pkg in ["datasets", "soundfile", "numpy"]:
        try:
            __import__(pkg)
        except ImportError:
            missing.append(pkg)
    if missing:
        logger.error("Missing packages: %s", ", ".join(missing))
        logger.error("Run: pip install %s", " ".join(missing))
        sys.exit(1)


def estimate_snr(audio_np) -> float:
    import numpy as np
    signal = np.mean(audio_np ** 2)
    noise  = float(np.percentile(np.abs(audio_np), 5) ** 2)
    return 10 * float(np.log10((signal + 1e-10) / (noise + 1e-10)))


def main():
    args = parse_args()
    check_deps()

    import numpy as np
    import soundfile as sf
    from datasets import load_dataset

    target_styles = set(s.strip() for s in args.styles.split(","))
    out_dir       = os.path.join(args.output, args.language, "indicvoices")
    os.makedirs(out_dir, exist_ok=True)

    logger.info(
        "Downloading IndicVoices [%s] — max %d samples, styles=%s",
        args.language, args.samples, target_styles,
    )

    try:
        dataset = load_dataset(
            "ai4bharat/IndicVoices",
            args.language,
            split="train",
            streaming=True,
            trust_remote_code=True,
        )
    except Exception as exc:
        logger.error("Failed to load dataset: %s", exc)
        logger.info("Trying alternate dataset path...")
        try:
            dataset = load_dataset(
                "ai4bharat/IndicVoices-R",
                args.language,
                split="train",
                streaming=True,
                trust_remote_code=True,
            )
        except Exception as exc2:
            logger.error("Dataset load failed: %s", exc2)
            sys.exit(1)

    manifest  = []
    count     = 0
    rejected  = 0
    t_start   = time.time()

    for sample in dataset:
        if count >= args.samples:
            break

        # Style filter
        style = sample.get("style") or sample.get("speaking_style") or ""
        if target_styles and style not in target_styles:
            rejected += 1
            continue

        # Audio quality check
        try:
            audio_arr = np.array(sample["audio"]["array"], dtype=np.float32)
            rate      = sample["audio"]["sampling_rate"]
        except (KeyError, TypeError):
            rejected += 1
            continue

        if len(audio_arr) < 2 * rate or len(audio_arr) > 30 * rate:
            rejected += 1
            continue

        snr = estimate_snr(audio_arr)
        if snr < args.min_snr:
            rejected += 1
            continue

        # Resample to 16kHz
        if rate != 16000:
            try:
                import resampy
                audio_arr = resampy.resample(audio_arr, rate, 16000)
            except ImportError:
                pass  # keep original rate

        # Save
        fname_base = f"{count:06d}"
        wav_path   = os.path.join(out_dir, f"{fname_base}.wav")
        meta_path  = os.path.join(out_dir, f"{fname_base}.json")

        sf.write(wav_path, audio_arr, 16000, subtype="PCM_16")

        meta = {
            "file":       fname_base,
            "transcript": sample.get("transcript", ""),
            "speaker_id": sample.get("speaker_id", ""),
            "district":   sample.get("district", "") or sample.get("location", ""),
            "gender":     sample.get("gender", ""),
            "style":      style,
            "duration":   len(audio_arr) / 16000,
            "snr_db":     round(snr, 1),
            "language":   args.language,
        }
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)

        manifest.append({
            "audio_path":   wav_path,
            "transcript":   meta["transcript"],
            "language":     args.language,
            "duration_sec": meta["duration"],
            "district":     meta["district"],
            "gender":       meta["gender"],
        })

        count += 1
        if count % 100 == 0:
            elapsed = time.time() - t_start
            hrs_so_far = sum(m["duration_sec"] for m in manifest) / 3600
            logger.info(
                "  Saved %d/%d samples (%.1f hrs, %.0fs elapsed, rejected %d)",
                count, args.samples, hrs_so_far, elapsed, rejected,
            )

    # Write manifest JSONL
    manifest_path = os.path.join(out_dir, "manifest.jsonl")
    with open(manifest_path, "w", encoding="utf-8") as f:
        for item in manifest:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    total_hours = sum(m["duration_sec"] for m in manifest) / 3600
    logger.info(
        "Done: %d samples saved (%.1f hrs) → %s",
        count, total_hours, out_dir,
    )
    logger.info("Manifest: %s (%d pairs)", manifest_path, len(manifest))
    logger.info("Rejected: %d samples (style filter + quality)", rejected)

    if total_hours < 10:
        logger.warning(
            "%.1f hrs < 10hr minimum for Moshi fine-tune. "
            "Run again with --samples %d or add more call recordings.",
            total_hours, args.samples * 3,
        )
    else:
        logger.info("Ready for Moshi fine-tune! Run the training script next.")

    # Upload to MinIO if requested
    if args.upload_minio:
        _upload_to_minio(out_dir, args.language, manifest)


def _upload_to_minio(local_dir: str, language: str, manifest: list):
    bucket   = os.getenv("TRAINING_S3_BUCKET", "voiceflow-training")
    endpoint = os.getenv("CORPUS_MINIO_ENDPOINT", "")
    ak       = os.getenv("CORPUS_MINIO_ACCESS_KEY", os.getenv("AWS_ACCESS_KEY_ID", ""))
    sk       = os.getenv("CORPUS_MINIO_SECRET_KEY", os.getenv("AWS_SECRET_ACCESS_KEY", ""))

    if not endpoint:
        logger.warning("CORPUS_MINIO_ENDPOINT not set — skipping MinIO upload")
        return

    try:
        import boto3
    except ImportError:
        logger.warning("boto3 not installed — skipping MinIO upload. Run: pip install boto3")
        return

    s3 = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=ak,
        aws_secret_access_key=sk,
    )

    try:
        s3.head_bucket(Bucket=bucket)
    except Exception:
        s3.create_bucket(Bucket=bucket)
        logger.info("Created MinIO bucket: %s", bucket)

    uploaded = 0
    for item in manifest:
        local_wav = item["audio_path"]
        key       = f"public-corpus/{language}/indicvoices/{os.path.basename(local_wav)}"
        try:
            s3.upload_file(local_wav, bucket, key)
            uploaded += 1
        except Exception as exc:
            logger.warning("Upload failed for %s: %s", local_wav, exc)

    logger.info("Uploaded %d/%d files to MinIO bucket %s", uploaded, len(manifest), bucket)


if __name__ == "__main__":
    main()
