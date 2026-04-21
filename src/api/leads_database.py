"""
VoiceFlow AI - Separate Leads Database Layer
=============================================
Dedicated database for leads, contacts, CRM connections, and ad source data.
Isolated from the main app database for:
  - DPDP/GDPR compliance (separate data lifecycle)
  - Independent backup/export cycles
  - No cross-tenant data leaks
  - Scalable independently

Set LEADS_DATABASE_URL env var for PostgreSQL:
  LEADS_DATABASE_URL=postgresql+asyncpg://user:pass@host:5433/shadowmarket_leads

Falls back to the main DATABASE_URL with a '_leads' suffix if not set.
"""

import logging
import os

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from api.models.leads_base import LeadsBase

logger = logging.getLogger(__name__)

# ============================================
# Configuration
# ============================================

_MAIN_DB_URL = os.environ.get("DATABASE_URL", "")
_LEADS_DB_URL = os.environ.get("LEADS_DATABASE_URL", "")

POOL_SIZE = int(os.environ.get("LEADS_DB_POOL_SIZE", "5"))
MAX_OVERFLOW = int(os.environ.get("LEADS_DB_MAX_OVERFLOW", "10"))
ECHO_SQL = os.environ.get("DB_ECHO", "false").lower() == "true"


def _get_leads_url() -> str:
    """Derive the leads database async URL."""
    if _LEADS_DB_URL:
        url = _LEADS_DB_URL
    elif _MAIN_DB_URL:
        # Use same host but different database name
        url = _MAIN_DB_URL.replace("/voiceflow", "/shadowmarket_leads")
    else:
        return ""

    # Ensure async driver
    if "postgresql://" in url and "+asyncpg" not in url:
        url = url.replace("postgresql://", "postgresql+asyncpg://")
    url = url.replace("postgresql+psycopg2://", "postgresql+asyncpg://")
    return url


# ============================================
# Engine & Session Factory (lazy singletons)
# ============================================

_leads_engine = None
_LeadsSessionLocal = None


def get_leads_engine():
    """Get or create the async engine for the leads database."""
    global _leads_engine
    if _leads_engine is None:
        url = _get_leads_url()
        if not url:
            logger.warning("No LEADS_DATABASE_URL configured; leads DB disabled.")
            return None
        _leads_engine = create_async_engine(
            url,
            echo=ECHO_SQL,
            pool_pre_ping=True,
            pool_size=POOL_SIZE,
            max_overflow=MAX_OVERFLOW,
        )
    return _leads_engine


def get_leads_session_factory():
    """Get or create the async session factory for leads DB."""
    global _LeadsSessionLocal
    if _LeadsSessionLocal is None:
        engine = get_leads_engine()
        if engine is None:
            return None
        _LeadsSessionLocal = sessionmaker(
            bind=engine,
            class_=AsyncSession,
            autocommit=False,
            autoflush=False,
            expire_on_commit=False,
        )
    return _LeadsSessionLocal


async def get_leads_db():
    """FastAPI dependency that yields an async session to the leads database."""
    factory = get_leads_session_factory()
    if factory is None:
        raise RuntimeError(
            "Leads database not configured. Set LEADS_DATABASE_URL."
        )
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ============================================
# Initialization
# ============================================

async def init_leads_db():
    """Create all leads tables if they don't exist."""
    engine = get_leads_engine()
    if engine is None:
        logger.info("Leads DB not configured — skipping init.")
        return

    async with engine.begin() as conn:
        await conn.run_sync(LeadsBase.metadata.create_all)

    logger.info("Leads database tables created/verified.")


async def ensure_leads_database_exists():
    """Create the shadowmarket_leads database if it doesn't exist.

    Connects to the default 'postgres' database to issue CREATE DATABASE.
    Safe to call on every startup (idempotent).
    """
    url = _get_leads_url()
    if not url:
        return

    # Connect to 'postgres' database to create the leads DB
    admin_url = url.rsplit("/", 1)[0] + "/postgres"
    try:
        admin_engine = create_async_engine(admin_url, isolation_level="AUTOCOMMIT")
        async with admin_engine.connect() as conn:
            result = await conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = 'shadowmarket_leads'")
            )
            if not result.fetchone():
                await conn.execute(text("CREATE DATABASE shadowmarket_leads"))
                logger.info("Created database: shadowmarket_leads")
            else:
                logger.debug("Leads database already exists.")
        await admin_engine.dispose()
    except Exception as exc:
        logger.warning("Could not ensure leads database: %s", exc)
