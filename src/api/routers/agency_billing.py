"""
Agency Billing Router
======================
Financial system for white-label agencies:
  - Agency wallet: tracks earnings from sub-clients
  - Withdrawal requests: agency requests payout from super admin
  - Super admin: reviews withdrawals, deducts plan fees, pays out

Payment flow:
  Sub-client recharges → money credited to platform (super admin)
  Agency earns commission → accrued in agency_wallet
  Agency requests withdrawal → super admin reviews
  Super admin deducts (monthly_plan_fee + platform_usage) → pays remainder
"""

import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query

from api.dependencies import get_current_active_user
from api.database import USE_POSTGRES, db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/agency", tags=["Agency Billing"])
admin_router = APIRouter(prefix="/api/v1/admin/withdrawals", tags=["Admin Withdrawals"])

_PH = "%s" if USE_POSTGRES else "?"


def _bootstrap_tables():
    """Create agency billing tables if they don't exist yet.

    Called once at module import so the tables are always present regardless
    of whether init_db() ran the schema migration successfully.
    """
    try:
        with db() as conn:
            if USE_POSTGRES:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS agency_wallet (
                        id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                        tenant_id               TEXT UNIQUE NOT NULL,
                        total_earned            NUMERIC(14,2) DEFAULT 0,
                        total_withdrawn         NUMERIC(14,2) DEFAULT 0,
                        platform_fees_deducted  NUMERIC(14,2) DEFAULT 0,
                        available_balance       NUMERIC(14,2) DEFAULT 0,
                        pending_withdrawal      NUMERIC(14,2) DEFAULT 0,
                        updated_at              TEXT
                    )
                """)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS withdrawal_requests (
                        id                    TEXT PRIMARY KEY,
                        tenant_id             TEXT NOT NULL,
                        amount                NUMERIC(14,2) NOT NULL,
                        status                TEXT DEFAULT 'pending',
                        payment_method        TEXT DEFAULT 'bank_transfer',
                        payment_details       TEXT,
                        notes                 TEXT,
                        admin_notes           TEXT,
                        monthly_fee_deducted  NUMERIC(14,2) DEFAULT 0,
                        platform_fee_deducted NUMERIC(14,2) DEFAULT 0,
                        net_paid              NUMERIC(14,2) DEFAULT 0,
                        requested_at          TEXT,
                        processed_at          TEXT
                    )
                """)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS agency_transactions (
                        id          TEXT PRIMARY KEY,
                        tenant_id   TEXT NOT NULL,
                        type        TEXT NOT NULL,
                        amount      NUMERIC(14,2) NOT NULL,
                        description TEXT,
                        created_at  TEXT
                    )
                """)
                conn.execute(
                    "ALTER TABLE platform_tenants ADD COLUMN IF NOT EXISTS parent_agency_id TEXT"
                )
            else:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS agency_wallet (
                        id                      TEXT PRIMARY KEY,
                        tenant_id               TEXT UNIQUE NOT NULL,
                        total_earned            REAL DEFAULT 0,
                        total_withdrawn         REAL DEFAULT 0,
                        platform_fees_deducted  REAL DEFAULT 0,
                        available_balance       REAL DEFAULT 0,
                        pending_withdrawal      REAL DEFAULT 0,
                        updated_at              TEXT
                    )
                """)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS withdrawal_requests (
                        id                    TEXT PRIMARY KEY,
                        tenant_id             TEXT NOT NULL,
                        amount                REAL NOT NULL,
                        status                TEXT DEFAULT 'pending',
                        payment_method        TEXT DEFAULT 'bank_transfer',
                        payment_details       TEXT,
                        notes                 TEXT,
                        admin_notes           TEXT,
                        monthly_fee_deducted  REAL DEFAULT 0,
                        platform_fee_deducted REAL DEFAULT 0,
                        net_paid              REAL DEFAULT 0,
                        requested_at          TEXT,
                        processed_at          TEXT
                    )
                """)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS agency_transactions (
                        id          TEXT PRIMARY KEY,
                        tenant_id   TEXT NOT NULL,
                        type        TEXT NOT NULL,
                        amount      REAL NOT NULL,
                        description TEXT,
                        created_at  TEXT
                    )
                """)
                try:
                    existing = {r[1] for r in conn.execute(
                        "PRAGMA table_info(platform_tenants)"
                    ).fetchall()}
                except Exception as _e:
                    logger.warning("Could not read platform_tenants schema: %s", _e)
                    existing = set()
                if "parent_agency_id" not in existing:
                    try:
                        conn.execute(
                            "ALTER TABLE platform_tenants ADD COLUMN parent_agency_id TEXT"
                        )
                        logger.info("Added parent_agency_id column to platform_tenants")
                    except Exception as _e:
                        logger.warning("Could not add parent_agency_id column: %s", _e)
        logger.info("Agency billing tables bootstrapped.")
    except Exception as e:
        logger.warning("Agency billing bootstrap failed (will retry on next request): %s", e)


# Run once at import time
_bootstrap_tables()


# ── Helpers ──────────────────────────────────────────────────────────

def _ensure_agency_wallet(conn, tenant_id: str):
    """Upsert agency_wallet row if missing."""
    row = conn.execute(
        f"SELECT id FROM agency_wallet WHERE tenant_id={_PH}", (tenant_id,)
    ).fetchone()
    if not row:
        conn.execute(
            f"""INSERT INTO agency_wallet
                (tenant_id, total_earned, total_withdrawn, platform_fees_deducted,
                 available_balance, updated_at)
                VALUES ({_PH},{_PH},{_PH},{_PH},{_PH},{_PH})""",
            (tenant_id, 0.0, 0.0, 0.0, 0.0, datetime.utcnow().isoformat()),
        )


def _require_agency(user: dict):
    """Return tenant_id for agency users. Checks platform_tenants.plan_id (not users.plan)."""
    tenant_id = user.get("tenant_id", "")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant associated with this account")
    # Verify agency plan via platform_tenants — the authoritative source
    with db() as conn:
        row = conn.execute(
            f"SELECT plan_id FROM platform_tenants WHERE id={_PH}", (tenant_id,)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=403, detail="Tenant not found")
    plan_id = row["plan_id"] or ""
    # Also accept if users.plan starts with agency (legacy / dev accounts)
    user_plan = user.get("plan", "") or ""
    if not (plan_id.startswith("agency") or user_plan.startswith("agency")):
        raise HTTPException(status_code=403, detail="Agency plan required")
    return tenant_id


def _get_tenant_plan(conn, tenant_id: str) -> dict:
    """Return (plan_id, plan_row) for a tenant from platform_tenants + plans tables."""
    pt = conn.execute(
        f"SELECT plan_id FROM platform_tenants WHERE id={_PH}", (tenant_id,)
    ).fetchone()
    plan_id = (pt["plan_id"] if pt else None) or "agency_starter"
    plan_row = conn.execute(
        f"SELECT * FROM plans WHERE id={_PH}", (plan_id,)
    ).fetchone()
    return plan_id, (dict(plan_row) if plan_row else {})


def _require_super_admin(user: dict):
    if not user.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Super admin only")


# ── Agency endpoints ─────────────────────────────────────────────────


@router.get("/dashboard")
async def agency_dashboard(
    current_user: dict = Depends(get_current_active_user),
) -> dict:
    """Agency summary: sub-clients, earnings, pending withdrawal, recent activity."""
    tenant_id = _require_agency(current_user)

    with db() as conn:
        _ensure_agency_wallet(conn, tenant_id)

        wallet = conn.execute(
            f"SELECT * FROM agency_wallet WHERE tenant_id={_PH}", (tenant_id,)
        ).fetchone()
        wallet = dict(wallet) if wallet else {}

        # Sub-client counts (platform_tenants with parent_agency_id)
        try:
            sub_clients = conn.execute(
                f"SELECT COUNT(*) as cnt FROM platform_tenants WHERE parent_agency_id={_PH}",
                (tenant_id,),
            ).fetchone()
            sub_client_count = sub_clients["cnt"] if sub_clients else 0
        except Exception as _e:
            logger.warning("sub_client query failed (%s) — attempting column migration", _e)
            sub_client_count = 0
            # Column missing: add it now so the next request succeeds
            try:
                if USE_POSTGRES:
                    conn.execute(
                        "ALTER TABLE platform_tenants ADD COLUMN IF NOT EXISTS parent_agency_id TEXT"
                    )
                else:
                    existing = {r[1] for r in conn.execute(
                        "PRAGMA table_info(platform_tenants)"
                    ).fetchall()}
                    if "parent_agency_id" not in existing:
                        conn.execute(
                            "ALTER TABLE platform_tenants ADD COLUMN parent_agency_id TEXT"
                        )
                logger.info("parent_agency_id column added via self-heal in agency_dashboard")
            except Exception as _e2:
                logger.warning("Self-heal migration also failed: %s", _e2)

        # Active withdrawal requests
        pending_requests = conn.execute(
            f"""SELECT COUNT(*) as cnt FROM withdrawal_requests
                WHERE tenant_id={_PH} AND status='pending'""",
            (tenant_id,),
        ).fetchone()
        pending_count = pending_requests["cnt"] if pending_requests else 0

        # Recent transactions (last 5)
        recent = conn.execute(
            f"""SELECT * FROM agency_transactions
                WHERE tenant_id={_PH}
                ORDER BY created_at DESC LIMIT 5""",
            (tenant_id,),
        ).fetchall()
        recent_txns = [dict(r) for r in recent] if recent else []

        # Plan info from platform_tenants (authoritative)
        plan_id, plan_row = _get_tenant_plan(conn, tenant_id)

        # Tenant branding
        tenant_row = conn.execute(
            f"SELECT * FROM platform_tenants WHERE id={_PH}", (tenant_id,)
        ).fetchone()
        tenant_info = dict(tenant_row) if tenant_row else {}

        # Quick stats: agents count
        try:
            agents_count = conn.execute(
                f"SELECT COUNT(*) as cnt FROM voice_agents WHERE tenant_id={_PH}",
                (tenant_id,),
            ).fetchone()
            agents_count = agents_count["cnt"] if agents_count else 0
        except Exception:
            agents_count = 0

        return {
            "tenant_id": tenant_id,
            "wallet": {
                "available_balance": float(wallet.get("available_balance", 0)),
                "total_earned": float(wallet.get("total_earned", 0)),
                "total_withdrawn": float(wallet.get("total_withdrawn", 0)),
                "platform_fees_deducted": float(wallet.get("platform_fees_deducted", 0)),
                "pending_withdrawal": float(wallet.get("pending_withdrawal", 0)),
            },
            "plan": {
                "id": plan_id,
                "name": plan_row.get("name", plan_id),
                "monthly_fee": float(plan_row.get("price") or 0),
                "wholesale_rate": float(plan_row.get("wholesale_rate") or 0),
                "sub_client_limit": plan_row.get("sub_client_limit"),
                "agents_per_client": plan_row.get("agents_per_client"),
            },
            "sub_clients": {
                "total": sub_client_count,
                "active": sub_client_count,
            },
            "agents_count": agents_count,
            "pending_withdrawal_requests": pending_count,
            "recent_transactions": recent_txns,
            "tenant": {
                "name": tenant_info.get("name", ""),
                "app_name": tenant_info.get("app_name", ""),
                "logo_url": tenant_info.get("logo_url", ""),
                "slug": tenant_info.get("slug", ""),
                "support_email": tenant_info.get("support_email", ""),
                "support_phone": tenant_info.get("support_phone", ""),
                "website": tenant_info.get("website", ""),
            },
        }


@router.get("/wallet")
async def get_agency_wallet(
    current_user: dict = Depends(get_current_active_user),
) -> dict:
    """Full wallet view with transactions and withdrawal requests."""
    tenant_id = _require_agency(current_user)

    with db() as conn:
        _ensure_agency_wallet(conn, tenant_id)

        wallet = conn.execute(
            f"SELECT * FROM agency_wallet WHERE tenant_id={_PH}", (tenant_id,)
        ).fetchone()
        wallet = dict(wallet) if wallet else {}

        transactions = conn.execute(
            f"""SELECT * FROM agency_transactions
                WHERE tenant_id={_PH}
                ORDER BY created_at DESC LIMIT 50""",
            (tenant_id,),
        ).fetchall()

        withdrawal_requests = conn.execute(
            f"""SELECT * FROM withdrawal_requests
                WHERE tenant_id={_PH}
                ORDER BY requested_at DESC LIMIT 20""",
            (tenant_id,),
        ).fetchall()

        # Get monthly plan fee from plans table via platform_tenants.plan_id
        plan_id, plan_row = _get_tenant_plan(conn, tenant_id)
        monthly_fee = float(plan_row.get("price") or 0)
        wholesale_rate = float(plan_row.get("wholesale_rate") or 0)
        plan_name = plan_row.get("name", plan_id)

        return {
            "wallet": dict(wallet),
            "transactions": [dict(t) for t in transactions],
            "withdrawal_requests": [dict(r) for r in withdrawal_requests],
            "monthly_plan_fee": monthly_fee,
            "wholesale_rate": wholesale_rate,
            "plan_id": plan_id,
            "plan_name": plan_name,
        }


@router.post("/withdrawal/request")
async def request_withdrawal(
    body: dict,
    current_user: dict = Depends(get_current_active_user),
) -> dict:
    """Agency requests a withdrawal of available balance."""
    tenant_id = _require_agency(current_user)

    amount = float(body.get("amount", 0))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    payment_method = body.get("payment_method", "bank_transfer")
    payment_details = body.get("payment_details", "")
    notes = body.get("notes", "")

    with db() as conn:
        _ensure_agency_wallet(conn, tenant_id)

        wallet = conn.execute(
            f"SELECT * FROM agency_wallet WHERE tenant_id={_PH}", (tenant_id,)
        ).fetchone()
        available = float(wallet["available_balance"]) if wallet else 0.0

        if amount > available:
            raise HTTPException(
                status_code=400,
                detail=f"Requested ₹{amount:.2f} exceeds available balance ₹{available:.2f}",
            )

        # Check no pending request
        existing = conn.execute(
            f"""SELECT id FROM withdrawal_requests
                WHERE tenant_id={_PH} AND status='pending'""",
            (tenant_id,),
        ).fetchone()
        if existing:
            raise HTTPException(
                status_code=409,
                detail="You already have a pending withdrawal request",
            )

        req_id = str(uuid.uuid4())[:16]
        now = datetime.utcnow().isoformat()

        # Lock the amount in wallet
        conn.execute(
            f"""UPDATE agency_wallet
                SET available_balance=available_balance-{_PH},
                    pending_withdrawal=pending_withdrawal+{_PH},
                    updated_at={_PH}
                WHERE tenant_id={_PH}""",
            (amount, amount, now, tenant_id),
        )

        conn.execute(
            f"""INSERT INTO withdrawal_requests
                (id, tenant_id, amount, status, requested_at, notes,
                 payment_method, payment_details)
                VALUES ({_PH},{_PH},{_PH},{_PH},{_PH},{_PH},{_PH},{_PH})""",
            (req_id, tenant_id, amount, "pending", now, notes,
             payment_method, payment_details),
        )

        logger.info("Withdrawal request %s: tenant=%s amount=%.2f", req_id, tenant_id, amount)
        return {"id": req_id, "status": "pending", "amount": amount, "requested_at": now}


@router.get("/withdrawal/requests")
async def list_withdrawal_requests(
    current_user: dict = Depends(get_current_active_user),
) -> list:
    """List this agency's withdrawal requests."""
    tenant_id = _require_agency(current_user)
    with db() as conn:
        rows = conn.execute(
            f"""SELECT * FROM withdrawal_requests
                WHERE tenant_id={_PH}
                ORDER BY requested_at DESC""",
            (tenant_id,),
        ).fetchall()
        return [dict(r) for r in rows]


# ── Super admin withdrawal endpoints ─────────────────────────────────


@admin_router.get("/")
async def list_all_withdrawals(
    status: str | None = Query(None),
    current_user: dict = Depends(get_current_active_user),
) -> list:
    """Super admin: list all withdrawal requests."""
    _require_super_admin(current_user)
    with db() as conn:
        if status:
            rows = conn.execute(
                f"""SELECT wr.*, pt.name as agency_name, pt.slug as agency_slug
                    FROM withdrawal_requests wr
                    LEFT JOIN platform_tenants pt ON pt.id = wr.tenant_id
                    WHERE wr.status={_PH}
                    ORDER BY wr.requested_at DESC""",
                (status,),
            ).fetchall()
        else:
            rows = conn.execute(
                f"""SELECT wr.*, pt.name as agency_name, pt.slug as agency_slug
                    FROM withdrawal_requests wr
                    LEFT JOIN platform_tenants pt ON pt.id = wr.tenant_id
                    ORDER BY wr.requested_at DESC""",
            ).fetchall()
        return [dict(r) for r in rows]


@admin_router.post("/{request_id}/approve")
async def approve_withdrawal(
    request_id: str,
    body: dict,
    current_user: dict = Depends(get_current_active_user),
) -> dict:
    """Super admin approves withdrawal: deducts fees, records net payout."""
    _require_super_admin(current_user)

    admin_notes = body.get("admin_notes", "")
    monthly_fee = float(body.get("monthly_fee_deducted", 0))
    platform_fee = float(body.get("platform_fee_deducted", 0))

    with db() as conn:
        req = conn.execute(
            f"SELECT * FROM withdrawal_requests WHERE id={_PH}", (request_id,)
        ).fetchone()
        if not req:
            raise HTTPException(status_code=404, detail="Request not found")
        req = dict(req)
        if req["status"] != "pending":
            raise HTTPException(status_code=400, detail=f"Request is already {req['status']}")

        amount = float(req["amount"])
        net_paid = max(0.0, amount - monthly_fee - platform_fee)
        now = datetime.utcnow().isoformat()

        conn.execute(
            f"""UPDATE withdrawal_requests
                SET status='approved',
                    monthly_fee_deducted={_PH},
                    platform_fee_deducted={_PH},
                    net_paid={_PH},
                    admin_notes={_PH},
                    processed_at={_PH}
                WHERE id={_PH}""",
            (monthly_fee, platform_fee, net_paid, admin_notes, now, request_id),
        )

        # Deduct from pending, add fee to platform_fees_deducted, update withdrawn
        conn.execute(
            f"""UPDATE agency_wallet
                SET pending_withdrawal=pending_withdrawal-{_PH},
                    total_withdrawn=total_withdrawn+{_PH},
                    platform_fees_deducted=platform_fees_deducted+{_PH},
                    updated_at={_PH}
                WHERE tenant_id={_PH}""",
            (amount, net_paid, monthly_fee + platform_fee, now, req["tenant_id"]),
        )

        # Record ledger entry
        _record_agency_transaction(
            conn, req["tenant_id"],
            "withdrawal_paid", -net_paid,
            f"Withdrawal approved. Monthly fee ₹{monthly_fee:.2f} + Platform fee ₹{platform_fee:.2f} deducted.",
        )

        logger.info("Withdrawal %s approved: amount=%.2f net=%.2f", request_id, amount, net_paid)
        return {"id": request_id, "status": "approved", "net_paid": net_paid}


@admin_router.post("/{request_id}/reject")
async def reject_withdrawal(
    request_id: str,
    body: dict,
    current_user: dict = Depends(get_current_active_user),
) -> dict:
    """Super admin rejects withdrawal — returns locked amount to available balance."""
    _require_super_admin(current_user)

    admin_notes = body.get("admin_notes", "Rejected by admin")

    with db() as conn:
        req = conn.execute(
            f"SELECT * FROM withdrawal_requests WHERE id={_PH}", (request_id,)
        ).fetchone()
        if not req:
            raise HTTPException(status_code=404, detail="Request not found")
        req = dict(req)
        if req["status"] != "pending":
            raise HTTPException(status_code=400, detail=f"Request is already {req['status']}")

        amount = float(req["amount"])
        now = datetime.utcnow().isoformat()

        conn.execute(
            f"""UPDATE withdrawal_requests
                SET status='rejected', admin_notes={_PH}, processed_at={_PH}
                WHERE id={_PH}""",
            (admin_notes, now, request_id),
        )

        # Return amount from pending back to available
        conn.execute(
            f"""UPDATE agency_wallet
                SET pending_withdrawal=pending_withdrawal-{_PH},
                    available_balance=available_balance+{_PH},
                    updated_at={_PH}
                WHERE tenant_id={_PH}""",
            (amount, amount, now, req["tenant_id"]),
        )

        return {"id": request_id, "status": "rejected"}


@admin_router.post("/{request_id}/mark-paid")
async def mark_withdrawal_paid(
    request_id: str,
    body: dict,
    current_user: dict = Depends(get_current_active_user),
) -> dict:
    """Super admin marks an approved withdrawal as actually paid/transferred."""
    _require_super_admin(current_user)
    now = datetime.utcnow().isoformat()
    utr = body.get("utr_reference", "")
    with db() as conn:
        req = conn.execute(
            f"SELECT status FROM withdrawal_requests WHERE id={_PH}", (request_id,)
        ).fetchone()
        if not req or req["status"] not in ("approved", "pending"):
            raise HTTPException(status_code=400, detail="Cannot mark as paid")
        conn.execute(
            f"""UPDATE withdrawal_requests
                SET status='paid', admin_notes=COALESCE(admin_notes,'')||{_PH}, processed_at={_PH}
                WHERE id={_PH}""",
            (f" | UTR: {utr}" if utr else "", now, request_id),
        )
    return {"id": request_id, "status": "paid"}


# ── Super admin: credit agency earnings ──────────────────────────────


@admin_router.post("/credit-agency")
async def credit_agency_earnings(
    body: dict,
    current_user: dict = Depends(get_current_active_user),
) -> dict:
    """Super admin manually credits earnings to an agency wallet (for testing/manual adjustments)."""
    _require_super_admin(current_user)
    tenant_id = body.get("tenant_id")
    amount = float(body.get("amount", 0))
    description = body.get("description", "Manual credit by admin")
    if not tenant_id or amount <= 0:
        raise HTTPException(status_code=400, detail="tenant_id and positive amount required")

    with db() as conn:
        _ensure_agency_wallet(conn, tenant_id)
        now = datetime.utcnow().isoformat()
        conn.execute(
            f"""UPDATE agency_wallet
                SET total_earned=total_earned+{_PH},
                    available_balance=available_balance+{_PH},
                    updated_at={_PH}
                WHERE tenant_id={_PH}""",
            (amount, amount, now, tenant_id),
        )
        _record_agency_transaction(conn, tenant_id, "credit", amount, description)
    return {"tenant_id": tenant_id, "amount": amount, "status": "credited"}


def _record_agency_transaction(conn, tenant_id: str, txn_type: str, amount: float, description: str):
    """Insert an agency_transactions ledger row."""
    try:
        txn_id = str(uuid.uuid4())[:16]
        conn.execute(
            f"""INSERT INTO agency_transactions
                (id, tenant_id, type, amount, description, created_at)
                VALUES ({_PH},{_PH},{_PH},{_PH},{_PH},{_PH})""",
            (txn_id, tenant_id, txn_type, amount, description, datetime.utcnow().isoformat()),
        )
    except Exception as exc:
        logger.warning("Failed to record agency transaction: %s", exc)
