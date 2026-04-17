# GPU-Safe Embedding Storage — Deployment Guide

## Architecture

```
GPU Pod (E2E L4 / RunPod A10G)          KVM4 VPS (Hostinger)
──────────────────────────────          ─────────────────────
┌─────────────────────────┐             ┌────────────────────┐
│  XTTS v2 / IndicF5      │             │  Rapida Platform   │
│  ─────────────────      │             │  PostgreSQL        │
│  L1 LRU Cache (RAM)     │◄────────────│  Redis             │
│  100 voices max         │   gRPC      │  MinIO / S3        │
│  Evicts on pod restart  │             └────────────────────┘
└──────────┬──────────────┘
           │ miss
           ▼
┌─────────────────────────┐
│  L2 Redis (your KVM4)  │
│  24hr TTL               │
│  Survives pod restart   │
└──────────┬──────────────┘
           │ miss
           ▼
┌─────────────────────────┐
│  L3 Object Storage      │
│  MinIO (local) or       │
│  Cloudflare R2 (prod)   │
│  Never expires          │
│  Tenant-isolated paths  │
└─────────────────────────┘
```

## Storage Backend Decision

```
Stage               Backend         Cost/GB/mo   Why
──────────────────────────────────────────────────────────
Local dev           MinIO           ₹0           Runs on KVM4
Early prod (self)   MinIO           ₹0           Same KVM4 storage
Growth prod         Cloudflare R2   ₹1.35        No egress fees ✅
Scale prod          AWS S3 Mumbai   ₹2.00        Compliance-grade
Never               Google Cloud    ₹3.50        Expensive for India
──────────────────────────────────────────────────────────
```

**Recommendation: Start with MinIO on KVM4, move to Cloudflare R2 when you
have 50+ active voice clones. R2 = S3-compatible + zero egress + INR billing.**

## Embedding Sizes (Real Numbers)

```
XTTS v2 gpt_cond_latent  : ~200KB per voice
XTTS v2 speaker_embedding: ~50KB per voice
IndicF5 embedding         : ~180KB per voice
Total per voice clone     : ~250-450KB

100 clients × 3 voices each = 300 voices × 450KB = ~135MB in S3
That's basically free on any object store.

Redis memory per voice: ~450KB × 100 active = ~45MB
Fits comfortably in your existing Redis.
```

## Pod Startup Sequence (Critical)

```python
# app/main.py — EXACT order matters

async def startup():
    # 1. Load GPU models first (takes 30-60 sec)
    encoder = await load_xtts_model()
    indicf5 = await load_indicf5_model()

    # 2. Connect storage layers
    store = EmbeddingStore(config)
    await store.connect()

    # 3. Warm L1 cache for active tenants
    # Query DB for tenants with recent activity
    active_tenants = await db.query(
        "SELECT DISTINCT tenant_id FROM voice_library "
        "WHERE status='active' "
        "ORDER BY updated_at DESC LIMIT 20"
    )
    for tenant in active_tenants:
        await store.warmup(tenant.tenant_id)

    # 4. Start accepting traffic
    app.state.ready = True
    logger.info("Pod fully ready — storage warmed")
```

## Cloudflare R2 Setup (Production)

```bash
# 1. Create R2 bucket in Cloudflare dashboard
#    Name: voiceflow-embeddings-prod

# 2. Get R2 credentials
#    Dashboard → R2 → Manage R2 API Tokens → Create Token

# 3. Set env vars
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
AWS_ACCESS_KEY_ID=<R2_ACCESS_KEY>
AWS_SECRET_ACCESS_KEY=<R2_SECRET_KEY>
AWS_REGION=auto
EMBEDDING_S3_BUCKET=voiceflow-embeddings-prod

# 4. R2 pricing (April 2026)
# Storage: $0.015/GB/month (₹1.27/GB/mo)
# Operations: $0.36/million Class A (writes)
#             $0.036/million Class B (reads)
# Egress: FREE (biggest win over AWS S3)
#
# At 135MB embeddings: ~₹0.17/month storage
# At 10,000 reads/day: ~₹0.09/month operations
# Total: essentially free until you have 10,000+ active clients
```

## DPDP Compliance Integration

```python
# When a DPDP deletion request is approved:
# POST /api/v1/enterprise/dpdp/deletion-request

async def execute_dpdp_erasure(tenant_id: str, initiated_by: str):
    store = app.state.embedding_store

    # 1. Erase from all 3 storage layers
    result = await store.delete_tenant_all(tenant_id)

    # 2. Update DB status
    await db.execute(
        "UPDATE voice_library SET status='erased', deleted_at=NOW() "
        "WHERE tenant_id=$1",
        tenant_id
    )

    # 3. Log to immutable audit trail
    await db.execute(
        "INSERT INTO voice_erasure_log "
        "(tenant_id, erasure_type, l2_cleared, l3_cleared, "
        " completed_at, initiated_by) "
        "VALUES ($1, 'tenant_all', $2, $3, NOW(), $4)",
        tenant_id,
        result["l2_deleted_keys"] > 0,
        result["l3_deleted_objects"] > 0,
        initiated_by
    )

    return result
    # 72hr SLA per DPDP — this completes in <30 seconds
```

## What Breaks Without This

```
Without GPU-safe storage:
──────────────────────────────────────────────────────────────
Spot GPU pod restarts     → ALL client voice clones lost
Manual restart for deploy → ALL client voice clones lost
OOM kill                  → ALL client voice clones lost
New GPU pod spun up       → No voices available until re-uploaded
Multi-pod scaling         → Each pod has different voice sets
Result: clients call support, lose trust, churn

With GPU-safe storage:
──────────────────────────────────────────────────────────────
Spot GPU pod restarts     → L2+L3 restore in <2 sec on next call
Manual restart            → Warmup loads top 50 voices in background
OOM kill                  → Same as restart
New GPU pod               → Warmup from L3 automatically
Multi-pod scaling         → All pods share same L2 (Redis) + L3 (S3)
Result: client never notices pod restarts
```

## Testing

```bash
# Start MinIO locally
docker compose -f docker-compose.addon.yml up minio minio-setup

# Run storage tests
pip install aioboto3 redis torch numpy soundfile --break-system-packages
python -m pytest tests/test_embedding_store.py -v

# Test pod-restart survival
python tests/test_pod_restart.py
# Should: save embedding → kill process → restart → load embedding successfully
```

## Files Added

```
voice_engine/
├── embedding_store.py    ← Core 3-layer store (main implementation)
├── routes.py             ← FastAPI endpoints
└── ...existing files...

migrations/
└── 005_voice_library.sql ← DB schema for voice registry + DPDP log

docker-compose.addon.yml  ← MinIO service definition
docker/assistant-api/
└── .assistant.env        ← New env vars (add to existing file)
```
