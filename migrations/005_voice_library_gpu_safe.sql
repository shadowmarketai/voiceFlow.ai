-- ─────────────────────────────────────────────────────────────
-- migrations/005_voice_library_gpu_safe.sql
-- GPU-safe voice embedding registry
-- Tracks all voice_ids per tenant so DPDP erasure is complete
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS voice_library (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       VARCHAR(50)  NOT NULL,
    voice_id        VARCHAR(20)  NOT NULL,
    voice_name      VARCHAR(100) NOT NULL,

    -- Storage state flags (updated by EmbeddingStore)
    in_l3_storage   BOOLEAN DEFAULT FALSE,   -- persisted to S3/R2/MinIO
    in_l2_cache     BOOLEAN DEFAULT FALSE,   -- known to be in Redis
    storage_path    TEXT,                    -- S3 key for direct access

    -- Quality metadata
    duration_sec    FLOAT,
    snr_db          FLOAT,
    sample_filename TEXT,

    -- Lifecycle
    status          VARCHAR(20) DEFAULT 'active',  -- active / deleted / erased
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),
    deleted_at      TIMESTAMP,

    CONSTRAINT uq_tenant_voice UNIQUE (tenant_id, voice_id)
);

CREATE INDEX idx_voice_tenant   ON voice_library(tenant_id);
CREATE INDEX idx_voice_status   ON voice_library(tenant_id, status);

-- DPDP erasure audit trail
CREATE TABLE IF NOT EXISTS voice_erasure_log (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       VARCHAR(50) NOT NULL,
    voice_id        VARCHAR(20),             -- NULL = full tenant erasure
    erasure_type    VARCHAR(20),             -- 'single' | 'tenant_all'
    l1_cleared      BOOLEAN DEFAULT FALSE,
    l2_cleared      BOOLEAN DEFAULT FALSE,
    l3_cleared      BOOLEAN DEFAULT FALSE,
    requested_at    TIMESTAMP DEFAULT NOW(),
    completed_at    TIMESTAMP,
    initiated_by    VARCHAR(50)              -- user_id who triggered
);
