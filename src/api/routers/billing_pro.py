"""
Billing Pro router — pricing catalog, cost calculator, wallet, recharge.

Client endpoints (platform_fee hidden from response breakdown):
    GET  /api/v1/billing/catalog
    GET  /api/v1/billing/presets
    POST /api/v1/billing/calculate
    GET  /api/v1/billing/wallet
    GET  /api/v1/billing/wallet/transactions
    POST /api/v1/billing/wallet/recharge/order
    POST /api/v1/billing/wallet/recharge/verify
    GET  /api/v1/billing/rate-plan
    POST /api/v1/billing/wallet/debit         # internal (call settlement)

Agency endpoints (full margin visible):
    GET  /api/v1/billing/admin/rate-plan/{tenant_id}
    PUT  /api/v1/billing/admin/rate-plan/{tenant_id}
    POST /api/v1/billing/admin/calculate       # with full margin
    POST /api/v1/billing/admin/wallet/credit
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Header, status
from pydantic import BaseModel, Field

from api.services import pricing, wallet_service
from api.services.pricing import COST_CATALOG, PRESETS, RECHARGE_PACKS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])


# ─── Tenant resolution (stub; plug into your real auth) ────────────────────

def _current_tenant(x_tenant_id: str | None = Header(default=None)) -> str:
    """Resolve tenant id. Accepts `X-Tenant-Id` header, falls back to 'default'."""
    return x_tenant_id or "default"


def _require_admin(x_admin_token: str | None = Header(default=None)) -> bool:
    """Tiny agency-admin gate. Set ADMIN_TOKEN env var in production."""
    expected = os.getenv("ADMIN_TOKEN", "dev-admin-token")
    if not x_admin_token or not hmac.compare_digest(x_admin_token, expected):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin token required")
    return True


# ─── Pricing catalog ───────────────────────────────────────────────────────

@router.get("/catalog")
def get_catalog() -> dict[str, Any]:
    """Full provider pricing table + presets — used by the cost calculator UI."""
    return {"catalog": COST_CATALOG, "presets": PRESETS, "recharge_packs": RECHARGE_PACKS}


@router.get("/presets")
def get_presets() -> dict[str, Any]:
    return {"presets": PRESETS}


# ─── Calculate (client-facing — hides platform fee) ────────────────────────

class CalculateRequest(BaseModel):
    stt: str
    llm: str
    tts: str
    telephony: str
    duration_min: float = 1.0
    monthly_minutes: int | None = None     # optional — also return monthly estimate


@router.post("/calculate")
def calculate(req: CalculateRequest, tenant_id: str = Depends(_current_tenant)) -> dict[str, Any]:
    """Calculate cost using tenant's rate plan. Platform fee is hidden from breakdown."""
    plan = wallet_service.get_rate_plan(tenant_id)
    result = pricing.calculate_cost(
        stt=req.stt, llm=req.llm, tts=req.tts, telephony=req.telephony,
        platform_fee_paise=plan.platform_fee_paise,
        ai_markup_pct=plan.ai_markup_pct,
        telephony_markup_pct=plan.telephony_markup_pct,
        min_floor_paise=plan.min_floor_paise,
        duration_min=req.duration_min,
        hide_platform_fee=True,
    )
    # Strip agency-only fields for client view
    result.pop("your_cost_per_min", None)
    result.pop("margin_per_min", None)
    result.pop("margin_pct", None)

    if req.monthly_minutes:
        result["monthly_estimate"] = round(result["per_minute"] * req.monthly_minutes, 2)
    return result


# ─── Rate plan (client-readable, no platform fee) ──────────────────────────

@router.get("/rate-plan")
def get_my_rate_plan(tenant_id: str = Depends(_current_tenant)) -> dict[str, Any]:
    plan = wallet_service.get_rate_plan(tenant_id)
    return {
        "stt": plan.stt_provider,
        "llm": plan.llm_provider,
        "tts": plan.tts_provider,
        "telephony": plan.telephony_provider,
        "tier": plan.tier,
        "lock_llm": plan.lock_llm,
        "lock_tts": plan.lock_tts,
        # platform_fee intentionally hidden from client
    }


class UpdateMyConfigRequest(BaseModel):
    stt: str | None = None
    llm: str | None = None
    tts: str | None = None
    telephony: str | None = None


@router.post("/rate-plan/providers")
def update_my_providers(req: UpdateMyConfigRequest, tenant_id: str = Depends(_current_tenant)) -> dict[str, Any]:
    """Client can change their provider selections (unless locked by admin)."""
    plan = wallet_service.get_rate_plan(tenant_id)
    updates: dict[str, Any] = {}
    if req.stt is not None and req.stt in COST_CATALOG["stt"]:
        updates["stt_provider"] = req.stt
    if req.llm is not None and req.llm in COST_CATALOG["llm"]:
        if plan.lock_llm:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "LLM choice is locked by admin")
        updates["llm_provider"] = req.llm
    if req.tts is not None and req.tts in COST_CATALOG["tts"]:
        if plan.lock_tts:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "TTS choice is locked by admin")
        updates["tts_provider"] = req.tts
    if req.telephony is not None and req.telephony in COST_CATALOG["telephony"]:
        updates["telephony_provider"] = req.telephony
    wallet_service.update_rate_plan(tenant_id, **updates)
    return {"success": True, "updated": list(updates.keys())}


# ─── Wallet ────────────────────────────────────────────────────────────────

@router.get("/wallet")
def wallet_balance(tenant_id: str = Depends(_current_tenant)) -> dict[str, Any]:
    bal = wallet_service.get_balance(tenant_id)
    plan = wallet_service.get_rate_plan(tenant_id)
    calc = pricing.calculate_cost(
        stt=plan.stt_provider, llm=plan.llm_provider, tts=plan.tts_provider,
        telephony=plan.telephony_provider,
        platform_fee_paise=plan.platform_fee_paise,
        ai_markup_pct=plan.ai_markup_pct,
        telephony_markup_pct=plan.telephony_markup_pct,
        min_floor_paise=plan.min_floor_paise, hide_platform_fee=True,
    )
    rate_per_min = calc["per_minute"]
    mins_left = (bal["balance_inr"] / rate_per_min) if rate_per_min else 0.0
    return {
        **bal,
        "current_rate_inr_per_min": rate_per_min,
        "minutes_remaining": round(mins_left, 1),
        "calls_remaining_approx": int(mins_left / 3),  # avg 3-min call
    }


@router.get("/wallet/transactions")
def wallet_transactions(
    limit: int = 50, offset: int = 0,
    tenant_id: str = Depends(_current_tenant),
) -> dict[str, Any]:
    return {"transactions": wallet_service.list_transactions(tenant_id, limit, offset)}


class RechargeOrderRequest(BaseModel):
    amount_inr: float = Field(ge=100, le=1000000)


@router.post("/wallet/recharge/order")
def create_recharge_order(req: RechargeOrderRequest, tenant_id: str = Depends(_current_tenant)) -> dict[str, Any]:
    """Create a recharge order. If Razorpay keys are configured, uses Razorpay; otherwise returns a stub order for testing."""
    summary = pricing.recharge_summary(req.amount_inr)

    rz_key = os.getenv("RAZORPAY_KEY_ID")
    rz_secret = os.getenv("RAZORPAY_KEY_SECRET")
    receipt = f"rchg_{tenant_id}_{int(time.time())}"

    if rz_key and rz_secret:
        try:
            import razorpay
            client = razorpay.Client(auth=(rz_key, rz_secret))
            order = client.order.create({
                "amount": int(req.amount_inr * 100),
                "currency": "INR",
                "receipt": receipt,
                "notes": {"tenant_id": tenant_id, "bonus_inr": summary["bonus"]},
            })
            return {
                "order_id": order["id"],
                "amount_paise": order["amount"],
                "currency": "INR",
                "key_id": rz_key,
                "receipt": receipt,
                "summary": summary,
                "gateway": "razorpay",
            }
        except Exception as exc:
            logger.warning("Razorpay order failed: %s — falling back to stub", exc)

    # Stub order for dev/testing — still returns a valid payload
    return {
        "order_id": f"stub_{receipt}_{secrets.token_hex(4)}",
        "amount_paise": int(req.amount_inr * 100),
        "currency": "INR",
        "key_id": "stub",
        "receipt": receipt,
        "summary": summary,
        "gateway": "stub",
        "note": "Razorpay keys not configured — order is a stub; POST /verify to credit wallet",
    }


class RechargeVerifyRequest(BaseModel):
    order_id: str
    payment_id: str = ""
    signature: str = ""
    amount_inr: float


@router.post("/wallet/recharge/verify")
def verify_recharge(req: RechargeVerifyRequest, tenant_id: str = Depends(_current_tenant)) -> dict[str, Any]:
    """Verify Razorpay payment signature → credit wallet with bonus."""
    rz_secret = os.getenv("RAZORPAY_KEY_SECRET")
    if rz_secret and req.signature and not req.order_id.startswith("stub_"):
        expected = hmac.new(
            rz_secret.encode(), f"{req.order_id}|{req.payment_id}".encode(), hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, req.signature):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid payment signature")
    summary = pricing.recharge_summary(req.amount_inr)
    credits_paise = int(summary["credits"] * 100)
    wallet_service.credit(
        tenant_id, credits_paise,
        reference_id=req.payment_id or req.order_id,
        description=f"Recharge ₹{req.amount_inr:.2f} (+ ₹{summary['bonus']} bonus)",
    )
    return {"success": True, "credited_inr": summary["credits"], "summary": summary}


class DebitRequest(BaseModel):
    amount_inr: float
    reference_id: str
    description: str = "Call charge"


@router.post("/wallet/debit")
def wallet_debit(req: DebitRequest, tenant_id: str = Depends(_current_tenant)) -> dict[str, Any]:
    """Internal call-settlement debit. Not gated — trust auth at gateway level."""
    try:
        return wallet_service.debit(
            tenant_id, int(round(req.amount_inr * 100)),
            reference_id=req.reference_id, description=req.description,
        )
    except wallet_service.InsufficientFundsError as e:
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, str(e))
    except wallet_service.WalletBlockedError as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(e))


# ═══ AGENCY (ADMIN) ENDPOINTS ══════════════════════════════════════════════

@router.post("/admin/calculate", dependencies=[Depends(_require_admin)])
def admin_calculate(req: CalculateRequest, x_tenant_id: str | None = Header(default=None)) -> dict[str, Any]:
    """Same as /calculate but returns FULL margin breakdown (platform fee visible)."""
    target_tenant = x_tenant_id or "default"
    plan = wallet_service.get_rate_plan(target_tenant)
    return pricing.calculate_cost(
        stt=req.stt, llm=req.llm, tts=req.tts, telephony=req.telephony,
        platform_fee_paise=plan.platform_fee_paise,
        ai_markup_pct=plan.ai_markup_pct,
        telephony_markup_pct=plan.telephony_markup_pct,
        min_floor_paise=plan.min_floor_paise,
        duration_min=req.duration_min,
        hide_platform_fee=False,
    )


@router.get("/admin/rate-plan/{tenant_id}", dependencies=[Depends(_require_admin)])
def admin_get_rate_plan(tenant_id: str) -> dict[str, Any]:
    plan = wallet_service.get_rate_plan(tenant_id)
    return {
        "tenant_id": tenant_id,
        "stt": plan.stt_provider,
        "llm": plan.llm_provider,
        "tts": plan.tts_provider,
        "telephony": plan.telephony_provider,
        "platform_fee_inr": round(plan.platform_fee_paise / 100, 2),
        "ai_markup_pct": plan.ai_markup_pct,
        "telephony_markup_pct": plan.telephony_markup_pct,
        "min_floor_inr": round(plan.min_floor_paise / 100, 2),
        "lock_llm": plan.lock_llm,
        "lock_tts": plan.lock_tts,
        "tier": plan.tier,
    }


class AdminRatePlanUpdate(BaseModel):
    stt: str | None = None
    llm: str | None = None
    tts: str | None = None
    telephony: str | None = None
    platform_fee_inr: float | None = None
    ai_markup_pct: int | None = None
    telephony_markup_pct: int | None = None
    min_floor_inr: float | None = None
    lock_llm: bool | None = None
    lock_tts: bool | None = None
    tier: str | None = None


@router.put("/admin/rate-plan/{tenant_id}", dependencies=[Depends(_require_admin)])
def admin_update_rate_plan(tenant_id: str, req: AdminRatePlanUpdate) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    if req.stt is not None: updates["stt_provider"] = req.stt
    if req.llm is not None: updates["llm_provider"] = req.llm
    if req.tts is not None: updates["tts_provider"] = req.tts
    if req.telephony is not None: updates["telephony_provider"] = req.telephony
    if req.platform_fee_inr is not None: updates["platform_fee_paise"] = int(round(req.platform_fee_inr * 100))
    if req.min_floor_inr is not None: updates["min_floor_paise"] = int(round(req.min_floor_inr * 100))
    for k in ("ai_markup_pct", "telephony_markup_pct", "lock_llm", "lock_tts", "tier"):
        v = getattr(req, k)
        if v is not None:
            updates[k] = v
    wallet_service.update_rate_plan(tenant_id, **updates)
    return {"success": True, "updated_fields": list(updates.keys())}


class AdminCreditRequest(BaseModel):
    tenant_id: str
    amount_inr: float
    note: str = "Manual credit by admin"


@router.post("/admin/wallet/credit", dependencies=[Depends(_require_admin)])
def admin_credit(req: AdminCreditRequest) -> dict[str, Any]:
    wallet_service.credit(
        req.tenant_id, int(round(req.amount_inr * 100)),
        reference_id=f"admin_credit_{int(time.time())}", description=req.note,
    )
    return {"success": True, "credited_inr": req.amount_inr}
