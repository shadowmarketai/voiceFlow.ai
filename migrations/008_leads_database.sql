-- ============================================
-- VoiceFlow AI — Leads Database Schema
-- Database: shadowmarket_leads (port 5433)
-- Idempotent — safe to re-run
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ══════════════════════════════════════════════
-- 1. LEADS (core table)
-- ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS leads (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           VARCHAR(255) NOT NULL,

    -- Identity
    name                VARCHAR(200),
    email               VARCHAR(200),
    phone               VARCHAR(20),
    phone_country       VARCHAR(2),

    -- Business context
    business_name       VARCHAR(200),
    business_type       VARCHAR(100),
    business_size       VARCHAR(50),
    location_city       VARCHAR(100),
    location_state      VARCHAR(100),
    location_country    VARCHAR(2),

    -- Source attribution
    source              VARCHAR(50) NOT NULL DEFAULT 'manual',
    source_campaign     VARCHAR(200),
    source_medium       VARCHAR(50),
    referrer_url        TEXT,
    utm_source          VARCHAR(100),
    utm_medium          VARCHAR(100),
    utm_campaign        VARCHAR(100),

    -- Qualification
    intent              VARCHAR(100),
    budget_range        VARCHAR(50),
    timeline            VARCHAR(50),
    lead_score          INTEGER DEFAULT 0,
    qualification       VARCHAR(20) DEFAULT 'cold',

    -- Status
    status              VARCHAR(30) DEFAULT 'new',
    assigned_to         VARCHAR(100),

    -- Conversion link (soft FK to app DB)
    converted_user_id   VARCHAR(255),
    converted_at        TIMESTAMPTZ,
    deal_value          NUMERIC(12,2),

    -- Consent (DPDP / GDPR)
    consent_given       BOOLEAN DEFAULT FALSE,
    consent_source      VARCHAR(100),
    consent_at          TIMESTAMPTZ,
    marketing_optin     BOOLEAN DEFAULT FALSE,

    -- Lifecycle
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    last_contacted_at   TIMESTAMPTZ,
    next_followup_at    TIMESTAMPTZ,

    -- Soft delete
    deleted_at          TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_tenant_status ON leads(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_source_campaign ON leads(tenant_id, source, source_campaign);
CREATE INDEX IF NOT EXISTS idx_leads_followup ON leads(next_followup_at)
    WHERE status NOT IN ('converted','lost');

-- Dedup: one phone per tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_tenant_phone
    ON leads(tenant_id, phone) WHERE phone IS NOT NULL AND deleted_at IS NULL;


-- ══════════════════════════════════════════════
-- 2. LEAD INTERACTIONS
-- ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lead_interactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id             UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    channel             VARCHAR(50) NOT NULL,
    direction           VARCHAR(10) DEFAULT 'inbound',
    content             TEXT,
    metadata_json       JSONB,
    sentiment           VARCHAR(20),
    intent_detected     VARCHAR(100),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interactions_lead ON lead_interactions(lead_id, created_at DESC);


-- ══════════════════════════════════════════════
-- 3. LEAD CUSTOM FIELDS (EAV)
-- ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lead_custom_fields (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id             UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    field_key           VARCHAR(100) NOT NULL,
    field_value         TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(lead_id, field_key)
);


-- ══════════════════════════════════════════════
-- 4. LEAD TAGS
-- ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lead_tags (
    lead_id             UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    tag                 VARCHAR(50) NOT NULL,
    PRIMARY KEY (lead_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_tags_tag ON lead_tags(tag);


-- ══════════════════════════════════════════════
-- 5. CRM CONNECTIONS (OAuth2 + API key)
-- ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm_connections (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               VARCHAR(255) NOT NULL,
    provider                VARCHAR(50) NOT NULL,
    display_name            VARCHAR(200),

    -- OAuth2
    access_token            TEXT,
    refresh_token           TEXT,
    token_expires_at        TIMESTAMPTZ,
    api_domain              VARCHAR(500),

    -- API key
    api_key                 TEXT,

    -- Custom webhook
    webhook_url             VARCHAR(500),

    -- Field mapping
    field_mapping           JSONB,

    -- Sync settings
    sync_direction          VARCHAR(20) DEFAULT 'bidirectional',
    sync_interval_minutes   INTEGER DEFAULT 15,
    last_sync_at            TIMESTAMPTZ,
    last_sync_status        VARCHAR(20),

    is_active               BOOLEAN DEFAULT TRUE,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_crm_conn_tenant ON crm_connections(tenant_id);


-- ══════════════════════════════════════════════
-- 6. AD SOURCE CONNECTIONS
-- ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ad_source_connections (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   VARCHAR(255) NOT NULL,
    provider                    VARCHAR(50) NOT NULL,
    display_name                VARCHAR(200),

    auth_type                   VARCHAR(20) DEFAULT 'webhook',
    credentials                 JSONB,

    webhook_url                 VARCHAR(500),
    webhook_secret              VARCHAR(255),

    polling_interval_minutes    INTEGER,
    last_poll_at                TIMESTAMPTZ,

    auto_assign_agent_id        VARCHAR(255),
    default_tags                JSONB,

    is_active                   BOOLEAN DEFAULT TRUE,
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_adsource_tenant ON ad_source_connections(tenant_id);


-- ══════════════════════════════════════════════
-- 7. SYNC LOGS (audit trail)
-- ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sync_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           VARCHAR(255) NOT NULL,
    connection_type     VARCHAR(20) NOT NULL,
    provider            VARCHAR(50) NOT NULL,
    direction           VARCHAR(10) NOT NULL,
    status              VARCHAR(20) DEFAULT 'success',
    records_processed   INTEGER DEFAULT 0,
    records_created     INTEGER DEFAULT 0,
    records_updated     INTEGER DEFAULT 0,
    records_skipped     INTEGER DEFAULT 0,
    errors              JSONB,
    started_at          TIMESTAMPTZ DEFAULT NOW(),
    completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_tenant ON sync_logs(tenant_id, started_at DESC);
