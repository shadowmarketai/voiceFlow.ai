"""
api.models — model registry.

Re-exports Base and forces import of every model module so that
Base.metadata.create_all() picks them up on startup.
"""

from api.models.base import Base  # noqa: F401

# Import all model modules to register them with Base.metadata.
# Each module is allowed to fail silently so one bad model can't
# break the entire schema boot.
for _mod in (
    "analytics", "campaign", "crm", "tenant", "user", "voice",
    "voice_agent", "webhook", "quality_metrics", "billing_wallet",
    "voice_agent_db",
):
    try:
        __import__(f"api.models.{_mod}")
    except Exception:
        pass
