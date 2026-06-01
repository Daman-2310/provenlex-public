"""
Genesis Swarm — Immutable HMAC-SHA256-chained Audit Trail

Every compliance session event is appended to an SQLite log.  Each entry
commits an HMAC over:

    f"{seq}|{ts_ns}|{session_id}|{event_type}|{payload_json}|{prev_hmac}"

The chain property means any tampering with a historical entry invalidates
all subsequent HMACs — detectable by a single O(n) verify sweep.

Environment:
  GENESIS_AUDIT_DB    SQLite path       (default: ./genesis_audit.db)
  GENESIS_AUDIT_KEY   HMAC key hex-64   (auto-generated + warned if absent)
"""

from __future__ import annotations

import hashlib
import hmac as _hmac
import json
import logging
import os
import secrets
import sqlite3
import threading
import time
from dataclasses import dataclass
from typing import Any

log = logging.getLogger(__name__)

_DB_PATH = os.getenv("GENESIS_AUDIT_DB", "./genesis_audit.db")


def _load_audit_key() -> bytes:
    raw = os.getenv("GENESIS_AUDIT_KEY", "")
    if raw:
        try:
            return bytes.fromhex(raw)
        except ValueError:
            return raw.encode()
    key = secrets.token_bytes(32)
    log.warning(
        "GENESIS_AUDIT_KEY not set — audit chain uses ephemeral key. "
        "Set GENESIS_AUDIT_KEY in production for cross-restart chain continuity."
    )
    return key


_AUDIT_KEY: bytes = _load_audit_key()
_lock = threading.Lock()
_conn: sqlite3.Connection | None = None


def _connection() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(_DB_PATH, check_same_thread=False)
        _conn.execute("""
            CREATE TABLE IF NOT EXISTS audit_log (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                seq         INTEGER NOT NULL,
                ts_ns       INTEGER NOT NULL,
                session_id  TEXT    NOT NULL,
                event_type  TEXT    NOT NULL,
                worker      TEXT    NOT NULL DEFAULT '',
                payload     TEXT    NOT NULL DEFAULT '{}',
                prev_hmac   TEXT    NOT NULL,
                hmac_hex    TEXT    NOT NULL
            )
        """)
        _conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_session ON audit_log(session_id)"
        )
        _conn.commit()
    return _conn


def _sign(
    seq: int, ts_ns: int, session_id: str,
    event_type: str, payload: str, prev_hmac: str,
) -> str:
    msg = f"{seq}|{ts_ns}|{session_id}|{event_type}|{payload}|{prev_hmac}".encode()
    return _hmac.new(_AUDIT_KEY, msg, hashlib.sha256).hexdigest()


@dataclass(frozen=True)
class AuditEntry:
    id:         int
    seq:        int
    ts_ns:      int
    session_id: str
    event_type: str
    worker:     str
    payload:    str
    prev_hmac:  str
    hmac_hex:   str


def append(
    session_id: str,
    event_type: str,
    worker: str = "",
    data: Any = None,
) -> AuditEntry:
    """Append a signed event to the audit trail.  Thread-safe."""
    payload = json.dumps(data, default=str) if data is not None else "{}"
    ts_ns   = time.time_ns()

    with _lock:
        conn = _connection()
        row = conn.execute(
            "SELECT seq, hmac_hex FROM audit_log ORDER BY seq DESC LIMIT 1"
        ).fetchone()
        prev_seq  = row[0] if row else 0
        prev_hmac = row[1] if row else "0" * 64
        seq       = prev_seq + 1

        hmac_hex = _sign(seq, ts_ns, session_id, event_type, payload, prev_hmac)
        cursor = conn.execute(
            "INSERT INTO audit_log "
            "(seq, ts_ns, session_id, event_type, worker, payload, prev_hmac, hmac_hex) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (seq, ts_ns, session_id, event_type, worker, payload, prev_hmac, hmac_hex),
        )
        conn.commit()
        entry_id = cursor.lastrowid or 0

    return AuditEntry(
        id=entry_id, seq=seq, ts_ns=ts_ns,
        session_id=session_id, event_type=event_type,
        worker=worker, payload=payload,
        prev_hmac=prev_hmac, hmac_hex=hmac_hex,
    )


def verify_chain() -> tuple[bool, int]:
    """
    Sweep the entire chain and verify every HMAC.

    Returns (True, -1) if intact, or (False, first_broken_seq) on tampering.
    """
    conn = _connection()
    rows = conn.execute(
        "SELECT seq, ts_ns, session_id, event_type, payload, prev_hmac, hmac_hex "
        "FROM audit_log ORDER BY seq ASC"
    ).fetchall()

    for row in rows:
        seq, ts_ns, sid, etype, payload, prev_hmac, stored = row
        expected = _sign(seq, ts_ns, sid, etype, payload, prev_hmac)
        if not _hmac.compare_digest(expected, stored):
            return False, seq

    return True, -1


def get_session_trail(session_id: str) -> list[AuditEntry]:
    """Retrieve all audit entries for a session, ordered by sequence."""
    conn = _connection()
    rows = conn.execute(
        "SELECT id, seq, ts_ns, session_id, event_type, worker, payload, prev_hmac, hmac_hex "
        "FROM audit_log WHERE session_id = ? ORDER BY seq ASC",
        (session_id,),
    ).fetchall()
    return [AuditEntry(*row) for row in rows]
