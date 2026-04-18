"""
VoiceFlow Marketing AI - Billing Router
========================================
Razorpay billing integration: plans, subscriptions, invoices, webhooks, usage.

All amounts are in paisa for Razorpay (e.g. Rs 499.99 = 49999 paisa).
Webhook endpoint does NOT require authentication (Razorpay calls it).
"""

import hashlib
import hmac
import json
import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session

from api.config import settings
from api.database import get_db
from api.permissions import require_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/billing", tags=["Billing"])


# ── Plan Definitions ─────────────────────────────────────────────

PLANS = {
    "starter": {
        "id": "starter",
        "name": "Starter",
        "slug": "starter",
        "price_monthly_inr": 4999.00,
        "price_monthly_paisa": 499900,
        "price_yearly_inr": 49990.00,
        "price_yearly_paisa": 4999000,
        "currency": "INR",
        "max_users": 1,
        "max_leads": 500,
        "max_call_minutes": 1000,
        "max_assistants": 1,
        "max_workflows": 5,
        "max_integrations": 2,
        "features": [
            "500 leads",
            "1,000 call minutes",
            "1 AI assistant",
            "Basic integrations",
            "Email support",
        ],
        "is_popular": False,
    },
    "professional": {
        "id": "professional",
        "name": "Professional",
        "slug": "professional",
        "price_monthly_inr": 14999.00,
        "price_monthly_paisa": 1499900,
        "price_yearly_inr": 149990.00,
        "price_yearly_paisa": 14999000,
        "currency": "INR",
        "max_users": 5,
        "max_leads": 5000,
        "max_call_minutes": 5000,
        "max_assistants": 3,
        "max_workflows": 10,
        "max_integrations": 10,
        "features": [
            "5,000 leads",
            "5,000 call minutes",
            "3 AI assistants",
            "All integrations",
            "Automation workflows",
            "WhatsApp integration",
            "Priority support",
        ],
        "is_popular": True,
    },
    "enterprise": {
        "id": "enterprise",
        "name": "Enterprise",
        "slug": "enterprise",
        "price_monthly_inr": 39999.00,
        "price_monthly_paisa": 3999900,
        "price_yearly_inr": 399990.00,
        "price_yearly_paisa": 39999000,
        "currency": "INR",
        "max_users": 999999,
        "max_leads": 999999,
        "max_call_minutes": 20000,
        "max_assistants": 999999,
        "max_workflows": 999999,
        "max_integrations": 999999,
        "features": [
            "Unlimited leads",
            "20,000 call minutes",
            "Unlimited AI assistants",
            "White-label option",
            "API access",
            "Custom integrations",
            "Dedicated support",
        ],
        "is_popular": False,
    },
}


# ── In-memory subscription store (use DB in production) ──────────
# In a production deployment these would be SQLAlchemy models.
# For now, we keep a dict keyed by user_id.

_subscriptions: dict[str, dict[str, Any]] = {}
_invoices: dict[str, list[dict[str, Any]]] = {}
_webhook_retry_counts: dict[str, int] = {}  # payment_id -> retry count (max 3)


# ── Request / Response Schemas ───────────────────────────────────


class SubscribeRequest(BaseModel):
    """Create a new subscription."""

    plan_id: str = Field(..., description="Plan ID: starter, professional, enterprise")
    billing_cycle: str = Field(default="monthly", description="monthly or yearly")
    customer_name: str | None = Field(default=None, max_length=200)
    customer_email: str | None = Field(default=None, max_length=255)
    customer_phone: str | None = Field(default=None, max_length=20)

    @field_validator("plan_id")
    @classmethod
    def validate_plan_id(cls, v: str) -> str:
        if v not in PLANS:
            raise ValueError(f"Invalid plan_id. Must be one of: {', '.join(PLANS.keys())}")
        return v

    @field_validator("billing_cycle")
    @classmethod
    def validate_billing_cycle(cls, v: str) -> str:
        if v not in ("monthly", "yearly"):
            raise ValueError("billing_cycle must be 'monthly' or 'yearly'")
        return v

    model_config = ConfigDict(from_attributes=True)


class CancelRequest(BaseModel):
    """Cancel a subscription."""

    cancel_immediately: bool = Field(default=False, description="Cancel now or at cycle end")
    reason: str | None = Field(default=None, max_length=1000)

    model_config = ConfigDict(from_attributes=True)


class PlanResponse(BaseModel):
    id: str
    name: str
    price_monthly_inr: float
    price_yearly_inr: float
    currency: str = "INR"
    features: list[str] = []
    is_popular: bool = False
    limits: dict[str, Any] = {}

    model_config = ConfigDict(from_attributes=True)


class SubscriptionResponse(BaseModel):
    subscription_id: str
    plan_id: str
    plan_name: str
    status: str
    billing_cycle: str
    current_period_start: str | None = None
    current_period_end: str | None = None
    cancelled_at: str | None = None
    razorpay_subscription_id: str | None = None

    model_config = ConfigDict(from_attributes=True)


class InvoiceResponse(BaseModel):
    id: str
    amount_inr: float
    amount_paisa: int
    status: str
    description: str
    created_at: str
    paid_at: str | None = None
    razorpay_payment_id: str | None = None

    model_config = ConfigDict(from_attributes=True)


class UsageResponse(BaseModel):
    plan_id: str
    plan_name: str
    status: str
    billing_cycle: str
    current_period_end: str | None = None
    usage: dict[str, Any] = {}
    limits: dict[str, Any] = {}

    model_config = ConfigDict(from_attributes=True)


# ── Helpers ───────────────────────────────────────────────────────


def _get_user_id_str(current_user: dict) -> str:
    """Get user ID as string for subscription store key."""
    return str(current_user.get("id", "unknown"))


def _verify_razorpay_signature(payload: bytes, signature: str) -> bool:
    """Verify Razorpay webhook signature using HMAC-SHA256."""
    webhook_secret = settings.RAZORPAY_KEY_SECRET
    if not webhook_secret:
        logger.warning("RAZORPAY_KEY_SECRET not configured, skipping signature verification")
        return True

    expected = hmac.new(
        webhook_secret.encode(),
        payload,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature)


# ── GET /plans — List available plans ────────────────────────────


@router.get(
    "/plans",
    response_model=list[PlanResponse],
    summary="List available plans",
)
async def list_plans() -> list[PlanResponse]:
    """List available subscription plans.

    Plans: Starter (Rs 4,999/mo), Professional (Rs 14,999/mo), Enterprise (Rs 39,999/mo).
    """
    return [
        PlanResponse(
            id=plan["id"],
            name=plan["name"],
            price_monthly_inr=plan["price_monthly_inr"],
            price_yearly_inr=plan["price_yearly_inr"],
            currency=plan["currency"],
            features=plan["features"],
            is_popular=plan["is_popular"],
            limits={
                "max_users": plan["max_users"],
                "max_leads": plan["max_leads"],
                "max_call_minutes": plan["max_call_minutes"],
                "max_assistants": plan["max_assistants"],
                "max_workflows": plan["max_workflows"],
                "max_integrations": plan["max_integrations"],
            },
        )
        for plan in PLANS.values()
    ]


# ── GET /subscription — Get current subscription ─────────────────


@router.get(
    "/subscription",
    response_model=SubscriptionResponse,
    summary="Get current subscription",
)
async def get_subscription(
    current_user: dict = Depends(require_permission("billing", "read")),
) -> SubscriptionResponse:
    """Get the current user's active subscription."""
    user_id = _get_user_id_str(current_user)
    sub = _subscriptions.get(user_id)

    if not sub:
        # Return a default free/trial subscription
        return SubscriptionResponse(
            subscription_id="default",
            plan_id="starter",
            plan_name="Starter (Trial)",
            status="trialing",
            billing_cycle="monthly",
            current_period_start=datetime.now(UTC).isoformat(),
            current_period_end=(datetime.now(UTC) + timedelta(days=14)).isoformat(),
        )

    plan = PLANS.get(sub["plan_id"], PLANS["starter"])

    return SubscriptionResponse(
        subscription_id=sub["subscription_id"],
        plan_id=sub["plan_id"],
        plan_name=plan["name"],
        status=sub["status"],
        billing_cycle=sub["billing_cycle"],
        current_period_start=sub.get("current_period_start"),
        current_period_end=sub.get("current_period_end"),
        cancelled_at=sub.get("cancelled_at"),
        razorpay_subscription_id=sub.get("razorpay_subscription_id"),
    )


# ── POST /subscribe — Create Razorpay subscription ───────────────


@router.post(
    "/subscribe",
    response_model=SubscriptionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create subscription",
)
async def subscribe(
    body: SubscribeRequest,
    current_user: dict = Depends(require_permission("billing", "create")),
) -> SubscriptionResponse:
    """Create a new subscription.

    Amount is calculated in paisa for Razorpay integration.
    In production, this would create a Razorpay subscription via their API
    and return a checkout URL.
    """
    user_id = _get_user_id_str(current_user)
    plan = PLANS[body.plan_id]

    # Check if user already has active subscription
    existing = _subscriptions.get(user_id)
    if existing and existing["status"] in ("active", "trialing"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User already has an active subscription. Cancel first or upgrade.",
        )

    # Calculate amount in paisa
    if body.billing_cycle == "yearly":
        amount_paisa = plan["price_yearly_paisa"]
        amount_inr = plan["price_yearly_inr"]
        period_days = 365
    else:
        amount_paisa = plan["price_monthly_paisa"]
        amount_inr = plan["price_monthly_inr"]
        period_days = 30

    now = datetime.now(UTC)
    subscription_id = f"sub_{secrets.token_urlsafe(16)}"

    sub_record = {
        "subscription_id": subscription_id,
        "user_id": user_id,
        "plan_id": body.plan_id,
        "status": "active",
        "billing_cycle": body.billing_cycle,
        "amount_paisa": amount_paisa,
        "amount_inr": amount_inr,
        "current_period_start": now.isoformat(),
        "current_period_end": (now + timedelta(days=period_days)).isoformat(),
        "razorpay_subscription_id": None,  # would be set after Razorpay API call
        "customer_name": body.customer_name or current_user.get("name", ""),
        "customer_email": body.customer_email or current_user.get("email", ""),
        "customer_phone": body.customer_phone or current_user.get("phone", ""),
        "created_at": now.isoformat(),
        "cancelled_at": None,
    }

    _subscriptions[user_id] = sub_record

    # Create initial invoice
    invoice_id = f"inv_{secrets.token_urlsafe(16)}"
    invoice = {
        "id": invoice_id,
        "subscription_id": subscription_id,
        "amount_inr": amount_inr,
        "amount_paisa": amount_paisa,
        "status": "paid",
        "description": f"{plan['name']} Plan ({body.billing_cycle})",
        "created_at": now.isoformat(),
        "paid_at": now.isoformat(),
        "razorpay_payment_id": None,
    }
    _invoices.setdefault(user_id, []).append(invoice)

    logger.info(
        "Subscription created: user=%s plan=%s cycle=%s amount=%d paisa",
        user_id,
        body.plan_id,
        body.billing_cycle,
        amount_paisa,
    )

    return SubscriptionResponse(
        subscription_id=subscription_id,
        plan_id=body.plan_id,
        plan_name=plan["name"],
        status="active",
        billing_cycle=body.billing_cycle,
        current_period_start=sub_record["current_period_start"],
        current_period_end=sub_record["current_period_end"],
        razorpay_subscription_id=sub_record["razorpay_subscription_id"],
    )


# ── POST /cancel — Cancel subscription ───────────────────────────


@router.post(
    "/cancel",
    summary="Cancel subscription",
)
async def cancel_subscription(
    body: CancelRequest,
    current_user: dict = Depends(require_permission("billing", "update")),
) -> dict:
    """Cancel the current subscription.

    By default, cancellation takes effect at the end of the current billing cycle.
    Set cancel_immediately=true to cancel now.
    """
    user_id = _get_user_id_str(current_user)
    sub = _subscriptions.get(user_id)

    if not sub or sub["status"] in ("cancelled",):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active subscription found",
        )

    now = datetime.now(UTC)

    if body.cancel_immediately:
        sub["status"] = "cancelled"
        sub["cancelled_at"] = now.isoformat()
        message = "Subscription cancelled immediately"
    else:
        sub["cancelled_at"] = now.isoformat()
        sub["status"] = "cancelling"
        message = f"Subscription will be cancelled at end of current period ({sub['current_period_end']})"

    # In production: call Razorpay cancel_subscription API
    # await razorpay_client.cancel_subscription(sub["razorpay_subscription_id"], ...)

    logger.info(
        "Subscription cancelled: user=%s plan=%s immediate=%s reason=%s",
        user_id,
        sub["plan_id"],
        body.cancel_immediately,
        body.reason,
    )

    return {
        "message": message,
        "subscription_id": sub["subscription_id"],
        "status": sub["status"],
        "cancelled_at": sub["cancelled_at"],
    }


# ── GET /invoices — List invoices ─────────────────────────────────


@router.get(
    "/invoices",
    response_model=list[InvoiceResponse],
    summary="List invoices",
)
async def list_invoices(
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_permission("billing", "read")),
) -> list[InvoiceResponse]:
    """List the current user's invoices."""
    user_id = _get_user_id_str(current_user)
    user_invoices = _invoices.get(user_id, [])

    return [
        InvoiceResponse(
            id=inv["id"],
            amount_inr=inv["amount_inr"],
            amount_paisa=inv["amount_paisa"],
            status=inv["status"],
            description=inv["description"],
            created_at=inv["created_at"],
            paid_at=inv.get("paid_at"),
            razorpay_payment_id=inv.get("razorpay_payment_id"),
        )
        for inv in user_invoices[:limit]
    ]


# ── POST /webhook — Razorpay webhook (no auth required) ──────────


@router.post(
    "/webhook",
    summary="Razorpay webhook",
)
async def razorpay_webhook(request: Request) -> dict:
    """Handle Razorpay webhook events.

    Verifies the webhook signature before processing.
    This endpoint does NOT require JWT authentication.
    Failed payments are retried max 3 times.
    """
    payload = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")

    # Verify signature
    if not _verify_razorpay_signature(payload, signature):
        logger.warning("Razorpay webhook signature verification failed")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid webhook signature",
        )

    try:
        event = json.loads(payload)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload",
        )

    event_type = event.get("event", "")
    logger.info("Razorpay webhook received: %s", event_type)

    if event_type == "subscription.activated":
        entity = event.get("payload", {}).get("subscription", {}).get("entity", {})
        rz_sub_id = entity.get("id")
        notes = entity.get("notes", {})
        tenant_id = notes.get("tenant_id") or notes.get("user_id")
        logger.info("Subscription activated: razorpay_id=%s tenant=%s", rz_sub_id, tenant_id)

    elif event_type == "subscription.charged":
        entity = event.get("payload", {}).get("subscription", {}).get("entity", {})
        rz_sub_id = entity.get("id")
        logger.info("Subscription charged: razorpay_id=%s", rz_sub_id)

    elif event_type == "subscription.cancelled":
        entity = event.get("payload", {}).get("subscription", {}).get("entity", {})
        rz_sub_id = entity.get("id")
        logger.info("Subscription cancelled via webhook: razorpay_id=%s", rz_sub_id)

    elif event_type == "payment.captured":
        entity = event.get("payload", {}).get("payment", {}).get("entity", {})
        payment_id = entity.get("id")
        amount = entity.get("amount", 0)
        logger.info("Payment captured: id=%s amount=%d paisa", payment_id, amount)

    elif event_type == "payment.failed":
        entity = event.get("payload", {}).get("payment", {}).get("entity", {})
        payment_id = entity.get("id", "unknown")
        retry_count = _webhook_retry_counts.get(payment_id, 0)

        if retry_count < 3:
            _webhook_retry_counts[payment_id] = retry_count + 1
            logger.warning(
                "Payment failed: id=%s retry=%d/3",
                payment_id,
                retry_count + 1,
            )
        else:
            logger.error(
                "Payment failed permanently after 3 retries: id=%s",
                payment_id,
            )
            # In production: notify user, suspend subscription, etc.

    else:
        logger.info("Unhandled Razorpay webhook event: %s", event_type)

    return {"status": "processed", "event": event_type}


# ── GET /usage — Current usage stats vs plan limits ───────────────


@router.get(
    "/usage",
    response_model=UsageResponse,
    summary="Current usage stats",
)
async def get_usage(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("billing", "read")),
) -> UsageResponse:
    """Get current usage statistics versus plan limits.

    Queries actual database counts for leads, voice analyses (call minutes),
    campaigns, etc. and compares against the plan's limits.
    """
    from sqlalchemy import func

    from api.models.campaign import Campaign as CampaignModel
    from api.models.crm import Lead
    from api.models.voice import VoiceAnalysis

    user_id = _get_user_id_str(current_user)
    sub = _subscriptions.get(user_id)

    if sub:
        plan_id = sub["plan_id"]
        plan_status = sub["status"]
        billing_cycle = sub["billing_cycle"]
        period_end = sub.get("current_period_end")
    else:
        plan_id = current_user.get("plan", "starter")
        plan_status = "trialing"
        billing_cycle = "monthly"
        period_end = None

    plan = PLANS.get(plan_id, PLANS["starter"])

    # Get numeric user_id for ORM queries
    raw_uid = current_user.get("id", 1)
    try:
        numeric_uid = int(raw_uid)
    except (ValueError, TypeError):
        numeric_uid = 1

    # Count actual usage
    lead_count = (
        db.query(func.count(Lead.id))
        .filter(Lead.user_id == numeric_uid)
        .scalar()
    ) or 0

    voice_count = (
        db.query(func.count(VoiceAnalysis.id))
        .filter(VoiceAnalysis.user_id == numeric_uid)
        .scalar()
    ) or 0

    # Estimate call minutes from voice analysis durations
    total_call_seconds = (
        db.query(func.coalesce(func.sum(VoiceAnalysis.audio_duration_seconds), 0))
        .filter(VoiceAnalysis.user_id == numeric_uid)
        .scalar()
    ) or 0
    call_minutes_used = int(total_call_seconds / 60)

    campaign_count = (
        db.query(func.count(CampaignModel.id))
        .filter(
            CampaignModel.user_id == numeric_uid,
            CampaignModel.is_deleted == False,  # noqa: E712
        )
        .scalar()
    ) or 0

    return UsageResponse(
        plan_id=plan_id,
        plan_name=plan["name"],
        status=plan_status,
        billing_cycle=billing_cycle,
        current_period_end=period_end,
        usage={
            "leads": lead_count,
            "call_minutes": call_minutes_used,
            "voice_analyses": voice_count,
            "campaigns": campaign_count,
        },
        limits={
            "max_leads": plan["max_leads"],
            "max_call_minutes": plan["max_call_minutes"],
            "max_users": plan["max_users"],
            "max_assistants": plan["max_assistants"],
            "max_workflows": plan["max_workflows"],
            "max_integrations": plan["max_integrations"],
        },
    )
