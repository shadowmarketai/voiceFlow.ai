"""
VoiceFlow AI - Leads Database Layer
=====================================
Manages the database engine/session for leads tables.

Strategy:
  1. If LEADS_DATABASE_URL is set → use separate Postgres database
  2. If main DATABASE_URL is Postgres → derive leads DB from it
  3. If main DB is SQLite → use the main app's async engine (shared DB)

This ensures leads work on both production Postgres AND dev/staging SQLite.
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

# Track whether we're using a separate DB or sharing the main one
_using_shared_engine = False


def _get_leads_url() -> str | None:
    """Derive the leads database async URL.

    Returns URL string for separate DB, or None to signal "use main DB engine".
    """
    if _LEADS_DB_URL:
        url = _LEADS_DB_URL
        # Ensure async driver for PostgreSQL
        if "postgresql" in url and "+asyncpg" not in url:
            url = url.replace("postgresql+psycopg2://", "postgresql+asyncpg://")
            url = url.replace("postgresql://", "postgresql+asyncpg://")
        return url

    if _MAIN_DB_URL and "postgresql" in _MAIN_DB_URL:
        base = _MAIN_DB_URL.rsplit("/", 1)[0]
        url = f"{base}/shadowmarket_leads"
        if "+asyncpg" not in url:
            url = url.replace("postgresql+psycopg2://", "postgresql+asyncpg://")
            url = url.replace("postgresql://", "postgresql+asyncpg://")
        return url

    # SQLite or empty — signal to use the main app's async engine
    return None


# ============================================
# Engine & Session Factory (lazy singletons)
# ============================================

_leads_engine = None
_LeadsSessionLocal = None


def get_leads_engine():
    """Get or create the async engine for leads.

    Falls back to the main app's async engine when no separate leads DB
    is configured (SQLite mode).
    """
    global _leads_engine, _using_shared_engine

    if _leads_engine is not None:
        return _leads_engine

    url = _get_leads_url()

    if url:
        # Separate Postgres database
        _leads_engine = create_async_engine(
            url,
            echo=ECHO_SQL,
            pool_pre_ping=True,
            pool_size=POOL_SIZE,
            max_overflow=MAX_OVERFLOW,
        )
        _using_shared_engine = False
        logger.info("Leads DB: using separate database")
    else:
        # Fall back to main app's async engine
        try:
            from api.database import get_async_engine
            _leads_engine = get_async_engine()
            _using_shared_engine = True
            if _leads_engine:
                logger.info("Leads DB: sharing main app database (SQLite/Postgres)")
            else:
                logger.warning("Leads DB: main async engine not available")
        except Exception as exc:
            logger.warning("Leads DB: could not get main async engine: %s", exc)

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
        from fastapi import HTTPException
        raise HTTPException(
            status_code=503,
            detail="Leads database not available. Contact support.",
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
        logger.warning("Leads DB engine not available — skipping init.")
        return

    try:
        async with engine.begin() as conn:
            await conn.run_sync(LeadsBase.metadata.create_all)
        logger.info("Leads database tables created/verified.")
    except Exception as exc:
        logger.warning("Leads DB table creation failed: %s", exc)


async def ensure_leads_database_exists():
    """Create the shadowmarket_leads database if using separate Postgres.

    Only needed when LEADS_DATABASE_URL or Postgres main DB is configured.
    Skipped when sharing the main SQLite database.
    """
    url = _get_leads_url()
    if not url or "postgresql" not in url:
        return

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
