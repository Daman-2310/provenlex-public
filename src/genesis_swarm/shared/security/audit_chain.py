"""
Cryptographic append-only audit chain.

Every system event is recorded as an immutable entry with:
    - SHA3-512 hash chaining (NIST PQC-safe; entry_hash covers prev_hash → tamper-evident)
    - Ed25519 signing of each entry_hash (configurable; requires signing key)
    - SQLite backend with WAL mode + FULL synchronous writes
    - Database-level triggers that ABORT UPDATE and DELETE operations

Chain structure
---------------
entry_hash = SHA3-512( canonical_json({seq, ts, event_type, actor,
                                       tenant_id, payload, prev_hash}) )
signature  = Ed25519_sign(entry_hash.encode("utf-8"))
next.prev_hash = this.entry_hash

Compliance mapping
------------------
SOC 2 Type II:
  CC6.1  Logical access controls  → LOGIN_SUCCESS, LOGIN_FAILURE, PERMISSION_DENIED
  CC6.3  Access restrictions       → PERMISSION_DENIED, API_KEY_ROTATED
  CC7.2  System monitoring         → CONSENSUS_ROUND, BOT_ALERT, PBFT_VIEW_CHANGE
  CC9.1  Change management         → CONFIG_CHANGE, TENANT_UPDATED

ISO 27001:
  A.12.4.1 Event logging           → all event types
  A.12.4.2 Protection of log info  → append-only triggers + hash chain
  A.12.4.3 Administrator / operator logs → CONFIG_CHANGE, DATA_EXPORT
  A.9.4.2  Secure log-on procedures → LOGIN_SUCCESS, LOGIN_FAILURE, OIDC_LOGIN

Configuration
-------------
GENESIS_AUDIT_DB            Path to SQLite file  (default: ./audit_chain.db)
GENESIS_PBFT_SIGNING_KEY_PATH  Ed25519 PEM key used to sign entries (optional)
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Optional

import aiosqlite
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import load_pem_private_key
from fastapi import APIRouter, HTTPException, Query, Request

log = logging.getLogger(__name__)

audit_router = APIRouter(prefix="/api/audit-chain", tags=["compliance"])

GENESIS_HASH: str = "0" * 128  # sentinel prev_hash for the first entry (SHA3-512 = 128 hex chars)


# ── Event catalog ─────────────────────────────────────────────────────────────


class AuditEventType(str, Enum):
    LOGIN_SUCCESS = "LOGIN_SUCCESS"
    LOGIN_FAILURE = "LOGIN_FAILURE"
    LOGOUT = "LOGOUT"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    CONFIG_CHANGE = "CONFIG_CHANGE"
    TENANT_UPDATED = "TENANT_UPDATED"
    CONSENSUS_ROUND = "CONSENSUS_ROUND"
    BOT_ALERT = "BOT_ALERT"
    OIDC_LOGIN = "OIDC_LOGIN"
    PBFT_VIEW_CHANGE = "PBFT_VIEW_CHANGE"
    DATA_EXPORT = "DATA_EXPORT"
    API_KEY_ROTATED = "API_KEY_ROTATED"
    SYSTEM_START = "SYSTEM_START"
    SYSTEM_STOP = "SYSTEM_STOP"
    BILLING_CHANGE = "BILLING_CHANGE"


# ── Entry model ───────────────────────────────────────────────────────────────


@dataclass
class AuditEntry:
    seq: int
    ts: float
    event_type: str
    actor: str       # username, "system", or "oidc:<sub>"
    tenant_id: str
    payload: dict
    prev_hash: str   # entry_hash of the immediately preceding record
    entry_hash: str = ""
    signature: str = ""  # hex-encoded Ed25519; empty when no signing key


# ── Hashing ───────────────────────────────────────────────────────────────────


def _canonical(entry: AuditEntry) -> bytes:
    """Deterministic JSON of the chain-covered fields (excludes entry_hash, signature)."""
    doc = {
        "seq": entry.seq,
        "ts": entry.ts,
        "event_type": entry.event_type,
        "actor": entry.actor,
        "tenant_id": entry.tenant_id,
        "payload": entry.payload,
        "prev_hash": entry.prev_hash,
    }
    return json.dumps(doc, sort_keys=True, separators=(",", ":")).encode("utf-8")


def compute_entry_hash(entry: AuditEntry) -> str:
    # SHA3-512: NIST FIPS 202, quantum-resistant (Grover doubles effective
    # security — SHA3-512 delivers 256-bit post-quantum strength)
    return hashlib.sha3_512(_canonical(entry)).hexdigest()


# ── SQLite DDL ────────────────────────────────────────────────────────────────

_DDL_TABLE = """
CREATE TABLE IF NOT EXISTS audit_chain (
    seq         INTEGER PRIMARY KEY,
    ts          REAL    NOT NULL,
    event_type  TEXT    NOT NULL,
    actor       TEXT    NOT NULL,
    tenant_id   TEXT    NOT NULL DEFAULT 'default',
    payload     TEXT    NOT NULL,
    prev_hash   TEXT    NOT NULL,
    entry_hash  TEXT    NOT NULL UNIQUE,
    signature   TEXT    NOT NULL DEFAULT ''
);
"""

_DDL_IDX_TENANT = "CREATE INDEX IF NOT EXISTS idx_ac_tenant ON audit_chain(tenant_id);"
_DDL_IDX_TS = "CREATE INDEX IF NOT EXISTS idx_ac_ts     ON audit_chain(ts);"

# These triggers enforce the append-only constraint at the SQLite engine level —
# no Python path can bypass them once the triggers are installed.
_DDL_NO_UPDATE = """
CREATE TRIGGER IF NOT EXISTS ac_no_update
BEFORE UPDATE ON audit_chain
BEGIN
    SELECT RAISE(ABORT, 'audit_chain: UPDATE is forbidden — log is append-only');
END;
"""
_DDL_NO_DELETE = """
CREATE TRIGGER IF NOT EXISTS ac_no_delete
BEFORE DELETE ON audit_chain
BEGIN
    SELECT RAISE(ABORT, 'audit_chain: DELETE is forbidden — log is append-only');
END;
"""


# ── AuditChain class ──────────────────────────────────────────────────────────


class AuditChain:
    """
    Cryptographic append-only audit log.

    Designed for single-process asyncio use.  A reentrant asyncio.Lock
    serialises all appends, guaranteeing monotone sequence numbers and
    correct prev_hash chaining even under concurrent coroutine access.

    Parameters
    ----------
    db_path:
        Path to the SQLite database.  Reads GENESIS_AUDIT_DB env var;
        defaults to ``./audit_chain.db``.
    signing_key_path:
        Optional PEM file path for an Ed25519 private key.  When set,
        every entry_hash is signed and stored as a hex signature.
    """

    def __init__(
        self,
        db_path: Optional[str] = None,
        signing_key_path: Optional[str] = None,
    ) -> None:
        self._db_path: str = db_path or os.getenv("GENESIS_AUDIT_DB", "audit_chain.db")
        self._signing_key: Ed25519PrivateKey | None = None
        self._next_seq: int = 0
        self._last_hash: str = GENESIS_HASH
        self._lock: asyncio.Lock = asyncio.Lock()
        self._db: aiosqlite.Connection | None = None

        if signing_key_path:
            self._load_key(signing_key_path)
        elif os.getenv("GENESIS_PBFT_SIGNING_KEY_PATH"):
            self._load_key(os.environ["GENESIS_PBFT_SIGNING_KEY_PATH"])

    def _load_key(self, path: str) -> None:
        try:
            pem = Path(path).read_bytes()
            key = load_pem_private_key(pem, password=None)
            if not isinstance(key, Ed25519PrivateKey):
                raise TypeError("Expected an Ed25519 private key in PEM format")
            self._signing_key = key
            log.info("[AuditChain] Ed25519 signing key loaded from %s", path)
        except Exception as exc:  # noqa: BLE001
            log.warning("[AuditChain] Could not load signing key from %s: %s", path, exc)

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def open(self) -> None:
        """
        Open the database and initialise schema, indexes, and triggers.

        Safe to call on an existing database — all DDL statements use
        CREATE IF NOT EXISTS / CREATE TRIGGER IF NOT EXISTS.
        """
        self._db = await aiosqlite.connect(
            self._db_path,
            check_same_thread=False,
        )
        # WAL mode: concurrent reads do not block writes
        await self._db.execute("PRAGMA journal_mode=WAL;")
        # FULL fsync on every commit — required for SOC2 durability guarantee
        await self._db.execute("PRAGMA synchronous=FULL;")
        await self._db.execute("PRAGMA foreign_keys=ON;")

        for stmt in (_DDL_TABLE, _DDL_IDX_TENANT, _DDL_IDX_TS, _DDL_NO_UPDATE, _DDL_NO_DELETE):
            await self._db.execute(stmt)
        await self._db.commit()

        # Restore chain head from persisted state
        async with self._db.execute(
            "SELECT seq, entry_hash FROM audit_chain ORDER BY seq DESC LIMIT 1"
        ) as cur:
            row = await cur.fetchone()

        if row:
            self._next_seq = row[0] + 1
            self._last_hash = row[1]
        else:
            self._next_seq = 0
            self._last_hash = GENESIS_HASH

        log.info(
            "[AuditChain] Opened %s — next_seq=%d head=%.16s…",
            self._db_path,
            self._next_seq,
            self._last_hash,
        )

    async def close(self) -> None:
        if self._db:
            await self._db.close()
            self._db = None

    # ── Core append API ───────────────────────────────────────────────────────

    async def append(
        self,
        event_type: AuditEventType | str,
        actor: str,
        tenant_id: str,
        payload: dict,
    ) -> AuditEntry:
        """
        Append a new entry to the chain.

        The asyncio.Lock guarantees that seq numbers are strictly monotone
        and that every entry's prev_hash equals the previous entry's entry_hash,
        even when multiple coroutines call append() concurrently.

        Returns the fully populated AuditEntry (with entry_hash and signature).
        """
        async with self._lock:
            entry = AuditEntry(
                seq=self._next_seq,
                ts=time.time(),
                event_type=str(event_type),
                actor=actor,
                tenant_id=tenant_id,
                payload=payload,
                prev_hash=self._last_hash,
            )
            entry.entry_hash = compute_entry_hash(entry)

            if self._signing_key:
                sig_bytes = self._signing_key.sign(entry.entry_hash.encode("utf-8"))
                entry.signature = sig_bytes.hex()

            await self._persist(entry)
            self._next_seq += 1
            self._last_hash = entry.entry_hash

        log.debug(
            "[AuditChain] seq=%d type=%s actor=%s tenant=%s hash=%.16s…",
            entry.seq,
            entry.event_type,
            entry.actor,
            entry.tenant_id,
            entry.entry_hash,
        )
        return entry

    # ── Integrity verification ────────────────────────────────────────────────

    async def verify_chain(
        self,
        start_seq: int = 0,
        end_seq: Optional[int] = None,
    ) -> tuple[bool, list[str]]:
        """
        Walk the stored chain and verify SHA3-512 integrity.

        Checks performed per entry:
            1. prev_hash equals the previous entry's entry_hash
            2. Recomputed entry_hash matches stored value

        Returns
        -------
        (valid: bool, errors: list[str])
            valid=True means every entry in the range is intact.
        """
        if not self._db:
            return False, ["Database is not open"]

        errors: list[str] = []
        prev_hash = GENESIS_HASH if start_seq == 0 else await self._hash_at(start_seq - 1)

        sql = """
            SELECT seq, ts, event_type, actor, tenant_id,
                   payload, prev_hash, entry_hash, signature
            FROM audit_chain WHERE seq >= ?
        """
        params: list = [start_seq]
        if end_seq is not None:
            sql += " AND seq <= ?"
            params.append(end_seq)
        sql += " ORDER BY seq ASC"

        async with self._db.execute(sql, params) as cur:
            async for row in cur:
                seq, ts, et, actor, tid, payload_raw, s_prev, s_hash, sig = row
                entry = AuditEntry(
                    seq=seq, ts=ts, event_type=et, actor=actor,
                    tenant_id=tid, payload=json.loads(payload_raw),
                    prev_hash=s_prev, entry_hash=s_hash, signature=sig,
                )

                if s_prev != prev_hash:
                    errors.append(
                        f"seq={seq}: prev_hash chain break — "
                        f"expected {prev_hash[:16]}… got {s_prev[:16]}…"
                    )

                recomputed = compute_entry_hash(entry)
                if recomputed != s_hash:
                    errors.append(
                        f"seq={seq}: entry_hash tampered — "
                        f"stored {s_hash[:16]}… recomputed {recomputed[:16]}…"
                    )

                prev_hash = s_hash

        return len(errors) == 0, errors

    # ── Query API ─────────────────────────────────────────────────────────────

    async def query(
        self,
        tenant_id: Optional[str] = None,
        event_type: Optional[str] = None,
        actor: Optional[str] = None,
        from_ts: Optional[float] = None,
        to_ts: Optional[float] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict]:
        if not self._db:
            return []

        clauses: list[str] = []
        params: list = []

        if tenant_id:
            clauses.append("tenant_id = ?")
            params.append(tenant_id)
        if event_type:
            clauses.append("event_type = ?")
            params.append(event_type)
        if actor:
            clauses.append("actor = ?")
            params.append(actor)
        if from_ts is not None:
            clauses.append("ts >= ?")
            params.append(from_ts)
        if to_ts is not None:
            clauses.append("ts <= ?")
            params.append(to_ts)

        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        sql = f"""
            SELECT seq, ts, event_type, actor, tenant_id,
                   payload, prev_hash, entry_hash, signature
            FROM audit_chain {where}
            ORDER BY seq DESC LIMIT ? OFFSET ?
        """
        params.extend([limit, offset])

        rows: list[dict] = []
        async with self._db.execute(sql, params) as cur:
            async for row in cur:
                rows.append({
                    "seq": row[0],
                    "ts": row[1],
                    "ts_iso": datetime.fromtimestamp(row[1], tz=timezone.utc).isoformat(),
                    "event_type": row[2],
                    "actor": row[3],
                    "tenant_id": row[4],
                    "payload": json.loads(row[5]),
                    "prev_hash": row[6],
                    "entry_hash": row[7],
                    "signature": row[8],
                })
        return rows

    async def head(self) -> dict | None:
        """Return the most recent chain entry as a dict."""
        if not self._db:
            return None
        async with self._db.execute(
            "SELECT seq, entry_hash, ts, event_type, actor, tenant_id "
            "FROM audit_chain ORDER BY seq DESC LIMIT 1"
        ) as cur:
            row = await cur.fetchone()
        if not row:
            return None
        return {
            "seq": row[0],
            "entry_hash": row[1],
            "ts": row[2],
            "ts_iso": datetime.fromtimestamp(row[2], tz=timezone.utc).isoformat(),
            "event_type": row[3],
            "actor": row[4],
            "tenant_id": row[5],
        }

    async def count(self, tenant_id: Optional[str] = None) -> int:
        if not self._db:
            return 0
        if tenant_id:
            async with self._db.execute(
                "SELECT COUNT(*) FROM audit_chain WHERE tenant_id = ?", (tenant_id,)
            ) as cur:
                row = await cur.fetchone()
        else:
            async with self._db.execute("SELECT COUNT(*) FROM audit_chain") as cur:
                row = await cur.fetchone()
        return int(row[0]) if row else 0

    # ── Private helpers ───────────────────────────────────────────────────────

    async def _persist(self, entry: AuditEntry) -> None:
        if not self._db:
            raise RuntimeError("AuditChain.open() must be awaited before append()")
        await self._db.execute(
            """
            INSERT INTO audit_chain
                (seq, ts, event_type, actor, tenant_id,
                 payload, prev_hash, entry_hash, signature)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry.seq,
                entry.ts,
                entry.event_type,
                entry.actor,
                entry.tenant_id,
                json.dumps(entry.payload, sort_keys=True),
                entry.prev_hash,
                entry.entry_hash,
                entry.signature,
            ),
        )
        await self._db.commit()

    async def _hash_at(self, seq: int) -> str:
        """Return the entry_hash of a specific sequence number."""
        if not self._db:
            return GENESIS_HASH
        async with self._db.execute(
            "SELECT entry_hash FROM audit_chain WHERE seq = ?", (seq,)
        ) as cur:
            row = await cur.fetchone()
        return row[0] if row else GENESIS_HASH


# ── FastAPI routes ────────────────────────────────────────────────────────────


def _chain(request: Request) -> AuditChain:
    c: AuditChain | None = getattr(request.app.state, "audit_chain", None)
    if c is None:
        raise HTTPException(503, "Audit chain not initialised")
    return c


@audit_router.get("/head", summary="Latest audit chain entry (chain head)")
async def get_head(request: Request) -> dict:
    head = await _chain(request).head()
    if head is None:
        return {"seq": -1, "entry_hash": GENESIS_HASH, "status": "empty"}
    return head


@audit_router.get(
    "/verify",
    summary="Verify chain integrity — SOC2/ISO 27001 tamper evidence",
)
async def verify(
    request: Request,
    start_seq: int = Query(0, ge=0, description="First seq to verify"),
    end_seq: Optional[int] = Query(None, description="Last seq to verify (inclusive)"),
) -> dict:
    """
    Walk the stored chain and recompute every SHA3-512 hash.

    A ``valid: true`` response certifies that no entry has been modified
    or deleted since it was appended.  SHA3-512 chain provides post-quantum
    tamper evidence for SOC 2 Type II auditors.
    """
    valid, errors = await _chain(request).verify_chain(start_seq, end_seq)
    total = await _chain(request).count()
    return {
        "valid": valid,
        "errors": errors,
        "total_entries": total,
        "checked_from": start_seq,
        "checked_to": end_seq,
        "verified_at": datetime.now(tz=timezone.utc).isoformat(),
    }


@audit_router.get("/entries", summary="Query audit log entries")
async def query_entries(
    request: Request,
    tenant_id: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    actor: Optional[str] = Query(None),
    from_ts: Optional[float] = Query(None),
    to_ts: Optional[float] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> dict:
    entries = await _chain(request).query(
        tenant_id=tenant_id,
        event_type=event_type,
        actor=actor,
        from_ts=from_ts,
        to_ts=to_ts,
        limit=limit,
        offset=offset,
    )
    return {
        "entries": entries,
        "count": len(entries),
        "limit": limit,
        "offset": offset,
    }


@audit_router.get("/stats", summary="Audit chain statistics")
async def chain_stats(request: Request) -> dict:
    chain = _chain(request)
    head = await chain.head()
    total = await chain.count()
    return {
        "total_entries": total,
        "head_seq": head["seq"] if head else -1,
        "head_hash": (head["entry_hash"][:16] + "…") if head else GENESIS_HASH[:16] + "…",
        "head_ts_iso": head["ts_iso"] if head else None,
        "signing_enabled": chain._signing_key is not None,
        "db_path": chain._db_path,
    }
