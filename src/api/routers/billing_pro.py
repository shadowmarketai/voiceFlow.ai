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

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field

from api.database import USE_POSTGRES, db
from api.services import pricing, wallet_service
from api.services.auth_service import AuthService
from api.services.pricing import COST_CATALOG, PRESETS, RECHARGE_PACKS

logger = logging.getLogger(__name__)

_bp = "%s" if USE_POSTGRES else "?"


def _db_recharge_packs() -> list[dict]:
    """Load recharge packs from DB; return empty list on any error."""
    try:
        with db() as conn:
            rows = conn.execute(
                "SELECT id,name,price,bonus,is_active,sort_order FROM recharge_packs "
                "WHERE is_active=1 ORDER BY sort_order"
            ).fetchall()
            return [dict(r) for r in rows]
    except Exception:
        return []

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])


# ─── Tenant resolution (stub; plug into your real auth) ────────────────────

def _current_tenant(
    request: Request,
    x_tenant_id: str | None = Header(default=None),
) -> str:
    """Resolve tenant_id.

    Priority:
    1. X-Tenant-Id header (legacy / explicit override)
    2. tenant_id field inside the JWT Bearer token (normal browser flow)
    3. email lookup in users table (fallback when tenant_id not in JWT)
    4. 'default' (last resort)
    """
    if x_tenant_id:
        return x_tenant_id

    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth.split(" ", 1)[1]
        if token == "demo-token-123":
            return "tenant-demo"
        try:
            payload = AuthService.decode_token(token)
            # Prefer explicit tenant_id in JWT
            tid = payload.get("tenant_id")
            if tid:
                return tid
            # Fall back to DB lookup by email (sub claim)
            email = payload.get("sub")
            if email:
                with db() as conn:
                    row = conn.execute(
                        "SELECT tenant_id FROM users WHERE email=?", (email,)
                    ).fetchone()
                    if row and row[0]:
                        return row[0]
        except Exception:
            pass

    return "default"


def _require_admin(
    request: Request,
    x_admin_token: str | None = Header(default=None),
) -> bool:
    """Admin gate: accepts either the ADMIN_TOKEN header OR a valid JWT super admin.

    This allows logged-in super admins to manage base platform costs without
    needing a separate admin token.
    """
    # 1. Static token check (original mechanism)
    expected = os.getenv("ADMIN_TOKEN", "dev-admin-token")
    if x_admin_token and hmac.compare_digest(x_admin_token, expected):
        return True

    # 2. JWT super-admin check — look for Bearer token in Authorization header
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        try:
            payload = AuthService.decode_token(token)
            if payload.get("is_super_admin") or payload.get("role") == "super_admin":
                return True
            # Also check the DB for is_super_admin flag
            user_id = payload.get("user_id") or payload.get("sub")
            if user_id:
                with db() as conn:
                    row = conn.execute(
                        "SELECT is_super_admin FROM users WHERE id=? OR email=?",
                        (user_id, user_id),
                    ).fetchone()
                    if row and row["is_super_admin"]:
                        return True
        except Exception:
            pass

    raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")


# ─── Pricing catalog ───────────────────────────────────────────────────────

@router.get("/catalog")
def get_catalog() -> dict[str, Any]:
    """Full provider pricing table + presets — used by the cost calculator UI.
    Recharge packs are loaded from DB if available, else fallback to pricing.py constants.
    """
    db_packs = _db_recharge_packs()
    if db_packs:
        packs = [
            {"amount": float(p["price"]), "bonus": float(p["bonus"]),
             "label": p["name"], "popular": p["name"] == "Popular"}
            for p in db_packs
        ]
    else:
        packs = RECHARGE_PACKS
    return {"catalog": COST_CATALOG, "presets": PRESETS, "recharge_packs": packs}


@router.get("/presets")
def get_presets() -> dict[str, Any]:
    return {"presets": PRESETS}


@router.get("/presets-with-prices")
def get_presets_with_prices(
    tenant_id: str = Depends(_current_tenant),
    view: str = "user",
) -> dict[str, Any]:
    """
    Return the 5 presets with computed per-minute price for the current
    caller's rate plan. This is what every non-super-admin UI renders —
    providers stay hidden.

    view="user"   → end-user price (what they actually pay)
    view="tenant" → "your cost" (what we charge a tenant)
    """
    plan = wallet_service.get_rate_plan(tenant_id)
    out = []
    for preset in PRESETS:
        calc = pricing.calculate_cost(
            stt=preset["stt"], llm=preset["llm"], tts=preset["tts"],
            telephony=preset["telephony"],
            platform_fee_paise=plan.platform_fee_paise,
            ai_markup_pct=plan.ai_markup_pct,
            telephony_markup_pct=plan.telephony_markup_pct,
            min_floor_paise=plan.min_floor_paise,
            tenant_fee_paise=plan.tenant_fee_paise,
            tenant_ai_markup_pct=plan.tenant_ai_markup_pct,
            view=view,
        )
        row = {
            "id": preset["id"],
            "name": preset["name"],
            "icon": preset["icon"],
            "per_minute": calc["per_minute"],
        }
        if view == "tenant":
            row["tenant_cost"] = calc.get("tenant_cost")
            row["user_price"] = calc.get("user_price")
            row["tenant_margin"] = calc.get("tenant_margin")
        out.append(row)
    return {"presets": out}


class SelectPresetRequest(BaseModel):
    preset_id: str


@router.post("/rate-plan/preset")
def select_preset(req: SelectPresetRequest, tenant_id: str = Depends(_current_tenant)) -> dict[str, Any]:
    """User picks one of the 5 presets — backend updates stt/llm/tts/telephony accordingly."""
    preset = next((p for p in PRESETS if p["id"] == req.preset_id), None)
    if preset is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown preset: {req.preset_id}")
    plan = wallet_service.get_rate_plan(tenant_id)
    # Respect admin locks — if LLM/TTS is locked, reject switch that would change them
    if plan.lock_llm and preset["llm"] != plan.llm_provider:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
            "LLM is locked by admin — contact support to change plan")
    if plan.lock_tts and preset["tts"] != plan.tts_provider:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
            "TTS is locked by admin — contact support to change plan")
    wallet_service.update_rate_plan(
        tenant_id,
        stt_provider=preset["stt"],
        llm_provider=preset["llm"],
        tts_provider=preset["tts"],
        telephony_provider=preset["telephony"],
    )
    return {"success": True, "preset_id": req.preset_id, "providers": preset}


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
    """User-view calculation (end-user of a tenant). Shows only final total, no fees."""
    plan = wallet_service.get_rate_plan(tenant_id)
    result = pricing.calculate_cost(
        stt=req.stt, llm=req.llm, tts=req.tts, telephony=req.telephony,
        platform_fee_paise=plan.platform_fee_paise,
        ai_markup_pct=plan.ai_markup_pct,
        telephony_markup_pct=plan.telephony_markup_pct,
        min_floor_paise=plan.min_floor_paise,
        tenant_fee_paise=plan.tenant_fee_paise,
        tenant_ai_markup_pct=plan.tenant_ai_markup_pct,
        duration_min=req.duration_min,
        view="user",
    )
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
        min_floor_paise=plan.min_floor_paise,
        tenant_fee_paise=plan.tenant_fee_paise,
        tenant_ai_markup_pct=plan.tenant_ai_markup_pct,
        view="user",
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
    amount_inr: float | None = None    # explicit amount (legacy) OR auto-calculate from agent
    reference_id: str
    description: str = "Call charge"
    agent_id: str | None = None        # if set, auto-calculate cost from agent config
    duration_sec: float | None = None  # required when agent_id is set
    channel: str = "webrtc"


@router.post("/wallet/debit")
def wallet_debit(req: DebitRequest, tenant_id: str = Depends(_current_tenant)) -> dict[str, Any]:
    """Call settlement debit.

    Two modes:
    1. Legacy: pass amount_inr directly (pre-calculated by caller).
    2. Agent-aware: pass agent_id + duration_sec → auto-calculates from
       the agent's actual config × plan multiplier.
    """
    try:
        if req.agent_id and req.duration_sec is not None:
            return wallet_service.settle_call_from_agent(
                tenant_id=tenant_id,
                agent_id=req.agent_id,
                call_id=req.reference_id,
                duration_sec=req.duration_sec,
                channel=req.channel,
            )
        if req.amount_inr is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                "Either amount_inr or (agent_id + duration_sec) is required")
        return wallet_service.debit(
            tenant_id, int(round(req.amount_inr * 100)),
            reference_id=req.reference_id, description=req.description,
        )
    except wallet_service.InsufficientFundsError as e:
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, str(e))
    except wallet_service.WalletBlockedError as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))


# ── Provider validation (for AgentBuilder live cost check) ────────────────

class ValidateProvidersRequest(BaseModel):
    llmProvider: str | None = None
    llmModel: str | None = None
    ttsEngine: str | None = None
    telephonyProvider: str | None = None


@router.post("/validate-providers")
def validate_providers(
    req: ValidateProvidersRequest,
    tenant_id: str = Depends(_current_tenant),
) -> dict[str, Any]:
    """Check if the current tenant's plan allows the selected providers.

    Returns allowed status, estimated cost, and tier details.
    Used by AgentBuilder for live cost display + tier gating.
    """
    import json as _json

    agent_config = {
        "llmProvider": req.llmProvider or "groq",
        "llmModel": req.llmModel or "default",
        "ttsEngine": req.ttsEngine,
        "telephonyProvider": req.telephonyProvider,
    }

    # Check access
    from api.services.agents_store import validate_agent_providers
    validation_error = validate_agent_providers(tenant_id, agent_config)

    # Calculate cost
    providers = pricing.resolve_agent_providers(agent_config)
    llm_tier = pricing.get_provider_tier("llm", providers["llm"])

    # Get plan multiplier
    multiplier = 1.0
    allowed_tiers = ["free", "budget", "standard"]
    plan_name = "starter"
    try:
        with db() as conn:
            row = conn.execute(
                f"SELECT plan_id FROM platform_tenants WHERE id={_bp}", (tenant_id,)
            ).fetchone()
            plan_id = dict(row).get("plan_id", "starter") if row else "starter"
            plan_row = conn.execute(
                f"SELECT plan_multiplier, allowed_provider_tiers, name FROM plans WHERE id={_bp}",
                (plan_id,),
            ).fetchone()
            if plan_row:
                pr = dict(plan_row)
                m = pr.get("plan_multiplier")
                multiplier = float(m) if m and float(m) > 0 else 1.0
                raw_tiers = pr.get("allowed_provider_tiers")
                if raw_tiers:
                    allowed_tiers = _json.loads(raw_tiers) if isinstance(raw_tiers, str) else raw_tiers
                plan_name = pr.get("name") or plan_id
    except Exception:
        pass

    cost = pricing.calculate_agent_cost(agent_config, plan_multiplier=multiplier)

    return {
        "allowed": validation_error is None,
        "reason": validation_error["reason"] if validation_error else None,
        "providers": providers,
        "llm_tier": llm_tier,
        "allowed_tiers": allowed_tiers,
        "plan_name": plan_name,
        "plan_multiplier": multiplier,
        "raw_per_min": cost["raw_per_min"],
        "billed_per_min": cost["billed_per_min"],
        "breakdown": cost["breakdown"],
    }


# ═══ SUBSCRIPTION PLAN SELECTION (user-facing) ════════════════════════════

@router.get("/subscription-plans")
def get_subscription_plans() -> list[dict[str, Any]]:
    """
    Return all active direct plans from the DB.
    Public endpoint — no auth required.
    Used by the plan-selection UI shown to every logged-in user.
    """
    try:
        with db() as conn:
            rows = conn.execute(
                "SELECT id, name, price, call_rate, agent_limit, voice_clones, "
                "wallet_min, calls_per_month, sort_order "
                "FROM plans "
                "WHERE plan_type='direct' AND is_active=1 "
                "ORDER BY sort_order"
            ).fetchall()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.warning("get_subscription_plans error: %s", exc)
        return []


@router.post("/select-plan")
def select_plan(
    body: dict,
    tenant_id: str = Depends(_current_tenant),
) -> dict[str, Any]:
    """
    Set the active plan for the current tenant / user.
    Updates platform_tenants.plan_id so the call_rate updates immediately.
    """
    plan_id = str(body.get("plan_id", "")).strip()
    valid = {"free_trial", "starter", "growth", "business", "enterprise"}
    if plan_id not in valid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid plan_id. Choose from: {', '.join(sorted(valid))}")

    try:
        with db() as conn:
            plan_row = conn.execute(
                f"SELECT id, name, call_rate FROM plans WHERE id={_bp}", (plan_id,)
            ).fetchone()
            if not plan_row:
                raise HTTPException(404, "Plan not found in DB")

            conn.execute(
                f"UPDATE platform_tenants SET plan_id={_bp} WHERE id={_bp}",
                (plan_id, tenant_id)
            )
        return {
            "success": True,
            "plan_id": plan_id,
            "plan_name": plan_row["name"],
            "call_rate": float(plan_row["call_rate"] or 4.50),
            "message": f"Switched to {plan_row['name']}",
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("select_plan error: %s", exc)
        raise HTTPException(500, "Could not update plan")


# ═══ AGENCY (ADMIN) ENDPOINTS ══════════════════════════════════════════════

# ═══ TENANT (WHITE-LABEL) ENDPOINTS ═══════════════════════════════════════
# A tenant can set their own fee on top of what we charge them, but cannot
# modify platform-layer fields or reduce below the platform floor.

@router.get("/tenant/rate-plan")
def tenant_get_rate_plan(tenant_id: str = Depends(_current_tenant)) -> dict[str, Any]:
    """Tenant view: what we charge them + their markup + end-user price."""
    plan = wallet_service.get_rate_plan(tenant_id)
    calc = pricing.calculate_cost(
        stt=plan.stt_provider, llm=plan.llm_provider, tts=plan.tts_provider,
        telephony=plan.telephony_provider,
        platform_fee_paise=plan.platform_fee_paise,
        ai_markup_pct=plan.ai_markup_pct,
        telephony_markup_pct=plan.telephony_markup_pct,
        min_floor_paise=plan.min_floor_paise,
        tenant_fee_paise=plan.tenant_fee_paise,
        tenant_ai_markup_pct=plan.tenant_ai_markup_pct,
        view="tenant",
    )
    return {
        "tenant_id": tenant_id,
        "providers": {
            "stt": plan.stt_provider, "llm": plan.llm_provider,
            "tts": plan.tts_provider, "telephony": plan.telephony_provider,
        },
        "tenant_cost_per_min": calc["tenant_cost"],
        "tenant_fee_inr": round(plan.tenant_fee_paise / 100, 2),
        "tenant_ai_markup_pct": plan.tenant_ai_markup_pct,
        "user_price_per_min": calc["user_price"],
        "tenant_margin_per_min": calc["tenant_margin"],
        "tenant_margin_pct": calc["tenant_margin_pct"],
        "locks_from_platform": {"lock_llm": plan.lock_llm, "lock_tts": plan.lock_tts},
        "tenant_locks_for_users": {"lock_llm": plan.tenant_lock_llm, "lock_tts": plan.tenant_lock_tts},
        "breakdown": calc["breakdown"],
    }


class TenantRatePlanUpdate(BaseModel):
    tenant_fee_inr: float | None = None             # min 0 — cannot undercut platform
    tenant_ai_markup_pct: int | None = None         # min 0
    tenant_lock_llm: bool | None = None
    tenant_lock_tts: bool | None = None


@router.put("/tenant/rate-plan")
def tenant_update_rate_plan(req: TenantRatePlanUpdate, tenant_id: str = Depends(_current_tenant)) -> dict[str, Any]:
    """Tenant updates ONLY their own markup + user-facing locks."""
    updates: dict[str, Any] = {}
    if req.tenant_fee_inr is not None:
        if req.tenant_fee_inr < 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tenant fee cannot be negative")
        updates["tenant_fee_paise"] = int(round(req.tenant_fee_inr * 100))
    if req.tenant_ai_markup_pct is not None:
        if req.tenant_ai_markup_pct < 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tenant markup cannot be negative")
        updates["tenant_ai_markup_pct"] = req.tenant_ai_markup_pct
    if req.tenant_lock_llm is not None:
        updates["tenant_lock_llm"] = req.tenant_lock_llm
    if req.tenant_lock_tts is not None:
        updates["tenant_lock_tts"] = req.tenant_lock_tts
    wallet_service.update_rate_plan(tenant_id, **updates)
    return {"success": True, "updated": list(updates.keys())}


@router.post("/tenant/calculate")
def tenant_calculate(req: CalculateRequest, tenant_id: str = Depends(_current_tenant)) -> dict[str, Any]:
    """Tenant view calculator — sees what we charge them + their margin + user price."""
    plan = wallet_service.get_rate_plan(tenant_id)
    return pricing.calculate_cost(
        stt=req.stt, llm=req.llm, tts=req.tts, telephony=req.telephony,
        platform_fee_paise=plan.platform_fee_paise,
        ai_markup_pct=plan.ai_markup_pct,
        telephony_markup_pct=plan.telephony_markup_pct,
        min_floor_paise=plan.min_floor_paise,
        tenant_fee_paise=plan.tenant_fee_paise,
        tenant_ai_markup_pct=plan.tenant_ai_markup_pct,
        duration_min=req.duration_min,
        view="tenant",
    )


# ═══ SUPER-ADMIN (PLATFORM) ENDPOINTS ═════════════════════════════════════

@router.post("/admin/calculate", dependencies=[Depends(_require_admin)])
def admin_calculate(req: CalculateRequest, x_tenant_id: str | None = Header(default=None)) -> dict[str, Any]:
    """Super admin view: full visibility into raw costs + both margin tiers."""
    target_tenant = x_tenant_id or "default"
    plan = wallet_service.get_rate_plan(target_tenant)
    return pricing.calculate_cost(
        stt=req.stt, llm=req.llm, tts=req.tts, telephony=req.telephony,
        platform_fee_paise=plan.platform_fee_paise,
        ai_markup_pct=plan.ai_markup_pct,
        telephony_markup_pct=plan.telephony_markup_pct,
        min_floor_paise=plan.min_floor_paise,
        tenant_fee_paise=plan.tenant_fee_paise,
        tenant_ai_markup_pct=plan.tenant_ai_markup_pct,
        duration_min=req.duration_min,
        view="super",
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
        # Tenant white-label layer (read-only from super-admin view)
        "tenant_fee_inr": round(plan.tenant_fee_paise / 100, 2),
        "tenant_ai_markup_pct": plan.tenant_ai_markup_pct,
        "tenant_lock_llm": plan.tenant_lock_llm,
        "tenant_lock_tts": plan.tenant_lock_tts,
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


# ═══ TENANT PLAN INFO ═════════════════════════════════════════════════════════

@router.get("/tenant/plan")
def tenant_plan_info(tenant_id: str = Depends(_current_tenant)) -> dict[str, Any]:
    """
    Return the agency platform plan for the current tenant + all agency plans
    for the upgrade modal.  Used by TenantSubclientsPage "My Plan" tab.
    """
    try:
        with db() as conn:
            tenant = conn.execute(
                f"SELECT * FROM platform_tenants WHERE id={_bp}", (tenant_id,)
            ).fetchone()
            if not tenant:
                raise HTTPException(404, "Tenant not found")
            t = dict(tenant)
            plan_id = t.get("plan_id") or "agency_starter"

            plan_row = conn.execute(
                f"SELECT * FROM plans WHERE id={_bp}", (plan_id,)
            ).fetchone()
            plan = dict(plan_row) if plan_row else {}

            # Sub-client usage — support both column naming conventions
            sub_count = 0
            for col in ("parent_agency_id", "parent_tenant_id"):
                try:
                    sub_count = conn.execute(
                        f"SELECT COUNT(*) FROM platform_tenants WHERE {col}={_bp}",
                        (tenant_id,)
                    ).fetchone()[0]
                    break
                except Exception:
                    pass

            # All agency plans — for the upgrade modal
            agency_rows = conn.execute(
                f"SELECT * FROM plans WHERE plan_type={_bp} ORDER BY COALESCE(price,0) ASC",
                ("agency",)
            ).fetchall()
            all_agency_plans = [
                {
                    "id": r["id"],
                    "name": r["name"],
                    "monthly_fee": float(r.get("price") or 0),
                    "wholesale_rate": float(r.get("wholesale_rate") or 0),
                    "sub_client_limit": r.get("sub_client_limit"),
                    "agents_per_client": r.get("agents_per_client"),
                    "voice_clones": r.get("voice_clones"),
                    "is_active": bool(r.get("is_active", True)),
                }
                for r in agency_rows
            ]

        return {
            "tenant_id": tenant_id,
            "plan_id": plan_id,
            "plan_name": plan.get("name") or plan_id,
            "monthly_fee": float(plan.get("price") or 0),
            "wholesale_rate": float(plan.get("wholesale_rate") or 0),
            "sub_client_limit": plan.get("sub_client_limit"),
            "sub_client_count": sub_count,
            "agents_per_client": plan.get("agents_per_client"),
            "voice_clones": plan.get("voice_clones"),
            "all_agency_plans": all_agency_plans,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("tenant_plan_info error: %s", exc)
        raise HTTPException(500, "Could not load plan info")


# ═══ SUB-CLIENT MANAGEMENT (tenant-facing) ════════════════════════════════════

class SubClientCreate(BaseModel):
    name: str
    contact_email: str | None = None
    plan_id: str = "starter"
    agent_limit_override: int | None = None
    markup_rate: float = 4.50


class SubClientMarkupUpdate(BaseModel):
    markup_rate: float
    agent_limit_override: int | None = None


@router.get("/tenant/sub-clients")
def list_sub_clients(tenant_id: str = Depends(_current_tenant)) -> list[dict[str, Any]]:
    """List all sub-clients belonging to this tenant (agency)."""
    try:
        with db() as conn:
            rows = conn.execute(
                f"SELECT * FROM platform_tenants WHERE parent_tenant_id={_bp} ORDER BY created_at DESC",
                (tenant_id,)
            ).fetchall()
            sub_clients = []
            for row in rows:
                sc = dict(row)
                # Agent usage
                agent_count = conn.execute(
                    f"SELECT COUNT(*) FROM users WHERE tenant_id={_bp} AND (is_admin=0 OR is_admin IS NULL)",
                    (sc["id"],)
                ).fetchone()[0]
                sc["agent_count"] = agent_count
                sub_clients.append(sc)
        return sub_clients
    except Exception as exc:
        logger.warning("list_sub_clients error: %s", exc)
        return []


@router.post("/tenant/sub-clients", status_code=201)
def create_sub_client(
    req: SubClientCreate,
    tenant_id: str = Depends(_current_tenant),
) -> dict[str, Any]:
    """Create a new sub-client under this tenant."""
    import uuid as _uuid
    new_id = f"tenant-{_uuid.uuid4().hex[:8]}"
    slug = req.name.lower().replace(" ", "-").replace("/", "-")

    # Enforce sub-client limit from plan
    try:
        with db() as conn:
            t = conn.execute(
                f"SELECT plan_id FROM platform_tenants WHERE id={_bp}", (tenant_id,)
            ).fetchone()
            plan_id = dict(t).get("plan_id", "agency_starter") if t else "agency_starter"
            plan_row = conn.execute(
                f"SELECT sub_client_limit FROM plans WHERE id={_bp}", (plan_id,)
            ).fetchone()
            limit = dict(plan_row).get("sub_client_limit") if plan_row else None
            if limit is not None:
                count = conn.execute(
                    f"SELECT COUNT(*) FROM platform_tenants WHERE parent_tenant_id={_bp}",
                    (tenant_id,)
                ).fetchone()[0]
                if count >= limit:
                    raise HTTPException(
                        status_code=402,
                        detail=f"Sub-client limit reached ({limit}). Upgrade your plan."
                    )

            conn.execute(f"""
                INSERT INTO platform_tenants
                  (id, name, slug, plan_id, is_active, parent_tenant_id,
                   markup_rate, agent_limit_override, contact_email)
                VALUES ({_bp},{_bp},{_bp},{_bp},1,{_bp},{_bp},{_bp},{_bp})
            """, (new_id, req.name, slug, req.plan_id, tenant_id,
                  req.markup_rate, req.agent_limit_override, req.contact_email))
            row = conn.execute(
                f"SELECT * FROM platform_tenants WHERE id={_bp}", (new_id,)
            ).fetchone()
        return dict(row)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("create_sub_client error: %s", exc)
        raise HTTPException(500, "Could not create sub-client")


@router.put("/tenant/sub-clients/{sub_client_id}")
def update_sub_client(
    sub_client_id: str,
    req: SubClientMarkupUpdate,
    tenant_id: str = Depends(_current_tenant),
) -> dict[str, Any]:
    """Update markup rate and/or agent limit override for a sub-client."""
    try:
        with db() as conn:
            # Verify ownership
            row = conn.execute(
                f"SELECT id FROM platform_tenants WHERE id={_bp} AND parent_tenant_id={_bp}",
                (sub_client_id, tenant_id)
            ).fetchone()
            if not row:
                raise HTTPException(404, "Sub-client not found")

            updates = {"markup_rate": req.markup_rate}
            if req.agent_limit_override is not None:
                updates["agent_limit_override"] = req.agent_limit_override

            set_clause = ", ".join(f"{k}={_bp}" for k in updates)
            vals = list(updates.values()) + [sub_client_id]
            conn.execute(
                f"UPDATE platform_tenants SET {set_clause} WHERE id={_bp}", vals
            )
            updated = conn.execute(
                f"SELECT * FROM platform_tenants WHERE id={_bp}", (sub_client_id,)
            ).fetchone()
        return dict(updated)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("update_sub_client error: %s", exc)
        raise HTTPException(500, "Could not update sub-client")
