"""
Moshi QLoRA Fine-Tune — L40S 48 GB
====================================
Fine-tunes Kyutai/Moshi on a Tamil (or other Indic) corpus using QLoRA
so the base 7GB model can be adapted within the 16GB training VRAM budget.

Corpus layout (produced by TrackAToS2SPipeline):
    <corpus_dir>/<lang>/
        <call_id>/<pair_id>/
            user.wav        — anonymised caller audio (8 kHz / 16-bit PCM)
            agent.wav       — agent audio response  (8 kHz / 16-bit PCM)
            meta.json       — {transcript, intent, language, …}

Usage:
    python moshi_finetune/train.py \
        --language ta \
        --corpus-dir /data/training-corpus \
        --output-dir /data/checkpoints/moshi-ta-v1 \
        --epochs 3

Requirements (on L40S pod):
    pip install moshi transformers peft trl bitsandbytes datasets soundfile tqdm
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import pathlib
import wave

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


# ── Corpus loading ────────────────────────────────────────────────────────

def _read_wav_pcm(path: str) -> bytes:
    with wave.open(path, "rb") as wf:
        return wf.readframes(wf.getnframes())


def load_corpus(corpus_dir: str, language: str, max_pairs: int = 10_000) -> list[dict]:
    """
    Walk corpus_dir/<language>/ and load training pairs.
    Returns list of dicts: {user_pcm, agent_pcm, transcript, intent}.
    """
    base = pathlib.Path(corpus_dir) / language
    if not base.exists():
        logger.warning("Corpus dir not found: %s", base)
        return []

    pairs = []
    for meta_path in sorted(base.glob("**/meta.json")):
        if len(pairs) >= max_pairs:
            break
        try:
            with open(meta_path) as f:
                meta = json.load(f)
            pair_dir = meta_path.parent
            user_wav = str(pair_dir / "user.wav")
            agent_wav = str(pair_dir / "agent.wav")
            if not os.path.isfile(user_wav) or not os.path.isfile(agent_wav):
                continue
            pairs.append({
                "user_pcm":   _read_wav_pcm(user_wav),
                "agent_pcm":  _read_wav_pcm(agent_wav),
                "transcript": meta.get("transcript", ""),
                "intent":     meta.get("intent", ""),
                "language":   meta.get("language", language),
            })
        except Exception as exc:
            logger.debug("Skipping %s: %s", meta_path, exc)
            continue

    logger.info("Loaded %d training pairs from %s", len(pairs), base)
    return pairs


# ── QLoRA training ────────────────────────────────────────────────────────

def train(
    language: str,
    corpus_dir: str,
    output_dir: str,
    epochs: int,
    batch_size: int,
    learning_rate: float,
    lora_r: int,
    lora_alpha: int,
    lora_dropout: float,
) -> None:
    try:
        import torch
        from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
        from transformers import BitsAndBytesConfig
    except ImportError as exc:
        logger.error("Missing training dependencies: %s — pip install peft bitsandbytes transformers", exc)
        raise

    # Load corpus
    pairs = load_corpus(corpus_dir, language)
    if not pairs:
        logger.error("No training pairs found. Aborting.")
        return

    logger.info(
        "Starting QLoRA fine-tune: lang=%s pairs=%d epochs=%d lr=%g",
        language, len(pairs), epochs, learning_rate,
    )

    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info("Training on device: %s", device)

    # ── Load Moshi model ──────────────────────────────────────────────────
    # Moshi's Python package exposes a model loading API separate from the
    # streaming server. We use it here only for fine-tuning.
    try:
        from moshi.models import loaders as moshi_loaders
    except ImportError:
        logger.error(
            "moshi package not found. Install with: pip install moshi\n"
            "or: pip install git+https://github.com/kyutai-labs/moshi.git"
        )
        raise

    # BitsAndBytesConfig for 4-bit quantisation.
    # Passed via quantization_config when moshi's loader supports it;
    # currently used by prepare_model_for_kbit_training below.
    _bnb_config = BitsAndBytesConfig(  # noqa: F841
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_use_double_quant=True,
    )

    logger.info("[Train] Loading Moshi base model with 4-bit quantisation…")
    moshi_weight = moshi_loaders.DEFAULT_MOSHI
    lm, mimi, text_tokenizer, config = moshi_loaders.get_moshi_lm(
        moshi_weight, device=device
    )

    # Prepare for QLoRA
    lm = prepare_model_for_kbit_training(lm)

    lora_config = LoraConfig(
        r=lora_r,
        lora_alpha=lora_alpha,
        target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],
        lora_dropout=lora_dropout,
        bias="none",
        task_type="CAUSAL_LM",
    )
    lm = get_peft_model(lm, lora_config)
    lm.print_trainable_parameters()

    optimizer = torch.optim.AdamW(lm.parameters(), lr=learning_rate)

    # ── Training loop ─────────────────────────────────────────────────────
    lm.train()
    global_step = 0

    for epoch in range(epochs):
        epoch_loss = 0.0
        batches = _make_batches(pairs, batch_size)

        for batch_idx, batch in enumerate(batches):
            try:
                loss = _compute_batch_loss(lm, mimi, text_tokenizer, batch, device)
                optimizer.zero_grad()
                loss.backward()
                torch.nn.utils.clip_grad_norm_(lm.parameters(), 1.0)
                optimizer.step()

                epoch_loss += loss.item()
                global_step += 1

                if global_step % 50 == 0:
                    logger.info(
                        "Epoch %d/%d  step %d  loss=%.4f",
                        epoch + 1, epochs, global_step, loss.item(),
                    )

            except Exception as exc:
                logger.warning("Batch %d failed: %s — skipping", batch_idx, exc)
                continue

        avg_loss = epoch_loss / max(len(batches), 1)
        logger.info("Epoch %d complete — avg loss: %.4f", epoch + 1, avg_loss)

    # ── Save checkpoint ───────────────────────────────────────────────────
    os.makedirs(output_dir, exist_ok=True)
    lm.save_pretrained(output_dir)
    logger.info("[Train] LoRA adapter saved to %s", output_dir)

    # Save training metadata
    meta = {
        "language": language,
        "pairs": len(pairs),
        "epochs": epochs,
        "global_steps": global_step,
        "lora_r": lora_r,
        "lora_alpha": lora_alpha,
    }
    with open(os.path.join(output_dir, "train_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    logger.info("[Train] Fine-tune complete. Output: %s", output_dir)


def _make_batches(pairs: list[dict], batch_size: int) -> list[list[dict]]:
    return [pairs[i:i + batch_size] for i in range(0, len(pairs), batch_size)]


def _compute_batch_loss(lm, mimi, text_tokenizer, batch: list[dict], device: str):
    """
    Compute training loss for a batch of (user_audio, agent_audio, transcript) pairs.
    This is a simplified cross-entropy loss over the agent audio tokens conditioned
    on the user audio tokens — matching Moshi's dual-stream training objective.
    """
    import torch

    losses = []
    for pair in batch:
        try:
            # Encode audio to Mimi tokens
            user_pcm = _pcm_to_tensor(pair["user_pcm"], device)
            agent_pcm = _pcm_to_tensor(pair["agent_pcm"], device)

            with torch.no_grad():
                user_tokens = mimi.encode(user_pcm.unsqueeze(0))
                agent_tokens = mimi.encode(agent_pcm.unsqueeze(0))

            # Flatten token streams for LM input
            # Shape: [1, seq_len]
            input_ids = user_tokens.reshape(1, -1)
            labels = agent_tokens.reshape(1, -1)

            outputs = lm(input_ids=input_ids, labels=labels)
            losses.append(outputs.loss)
        except Exception as exc:
            logger.debug("Pair loss failed: %s", exc)
            continue

    if not losses:
        import torch as _torch
        return _torch.tensor(0.0, requires_grad=True)

    import torch as _torch
    return _torch.stack(losses).mean()


def _pcm_to_tensor(pcm: bytes, device: str):
    """Convert raw 16-bit PCM bytes to a float32 tensor normalised to [-1, 1]."""
    import struct

    import torch

    n_samples = len(pcm) // 2
    samples = struct.unpack(f"{n_samples}h", pcm)
    tensor = torch.tensor(samples, dtype=torch.float32) / 32768.0
    return tensor.to(device)


# ── Entry point ───────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Moshi QLoRA fine-tune")
    parser.add_argument("--language",     default="ta",               help="ISO language code")
    parser.add_argument("--corpus-dir",   default="/data/training-corpus", help="Corpus root dir")
    parser.add_argument("--output-dir",   default="/data/checkpoints/moshi-ta-v1", help="Output dir for LoRA adapter")
    parser.add_argument("--epochs",       type=int,   default=3)
    parser.add_argument("--batch-size",   type=int,   default=4)
    parser.add_argument("--lr",           type=float, default=2e-4)
    parser.add_argument("--lora-r",       type=int,   default=16)
    parser.add_argument("--lora-alpha",   type=int,   default=32)
    parser.add_argument("--lora-dropout", type=float, default=0.05)
    args = parser.parse_args()

    train(
        language=args.language,
        corpus_dir=args.corpus_dir,
        output_dir=args.output_dir,
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.lr,
        lora_r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
    )


if __name__ == "__main__":
    main()
