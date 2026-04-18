"""
VoiceFlow Marketing AI - Billing & Subscription System
=======================================================
Razorpay integration for Indian payments

Features:
- Subscription management
- Credit system for usage-based billing
- Invoice generation
- Usage tracking
- Razorpay payment gateway
"""

import hashlib
import hmac
import json
import os
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any

import httpx


class PaymentStatus(Enum):
    """Payment status"""
    PENDING = "pending"
    AUTHORIZED = "authorized"
    CAPTURED = "captured"
    FAILED = "failed"
    REFUNDED = "refunded"


class SubscriptionStatus(Enum):
    """Subscription status"""
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELLED = "cancelled"
    TRIALING = "trialing"
    PAUSED = "paused"


@dataclass
class Plan:
    """Subscription plan"""
    id: str
    name: str
    slug: str
    price_monthly: float
    price_yearly: float
    currency: str = "INR"

    # Limits
    max_users: int = 1
    max_leads: int = 500
    max_call_minutes: int = 1000
    max_assistants: int = 1
    max_workflows: int = 5
    max_integrations: int = 2

    # Features
    features: list[str] = field(default_factory=list)
    is_popular: bool = False

    # Razorpay plan ID
    razorpay_monthly_plan_id: str | None = None
    razorpay_yearly_plan_id: str | None = None


@dataclass
class Subscription:
    """Tenant subscription"""
    id: str
    tenant_id: str
    plan_id: str

    status: SubscriptionStatus = SubscriptionStatus.TRIALING
    billing_cycle: str = "monthly"  # monthly, yearly

    # Dates
    trial_ends_at: datetime | None = None
    current_period_start: datetime | None = None
    current_period_end: datetime | None = None
    cancelled_at: datetime | None = None

    # Razorpay
    razorpay_subscription_id: str | None = None
    razorpay_customer_id: str | None = None

    # Credits
    credit_balance: float = 0.0
    call_minutes_used: int = 0

    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)


@dataclass
class Invoice:
    """Invoice record"""
    id: str
    tenant_id: str
    subscription_id: str

    amount: float
    currency: str = "INR"
    status: str = "pending"  # pending, paid, failed

    # Razorpay
    razorpay_invoice_id: str | None = None
    razorpay_payment_id: str | None = None

    # Details
    line_items: list[dict] = field(default_factory=list)
    tax_amount: float = 0.0
    discount_amount: float = 0.0

    # Dates
    invoice_date: datetime = field(default_factory=datetime.now)
    due_date: datetime | None = None
    paid_at: datetime | None = None

    # PDF
    pdf_url: str | None = None


@dataclass
class CreditTransaction:
    """Credit transaction record"""
    id: str
    tenant_id: str

    amount: float
    balance_after: float

    transaction_type: str  # credit, debit, refund
    description: str

    # Reference
    reference_type: str | None = None  # call, sms, api
    reference_id: str | None = None

    created_at: datetime = field(default_factory=datetime.now)


class RazorpayClient:
    """
    Razorpay API client
    """

    def __init__(self):
        self.key_id = os.getenv("RAZORPAY_KEY_ID")
        self.key_secret = os.getenv("RAZORPAY_KEY_SECRET")
        self.base_url = "https://api.razorpay.com/v1"
        self.webhook_secret = os.getenv("RAZORPAY_WEBHOOK_SECRET")

    def _get_auth(self):
        """Get basic auth tuple"""
        return (self.key_id, self.key_secret)

    async def create_customer(
        self,
        name: str,
        email: str,
        phone: str,
        notes: dict = None
    ) -> dict[str, Any]:
        """Create Razorpay customer"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/customers",
                auth=self._get_auth(),
                json={
                    "name": name,
                    "email": email,
                    "contact": phone,
                    "notes": notes or {}
                }
            )
            response.raise_for_status()
            return response.json()

    async def create_plan(
        self,
        plan_name: str,
        amount: int,  # In paise
        period: str = "monthly",
        interval: int = 1,
        notes: dict = None
    ) -> dict[str, Any]:
        """Create Razorpay subscription plan"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/plans",
                auth=self._get_auth(),
                json={
                    "period": period,
                    "interval": interval,
                    "item": {
                        "name": plan_name,
                        "amount": amount,
                        "currency": "INR"
                    },
                    "notes": notes or {}
                }
            )
            response.raise_for_status()
            return response.json()

    async def create_subscription(
        self,
        plan_id: str,
        customer_id: str,
        total_count: int = 12,  # Number of billing cycles
        notes: dict = None
    ) -> dict[str, Any]:
        """Create Razorpay subscription"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/subscriptions",
                auth=self._get_auth(),
                json={
                    "plan_id": plan_id,
                    "customer_id": customer_id,
                    "total_count": total_count,
                    "customer_notify": 1,
                    "notes": notes or {}
                }
            )
            response.raise_for_status()
            return response.json()

    async def cancel_subscription(
        self,
        subscription_id: str,
        cancel_at_cycle_end: bool = True
    ) -> dict[str, Any]:
        """Cancel Razorpay subscription"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/subscriptions/{subscription_id}/cancel",
                auth=self._get_auth(),
                json={"cancel_at_cycle_end": cancel_at_cycle_end}
            )
            response.raise_for_status()
            return response.json()

    async def create_order(
        self,
        amount: int,  # In paise
        currency: str = "INR",
        receipt: str = None,
        notes: dict = None
    ) -> dict[str, Any]:
        """Create Razorpay order for one-time payment"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/orders",
                auth=self._get_auth(),
                json={
                    "amount": amount,
                    "currency": currency,
                    "receipt": receipt or secrets.token_urlsafe(16),
                    "notes": notes or {}
                }
            )
            response.raise_for_status()
            return response.json()

    async def capture_payment(
        self,
        payment_id: str,
        amount: int
    ) -> dict[str, Any]:
        """Capture authorized payment"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/payments/{payment_id}/capture",
                auth=self._get_auth(),
                json={"amount": amount}
            )
            response.raise_for_status()
            return response.json()

    async def create_refund(
        self,
        payment_id: str,
        amount: int = None
    ) -> dict[str, Any]:
        """Create refund"""
        async with httpx.AsyncClient() as client:
            data = {}
            if amount:
                data["amount"] = amount

            response = await client.post(
                f"{self.base_url}/payments/{payment_id}/refund",
                auth=self._get_auth(),
                json=data
            )
            response.raise_for_status()
            return response.json()

    def verify_webhook_signature(
        self,
        payload: bytes,
        signature: str
    ) -> bool:
        """Verify Razorpay webhook signature"""
        if not self.webhook_secret:
            return True

        expected = hmac.new(
            self.webhook_secret.encode(),
            payload,
            hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(expected, signature)

    def verify_payment_signature(
        self,
        order_id: str,
        payment_id: str,
        signature: str
    ) -> bool:
        """Verify payment signature"""
        message = f"{order_id}|{payment_id}"
        expected = hmac.new(
            self.key_secret.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(expected, signature)


class BillingService:
    """
    Billing and subscription management
    """

    # Default plans
    DEFAULT_PLANS = {
        "starter": Plan(
            id="starter",
            name="Starter",
            slug="starter",
            price_monthly=4999,
            price_yearly=49990,
            max_users=1,
            max_leads=500,
            max_call_minutes=1000,
            max_assistants=1,
            max_workflows=5,
            max_integrations=2,
            features=[
                "500 leads",
                "1,000 call minutes",
                "1 AI assistant",
                "Basic integrations",
                "Email support"
            ]
        ),
        "growth": Plan(
            id="growth",
            name="Growth",
            slug="growth",
            price_monthly=14999,
            price_yearly=149990,
            max_users=5,
            max_leads=5000,
            max_call_minutes=5000,
            max_assistants=3,
            max_workflows=10,
            max_integrations=10,
            is_popular=True,
            features=[
                "5,000 leads",
                "5,000 call minutes",
                "3 AI assistants",
                "All integrations",
                "Automation workflows",
                "WhatsApp integration",
                "Priority support"
            ]
        ),
        "pro": Plan(
            id="pro",
            name="Pro",
            slug="pro",
            price_monthly=39999,
            price_yearly=399990,
            max_users=999999,
            max_leads=999999,
            max_call_minutes=20000,
            max_assistants=999999,
            max_workflows=999999,
            max_integrations=999999,
            features=[
                "Unlimited leads",
                "20,000 call minutes",
                "Unlimited AI assistants",
                "White-label option",
                "API access",
                "Custom integrations",
                "Dedicated support"
            ]
        ),
        "enterprise": Plan(
            id="enterprise",
            name="Enterprise",
            slug="enterprise",
            price_monthly=99999,
            price_yearly=999990,
            max_users=999999,
            max_leads=999999,
            max_call_minutes=999999,
            max_assistants=999999,
            max_workflows=999999,
            max_integrations=999999,
            features=[
                "Everything in Pro",
                "Unlimited call minutes",
                "On-premise deployment",
                "Custom AI training",
                "SLA guarantee",
                "Dedicated account manager"
            ]
        )
    }

    # Usage-based pricing
    USAGE_PRICING = {
        "call_minute": 1.50,      # ₹1.50 per extra minute
        "sms": 0.50,              # ₹0.50 per SMS
        "whatsapp": 0.75,         # ₹0.75 per WhatsApp message
        "ai_token": 0.0005,       # ₹0.0005 per token
        "storage_gb": 50,         # ₹50 per GB per month
        "phone_number": 500       # ₹500 per number per month
    }

    # Credit packages
    CREDIT_PACKAGES = [
        {"amount": 2000, "credits": 2000, "bonus": 0},
        {"amount": 5000, "credits": 5250, "bonus": 250},
        {"amount": 8000, "credits": 8800, "bonus": 800},
        {"amount": 10000, "credits": 11500, "bonus": 1500},
        {"amount": 15000, "credits": 18000, "bonus": 3000}
    ]

    def __init__(self, db=None):
        self.db = db
        self.razorpay = RazorpayClient()

        # In-memory storage (use DB in production)
        self._subscriptions: dict[str, Subscription] = {}
        self._invoices: dict[str, Invoice] = {}
        self._transactions: list[CreditTransaction] = []

    def get_plans(self) -> list[Plan]:
        """Get all available plans"""
        return list(self.DEFAULT_PLANS.values())

    def get_plan(self, plan_id: str) -> Plan | None:
        """Get plan by ID"""
        return self.DEFAULT_PLANS.get(plan_id)

    async def create_subscription(
        self,
        tenant_id: str,
        plan_id: str,
        billing_cycle: str = "monthly",
        customer_name: str = "",
        customer_email: str = "",
        customer_phone: str = "",
        trial_days: int = 14
    ) -> Subscription:
        """
        Create a new subscription
        """
        plan = self.get_plan(plan_id)
        if not plan:
            raise ValueError(f"Invalid plan: {plan_id}")

        # Create Razorpay customer
        customer = await self.razorpay.create_customer(
            name=customer_name,
            email=customer_email,
            phone=customer_phone,
            notes={"tenant_id": tenant_id}
        )

        # Create Razorpay subscription
        razorpay_plan_id = (
            plan.razorpay_monthly_plan_id if billing_cycle == "monthly"
            else plan.razorpay_yearly_plan_id
        )

        if razorpay_plan_id:
            rz_subscription = await self.razorpay.create_subscription(
                plan_id=razorpay_plan_id,
                customer_id=customer["id"],
                notes={"tenant_id": tenant_id}
            )
        else:
            rz_subscription = {"id": None}

        # Create subscription record
        now = datetime.now()
        subscription = Subscription(
            id=secrets.token_urlsafe(16),
            tenant_id=tenant_id,
            plan_id=plan_id,
            status=SubscriptionStatus.TRIALING,
            billing_cycle=billing_cycle,
            trial_ends_at=now + timedelta(days=trial_days),
            current_period_start=now,
            current_period_end=now + timedelta(days=30 if billing_cycle == "monthly" else 365),
            razorpay_subscription_id=rz_subscription.get("id"),
            razorpay_customer_id=customer["id"]
        )

        self._subscriptions[subscription.id] = subscription

        return subscription

    async def activate_subscription(
        self,
        subscription_id: str,
        payment_id: str = None
    ) -> Subscription:
        """
        Activate subscription after successful payment
        """
        subscription = self._subscriptions.get(subscription_id)
        if not subscription:
            raise ValueError("Subscription not found")

        subscription.status = SubscriptionStatus.ACTIVE
        subscription.trial_ends_at = None
        subscription.updated_at = datetime.now()

        # Create invoice for first payment
        plan = self.get_plan(subscription.plan_id)
        price = (
            plan.price_monthly if subscription.billing_cycle == "monthly"
            else plan.price_yearly
        )

        invoice = Invoice(
            id=secrets.token_urlsafe(16),
            tenant_id=subscription.tenant_id,
            subscription_id=subscription.id,
            amount=price,
            status="paid",
            razorpay_payment_id=payment_id,
            paid_at=datetime.now(),
            line_items=[{
                "description": f"{plan.name} Plan ({subscription.billing_cycle})",
                "quantity": 1,
                "amount": price
            }]
        )

        self._invoices[invoice.id] = invoice

        return subscription

    async def cancel_subscription(
        self,
        subscription_id: str,
        cancel_immediately: bool = False
    ) -> Subscription:
        """
        Cancel subscription
        """
        subscription = self._subscriptions.get(subscription_id)
        if not subscription:
            raise ValueError("Subscription not found")

        # Cancel in Razorpay
        if subscription.razorpay_subscription_id:
            await self.razorpay.cancel_subscription(
                subscription.razorpay_subscription_id,
                cancel_at_cycle_end=not cancel_immediately
            )

        if cancel_immediately:
            subscription.status = SubscriptionStatus.CANCELLED
        else:
            # Will cancel at period end
            subscription.cancelled_at = datetime.now()

        subscription.updated_at = datetime.now()

        return subscription

    async def upgrade_subscription(
        self,
        subscription_id: str,
        new_plan_id: str
    ) -> dict[str, Any]:
        """
        Upgrade subscription to higher plan
        
        Returns proration amount
        """
        subscription = self._subscriptions.get(subscription_id)
        if not subscription:
            raise ValueError("Subscription not found")

        old_plan = self.get_plan(subscription.plan_id)
        new_plan = self.get_plan(new_plan_id)

        if not new_plan:
            raise ValueError("Invalid new plan")

        # Calculate proration
        days_remaining = (subscription.current_period_end - datetime.now()).days
        total_days = 30 if subscription.billing_cycle == "monthly" else 365

        old_daily = old_plan.price_monthly / total_days
        new_daily = new_plan.price_monthly / total_days

        proration = (new_daily - old_daily) * days_remaining

        return {
            "subscription_id": subscription_id,
            "old_plan": old_plan.name,
            "new_plan": new_plan.name,
            "proration_amount": max(0, proration),
            "days_remaining": days_remaining,
            "effective_immediately": True
        }

    async def add_credits(
        self,
        tenant_id: str,
        amount_inr: float,
        payment_id: str = None
    ) -> CreditTransaction:
        """
        Add credits to tenant account
        """
        # Find matching package
        package = None
        for pkg in self.CREDIT_PACKAGES:
            if pkg["amount"] == amount_inr:
                package = pkg
                break

        if not package:
            # Custom amount without bonus
            credits = amount_inr
        else:
            credits = package["credits"]

        # Get current subscription
        subscription = self._get_tenant_subscription(tenant_id)
        if not subscription:
            raise ValueError("No active subscription")

        # Update balance
        old_balance = subscription.credit_balance
        subscription.credit_balance += credits

        # Create transaction
        transaction = CreditTransaction(
            id=secrets.token_urlsafe(16),
            tenant_id=tenant_id,
            amount=credits,
            balance_after=subscription.credit_balance,
            transaction_type="credit",
            description=f"Added ₹{amount_inr} credits",
            reference_type="payment",
            reference_id=payment_id
        )

        self._transactions.append(transaction)

        return transaction

    def deduct_credits(
        self,
        tenant_id: str,
        amount: float,
        description: str,
        reference_type: str = None,
        reference_id: str = None
    ) -> CreditTransaction:
        """
        Deduct credits for usage
        """
        subscription = self._get_tenant_subscription(tenant_id)
        if not subscription:
            raise ValueError("No active subscription")

        if subscription.credit_balance < amount:
            raise ValueError("Insufficient credits")

        subscription.credit_balance -= amount

        transaction = CreditTransaction(
            id=secrets.token_urlsafe(16),
            tenant_id=tenant_id,
            amount=-amount,
            balance_after=subscription.credit_balance,
            transaction_type="debit",
            description=description,
            reference_type=reference_type,
            reference_id=reference_id
        )

        self._transactions.append(transaction)

        return transaction

    def record_call_usage(
        self,
        tenant_id: str,
        duration_minutes: float,
        call_id: str
    ) -> dict[str, Any]:
        """
        Record call usage and deduct if over limit
        """
        subscription = self._get_tenant_subscription(tenant_id)
        if not subscription:
            raise ValueError("No active subscription")

        plan = self.get_plan(subscription.plan_id)

        # Update usage
        subscription.call_minutes_used += int(duration_minutes)

        result = {
            "minutes_used": duration_minutes,
            "total_used": subscription.call_minutes_used,
            "limit": plan.max_call_minutes,
            "overage": False,
            "charge": 0
        }

        # Check for overage
        if subscription.call_minutes_used > plan.max_call_minutes:
            overage = subscription.call_minutes_used - plan.max_call_minutes
            charge = overage * self.USAGE_PRICING["call_minute"]

            result["overage"] = True
            result["charge"] = charge
            result["overage_minutes"] = overage

            # Deduct from credits
            if subscription.credit_balance >= charge:
                self.deduct_credits(
                    tenant_id=tenant_id,
                    amount=charge,
                    description=f"Overage: {overage} extra call minutes",
                    reference_type="call",
                    reference_id=call_id
                )
                result["charged_to_credits"] = True

        return result

    async def create_payment_order(
        self,
        tenant_id: str,
        amount: float,
        purpose: str = "credits"
    ) -> dict[str, Any]:
        """
        Create Razorpay order for one-time payment
        """
        order = await self.razorpay.create_order(
            amount=int(amount * 100),  # Convert to paise
            receipt=f"{tenant_id}_{purpose}_{secrets.token_urlsafe(8)}",
            notes={
                "tenant_id": tenant_id,
                "purpose": purpose
            }
        )

        return {
            "order_id": order["id"],
            "amount": amount,
            "currency": "INR",
            "key_id": self.razorpay.key_id,
            "notes": order.get("notes", {})
        }

    def verify_payment(
        self,
        order_id: str,
        payment_id: str,
        signature: str
    ) -> bool:
        """
        Verify Razorpay payment
        """
        return self.razorpay.verify_payment_signature(
            order_id=order_id,
            payment_id=payment_id,
            signature=signature
        )

    async def handle_webhook(
        self,
        payload: bytes,
        signature: str
    ) -> dict[str, Any]:
        """
        Handle Razorpay webhook events
        """
        # Verify signature
        if not self.razorpay.verify_webhook_signature(payload, signature):
            raise ValueError("Invalid webhook signature")

        event = json.loads(payload)
        event_type = event.get("event")

        if event_type == "subscription.activated":
            # Activate subscription
            subscription_id = event["payload"]["subscription"]["entity"]["id"]
            # Find and activate...

        elif event_type == "subscription.charged":
            # Create invoice for recurring payment
            pass

        elif event_type == "subscription.cancelled":
            # Mark subscription as cancelled
            pass

        elif event_type == "payment.captured":
            # Payment successful
            pass

        elif event_type == "payment.failed":
            # Handle failed payment
            pass

        return {"status": "processed", "event": event_type}

    def get_usage_summary(
        self,
        tenant_id: str
    ) -> dict[str, Any]:
        """
        Get usage summary for tenant
        """
        subscription = self._get_tenant_subscription(tenant_id)
        if not subscription:
            return {"error": "No subscription found"}

        plan = self.get_plan(subscription.plan_id)

        return {
            "plan": plan.name,
            "status": subscription.status.value,
            "billing_cycle": subscription.billing_cycle,
            "current_period_end": subscription.current_period_end.isoformat() if subscription.current_period_end else None,
            "usage": {
                "call_minutes": {
                    "used": subscription.call_minutes_used,
                    "limit": plan.max_call_minutes,
                    "percentage": (subscription.call_minutes_used / plan.max_call_minutes) * 100
                }
            },
            "credits": {
                "balance": subscription.credit_balance,
                "can_purchase": True
            }
        }

    def get_invoices(
        self,
        tenant_id: str,
        limit: int = 10
    ) -> list[Invoice]:
        """
        Get tenant invoices
        """
        return [
            inv for inv in self._invoices.values()
            if inv.tenant_id == tenant_id
        ][:limit]

    def get_transactions(
        self,
        tenant_id: str,
        limit: int = 50
    ) -> list[CreditTransaction]:
        """
        Get credit transactions
        """
        return [
            tx for tx in self._transactions
            if tx.tenant_id == tenant_id
        ][:limit]

    def _get_tenant_subscription(
        self,
        tenant_id: str
    ) -> Subscription | None:
        """Get active subscription for tenant"""
        for sub in self._subscriptions.values():
            if sub.tenant_id == tenant_id and sub.status in [
                SubscriptionStatus.ACTIVE,
                SubscriptionStatus.TRIALING
            ]:
                return sub
        return None


# ============================================
# FastAPI Endpoints
# ============================================

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

billing_router = APIRouter(prefix="/api/v1/billing", tags=["Billing"])

# Request models
class CreateSubscriptionRequest(BaseModel):
    plan_id: str
    billing_cycle: str = "monthly"
    customer_name: str
    customer_email: str
    customer_phone: str


class AddCreditsRequest(BaseModel):
    amount: float


class VerifyPaymentRequest(BaseModel):
    order_id: str
    payment_id: str
    signature: str


# Initialize service
billing_service = BillingService()


@billing_router.get("/plans")
async def get_plans():
    """Get available subscription plans"""
    plans = billing_service.get_plans()
    return {
        "plans": [
            {
                "id": p.id,
                "name": p.name,
                "price_monthly": p.price_monthly,
                "price_yearly": p.price_yearly,
                "features": p.features,
                "is_popular": p.is_popular,
                "limits": {
                    "users": p.max_users,
                    "leads": p.max_leads,
                    "call_minutes": p.max_call_minutes,
                    "assistants": p.max_assistants
                }
            }
            for p in plans
        ]
    }


@billing_router.post("/subscribe")
async def create_subscription(
    request: CreateSubscriptionRequest,
    tenant_id: str = "demo_tenant"  # Get from auth in production
):
    """Create new subscription"""
    try:
        subscription = await billing_service.create_subscription(
            tenant_id=tenant_id,
            plan_id=request.plan_id,
            billing_cycle=request.billing_cycle,
            customer_name=request.customer_name,
            customer_email=request.customer_email,
            customer_phone=request.customer_phone
        )

        return {
            "subscription_id": subscription.id,
            "status": subscription.status.value,
            "trial_ends_at": subscription.trial_ends_at.isoformat() if subscription.trial_ends_at else None,
            "razorpay_subscription_id": subscription.razorpay_subscription_id
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@billing_router.get("/usage")
async def get_usage(
    tenant_id: str = "demo_tenant"
):
    """Get usage summary"""
    return billing_service.get_usage_summary(tenant_id)


@billing_router.post("/credits/add")
async def add_credits(
    request: AddCreditsRequest,
    tenant_id: str = "demo_tenant"
):
    """Create order to add credits"""
    try:
        order = await billing_service.create_payment_order(
            tenant_id=tenant_id,
            amount=request.amount,
            purpose="credits"
        )
        return order
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@billing_router.post("/verify-payment")
async def verify_payment(
    request: VerifyPaymentRequest,
    tenant_id: str = "demo_tenant"
):
    """Verify Razorpay payment"""
    if billing_service.verify_payment(
        order_id=request.order_id,
        payment_id=request.payment_id,
        signature=request.signature
    ):
        # Add credits or activate subscription based on order
        return {"verified": True, "message": "Payment verified successfully"}
    else:
        raise HTTPException(status_code=400, detail="Payment verification failed")


@billing_router.get("/invoices")
async def get_invoices(
    tenant_id: str = "demo_tenant"
):
    """Get invoices"""
    invoices = billing_service.get_invoices(tenant_id)
    return {
        "invoices": [
            {
                "id": inv.id,
                "amount": inv.amount,
                "status": inv.status,
                "date": inv.invoice_date.isoformat(),
                "paid_at": inv.paid_at.isoformat() if inv.paid_at else None
            }
            for inv in invoices
        ]
    }


@billing_router.post("/webhooks/razorpay")
async def razorpay_webhook(request: Request):
    """Handle Razorpay webhooks"""
    payload = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")

    try:
        result = await billing_service.handle_webhook(payload, signature)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
