-- ─────────────────────────────────────────────────────────────────────────────
-- migrations/006_wallet_schema.sql
-- Prepaid wallet system — VoiceFlow AI
-- All monetary values stored in PAISE (₹1 = 100 paise) to avoid float errors.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Tenant wallets ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       VARCHAR(50)  NOT NULL UNIQUE,
    balance_paise   BIGINT       NOT NULL DEFAULT 0 CHECK (balance_paise >= 0),
    reserved_paise  BIGINT       NOT NULL DEFAULT 0,  -- pre-authorised, not yet settled
    currency        CHAR(3)      NOT NULL DEFAULT 'INR',
    auto_recharge   BOOLEAN      NOT NULL DEFAULT FALSE,
    auto_threshold_paise BIGINT  DEFAULT 50000,       -- auto-recharge when balance falls below this
    auto_amount_paise    BIGINT  DEFAULT 200000,      -- amount to recharge automatically
    low_balance_alerted  BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_wallets_tenant ON wallets (tenant_id);

-- ── Wallet transactions (immutable ledger) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id              BIGSERIAL    PRIMARY KEY,
    wallet_id       BIGINT       NOT NULL REFERENCES wallets (id) ON DELETE CASCADE,
    tenant_id       VARCHAR(50)  NOT NULL,
    txn_type        VARCHAR(30)  NOT NULL,  -- recharge | deduct | refund | hold | release | adjustment
    amount_paise    BIGINT       NOT NULL,  -- always positive; direction from txn_type
    balance_after_paise BIGINT   NOT NULL,
    reference_id    VARCHAR(100),           -- call_id / razorpay order_id / etc.
    description     TEXT,
    razorpay_payment_id VARCHAR(100),
    meta            JSONB        DEFAULT '{}',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_wallet_txns_wallet ON wallet_transactions (wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_wallet_txns_tenant ON wallet_transactions (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_wallet_txns_reference ON wallet_transactions (reference_id);

-- ── Per-call pre-authorization holds ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_holds (
    id              BIGSERIAL    PRIMARY KEY,
    wallet_id       BIGINT       NOT NULL REFERENCES wallets (id) ON DELETE CASCADE,
    tenant_id       VARCHAR(50)  NOT NULL,
    call_id         VARCHAR(100) NOT NULL UNIQUE,
    reserved_paise  BIGINT       NOT NULL,            -- amount held at call start
    settled_paise   BIGINT,                           -- actual cost; filled on settle
    pipeline_preset VARCHAR(50),                      -- which preset was used
    duration_sec    INTEGER,
    status          VARCHAR(20)  NOT NULL DEFAULT 'held',  -- held | settled | released | failed
    held_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    settled_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_call_holds_wallet ON call_holds (wallet_id, held_at DESC);
CREATE INDEX IF NOT EXISTS ix_call_holds_tenant ON call_holds (tenant_id, held_at DESC);
CREATE INDEX IF NOT EXISTS ix_call_holds_call   ON call_holds (call_id);

-- ── Razorpay recharges ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recharges (
    id              BIGSERIAL    PRIMARY KEY,
    tenant_id       VARCHAR(50)  NOT NULL,
    wallet_id       BIGINT       NOT NULL REFERENCES wallets (id) ON DELETE CASCADE,
    razorpay_order_id    VARCHAR(100) NOT NULL UNIQUE,
    razorpay_payment_id  VARCHAR(100),
    amount_paise    BIGINT       NOT NULL,
    gst_paise       BIGINT       NOT NULL DEFAULT 0,  -- 18% GST
    bonus_paise     BIGINT       NOT NULL DEFAULT 0,  -- bonus credits on higher packs
    total_credited_paise BIGINT,                      -- amount + bonus credited to wallet
    status          VARCHAR(20)  NOT NULL DEFAULT 'created',  -- created | paid | failed | refunded
    payment_method  VARCHAR(50),
    auto_triggered  BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    paid_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_recharges_tenant ON recharges (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_recharges_order  ON recharges (razorpay_order_id);

-- ── Recharge packs catalog ─────────────────────────────────────────────────
-- Upsert-safe: managed via application seed, not manual SQL.
CREATE TABLE IF NOT EXISTS recharge_packs (
    id              BIGSERIAL    PRIMARY KEY,
    pack_id         VARCHAR(30)  NOT NULL UNIQUE,     -- starter | growth | pro | enterprise
    label           VARCHAR(100) NOT NULL,
    amount_paise    BIGINT       NOT NULL,
    bonus_paise     BIGINT       NOT NULL DEFAULT 0,
    popular         BOOLEAN      NOT NULL DEFAULT FALSE,
    active          BOOLEAN      NOT NULL DEFAULT TRUE,
    sort_order      INTEGER      NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed default packs
INSERT INTO recharge_packs (pack_id, label, amount_paise, bonus_paise, popular, sort_order)
VALUES
    ('starter',    '₹500 Starter',      50000,    0,      FALSE, 1),
    ('growth',     '₹1,000 Growth',     100000,   5000,   FALSE, 2),
    ('pro',        '₹2,500 Pro',        250000,   25000,  TRUE,  3),
    ('enterprise', '₹5,000 Enterprise', 500000,   75000,  FALSE, 4)
ON CONFLICT (pack_id) DO NOTHING;

-- ── Low-balance alert tracking ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS low_balance_alerts (
    id              BIGSERIAL    PRIMARY KEY,
    tenant_id       VARCHAR(50)  NOT NULL,
    threshold_paise BIGINT       NOT NULL,
    balance_at_alert BIGINT      NOT NULL,
    channel         VARCHAR(30)  NOT NULL DEFAULT 'whatsapp',  -- whatsapp | sms | email
    sent_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_low_balance_tenant ON low_balance_alerts (tenant_id, sent_at DESC);

-- ── Auto-update updated_at ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_wallet_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wallet_updated_at ON wallets;
CREATE TRIGGER trg_wallet_updated_at
    BEFORE UPDATE ON wallets
    FOR EACH ROW EXECUTE FUNCTION update_wallet_updated_at();
