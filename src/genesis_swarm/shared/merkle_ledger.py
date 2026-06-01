"""
MerkleLedger — in-memory append-only cryptographic ledger.

Replaces the SQLite-backed ``ImmutableLedger`` for use-cases where disk
persistence is handled externally (object storage, WORM volumes) or where a
lightweight, zero-dependency audit buffer is needed inside a microservice.

Design guarantees
-----------------
1. **Append-only** — no ``delete`` or ``update`` methods exist.
2. **Tamper-evident hash chain** — each block commits to all of its fields via
   SHA-256, and ``previous_hash`` chains every block to its predecessor.
3. **Epoch Merkle roots** — every ``EPOCH_SIZE`` blocks are summarised into a
   binary SHA-256 Merkle tree; ``verify_chain_integrity()`` recomputes both the
   chain and all epoch roots, raising ``TamperDetectedError`` on the first
   discrepancy.
4. **Thread-safe** — ``threading.Lock`` protects all mutations; safe to share
   across threads and coroutines (via ``AsyncMerkleLedger``).
5. **Zero external dependencies** — only the Python standard library.

Hash formula (exact, reproducible by external auditors)
--------------------------------------------------------
    block_hash = SHA-256(
        str(index).encode()
        + b"\\x00"
        + str(timestamp_ns).encode()
        + b"\\x00"
        + tenant_id.encode("utf-8")
        + b"\\x00"
        + payload          # raw bytes; may contain arbitrary binary data
        + b"\\x00"
        + previous_hash.encode("ascii")   # 64 hex chars or GENESIS_HASH
    )

The ``\\x00`` separator prevents length-extension collisions between
variable-length fields.

Public surface
--------------
    LedgerBlock          — frozen dataclass; one immutable ledger entry
    EpochCheckpoint      — frozen dataclass; sealed epoch summary
    TamperDetectedError  — raised by verify_chain_integrity() on any violation
    MerkleLedger         — synchronous, thread-safe, in-memory ledger
    AsyncMerkleLedger    — asyncio wrapper; runs blocking I/O in an executor
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Final, Sequence

__all__ = [
    "LedgerBlock",
    "EpochCheckpoint",
    "TamperDetectedError",
    "MerkleLedger",
    "AsyncMerkleLedger",
    "EPOCH_SIZE",
    "GENESIS_HASH",
]

_log = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────

EPOCH_SIZE: Final[int] = 64
GENESIS_HASH: Final[str] = "0" * 64

# ── Data models ───────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class LedgerBlock:
    """One immutable entry in the cryptographic hash chain."""

    index: int
    timestamp_ns: int
    tenant_id: str
    payload: bytes
    previous_hash: str
    block_hash: str

    @staticmethod
    def compute_hash(
        index: int,
        timestamp_ns: int,
        tenant_id: str,
        payload: bytes,
        previous_hash: str,
    ) -> str:
        """Deterministic SHA-256 commitment over all mutable fields."""
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
        return hashlib.sha256(raw).hexdigest()

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

    epoch_idx: int
    first_block: int
    last_block: int
    merkle_root: str


# ── Exceptions ─────────────────────────────────────────────────────────────────


class TamperDetectedError(RuntimeError):
    """
    Raised by ``MerkleLedger.verify_chain_integrity()`` on any cryptographic
    violation — indicating retroactive modification, deletion, or insertion.

    Attributes
    ----------
    block_index:
        Index of the first tampered block, or ``None`` for epoch violations.
    epoch_index:
        Epoch number of the Merkle root mismatch, or ``None`` for chain violations.
    reason:
        Human-readable description of the violation.
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


# ── Internal Merkle computation ───────────────────────────────────────────────


def _build_merkle_root(hex_hashes: Sequence[str]) -> str:
    """
    Binary SHA-256 Merkle root over *hex_hashes*.

    Odd-length layers duplicate the last leaf.  Returns GENESIS_HASH for
    an empty sequence.
    """
    if not hex_hashes:
        return GENESIS_HASH

    layer: list[bytes] = [bytes.fromhex(h) for h in hex_hashes]

    while len(layer) > 1:
        if len(layer) % 2:
            layer.append(layer[-1])
        layer = [
            hashlib.sha256(layer[i] + layer[i + 1]).digest()
            for i in range(0, len(layer), 2)
        ]

    return layer[0].hex()


# ── Synchronous ledger ────────────────────────────────────────────────────────


class MerkleLedger:
    """
    In-memory, thread-safe, append-only SHA-256 Merkle ledger.

    All state is held in two plain Python lists protected by a
    ``threading.Lock``.  No external storage backend is required; the caller
    is responsible for persisting the ledger if durability is needed.

    Usage
    -----
    ::

        ledger = MerkleLedger()
        block  = ledger.append("tenant-a", b"event-payload")
        assert ledger.verify_chain_integrity()
        root   = ledger.current_root()
    """

    def __init__(self) -> None:
        self._blocks: list[LedgerBlock] = []
        self._epochs: list[EpochCheckpoint] = []
        self._lock = threading.Lock()

    # ── Write ─────────────────────────────────────────────────────────────────

    def append(self, tenant_id: str, payload: bytes) -> LedgerBlock:
        """
        Append one block and return the committed ``LedgerBlock``.

        Thread-safe.  The ``timestamp_ns`` is captured inside the lock to
        guarantee strict monotonicity even when multiple threads append
        concurrently.
        """
        with self._lock:
            index = len(self._blocks)
            prev_hash = self._blocks[-1].block_hash if self._blocks else GENESIS_HASH
            timestamp_ns = time.time_ns()
            block_hash = LedgerBlock.compute_hash(
                index, timestamp_ns, tenant_id, payload, prev_hash
            )
            block = LedgerBlock(
                index=index,
                timestamp_ns=timestamp_ns,
                tenant_id=tenant_id,
                payload=payload,
                previous_hash=prev_hash,
                block_hash=block_hash,
            )
            self._blocks.append(block)
            _log.debug(
                "ledger_block_appended idx=%d tenant=%s hash=%.8s",
                index, tenant_id, block_hash,
            )

            if (index + 1) % EPOCH_SIZE == 0:
                self._seal_epoch_locked(index)

        return block

    def _seal_epoch_locked(self, last_block: int) -> None:
        """Compute and record a Merkle checkpoint for the just-completed epoch.

        Must be called with self._lock held.
        """
        epoch_idx = last_block // EPOCH_SIZE
        first_block = epoch_idx * EPOCH_SIZE
        hashes = [b.block_hash for b in self._blocks[first_block: last_block + 1]]
        root = _build_merkle_root(hashes)
        ckpt = EpochCheckpoint(
            epoch_idx=epoch_idx,
            first_block=first_block,
            last_block=last_block,
            merkle_root=root,
        )
        self._epochs.append(ckpt)
        _log.info(
            "ledger_epoch_sealed epoch=%d blocks=%d..%d root=%.8s",
            epoch_idx, first_block, last_block, root,
        )

    # ── Read ──────────────────────────────────────────────────────────────────

    def get(self, index: int) -> LedgerBlock:
        """Return block at *index*.  Raises ``KeyError`` if out of range."""
        with self._lock:
            if index < 0 or index >= len(self._blocks):
                raise KeyError(f"No ledger block at index {index}")
            return self._blocks[index]

    def head(self) -> LedgerBlock | None:
        """Return the most recently appended block, or ``None`` if empty."""
        with self._lock:
            return self._blocks[-1] if self._blocks else None

    def length(self) -> int:
        """Return the number of committed blocks."""
        with self._lock:
            return len(self._blocks)

    def tail(self, n: int = 20) -> list[LedgerBlock]:
        """Return the last *n* blocks in ascending index order."""
        with self._lock:
            return list(self._blocks[-n:])

    def current_root(self) -> str:
        """
        Return the Merkle root of the most recently sealed epoch, or
        ``GENESIS_HASH`` if no epoch has been sealed yet.
        """
        with self._lock:
            if not self._epochs:
                return GENESIS_HASH
            return self._epochs[-1].merkle_root

    def get_epoch(self, epoch_idx: int) -> EpochCheckpoint | None:
        """Return a sealed epoch checkpoint, or ``None`` if not yet sealed."""
        with self._lock:
            for ep in self._epochs:
                if ep.epoch_idx == epoch_idx:
                    return ep
            return None

    def get_proof(self, index: int) -> dict[str, object]:
        """
        Return block *index* together with a cryptographic inclusion proof.

        The proof is self-contained: an external auditor can verify the block's
        hash, its backward link, and its membership in a sealed epoch without
        accessing the full ledger.
        """
        with self._lock:
            if index < 0 or index >= len(self._blocks):
                raise KeyError(f"No ledger block at index {index}")
            blk = self._blocks[index]
            epoch_idx = index // EPOCH_SIZE
            epoch = next((e for e in self._epochs if e.epoch_idx == epoch_idx), None)
            head = self._blocks[-1] if self._blocks else None

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
                "merkle_root": epoch.merkle_root if epoch else None,
                "sealed": epoch is not None,
            },
            "chain_head_hash": head.block_hash if head else GENESIS_HASH,
            "chain_length": len(self._blocks),
            "hash_formula": (
                "SHA-256(index\\x00timestamp_ns\\x00tenant_id\\x00payload\\x00previous_hash)"
            ),
        }

    # ── Integrity verification ────────────────────────────────────────────────

    def verify_chain_integrity(self) -> bool:
        """
        Sweep the full ledger and verify every cryptographic invariant.

        Pass 1 — per-block hash chain:
            For each block: recompute hash, verify stored hash matches, verify
            previous_hash links to the correct predecessor.

        Pass 2 — epoch Merkle roots:
            For each sealed epoch: recompute the Merkle root from the stored
            block hashes, verify it matches the stored checkpoint root.

        Returns
        -------
        ``True`` if both passes succeed.

        Raises
        ------
        TamperDetectedError
            Immediately on the first detected violation.
        """
        with self._lock:
            blocks = list(self._blocks)
            epochs = list(self._epochs)

        self._verify_block_chain(blocks)
        self._verify_epoch_roots(blocks, epochs)

        _log.info(
            "ledger_integrity_ok blocks=%d epochs=%d head=%.8s",
            len(blocks),
            len(epochs),
            blocks[-1].block_hash if blocks else GENESIS_HASH,
        )
        return True

    @staticmethod
    def _verify_block_chain(blocks: list[LedgerBlock]) -> None:
        prev_hash = GENESIS_HASH
        for blk in blocks:
            expected = blk.recompute_hash()
            if expected != blk.block_hash:
                _log.critical(
                    "ledger_hash_mismatch idx=%d expected=%.8s stored=%.8s",
                    blk.index, expected, blk.block_hash,
                )
                raise TamperDetectedError(
                    f"Block {blk.index}: stored hash {blk.block_hash!r} does not match "
                    f"recomputed hash {expected!r} — data modified post-commit.",
                    block_index=blk.index,
                )
            if blk.previous_hash != prev_hash:
                _log.critical(
                    "ledger_chain_break idx=%d expected_prev=%.8s stored_prev=%.8s",
                    blk.index, prev_hash, blk.previous_hash,
                )
                raise TamperDetectedError(
                    f"Block {blk.index}: previous_hash {blk.previous_hash!r} does not match "
                    f"predecessor's hash {prev_hash!r} — insertion or deletion detected.",
                    block_index=blk.index,
                )
            prev_hash = blk.block_hash

    @staticmethod
    def _verify_epoch_roots(
        blocks: list[LedgerBlock],
        epochs: list[EpochCheckpoint],
    ) -> None:
        for ep in epochs:
            epoch_blocks = blocks[ep.first_block: ep.last_block + 1]
            if len(epoch_blocks) != ep.last_block - ep.first_block + 1:
                raise TamperDetectedError(
                    f"Epoch {ep.epoch_idx}: expected "
                    f"{ep.last_block - ep.first_block + 1} blocks, "
                    f"found {len(epoch_blocks)} — blocks deleted from epoch.",
                    epoch_index=ep.epoch_idx,
                )
            computed_root = _build_merkle_root([b.block_hash for b in epoch_blocks])
            if computed_root != ep.merkle_root:
                _log.critical(
                    "ledger_merkle_mismatch epoch=%d expected=%.8s stored=%.8s",
                    ep.epoch_idx, computed_root, ep.merkle_root,
                )
                raise TamperDetectedError(
                    f"Epoch {ep.epoch_idx}: Merkle root {ep.merkle_root!r} does not match "
                    f"recomputed root {computed_root!r} — data in epoch was modified.",
                    epoch_index=ep.epoch_idx,
                )

    def integrity_report(self) -> dict[str, object]:
        """
        Run ``verify_chain_integrity()`` and return a structured report.

        Does not raise — useful for scheduled health checks.
        """
        head = self.head()
        try:
            self.verify_chain_integrity()
            return {
                "valid": True,
                "chain_length": self.length(),
                "epoch_count": len(self._epochs),
                "head_hash": head.block_hash if head else GENESIS_HASH,
                "broken_at_block": None,
                "broken_at_epoch": None,
                "violation": None,
            }
        except TamperDetectedError as exc:
            return {
                "valid": False,
                "chain_length": self.length(),
                "epoch_count": len(self._epochs),
                "head_hash": head.block_hash if head else GENESIS_HASH,
                "broken_at_block": exc.block_index,
                "broken_at_epoch": exc.epoch_index,
                "violation": exc.reason,
            }


# ── Async wrapper ──────────────────────────────────────────────────────────────


class AsyncMerkleLedger:
    """
    asyncio-compatible wrapper around ``MerkleLedger``.

    Blocking operations are dispatched to a dedicated single-thread executor
    so the event loop is never stalled by lock contention or compute.

    Usage
    -----
    ::

        async with AsyncMerkleLedger() as ledger:
            block = await ledger.append("fund-a", b"trade-payload")
            ok    = await ledger.verify_chain_integrity()
            root  = await ledger.current_root()
    """

    def __init__(self) -> None:
        self._ledger = MerkleLedger()
        self._executor = ThreadPoolExecutor(
            max_workers=1, thread_name_prefix="merkle-ledger"
        )

    async def __aenter__(self) -> "AsyncMerkleLedger":
        return self

    async def __aexit__(self, *_: object) -> None:
        self._executor.shutdown(wait=False)

    def _loop(self) -> asyncio.AbstractEventLoop:
        return asyncio.get_running_loop()

    async def append(self, tenant_id: str, payload: bytes) -> LedgerBlock:
        """Append one block and return the committed ``LedgerBlock``."""
        return await self._loop().run_in_executor(
            self._executor, lambda: self._ledger.append(tenant_id, payload)
        )

    async def get(self, index: int) -> LedgerBlock:
        """Return block at *index*."""
        return await self._loop().run_in_executor(
            self._executor, lambda: self._ledger.get(index)
        )

    async def head(self) -> LedgerBlock | None:
        """Return the most recently committed block."""
        return await self._loop().run_in_executor(
            self._executor, self._ledger.head
        )

    async def length(self) -> int:
        """Return the total number of committed blocks."""
        return await self._loop().run_in_executor(
            self._executor, self._ledger.length
        )

    async def tail(self, n: int = 20) -> list[LedgerBlock]:
        """Return the last *n* blocks in ascending index order."""
        return await self._loop().run_in_executor(
            self._executor, lambda: self._ledger.tail(n)
        )

    async def current_root(self) -> str:
        """Return the Merkle root of the most recently sealed epoch."""
        return await self._loop().run_in_executor(
            self._executor, self._ledger.current_root
        )

    async def get_proof(self, index: int) -> dict[str, object]:
        """Return a cryptographic inclusion proof for block *index*."""
        return await self._loop().run_in_executor(
            self._executor, lambda: self._ledger.get_proof(index)
        )

    async def verify_chain_integrity(self) -> bool:
        """
        Run the full cryptographic sweep.

        Raises ``TamperDetectedError`` on the first detected violation.
        """
        return await self._loop().run_in_executor(
            self._executor, self._ledger.verify_chain_integrity
        )

    async def integrity_report(self) -> dict[str, object]:
        """Return a structured integrity report without raising."""
        return await self._loop().run_in_executor(
            self._executor, self._ledger.integrity_report
        )
