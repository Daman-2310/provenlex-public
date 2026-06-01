from __future__ import annotations

"""Async database layer — SQLite in dev, PostgreSQL in production.

Set DATABASE_URL to enable production mode:
    DATABASE_URL=postgresql://user:pass@host/dbname   (Railway, Render, k8s)

Without DATABASE_URL, falls back to SQLite at GENESIS_CASE_DB_PATH.
Connection pooling is enabled automatically for PostgreSQL.
"""

import os
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

_raw = os.getenv("DATABASE_URL", "")
if not _raw:
    _db_path = os.getenv("GENESIS_CASE_DB_PATH", "cases.db")
    _url = f"sqlite+aiosqlite:///{_db_path}"
elif _raw.startswith("postgres://"):
    _url = _raw.replace("postgres://", "postgresql+asyncpg://", 1)
elif _raw.startswith("postgresql://") and "+asyncpg" not in _raw:
    _url = _raw.replace("postgresql://", "postgresql+asyncpg://", 1)
else:
    _url = _raw

_is_pg = "postgresql" in _url

_engine = create_async_engine(
    _url,
    echo=False,
    future=True,
    **({
        "pool_size": 10,
        "max_overflow": 20,
        "pool_pre_ping": True,
        "pool_recycle": 3600,
    } if _is_pg else {}),
)

# Enable WAL mode for SQLite (ignored by PostgreSQL)
if not _is_pg:
    from sqlalchemy import event

    @event.listens_for(_engine.sync_engine, "connect")
    def _sqlite_pragmas(conn, _record):  # type: ignore[misc]
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA synchronous=NORMAL")


_SessionLocal: sessionmaker = sessionmaker(
    bind=_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


@asynccontextmanager
async def get_db():
    """Yield an async SQLAlchemy session; auto-commit on success, rollback on error."""
    async with _SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def is_postgres() -> bool:
    """True when connected to PostgreSQL; useful for dialect-specific SQL."""
    return _is_pg
