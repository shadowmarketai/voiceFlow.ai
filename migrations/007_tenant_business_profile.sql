-- ============================================================
-- 007 — Tenant Business Profile + tenant_contacts table
-- Run once against production DB before deploying this code.
-- Idempotent: uses IF NOT EXISTS / DO $$ ... $$ guards.
-- ============================================================

-- ── New columns on tenants ────────────────────────────────────

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS company_type        VARCHAR(60),
    ADD COLUMN IF NOT EXISTS gstin               VARCHAR(15),
    ADD COLUMN IF NOT EXISTS pan_number          VARCHAR(10),
    ADD COLUMN IF NOT EXISTS website_url         VARCHAR(500),
    ADD COLUMN IF NOT EXISTS owner_name          VARCHAR(200),
    ADD COLUMN IF NOT EXISTS owner_email         VARCHAR(255),
    ADD COLUMN IF NOT EXISTS owner_phone         VARCHAR(20),
    ADD COLUMN IF NOT EXISTS billing_email       VARCHAR(255),
    ADD COLUMN IF NOT EXISTS billing_address     TEXT,
    ADD COLUMN IF NOT EXISTS contract_start_date DATE,
    ADD COLUMN IF NOT EXISTS contract_end_date   DATE,
    ADD COLUMN IF NOT EXISTS monthly_billing_amount NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS payment_terms       VARCHAR(50),
    ADD COLUMN IF NOT EXISTS onboarding_status   VARCHAR(50) NOT NULL DEFAULT 'not_started',
    ADD COLUMN IF NOT EXISTS onboarding_notes    TEXT,
    ADD COLUMN IF NOT EXISTS go_live_date        DATE,
    ADD COLUMN IF NOT EXISTS tags                JSONB,
    ADD COLUMN IF NOT EXISTS internal_notes      TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenant_onboarding_status ON tenants(onboarding_status);
CREATE INDEX IF NOT EXISTS idx_tenant_contract_end      ON tenants(contract_end_date);
CREATE INDEX IF NOT EXISTS idx_tenant_gstin             ON tenants(gstin);

-- ── New table: tenant_contacts ────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_contacts (
    id           SERIAL PRIMARY KEY,
    tenant_id    INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name         VARCHAR(200) NOT NULL,
    email        VARCHAR(255),
    phone        VARCHAR(20),
    designation  VARCHAR(100),
    role         VARCHAR(50) NOT NULL DEFAULT 'general',
    is_primary   BOOLEAN NOT NULL DEFAULT FALSE,
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tc_tenant_id ON tenant_contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tc_role      ON tenant_contacts(role);

-- Comment columns for clarity
COMMENT ON COLUMN tenants.gstin          IS 'GST Identification Number (15 chars)';
COMMENT ON COLUMN tenants.company_type   IS 'Pvt Ltd, LLP, OPC, Partnership, Proprietorship, Public Ltd, NGO';
COMMENT ON COLUMN tenants.owner_name     IS 'Primary POC / Owner full name';
COMMENT ON COLUMN tenants.billing_email  IS 'Who receives invoices';
COMMENT ON COLUMN tenants.monthly_billing_amount IS 'Contracted MRR in default_currency';
COMMENT ON COLUMN tenants.onboarding_status IS 'not_started | in_progress | completed | churned';
COMMENT ON COLUMN tenants.internal_notes IS 'Internal notes — not visible to tenant';
COMMENT ON COLUMN tenant_contacts.role   IS 'owner | billing | technical | support | general';
