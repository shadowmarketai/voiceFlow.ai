"""Add business profile fields to tenants + tenant_contacts table

Revision ID: 0001
Revises:
Create Date: 2026-04-18
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── New columns on tenants ────────────────────────────────────────
    op.add_column("tenants", sa.Column("company_type", sa.String(60), nullable=True,
                  comment="Pvt Ltd, LLP, OPC, Partnership, Proprietorship, Public Ltd, NGO"))
    op.add_column("tenants", sa.Column("gstin", sa.String(15), nullable=True,
                  comment="GST Identification Number (15 chars)"))
    op.add_column("tenants", sa.Column("pan_number", sa.String(10), nullable=True,
                  comment="PAN card number (10 chars)"))
    op.add_column("tenants", sa.Column("website_url", sa.String(500), nullable=True))

    op.add_column("tenants", sa.Column("owner_name", sa.String(200), nullable=True,
                  comment="Primary POC / Owner full name"))
    op.add_column("tenants", sa.Column("owner_email", sa.String(255), nullable=True))
    op.add_column("tenants", sa.Column("owner_phone", sa.String(20), nullable=True))

    op.add_column("tenants", sa.Column("billing_email", sa.String(255), nullable=True,
                  comment="Who receives invoices"))
    op.add_column("tenants", sa.Column("billing_address", sa.Text, nullable=True,
                  comment="Billing address if different from office"))
    op.add_column("tenants", sa.Column("contract_start_date", sa.Date, nullable=True))
    op.add_column("tenants", sa.Column("contract_end_date", sa.Date, nullable=True))
    op.add_column("tenants", sa.Column("monthly_billing_amount", sa.Numeric(12, 2), nullable=True,
                  comment="Contracted MRR in default_currency"))
    op.add_column("tenants", sa.Column("payment_terms", sa.String(50), nullable=True,
                  comment="prepaid, NET15, NET30, NET60"))

    op.add_column("tenants", sa.Column(
        "onboarding_status", sa.String(50), nullable=False,
        server_default="not_started",
        comment="not_started | in_progress | completed | churned",
    ))
    op.add_column("tenants", sa.Column("onboarding_notes", sa.Text, nullable=True))
    op.add_column("tenants", sa.Column("go_live_date", sa.Date, nullable=True))

    op.add_column("tenants", sa.Column("tags", sa.JSON, nullable=True,
                  comment="String array of CRM tags"))
    op.add_column("tenants", sa.Column("internal_notes", sa.Text, nullable=True,
                  comment="Internal notes — not visible to tenant"))

    # Indexes on new columns
    op.create_index("idx_tenant_onboarding_status", "tenants", ["onboarding_status"])
    op.create_index("idx_tenant_contract_end", "tenants", ["contract_end_date"])
    op.create_index("idx_tenant_gstin", "tenants", ["gstin"])

    # ── New table: tenant_contacts ────────────────────────────────────
    op.create_table(
        "tenant_contacts",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer,
                  sa.ForeignKey("tenants.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("designation", sa.String(100), nullable=True,
                  comment="e.g. CTO, Finance Manager"),
        sa.Column("role", sa.String(50), nullable=False,
                  server_default="general",
                  comment="owner | billing | technical | support | general"),
        sa.Column("is_primary", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), onupdate=sa.func.now(), nullable=True),
    )
    op.create_index("idx_tc_tenant_id", "tenant_contacts", ["tenant_id"])
    op.create_index("idx_tc_role", "tenant_contacts", ["role"])


def downgrade() -> None:
    op.drop_table("tenant_contacts")

    for col in [
        "internal_notes", "tags", "go_live_date", "onboarding_notes", "onboarding_status",
        "payment_terms", "monthly_billing_amount", "contract_end_date", "contract_start_date",
        "billing_address", "billing_email",
        "owner_phone", "owner_email", "owner_name",
        "website_url", "pan_number", "gstin", "company_type",
    ]:
        op.drop_column("tenants", col)

    op.drop_index("idx_tenant_onboarding_status", table_name="tenants")
    op.drop_index("idx_tenant_contract_end", table_name="tenants")
    op.drop_index("idx_tenant_gstin", table_name="tenants")
