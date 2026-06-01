from __future__ import annotations

import os
import sqlite3
import time
import uuid
from contextlib import asynccontextmanager
from typing import Literal

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ...shared.schemas import CaseSchema
from .auth import _require_auth

router = APIRouter()

_DB_PATH = os.getenv("GENESIS_CASE_DB_PATH", "cases.db")


def _init_db() -> None:
    """One-time synchronous schema bootstrap — runs at import, never during requests."""
    db_dir = os.path.dirname(_DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    with sqlite3.connect(_DB_PATH) as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at REAL NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS cases (
                id TEXT PRIMARY KEY,
                bot_type TEXT NOT NULL,
                score REAL NOT NULL,
                summary TEXT,
                status TEXT DEFAULT 'OPEN',
                notes TEXT DEFAULT '',
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
        """)
        conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)",
            (1, time.time()),
        )
        conn.execute("PRAGMA user_version = 1")
        conn.commit()


_init_db()


@asynccontextmanager
async def _db():
    async with aiosqlite.connect(_DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        yield conn


# ── Request models ────────────────────────────────────────────────────────────


class CaseCreateRequest(BaseModel):
    bot_type: str = Field("UNKNOWN", max_length=64)
    score: float = Field(0.0, ge=0.0, le=100.0)
    summary: str = Field("", max_length=1000)
    notes: str = Field("", max_length=2000)


class CaseUpdateRequest(BaseModel):
    status: Literal["OPEN", "INVESTIGATING", "ESCALATED", "CLOSED"] | None = None
    notes: str | None = Field(None, max_length=2000)


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("/api/cases", response_model=list[CaseSchema])
async def get_cases(
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[dict]:
    async with _db() as conn:
        cursor = await conn.execute(
            "SELECT * FROM cases ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (limit, offset),
        )
        rows = await cursor.fetchall()
    return [dict(r) for r in rows]


@router.post("/api/cases", response_model=CaseSchema, status_code=201)
async def create_case(
    body: CaseCreateRequest,
    _user: str = Depends(_require_auth),
) -> dict:
    case_id = str(uuid.uuid4())[:8].upper()
    now = time.time()
    async with _db() as conn:
        await conn.execute(
            "INSERT INTO cases VALUES (?,?,?,?,?,?,?,?)",
            (case_id, body.bot_type, body.score, body.summary, "OPEN", body.notes, now, now),
        )
        await conn.commit()
    result = {
        "id": case_id, "bot_type": body.bot_type, "score": body.score,
        "summary": body.summary, "status": "OPEN", "notes": body.notes,
        "created_at": now, "updated_at": now,
    }
    try:
        import asyncio
        from ...shared.webhooks import deliver_event as _wh_deliver
        asyncio.create_task(_wh_deliver("case.created", result))
    except Exception:
        pass
    return result


@router.patch("/api/cases/{case_id}", response_model=CaseSchema)
async def update_case(
    case_id: str,
    body: CaseUpdateRequest,
    _user: str = Depends(_require_auth),
) -> dict:
    now = time.time()
    async with _db() as conn:
        cursor = await conn.execute("SELECT * FROM cases WHERE id=?", (case_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "Case not found")
        row_dict = dict(row)
        new_status = body.status if body.status is not None else row_dict["status"]
        new_notes = body.notes if body.notes is not None else row_dict["notes"]
        await conn.execute(
            "UPDATE cases SET status=?, notes=?, updated_at=? WHERE id=?",
            (new_status, new_notes, now, case_id),
        )
        await conn.commit()
    result = {**row_dict, "status": new_status, "notes": new_notes, "updated_at": now}
    try:
        import asyncio
        from ...shared.webhooks import deliver_event as _wh_deliver
        asyncio.create_task(_wh_deliver("case.updated", result))
    except Exception:
        pass
    return result


@router.delete("/api/cases/{case_id}")
async def delete_case(
    case_id: str,
    _user: str = Depends(_require_auth),
) -> dict:
    async with _db() as conn:
        await conn.execute("DELETE FROM cases WHERE id=?", (case_id,))
        await conn.commit()
    return {"deleted": case_id}
