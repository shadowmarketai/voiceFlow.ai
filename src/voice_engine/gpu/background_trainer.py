"""
Background Trainer — QLoRA fine-tune scheduler on the L40S pod
==============================================================
Runs training as a subprocess (detached from the inference FastAPI process)
so GPU memory is not shared between inference and training.

Design:
  - Called by the fine-tune scheduler when corpus triggers a run
  - Checks free VRAM ≥ 16 GB before starting (inference must stay up)
  - Launches `moshi_finetune/train.py` as a detached subprocess
  - Returns status immediately; training runs asynchronously
  - Status can be polled via the `status()` call

Environment:
    TRAIN_SCRIPT_PATH   path to train.py (default: moshi_finetune/train.py relative to project root)
    TRAIN_MIN_FREE_VRAM minimum free VRAM in GB required before starting (default: 16)
"""

from __future__ import annotations

import asyncio
import logging
import os
import subprocess
import sys
import time
from dataclasses import dataclass, field

from voice_engine.gpu.model_loader import get_free_vram_gb

logger = logging.getLogger(__name__)

_MIN_FREE_VRAM_GB = float(os.getenv("TRAIN_MIN_FREE_VRAM", "16"))
_DEFAULT_SCRIPT = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "moshi_finetune", "train.py"
)
_TRAIN_SCRIPT = os.path.abspath(os.getenv("TRAIN_SCRIPT_PATH", _DEFAULT_SCRIPT))


@dataclass
class TrainingJob:
    job_id: str
    language: str
    status: str = "queued"        # queued | running | done | failed
    started_at: float = field(default_factory=time.time)
    finished_at: float | None = None
    pid: int | None = None
    error: str = ""


# In-memory job registry (single-job GPU machine)
_current_job: TrainingJob | None = None


def current_status() -> dict:
    """Return the current training job status as a dict."""
    if _current_job is None:
        return {"status": "idle"}
    return {
        "job_id":      _current_job.job_id,
        "language":    _current_job.language,
        "status":      _current_job.status,
        "started_at":  _current_job.started_at,
        "finished_at": _current_job.finished_at,
        "pid":         _current_job.pid,
        "error":       _current_job.error,
    }


async def launch_training(
    language: str = "ta",
    corpus_dir: str = "",
    output_dir: str = "",
    epochs: int = 3,
    job_id: str | None = None,
) -> dict:
    """
    Launch a QLoRA fine-tune training run.

    Returns immediately with {"status": "started", "job_id": ...}
    or {"status": "skipped", "reason": ...} if conditions aren't met.
    """
    global _current_job  # noqa: PLW0603

    # Already running?
    if _current_job and _current_job.status == "running":
        return {
            "status": "skipped",
            "reason": "training already running",
            "job_id": _current_job.job_id,
        }

    # VRAM check
    free_gb = get_free_vram_gb()
    if free_gb < _MIN_FREE_VRAM_GB:
        logger.warning(
            "[Trainer] Insufficient free VRAM: %.1f GB < %.1f GB required",
            free_gb, _MIN_FREE_VRAM_GB,
        )
        return {
            "status": "skipped",
            "reason": f"insufficient VRAM ({free_gb:.1f} GB free, need {_MIN_FREE_VRAM_GB} GB)",
        }

    if not os.path.isfile(_TRAIN_SCRIPT):
        return {
            "status": "error",
            "reason": f"train.py not found at {_TRAIN_SCRIPT}",
        }

    import uuid
    jid = job_id or str(uuid.uuid4())[:8]
    _current_job = TrainingJob(job_id=jid, language=language, status="running")

    # Build subprocess args
    cmd = [
        sys.executable, _TRAIN_SCRIPT,
        "--language", language,
        "--epochs", str(epochs),
    ]
    if corpus_dir:
        cmd += ["--corpus-dir", corpus_dir]
    if output_dir:
        cmd += ["--output-dir", output_dir]

    logger.info("[Trainer] Launching training: %s", " ".join(cmd))

    # Launch detached — let it run independently of inference server
    loop = asyncio.get_event_loop()
    proc = await loop.run_in_executor(
        None,
        lambda: subprocess.Popen(  # noqa: S603
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        ),
    )
    _current_job.pid = proc.pid
    logger.info("[Trainer] Training subprocess started with PID %d", proc.pid)

    # Monitor in background (don't block)
    asyncio.create_task(_monitor(proc, _current_job))

    return {"status": "started", "job_id": jid, "pid": proc.pid}


async def _monitor(proc: subprocess.Popen, job: TrainingJob) -> None:
    """Wait for the subprocess to finish and update the job status."""
    loop = asyncio.get_event_loop()
    returncode = await loop.run_in_executor(None, proc.wait)
    job.finished_at = time.time()
    duration = job.finished_at - job.started_at
    if returncode == 0:
        job.status = "done"
        logger.info("[Trainer] Training job %s completed in %.0fs", job.job_id, duration)
    else:
        job.status = "failed"
        job.error = f"exit code {returncode}"
        logger.error(
            "[Trainer] Training job %s FAILED (exit %d) after %.0fs",
            job.job_id, returncode, duration,
        )
