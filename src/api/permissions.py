"""
VoiceFlow AI - Permission System
==================================
Module-level + action-level RBAC with a centralized permission matrix.

Roles: admin, manager, agent, user, viewer
Actions: create, read, update, delete
"""

import logging

from fastapi import Depends, HTTPException, status

from api.dependencies import get_current_active_user

logger = logging.getLogger(__name__)


# ── Permission Matrix ────────────────────────────────────────────
# role -> module -> set(actions)
# R=read, C=create, U=update, D=delete

PERMISSION_MATRIX: dict[str, dict[str, set[str]]] = {
    # W7.2 — platform-level super admin. Has everything the admin has
    # plus audit, compliance (DPDP), and tenant management.
    "super_admin": {
        "crm": {"create", "read", "update", "delete"},
        "voiceAI": {"create", "read", "update", "delete"},
        "campaigns": {"create", "read", "update", "delete"},
        "analytics": {"create", "read", "update", "delete"},
        "helpdesk": {"create", "read", "update", "delete"},
        "surveys": {"create", "read", "update", "delete"},
        "billing": {"create", "read", "update", "delete"},
        "tenants": {"create", "read", "update", "delete"},
        "userManagement": {"create", "read", "update", "delete"},
        "settings": {"create", "read", "update", "delete"},
        "appointments": {"create", "read", "update", "delete"},
        "automation": {"create", "read", "update", "delete"},
        "inbox": {"create", "read", "update", "delete"},
        "webhooks": {"create", "read", "update", "delete"},
        "integrations": {"create", "read", "update", "delete"},
        "quotation": {"create", "read", "update", "delete"},
        "audit": {"read"},
        "compliance": {"create", "read", "update", "delete"},
    },
    "admin": {
        "crm": {"create", "read", "update", "delete"},
        "voiceAI": {"create", "read", "update", "delete"},
        "campaigns": {"create", "read", "update", "delete"},
        "analytics": {"create", "read", "update", "delete"},
        "helpdesk": {"create", "read", "update", "delete"},
        "surveys": {"create", "read", "update", "delete"},
        "billing": {"create", "read", "update", "delete"},
        "tenants": {"create", "read", "update", "delete"},
        "userManagement": {"create", "read", "update", "delete"},
        "settings": {"create", "read", "update", "delete"},
        "appointments": {"create", "read", "update", "delete"},
        "automation": {"create", "read", "update", "delete"},
        "inbox": {"create", "read", "update", "delete"},
        "webhooks": {"create", "read", "update", "delete"},
        "integrations": {"create", "read", "update", "delete"},
        "quotation": {"create", "read", "update", "delete"},
    },
    "manager": {
        "crm": {"create", "read", "update", "delete"},
        "voiceAI": {"create", "read", "update", "delete"},
        "campaigns": {"create", "read", "update", "delete"},
        "analytics": {"read"},
        "helpdesk": {"create", "read", "update"},
        "surveys": {"create", "read", "update", "delete"},
        "billing": set(),
        "tenants": set(),
        "userManagement": {"read"},
        "settings": {"read", "update"},
        "appointments": {"create", "read", "update", "delete"},
        "automation": {"create", "read", "update"},
        "inbox": {"create", "read", "update"},
        "webhooks": {"create", "read", "update"},
        "integrations": {"create", "read", "update"},
        "quotation": {"create", "read", "update", "delete"},
    },
    "agent": {
        "crm": {"create", "read", "update"},
        "voiceAI": {"create", "read", "update"},
        "campaigns": set(),
        "analytics": {"read"},
        "helpdesk": {"create", "read", "update"},
        "surveys": set(),
        "billing": set(),
        "tenants": set(),
        "userManagement": set(),
        "settings": {"read"},
        "appointments": {"create", "read", "update"},
        "automation": set(),
        "inbox": {"create", "read", "update"},
        "webhooks": set(),
        "integrations": {"read"},
        "quotation": {"create", "read", "update"},
    },
    "user": {
        "crm": {"read"},
        "voiceAI": {"read"},
        "campaigns": set(),
        "analytics": {"read"},
        "helpdesk": {"create", "read", "update"},
        "surveys": set(),
        "billing": set(),
        "tenants": set(),
        "userManagement": set(),
        "settings": {"read"},
        "appointments": {"read"},
        "automation": set(),
        "inbox": {"read"},
        "webhooks": set(),
        "integrations": set(),
        "quotation": {"read"},
    },
    "viewer": {
        "crm": {"read"},
        "voiceAI": {"read"},
        "campaigns": {"read"},
        "analytics": {"read"},
        "helpdesk": set(),
        "surveys": set(),
        "billing": set(),
        "tenants": set(),
        "userManagement": set(),
        "settings": {"read"},
        "appointments": {"read"},
        "automation": set(),
        "inbox": set(),
        "webhooks": set(),
        "integrations": set(),
        "quotation": {"read"},
    },
}


def has_permission(role: str, module: str, action: str) -> bool:
    """Check if a role has a specific permission on a module."""
    role_perms = PERMISSION_MATRIX.get(role, {})
    module_perms = role_perms.get(module, set())
    return action in module_perms


def get_role_permissions(role: str) -> dict[str, list[str]]:
    """Get all permissions for a role (for frontend consumption)."""
    role_perms = PERMISSION_MATRIX.get(role, {})
    return {module: sorted(actions) for module, actions in role_perms.items()}


def get_accessible_modules(role: str) -> list[str]:
    """Get list of modules a role can access (has any permission)."""
    role_perms = PERMISSION_MATRIX.get(role, {})
    return [module for module, actions in role_perms.items() if actions]


# ── FastAPI Dependency Factory ──────────────────────────────────


def require_permission(module: str, action: str):
    """Dependency factory that enforces module+action RBAC.

    Usage::

        @router.get("/crm-leads")
        async def list_leads(user=Depends(require_permission("crm", "read"))):
            ...

        @router.post("/crm-leads")
        async def create_lead(user=Depends(require_permission("crm", "create"))):
            ...
    """

    async def _permission_checker(
        current_user: dict = Depends(get_current_active_user),
    ) -> dict:
        user_role = current_user.get("role", "user")

        if not has_permission(user_role, module, action):
            logger.warning(
                "Permission denied: user=%s role=%s module=%s action=%s",
                current_user.get("email", "unknown"),
                user_role,
                module,
                action,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: role '{user_role}' cannot '{action}' on '{module}'",
            )

        return current_user

    return _permission_checker
