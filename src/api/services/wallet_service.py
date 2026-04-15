"""
Wallet operations — atomic credit/debit + transaction ledger.

All amounts in PAISE. Uses row-level locking (FOR UPDATE) to avoid
double-debits on concurrent calls.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from api.database import get_session_factory
from api.models.billing_wallet import RatePlan, Wallet, WalletTransaction


class InsufficientFundsError(Exception):
    pass


class WalletBlockedError(Exception):
    pass


def _get_or_create_wallet(session, tenant_id: str) -> Wallet:
    w = session.get(Wallet, ident=None, options=None) if False else None
    w = session.execute(select(Wallet).where(Wallet.tenant_id == tenant_id)).scalar_one_or_none()
    if w is None:
        w = Wallet(tenant_id=tenant_id, balance_paise=0)
        session.add(w)
        try:
            session.flush()
        except IntegrityError:
            session.rollback()
            w = session.execute(select(Wallet).where(Wallet.tenant_id == tenant_id)).scalar_one()
    return w


def get_balance(tenant_id: str) -> dict[str, Any]:
    with get_session_factory()() as s:
        w = _get_or_create_wallet(s, tenant_id)
        s.commit()
        return {
            "tenant_id": tenant_id,
            "balance_paise": int(w.balance_paise),
            "balance_inr": round(w.balance_paise / 100, 2),
            "status": w.status,
            "low_balance_threshold_inr": round(w.low_balance_threshold_paise / 100, 2),
            "auto_recharge_enabled": w.auto_recharge_enabled,
            "auto_recharge_amount_inr": round(w.auto_recharge_amount_paise / 100, 2),
        }


def credit(tenant_id: str, amount_paise: int, reference_id: str, description: str = "Credit") -> dict[str, Any]:
    if amount_paise <= 0:
        raise ValueError("amount must be positive")
    with get_session_factory()() as s:
        w = _get_or_create_wallet(s, tenant_id)
        w.balance_paise = int(w.balance_paise) + amount_paise
        if w.status == "suspended":
            w.status = "active"
        s.add(WalletTransaction(
            tenant_id=tenant_id, type="credit", amount_paise=amount_paise,
            balance_after_paise=w.balance_paise, reference_id=reference_id,
            description=description,
        ))
        s.commit()
        return {"success": True, "balance_paise": int(w.balance_paise)}


def debit(tenant_id: str, amount_paise: int, reference_id: str, description: str = "Debit") -> dict[str, Any]:
    if amount_paise <= 0:
        raise ValueError("amount must be positive")
    with get_session_factory()() as s:
        # Lock the row
        row = s.execute(
            select(Wallet).where(Wallet.tenant_id == tenant_id).with_for_update()
        ).scalar_one_or_none()
        if row is None:
            row = Wallet(tenant_id=tenant_id, balance_paise=0)
            s.add(row)
            s.flush()
        if row.status == "blocked":
            raise WalletBlockedError("Wallet is blocked")
        if int(row.balance_paise) < amount_paise:
            raise InsufficientFundsError(
                f"Need ₹{amount_paise/100:.2f}, have ₹{row.balance_paise/100:.2f}"
            )
        row.balance_paise = int(row.balance_paise) - amount_paise
        s.add(WalletTransaction(
            tenant_id=tenant_id, type="debit", amount_paise=amount_paise,
            balance_after_paise=row.balance_paise, reference_id=reference_id,
            description=description,
        ))
        s.commit()
        return {"success": True, "balance_paise": int(row.balance_paise)}


def list_transactions(tenant_id: str, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
    with get_session_factory()() as s:
        rows = s.execute(
            select(WalletTransaction)
            .where(WalletTransaction.tenant_id == tenant_id)
            .order_by(WalletTransaction.created_at.desc())
            .limit(limit).offset(offset)
        ).scalars().all()
        return [
            {
                "id": r.id,
                "type": r.type,
                "amount_inr": round(r.amount_paise / 100, 2),
                "balance_after_inr": round(r.balance_after_paise / 100, 2),
                "reference_id": r.reference_id,
                "description": r.description,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]


# ─── Rate plans ────────────────────────────────────────────────────────────

def get_rate_plan(tenant_id: str) -> RatePlan:
    with get_session_factory()() as s:
        plan = s.get(RatePlan, tenant_id)
        if plan is None:
            plan = RatePlan(tenant_id=tenant_id)
            s.add(plan)
            s.commit()
            s.refresh(plan)
        s.expunge(plan)
        return plan


def update_rate_plan(tenant_id: str, **updates) -> RatePlan:
    allowed = {
        "stt_provider", "llm_provider", "tts_provider", "telephony_provider",
        "platform_fee_paise", "ai_markup_pct", "telephony_markup_pct",
        "min_floor_paise", "lock_llm", "lock_tts", "tier",
    }
    with get_session_factory()() as s:
        plan = s.get(RatePlan, tenant_id)
        if plan is None:
            plan = RatePlan(tenant_id=tenant_id)
            s.add(plan)
        for k, v in updates.items():
            if k in allowed and v is not None:
                setattr(plan, k, v)
        s.commit()
        s.refresh(plan)
        s.expunge(plan)
        return plan
