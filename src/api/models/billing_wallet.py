"""
Prepaid wallet + per-tenant rate plan models.

Everything is stored in PAISE (₹1 = 100 paise) to avoid float rounding.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, BigInteger, Boolean, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import Base


class Wallet(Base):
    __tablename__ = "billing_wallets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    balance_paise: Mapped[int] = mapped_column(BigInteger, default=0)
    status: Mapped[str] = mapped_column(String(16), default="active")   # active / suspended / blocked
    low_balance_threshold_paise: Mapped[int] = mapped_column(BigInteger, default=5000)  # ₹50
    auto_recharge_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_recharge_amount_paise: Mapped[int] = mapped_column(BigInteger, default=0)
    auto_recharge_threshold_paise: Mapped[int] = mapped_column(BigInteger, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class WalletTransaction(Base):
    __tablename__ = "billing_wallet_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    type: Mapped[str] = mapped_column(String(16))             # credit / debit / refund / hold
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    balance_after_paise: Mapped[int] = mapped_column(BigInteger)
    reference_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    description: Mapped[str | None] = mapped_column(String(256), nullable=True)
    meta: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class RatePlan(Base):
    """
    Per-tenant rate plan: which providers the tenant is using and the
    platform fee the agency has set on top.
    """
    __tablename__ = "billing_rate_plans"

    tenant_id: Mapped[str] = mapped_column(String(64), primary_key=True)

    # Provider keys map to entries in pricing.COST_CATALOG
    stt_provider: Mapped[str] = mapped_column(String(32), default="deepgram_nova2")
    llm_provider: Mapped[str] = mapped_column(String(32), default="groq_llama3_8b")
    tts_provider: Mapped[str] = mapped_column(String(32), default="cartesia")
    telephony_provider: Mapped[str] = mapped_column(String(32), default="exotel")

    # Agency controls
    platform_fee_paise: Mapped[int] = mapped_column(BigInteger, default=100)     # ₹1/min
    ai_markup_pct: Mapped[int] = mapped_column(Integer, default=20)              # 20%
    telephony_markup_pct: Mapped[int] = mapped_column(Integer, default=10)       # 10%
    min_floor_paise: Mapped[int] = mapped_column(BigInteger, default=250)        # ₹2.50/min floor
    lock_llm: Mapped[bool] = mapped_column(Boolean, default=False)               # prevent client changing LLM
    lock_tts: Mapped[bool] = mapped_column(Boolean, default=False)
    tier: Mapped[str] = mapped_column(String(16), default="starter")

    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RechargeOrder(Base):
    __tablename__ = "billing_recharge_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    gst_paise: Mapped[int] = mapped_column(BigInteger, default=0)
    bonus_paise: Mapped[int] = mapped_column(BigInteger, default=0)
    gateway: Mapped[str] = mapped_column(String(16), default="razorpay")
    gateway_order_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    gateway_payment_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending")   # pending / success / failed
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_recharge_orders_tenant_status", "tenant_id", "status"),
    )
