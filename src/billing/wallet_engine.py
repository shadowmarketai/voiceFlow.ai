"""
WalletEngine + CallBillingManager
==================================
Prepaid wallet system for VoiceFlow AI.

Architecture:
  WalletEngine      — balance reads, recharges, ledger writes
  CallBillingManager — pre-authorize → tick-deduct (30s) → settle

All amounts in PAISE (₹1 = 100 paise). No floats in critical paths.

Pipeline preset costs (per minute in paise):
  budget        → 140 paise/min  (₹1.40)
  low_latency   → 200 paise/min  (₹2.00)
  tamil_native  → 250 paise/min  (₹2.50)
  high_quality  → 290 paise/min  (₹2.90)
  premium       → 350 paise/min  (₹3.50, Gemini Live S2S)

Low-balance alert thresholds (paise):
  50000 → ₹500   warn
  20000 → ₹200   warn
   5000 → ₹50    critical
   1000 → ₹10    critical — n8n WhatsApp alert

Environment variables:
  RAZORPAY_KEY_ID         Razorpay live/test key
  RAZORPAY_KEY_SECRET     Razorpay secret
  N8N_BASE_URL            n8n instance for low-balance WhatsApp alerts
  N8N_WEBHOOK_KEY         Bearer token for n8n webhook auth (optional)
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import os
import time
from dataclasses import dataclass, field

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# ── Preset cost catalog (paise / minute) ────────────────────────────────────
PRESET_COST_PAISE_PER_MIN: dict[str, int] = {
    "budget":       140,
    "low_latency":  200,
    "tamil_native": 250,
    "high_quality": 290,
    "premium":      350,   # Gemini Live S2S
}

# Max call pre-auth = 30 minutes at highest rate
_MAX_HOLD_PAISE = 350 * 30

_LOW_BALANCE_THRESHOLDS = [50000, 20000, 5000, 1000]  # paise

_RAZORPAY_KEY_ID     = os.getenv("RAZORPAY_KEY_ID", "")
_RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")
_RAZORPAY_BASE       = "https://api.razorpay.com/v1"

_N8N_BASE = os.getenv("N8N_BASE_URL", "")
_N8N_KEY  = os.getenv("N8N_WEBHOOK_KEY", "")


# ─────────────────────────────────────────────────────────────────────────────
# Data classes
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class WalletBalance:
    tenant_id: str
    balance_paise: int
    reserved_paise: int
    available_paise: int   # balance - reserved
    balance_inr: float     = field(init=False)
    available_inr: float   = field(init=False)

    def __post_init__(self):
        self.balance_inr   = self.balance_paise / 100
        self.available_inr = self.available_paise / 100


@dataclass
class CallHold:
    hold_id: int
    call_id: str
    reserved_paise: int
    pipeline_preset: str


# ─────────────────────────────────────────────────────────────────────────────
# WalletEngine
# ─────────────────────────────────────────────────────────────────────────────

class WalletEngine:
    """Atomic wallet operations backed by PostgreSQL + Redis advisory locks."""

    def __init__(self, db: AsyncSession):
        self._db = db

    # ── Reads ────────────────────────────────────────────────────────────────

    async def get_balance(self, tenant_id: str) -> WalletBalance:
        row = await self._db.execute(
            text("SELECT balance_paise, reserved_paise FROM wallets WHERE tenant_id = :t"),
            {"t": tenant_id},
        )
        r = row.first()
        if r is None:
            return WalletBalance(tenant_id, 0, 0, 0)
        bal   = int(r.balance_paise)
        resv  = int(r.reserved_paise)
        return WalletBalance(tenant_id, bal, resv, max(0, bal - resv))

    async def has_sufficient_balance(self, tenant_id: str, paise: int) -> bool:
        wb = await self.get_balance(tenant_id)
        return wb.available_paise >= paise

    # ── Wallet creation ──────────────────────────────────────────────────────

    async def ensure_wallet(self, tenant_id: str) -> None:
        await self._db.execute(
            text("""
                INSERT INTO wallets (tenant_id)
                VALUES (:t)
                ON CONFLICT (tenant_id) DO NOTHING
            """),
            {"t": tenant_id},
        )
        await self._db.commit()

    # ── Recharge flow (Razorpay) ─────────────────────────────────────────────

    async def create_recharge_order(
        self,
        tenant_id: str,
        amount_paise: int,
        bonus_paise: int = 0,
    ) -> dict:
        """Create a Razorpay order. Returns order dict including order_id."""
        gst_paise  = round(amount_paise * 0.18)
        total_paise = amount_paise + gst_paise

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{_RAZORPAY_BASE}/orders",
                auth=(_RAZORPAY_KEY_ID, _RAZORPAY_KEY_SECRET),
                json={
                    "amount": total_paise,
                    "currency": "INR",
                    "receipt": f"recharge_{tenant_id}_{int(time.time())}",
                    "notes": {
                        "tenant_id": tenant_id,
                        "wallet_amount_paise": amount_paise,
                        "gst_paise": gst_paise,
                        "bonus_paise": bonus_paise,
                    },
                },
                timeout=10,
            )
            resp.raise_for_status()
            order = resp.json()

        # Record in recharges table
        wallet_row = await self._db.execute(
            text("SELECT id FROM wallets WHERE tenant_id = :t"), {"t": tenant_id}
        )
        wallet_id = wallet_row.scalar_one()

        await self._db.execute(
            text("""
                INSERT INTO recharges
                  (tenant_id, wallet_id, razorpay_order_id, amount_paise, gst_paise, bonus_paise, status)
                VALUES (:tenant, :wid, :order_id, :amt, :gst, :bonus, 'created')
            """),
            {
                "tenant": tenant_id,
                "wid": wallet_id,
                "order_id": order["id"],
                "amt": amount_paise,
                "gst": gst_paise,
                "bonus": bonus_paise,
            },
        )
        await self._db.commit()
        return order

    async def verify_and_credit(
        self,
        tenant_id: str,
        razorpay_order_id: str,
        razorpay_payment_id: str,
        razorpay_signature: str,
    ) -> WalletBalance:
        """Verify Razorpay signature and credit wallet. Idempotent."""
        # Signature verification
        expected = hmac.new(
            _RAZORPAY_KEY_SECRET.encode(),
            f"{razorpay_order_id}|{razorpay_payment_id}".encode(),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, razorpay_signature):
            raise ValueError("Invalid Razorpay signature")

        # Fetch recharge record
        row = await self._db.execute(
            text("""
                SELECT id, wallet_id, amount_paise, bonus_paise, status
                FROM recharges
                WHERE razorpay_order_id = :oid AND tenant_id = :t
            """),
            {"oid": razorpay_order_id, "t": tenant_id},
        )
        rec = row.first()
        if rec is None:
            raise ValueError("Recharge order not found")
        if rec.status == "paid":
            return await self.get_balance(tenant_id)  # idempotent

        total_credited = int(rec.amount_paise) + int(rec.bonus_paise)

        # Atomic credit
        await self._db.execute(
            text("UPDATE wallets SET balance_paise = balance_paise + :amt WHERE id = :wid"),
            {"amt": total_credited, "wid": rec.wallet_id},
        )
        await self._db.execute(
            text("""
                UPDATE recharges
                SET status = 'paid',
                    razorpay_payment_id = :pid,
                    total_credited_paise = :credited,
                    paid_at = NOW()
                WHERE id = :rid
            """),
            {"pid": razorpay_payment_id, "credited": total_credited, "rid": rec.id},
        )
        await self._db.execute(
            text("""
                INSERT INTO wallet_transactions
                  (wallet_id, tenant_id, txn_type, amount_paise, balance_after_paise,
                   reference_id, description, razorpay_payment_id)
                SELECT w.id, :tenant, 'recharge', :amt,
                       w.balance_paise, :pid, :desc, :pid
                FROM wallets w WHERE w.id = :wid
            """),
            {
                "tenant": tenant_id,
                "amt": total_credited,
                "pid": razorpay_payment_id,
                "desc": f"Wallet recharge — ₹{int(rec.amount_paise)//100} + ₹{int(rec.bonus_paise)//100} bonus",
                "wid": rec.wallet_id,
            },
        )
        await self._db.commit()

        wb = await self.get_balance(tenant_id)
        asyncio.create_task(self._check_alert_cleared(tenant_id))
        return wb

    # ── Low-balance alerts ───────────────────────────────────────────────────

    async def _check_low_balance(self, tenant_id: str, balance_paise: int) -> None:
        """Fire WhatsApp alert via n8n if balance crosses a threshold."""
        if not _N8N_BASE:
            return
        for threshold in _LOW_BALANCE_THRESHOLDS:
            if balance_paise <= threshold:
                await self._send_low_balance_alert(tenant_id, balance_paise, threshold)
                return

    async def _send_low_balance_alert(
        self, tenant_id: str, balance_paise: int, threshold_paise: int
    ) -> None:
        try:
            headers = {}
            if _N8N_KEY:
                headers["Authorization"] = f"Bearer {_N8N_KEY}"
            async with httpx.AsyncClient(timeout=5) as client:
                await client.post(
                    f"{_N8N_BASE}/webhook/send-whatsapp",
                    json={
                        "phone": tenant_id,  # resolved to phone by caller
                        "message": (
                            f"VoiceFlow AI: உங்கள் wallet balance ₹{balance_paise//100} மட்டுமே உள்ளது. "
                            f"Call minutes குறைவாக உள்ளன. இப்போதே recharge செய்யுங்கள்."
                        ),
                    },
                    headers=headers,
                )
        except Exception as exc:
            logger.warning("Low-balance alert failed for %s: %s", tenant_id, exc)

    async def _check_alert_cleared(self, tenant_id: str) -> None:
        """After a recharge, reset the alerted flag if balance is now healthy."""
        await self._db.execute(
            text("UPDATE wallets SET low_balance_alerted = FALSE WHERE tenant_id = :t"),
            {"t": tenant_id},
        )
        await self._db.commit()


# ─────────────────────────────────────────────────────────────────────────────
# CallBillingManager  — pre-auth → tick-deduct → settle
# ─────────────────────────────────────────────────────────────────────────────

class CallBillingManager:
    """Manages per-call billing lifecycle using pre-authorization holds."""

    def __init__(self, db: AsyncSession):
        self._db    = db
        self._engine = WalletEngine(db)

    # ── 1. Pre-authorize call ────────────────────────────────────────────────

    async def pre_authorize_call(
        self,
        tenant_id: str,
        call_id: str,
        pipeline_preset: str = "low_latency",
    ) -> CallHold | None:
        """
        Reserve funds for a call at call-start.
        Returns None if insufficient balance (call should be blocked).
        """
        cost_per_min = PRESET_COST_PAISE_PER_MIN.get(pipeline_preset, 200)
        hold_paise   = min(cost_per_min * 30, _MAX_HOLD_PAISE)  # max 30 min

        if not await self._engine.has_sufficient_balance(tenant_id, hold_paise):
            logger.warning(
                "Insufficient balance for %s (need %d paise, preset=%s)",
                tenant_id, hold_paise, pipeline_preset,
            )
            return None

        wallet_row = await self._db.execute(
            text("SELECT id, balance_paise, reserved_paise FROM wallets WHERE tenant_id = :t"),
            {"t": tenant_id},
        )
        w = wallet_row.first()
        if w is None:
            return None

        await self._db.execute(
            text("UPDATE wallets SET reserved_paise = reserved_paise + :h WHERE id = :wid"),
            {"h": hold_paise, "wid": w.id},
        )
        result = await self._db.execute(
            text("""
                INSERT INTO call_holds
                  (wallet_id, tenant_id, call_id, reserved_paise, pipeline_preset, status)
                VALUES (:wid, :tenant, :cid, :hp, :preset, 'held')
                RETURNING id
            """),
            {
                "wid": w.id,
                "tenant": tenant_id,
                "cid": call_id,
                "hp": hold_paise,
                "preset": pipeline_preset,
            },
        )
        hold_id = result.scalar_one()
        await self._db.commit()

        logger.info("Pre-authorized %d paise for call %s (%s)", hold_paise, call_id, pipeline_preset)
        return CallHold(hold_id, call_id, hold_paise, pipeline_preset)

    # ── 2. Tick-deduct every 30 seconds ─────────────────────────────────────

    async def tick_deduct(
        self,
        tenant_id: str,
        call_id: str,
        seconds: int = 30,
    ) -> int:
        """Deduct for `seconds` of call time. Returns actual paise deducted."""
        hold_row = await self._db.execute(
            text("""
                SELECT h.id, h.wallet_id, h.pipeline_preset, h.reserved_paise,
                       w.balance_paise
                FROM call_holds h
                JOIN wallets w ON w.id = h.wallet_id
                WHERE h.call_id = :cid AND h.tenant_id = :t AND h.status = 'held'
            """),
            {"cid": call_id, "t": tenant_id},
        )
        h = hold_row.first()
        if h is None:
            return 0

        cost_per_min = PRESET_COST_PAISE_PER_MIN.get(h.pipeline_preset, 200)
        deduct_paise = round(cost_per_min * seconds / 60)

        if int(h.balance_paise) < deduct_paise:
            deduct_paise = int(h.balance_paise)  # deduct whatever remains

        await self._db.execute(
            text("""
                UPDATE wallets
                SET balance_paise = balance_paise - :d
                WHERE id = :wid AND balance_paise >= :d
            """),
            {"d": deduct_paise, "wid": h.wallet_id},
        )
        await self._db.execute(
            text("""
                INSERT INTO wallet_transactions
                  (wallet_id, tenant_id, txn_type, amount_paise, balance_after_paise, reference_id, description)
                SELECT :wid, :tenant, 'deduct', :d, balance_paise, :cid, :desc
                FROM wallets WHERE id = :wid
            """),
            {
                "wid": h.wallet_id,
                "tenant": tenant_id,
                "d": deduct_paise,
                "cid": call_id,
                "desc": f"30s tick — {h.pipeline_preset}",
            },
        )
        await self._db.commit()

        # Check low balance asynchronously
        new_bal = int(h.balance_paise) - deduct_paise
        asyncio.create_task(self._engine._check_low_balance(tenant_id, new_bal))

        return deduct_paise

    # ── 3. Settle call at end ────────────────────────────────────────────────

    async def settle_call(
        self,
        tenant_id: str,
        call_id: str,
        actual_duration_sec: int,
    ) -> dict:
        """
        Settle the call:
          - Calculate exact cost for actual duration
          - Release any over-held reserved amount
          - Mark hold as settled
        Returns summary dict.
        """
        hold_row = await self._db.execute(
            text("""
                SELECT h.id, h.wallet_id, h.pipeline_preset, h.reserved_paise
                FROM call_holds h
                WHERE h.call_id = :cid AND h.tenant_id = :t AND h.status = 'held'
            """),
            {"cid": call_id, "t": tenant_id},
        )
        h = hold_row.first()
        if h is None:
            return {"status": "not_found"}

        cost_per_min   = PRESET_COST_PAISE_PER_MIN.get(h.pipeline_preset, 200)
        exact_paise    = round(cost_per_min * actual_duration_sec / 60)
        release_paise  = max(0, int(h.reserved_paise) - exact_paise)

        # Release over-held amount from reserved
        await self._db.execute(
            text("UPDATE wallets SET reserved_paise = reserved_paise - :r WHERE id = :wid"),
            {"r": int(h.reserved_paise), "wid": h.wallet_id},
        )
        # Mark hold settled
        await self._db.execute(
            text("""
                UPDATE call_holds
                SET status = 'settled', settled_paise = :ep,
                    duration_sec = :dur, settled_at = NOW()
                WHERE id = :hid
            """),
            {"ep": exact_paise, "dur": actual_duration_sec, "hid": h.id},
        )
        if release_paise > 0:
            await self._db.execute(
                text("""
                    INSERT INTO wallet_transactions
                      (wallet_id, tenant_id, txn_type, amount_paise,
                       balance_after_paise, reference_id, description)
                    SELECT :wid, :tenant, 'release', :rel, balance_paise, :cid, :desc
                    FROM wallets WHERE id = :wid
                """),
                {
                    "wid": h.wallet_id,
                    "tenant": tenant_id,
                    "rel": release_paise,
                    "cid": call_id,
                    "desc": f"Release over-held — {h.pipeline_preset}",
                },
            )
        await self._db.commit()

        logger.info(
            "Settled call %s: %ds, ₹%.2f (%s)",
            call_id, actual_duration_sec, exact_paise / 100, h.pipeline_preset,
        )
        return {
            "call_id": call_id,
            "status": "settled",
            "preset": h.pipeline_preset,
            "duration_sec": actual_duration_sec,
            "cost_paise": exact_paise,
            "cost_inr": round(exact_paise / 100, 2),
            "released_paise": release_paise,
        }

    async def release_hold(self, tenant_id: str, call_id: str) -> None:
        """Release a hold without charging (call failed / dropped before billing)."""
        hold_row = await self._db.execute(
            text("""
                SELECT h.id, h.wallet_id, h.reserved_paise
                FROM call_holds h
                WHERE h.call_id = :cid AND h.tenant_id = :t AND h.status = 'held'
            """),
            {"cid": call_id, "t": tenant_id},
        )
        h = hold_row.first()
        if h is None:
            return
        await self._db.execute(
            text("UPDATE wallets SET reserved_paise = reserved_paise - :r WHERE id = :wid"),
            {"r": int(h.reserved_paise), "wid": h.wallet_id},
        )
        await self._db.execute(
            text("UPDATE call_holds SET status = 'released', settled_at = NOW() WHERE id = :hid"),
            {"hid": h.id},
        )
        await self._db.commit()
