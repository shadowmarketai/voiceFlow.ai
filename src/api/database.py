"""
VoiceFlow Marketing AI - Database Layer
========================================
Modern SQLAlchemy 2.0 database configuration.

Supports:
- PostgreSQL (production) via psycopg2 / asyncpg
- SQLite (development) via sqlite3 / aiosqlite
- Connection pooling with configurable pool size
- Both sync and async session factories
- Legacy raw-SQL db() context manager for backward compatibility

Set DATABASE_URL env var for PostgreSQL:
  DATABASE_URL=postgresql://user:pass@host:5432/voiceflow

Defaults to SQLite (voiceflow.db) when DATABASE_URL is not set.
"""

import os
import logging
import threading
from contextlib import contextmanager
from typing import Generator, AsyncGenerator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import QueuePool, StaticPool

logger = logging.getLogger(__name__)

# ============================================
# Configuration
# ============================================

DATABASE_URL = os.environ.get("DATABASE_URL", "")
USE_POSTGRES = DATABASE_URL.startswith("postgresql")

# Pool settings (configurable via env vars)
POOL_SIZE = int(os.environ.get("DB_POOL_SIZE", "10"))
MAX_OVERFLOW = int(os.environ.get("DB_MAX_OVERFLOW", "20"))
POOL_TIMEOUT = int(os.environ.get("DB_POOL_TIMEOUT", "30"))
POOL_RECYCLE = int(os.environ.get("DB_POOL_RECYCLE", "1800"))  # 30 minutes
ECHO_SQL = os.environ.get("DB_ECHO", "false").lower() == "true"


# ============================================
# SQLAlchemy Engine & Session Factory
# ============================================

def _get_database_url() -> str:
    """Get the database URL, defaulting to SQLite for development."""
    if DATABASE_URL:
        return DATABASE_URL
    db_path = os.path.join(os.path.dirname(__file__), "..", "..", "voiceflow.db")
    db_path = os.path.abspath(db_path)
    return f"sqlite:///{db_path}"


def _create_engine():
    """Create the SQLAlchemy engine with appropriate settings."""
    url = _get_database_url()

    if url.startswith("sqlite"):
        # SQLite: use StaticPool for thread safety with check_same_thread=False
        engine = create_engine(
            url,
            echo=ECHO_SQL,
            poolclass=StaticPool,
            connect_args={"check_same_thread": False},
        )
        # Enable WAL mode and foreign keys for SQLite
        @event.listens_for(engine, "connect")
        def _set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        return engine
    else:
        # PostgreSQL: use QueuePool with connection pooling
        return create_engine(
            url,
            echo=ECHO_SQL,
            poolclass=QueuePool,
            pool_size=POOL_SIZE,
            max_overflow=MAX_OVERFLOW,
            pool_timeout=POOL_TIMEOUT,
            pool_recycle=POOL_RECYCLE,
            pool_pre_ping=True,  # verify connections before use
        )


# Lazy-initialized engine and session factory
_engine = None
_SessionLocal = None


def get_engine():
    """Get or create the SQLAlchemy engine (singleton)."""
    global _engine
    if _engine is None:
        _engine = _create_engine()
    return _engine


def get_session_factory() -> sessionmaker:
    """Get or create the session factory (singleton)."""
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(
            bind=get_engine(),
            autocommit=False,
            autoflush=False,
            expire_on_commit=False,
        )
    return _SessionLocal


# ============================================
# Dependency: get_db (for FastAPI Depends)
# ============================================

def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that yields a database session.
    Auto-closes session when request completes.

    Usage:
        @router.get("/items")
        async def list_items(db: Session = Depends(get_db)):
            items = db.query(Item).all()
            return items
    """
    SessionLocal = get_session_factory()
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


# ============================================
# Async support (PostgreSQL + asyncpg)
# ============================================

_async_engine = None
_AsyncSessionLocal = None


def get_async_engine():
    """Get or create the async SQLAlchemy engine (PostgreSQL only)."""
    global _async_engine
    if _async_engine is None:
        try:
            from sqlalchemy.ext.asyncio import create_async_engine
        except ImportError:
            logger.warning("sqlalchemy.ext.asyncio not available; async engine disabled.")
            return None

        url = _get_database_url()
        if url.startswith("postgresql"):
            async_url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
            async_url = async_url.replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1)
        elif url.startswith("sqlite"):
            async_url = url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)
        else:
            logger.warning("Async engine not supported for URL: %s", url[:20])
            return None

        _async_engine = create_async_engine(
            async_url,
            echo=ECHO_SQL,
            pool_pre_ping=True,
        )
    return _async_engine


def get_async_session_factory():
    """Get or create the async session factory."""
    global _AsyncSessionLocal
    if _AsyncSessionLocal is None:
        try:
            from sqlalchemy.ext.asyncio import AsyncSession
            from sqlalchemy.orm import sessionmaker as async_sessionmaker
        except ImportError:
            logger.warning("Async session not available.")
            return None

        engine = get_async_engine()
        if engine is None:
            return None

        _AsyncSessionLocal = async_sessionmaker(
            bind=engine,
            class_=AsyncSession,
            autocommit=False,
            autoflush=False,
            expire_on_commit=False,
        )
    return _AsyncSessionLocal


async def get_async_db() -> AsyncGenerator:
    """
    FastAPI dependency that yields an async database session.

    Usage:
        @router.get("/items")
        async def list_items(db: AsyncSession = Depends(get_async_db)):
            result = await db.execute(select(Item))
            return result.scalars().all()
    """
    factory = get_async_session_factory()
    if factory is None:
        raise RuntimeError("Async database session not available. Check your database configuration.")

    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ============================================
# Database initialization (SQLAlchemy models)
# ============================================

def init_models():
    """
    Create all tables defined by SQLAlchemy models.
    Imports Base from the models package and creates tables.
    """
    from api.models import Base
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    logger.info("SQLAlchemy model tables created successfully.")

    # ── Lightweight in-place column migrations for the quotations table ──
    # SQLAlchemy create_all() does NOT alter existing tables, so we add
    # any missing columns by introspection. This keeps the single-file
    # SQLite workflow simple (no Alembic dance for additive changes).
    try:
        _migrate_quotations_schema(engine)
    except Exception as e:
        logger.warning(f"Quotations schema migration skipped: {e}")


def _migrate_quotations_schema(engine):
    """Add forward-compat columns to quotations table if missing."""
    from sqlalchemy import inspect as sa_inspect, text

    inspector = sa_inspect(engine)
    if "quotations" not in inspector.get_table_names():
        return  # table will be freshly created with all columns

    existing = {c["name"] for c in inspector.get_columns("quotations")}

    new_columns = [
        ("tenant_id",           "VARCHAR(100)"),
        ("template_id",         "INTEGER"),
        ("intake_id",           "INTEGER"),
        ("client_phone",        "VARCHAR(30)"),
        ("client_email",        "VARCHAR(300)"),
        ("form_data",           "JSON"),
        ("negotiation_enabled", "BOOLEAN DEFAULT 0"),
        ("max_discount_pct",    "FLOAT DEFAULT 0.0"),
        ("final_amount",        "FLOAT"),
        ("render_3d_url",       "VARCHAR(1000)"),
        ("drawings_url",        "VARCHAR(1000)"),
        ("ai_render_urls",      "JSON"),
        ("valid_until",         "DATETIME"),
        ("sent_at",             "DATETIME"),
    ]

    added = []
    with engine.begin() as conn:
        for col_name, col_def in new_columns:
            if col_name not in existing:
                try:
                    conn.execute(text(f"ALTER TABLE quotations ADD COLUMN {col_name} {col_def}"))
                    added.append(col_name)
                except Exception as e:
                    logger.warning(f"Could not add quotations.{col_name}: {e}")

    if added:
        logger.info(f"Quotations table extended with columns: {', '.join(added)}")


# ============================================
# Legacy raw-SQL support (backward compatibility)
# ============================================
# The following functions maintain backward compatibility with the raw-SQL
# approach used by auth.py, leads.py, calls.py, campaigns.py, etc.
# These modules use `from api.database import db, init_db` and execute
# raw SQL via connection objects.
# This will be gradually migrated to SQLAlchemy ORM sessions.

_lock = threading.Lock()


if not USE_POSTGRES:
    import sqlite3

    _DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "voiceflow.db")
    _DB_PATH = os.path.abspath(_DB_PATH)

    def get_connection():
        """Get a raw SQLite connection (legacy)."""
        conn = sqlite3.connect(_DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    @contextmanager
    def db():
        """Legacy raw-SQL context manager for SQLite."""
        with _lock:
            conn = get_connection()
            try:
                yield conn
                conn.commit()
            except Exception:
                conn.rollback()
                raise
            finally:
                conn.close()

    def init_db():
        """Initialize database: create legacy raw-SQL tables + SQLAlchemy model tables."""
        with db() as conn:
            conn.executescript(_SQLITE_SCHEMA)
        # Also create SQLAlchemy model tables
        try:
            init_models()
        except Exception as e:
            logger.warning("Could not create SQLAlchemy model tables: %s", e)
        _seed_defaults()

    _SQLITE_SCHEMA = """
    CREATE TABLE IF NOT EXISTS users (
        id          TEXT PRIMARY KEY,
        email       TEXT UNIQUE NOT NULL,
        name        TEXT,
        hashed_password TEXT NOT NULL,
        role        TEXT DEFAULT 'user',
        plan        TEXT DEFAULT 'starter',
        company     TEXT,
        phone       TEXT,
        created_at  TEXT DEFAULT (datetime('now')),
        is_active   INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS leads (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        phone       TEXT,
        email       TEXT,
        company     TEXT,
        source      TEXT DEFAULT 'Manual',
        status      TEXT DEFAULT 'cold',
        score       INTEGER DEFAULT 0,
        tags        TEXT DEFAULT '[]',
        notes       TEXT,
        assigned_to TEXT,
        created_at  TEXT DEFAULT (datetime('now')),
        updated_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS calls (
        id          TEXT PRIMARY KEY,
        lead_id     TEXT,
        phone       TEXT,
        duration    INTEGER DEFAULT 0,
        status      TEXT DEFAULT 'completed',
        direction   TEXT DEFAULT 'outbound',
        sentiment   TEXT DEFAULT 'neutral',
        language    TEXT DEFAULT 'English',
        transcript  TEXT,
        summary     TEXT,
        recording_url TEXT,
        agent_id    TEXT,
        created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS campaigns (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        description     TEXT DEFAULT '',
        mode            TEXT DEFAULT 'power',
        caller_id       TEXT DEFAULT '',
        status          TEXT DEFAULT 'draft',
        start_time      TEXT DEFAULT '09:00',
        end_time        TEXT DEFAULT '21:00',
        max_attempts    INTEGER DEFAULT 3,
        script          TEXT DEFAULT '',
        total_contacts  INTEGER DEFAULT 0,
        dialed          INTEGER DEFAULT 0,
        connected       INTEGER DEFAULT 0,
        converted       INTEGER DEFAULT 0,
        created_at      TEXT DEFAULT (datetime('now')),
        updated_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assistants (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT DEFAULT '',
        personality TEXT DEFAULT 'professional',
        industry    TEXT DEFAULT 'general',
        is_active   INTEGER DEFAULT 1,
        total_calls INTEGER DEFAULT 0,
        created_at  TEXT DEFAULT (datetime('now')),
        updated_at  TEXT DEFAULT (datetime('now'))
    );

    -- ══════════════════════════════════════════════════════════════
    -- SaaS Control Layer: Super Admin, Feature Engine, Tenant Config
    -- ══════════════════════════════════════════════════════════════

    -- Plans available for tenants
    CREATE TABLE IF NOT EXISTS plans (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        slug        TEXT UNIQUE NOT NULL,
        price       INTEGER DEFAULT 0,
        currency    TEXT DEFAULT 'INR',
        interval    TEXT DEFAULT 'monthly',
        max_users   INTEGER DEFAULT 5,
        description TEXT DEFAULT '',
        is_active   INTEGER DEFAULT 1,
        sort_order  INTEGER DEFAULT 0,
        created_at  TEXT DEFAULT (datetime('now'))
    );

    -- System-wide feature registry (supports parent-child hierarchy)
    CREATE TABLE IF NOT EXISTS system_features (
        id              TEXT PRIMARY KEY,
        key             TEXT UNIQUE NOT NULL,
        name            TEXT NOT NULL,
        parent_key      TEXT,
        category        TEXT DEFAULT 'core',
        description     TEXT DEFAULT '',
        icon            TEXT DEFAULT 'Box',
        route           TEXT DEFAULT '',
        default_enabled INTEGER DEFAULT 1,
        is_premium      INTEGER DEFAULT 0,
        sort_order      INTEGER DEFAULT 0
    );

    -- Platform tenants (for multi-tenant SaaS)
    CREATE TABLE IF NOT EXISTS platform_tenants (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        slug            TEXT UNIQUE NOT NULL,
        domain          TEXT,
        owner_id        TEXT,
        plan_id         TEXT DEFAULT 'starter',
        is_active       INTEGER DEFAULT 1,
        max_users       INTEGER DEFAULT 5,
        logo_url        TEXT,
        favicon_url     TEXT,
        primary_color   TEXT DEFAULT '#f59e0b',
        secondary_color TEXT DEFAULT '#1e293b',
        accent_color    TEXT DEFAULT '#8b5cf6',
        app_name        TEXT,
        font_family     TEXT DEFAULT 'Inter',
        custom_css      TEXT,
        trial_ends_at   TEXT,
        created_at      TEXT DEFAULT (datetime('now')),
        updated_at      TEXT DEFAULT (datetime('now'))
    );

    -- Per-tenant feature overrides
    CREATE TABLE IF NOT EXISTS tenant_features (
        id          TEXT PRIMARY KEY,
        tenant_id   TEXT NOT NULL REFERENCES platform_tenants(id) ON DELETE CASCADE,
        feature_key TEXT NOT NULL REFERENCES system_features(key) ON DELETE CASCADE,
        enabled     INTEGER DEFAULT 1,
        config      TEXT DEFAULT '{}',
        updated_at  TEXT DEFAULT (datetime('now')),
        UNIQUE(tenant_id, feature_key)
    );

    CREATE INDEX IF NOT EXISTS idx_tenant_features_tenant ON tenant_features(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_tenant_features_key ON tenant_features(feature_key);
    """

else:
    import psycopg2
    import psycopg2.pool
    import psycopg2.extras

    _pool = None

    def _get_pool():
        global _pool
        if _pool is None:
            _pool = psycopg2.pool.ThreadedConnectionPool(
                minconn=2,
                maxconn=20,
                dsn=DATABASE_URL,
            )
        return _pool

    def get_connection():
        """Get a raw PostgreSQL connection (legacy)."""
        pool = _get_pool()
        conn = pool.getconn()
        conn.autocommit = False
        return conn

    @contextmanager
    def db():
        """Legacy raw-SQL context manager for PostgreSQL."""
        pool = _get_pool()
        conn = pool.getconn()
        try:
            conn.cursor_factory = psycopg2.extras.RealDictCursor
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            pool.putconn(conn)

    def init_db():
        """Initialize database: create legacy raw-SQL tables + SQLAlchemy model tables."""
        with db() as conn:
            cur = conn.cursor()
            cur.execute(_PG_SCHEMA)
            conn.commit()
        # Also create SQLAlchemy model tables
        try:
            init_models()
        except Exception as e:
            logger.warning("Could not create SQLAlchemy model tables: %s", e)
        _seed_defaults()

    _PG_SCHEMA = """
    CREATE TABLE IF NOT EXISTS users (
        id          TEXT PRIMARY KEY,
        email       TEXT UNIQUE NOT NULL,
        name        TEXT,
        hashed_password TEXT NOT NULL,
        role        TEXT DEFAULT 'user',
        plan        TEXT DEFAULT 'starter',
        company     TEXT,
        phone       TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        is_active   BOOLEAN DEFAULT TRUE
    );

    CREATE TABLE IF NOT EXISTS leads (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        phone       TEXT,
        email       TEXT,
        company     TEXT,
        source      TEXT DEFAULT 'Manual',
        status      TEXT DEFAULT 'cold',
        score       INTEGER DEFAULT 0,
        tags        JSONB DEFAULT '[]',
        notes       TEXT,
        assigned_to TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS calls (
        id          TEXT PRIMARY KEY,
        lead_id     TEXT REFERENCES leads(id) ON DELETE SET NULL,
        phone       TEXT,
        duration    INTEGER DEFAULT 0,
        status      TEXT DEFAULT 'completed',
        direction   TEXT DEFAULT 'outbound',
        sentiment   TEXT DEFAULT 'neutral',
        language    TEXT DEFAULT 'English',
        transcript  JSONB,
        summary     TEXT,
        recording_url TEXT,
        agent_id    TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS campaigns (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        description     TEXT DEFAULT '',
        mode            TEXT DEFAULT 'power',
        caller_id       TEXT DEFAULT '',
        status          TEXT DEFAULT 'draft',
        start_time      TEXT DEFAULT '09:00',
        end_time        TEXT DEFAULT '21:00',
        max_attempts    INTEGER DEFAULT 3,
        script          TEXT DEFAULT '',
        total_contacts  INTEGER DEFAULT 0,
        dialed          INTEGER DEFAULT 0,
        connected       INTEGER DEFAULT 0,
        converted       INTEGER DEFAULT 0,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS assistants (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT DEFAULT '',
        personality TEXT DEFAULT 'professional',
        industry    TEXT DEFAULT 'general',
        is_active   BOOLEAN DEFAULT TRUE,
        total_calls INTEGER DEFAULT 0,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
    CREATE INDEX IF NOT EXISTS idx_calls_lead_id ON calls(lead_id);
    CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at);
    CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
    """


# ============================================
# Shared: Seed defaults (legacy)
# ============================================

def _seed_defaults():
    """Seed the complete application with structured data.

    Creates:
    1. Super Admin (platform owner — no tenant)
    2. Swetha Structures PVT LTD tenant
    3. Swetha users (admin, manager, agent)
    4. Demo leads and calls for Swetha
    5. Plans, system features
    """
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")
    _ph = "%" + "s" if USE_POSTGRES else "?"

    with db() as conn:
        # ── Step 1: Add columns if missing (migration) ──
        try:
            if USE_POSTGRES:
                cur = conn.cursor()
                cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE")
                cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id TEXT")
            else:
                cols = [c[1] for c in conn.execute("PRAGMA table_info(users)").fetchall()]
                if "is_super_admin" not in cols:
                    conn.execute("ALTER TABLE users ADD COLUMN is_super_admin INTEGER DEFAULT 0")
                if "tenant_id" not in cols:
                    conn.execute("ALTER TABLE users ADD COLUMN tenant_id TEXT")
        except Exception as e:
            logger.debug("Column migration: %s", e)

        # ── Step 2: Super Admin (idempotent upsert) ──
        # The platform owner's credentials are pinned here so they survive
        # every boot and can't be locked out by a bad manual edit.
        SUPER_EMAIL = "mkumaran2931@gmail.com"
        SUPER_NAME = "MKumaran"
        SUPER_PASSWORD = "Mkumaran@29"
        SUPER_HASH = pwd_context.hash(SUPER_PASSWORD)

        # 1) If the current super-admin email already exists, re-sync the password
        new_row = conn.execute(
            f"SELECT id FROM users WHERE email={_ph}", (SUPER_EMAIL,)
        ).fetchone()
        if new_row:
            conn.execute(
                f"UPDATE users SET hashed_password={_ph}, role={_ph}, is_super_admin={_ph}, is_active={_ph}, name={_ph} "
                f"WHERE email={_ph}",
                (SUPER_HASH, "admin", 1, 1, SUPER_NAME, SUPER_EMAIL),
            )
            logger.info("Super Admin password re-synced for %s", SUPER_EMAIL)
        else:
            # 2) If the legacy email exists, migrate it to the new one
            legacy = conn.execute(
                f"SELECT id FROM users WHERE email={_ph}", ("superadmin@voiceflow.com",)
            ).fetchone()
            if legacy:
                conn.execute(
                    f"UPDATE users SET email={_ph}, hashed_password={_ph}, name={_ph}, "
                    f"role={_ph}, is_super_admin={_ph}, is_active={_ph} "
                    f"WHERE email={_ph}",
                    (SUPER_EMAIL, SUPER_HASH, SUPER_NAME, "admin", 1, 1, "superadmin@voiceflow.com"),
                )
                logger.info("Super Admin migrated: superadmin@voiceflow.com -> %s", SUPER_EMAIL)
            else:
                # 3) Fresh install — create the row
                conn.execute(f"""
                    INSERT INTO users (id,email,name,hashed_password,role,plan,company,phone,is_active,is_super_admin)
                    VALUES ({_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph})
                """, (
                    "sa-001", SUPER_EMAIL, SUPER_NAME, SUPER_HASH,
                    "admin", "enterprise", "VoiceFlow Platform", "+91 90000 00000", 1, 1,
                ))
                logger.info("Super Admin created: %s", SUPER_EMAIL)

        # ── Step 3: Swetha Structures tenant ──
        tenant_exists = conn.execute(f"SELECT id FROM platform_tenants WHERE id={_ph}", ("tenant-swetha",)).fetchone()
        if not tenant_exists:
            conn.execute(f"""
                INSERT INTO platform_tenants (id,name,slug,plan_id,is_active,max_users,app_name,primary_color,secondary_color,accent_color)
                VALUES ({_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph})
            """, (
                "tenant-swetha",
                "Swetha Structures PVT LTD",
                "swetha",
                "professional",
                1, 25,
                "Swetha Structures CRM",
                "#f59e0b", "#1e293b", "#8b5cf6",
            ))
            logger.info("Tenant created: Swetha Structures PVT LTD")

        # ── Step 4: Swetha Structures users ──
        swetha_users = [
            ("sw-admin", "admin@swetha.in", "Swetha Kumar", "admin", "professional", "+91 98765 43210"),
            ("sw-manager", "manager@swetha.in", "Priya Sharma", "manager", "professional", "+91 98765 43211"),
            ("sw-agent", "agent@swetha.in", "Rajesh Nair", "agent", "professional", "+91 98765 43212"),
        ]
        for uid, email, name, role, plan, phone in swetha_users:
            existing = conn.execute(f"SELECT id FROM users WHERE email={_ph}", (email,)).fetchone()
            if not existing:
                conn.execute(f"""
                    INSERT INTO users (id,email,name,hashed_password,role,plan,company,phone,is_active,is_super_admin,tenant_id)
                    VALUES ({_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph})
                """, (
                    uid, email, name,
                    pwd_context.hash("Swetha123!"),
                    role, plan, "Swetha Structures PVT LTD", phone,
                    1, 0, "tenant-swetha",
                ))
        logger.info("Swetha users created: admin/manager/agent @swetha.in / Swetha123!")

        # ── Step 5: Demo leads for Swetha ──
        lead_count = conn.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
        if lead_count == 0:
            leads = [
                ("lead-001", "Kumar Industries", "9876543210", "kumar@industries.in", "Kumar Industries", "Meta Ads", "hot", 92),
                ("lead-002", "Rajan Builders", "9845123456", "rajan@builders.com", "Rajan Builders", "Google Ads", "warm", 78),
                ("lead-003", "Patel Steel Works", "9001234567", "patel@steelworks.in", "Patel Steel Works", "LinkedIn", "cold", 45),
                ("lead-004", "Mohammed Enterprises", "9123456789", "ali@enterprises.in", "Mohammed Enterprises", "WhatsApp", "hot", 88),
                ("lead-005", "Sunita Textiles", "9234567890", "sunita@textiles.in", "Sunita Textiles Pvt Ltd", "Referral", "warm", 65),
                ("lead-006", "Arun Warehousing", "9345678901", "arun@warehouse.in", "Arun Warehousing", "IndiaMART", "hot", 95),
                ("lead-007", "Lakshmi Foods", "9456789012", "lakshmi@foods.in", "Lakshmi Foods Pvt Ltd", "JustDial", "cold", 30),
                ("lead-008", "Venkat Logistics", "9567890123", "venkat@logistics.in", "Venkat Logistics", "Website", "warm", 70),
            ]
            for l in leads:
                conn.execute(f"""
                    INSERT INTO leads (id,name,phone,email,company,source,status,score)
                    VALUES ({_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph})
                """, l)

        # ── Step 6: Demo calls ──
        call_count = conn.execute("SELECT COUNT(*) FROM calls").fetchone()[0]
        if call_count == 0:
            import random, datetime
            now = datetime.datetime.utcnow()
            statuses = ["completed", "completed", "completed", "no_answer", "busy", "failed"]
            sentiments = ["positive", "neutral", "negative", "positive", "positive", "neutral"]
            languages = ["Tamil", "English", "Hindi", "Tamil", "English", "Telugu"]
            for i in range(20):
                ts = (now - datetime.timedelta(hours=i * 4)).isoformat()
                conn.execute(f"""
                    INSERT INTO calls (id,phone,duration,status,direction,sentiment,language,created_at)
                    VALUES ({_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph})
                """, (
                    f"call-{i+1:03d}",
                    f"+91 9{random.randint(100000000, 999999999)}",
                    random.randint(30, 480),
                    statuses[i % len(statuses)],
                    "outbound" if i % 3 != 0 else "inbound",
                    sentiments[i % len(sentiments)],
                    languages[i % len(languages)],
                    ts,
                ))

    _seed_saas_control_layer()


def _seed_saas_control_layer():
    """Seed plans, system features, default tenant, and super admin."""
    with db() as conn:
        _ph = "%" + "s" if USE_POSTGRES else "?"

        # ── Seed Plans ──
        plan_count = conn.execute("SELECT COUNT(*) FROM plans").fetchone()[0] if not USE_POSTGRES else 0
        if USE_POSTGRES:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) AS cnt FROM plans")
            plan_count = cur.fetchone()["cnt"]

        if plan_count == 0:
            plans = [
                ("starter", "Starter", "starter", 499900, "INR", "monthly", 5, "Basic CRM + Voice AI", 1, 1),
                ("professional", "Professional", "professional", 1499900, "INR", "monthly", 25, "All modules + integrations", 1, 2),
                ("enterprise", "Enterprise", "enterprise", 3999900, "INR", "monthly", 100, "Unlimited + white-label + priority support", 1, 3),
            ]
            for p in plans:
                conn.execute(f"""
                    INSERT INTO plans (id,name,slug,price,currency,interval,max_users,description,is_active,sort_order)
                    VALUES ({_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph})
                """, p)

        # ── Seed System Features ──
        feat_count = conn.execute("SELECT COUNT(*) FROM system_features").fetchone()[0] if not USE_POSTGRES else 0
        if USE_POSTGRES:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) AS cnt FROM system_features")
            feat_count = cur.fetchone()["cnt"]

        # Canonical VoiceFlow AI feature list. Every key maps 1:1 to a
        # page that actually exists in the frontend sidebar.
        voiceflow_features = [
            # ── Voice AI (parent) ──
            ("f-va",       "voice_ai",            "Voice AI",          None,       "Voice AI", "The full voice AI platform",       "Mic",          "/voice/dashboard-v2",     1, 0, 100),

            # MAIN
            ("f-va-dash",  "voice.dashboard",     "Dashboard",         "voice_ai", "Voice AI", "Voice AI overview & KPIs",         "BarChart3",    "/voice/dashboard-v2",     1, 0, 101),
            ("f-va-ag",    "voice.agents",        "Agents",            "voice_ai", "Voice AI", "Create & manage AI voice agents",  "Bot",          "/voice/agents-list",      1, 0, 102),

            # BUILD
            ("f-va-kb",    "voice.knowledge",     "Knowledge Base",    "voice_ai", "Voice AI", "Upload docs your agents use",      "BookOpen",     "/voice/knowledge",        1, 0, 110),
            ("f-va-st",    "voice.studio",        "Voice Library & Studio", "voice_ai", "Voice AI", "Voice cloning & library",      "AudioWaveform","/voice/studio",           1, 1, 111),

            # DEPLOY
            ("f-va-ph",    "voice.phone_numbers", "Phone Numbers",     "voice_ai", "Voice AI", "Inbound/outbound numbers (7 providers)", "Phone",  "/voice/phone-numbers",    1, 0, 120),
            ("f-va-ch",    "voice.channels",      "Channels",          "voice_ai", "Voice AI", "Web widget, WhatsApp, phone, API", "Globe",        "/voice/channels",         1, 0, 121),
            ("f-va-cp",    "voice.campaigns",     "Campaigns",         "voice_ai", "Voice AI", "Outbound dialer campaigns",        "Megaphone",    "/voice/campaigns",        1, 0, 122),

            # MONITOR
            ("f-va-cl",    "voice.call_logs",     "Conversations",     "voice_ai", "Voice AI", "Call logs & transcripts",          "MessageSquare","/voice/call-logs",        1, 0, 130),
            ("f-va-lc",    "voice.live_calls",    "Live Calls",        "voice_ai", "Voice AI", "Real-time active call monitoring", "Radio",        "/voice/live-calls",       1, 0, 131),
            ("f-va-an",    "voice.analytics",     "Analytics",         "voice_ai", "Voice AI", "Call + sentiment + conversion analytics", "PieChart", "/voice/analytics-dashboard", 1, 0, 132),
            ("f-va-re",    "voice.recordings",    "Recordings",        "voice_ai", "Voice AI", "Audio recordings of every call",   "FileAudio",    "/voice/recordings",       1, 0, 133),
            ("f-va-ts",    "voice.testing",       "Testing",           "voice_ai", "Voice AI", "Testing playground for agents",    "FlaskConical", "/voice/testing",          1, 0, 134),
            ("f-va-ql",    "voice.quality",       "Quality Dashboard", "voice_ai", "Voice AI", "Latency / uptime / accuracy / benchmarks", "Gauge","/voice/quality",          1, 0, 135),

            # CONNECT
            ("f-va-in",    "voice.integrations",  "Integrations",      "voice_ai", "Voice AI", "CRM / webhook / Zapier integrations", "Puzzle",    "/voice/integrations",     1, 0, 140),
            ("f-va-ap",    "voice.api",           "API & Developer",   "voice_ai", "Voice AI", "REST + WebSocket API keys",        "Code",         "/voice/api",              1, 0, 141),

            # ── Billing (parent) ──
            ("f-bl",       "billing",             "Billing & Wallet",  None,       "Billing",  "Subscription, prepaid wallet, recharge", "CreditCard", "/voice/billing",   1, 0, 200),
            ("f-bl-wa",    "billing.wallet",      "Wallet",            "billing",  "Billing",  "Prepaid balance + recharge",       "Wallet",       "/voice/wallet",           1, 0, 201),
            ("f-bl-tp",    "billing.tenant_pricing","My Pricing",      "billing",  "Billing",  "White-label markup (tenant only)", "TrendingUp",   "/voice/tenant-pricing",   1, 0, 202),
            ("f-bl-sb",    "billing.subscription","Subscription",      "billing",  "Billing",  "Monthly subscription plans",       "CreditCard",   "/voice/billing",          1, 0, 203),
        ]

        # Delete any legacy features (CRM, Quotation, Inbox, etc.) that exist
        # from earlier seeds, then (re)insert the VoiceFlow-AI-only set.
        valid_keys = {f[1] for f in voiceflow_features}
        existing = conn.execute("SELECT key FROM system_features").fetchall()
        existing_keys = {r[0] if not isinstance(r, dict) else r["key"] for r in existing}
        stale = existing_keys - valid_keys
        for k in stale:
            conn.execute(f"DELETE FROM tenant_features WHERE feature_key={_ph}", (k,))
            conn.execute(f"DELETE FROM system_features WHERE key={_ph}", (k,))
        if stale:
            logger.info("Removed %d legacy feature(s) from system_features", len(stale))

        # Always upsert — ensures any new feature added to the canonical
        # list gets picked up on the next boot without needing a reseed.
        for f in voiceflow_features:
            if f[1] in existing_keys:
                conn.execute(f"""
                    UPDATE system_features SET
                        name={_ph}, parent_key={_ph}, category={_ph}, description={_ph},
                        icon={_ph}, route={_ph}, default_enabled={_ph}, is_premium={_ph},
                        sort_order={_ph}
                    WHERE key={_ph}
                """, (f[2], f[3], f[4], f[5], f[6], f[7], f[8], f[9], f[10], f[1]))
            else:
                conn.execute(f"""
                    INSERT INTO system_features (id,key,name,parent_key,category,description,icon,route,default_enabled,is_premium,sort_order)
                    VALUES ({_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph})
                """, f)

        # Tenant and super admin already created in _seed_defaults()
        # Just assign any orphan users to the swetha tenant
        conn.execute(f"""
            UPDATE users SET tenant_id='tenant-swetha'
            WHERE tenant_id IS NULL AND (is_super_admin=0 OR is_super_admin IS NULL)
        """)

        # ── Tenant branding columns (additive migration) ──
        _migrate_tenant_branding(conn)

        # ── Platform Support Tickets (tenant → super admin) ──
        _seed_platform_tickets(conn, _ph)

    logger.info("SaaS control layer seeded successfully")


def _migrate_tenant_branding(conn):
    """Add new optional branding columns to platform_tenants if missing."""
    new_cols = [
        ("tagline", "TEXT"),
        ("support_email", "TEXT"),
        ("support_phone", "TEXT"),
        ("website", "TEXT"),
        ("address", "TEXT"),
        ("login_bg_color", "TEXT"),
        ("sidebar_style", "TEXT DEFAULT 'light'"),
    ]
    try:
        if USE_POSTGRES:
            cur = conn.cursor()
            for col, ctype in new_cols:
                cur.execute(
                    f"ALTER TABLE platform_tenants ADD COLUMN IF NOT EXISTS {col} {ctype}"
                )
        else:
            existing = {c[1] for c in conn.execute("PRAGMA table_info(platform_tenants)").fetchall()}
            for col, ctype in new_cols:
                if col not in existing:
                    conn.execute(f"ALTER TABLE platform_tenants ADD COLUMN {col} {ctype}")
    except Exception as e:
        logger.debug("Tenant branding migration: %s", e)


def _seed_platform_tickets(conn, _ph):
    """Create platform_tickets / platform_ticket_replies tables and seed demo data.

    These tickets are raised by tenant admins to the platform team (super admin).
    Distinct from helpdesk tickets which are for tenants' own end-customers.
    """
    import datetime, uuid as _uuid

    if USE_POSTGRES:
        conn.cursor().execute("""
            CREATE TABLE IF NOT EXISTS platform_tickets (
                id              TEXT PRIMARY KEY,
                tenant_id       TEXT NOT NULL,
                raised_by       TEXT NOT NULL,
                subject         TEXT NOT NULL,
                body            TEXT NOT NULL,
                category        TEXT DEFAULT 'other',
                priority        TEXT DEFAULT 'medium',
                status          TEXT DEFAULT 'open',
                assigned_to     TEXT,
                created_at      TIMESTAMPTZ DEFAULT NOW(),
                updated_at      TIMESTAMPTZ DEFAULT NOW(),
                resolved_at     TIMESTAMPTZ
            );
            CREATE INDEX IF NOT EXISTS idx_pt_tenant ON platform_tickets(tenant_id);
            CREATE INDEX IF NOT EXISTS idx_pt_status ON platform_tickets(status);

            CREATE TABLE IF NOT EXISTS platform_ticket_replies (
                id              TEXT PRIMARY KEY,
                ticket_id       TEXT NOT NULL,
                author_id       TEXT NOT NULL,
                is_super_admin  BOOLEAN DEFAULT FALSE,
                body            TEXT NOT NULL,
                created_at      TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_ptr_ticket ON platform_ticket_replies(ticket_id);
        """)
    else:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS platform_tickets (
                id              TEXT PRIMARY KEY,
                tenant_id       TEXT NOT NULL,
                raised_by       TEXT NOT NULL,
                subject         TEXT NOT NULL,
                body            TEXT NOT NULL,
                category        TEXT DEFAULT 'other',
                priority        TEXT DEFAULT 'medium',
                status          TEXT DEFAULT 'open',
                assigned_to     TEXT,
                created_at      TEXT DEFAULT (datetime('now')),
                updated_at      TEXT DEFAULT (datetime('now')),
                resolved_at     TEXT
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_pt_tenant ON platform_tickets(tenant_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_pt_status ON platform_tickets(status)")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS platform_ticket_replies (
                id              TEXT PRIMARY KEY,
                ticket_id       TEXT NOT NULL,
                author_id       TEXT NOT NULL,
                is_super_admin  INTEGER DEFAULT 0,
                body            TEXT NOT NULL,
                created_at      TEXT DEFAULT (datetime('now'))
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_ptr_ticket ON platform_ticket_replies(ticket_id)")

    # Seed 3 demo tickets so the inbox isn't empty on first login
    existing = conn.execute("SELECT COUNT(*) FROM platform_tickets").fetchone()[0]
    if existing == 0:
        now = datetime.datetime.utcnow()
        demo = [
            (
                "pt-demo-001", "tenant-swetha", "sw-admin",
                "Razorpay payment failing for monthly invoice",
                "Hi team, we tried to pay our March invoice via Razorpay but the transaction "
                "keeps failing with error 'BAD_REQUEST_ERROR'. Card is valid. Could you check "
                "the payment gateway logs from your end? — Swetha Kumar",
                "billing", "high", "open", None,
                (now - datetime.timedelta(hours=4)).isoformat(),
            ),
            (
                "pt-demo-002", "tenant-swetha", "sw-manager",
                "Voice agent transcription returns empty for Tamil calls",
                "Since yesterday all calls in Tamil are returning empty transcription text. "
                "English calls are working fine. Looks like the Whisper model isn't picking up "
                "the dialect. We have ~30 affected calls. Please investigate.",
                "bug", "urgent", "in_progress", "sa-001",
                (now - datetime.timedelta(days=1)).isoformat(),
            ),
            (
                "pt-demo-003", "tenant-swetha", "sw-admin",
                "Feature request: Bulk lead import via CSV",
                "Currently we have to add leads one by one. Would be great to upload a CSV "
                "with 500-1000 rows in one go. We have a backlog of 2000 leads from a trade "
                "show waiting to be imported.",
                "feature_request", "low", "open", None,
                (now - datetime.timedelta(days=3)).isoformat(),
            ),
        ]
        for t in demo:
            conn.execute(f"""
                INSERT INTO platform_tickets
                (id, tenant_id, raised_by, subject, body, category, priority, status, assigned_to, created_at)
                VALUES ({_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph},{_ph})
            """, t)

        # Seed a couple of replies on the in-progress ticket
        conn.execute(f"""
            INSERT INTO platform_ticket_replies (id, ticket_id, author_id, is_super_admin, body, created_at)
            VALUES ({_ph},{_ph},{_ph},{_ph},{_ph},{_ph})
        """, (
            "ptr-demo-001", "pt-demo-002", "sa-001", 1,
            "Thanks for reporting. We've reproduced this on our staging — looks like the dialect "
            "model fell back to base after a recent deploy. Hot-fix going out today.",
            (now - datetime.timedelta(hours=18)).isoformat(),
        ))
        conn.execute(f"""
            INSERT INTO platform_ticket_replies (id, ticket_id, author_id, is_super_admin, body, created_at)
            VALUES ({_ph},{_ph},{_ph},{_ph},{_ph},{_ph})
        """, (
            "ptr-demo-002", "pt-demo-002", "sw-manager", 0,
            "Thank you! Will wait for the fix and re-run the affected calls through the new model.",
            (now - datetime.timedelta(hours=12)).isoformat(),
        ))

        logger.info("Seeded 3 demo platform tickets for tenant-swetha")
