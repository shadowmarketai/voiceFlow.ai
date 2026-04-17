"""
MoshiFineTuneScheduler — Weekly Tamil S2S fine-tune trigger
============================================================

Checks MinIO/S3 corpus weekly. When new Tamil data exceeds the threshold
(default 10hrs), triggers a fine-tune job on the E2E GPU server.

Architecture:
  MoshiFineTuneScheduler.run()   — main loop (run via asyncio.create_task)
  CorpusStats.measure()          — counts hours in MinIO training bucket
  GpuJobClient.submit()          — SSH/HTTP trigger to E2E GPU server

Fine-tune trigger logic:
  1. Measure new Tamil hours since last fine-tune
  2. If >= MIN_NEW_HOURS_TO_TRIGGER → submit fine-tune job to E2E GPU
  3. Record trigger in MinIO manifest so we don't double-trigger
  4. Send WhatsApp status via n8n

Environment variables:
  TRAINING_S3_BUCKET           MinIO training bucket (default: voiceflow-training)
  CORPUS_MINIO_ENDPOINT        e.g. http://minio:9000
  CORPUS_MINIO_ACCESS_KEY
  CORPUS_MINIO_SECRET_KEY
  FINETUNE_MIN_NEW_HOURS       hours of new data to trigger fine-tune (default: 10)
  FINETUNE_CHECK_INTERVAL_H    hours between checks (default: 168 = weekly)
  E2E_GPU_API_URL              HTTP endpoint on E2E GPU for job submission
  E2E_GPU_API_KEY              auth key for GPU API
  N8N_BASE_URL                 n8n instance for WhatsApp status alerts
  N8N_WEBHOOK_KEY
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_BUCKET           = os.getenv("TRAINING_S3_BUCKET",       "voiceflow-training")
_ENDPOINT         = os.getenv("CORPUS_MINIO_ENDPOINT",    "")
_ACCESS_KEY       = os.getenv("CORPUS_MINIO_ACCESS_KEY",  os.getenv("AWS_ACCESS_KEY_ID",     ""))
_SECRET_KEY       = os.getenv("CORPUS_MINIO_SECRET_KEY",  os.getenv("AWS_SECRET_ACCESS_KEY", ""))
_MIN_NEW_HOURS    = float(os.getenv("FINETUNE_MIN_NEW_HOURS",      "10"))
_CHECK_INTERVAL_H = float(os.getenv("FINETUNE_CHECK_INTERVAL_H",  "168"))  # 1 week

_GPU_API_URL      = os.getenv("E2E_GPU_API_URL",  "")
_GPU_API_KEY      = os.getenv("E2E_GPU_API_KEY",  "")
_N8N_BASE         = os.getenv("N8N_BASE_URL",     "")
_N8N_KEY          = os.getenv("N8N_WEBHOOK_KEY",  "")

_MANIFEST_KEY     = "fine-tune-manifests/trigger_log.json"


# ─────────────────────────────────────────────────────────────────────────────
# Corpus measurement
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class CorpusMeasurement:
    language: str
    total_pairs: int
    total_hours: float
    new_pairs_since_last: int
    new_hours_since_last: float
    last_trigger_ts: float


class CorpusStats:
    """Reads MinIO corpus bucket and measures audio hours per language."""

    def __init__(self, s3_client=None):
        self._s3 = s3_client

    async def measure(self, language: str = "ta") -> CorpusMeasurement:
        """Count training pairs and estimate total hours for a language."""
        if self._s3 is None:
            return CorpusMeasurement(language, 0, 0.0, 0, 0.0, 0.0)

        last_trigger_ts = await self._get_last_trigger_ts(language)
        total_pairs     = 0
        total_secs      = 0.0
        new_pairs       = 0
        new_secs        = 0.0
        prefix          = f"training-corpus/{language}/"

        try:
            async with self._s3.client(
                "s3",
                endpoint_url=_ENDPOINT or None,
                aws_access_key_id=_ACCESS_KEY,
                aws_secret_access_key=_SECRET_KEY,
            ) as s3:
                paginator = s3.get_paginator("list_objects_v2")
                async for page in paginator.paginate(
                    Bucket=_BUCKET, Prefix=prefix
                ):
                    for obj in page.get("Contents", []):
                        if not obj["Key"].endswith("/meta.json"):
                            continue
                        total_pairs += 1
                        obj_ts = obj["LastModified"].timestamp()
                        # Estimate 5 seconds per pair (avg Tamil turn)
                        total_secs += 5.0
                        if obj_ts > last_trigger_ts:
                            new_pairs += 1
                            new_secs  += 5.0
        except Exception as exc:
            logger.warning("CorpusStats measure error: %s", exc)

        return CorpusMeasurement(
            language           = language,
            total_pairs        = total_pairs,
            total_hours        = total_secs / 3600,
            new_pairs_since_last = new_pairs,
            new_hours_since_last = new_secs / 3600,
            last_trigger_ts    = last_trigger_ts,
        )

    async def _get_last_trigger_ts(self, language: str) -> float:
        if self._s3 is None:
            return 0.0
        try:
            async with self._s3.client(
                "s3",
                endpoint_url=_ENDPOINT or None,
                aws_access_key_id=_ACCESS_KEY,
                aws_secret_access_key=_SECRET_KEY,
            ) as s3:
                obj = await s3.get_object(Bucket=_BUCKET, Key=_MANIFEST_KEY)
                body = await obj["Body"].read()
                manifest = json.loads(body)
                return float(manifest.get(language, {}).get("last_trigger_ts", 0))
        except Exception:
            return 0.0

    async def record_trigger(self, language: str) -> None:
        if self._s3 is None:
            return
        try:
            manifest: dict[str, Any] = {}
            async with self._s3.client(
                "s3",
                endpoint_url=_ENDPOINT or None,
                aws_access_key_id=_ACCESS_KEY,
                aws_secret_access_key=_SECRET_KEY,
            ) as s3:
                try:
                    obj  = await s3.get_object(Bucket=_BUCKET, Key=_MANIFEST_KEY)
                    body = await obj["Body"].read()
                    manifest = json.loads(body)
                except Exception:
                    pass
                manifest[language] = {
                    "last_trigger_ts": time.time(),
                    "triggered_at": datetime.now(timezone.utc).isoformat(),
                }
                await s3.put_object(
                    Bucket=_BUCKET,
                    Key=_MANIFEST_KEY,
                    Body=json.dumps(manifest, indent=2).encode(),
                    ContentType="application/json",
                )
        except Exception as exc:
            logger.warning("Failed to record fine-tune trigger: %s", exc)


# ─────────────────────────────────────────────────────────────────────────────
# GPU job client
# ─────────────────────────────────────────────────────────────────────────────

class GpuJobClient:
    """
    Submits a Moshi fine-tune job to the E2E GPU server.

    The GPU server should expose a simple HTTP endpoint:
        POST /jobs/finetune
        Authorization: Bearer <E2E_GPU_API_KEY>
        {
          "model": "moshi",
          "language": "ta",
          "corpus_path": "s3://voiceflow-training/training-corpus/ta/",
          "base_model": "kyutai/moshika-pytorch-bf16",
          "output_path": "s3://voiceflow-training/models/moshi-ta-<date>/"
        }

    Returns {"job_id": "...", "status": "queued"} on success.
    """

    async def submit(self, language: str, corpus_hours: float) -> dict:
        if not _GPU_API_URL:
            logger.info(
                "E2E_GPU_API_URL not set — fine-tune trigger logged but not submitted "
                "(set up GPU server first)"
            )
            return {"status": "skipped", "reason": "no_gpu_api_url"}

        date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
        payload  = {
            "model":        "moshi",
            "language":     language,
            "corpus_path":  f"s3://{_BUCKET}/training-corpus/{language}/",
            "base_model":   "kyutai/moshika-pytorch-bf16",
            "output_path":  f"s3://{_BUCKET}/models/moshi-{language}-{date_str}/",
            "corpus_hours": round(corpus_hours, 1),
            "triggered_at": datetime.now(timezone.utc).isoformat(),
        }
        headers = {}
        if _GPU_API_KEY:
            headers["Authorization"] = f"Bearer {_GPU_API_KEY}"

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{_GPU_API_URL.rstrip('/')}/jobs/finetune",
                json=payload,
                headers=headers,
            )
            resp.raise_for_status()
            return resp.json()


# ─────────────────────────────────────────────────────────────────────────────
# Scheduler
# ─────────────────────────────────────────────────────────────────────────────

class MoshiFineTuneScheduler:
    """
    Background task — runs weekly check, triggers fine-tune when corpus is ready.

    Start at app startup:
        scheduler = MoshiFineTuneScheduler(s3_client)
        asyncio.create_task(scheduler.run())

    The scheduler checks all configured languages every FINETUNE_CHECK_INTERVAL_H hours.
    """

    def __init__(self, s3_client=None, languages: list[str] | None = None):
        self._stats     = CorpusStats(s3_client)
        self._gpu       = GpuJobClient()
        self._languages = languages or ["ta", "hi"]
        self._running   = False

    async def run(self) -> None:
        self._running = True
        interval_s    = int(_CHECK_INTERVAL_H * 3600)
        logger.info(
            "MoshiFineTuneScheduler started — check every %.0fh, trigger at %.0fh new data",
            _CHECK_INTERVAL_H, _MIN_NEW_HOURS,
        )
        while self._running:
            await self._check_all()
            await asyncio.sleep(interval_s)

    def stop(self) -> None:
        self._running = False

    async def _check_all(self) -> None:
        for lang in self._languages:
            try:
                await self._check_language(lang)
            except Exception as exc:
                logger.error("Fine-tune scheduler error for %s: %s", lang, exc)

    async def _check_language(self, language: str) -> None:
        measurement = await self._stats.measure(language)
        logger.info(
            "Corpus check [%s]: total=%.1fh new=%.1fh (pairs=%d) — threshold=%.0fh",
            language,
            measurement.total_hours,
            measurement.new_hours_since_last,
            measurement.total_pairs,
            _MIN_NEW_HOURS,
        )

        if measurement.new_hours_since_last < _MIN_NEW_HOURS:
            logger.info(
                "[%s] %.1fh new data < %.0fh threshold — skipping fine-tune",
                language, measurement.new_hours_since_last, _MIN_NEW_HOURS,
            )
            return

        logger.info(
            "[%s] %.1fh new data >= %.0fh threshold — triggering fine-tune!",
            language, measurement.new_hours_since_last, _MIN_NEW_HOURS,
        )

        # Submit job
        job = await self._gpu.submit(language, measurement.new_hours_since_last)
        job_id = job.get("job_id", "local")
        logger.info("Fine-tune job submitted: %s (language=%s)", job_id, language)

        # Record trigger timestamp
        await self._stats.record_trigger(language)

        # Send WhatsApp status via n8n
        await self._send_whatsapp_alert(language, measurement, job_id)

    async def _send_whatsapp_alert(
        self,
        language: str,
        m: CorpusMeasurement,
        job_id: str,
    ) -> None:
        if not _N8N_BASE:
            return
        lang_name = {"ta": "Tamil", "hi": "Hindi", "te": "Telugu"}.get(language, language)
        msg = (
            f"VoiceFlow AI: {lang_name} fine-tune job triggered!\n"
            f"New data: {m.new_hours_since_last:.1f}hrs ({m.new_pairs_since_last} pairs)\n"
            f"Total corpus: {m.total_hours:.1f}hrs\n"
            f"Job ID: {job_id}"
        )
        try:
            headers = {}
            if _N8N_KEY:
                headers["Authorization"] = f"Bearer {_N8N_KEY}"
            async with httpx.AsyncClient(timeout=5) as client:
                await client.post(
                    f"{_N8N_BASE}/webhook/send-whatsapp",
                    json={"phone": "admin", "message": msg},
                    headers=headers,
                )
        except Exception as exc:
            logger.debug("Fine-tune WhatsApp alert failed: %s", exc)
