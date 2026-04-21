"""
Wallet operations — atomic credit/debit + transaction ledger.

Uses SQLAlchemy Core (table objects, not ORM) to sidestep unrelated mapper
configuration failures elsewhere in the codebase.
All amounts in PAISE.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select, text

from api.database import USE_POSTGRES, db, get_engine
from api.models.billing_wallet import RatePlan, Wallet, WalletTransaction

# Placeholder for raw SQL (used by get_rate_plan / update_rate_plan)
_ph = "%s" if USE_POSTGRES else "?"


class InsufficientFundsError(Exception):
    pass


class WalletBlockedError(Exception):
    pass


# ── Schema bootstrap ────────────────────────────────────────────────────────
# Run create_all only for billing tables. This avoids triggering ORM mapper
# configuration for unrelated (possibly broken) models.
_TABLES_ENSURED = False


_TENANT_COLUMNS_SQL = [
    ("tenant_fee_paise", "BIGINT NOT NULL DEFAULT 0"),
    ("tenant_ai_markup_pct", "INTEGER NOT NULL DEFAULT 0"),
    ("tenant_lock_llm", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("tenant_lock_tts", "BOOLEAN NOT NULL DEFAULT FALSE"),
]


def _ensure_tables() -> None:
    global _TABLES_ENSURED
    if _TABLES_ENSURED:
        return
    engine = get_engine()
    Wallet.__table__.create(bind=engine, checkfirst=True)
    WalletTransaction.__table__.create(bind=engine, checkfirst=True)
    RatePlan.__table__.create(bind=engine, checkfirst=True)
    try:
        from api.models.billing_wallet import RechargeOrder
        RechargeOrder.__table__.create(bind=engine, checkfirst=True)
    except Exception:
        pass
    # Opportunistic ALTER for the white-label columns (safe no-op if already present).
    with engine.begin() as conn:
        for col_name, col_ddl in _TENANT_COLUMNS_SQL:
            try:
                conn.execute(text(f"ALTER TABLE billing_rate_plans ADD COLUMN {col_name} {col_ddl}"))
            except Exception:
                pass     # column already exists or dialect refused — harmless
    _TABLES_ENSURED = True


# ── Balance ────────────────────────────────────────────────────────────────

def get_balance(tenant_id: str) -> dict[str, Any]:
    _ensure_tables()
    engine = get_engine()
    w_table = Wallet.__table__
    with engine.begin() as conn:
        row = conn.execute(
            select(w_table).where(w_table.c.tenant_id == tenant_id)
        ).first()
        if row is None:
            conn.execute(w_table.insert().values(
                tenant_id=tenant_id, balance_paise=0, status="active",
                low_balance_threshold_paise=5000,
                auto_recharge_enabled=False, auto_recharge_amount_paise=0,
                auto_recharge_threshold_paise=0,
                created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
            ))
            balance = 0
            status = "active"
            threshold = 5000
            auto_en = False
            auto_amt = 0
        else:
            balance = int(row._mapping["balance_paise"])
            status = row._mapping["status"]
            threshold = int(row._mapping["low_balance_threshold_paise"])
            auto_en = bool(row._mapping["auto_recharge_enabled"])
            auto_amt = int(row._mapping["auto_recharge_amount_paise"])
    return {
        "tenant_id": tenant_id,
        "balance_paise": balance,
        "balance_inr": round(balance / 100, 2),
        "status": status,
        "low_balance_threshold_inr": round(threshold / 100, 2),
        "auto_recharge_enabled": auto_en,
        "auto_recharge_amount_inr": round(auto_amt / 100, 2),
    }


# ── Credit / debit ─────────────────────────────────────────────────────────

def credit(tenant_id: str, amount_paise: int, reference_id: str, description: str = "Credit") -> dict[str, Any]:
    if amount_paise <= 0:
        raise ValueError("amount must be positive")
    _ensure_tables()
    engine = get_engine()
    w, t = Wallet.__table__, WalletTransaction.__table__
    with engine.begin() as conn:
        row = conn.execute(select(w).where(w.c.tenant_id == tenant_id)).first()
        if row is None:
            conn.execute(w.insert().values(
                tenant_id=tenant_id, balance_paise=amount_paise, status="active",
                low_balance_threshold_paise=5000,
                auto_recharge_enabled=False, auto_recharge_amount_paise=0,
                auto_recharge_threshold_paise=0,
                created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
            ))
            new_bal = amount_paise
        else:
            new_bal = int(row._mapping["balance_paise"]) + amount_paise
            conn.execute(w.update().where(w.c.tenant_id == tenant_id).values(
                balance_paise=new_bal, status="active", updated_at=datetime.utcnow(),
            ))
        conn.execute(t.insert().values(
            tenant_id=tenant_id, type="credit", amount_paise=amount_paise,
            balance_after_paise=new_bal, reference_id=reference_id,
            description=description, meta=None, created_at=datetime.utcnow(),
        ))
    return {"success": True, "balance_paise": new_bal}


def debit(tenant_id: str, amount_paise: int, reference_id: str, description: str = "Debit") -> dict[str, Any]:
    if amount_paise <= 0:
        raise ValueError("amount must be positive")
    _ensure_tables()
    engine = get_engine()
    w, t = Wallet.__table__, WalletTransaction.__table__
    with engine.begin() as conn:
        # Use FOR UPDATE on dialects that support it (Postgres); SQLite falls through silently
        stmt = select(w).where(w.c.tenant_id == tenant_id)
        try:
            stmt = stmt.with_for_update()
        except Exception:
            pass
        row = conn.execute(stmt).first()
        if row is None:
            raise InsufficientFundsError("Wallet empty (no record)")
        if row._mapping["status"] == "blocked":
            raise WalletBlockedError("Wallet is blocked")
        current = int(row._mapping["balance_paise"])
        if current < amount_paise:
            raise InsufficientFundsError(f"Need ₹{amount_paise/100:.2f}, have ₹{current/100:.2f}")
        new_bal = current - amount_paise
        conn.execute(w.update().where(w.c.tenant_id == tenant_id).values(
            balance_paise=new_bal, updated_at=datetime.utcnow(),
        ))
        conn.execute(t.insert().values(
            tenant_id=tenant_id, type="debit", amount_paise=amount_paise,
            balance_after_paise=new_bal, reference_id=reference_id,
            description=description, meta=None, created_at=datetime.utcnow(),
        ))
    return {"success": True, "balance_paise": new_bal}


def list_transactions(tenant_id: str, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
    _ensure_tables()
    engine = get_engine()
    t = WalletTransaction.__table__
    with engine.begin() as conn:
        rows = conn.execute(
            select(t).where(t.c.tenant_id == tenant_id)
            .order_by(t.c.created_at.desc()).limit(limit).offset(offset)
        ).fetchall()
    return [
        {
            "id": r._mapping["id"], "type": r._mapping["type"],
            "amount_inr": round(r._mapping["amount_paise"] / 100, 2),
            "balance_after_inr": round(r._mapping["balance_after_paise"] / 100, 2),
            "reference_id": r._mapping["reference_id"],
            "description": r._mapping["description"],
            "created_at": r._mapping["created_at"].isoformat() if r._mapping["created_at"] else None,
        }
        for r in rows
    ]


# ── Rate plans ─────────────────────────────────────────────────────────────
# We use raw db() here (not SQLAlchemy get_engine) so that writes go to the
# same volume-mounted SQLite file as the rest of the app.  If DATABASE_URL
# is set in the environment, get_engine() may resolve to a DIFFERENT path
# (e.g. sqlite:////app/voiceflow.db) while db() always uses /app/sqlite/
# voiceflow.db when that directory exists.

_RATE_PLAN_TABLE_CREATED = False


def _ensure_rate_plan_table() -> None:
    """Create billing_rate_plans via raw db() so it lives in the same file as everything else."""
    global _RATE_PLAN_TABLE_CREATED
    if _RATE_PLAN_TABLE_CREATED:
        return
    try:
        with db() as conn:
            if USE_POSTGRES:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS billing_rate_plans (
                        tenant_id            TEXT PRIMARY KEY,
                        stt_provider         TEXT NOT NULL DEFAULT 'deepgram_nova2',
                        llm_provider         TEXT NOT NULL DEFAULT 'groq_llama3_8b',
                        tts_provider         TEXT NOT NULL DEFAULT 'cartesia',
                        telephony_provider   TEXT NOT NULL DEFAULT 'exotel',
                        platform_fee_paise   BIGINT NOT NULL DEFAULT 100,
                        ai_markup_pct        INTEGER NOT NULL DEFAULT 20,
                        telephony_markup_pct INTEGER NOT NULL DEFAULT 10,
                        min_floor_paise      BIGINT NOT NULL DEFAULT 250,
                        lock_llm             BOOLEAN NOT NULL DEFAULT FALSE,
                        lock_tts             BOOLEAN NOT NULL DEFAULT FALSE,
                        tier                 TEXT NOT NULL DEFAULT 'starter',
                        tenant_fee_paise     BIGINT NOT NULL DEFAULT 0,
                        tenant_ai_markup_pct INTEGER NOT NULL DEFAULT 0,
                        tenant_lock_llm      BOOLEAN NOT NULL DEFAULT FALSE,
                        tenant_lock_tts      BOOLEAN NOT NULL DEFAULT FALSE,
                        updated_at           TEXT
                    )
                """)
            else:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS billing_rate_plans (
                        tenant_id            TEXT PRIMARY KEY,
                        stt_provider         TEXT NOT NULL DEFAULT 'deepgram_nova2',
                        llm_provider         TEXT NOT NULL DEFAULT 'groq_llama3_8b',
                        tts_provider         TEXT NOT NULL DEFAULT 'cartesia',
                        telephony_provider   TEXT NOT NULL DEFAULT 'exotel',
                        platform_fee_paise   INTEGER NOT NULL DEFAULT 100,
                        ai_markup_pct        INTEGER NOT NULL DEFAULT 20,
                        telephony_markup_pct INTEGER NOT NULL DEFAULT 10,
                        min_floor_paise      INTEGER NOT NULL DEFAULT 250,
                        lock_llm             INTEGER NOT NULL DEFAULT 0,
                        lock_tts             INTEGER NOT NULL DEFAULT 0,
                        tier                 TEXT NOT NULL DEFAULT 'starter',
                        tenant_fee_paise     INTEGER NOT NULL DEFAULT 0,
                        tenant_ai_markup_pct INTEGER NOT NULL DEFAULT 0,
                        tenant_lock_llm      INTEGER NOT NULL DEFAULT 0,
                        tenant_lock_tts      INTEGER NOT NULL DEFAULT 0,
                        updated_at           TEXT
                    )
                """)
    except Exception:
        pass
    _RATE_PLAN_TABLE_CREATED = True


class _RatePlanDTO:
    """Simple dataclass-ish holder so router code can use attribute access."""
    def __init__(self, m: dict[str, Any]):
        self.tenant_id = m["tenant_id"]
        self.stt_provider = m["stt_provider"]
        self.llm_provider = m["llm_provider"]
        self.tts_provider = m["tts_provider"]
        self.telephony_provider = m["telephony_provider"]
        self.platform_fee_paise = int(m["platform_fee_paise"] or 100)
        self.ai_markup_pct = int(m["ai_markup_pct"] or 20)
        self.telephony_markup_pct = int(m["telephony_markup_pct"] or 10)
        self.min_floor_paise = int(m["min_floor_paise"] or 250)
        self.lock_llm = bool(m["lock_llm"])
        self.lock_tts = bool(m["lock_tts"])
        self.tier = m["tier"]
        # White-label (tenant) layer
        self.tenant_fee_paise = int(m.get("tenant_fee_paise") or 0)
        self.tenant_ai_markup_pct = int(m.get("tenant_ai_markup_pct") or 0)
        self.tenant_lock_llm = bool(m.get("tenant_lock_llm") or False)
        self.tenant_lock_tts = bool(m.get("tenant_lock_tts") or False)

    # back-compat alias used by wallet router: plan.stt / .llm / .tts / .telephony
    @property
    def stt(self): return self.stt_provider
    @property
    def llm(self): return self.llm_provider
    @property
    def tts(self): return self.tts_provider
    @property
    def telephony(self): return self.telephony_provider


_DEFAULT_PLAN = {
    "stt_provider": "deepgram_nova2", "llm_provider": "groq_llama3_8b",
    "tts_provider": "cartesia", "telephony_provider": "exotel",
    "platform_fee_paise": 100, "ai_markup_pct": 20,
    "telephony_markup_pct": 10, "min_floor_paise": 250,
    "lock_llm": False, "lock_tts": False, "tier": "starter",
    "tenant_fee_paise": 0, "tenant_ai_markup_pct": 0,
    "tenant_lock_llm": False, "tenant_lock_tts": False,
}


def get_rate_plan(tenant_id: str) -> _RatePlanDTO:
    _ensure_rate_plan_table()
    with db() as conn:
        row = conn.execute(
            f"SELECT * FROM billing_rate_plans WHERE tenant_id={_ph}", (tenant_id,)
        ).fetchone()
        if row is None:
            now = datetime.utcnow().isoformat()
            conn.execute(f"""
                INSERT INTO billing_rate_plans
                  (tenant_id, stt_provider, llm_provider, tts_provider, telephony_provider,
                   platform_fee_paise, ai_markup_pct, telephony_markup_pct, min_floor_paise,
                   lock_llm, lock_tts, tier,
                   tenant_fee_paise, tenant_ai_markup_pct, tenant_lock_llm, tenant_lock_tts,
                   updated_at)
                VALUES ({_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph})
            """, (
                tenant_id,
                _DEFAULT_PLAN["stt_provider"], _DEFAULT_PLAN["llm_provider"],
                _DEFAULT_PLAN["tts_provider"], _DEFAULT_PLAN["telephony_provider"],
                _DEFAULT_PLAN["platform_fee_paise"], _DEFAULT_PLAN["ai_markup_pct"],
                _DEFAULT_PLAN["telephony_markup_pct"], _DEFAULT_PLAN["min_floor_paise"],
                int(bool(_DEFAULT_PLAN["lock_llm"])), int(bool(_DEFAULT_PLAN["lock_tts"])),
                _DEFAULT_PLAN["tier"],
                _DEFAULT_PLAN["tenant_fee_paise"], _DEFAULT_PLAN["tenant_ai_markup_pct"],
                int(bool(_DEFAULT_PLAN["tenant_lock_llm"])), int(bool(_DEFAULT_PLAN["tenant_lock_tts"])),
                now,
            ))
            data = {"tenant_id": tenant_id, **_DEFAULT_PLAN}
        else:
            data = dict(row)
    return _RatePlanDTO(data)


def update_rate_plan(tenant_id: str, **updates) -> _RatePlanDTO:
    allowed = {
        "stt_provider", "llm_provider", "tts_provider", "telephony_provider",
        "platform_fee_paise", "ai_markup_pct", "telephony_markup_pct",
        "min_floor_paise", "lock_llm", "lock_tts", "tier",
        "tenant_fee_paise", "tenant_ai_markup_pct",
        "tenant_lock_llm", "tenant_lock_tts",
    }
    bool_fields = {"lock_llm", "lock_tts", "tenant_lock_llm", "tenant_lock_tts"}
    clean: dict[str, Any] = {}
    for k, v in updates.items():
        if k in allowed and v is not None:
            # Normalise booleans to int so SQLite stores them correctly
            clean[k] = int(bool(v)) if k in bool_fields else v

    _ensure_rate_plan_table()
    with db() as conn:
        row = conn.execute(
            f"SELECT tenant_id FROM billing_rate_plans WHERE tenant_id={_ph}", (tenant_id,)
        ).fetchone()
        if row is None:
            merged = {**_DEFAULT_PLAN, **clean}
            now = datetime.utcnow().isoformat()
            conn.execute(f"""
                INSERT INTO billing_rate_plans
                  (tenant_id, stt_provider, llm_provider, tts_provider, telephony_provider,
                   platform_fee_paise, ai_markup_pct, telephony_markup_pct, min_floor_paise,
                   lock_llm, lock_tts, tier,
                   tenant_fee_paise, tenant_ai_markup_pct, tenant_lock_llm, tenant_lock_tts,
                   updated_at)
                VALUES ({_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph})
            """, (
                tenant_id,
                merged["stt_provider"], merged["llm_provider"],
                merged["tts_provider"], merged["telephony_provider"],
                merged["platform_fee_paise"], merged["ai_markup_pct"],
                merged["telephony_markup_pct"], merged["min_floor_paise"],
                int(bool(merged["lock_llm"])), int(bool(merged["lock_tts"])),
                merged["tier"],
                merged["tenant_fee_paise"], merged["tenant_ai_markup_pct"],
                int(bool(merged["tenant_lock_llm"])), int(bool(merged["tenant_lock_tts"])),
                now,
            ))
        else:
            if clean:
                now = datetime.utcnow().isoformat()
                set_clause = ", ".join(f"{k}={_ph}" for k in clean)
                set_clause += f", updated_at={_ph}"
                vals = list(clean.values()) + [now, tenant_id]
                conn.execute(
                    f"UPDATE billing_rate_plans SET {set_clause} WHERE tenant_id={_ph}",
                    vals
                )
    return get_rate_plan(tenant_id)
