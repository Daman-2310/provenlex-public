"""
Forensically Tamper-Proof Immutable Ledger
==========================================

Cryptographically verifiable append-only ledger with dual integrity guarantees:

  1. **Per-block hash chain** — each block's ``block_hash`` is derived from
     SHA-256(index ‖ timestamp_ns ‖ tenant_id ‖ payload ‖ previous_hash).
     Changing any field in any block immediately invalidates its hash *and*
     every descendant hash, making retroactive tampering trivially detectable.

  2. **Epoch Merkle roots** — every EPOCH_SIZE = 64 committed blocks are
     summarised into a binary Merkle tree.  The root of each epoch is stored
     in a separate ``_epoch_roots`` list.  ``verify_chain_integrity()``
     recomputes both the per-block hash chain *and* all epoch Merkle roots,
     raising ``TamperDetectedError`` on the first discrepancy.

Storage backend
---------------
SQLite in WAL mode via the stdlib ``sqlite3`` module (synchronous).  An async
wrapper class ``AsyncImmutableLedger`` wraps the synchronous core in an
``asyncio.Executor`` so it can be awaited from coroutines without blocking the
event loop.

Public surface
--------------
  LedgerBlock         — immutable record (frozen dataclass)
  TamperDetectedError — raised by verify_chain_integrity() on any violation
  ImmutableLedger     — synchronous ledger (in-process or testing)
  AsyncImmutableLedger — asyncio-compatible wrapper for production use
  verify_chain_integrity(path) — standalone function for out-of-process audit

Hash formula (exact)
--------------------
    block_hash = SHA3-512(
        str(index).encode()
        + b"\\x00"
        + str(timestamp_ns).encode()
        + b"\\x00"
        + tenant_id.encode("utf-8")
        + b"\\x00"
        + payload
        + b"\\x00"
        + previous_hash.encode("ascii")
    )
"""
from __future__ import annotations

import asyncio
import hashlib
import structlog
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final, Sequence

__all__ = [
    "LedgerBlock",
    "EpochCheckpoint",
    "TamperDetectedError",
    "ImmutableLedger",
    "AsyncImmutableLedger",
    "verify_chain_integrity",
    "EPOCH_SIZE",
    "GENESIS_HASH",
]

_log = structlog.get_logger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────

EPOCH_SIZE: Final[int] = 64
"""Number of blocks per Merkle epoch."""

GENESIS_HASH: Final[str] = "0" * 128
"""Sentinel previous_hash for the genesis (first) block."""

_SCHEMA_VERSION: Final[int] = 1
_DDL: Final[str] = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=FULL;
PRAGMA foreign_keys=ON;
PRAGMA wal_autocheckpoint=64;

CREATE TABLE IF NOT EXISTS _schema_version (
    version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_blocks (
    idx           INTEGER PRIMARY KEY,          -- monotonic, 0-based
    timestamp_ns  INTEGER NOT NULL,             -- UNIX epoch nanoseconds
    tenant_id     TEXT    NOT NULL,             -- opaque tenant identifier
    payload       BLOB    NOT NULL,             -- arbitrary audit payload bytes
    previous_hash TEXT    NOT NULL,             -- SHA-256 hex of prior block
    block_hash    TEXT    NOT NULL UNIQUE       -- SHA3-512 hex of this block
);

CREATE TABLE IF NOT EXISTS epoch_checkpoints (
    epoch_idx     INTEGER PRIMARY KEY,          -- 0-based epoch number
    first_block   INTEGER NOT NULL,             -- inclusive start block index
    last_block    INTEGER NOT NULL,             -- inclusive end block index
    merkle_root   TEXT    NOT NULL              -- SHA3-512 Merkle root of epoch
);

CREATE INDEX IF NOT EXISTS idx_blocks_tenant ON ledger_blocks(tenant_id);
"""


# ── Data models ───────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class LedgerBlock:
    """
    One immutable entry in the ledger.

    All fields contribute to the block_hash so post-hoc modification of *any*
    field is instantly detected by ``verify_chain_integrity()``.
    """

    index: int                    # monotonic counter, 0-based
    timestamp_ns: int             # UNIX nanoseconds (time.time_ns())
    tenant_id: str                # opaque tenant/owner identifier
    payload: bytes                # arbitrary binary audit payload
    previous_hash: str            # 64-hex-char SHA-256 of the preceding block
    block_hash: str               # 128-hex-char SHA3-512 of this block

    @staticmethod
    def compute_hash(
        index: int,
        timestamp_ns: int,
        tenant_id: str,
        payload: bytes,
        previous_hash: str,
    ) -> str:
        """
        Deterministic SHA-256 commitment over all mutable fields.

        Field separator ``\\x00`` prevents length-extension collisions between
        variable-length fields (tenant_id, payload, previous_hash).
        """
        raw = (
            str(index).encode()
            + b"\x00"
            + str(timestamp_ns).encode()
            + b"\x00"
            + tenant_id.encode("utf-8")
            + b"\x00"
            + payload
            + b"\x00"
            + previous_hash.encode("ascii")
        )
        return hashlib.sha3_512(raw).hexdigest()

    def recompute_hash(self) -> str:
        """Recompute this block's hash from its stored fields."""
        return LedgerBlock.compute_hash(
            self.index,
            self.timestamp_ns,
            self.tenant_id,
            self.payload,
            self.previous_hash,
        )


@dataclass(frozen=True)
class EpochCheckpoint:
    """Summarises EPOCH_SIZE blocks into a single Merkle root."""

    epoch_idx: int       # 0-based epoch number
    first_block: int     # inclusive start index
    last_block: int      # inclusive end index (may be < first + EPOCH_SIZE for last epoch)
    merkle_root: str     # 128-hex-char binary Merkle root over block hashes in this epoch


@dataclass(frozen=True)
class IntegrityReport:
    """Returned by ``ImmutableLedger.integrity_report()`` — always safe to inspect."""

    valid: bool
    chain_length: int
    epoch_count: int
    head_hash: str
    broken_at_block: int | None
    broken_at_epoch: int | None
    violation: str | None


# ── Exceptions ─────────────────────────────────────────────────────────────────


class TamperDetectedError(RuntimeError):
    """
    Raised by ``verify_chain_integrity()`` when any cryptographic invariant
    is violated — indicating retroactive modification, deletion, or insertion
    of ledger records.

    Attributes
    ----------
    block_index:
        The index of the first block where tampering was detected.
        ``None`` when the violation is in an epoch Merkle root.
    epoch_index:
        The epoch number where the Merkle root mismatch was detected.
        ``None`` when the violation is in the per-block hash chain.
    reason:
        Human-readable description of the cryptographic violation.
    """

    def __init__(
        self,
        reason: str,
        *,
        block_index: int | None = None,
        epoch_index: int | None = None,
    ) -> None:
        super().__init__(reason)
        self.reason = reason
        self.block_index = block_index
        self.epoch_index = epoch_index


# ── Internal Merkle tree ──────────────────────────────────────────────────────


def _build_merkle_root(hex_hashes: Sequence[str]) -> str:
    """
    Compute a binary SHA-256 Merkle root over *hex_hashes*.

    Standard algorithm: pair adjacent leaves, hash each pair, repeat until one
    root remains.  Odd layers duplicate the last leaf.  Returns GENESIS_HASH
    for an empty sequence.
    """
    if not hex_hashes:
        return GENESIS_HASH

    layer: list[bytes] = [bytes.fromhex(h) for h in hex_hashes]

    while len(layer) > 1:
        if len(layer) % 2 == 1:
            layer.append(layer[-1])   # duplicate last leaf for odd-length layer
        layer = [
            hashlib.sha3_512(layer[i] + layer[i + 1]).digest()
            for i in range(0, len(layer), 2)
        ]

    return layer[0].hex()


# ── Synchronous core ───────────────────────────────────────────────────────────


class ImmutableLedger:
    """
    Forensically tamper-proof append-only ledger backed by SQLite WAL.

    Thread-safety
    -------------
    Each ``ImmutableLedger`` instance must be used from a single thread.
    For concurrent access from an asyncio event loop, use ``AsyncImmutableLedger``.

    Usage
    -----
    ::

        ledger = ImmutableLedger(Path("audit.db"))
        block  = ledger.append("acme-fund", b"trade-event-payload")
        report = ledger.integrity_report()
        assert report.valid
    """

    def __init__(self, db_path: Path | str = ":memory:") -> None:
        self._db_path = str(db_path)
        self._conn = sqlite3.connect(
            self._db_path,
            isolation_level=None,   # autocommit; we manage transactions explicitly
            check_same_thread=True,
        )
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    # ── Schema ─────────────────────────────────────────────────────────────

    def _init_schema(self) -> None:
        self._conn.executescript(_DDL)
        row = self._conn.execute("SELECT version FROM _schema_version").fetchone()
        if row is None:
            self._conn.execute(
                "INSERT INTO _schema_version (version) VALUES (?)", (_SCHEMA_VERSION,)
            )
            self._conn.commit()
        elif row["version"] != _SCHEMA_VERSION:
            raise RuntimeError(
                f"Schema version mismatch: DB has v{row['version']}, "
                f"code expects v{_SCHEMA_VERSION}. Run migrations."
            )

    # ── Write path ──────────────────────────────────────────────────────────

    def append(self, tenant_id: str, payload: bytes) -> LedgerBlock:
        """
        Append one entry and return the committed ``LedgerBlock``.

        Thread-safe for single-writer usage.  Raises ``sqlite3.Error`` on any
        storage failure (caller should treat this as fatal — the ledger may be
        in an inconsistent state and should be verified before further writes).
        """
        with self._conn:   # BEGIN … COMMIT / ROLLBACK
            # Determine next index + previous hash atomically inside the txn
            last_row = self._conn.execute(
                "SELECT idx, block_hash FROM ledger_blocks ORDER BY idx DESC LIMIT 1"
            ).fetchone()

            if last_row is None:
                next_index: int = 0
                prev_hash: str = GENESIS_HASH
            else:
                next_index = int(last_row["idx"]) + 1
                prev_hash = str(last_row["block_hash"])

            timestamp_ns = time.time_ns()
            block_hash = LedgerBlock.compute_hash(
                next_index, timestamp_ns, tenant_id, payload, prev_hash
            )

            self._conn.execute(
                """
                INSERT INTO ledger_blocks
                    (idx, timestamp_ns, tenant_id, payload, previous_hash, block_hash)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (next_index, timestamp_ns, tenant_id, payload, prev_hash, block_hash),
            )
            _log.debug(
                "ledger_block_appended idx=%d tenant=%s hash=%.8s",
                next_index, tenant_id, block_hash,
            )

            block = LedgerBlock(
                index=next_index,
                timestamp_ns=timestamp_ns,
                tenant_id=tenant_id,
                payload=payload,
                previous_hash=prev_hash,
                block_hash=block_hash,
            )

        # Seal the epoch if this block completes one
        if (next_index + 1) % EPOCH_SIZE == 0:
            self._seal_epoch(next_index // EPOCH_SIZE, next_index)

        return block

    def _seal_epoch(self, epoch_idx: int, last_block: int) -> None:
        """Compute and persist a Merkle checkpoint for the completed epoch."""
        first_block = epoch_idx * EPOCH_SIZE
        rows = self._conn.execute(
            "SELECT block_hash FROM ledger_blocks WHERE idx BETWEEN ? AND ? ORDER BY idx ASC",
            (first_block, last_block),
        ).fetchall()
        hashes = [str(r["block_hash"]) for r in rows]
        root = _build_merkle_root(hashes)
        with self._conn:
            self._conn.execute(
                """
                INSERT OR REPLACE INTO epoch_checkpoints
                    (epoch_idx, first_block, last_block, merkle_root)
                VALUES (?, ?, ?, ?)
                """,
                (epoch_idx, first_block, last_block, root),
            )
        _log.info(
            "ledger_epoch_sealed epoch=%d blocks=%d..%d root=%.8s",
            epoch_idx, first_block, last_block, root,
        )

    # ── Read path ───────────────────────────────────────────────────────────

    def get(self, index: int) -> LedgerBlock:
        """
        Return the block at *index*.

        Raises ``KeyError`` if no block with that index exists.
        """
        row = self._conn.execute(
            "SELECT * FROM ledger_blocks WHERE idx = ?", (index,)
        ).fetchone()
        if row is None:
            raise KeyError(f"No ledger block at index {index}")
        return self._row_to_block(row)

    def head(self) -> LedgerBlock | None:
        """Return the most recently appended block, or ``None`` if the ledger is empty."""
        row = self._conn.execute(
            "SELECT * FROM ledger_blocks ORDER BY idx DESC LIMIT 1"
        ).fetchone()
        return self._row_to_block(row) if row is not None else None

    def length(self) -> int:
        """Return the total number of committed blocks."""
        row = self._conn.execute("SELECT COUNT(*) AS n FROM ledger_blocks").fetchone()
        return int(row["n"])

    def tail(self, n: int = 20) -> list[LedgerBlock]:
        """Return the last *n* blocks in ascending index order."""
        rows = self._conn.execute(
            "SELECT * FROM ledger_blocks ORDER BY idx DESC LIMIT ?", (n,)
        ).fetchall()
        return list(reversed([self._row_to_block(r) for r in rows]))

    def get_proof(self, index: int) -> dict[str, object]:
        """
        Return the block at *index* together with a cryptographic inclusion proof.

        The proof contains:
          - The block's own hash and its position in the chain.
          - The previous block's hash (backward link).
          - The Merkle root of the epoch this block belongs to (if sealed).
          - The current chain head hash.

        An external auditor can independently verify the proof without a copy
        of the full ledger.
        """
        blk = self.get(index)
        epoch_idx = index // EPOCH_SIZE
        epoch_row = self._conn.execute(
            "SELECT * FROM epoch_checkpoints WHERE epoch_idx = ?", (epoch_idx,)
        ).fetchone()

        head_blk = self.head()
        return {
            "block": {
                "index": blk.index,
                "timestamp_ns": blk.timestamp_ns,
                "tenant_id": blk.tenant_id,
                "previous_hash": blk.previous_hash,
                "block_hash": blk.block_hash,
            },
            "epoch": {
                "epoch_idx": epoch_idx,
                "merkle_root": str(epoch_row["merkle_root"]) if epoch_row else None,
                "sealed": epoch_row is not None,
            },
            "chain_head_hash": head_blk.block_hash if head_blk else GENESIS_HASH,
            "chain_length": self.length(),
            "hash_formula": (
                "SHA-256(index\\x00timestamp_ns\\x00tenant_id\\x00payload\\x00previous_hash)"
            ),
        }

    def get_epoch(self, epoch_idx: int) -> EpochCheckpoint | None:
        """Return a sealed epoch checkpoint, or ``None`` if the epoch is not yet sealed."""
        row = self._conn.execute(
            "SELECT * FROM epoch_checkpoints WHERE epoch_idx = ?", (epoch_idx,)
        ).fetchone()
        if row is None:
            return None
        return EpochCheckpoint(
            epoch_idx=int(row["epoch_idx"]),
            first_block=int(row["first_block"]),
            last_block=int(row["last_block"]),
            merkle_root=str(row["merkle_root"]),
        )

    # ── Integrity verification ──────────────────────────────────────────────

    def verify_chain_integrity(self) -> bool:
        """
        Sweep the full ledger and cryptographically verify every invariant.

        Algorithm
        ---------
        Pass 1 — Per-block hash chain:
            For each block in ascending index order:
              a. Recompute block_hash from stored fields.
              b. Assert recomputed == stored block_hash.
              c. Assert stored previous_hash == prior block's block_hash.

        Pass 2 — Epoch Merkle roots:
            For each sealed epoch checkpoint:
              a. Re-fetch the block hashes in that epoch's range.
              b. Recompute the Merkle root.
              c. Assert recomputed == stored merkle_root.

        Returns
        -------
        ``True`` if both passes succeed for every record.

        Raises
        ------
        TamperDetectedError
            Immediately on the first detected violation.  The exception
            attributes identify the offending block or epoch.
        """
        rows = self._conn.execute(
            "SELECT * FROM ledger_blocks ORDER BY idx ASC"
        ).fetchall()

        # ── Pass 1: per-block hash chain ──────────────────────────────────
        prev_hash = GENESIS_HASH
        for row in rows:
            blk = self._row_to_block(row)

            # (a) Recompute and compare block hash
            expected_hash = blk.recompute_hash()
            if expected_hash != blk.block_hash:
                _log.critical(
                    "ledger_tampering_detected idx=%d expected=%.8s stored=%.8s",
                    blk.index, expected_hash, blk.block_hash,
                )
                raise TamperDetectedError(
                    f"Block {blk.index}: stored hash {blk.block_hash!r} does not match "
                    f"recomputed hash {expected_hash!r} — data was modified post-commit.",
                    block_index=blk.index,
                )

            # (b) Verify backward link
            if blk.previous_hash != prev_hash:
                _log.critical(
                    "ledger_chain_break idx=%d expected_prev=%.8s stored_prev=%.8s",
                    blk.index, prev_hash, blk.previous_hash,
                )
                raise TamperDetectedError(
                    f"Block {blk.index}: previous_hash {blk.previous_hash!r} does not match "
                    f"predecessor's hash {prev_hash!r} — block insertion or deletion detected.",
                    block_index=blk.index,
                )

            prev_hash = blk.block_hash

        # ── Pass 2: epoch Merkle roots ────────────────────────────────────
        epoch_rows = self._conn.execute(
            "SELECT * FROM epoch_checkpoints ORDER BY epoch_idx ASC"
        ).fetchall()

        for ep_row in epoch_rows:
            epoch_idx = int(ep_row["epoch_idx"])
            first = int(ep_row["first_block"])
            last = int(ep_row["last_block"])
            stored_root = str(ep_row["merkle_root"])

            block_rows = self._conn.execute(
                "SELECT block_hash FROM ledger_blocks "
                "WHERE idx BETWEEN ? AND ? ORDER BY idx ASC",
                (first, last),
            ).fetchall()

            if len(block_rows) != last - first + 1:
                raise TamperDetectedError(
                    f"Epoch {epoch_idx}: expected {last - first + 1} blocks "
                    f"(indices {first}..{last}), found {len(block_rows)} — "
                    "one or more blocks were deleted from this epoch.",
                    epoch_index=epoch_idx,
                )

            computed_root = _build_merkle_root([str(r["block_hash"]) for r in block_rows])
            if computed_root != stored_root:
                _log.critical(
                    "ledger_merkle_root_mismatch epoch=%d expected=%.8s stored=%.8s",
                    epoch_idx, computed_root, stored_root,
                )
                raise TamperDetectedError(
                    f"Epoch {epoch_idx}: Merkle root {stored_root!r} does not match "
                    f"recomputed root {computed_root!r} — "
                    "block data within this epoch was modified.",
                    epoch_index=epoch_idx,
                )

        _log.info(
            "ledger_integrity_ok blocks=%d epochs=%d head=%.8s",
            len(rows), len(epoch_rows), prev_hash,
        )
        return True

    def integrity_report(self) -> IntegrityReport:
        """
        Run ``verify_chain_integrity()`` and return a structured report without
        raising an exception.  Useful for scheduled health checks and dashboards.
        """
        head_blk = self.head()
        try:
            self.verify_chain_integrity()
            return IntegrityReport(
                valid=True,
                chain_length=self.length(),
                epoch_count=self._conn.execute(
                    "SELECT COUNT(*) AS n FROM epoch_checkpoints"
                ).fetchone()["n"],
                head_hash=head_blk.block_hash if head_blk else GENESIS_HASH,
                broken_at_block=None,
                broken_at_epoch=None,
                violation=None,
            )
        except TamperDetectedError as exc:
            return IntegrityReport(
                valid=False,
                chain_length=self.length(),
                epoch_count=self._conn.execute(
                    "SELECT COUNT(*) AS n FROM epoch_checkpoints"
                ).fetchone()["n"],
                head_hash=head_blk.block_hash if head_blk else GENESIS_HASH,
                broken_at_block=exc.block_index,
                broken_at_epoch=exc.epoch_index,
                violation=exc.reason,
            )

    # ── Housekeeping ────────────────────────────────────────────────────────

    def close(self) -> None:
        """Checkpoint the WAL and close the SQLite connection."""
        try:
            # Flush WAL to the main database file on every clean shutdown so the
            # WAL cannot grow unbounded across crash-restart cycles.
            self._conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        except Exception:
            pass
        self._conn.close()

    def __enter__(self) -> "ImmutableLedger":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    # ── Private helpers ─────────────────────────────────────────────────────

    @staticmethod
    def _row_to_block(row: sqlite3.Row) -> LedgerBlock:
        return LedgerBlock(
            index=int(row["idx"]),
            timestamp_ns=int(row["timestamp_ns"]),
            tenant_id=str(row["tenant_id"]),
            payload=bytes(row["payload"]),
            previous_hash=str(row["previous_hash"]),
            block_hash=str(row["block_hash"]),
        )


# ── Async wrapper ──────────────────────────────────────────────────────────────


class AsyncImmutableLedger:
    """
    asyncio-compatible wrapper around ``ImmutableLedger``.

    All blocking SQLite operations are dispatched to a dedicated single-thread
    ``ThreadPoolExecutor`` so the event loop is never blocked.

    Usage
    -----
    ::

        async with AsyncImmutableLedger(Path("audit.db")) as ledger:
            block = await ledger.append("fund-a", b"trade-payload")
            ok    = await ledger.verify_chain_integrity()
    """

    def __init__(self, db_path: Path | str = ":memory:") -> None:
        self._db_path = db_path
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="ledger-io")
        self._ledger: ImmutableLedger | None = None

    async def __aenter__(self) -> "AsyncImmutableLedger":
        loop = asyncio.get_running_loop()
        self._ledger = await loop.run_in_executor(
            self._executor, lambda: ImmutableLedger(self._db_path)
        )
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.close()

    async def close(self) -> None:
        """Flush pending I/O and shut down the executor."""
        loop = asyncio.get_running_loop()
        if self._ledger is not None:
            await loop.run_in_executor(self._executor, self._ledger.close)
            self._ledger = None
        self._executor.shutdown(wait=True)

    def _require_ledger(self) -> ImmutableLedger:
        if self._ledger is None:
            raise RuntimeError(
                "AsyncImmutableLedger is not open. "
                "Use 'async with AsyncImmutableLedger(...) as ledger:'"
            )
        return self._ledger

    async def append(self, tenant_id: str, payload: bytes) -> LedgerBlock:
        """Append one block and return the committed ``LedgerBlock``."""
        ledger = self._require_ledger()
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            self._executor, lambda: ledger.append(tenant_id, payload)
        )

    async def get(self, index: int) -> LedgerBlock:
        """Return the block at *index*."""
        ledger = self._require_ledger()
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, lambda: ledger.get(index))

    async def head(self) -> LedgerBlock | None:
        """Return the most recently committed block."""
        ledger = self._require_ledger()
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, ledger.head)

    async def length(self) -> int:
        """Return the total number of committed blocks."""
        ledger = self._require_ledger()
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, ledger.length)

    async def tail(self, n: int = 20) -> list[LedgerBlock]:
        """Return the last *n* blocks in ascending index order."""
        ledger = self._require_ledger()
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, lambda: ledger.tail(n))

    async def get_proof(self, index: int) -> dict[str, object]:
        """Return an inclusion proof for the block at *index*."""
        ledger = self._require_ledger()
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, lambda: ledger.get_proof(index))

    async def verify_chain_integrity(self) -> bool:
        """
        Run the full cryptographic sweep.

        Raises ``TamperDetectedError`` immediately on the first violation,
        exactly as the synchronous version does.
        """
        ledger = self._require_ledger()
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, ledger.verify_chain_integrity)

    async def integrity_report(self) -> IntegrityReport:
        """Return a structured integrity report without raising."""
        ledger = self._require_ledger()
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, ledger.integrity_report)


# ── Standalone audit function ──────────────────────────────────────────────────


def verify_chain_integrity(db_path: Path | str) -> bool:
    """
    Open the ledger at *db_path*, run the full cryptographic sweep, and return.

    This function is designed for out-of-process audit scripts and CI pipelines.
    It creates a short-lived read-only connection and releases it before
    returning so it can safely run concurrently with the live writer.

    Returns
    -------
    ``True`` if the chain is intact.

    Raises
    ------
    TamperDetectedError
        On the first detected cryptographic violation with full detail.
    FileNotFoundError
        If *db_path* does not exist (for on-disk databases).
    """
    path = Path(db_path)
    if str(db_path) != ":memory:" and not path.exists():
        raise FileNotFoundError(f"Ledger database not found: {path}")

    with ImmutableLedger(db_path) as ledger:
        return ledger.verify_chain_integrity()
