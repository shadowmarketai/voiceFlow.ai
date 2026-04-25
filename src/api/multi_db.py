"""
VoiceFlow AI — Multi-Database Session Layer
============================================
Four async PostgreSQL databases, each with its own engine and session factory.

  voiceflow_platform  → DATABASE_URL            (tenants, users, billing)
  voiceflow_crm       → DATABASE_URL_CRM        (leads, deals, caller_memories)
  voiceflow_recording → DATABASE_URL_RECORDING  (call recordings, voice clones)
  voiceflow_voice     → DATABASE_URL_VOICE      (agents, conversations, analyses)

FastAPI dependency usage:
    from api.multi_db import get_crm_db, get_voice_db, get_recording_db

    @router.post("/calls")
    async def create_call(
        db_voice: AsyncSession = Depends(get_voice_db),
        db_crm:   AsyncSession = Depends(get_crm_db),
    ):
        ...

Environment variables:
    DATABASE_URL            — platform DB (existing, required)
    DATABASE_URL_CRM        — CRM DB (falls back to DATABASE_URL if unset)
    DATABASE_URL_RECORDING  — Recording DB (falls back to DATABASE_URL if unset)
    DATABASE_URL_VOICE      — Voice DB (falls back to DATABASE_URL if unset)
"""

from __future__ import annotations

import logging
import os
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# URL helpers
# ─────────────────────────────────────────────────────────────────────────────

_BASE_URL = os.getenv("DATABASE_URL", "")


def _to_async_url(url: str) -> str:
    """Convert a sync PostgreSQL URL to asyncpg driver URL."""
    url = url.replace("postgresql+psycopg2://", "postgresql+asyncpg://")
    url = url.replace("postgresql://", "postgresql+asyncpg://")
    return url


def _db_url(env_key: str) -> str:
    """Return the async DB URL for the given env key, falling back to base URL."""
    raw = os.getenv(env_key, "") or _BASE_URL
    return _to_async_url(raw)


# ─────────────────────────────────────────────────────────────────────────────
# Engine + session factory singletons (lazy-init)
# ─────────────────────────────────────────────────────────────────────────────

_ECHO = os.getenv("DB_ECHO", "false").lower() == "true"
_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "5"))
_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "10"))

_engines: dict[str, object] = {}
_factories: dict[str, async_sessionmaker] = {}


def _get_engine(db_key: str, url: str):
    if db_key not in _engines:
        if not url or not url.startswith("postgresql"):
            logger.warning("multi_db: %s URL not configured — async sessions unavailable", db_key)
            return None
        _engines[db_key] = create_async_engine(
            url,
            echo=_ECHO,
            pool_pre_ping=True,
            pool_size=_POOL_SIZE,
            max_overflow=_MAX_OVERFLOW,
        )
    return _engines[db_key]


def _get_factory(db_key: str, url: str) -> async_sessionmaker | None:
    if db_key not in _factories:
        engine = _get_engine(db_key, url)
        if engine is None:
            return None
        _factories[db_key] = async_sessionmaker(
            bind=engine,
            class_=AsyncSession,
            autocommit=False,
            autoflush=False,
            expire_on_commit=False,
        )
    return _factories[db_key]


# ─────────────────────────────────────────────────────────────────────────────
# Per-DB public accessors
# ─────────────────────────────────────────────────────────────────────────────

def get_platform_engine():
    return _get_engine("platform", _db_url("DATABASE_URL"))


def get_crm_engine():
    return _get_engine("crm", _db_url("DATABASE_URL_CRM"))


def get_recording_engine():
    return _get_engine("recording", _db_url("DATABASE_URL_RECORDING"))


def get_voice_engine():
    return _get_engine("voice", _db_url("DATABASE_URL_VOICE"))


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI async dependencies
# ─────────────────────────────────────────────────────────────────────────────

async def get_platform_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async session for voiceflow_platform DB."""
    factory = _get_factory("platform", _db_url("DATABASE_URL"))
    if factory is None:
        raise RuntimeError("Platform DB not configured — check DATABASE_URL")
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_crm_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async session for voiceflow_crm DB."""
    factory = _get_factory("crm", _db_url("DATABASE_URL_CRM"))
    if factory is None:
        raise RuntimeError("CRM DB not configured — check DATABASE_URL_CRM")
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_recording_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async session for voiceflow_recording DB."""
    factory = _get_factory("recording", _db_url("DATABASE_URL_RECORDING"))
    if factory is None:
        raise RuntimeError("Recording DB not configured — check DATABASE_URL_RECORDING")
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_voice_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async session for voiceflow_voice DB."""
    factory = _get_factory("voice", _db_url("DATABASE_URL_VOICE"))
    if factory is None:
        raise RuntimeError("Voice DB not configured — check DATABASE_URL_VOICE")
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ─────────────────────────────────────────────────────────────────────────────
# Direct async session context managers (for non-FastAPI code like caller_memory)
# ─────────────────────────────────────────────────────────────────────────────

from contextlib import asynccontextmanager


@asynccontextmanager
async def crm_session() -> AsyncGenerator[AsyncSession, None]:
    """Context manager for CRM DB — use in voice engine / background tasks."""
    factory = _get_factory("crm", _db_url("DATABASE_URL_CRM"))
    if factory is None:
        raise RuntimeError("CRM DB not configured — check DATABASE_URL_CRM")
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


@asynccontextmanager
async def voice_session() -> AsyncGenerator[AsyncSession, None]:
    """Context manager for Voice DB — use in voice engine / background tasks."""
    factory = _get_factory("voice", _db_url("DATABASE_URL_VOICE"))
    if factory is None:
        raise RuntimeError("Voice DB not configured — check DATABASE_URL_VOICE")
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


@asynccontextmanager
async def recording_session() -> AsyncGenerator[AsyncSession, None]:
    """Context manager for Recording DB — use in voice engine / background tasks."""
    factory = _get_factory("recording", _db_url("DATABASE_URL_RECORDING"))
    if factory is None:
        raise RuntimeError("Recording DB not configured — check DATABASE_URL_RECORDING")
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ─────────────────────────────────────────────────────────────────────────────
# Table initialisation (called from startup.py)
# ─────────────────────────────────────────────────────────────────────────────

async def init_all_db_tables() -> None:
    """
    Create tables for all 4 databases from their respective Base metadata.
    Safe to call on every startup (CREATE TABLE IF NOT EXISTS via checkfirst=True).
    """
    from api.models.base import CRMBase, RecordingBase, VoiceBase

    tasks = [
        ("crm",       _db_url("DATABASE_URL_CRM"),       CRMBase.metadata),
        ("recording", _db_url("DATABASE_URL_RECORDING"), RecordingBase.metadata),
        ("voice",     _db_url("DATABASE_URL_VOICE"),     VoiceBase.metadata),
    ]

    for db_key, url, metadata in tasks:
        engine = _get_engine(db_key, url)
        if engine is None:
            logger.warning("multi_db: skipping table init for %s — no engine", db_key)
            continue
        try:
            async with engine.begin() as conn:
                await conn.run_sync(metadata.create_all, checkfirst=True)
            logger.info("multi_db: tables created/verified for %s DB", db_key)
        except Exception as exc:
            logger.error("multi_db: table init failed for %s: %s", db_key, exc)
