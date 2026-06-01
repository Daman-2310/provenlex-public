"""
DecoupledStateEngine — WAL-backed dual-stage isolated state engine for PBFT.

This module breaks the tight coupling between PBFT consensus data synchronisation
and any specific infrastructure storage backend.  State mutations flow through a
strict pipeline:

    Caller  ──stage()──►  WAL  ──►  Staging Cache
                                          │
                          PBFT confirms ──┤
                                          ▼
                                   Committed State

Until a PBFT consensus round calls ``confirm(entry_id)``, changes are held in
an isolated volatile staging cache and are *never* visible to callers of
``read_committed()``.  This prevents split-brain reads during in-flight
consensus rounds.

Concurrency model
-----------------
All mutable state is protected by three dedicated ``asyncio.Lock`` objects:

* ``_wal_lock``       — serialises WAL appends; guarantees monotonic LSN.
* ``_staging_lock``   — guards the staging dict and per-key index.
* ``_committed_lock`` — guards the committed dict; confirms/snapshots take
                        this lock exclusively.

No operation holds more than one lock simultaneously, which prevents deadlocks.
All three locks are non-reentrant; callers must not call public methods while
holding any of these locks.

Write-Ahead Log (WAL)
---------------------
Every staged mutation is first appended to an in-memory WAL as an immutable
``WALRecord`` with a monotonically increasing Log Sequence Number (LSN).  The
WAL can be snapshotted (``checkpoint()``) and inspected (``wal_tail()``) for
audit purposes.  In a production deployment the WAL would be flushed to durable
storage (append-only object store or a WORM volume) before ``stage()`` returns;
this implementation stores it in-memory and delegates durability to the caller.

PBFT integration
----------------
The expected usage pattern in ``PBFTConsensus._execute_round()`` is::

    entry_id = await engine.stage(key, value, consensus_ref=tx_id)
    # ... PBFT phases run ...
    if round.consensus_reached:
        await engine.confirm(entry_id)
    else:
        await engine.abort(entry_id)

Alternatively, use the high-level helper::

    status = await engine.stage_and_await(
        key, value, consensus_ref=tx_id, timeout_s=10.0
    )
    if status == StagingStatus.CONFIRMED:
        ...

Public surface
--------------
    WALOp                   — enum of WAL operation types
    WALRecord               — frozen dataclass; one immutable WAL entry
    StagingStatus           — enum for staged entry life-cycle state
    ConsensusAbortedError   — raised by stage_and_await() on PBFT rejection
    CommitTimeoutError      — raised by stage_and_await() on timeout
    DecoupledStateEngine    — the main state engine class
"""
from __future__ import annotations

import asyncio
import copy
import enum
import hashlib
import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Final, TypeVar

__all__ = [
    "WALOp",
    "WALRecord",
    "StagingStatus",
    "ConsensusAbortedError",
    "CommitTimeoutError",
    "DecoupledStateEngine",
]

_log = logging.getLogger(__name__)

T = TypeVar("T")

# ── Constants ──────────────────────────────────────────────────────────────────

_WAL_CAP: Final[int] = 100_000       # maximum WAL entries before compaction
_STAGING_TTL_S: Final[float] = 120.0  # auto-expire staged entries older than this
_GENESIS_HASH: Final[str] = "0" * 64

# ── Enumerations ──────────────────────────────────────────────────────────────


class WALOp(enum.Enum):
    """
    Discriminator for ``WALRecord.op``.

    Attributes:
        SET:        Write a key-value pair to the state.
        DELETE:     Remove a key from the state.
        BATCH:      Marker for the first record of an atomic batch group.
        CHECKPOINT: A stable point in the WAL; all entries before this LSN
                    have been applied to committed state and can be compacted.
    """

    SET = "SET"
    DELETE = "DELETE"
    BATCH = "BATCH"
    CHECKPOINT = "CHECKPOINT"


class StagingStatus(enum.Enum):
    """
    Life-cycle state of a ``StagedEntry``.

    Attributes:
        STAGED:    In the volatile staging cache; awaiting PBFT consensus.
        CONFIRMED: PBFT consensus confirmed; promoted to committed state.
        ABORTED:   PBFT consensus rejected; staging entry discarded.
        EXPIRED:   Staging TTL elapsed without a consensus signal; treated
                   as ``ABORTED`` by ``stage_and_await()``.
    """

    STAGED = "STAGED"
    CONFIRMED = "CONFIRMED"
    ABORTED = "ABORTED"
    EXPIRED = "EXPIRED"


# ── Exceptions ─────────────────────────────────────────────────────────────────


class ConsensusAbortedError(RuntimeError):
    """
    Raised by ``stage_and_await()`` when the PBFT network rejected the round
    associated with a staged entry.

    Attributes:
        entry_id:      WAL entry ID of the aborted staging entry.
        consensus_ref: The PBFT transaction ID that was aborted.
    """

    def __init__(self, entry_id: str, consensus_ref: str | None) -> None:
        super().__init__(
            f"Consensus aborted for entry {entry_id!r} "
            f"(consensus_ref={consensus_ref!r})"
        )
        self.entry_id = entry_id
        self.consensus_ref = consensus_ref


class CommitTimeoutError(TimeoutError):
    """
    Raised by ``stage_and_await()`` when the PBFT confirmation signal did not
    arrive within the specified timeout.

    Attributes:
        entry_id:  WAL entry ID of the timed-out staging entry.
        timeout_s: The timeout that was exceeded.
    """

    def __init__(self, entry_id: str, timeout_s: float) -> None:
        super().__init__(
            f"Consensus confirmation timed out after {timeout_s}s "
            f"for entry {entry_id!r}"
        )
        self.entry_id = entry_id
        self.timeout_s = timeout_s


# ── Data models ───────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class WALRecord:
    """
    One immutable entry in the Write-Ahead Log.

    All fields are set at construction time and cannot be modified.  The
    ``value_hash`` field is a SHA-256 commitment over the serialised value,
    allowing external auditors to detect value tampering even if the in-memory
    WAL is the only copy.

    Attributes:
        lsn:           Log Sequence Number; strictly monotonically increasing.
        entry_id:      UUID4 string linking this WAL record to a
                       ``StagedEntry`` and used as the ``confirm()``/``abort()``
                       handle.
        timestamp_ns:  UNIX nanoseconds at the time of staging.
        op:            WAL operation type.
        key:           State key being mutated; ``None`` for CHECKPOINT records.
        value_hash:    SHA-256 hex of ``json.dumps(value, sort_keys=True)``; the
                       string ``"0" * 64`` (GENESIS_HASH) for DELETE and
                       CHECKPOINT records.
        consensus_ref: PBFT transaction ID or round ID that must confirm this
                       entry; ``None`` for CHECKPOINT records.
        batch_id:      Shared identifier for all records in the same atomic batch;
                       ``None`` for non-batch records.
    """

    lsn: int
    entry_id: str
    timestamp_ns: int
    op: WALOp
    key: str | None
    value_hash: str
    consensus_ref: str | None
    batch_id: str | None = None


@dataclass
class StagedEntry:
    """
    A mutable staging cache entry awaiting PBFT confirmation.

    This dataclass is *not* frozen because ``status`` transitions from
    ``STAGED`` to ``CONFIRMED``/``ABORTED``/``EXPIRED``, and the ``_ready``
    event is set during that transition.

    Attributes:
        lsn:           LSN of the corresponding WAL record.
        entry_id:      Matches ``WALRecord.entry_id``.
        key:           State key being mutated.
        value:         Staged value (deep-copied from the caller's input).
        op:            ``WALOp.SET`` or ``WALOp.DELETE``.
        staged_at_ns:  UNIX nanoseconds at staging time.
        consensus_ref: PBFT transaction or round ID.
        status:        Current life-cycle state.
        batch_id:      Shared ID for atomic batch operations; ``None`` otherwise.
        _ready:        asyncio.Event set when status transitions out of STAGED.
    """

    lsn: int
    entry_id: str
    key: str
    value: Any
    op: WALOp
    staged_at_ns: int
    consensus_ref: str | None
    status: StagingStatus = StagingStatus.STAGED
    batch_id: str | None = None
    _ready: asyncio.Event = field(default_factory=asyncio.Event, repr=False)


# ── Internal helpers ──────────────────────────────────────────────────────────


def _hash_value(value: Any) -> str:
    """
    Compute a deterministic SHA-256 hash of an arbitrary Python value.

    Args:
        value: Any JSON-serialisable Python value.  Non-serialisable objects
               fall back to ``repr()`` for hashing (best-effort; should not
               occur for values that will be stored in committed state).

    Returns:
        A 64-character lowercase hex SHA-256 digest.
    """
    try:
        serialised = json.dumps(value, sort_keys=True, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        serialised = repr(value)
    return hashlib.sha256(serialised.encode("utf-8")).hexdigest()


def _deep_copy_safe(value: Any) -> Any:
    """
    Return a deep copy of *value*, falling back to the original if it is not
    copyable (e.g., open file handles).

    Args:
        value: Any Python value to deep-copy.

    Returns:
        A deep copy of *value*, or *value* itself if ``copy.deepcopy`` fails.
    """
    try:
        return copy.deepcopy(value)
    except Exception:  # noqa: BLE001 — best-effort safety copy
        return value


# ── Main state engine ─────────────────────────────────────────────────────────


class DecoupledStateEngine:
    """
    Isolated, atomic, WAL-backed transactional state engine.

    State mutations are staged in a volatile dual-stage memory registry and
    committed to authoritative state only upon receiving an explicit
    ``confirm()`` signal from the PBFT consensus network.  Concurrent event
    operations are isolated by three independent ``asyncio.Lock`` objects.

    The engine has no dependency on any external storage system.  It is
    designed to be embedded inside a PBFT consensus node and used as the
    single source of truth for node-local state that must be consistent across
    the consensus network.

    Args:
        wal_cap:    Maximum number of WAL records to keep in memory before the
                    oldest confirmed records are compacted.  Defaults to 100,000.
        staging_ttl_s: Seconds after which a STAGED entry is automatically
                    marked EXPIRED during the next ``_gc_expired()`` sweep.
                    Defaults to 120 seconds.

    Example::

        engine = DecoupledStateEngine()

        # Stage a balance update
        entry_id = await engine.stage(
            "balances.tenant-a.EUR",
            Decimal("1_500_000.00"),
            consensus_ref="tx-AABB112233"
        )

        # PBFT round runs … then confirms
        await engine.confirm(entry_id)

        balance = await engine.read_committed("balances.tenant-a.EUR")
    """

    def __init__(
        self,
        *,
        wal_cap: int = _WAL_CAP,
        staging_ttl_s: float = _STAGING_TTL_S,
    ) -> None:
        # ── Committed state (authoritative) ──────────────────────────────────
        self._committed: dict[str, Any] = {}
        self._committed_lock = asyncio.Lock()

        # ── Staging cache ─────────────────────────────────────────────────────
        # Keyed by entry_id for O(1) confirm/abort
        self._staging: dict[str, StagedEntry] = {}
        # Keyed by state key → ordered list of entry_ids (ascending LSN)
        # Used to find the most-recently staged value for a given key
        self._staged_by_key: dict[str, list[str]] = {}
        self._staging_lock = asyncio.Lock()

        # ── Write-Ahead Log ───────────────────────────────────────────────────
        self._wal: list[WALRecord] = []
        self._next_lsn: int = 1
        self._wal_lock = asyncio.Lock()
        self._wal_cap = wal_cap

        # ── Configuration ─────────────────────────────────────────────────────
        self._staging_ttl_ns: int = int(staging_ttl_s * 1_000_000_000)

    # ── WAL helpers ───────────────────────────────────────────────────────────

    async def _wal_append(
        self,
        entry_id: str,
        op: WALOp,
        key: str | None,
        value: Any,
        *,
        consensus_ref: str | None,
        batch_id: str | None = None,
    ) -> int:
        """
        Append one record to the WAL and return its LSN.

        Args:
            entry_id:      UUID4 correlation token.
            op:            WAL operation type.
            key:           State key; ``None`` for CHECKPOINT records.
            value:         Value to hash; ``None`` for DELETE/CHECKPOINT.
            consensus_ref: PBFT consensus reference.
            batch_id:      Shared batch correlation ID.

        Returns:
            The LSN assigned to the new WAL record.
        """
        async with self._wal_lock:
            lsn = self._next_lsn
            self._next_lsn += 1
            value_hash = _hash_value(value) if value is not None else _GENESIS_HASH
            record = WALRecord(
                lsn=lsn,
                entry_id=entry_id,
                timestamp_ns=time.time_ns(),
                op=op,
                key=key,
                value_hash=value_hash,
                consensus_ref=consensus_ref,
                batch_id=batch_id,
            )
            self._wal.append(record)
            if len(self._wal) > self._wal_cap:
                self._compact_wal_locked()
            return lsn

    def _compact_wal_locked(self) -> None:
        """
        Remove the oldest confirmed WAL entries when the cap is exceeded.

        Called with ``_wal_lock`` held.  Retains all STAGED entries and the
        last 1,000 confirmed entries as a recent-history buffer.
        """
        async_staging_lsns: set[int] = set()
        for entry in self._staging.values():
            if entry.status == StagingStatus.STAGED:
                async_staging_lsns.add(entry.lsn)

        # Keep records whose LSN is in the staging set, or the newest 1,000 records
        keep_from_lsn = max(1, self._next_lsn - 1000)
        retained: list[WALRecord] = [
            r for r in self._wal
            if r.lsn in async_staging_lsns or r.lsn >= keep_from_lsn
        ]
        compacted = len(self._wal) - len(retained)
        self._wal = retained
        if compacted > 0:
            _log.info("wal_compacted removed=%d retained=%d", compacted, len(retained))

    # ── Stage (write path) ────────────────────────────────────────────────────

    async def stage(
        self,
        key: str,
        value: Any,
        *,
        consensus_ref: str,
    ) -> str:
        """
        Stage a ``SET`` mutation for a single key-value pair.

        The mutation is written to the WAL and placed in the volatile staging
        cache.  It will not be visible to ``read_committed()`` until
        ``confirm(entry_id)`` is called.

        Args:
            key:           State key to mutate.  Dot-separated hierarchical
                           keys are allowed (e.g., ``"balances.tenant-a.EUR"``).
            value:         New value to associate with ``key``.  Must be
                           JSON-serialisable for WAL integrity hashing.
            consensus_ref: PBFT transaction ID or round ID that must confirm
                           this mutation.  Used for correlation and logging.

        Returns:
            A UUID4 string ``entry_id`` that identifies this staged mutation.
            Pass it to ``confirm()`` or ``abort()``.

        Raises:
            ValueError: If ``key`` is an empty string.
        """
        if not key:
            raise ValueError("State key must not be empty")
        entry_id = str(uuid.uuid4())
        value_copy = _deep_copy_safe(value)
        lsn = await self._wal_append(
            entry_id, WALOp.SET, key, value_copy, consensus_ref=consensus_ref
        )
        staged = StagedEntry(
            lsn=lsn,
            entry_id=entry_id,
            key=key,
            value=value_copy,
            op=WALOp.SET,
            staged_at_ns=time.time_ns(),
            consensus_ref=consensus_ref,
        )
        async with self._staging_lock:
            self._staging[entry_id] = staged
            self._staged_by_key.setdefault(key, []).append(entry_id)

        _log.debug(
            "state_staged lsn=%d entry=%s key=%s ref=%s",
            lsn, entry_id[:8], key, consensus_ref,
        )
        return entry_id

    async def stage_delete(self, key: str, *, consensus_ref: str) -> str:
        """
        Stage a ``DELETE`` mutation for a single key.

        Args:
            key:           The state key to delete upon confirmation.
            consensus_ref: PBFT transaction or round ID.

        Returns:
            The ``entry_id`` for this staged deletion.

        Raises:
            ValueError: If ``key`` is an empty string.
        """
        if not key:
            raise ValueError("State key must not be empty")
        entry_id = str(uuid.uuid4())
        lsn = await self._wal_append(
            entry_id, WALOp.DELETE, key, None, consensus_ref=consensus_ref
        )
        staged = StagedEntry(
            lsn=lsn,
            entry_id=entry_id,
            key=key,
            value=None,
            op=WALOp.DELETE,
            staged_at_ns=time.time_ns(),
            consensus_ref=consensus_ref,
        )
        async with self._staging_lock:
            self._staging[entry_id] = staged
            self._staged_by_key.setdefault(key, []).append(entry_id)

        _log.debug(
            "state_staged_delete lsn=%d entry=%s key=%s ref=%s",
            lsn, entry_id[:8], key, consensus_ref,
        )
        return entry_id

    async def batch_stage(
        self,
        mutations: dict[str, Any | None],
        *,
        consensus_ref: str,
    ) -> list[str]:
        """
        Stage multiple mutations atomically under a shared ``batch_id``.

        All mutations in the batch share a common ``batch_id`` in the WAL,
        which groups them so that ``confirm_batch()`` or ``abort_batch()`` can
        operate on all of them in a single call.  If any individual mutation
        fails to stage (e.g., empty key), all already-staged mutations in the
        batch are immediately aborted before the exception propagates.

        Args:
            mutations:     Dict of ``{key: value}`` pairs.  A ``None`` value
                           generates a ``DELETE`` record; any other value
                           generates a ``SET`` record.
            consensus_ref: PBFT transaction or round ID.

        Returns:
            List of ``entry_id`` strings in the same order as ``mutations.items()``.

        Raises:
            ValueError: If ``mutations`` is empty or contains an empty key.
        """
        if not mutations:
            raise ValueError("batch_stage requires at least one mutation")
        batch_id = str(uuid.uuid4())
        entry_ids: list[str] = []
        try:
            for key, value in mutations.items():
                entry_id = str(uuid.uuid4())
                op = WALOp.DELETE if value is None else WALOp.SET
                value_copy = None if value is None else _deep_copy_safe(value)
                lsn = await self._wal_append(
                    entry_id, op, key, value_copy,
                    consensus_ref=consensus_ref, batch_id=batch_id,
                )
                staged = StagedEntry(
                    lsn=lsn,
                    entry_id=entry_id,
                    key=key,
                    value=value_copy,
                    op=op,
                    staged_at_ns=time.time_ns(),
                    consensus_ref=consensus_ref,
                    batch_id=batch_id,
                )
                async with self._staging_lock:
                    self._staging[entry_id] = staged
                    self._staged_by_key.setdefault(key, []).append(entry_id)
                entry_ids.append(entry_id)
        except Exception:
            # Rollback all already-staged entries in this batch
            for eid in entry_ids:
                await self.abort(eid)
            raise

        _log.debug(
            "state_batch_staged batch=%s entries=%d ref=%s",
            batch_id[:8], len(entry_ids), consensus_ref,
        )
        return entry_ids

    # ── Confirm / Abort ────────────────────────────────────────────────────────

    async def confirm(self, entry_id: str) -> None:
        """
        Promote a staged entry to committed state.

        This is the PBFT confirmation signal.  After this call:
        * The staged value is written to ``_committed``.
        * The staging entry's ``status`` transitions to ``CONFIRMED``.
        * The ``_ready`` event is set, unblocking any ``wait_for_commitment()``
          or ``stage_and_await()`` callers.

        Args:
            entry_id: The ``entry_id`` returned by ``stage()`` or ``stage_delete()``.

        Raises:
            KeyError: If no staging entry with ``entry_id`` exists.
        """
        async with self._staging_lock:
            staged = self._staging.get(entry_id)
            if staged is None:
                raise KeyError(
                    f"No staged entry with entry_id={entry_id!r}. "
                    "It may have already been confirmed, aborted, or never staged."
                )
            if staged.status != StagingStatus.STAGED:
                raise ValueError(
                    f"Cannot confirm entry {entry_id!r} in state {staged.status.value}; "
                    "only STAGED entries can be confirmed."
                )
            staged.status = StagingStatus.CONFIRMED
            key = staged.key
            value = staged.value
            op = staged.op

        async with self._committed_lock:
            if op == WALOp.DELETE:
                self._committed.pop(key, None)
            else:
                self._committed[key] = _deep_copy_safe(value)

        # Remove from staging index
        async with self._staging_lock:
            key_list = self._staged_by_key.get(key, [])
            if entry_id in key_list:
                key_list.remove(entry_id)
            if not key_list:
                self._staged_by_key.pop(key, None)
            self._staging.pop(entry_id, None)
            staged._ready.set()

        _log.info(
            "state_confirmed entry=%s key=%s op=%s ref=%s",
            entry_id[:8], key, op.value, staged.consensus_ref,
        )

    async def abort(self, entry_id: str) -> None:
        """
        Discard a staged entry without committing it.

        This is the PBFT rejection signal.  The staged value is discarded and
        committed state is unaffected.  Any ``wait_for_commitment()`` caller
        is unblocked with ``StagingStatus.ABORTED``.

        Args:
            entry_id: The ``entry_id`` returned by ``stage()`` or ``stage_delete()``.

        Raises:
            KeyError: If no staging entry with ``entry_id`` exists.
        """
        async with self._staging_lock:
            staged = self._staging.get(entry_id)
            if staged is None:
                raise KeyError(f"No staged entry with entry_id={entry_id!r}")
            if staged.status not in (StagingStatus.STAGED, StagingStatus.EXPIRED):
                raise ValueError(
                    f"Cannot abort entry {entry_id!r} in state {staged.status.value}"
                )
            staged.status = StagingStatus.ABORTED
            key = staged.key
            key_list = self._staged_by_key.get(key, [])
            if entry_id in key_list:
                key_list.remove(entry_id)
            if not key_list:
                self._staged_by_key.pop(key, None)
            self._staging.pop(entry_id, None)
            staged._ready.set()

        _log.info(
            "state_aborted entry=%s key=%s ref=%s",
            entry_id[:8], staged.key, staged.consensus_ref,
        )

    async def confirm_batch(self, entry_ids: list[str]) -> None:
        """
        Confirm every entry in a batch atomically.

        All confirmations are applied under a single committed-state lock
        acquisition, which guarantees that the batch is applied atomically and
        no interleaved reads can see a partial batch commit.

        Args:
            entry_ids: List of ``entry_id`` strings from ``batch_stage()``.

        Raises:
            KeyError:  If any ``entry_id`` is not in the staging cache.
            ValueError: If any entry is not in ``STAGED`` state.
        """
        # Collect all staged entries first (under staging lock) before touching
        # committed state to avoid holding both locks simultaneously.
        to_commit: list[StagedEntry] = []
        async with self._staging_lock:
            for eid in entry_ids:
                staged = self._staging.get(eid)
                if staged is None:
                    raise KeyError(f"No staged entry with entry_id={eid!r}")
                if staged.status != StagingStatus.STAGED:
                    raise ValueError(
                        f"Cannot confirm entry {eid!r} in state {staged.status.value}"
                    )
                to_commit.append(staged)
            # Mark all as CONFIRMED under the staging lock before releasing
            for staged in to_commit:
                staged.status = StagingStatus.CONFIRMED

        # Apply to committed state atomically
        async with self._committed_lock:
            for staged in to_commit:
                if staged.op == WALOp.DELETE:
                    self._committed.pop(staged.key, None)
                else:
                    self._committed[staged.key] = _deep_copy_safe(staged.value)

        # Clean up staging index and fire ready events
        async with self._staging_lock:
            for staged in to_commit:
                key_list = self._staged_by_key.get(staged.key, [])
                if staged.entry_id in key_list:
                    key_list.remove(staged.entry_id)
                if not key_list:
                    self._staged_by_key.pop(staged.key, None)
                self._staging.pop(staged.entry_id, None)
                staged._ready.set()

        _log.info(
            "state_batch_confirmed count=%d batch_id=%s",
            len(to_commit),
            to_commit[0].batch_id[:8] if to_commit[0].batch_id else "n/a",
        )

    async def abort_batch(self, entry_ids: list[str]) -> None:
        """
        Abort every entry in a batch atomically.

        Args:
            entry_ids: List of ``entry_id`` strings from ``batch_stage()``.
        """
        for eid in entry_ids:
            try:
                await self.abort(eid)
            except KeyError:
                _log.warning(
                    "abort_batch_entry_missing entry=%s", eid[:8]
                )

    # ── Read path ─────────────────────────────────────────────────────────────

    async def read_committed(self, key: str, default: T | None = None) -> Any:
        """
        Read the authoritative committed value for ``key``.

        Staged-but-unconfirmed values are *never* visible through this method.
        This guarantees that callers see only PBFT-confirmed state, preventing
        dirty reads during in-flight consensus rounds.

        Args:
            key:     State key to look up.
            default: Value to return if the key is not in committed state.

        Returns:
            A deep copy of the committed value, or ``default`` if absent.
        """
        async with self._committed_lock:
            value = self._committed.get(key, default)
            return _deep_copy_safe(value)

    async def read_with_staged(self, key: str, default: T | None = None) -> Any:
        """
        Read the most recently staged value for ``key``, falling back to
        committed state.

        This method provides "read-your-own-writes" semantics within a single
        PBFT round: a node that has staged a value can immediately see it
        without waiting for consensus.  External consumers should use
        ``read_committed()`` instead.

        The most recent staging entry is determined by the highest LSN.

        Args:
            key:     State key to look up.
            default: Value to return if the key is absent in both staging and
                     committed state.

        Returns:
            The staged value if any STAGED entry exists for ``key``, otherwise
            the committed value, or ``default`` if absent everywhere.
        """
        async with self._staging_lock:
            entry_ids = self._staged_by_key.get(key, [])
            # Walk entry_ids in reverse (highest LSN = most recent = last appended)
            for eid in reversed(entry_ids):
                staged = self._staging.get(eid)
                if staged and staged.status == StagingStatus.STAGED:
                    return _deep_copy_safe(staged.value)

        return await self.read_committed(key, default)

    async def read_many_committed(
        self, keys: list[str]
    ) -> dict[str, Any]:
        """
        Read multiple keys from committed state in a single lock acquisition.

        Args:
            keys: List of state keys to read.

        Returns:
            Dict of ``{key: value}`` for keys present in committed state;
            absent keys are omitted from the result.
        """
        async with self._committed_lock:
            return {
                k: _deep_copy_safe(self._committed[k])
                for k in keys
                if k in self._committed
            }

    # ── Await helpers ─────────────────────────────────────────────────────────

    async def wait_for_commitment(
        self,
        entry_id: str,
        *,
        timeout_s: float = 10.0,
    ) -> StagingStatus:
        """
        Block until the staged entry transitions out of ``STAGED`` state.

        Returns immediately if the entry is not found (already finalised).

        Args:
            entry_id:  The ``entry_id`` returned by ``stage()``.
            timeout_s: Maximum seconds to wait before returning
                       ``StagingStatus.EXPIRED``.

        Returns:
            ``StagingStatus.CONFIRMED``, ``StagingStatus.ABORTED``, or
            ``StagingStatus.EXPIRED`` (on timeout).
        """
        async with self._staging_lock:
            staged = self._staging.get(entry_id)

        if staged is None:
            # Entry has already been finalised; infer from WAL
            return self._infer_final_status(entry_id)

        try:
            await asyncio.wait_for(staged._ready.wait(), timeout=timeout_s)
        except asyncio.TimeoutError:
            _log.warning(
                "state_wait_timeout entry=%s timeout_s=%.1f", entry_id[:8], timeout_s
            )
            return StagingStatus.EXPIRED

        return staged.status

    async def stage_and_await(
        self,
        key: str,
        value: Any,
        *,
        consensus_ref: str,
        timeout_s: float = 10.0,
    ) -> StagingStatus:
        """
        High-level helper: stage a mutation and wait for PBFT confirmation.

        This combines ``stage()`` and ``wait_for_commitment()`` into a single
        awaitable call suitable for use inside a PBFT consensus execution
        coroutine.

        Args:
            key:           State key to mutate.
            value:         New value to stage.
            consensus_ref: PBFT transaction ID.
            timeout_s:     Maximum seconds to wait for confirmation.

        Returns:
            ``StagingStatus.CONFIRMED`` on success.

        Raises:
            ConsensusAbortedError: If the PBFT round was aborted.
            CommitTimeoutError:    If no confirmation arrived within ``timeout_s``.
        """
        entry_id = await self.stage(key, value, consensus_ref=consensus_ref)
        status = await self.wait_for_commitment(entry_id, timeout_s=timeout_s)
        if status == StagingStatus.CONFIRMED:
            return status
        if status in (StagingStatus.ABORTED, StagingStatus.EXPIRED):
            if status == StagingStatus.EXPIRED:
                raise CommitTimeoutError(entry_id, timeout_s)
            raise ConsensusAbortedError(entry_id, consensus_ref)
        # Should not be reachable; defensive guard
        raise RuntimeError(
            f"Unexpected StagingStatus {status!r} for entry_id={entry_id!r}"
        )

    # ── Checkpoint ────────────────────────────────────────────────────────────

    async def checkpoint(self) -> WALRecord:
        """
        Seal a WAL checkpoint at the current committed state.

        Records that all entries with LSN ≤ the checkpoint's LSN have been
        applied to committed state and may be compacted by the WAL GC.

        Returns:
            The ``WALRecord`` for the checkpoint entry.
        """
        entry_id = str(uuid.uuid4())
        lsn = await self._wal_append(
            entry_id, WALOp.CHECKPOINT, None, None, consensus_ref=None
        )
        # Retrieve the record we just appended
        async with self._wal_lock:
            record = next(r for r in reversed(self._wal) if r.lsn == lsn)
        _log.info("state_checkpoint lsn=%d", lsn)
        return record

    # ── Inspection ────────────────────────────────────────────────────────────

    def wal_tail(self, n: int = 50) -> list[WALRecord]:
        """
        Return the last *n* WAL records in ascending LSN order.

        This method does not acquire any lock — it reads the WAL list under
        Python's GIL which is sufficient for a read-only tail snapshot.

        Args:
            n: Number of recent WAL records to return (capped at 1000).

        Returns:
            List of ``WALRecord`` objects; most-recent record last.
        """
        n = min(n, 1000)
        return list(self._wal[-n:])

    def snapshot(self) -> dict[str, Any]:
        """
        Return a deep copy of the committed state at this instant.

        This method does not acquire the committed lock; it is not transactionally
        consistent if called concurrently with ``confirm()``.  For a consistent
        snapshot, use ``read_many_committed()`` with known keys instead.

        Returns:
            A ``dict`` mapping every committed key to a deep-copied value.
        """
        return {k: _deep_copy_safe(v) for k, v in self._committed.items()}

    def pending_entries(self) -> list[dict[str, Any]]:
        """
        Return a list of all currently staged (uncommitted) entries.

        Useful for health checks, dashboards, and diagnostics.

        Returns:
            List of dicts with keys: ``entry_id``, ``key``, ``lsn``,
            ``staged_at_ns``, ``op``, ``consensus_ref``, ``batch_id``.
        """
        return [
            {
                "entry_id": e.entry_id,
                "key": e.key,
                "lsn": e.lsn,
                "staged_at_ns": e.staged_at_ns,
                "op": e.op.value,
                "consensus_ref": e.consensus_ref,
                "batch_id": e.batch_id,
            }
            for e in self._staging.values()
            if e.status == StagingStatus.STAGED
        ]

    @property
    def pending_count(self) -> int:
        """Number of entries in the STAGED state (awaiting PBFT confirmation)."""
        return sum(
            1 for e in self._staging.values() if e.status == StagingStatus.STAGED
        )

    @property
    def committed_size(self) -> int:
        """Number of keys in committed state."""
        return len(self._committed)

    @property
    def wal_length(self) -> int:
        """Number of WAL records currently in memory."""
        return len(self._wal)

    # ── Garbage collection ────────────────────────────────────────────────────

    async def _gc_expired(self) -> int:
        """
        Mark staging entries that have exceeded ``_staging_ttl_ns`` as EXPIRED.

        This should be called periodically by the owning PBFT node (e.g., inside
        a background task running every 30 seconds).

        Returns:
            The number of entries that were transitioned to EXPIRED.
        """
        now_ns = time.time_ns()
        expired_ids: list[str] = []
        async with self._staging_lock:
            for eid, staged in list(self._staging.items()):
                if (
                    staged.status == StagingStatus.STAGED
                    and now_ns - staged.staged_at_ns > self._staging_ttl_ns
                ):
                    staged.status = StagingStatus.EXPIRED
                    expired_ids.append(eid)

        for eid in expired_ids:
            try:
                await self.abort(eid)
            except KeyError:
                pass  # already removed by a concurrent confirm/abort

        if expired_ids:
            _log.warning("state_gc_expired count=%d", len(expired_ids))
        return len(expired_ids)

    async def close(self) -> None:
        """
        Abort all pending staged entries and clear state.

        Should be called when the PBFT node is shutting down to prevent
        dangling ``asyncio.Event`` objects from leaking into a new event loop.
        """
        async with self._staging_lock:
            pending_ids = [
                eid for eid, e in self._staging.items()
                if e.status == StagingStatus.STAGED
            ]

        for eid in pending_ids:
            try:
                await self.abort(eid)
            except (KeyError, ValueError):
                pass

        async with self._committed_lock:
            self._committed.clear()

        async with self._wal_lock:
            self._wal.clear()
            self._next_lsn = 1

        _log.info("decoupled_state_engine_closed")

    # ── Private helpers ───────────────────────────────────────────────────────

    def _infer_final_status(self, entry_id: str) -> StagingStatus:
        """
        Infer the final status of a completed entry from the WAL.

        Called by ``wait_for_commitment()`` when the staging entry is no longer
        in the cache (it has been confirmed or aborted and cleaned up).

        Args:
            entry_id: The ``entry_id`` to search for in the WAL.

        Returns:
            ``StagingStatus.CONFIRMED`` if found in WAL and corresponding key is
            in committed state; ``StagingStatus.ABORTED`` otherwise.
        """
        for record in reversed(self._wal):
            if record.entry_id == entry_id:
                if record.key is not None and record.key in self._committed:
                    return StagingStatus.CONFIRMED
                return StagingStatus.ABORTED
        return StagingStatus.ABORTED
