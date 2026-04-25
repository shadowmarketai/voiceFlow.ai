"""GAP 7: caller_memories table (CRM DB) + conversation tables (Voice DB)

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-24

NOTE: This migration targets voiceflow_crm and voiceflow_voice databases.
      Run via Alembic with the correct --name flag per database, or let
      multi_db.init_all_db_tables() handle table creation on startup.

Tables created:
  [CRM DB]
    caller_memories          — permanent cross-call caller profiles

  [Voice DB]
    conversations            — one row per call session
    conversation_turns       — one row per STT→LLM→TTS turn
    conversation_summaries   — one LLM summary per call
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision      = "0002"
down_revision = "0001"
branch_labels = None
depends_on    = None


def upgrade() -> None:

    # ══════════════════════════════════════════════════════════════════════
    # CRM DB — caller_memories
    # ══════════════════════════════════════════════════════════════════════

    op.create_table(
        "caller_memories",
        sa.Column("id",             sa.BigInteger(),  primary_key=True, autoincrement=True),
        sa.Column("tenant_id",      sa.String(64),    nullable=False),
        sa.Column("phone_hash",     sa.String(64),    nullable=False,
                  comment="SHA-256 of E.164-normalised phone number"),
        sa.Column("caller_name",    sa.String(200),   nullable=True),
        sa.Column("language_pref",  sa.String(10),    nullable=False, server_default="en"),
        sa.Column("key_facts",      postgresql.JSONB(astext_type=sa.Text()), nullable=True,
                  server_default="{}"),
        sa.Column("conv_summaries", postgresql.JSONB(astext_type=sa.Text()), nullable=True,
                  server_default="[]"),
        sa.Column("emotion_history",postgresql.JSONB(astext_type=sa.Text()), nullable=True,
                  server_default="[]"),
        sa.Column("total_calls",    sa.Integer(),     nullable=False, server_default="0"),
        sa.Column("last_call_at",   sa.Text(),        nullable=True),
        sa.Column("last_intent",    sa.String(100),   nullable=True),
        sa.Column("notes",          postgresql.JSONB(astext_type=sa.Text()), nullable=True,
                  server_default="[]"),
        sa.Column("created_at",     sa.Text(),        nullable=False,
                  server_default=sa.func.now()),
        sa.Column("updated_at",     sa.Text(),        nullable=True,
                  server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "phone_hash", name="uq_caller_memory_tenant_phone"),
    )
    op.create_index("ix_caller_memory_tenant_id",   "caller_memories", ["tenant_id"])
    op.create_index("ix_caller_memory_last_call",   "caller_memories", ["last_call_at"])
    op.create_index("ix_caller_memory_total_calls", "caller_memories", ["total_calls"])

    # ══════════════════════════════════════════════════════════════════════
    # Voice DB — conversations
    # ══════════════════════════════════════════════════════════════════════

    op.create_table(
        "conversations",
        sa.Column("id",                    sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("call_id",               sa.String(128),  nullable=False, unique=True),
        sa.Column("tenant_id",             sa.String(64),   nullable=False),
        sa.Column("agent_id",              sa.String(64),   nullable=True),
        sa.Column("phone_hash",            sa.String(64),   nullable=True),
        sa.Column("caller_name",           sa.String(200),  nullable=True),
        sa.Column("direction",             sa.String(16),   nullable=False, server_default="inbound"),
        sa.Column("channel",               sa.String(32),   nullable=False, server_default="phone"),
        sa.Column("track_used",            sa.String(8),    nullable=True),
        sa.Column("language",              sa.String(10),   nullable=False, server_default="en"),
        sa.Column("started_at",            sa.Text(),       nullable=False, server_default=sa.func.now()),
        sa.Column("ended_at",              sa.Text(),       nullable=True),
        sa.Column("duration_seconds",      sa.Float(),      nullable=True),
        sa.Column("outcome",               sa.String(50),   nullable=True),
        sa.Column("final_intent",          sa.String(100),  nullable=True),
        sa.Column("final_emotion",         sa.String(50),   nullable=True),
        sa.Column("final_sentiment",       sa.Float(),      nullable=True),
        sa.Column("lead_score",            sa.Float(),      nullable=True),
        sa.Column("total_turns",           sa.Integer(),    nullable=False, server_default="0"),
        sa.Column("total_words_caller",    sa.Integer(),    nullable=False, server_default="0"),
        sa.Column("total_words_agent",     sa.Integer(),    nullable=False, server_default="0"),
        sa.Column("interruption_count",    sa.Integer(),    nullable=False, server_default="0"),
        sa.Column("filler_count",          sa.Integer(),    nullable=False, server_default="0"),
        sa.Column("avg_ttfa_ms",           sa.Float(),      nullable=True),
        sa.Column("avg_turn_latency_ms",   sa.Float(),      nullable=True),
        sa.Column("recording_id",          sa.String(128),  nullable=True),
        sa.Column("caller_memory_id",      sa.BigInteger(), nullable=True),
        sa.Column("cost_paise",            sa.BigInteger(), nullable=True),
        sa.Column("created_at",            sa.Text(),       nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at",            sa.Text(),       nullable=True),
    )
    op.create_index("ix_conversations_tenant_started", "conversations", ["tenant_id", "started_at"])
    op.create_index("ix_conversations_agent_id",       "conversations", ["agent_id"])
    op.create_index("ix_conversations_phone_hash",     "conversations", ["phone_hash"])
    op.create_index("ix_conversations_outcome",        "conversations", ["outcome"])
    op.create_index("ix_conversations_caller_memory",  "conversations", ["caller_memory_id"])

    # ── Voice DB — conversation_turns ─────────────────────────────────────

    op.create_table(
        "conversation_turns",
        sa.Column("id",                   sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("conversation_id",      sa.BigInteger(), nullable=False),
        sa.Column("call_id",              sa.String(128),  nullable=False),
        sa.Column("tenant_id",            sa.String(64),   nullable=False),
        sa.Column("turn_index",           sa.Integer(),    nullable=False),
        sa.Column("caller_transcript",    sa.Text(),       nullable=True),
        sa.Column("stt_confidence",       sa.Float(),      nullable=True),
        sa.Column("stt_provider",         sa.String(50),   nullable=True),
        sa.Column("stt_language",         sa.String(10),   nullable=True),
        sa.Column("agent_reply",          sa.Text(),       nullable=True),
        sa.Column("llm_provider",         sa.String(50),   nullable=True),
        sa.Column("llm_model",            sa.String(100),  nullable=True),
        sa.Column("llm_tokens_in",        sa.Integer(),    nullable=True),
        sa.Column("llm_tokens_out",       sa.Integer(),    nullable=True),
        sa.Column("tts_provider",         sa.String(50),   nullable=True),
        sa.Column("tts_voice_id",         sa.String(100),  nullable=True),
        sa.Column("tts_chars",            sa.Integer(),    nullable=True),
        sa.Column("stt_latency_ms",       sa.Float(),      nullable=True),
        sa.Column("llm_latency_ms",       sa.Float(),      nullable=True),
        sa.Column("tts_latency_ms",       sa.Float(),      nullable=True),
        sa.Column("ttfa_ms",              sa.Float(),      nullable=True),
        sa.Column("total_turn_ms",        sa.Float(),      nullable=True),
        sa.Column("emotion",              sa.String(50),   nullable=True),
        sa.Column("emotion_confidence",   sa.Float(),      nullable=True),
        sa.Column("intent",               sa.String(100),  nullable=True),
        sa.Column("intent_confidence",    sa.Float(),      nullable=True),
        sa.Column("sentiment",            sa.Float(),      nullable=True),
        sa.Column("lead_score",           sa.Float(),      nullable=True),
        sa.Column("dialect",              sa.String(50),   nullable=True),
        sa.Column("gen_z_score",          sa.Float(),      nullable=True),
        sa.Column("extracted_entities",   postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("was_interrupted",      sa.Boolean(),    nullable=False, server_default="false"),
        sa.Column("used_filler",          sa.Boolean(),    nullable=False, server_default="false"),
        sa.Column("used_speculative_llm", sa.Boolean(),    nullable=False, server_default="false"),
        sa.Column("track",                sa.String(8),    nullable=True),
        sa.Column("created_at",           sa.Text(),       nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_turns_conversation_id",  "conversation_turns", ["conversation_id"])
    op.create_index("ix_turns_call_id",          "conversation_turns", ["call_id"])
    op.create_index("ix_turns_tenant_created",   "conversation_turns", ["tenant_id", "created_at"])
    op.create_index("ix_turns_emotion",          "conversation_turns", ["emotion"])
    op.create_index("ix_turns_intent",           "conversation_turns", ["intent"])

    # ── Voice DB — conversation_summaries ────────────────────────────────

    op.create_table(
        "conversation_summaries",
        sa.Column("id",                  sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("conversation_id",     sa.BigInteger(), nullable=False, unique=True),
        sa.Column("call_id",             sa.String(128),  nullable=False, unique=True),
        sa.Column("tenant_id",           sa.String(64),   nullable=False),
        sa.Column("caller_memory_id",    sa.BigInteger(), nullable=True),
        sa.Column("summary",             sa.Text(),       nullable=False),
        sa.Column("key_facts_extracted", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("call_duration_seconds", sa.Float(),    nullable=True),
        sa.Column("total_turns",         sa.Integer(),    nullable=True),
        sa.Column("final_intent",        sa.String(100),  nullable=True),
        sa.Column("final_emotion",       sa.String(50),   nullable=True),
        sa.Column("outcome",             sa.String(50),   nullable=True),
        sa.Column("language",            sa.String(10),   nullable=True),
        sa.Column("llm_model",           sa.String(100),  nullable=True),
        sa.Column("llm_tokens_used",     sa.Integer(),    nullable=True),
        sa.Column("summary_latency_ms",  sa.Float(),      nullable=True),
        sa.Column("created_at",          sa.Text(),       nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_summaries_tenant_created", "conversation_summaries", ["tenant_id", "created_at"])
    op.create_index("ix_summaries_caller_memory",  "conversation_summaries", ["caller_memory_id"])


def downgrade() -> None:
    # Voice DB tables
    op.drop_index("ix_summaries_caller_memory",   table_name="conversation_summaries")
    op.drop_index("ix_summaries_tenant_created",  table_name="conversation_summaries")
    op.drop_table("conversation_summaries")

    op.drop_index("ix_turns_intent",              table_name="conversation_turns")
    op.drop_index("ix_turns_emotion",             table_name="conversation_turns")
    op.drop_index("ix_turns_tenant_created",      table_name="conversation_turns")
    op.drop_index("ix_turns_call_id",             table_name="conversation_turns")
    op.drop_index("ix_turns_conversation_id",     table_name="conversation_turns")
    op.drop_table("conversation_turns")

    op.drop_index("ix_conversations_caller_memory",  table_name="conversations")
    op.drop_index("ix_conversations_outcome",        table_name="conversations")
    op.drop_index("ix_conversations_phone_hash",     table_name="conversations")
    op.drop_index("ix_conversations_agent_id",       table_name="conversations")
    op.drop_index("ix_conversations_tenant_started", table_name="conversations")
    op.drop_table("conversations")

    # CRM DB table
    op.drop_index("ix_caller_memory_total_calls", table_name="caller_memories")
    op.drop_index("ix_caller_memory_last_call",   table_name="caller_memories")
    op.drop_index("ix_caller_memory_tenant_id",   table_name="caller_memories")
    op.drop_table("caller_memories")
