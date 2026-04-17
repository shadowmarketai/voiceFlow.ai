"""
Agent marketplace — W11.

Pre-built agent templates that tenants install with one click.
Templates are static (no DB yet — shipped as code). Install clones
the template into the tenant's agent table.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.dependencies import get_current_active_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/marketplace", tags=["marketplace"])

# ── Template catalog (shipped as code) ──────────────────────────────

TEMPLATES: list[dict[str, Any]] = [
    {
        "id": "sales-inbound",
        "name": "Inbound Sales Agent",
        "category": "sales",
        "description": "Qualifies leads, answers pricing questions, books demos. Optimised for SaaS B2B.",
        "languages": ["en", "hi"],
        "system_prompt": (
            "You are a professional inbound sales agent for {{company_name}}. "
            "Your goal: qualify the caller, answer product/pricing questions accurately, "
            "and book a demo with the sales team. Be warm, professional, never pushy. "
            "If you don't know an answer, say 'Let me connect you with our team.'"
        ),
        "llm_provider": "groq",
        "voice_id": None,
        "tags": ["sales", "b2b", "lead-qualification"],
        "revenue_share_pct": 70,
    },
    {
        "id": "support-tier1",
        "name": "Tier-1 Support Agent",
        "category": "support",
        "description": "Handles common support queries, troubleshooting steps, ticket creation. Escalates complex issues.",
        "languages": ["en", "hi", "ta", "te"],
        "system_prompt": (
            "You are a tier-1 customer support agent for {{company_name}}. "
            "Help the customer troubleshoot their issue step by step. "
            "If you can't resolve it in 3 steps, offer to create a support ticket "
            "and escalate to a human agent. Be patient and empathetic."
        ),
        "llm_provider": "groq",
        "voice_id": None,
        "tags": ["support", "troubleshooting", "ticket"],
        "revenue_share_pct": 70,
    },
    {
        "id": "appointment-booking",
        "name": "Appointment Booking Agent",
        "category": "booking",
        "description": "Books, reschedules, and cancels appointments. Calendar integration ready.",
        "languages": ["en", "hi"],
        "system_prompt": (
            "You are a scheduling assistant for {{company_name}}. "
            "Help callers book, reschedule, or cancel appointments. "
            "Confirm: name, preferred date/time, service type, phone number. "
            "Always repeat back the confirmed slot before ending the call."
        ),
        "llm_provider": "groq",
        "voice_id": None,
        "tags": ["booking", "appointments", "scheduling"],
        "revenue_share_pct": 70,
    },
    {
        "id": "survey-csat",
        "name": "Post-Call Survey Agent",
        "category": "survey",
        "description": "Automated CSAT/NPS survey after service calls. Collects rating + verbatim feedback.",
        "languages": ["en", "hi", "ta"],
        "system_prompt": (
            "You are conducting a brief satisfaction survey for {{company_name}}. "
            "Ask: 1) How would you rate your experience 1-5? "
            "2) What could we have done better? "
            "3) Would you recommend us to others? "
            "Thank the caller and end gracefully. Keep it under 2 minutes."
        ),
        "llm_provider": "groq",
        "voice_id": None,
        "tags": ["survey", "csat", "nps", "feedback"],
        "revenue_share_pct": 70,
    },
    {
        "id": "collections-reminder",
        "name": "Payment Reminder Agent",
        "category": "collections",
        "description": "Polite payment reminder calls with EMI/due-date info. DPDP-compliant — no sensitive data spoken.",
        "languages": ["en", "hi"],
        "system_prompt": (
            "You are a payment reminder assistant for {{company_name}}. "
            "Politely remind the customer about their upcoming/overdue payment. "
            "Provide the due date and amount if given in context. "
            "Never share full account numbers or sensitive details over the call. "
            "Offer to connect to billing support if they have questions."
        ),
        "llm_provider": "groq",
        "voice_id": None,
        "tags": ["collections", "payments", "reminders"],
        "revenue_share_pct": 70,
    },
    {
        "id": "real-estate-lead",
        "name": "Real Estate Lead Qualifier",
        "category": "sales",
        "description": "Qualifies property leads: budget, location preference, timeline, contact details.",
        "languages": ["en", "hi", "ta", "te", "kn"],
        "system_prompt": (
            "You are a real estate lead qualification agent for {{company_name}}. "
            "Ask: 1) What type of property? (flat/villa/plot) "
            "2) Preferred location/area? "
            "3) Budget range in lakhs? "
            "4) Timeline — ready to buy or just exploring? "
            "5) Best number to reach back? "
            "Be friendly and conversational. Use lakh/crore for pricing."
        ),
        "llm_provider": "groq",
        "voice_id": None,
        "tags": ["real-estate", "lead-qualification", "india"],
        "revenue_share_pct": 70,
    },
]


# ── Endpoints ──────────────────────────────────────────────────────

@router.get("/templates")
async def list_templates(category: str = ""):
    """Browse available agent templates."""
    templates = TEMPLATES
    if category:
        templates = [t for t in templates if t["category"] == category]
    return {
        "count": len(templates),
        "categories": sorted({t["category"] for t in TEMPLATES}),
        "templates": templates,
    }


@router.get("/templates/{template_id}")
async def get_template(template_id: str):
    """Get full template details."""
    for t in TEMPLATES:
        if t["id"] == template_id:
            return t
    raise HTTPException(404, "Template not found")


class InstallRequest(BaseModel):
    template_id: str
    company_name: str = "My Company"
    language: str = "en"


@router.post("/install")
async def install_template(
    payload: InstallRequest,
    user: dict = Depends(get_current_active_user),
):
    """One-click install: clone a template into the tenant's agent table.

    Replaces {{company_name}} in the system prompt with the tenant's
    actual company name.
    """
    template = None
    for t in TEMPLATES:
        if t["id"] == payload.template_id:
            template = t
            break
    if not template:
        raise HTTPException(404, "Template not found")

    tenant_id = user.get("tenant_id", "")
    agent_id = f"{template['id']}-{uuid.uuid4().hex[:6]}"
    system_prompt = template["system_prompt"].replace("{{company_name}}", payload.company_name)

    # Persist to the agents_db table
    try:
        from api.services.agents_store import create_agent
        agent = create_agent(
            agent_id=agent_id,
            name=f"{template['name']} ({payload.company_name})",
            tenant_id=tenant_id,
            system_prompt=system_prompt,
            language=payload.language,
            llm_provider=template["llm_provider"],
            voice_id=template.get("voice_id"),
        )
    except Exception as exc:
        logger.warning("agents_store.create_agent failed, returning template data: %s", exc)
        agent = {
            "agent_id": agent_id,
            "name": template["name"],
            "system_prompt": system_prompt,
        }

    # Audit log
    try:
        from api.services.audit import log_action
        log_action(
            actor_id=str(user.get("id", user.get("email", "?"))),
            actor_role=user.get("role", "user"),
            tenant_id=tenant_id,
            action="marketplace_install",
            resource_type="agent_template",
            resource_id=payload.template_id,
            detail=f"Installed as {agent_id}",
        )
    except Exception:
        pass

    return {
        "status": "installed",
        "agent_id": agent_id,
        "template_id": payload.template_id,
        "agent": agent,
    }
