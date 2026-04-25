"""
api.models — model registry.

Re-exports Base classes and forces import of every model module so that
each Base.metadata.create_all() picks up the right tables on startup.

Base          → voiceflow_platform  (tenants, users, billing)
CRMBase       → voiceflow_crm       (leads, deals, caller_memories, campaigns)
RecordingBase → voiceflow_recording (call_recordings, cloned_voices)
VoiceBase     → voiceflow_voice     (voice_agents, conversations, analyses)
"""

from api.models.base import Base, CRMBase, RecordingBase, VoiceBase  # noqa: F401

# ── Platform DB models (Base) ─────────────────────────────────────────────
for _mod in (
    "analytics", "campaign", "crm", "tenant", "user", "voice",
    "voice_agent", "webhook", "quality_metrics", "billing_wallet",
    "voice_agent_db", "api_key", "voice_library", "contact_list",
):
    try:
        __import__(f"api.models.{_mod}")
    except Exception:
        pass

# ── CRM DB models (CRMBase) ───────────────────────────────────────────────
for _mod in ("caller_memory_model",):
    try:
        __import__(f"api.models.{_mod}")
    except Exception:
        pass

# ── Voice DB models (VoiceBase) ───────────────────────────────────────────
for _mod in ("conversation",):
    try:
        __import__(f"api.models.{_mod}")
    except Exception:
        pass
