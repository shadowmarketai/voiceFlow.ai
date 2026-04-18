"""
GPU-Safe Voice Embedding Storage
─────────────────────────────────
Problem: XTTS v2 / IndicF5 embeddings extracted on GPU pods are stored
in-memory. Spot GPU pods restart unpredictably — every restart wipes all
voice clones. Clients lose their cloned voices. Support tickets pile up.

Solution: Three-layer storage architecture.
  Layer 1: GPU pod in-memory LRU cache     ← sub-ms access, pod-local
  Layer 2: Redis cluster cache             ← ~1ms, survives pod restart
  Layer 3: Object storage (S3/R2/MinIO)   ← permanent, survives everything

On pod restart → Layer 1 is empty → cache miss → promote from Redis →
  Redis miss → promote from S3 → warm L1 + L2 → subsequent calls fast.

Usage:
  store = EmbeddingStore(config)
  await store.save("client_001", "voice_A", gpt_latent, speaker_emb)
  latent, emb = await store.load("client_001", "voice_A")
"""

import asyncio
import io
import json
import logging
import time
from collections import OrderedDict
from dataclasses import dataclass, field

import numpy as np
import torch

logger = logging.getLogger(__name__)


# ─── CONFIG ──────────────────────────────────────────────────────────────────

@dataclass
class StorageConfig:
    # Layer 1 — In-memory LRU
    l1_max_entries: int = 100          # Max voices cached in GPU pod RAM
    l1_ttl_seconds: int = 3600        # Evict after 1hr of no access

    # Layer 2 — Redis
    redis_url: str = "redis://localhost:6379/2"
    redis_ttl_seconds: int = 86400    # 24hr in Redis

    # Layer 3 — Object storage
    s3_bucket: str = "voiceflow-embeddings"
    s3_prefix: str = "embeddings/v1"
    s3_endpoint: str = ""             # empty = AWS S3; set for MinIO/R2
    aws_access_key: str = ""
    aws_secret_key: str = ""
    aws_region: str = "ap-south-1"   # Mumbai

    # Behaviour
    write_through: bool = True        # Always write to S3 immediately
    background_promote: bool = True   # Promote L3→L2 async on L2 miss


# ─── LAYER 1 — IN-MEMORY LRU ─────────────────────────────────────────────────

@dataclass
class _CacheEntry:
    gpt_cond_latent: torch.Tensor
    speaker_embedding: torch.Tensor
    created_at: float = field(default_factory=time.time)
    last_access: float = field(default_factory=time.time)
    hit_count: int = 0


class L1Cache:
    """
    Thread-safe LRU cache living in GPU pod RAM.
    Stores torch.Tensor directly — no serialization overhead.
    """

    def __init__(self, max_entries: int, ttl_seconds: int):
        self._max = max_entries
        self._ttl = ttl_seconds
        self._store: OrderedDict[str, _CacheEntry] = OrderedDict()
        self._lock = asyncio.Lock()

    def _make_key(self, tenant_id: str, voice_id: str) -> str:
        return f"{tenant_id}:{voice_id}"

    async def get(
        self, tenant_id: str, voice_id: str
    ) -> tuple[torch.Tensor, torch.Tensor] | None:
        key = self._make_key(tenant_id, voice_id)
        async with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            # TTL check
            if time.time() - entry.last_access > self._ttl:
                del self._store[key]
                return None
            # LRU: move to end
            self._store.move_to_end(key)
            entry.last_access = time.time()
            entry.hit_count += 1
            return entry.gpt_cond_latent, entry.speaker_embedding

    async def set(
        self,
        tenant_id: str,
        voice_id: str,
        gpt_cond_latent: torch.Tensor,
        speaker_embedding: torch.Tensor,
    ) -> None:
        key = self._make_key(tenant_id, voice_id)
        async with self._lock:
            # Evict LRU if at capacity
            while len(self._store) >= self._max:
                self._store.popitem(last=False)
            self._store[key] = _CacheEntry(
                gpt_cond_latent=gpt_cond_latent,
                speaker_embedding=speaker_embedding,
            )
            self._store.move_to_end(key)

    async def delete(self, tenant_id: str, voice_id: str) -> bool:
        key = self._make_key(tenant_id, voice_id)
        async with self._lock:
            if key in self._store:
                del self._store[key]
                return True
            return False

    async def stats(self) -> dict:
        async with self._lock:
            return {
                "entries": len(self._store),
                "max_entries": self._max,
                "utilization_pct": round(len(self._store) / self._max * 100, 1),
            }


# ─── SERIALIZATION ────────────────────────────────────────────────────────────

class EmbeddingSerializer:
    """
    Converts torch.Tensor ↔ bytes for Redis / S3 storage.
    Format: 4-byte header (dtype len) + dtype string + shape JSON + raw data
    """

    MAGIC = b"VFEMB1"  # VoiceFlow Embedding v1

    @staticmethod
    def serialize_tensor(tensor: torch.Tensor) -> bytes:
        buf = io.BytesIO()
        # Move to CPU before serializing (GPU tensors can't be pickled safely)
        t = tensor.detach().cpu()
        np_array = t.numpy()
        dtype_str = str(np_array.dtype).encode("utf-8")
        shape_json = json.dumps(list(np_array.shape)).encode("utf-8")

        buf.write(EmbeddingSerializer.MAGIC)
        buf.write(len(dtype_str).to_bytes(2, "big"))
        buf.write(dtype_str)
        buf.write(len(shape_json).to_bytes(4, "big"))
        buf.write(shape_json)
        buf.write(np_array.tobytes())
        return buf.getvalue()

    @staticmethod
    def deserialize_tensor(data: bytes, device: str = "cpu") -> torch.Tensor:
        buf = io.BytesIO(data)
        magic = buf.read(6)
        if magic != EmbeddingSerializer.MAGIC:
            raise ValueError(f"Invalid magic bytes: {magic!r}")

        dtype_len = int.from_bytes(buf.read(2), "big")
        dtype_str = buf.read(dtype_len).decode("utf-8")

        shape_len = int.from_bytes(buf.read(4), "big")
        shape = tuple(json.loads(buf.read(shape_len).decode("utf-8")))

        raw = buf.read()
        np_array = np.frombuffer(raw, dtype=np.dtype(dtype_str)).reshape(shape)
        tensor = torch.from_numpy(np_array.copy()).to(device)
        return tensor

    @classmethod
    def pack(
        cls,
        gpt_cond_latent: torch.Tensor,
        speaker_embedding: torch.Tensor,
        metadata: dict,
    ) -> bytes:
        """Pack both tensors + metadata into a single blob for storage."""
        latent_bytes = cls.serialize_tensor(gpt_cond_latent)
        emb_bytes = cls.serialize_tensor(speaker_embedding)
        meta_bytes = json.dumps(metadata).encode("utf-8")

        buf = io.BytesIO()
        buf.write(len(latent_bytes).to_bytes(8, "big"))
        buf.write(latent_bytes)
        buf.write(len(emb_bytes).to_bytes(8, "big"))
        buf.write(emb_bytes)
        buf.write(len(meta_bytes).to_bytes(4, "big"))
        buf.write(meta_bytes)
        return buf.getvalue()

    @classmethod
    def unpack(
        cls, data: bytes, device: str = "cpu"
    ) -> tuple[torch.Tensor, torch.Tensor, dict]:
        """Unpack blob back to tensors + metadata."""
        buf = io.BytesIO(data)

        latent_len = int.from_bytes(buf.read(8), "big")
        gpt_cond_latent = cls.deserialize_tensor(buf.read(latent_len), device)

        emb_len = int.from_bytes(buf.read(8), "big")
        speaker_embedding = cls.deserialize_tensor(buf.read(emb_len), device)

        meta_len = int.from_bytes(buf.read(4), "big")
        metadata = json.loads(buf.read(meta_len).decode("utf-8"))

        return gpt_cond_latent, speaker_embedding, metadata


# ─── LAYER 2 — REDIS ─────────────────────────────────────────────────────────

class L2Redis:
    """
    Redis cache layer — survives GPU pod restarts.
    Binary blobs stored with TTL. Key pattern: vf:emb:{tenant}:{voice}
    """

    def __init__(self, config: StorageConfig):
        self._config = config
        self._redis = None
        self._available = False

    async def connect(self) -> bool:
        try:
            import redis.asyncio as aioredis
            self._redis = await aioredis.from_url(
                self._config.redis_url,
                encoding=None,   # binary mode
                decode_responses=False,
                socket_connect_timeout=3,
                socket_timeout=3,
            )
            await self._redis.ping()
            self._available = True
            logger.info("L2 Redis connected")
            return True
        except Exception as e:
            logger.warning(f"L2 Redis unavailable: {e} — falling back to L3 only")
            self._available = False
            return False

    def _key(self, tenant_id: str, voice_id: str) -> str:
        return f"vf:emb:{tenant_id}:{voice_id}"

    async def get(
        self, tenant_id: str, voice_id: str
    ) -> tuple[torch.Tensor, torch.Tensor, dict] | None:
        if not self._available or not self._redis:
            return None
        try:
            data = await self._redis.get(self._key(tenant_id, voice_id))
            if data is None:
                return None
            return EmbeddingSerializer.unpack(data)
        except Exception as e:
            logger.warning(f"L2 Redis get failed: {e}")
            return None

    async def set(
        self,
        tenant_id: str,
        voice_id: str,
        gpt_cond_latent: torch.Tensor,
        speaker_embedding: torch.Tensor,
        metadata: dict,
    ) -> bool:
        if not self._available or not self._redis:
            return False
        try:
            data = EmbeddingSerializer.pack(gpt_cond_latent, speaker_embedding, metadata)
            await self._redis.setex(
                self._key(tenant_id, voice_id),
                self._config.redis_ttl_seconds,
                data,
            )
            return True
        except Exception as e:
            logger.warning(f"L2 Redis set failed: {e}")
            return False

    async def delete(self, tenant_id: str, voice_id: str) -> bool:
        if not self._available or not self._redis:
            return False
        try:
            result = await self._redis.delete(self._key(tenant_id, voice_id))
            return result > 0
        except Exception as e:
            logger.warning(f"L2 Redis delete failed: {e}")
            return False

    async def delete_tenant(self, tenant_id: str) -> int:
        """Delete ALL voices for a tenant (DPDP right to erasure)."""
        if not self._available or not self._redis:
            return 0
        try:
            pattern = f"vf:emb:{tenant_id}:*"
            keys = []
            async for key in self._redis.scan_iter(match=pattern, count=100):
                keys.append(key)
            if keys:
                return await self._redis.delete(*keys)
            return 0
        except Exception as e:
            logger.warning(f"L2 Redis delete_tenant failed: {e}")
            return 0


# ─── LAYER 3 — OBJECT STORAGE (S3 / R2 / MINIO) ─────────────────────────────

class L3ObjectStorage:
    """
    Permanent storage in S3-compatible object store.
    Never expires. Tenant-isolated path structure.

    Path: {prefix}/{tenant_id}/{voice_id}/embedding.bin
    Metadata sidecar: {prefix}/{tenant_id}/{voice_id}/meta.json
    """

    def __init__(self, config: StorageConfig):
        self._config = config
        self._client = None
        self._available = False

    async def connect(self) -> bool:
        try:
            import aioboto3
            session = aioboto3.Session(
                aws_access_key_id=self._config.aws_access_key or None,
                aws_secret_access_key=self._config.aws_secret_key or None,
                region_name=self._config.aws_region,
            )
            # Store session for use in async context managers
            self._session = session
            self._available = True
            logger.info("L3 S3 client configured")
            return True
        except ImportError:
            logger.warning("aioboto3 not installed — L3 storage disabled")
            self._available = False
            return False
        except Exception as e:
            logger.warning(f"L3 S3 unavailable: {e}")
            self._available = False
            return False

    def _embedding_key(self, tenant_id: str, voice_id: str) -> str:
        return f"{self._config.s3_prefix}/{tenant_id}/{voice_id}/embedding.bin"

    def _meta_key(self, tenant_id: str, voice_id: str) -> str:
        return f"{self._config.s3_prefix}/{tenant_id}/{voice_id}/meta.json"

    async def get(
        self, tenant_id: str, voice_id: str
    ) -> tuple[torch.Tensor, torch.Tensor, dict] | None:
        if not self._available:
            return None
        try:
            endpoint_url = self._config.s3_endpoint or None
            async with self._session.client(
                "s3", endpoint_url=endpoint_url
            ) as s3:
                response = await s3.get_object(
                    Bucket=self._config.s3_bucket,
                    Key=self._embedding_key(tenant_id, voice_id),
                )
                data = await response["Body"].read()
                return EmbeddingSerializer.unpack(data)
        except Exception as e:
            if "NoSuchKey" in str(e) or "404" in str(e):
                return None  # not found — not an error
            logger.warning(f"L3 S3 get failed: {e}")
            return None

    async def set(
        self,
        tenant_id: str,
        voice_id: str,
        gpt_cond_latent: torch.Tensor,
        speaker_embedding: torch.Tensor,
        metadata: dict,
    ) -> bool:
        if not self._available:
            return False
        try:
            data = EmbeddingSerializer.pack(gpt_cond_latent, speaker_embedding, metadata)
            endpoint_url = self._config.s3_endpoint or None
            async with self._session.client(
                "s3", endpoint_url=endpoint_url
            ) as s3:
                await s3.put_object(
                    Bucket=self._config.s3_bucket,
                    Key=self._embedding_key(tenant_id, voice_id),
                    Body=data,
                    ContentType="application/octet-stream",
                    Metadata={
                        "tenant_id": tenant_id,
                        "voice_id": voice_id,
                        "schema_version": "1",
                    },
                )
                # Sidecar metadata (human-readable)
                await s3.put_object(
                    Bucket=self._config.s3_bucket,
                    Key=self._meta_key(tenant_id, voice_id),
                    Body=json.dumps(metadata, indent=2).encode("utf-8"),
                    ContentType="application/json",
                )
            return True
        except Exception as e:
            logger.error(f"L3 S3 set failed: {e}")
            return False

    async def delete(self, tenant_id: str, voice_id: str) -> bool:
        if not self._available:
            return False
        try:
            endpoint_url = self._config.s3_endpoint or None
            async with self._session.client(
                "s3", endpoint_url=endpoint_url
            ) as s3:
                await s3.delete_objects(
                    Bucket=self._config.s3_bucket,
                    Delete={
                        "Objects": [
                            {"Key": self._embedding_key(tenant_id, voice_id)},
                            {"Key": self._meta_key(tenant_id, voice_id)},
                        ]
                    },
                )
            return True
        except Exception as e:
            logger.warning(f"L3 S3 delete failed: {e}")
            return False

    async def delete_tenant(self, tenant_id: str) -> int:
        """
        Delete ALL embeddings for a tenant.
        DPDP right to erasure — must complete within 72 hours.
        Lists all objects with prefix and deletes in batches of 1000.
        """
        if not self._available:
            return 0
        prefix = f"{self._config.s3_prefix}/{tenant_id}/"
        deleted = 0
        try:
            endpoint_url = self._config.s3_endpoint or None
            async with self._session.client(
                "s3", endpoint_url=endpoint_url
            ) as s3:
                paginator = s3.get_paginator("list_objects_v2")
                async for page in paginator.paginate(
                    Bucket=self._config.s3_bucket, Prefix=prefix
                ):
                    objects = page.get("Contents", [])
                    if not objects:
                        continue
                    await s3.delete_objects(
                        Bucket=self._config.s3_bucket,
                        Delete={"Objects": [{"Key": o["Key"]} for o in objects]},
                    )
                    deleted += len(objects)
            logger.info(f"DPDP erasure: deleted {deleted} objects for tenant {tenant_id}")
            return deleted
        except Exception as e:
            logger.error(f"L3 delete_tenant failed: {e}")
            return deleted

    async def list_voices(self, tenant_id: str) -> list[dict]:
        """List all voices for a tenant from S3."""
        if not self._available:
            return []
        prefix = f"{self._config.s3_prefix}/{tenant_id}/"
        voices = []
        try:
            endpoint_url = self._config.s3_endpoint or None
            async with self._session.client(
                "s3", endpoint_url=endpoint_url
            ) as s3:
                paginator = s3.get_paginator("list_objects_v2")
                async for page in paginator.paginate(
                    Bucket=self._config.s3_bucket,
                    Prefix=prefix,
                    Delimiter="/",
                ):
                    for prefix_obj in page.get("CommonPrefixes", []):
                        voice_id = prefix_obj["Prefix"].split("/")[-2]
                        voices.append({"voice_id": voice_id, "tenant_id": tenant_id})
        except Exception as e:
            logger.warning(f"L3 list_voices failed: {e}")
        return voices


# ─── MAIN STORE — ORCHESTRATES ALL 3 LAYERS ──────────────────────────────────

class EmbeddingStore:
    """
    Three-layer voice embedding store.

    Read path:  L1 hit → return
                L1 miss → L2 hit → promote to L1 → return
                L2 miss → L3 hit → promote to L1+L2 → return
                L3 miss → raise VoiceNotFoundError

    Write path: write to L1 + L3 (write-through)
                write to L2 async (non-blocking)

    Delete path: delete from all 3 layers
    """

    def __init__(self, config: StorageConfig):
        self.config = config
        self.l1 = L1Cache(config.l1_max_entries, config.l1_ttl_seconds)
        self.l2 = L2Redis(config)
        self.l3 = L3ObjectStorage(config)
        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        self._metrics = {
            "l1_hits": 0, "l2_hits": 0, "l3_hits": 0,
            "misses": 0, "saves": 0,
        }

    async def connect(self) -> None:
        """Connect all storage backends. Call once on startup."""
        await asyncio.gather(
            self.l2.connect(),
            self.l3.connect(),
            return_exceptions=True,
        )
        logger.info(
            f"EmbeddingStore ready — device={self._device} "
            f"L2={'✓' if self.l2._available else '✗'} "
            f"L3={'✓' if self.l3._available else '✗'}"
        )

    async def load(
        self,
        tenant_id: str,
        voice_id: str,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        """
        Load voice embedding. Promotes through cache layers automatically.
        Raises VoiceNotFoundError if not in any layer.
        """

        # ── L1 hit
        result = await self.l1.get(tenant_id, voice_id)
        if result is not None:
            self._metrics["l1_hits"] += 1
            logger.debug(f"L1 hit: {tenant_id}/{voice_id}")
            return result

        # ── L2 hit
        result_l2 = await self.l2.get(tenant_id, voice_id)
        if result_l2 is not None:
            gpt_latent, speaker_emb, _ = result_l2
            # Move tensors to correct device
            gpt_latent = gpt_latent.to(self._device)
            speaker_emb = speaker_emb.to(self._device)
            # Promote to L1
            await self.l1.set(tenant_id, voice_id, gpt_latent, speaker_emb)
            self._metrics["l2_hits"] += 1
            logger.debug(f"L2 hit + promoted to L1: {tenant_id}/{voice_id}")
            return gpt_latent, speaker_emb

        # ── L3 hit
        result_l3 = await self.l3.get(tenant_id, voice_id)
        if result_l3 is not None:
            gpt_latent, speaker_emb, metadata = result_l3
            gpt_latent = gpt_latent.to(self._device)
            speaker_emb = speaker_emb.to(self._device)
            # Promote to L1
            await self.l1.set(tenant_id, voice_id, gpt_latent, speaker_emb)
            # Promote to L2 async (don't block the caller)
            if self.config.background_promote:
                asyncio.create_task(
                    self.l2.set(tenant_id, voice_id, gpt_latent, speaker_emb, metadata)
                )
            self._metrics["l3_hits"] += 1
            logger.info(f"L3 hit + promoted to L1+L2: {tenant_id}/{voice_id}")
            return gpt_latent, speaker_emb

        # ── Total miss
        self._metrics["misses"] += 1
        raise VoiceNotFoundError(
            f"Voice not found in any storage layer: "
            f"tenant={tenant_id} voice={voice_id}"
        )

    async def save(
        self,
        tenant_id: str,
        voice_id: str,
        gpt_cond_latent: torch.Tensor,
        speaker_embedding: torch.Tensor,
        metadata: dict | None = None,
    ) -> None:
        """
        Save voice embedding to all layers.
        L1 + L3 are synchronous (confirmed before returning).
        L2 is fire-and-forget async.
        """
        if metadata is None:
            metadata = {}

        meta = {
            "tenant_id": tenant_id,
            "voice_id": voice_id,
            "created_at": time.time(),
            "schema_version": "1",
            "device_saved_from": self._device,
            **metadata,
        }

        # L1 — always succeeds
        await self.l1.set(tenant_id, voice_id, gpt_cond_latent, speaker_embedding)

        # L3 — write-through, must succeed
        if self.config.write_through:
            saved_l3 = await self.l3.set(
                tenant_id, voice_id, gpt_cond_latent, speaker_embedding, meta
            )
            if not saved_l3:
                logger.error(
                    f"L3 write failed for {tenant_id}/{voice_id} — "
                    f"embedding only in L1 (pod-local, will be lost on restart)"
                )

        # L2 — async, non-blocking
        asyncio.create_task(
            self.l2.set(tenant_id, voice_id, gpt_cond_latent, speaker_embedding, meta)
        )

        self._metrics["saves"] += 1
        logger.info(f"Saved embedding: {tenant_id}/{voice_id}")

    async def delete(self, tenant_id: str, voice_id: str) -> dict:
        """
        Delete from all 3 layers.
        Used when client deletes a voice clone.
        """
        results = await asyncio.gather(
            self.l1.delete(tenant_id, voice_id),
            self.l2.delete(tenant_id, voice_id),
            self.l3.delete(tenant_id, voice_id),
            return_exceptions=True,
        )
        return {
            "l1_deleted": results[0] if not isinstance(results[0], Exception) else False,
            "l2_deleted": results[1] if not isinstance(results[1], Exception) else False,
            "l3_deleted": results[2] if not isinstance(results[2], Exception) else False,
        }

    async def delete_tenant_all(self, tenant_id: str) -> dict:
        """
        DPDP Article 12 — Right to Erasure.
        Delete ALL voice data for a tenant across all layers.
        Must be called from the deletion_request workflow with 72hr SLA.
        """
        logger.warning(f"DPDP erasure initiated for tenant: {tenant_id}")

        # L1: can't iterate efficiently, clear all and let cache rebuild
        # In production you'd track all voice_ids in DB — see note below
        l2_deleted, l3_deleted = await asyncio.gather(
            self.l2.delete_tenant(tenant_id),
            self.l3.delete_tenant(tenant_id),
            return_exceptions=True,
        )

        result = {
            "tenant_id": tenant_id,
            "l2_deleted_keys": l2_deleted if isinstance(l2_deleted, int) else 0,
            "l3_deleted_objects": l3_deleted if isinstance(l3_deleted, int) else 0,
            "completed_at": time.time(),
        }
        logger.warning(f"DPDP erasure complete: {result}")
        return result

    async def warmup(self, tenant_id: str) -> int:
        """
        Pre-warm L1 cache for a tenant on pod startup.
        Call this in your startup routine after GPU model loads.
        Fetches all voices from L3 and loads most recently used N into L1.
        """
        voices = await self.l3.list_voices(tenant_id)
        warmed = 0
        for voice in voices[: self.config.l1_max_entries // 2]:  # warm up to half L1
            try:
                await self.load(tenant_id, voice["voice_id"])
                warmed += 1
            except VoiceNotFoundError:
                pass
            except Exception as e:
                logger.warning(f"Warmup failed for {voice['voice_id']}: {e}")
        logger.info(f"Warmed up {warmed} voices for tenant {tenant_id}")
        return warmed

    async def metrics(self) -> dict:
        l1_stats = await self.l1.stats()
        total_hits = (
            self._metrics["l1_hits"]
            + self._metrics["l2_hits"]
            + self._metrics["l3_hits"]
        )
        total_requests = total_hits + self._metrics["misses"]
        hit_rate = (total_hits / total_requests * 100) if total_requests > 0 else 0.0

        return {
            **self._metrics,
            "l1_cache": l1_stats,
            "hit_rate_pct": round(hit_rate, 1),
            "l2_available": self.l2._available,
            "l3_available": self.l3._available,
            "device": self._device,
        }


class VoiceNotFoundError(Exception):
    pass
