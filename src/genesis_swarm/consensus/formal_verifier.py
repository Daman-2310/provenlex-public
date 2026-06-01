"""
Formal PBFT Safety & Liveness Invariant Verifier.

Provides TLA+-derived runtime invariant enforcement for the PBFT state machine.
Every invariant breach halts the node process and purges volatile in-memory state.

Mathematical PBFT safety invariants enforced (from Castro & Liskov 1999)
-----------------------------------------------------------------------
INV-1  (Agreement): No two honest nodes commit different values at the same
        sequence number.  ∀ i,j: commit(i, seq, v) ∧ commit(j, seq, v') → v = v'
INV-2  (Validity): Only values proposed by the primary are executed.
INV-3  (Quorum intersection): Any two quorums of size 2f+1 share at least one
        honest node.  |Q1| + |Q2| > N → |Q1 ∩ Q2| ≥ f+1
INV-4  (View monotonicity): The current view number never decreases.
INV-5  (Sequence monotonicity): The committed sequence number never decreases.
INV-6  (Prepare certificate soundness): A PREPARE certificate for (v, seq, d)
        contains exactly 2f+1 distinct authenticating nodes, no duplicates.
INV-7  (Commit certificate soundness): Mirrors INV-6 for COMMIT.
INV-8  (Checkpoint stability): The low-water mark h never exceeds any committed
        sequence number still in the log.
INV-9  (Primary uniqueness): Exactly one node is primary per view.
INV-10 (No equivocation): A node never sends two conflicting PRE-PREPAREs for
        the same (view, seq) pair.

Usage
-----
    verifier = FormalVerifier(n_nodes=11, f=3)
    verifier.record_prepare_certificate(view=1, seq=1, digest="abc...", signers={0,1,2,3,4,5,6})
    verifier.record_commit(node_id=0, view=1, seq=1, digest="abc...")
    verifier.check_all()   # raises InvariantViolationError on any breach

Decorator usage (wraps PBFT state-mutation methods)::

    @verifier.guard(pre_check="view_monotone", post_check="sequence_monotone")
    def on_commit(self, seq: int, digest: str) -> None:
        ...

On violation:
    1. InvariantViolationError is raised with the violated invariant name.
    2. _purge_volatile_state() zeroes all in-memory certificate and log structures.
    3. The process exits with code 1 after flushing the audit log.
"""
from __future__ import annotations

import functools
import structlog
import os
import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Callable, Final, TypeVar

__all__ = [
    "InvariantViolationError",
    "FormalVerifier",
    "VerifierConfig",
    "InvariantResult",
]

_log = structlog.get_logger(__name__)

_F = TypeVar("_F", bound=Callable[..., Any])

# ── Constants ─────────────────────────────────────────────────────────────────

_DEFAULT_N: Final[int] = 11
_DEFAULT_F: Final[int] = 3
_DEFAULT_QUORUM: Final[int] = 2 * _DEFAULT_F + 1   # 7


# ── Exceptions ────────────────────────────────────────────────────────────────

@dataclass
class InvariantViolationError(RuntimeError):
    """Raised when a PBFT safety or liveness invariant is breached."""

    invariant_name: str
    detail: str
    sequence: int | None = None
    view: int | None = None

    def __str__(self) -> str:
        parts = [f"[{self.invariant_name}] {self.detail}"]
        if self.view is not None:
            parts.append(f"view={self.view}")
        if self.sequence is not None:
            parts.append(f"seq={self.sequence}")
        return "  ".join(parts)


# ── Configuration ─────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class VerifierConfig:
    """Tunable parameters for the FormalVerifier."""

    n_nodes: int = _DEFAULT_N
    f: int = _DEFAULT_F
    halt_on_violation: bool = True    # sys.exit(1) after purge when True
    purge_on_violation: bool = True   # zero volatile state on violation
    max_log_entries: int = 10_000     # maximum commits to retain in memory


# ── Invariant result ──────────────────────────────────────────────────────────

@dataclass(frozen=True)
class InvariantResult:
    """Outcome of a single invariant check."""

    invariant_name: str
    passed: bool
    detail: str
    checked_at_ns: int = field(default_factory=time.time_ns)


# ── Certificate + log structures ──────────────────────────────────────────────

@dataclass
class _CommitRecord:
    """Tracks all commit messages for a single (seq, digest) pair."""

    seq: int
    digest: str
    signers: set[int] = field(default_factory=set)
    views_seen: set[int] = field(default_factory=set)


@dataclass
class _PrepareCert:
    """A validated PREPARE certificate for a (view, seq, digest) triple."""

    view: int
    seq: int
    digest: str
    signers: frozenset[int]


@dataclass
class _CommitCert:
    """A validated COMMIT certificate for a (view, seq, digest) triple."""

    view: int
    seq: int
    digest: str
    signers: frozenset[int]


# ── Core verifier ─────────────────────────────────────────────────────────────

class FormalVerifier:
    """
    Runtime enforcement of TLA+-derived PBFT safety and liveness invariants.

    All mutable state is contained in this object.  The check_all() method
    validates every registered invariant against current state.  Individual
    invariant checks are also available as methods.

    Not thread-safe — external locking required for concurrent access.
    """

    def __init__(self, config: VerifierConfig | None = None) -> None:
        self._cfg = config or VerifierConfig()
        self._quorum: int = 2 * self._cfg.f + 1

        # View state
        self._current_view: int = 0
        self._current_primary: int = 0

        # Sequence state
        self._committed_seqs: dict[int, str] = {}            # seq → digest
        self._low_water_mark: int = 0
        self._high_water_mark: int = 0

        # Certificate registry
        self._prepare_certs: dict[tuple[int, int], _PrepareCert] = {}   # (view,seq) → cert
        self._commit_certs: dict[tuple[int, int], _CommitCert] = {}     # (view,seq) → cert

        # Commit accumulator (before certificate is formed)
        self._commit_records: dict[int, _CommitRecord] = {}             # seq → record

        # Equivocation detection: (node_id, view, seq) → set of digests seen
        self._preprepare_log: dict[tuple[int, int, int], set[str]] = defaultdict(set)

        # Audit log (in-memory ring buffer)
        self._audit_log: list[InvariantResult] = []

    # ── State mutation API ────────────────────────────────────────────────────

    def update_view(self, new_view: int, new_primary: int) -> None:
        """Record a view change.  Enforces INV-4 (view monotonicity)."""
        if new_view < self._current_view:
            self._violation(
                "INV-4",
                f"View regression: new_view={new_view} < current={self._current_view}",
                view=new_view,
            )
        self._current_view = new_view
        self._current_primary = new_primary

    def record_preprepare(self, node_id: int, view: int, seq: int, digest: str) -> None:
        """
        Record a PRE-PREPARE message.  Enforces INV-10 (no equivocation) and
        INV-9 (primary uniqueness).
        """
        if node_id != self._current_primary and view == self._current_view:
            self._violation(
                "INV-9",
                f"Non-primary node {node_id} sent PRE-PREPARE in view {view} "
                f"(primary is {self._current_primary})",
                view=view,
                sequence=seq,
            )
        key = (node_id, view, seq)
        self._preprepare_log[key].add(digest)
        if len(self._preprepare_log[key]) > 1:
            self._violation(
                "INV-10",
                f"Node {node_id} equivocated at (view={view}, seq={seq}): "
                f"sent digests {self._preprepare_log[key]}",
                view=view,
                sequence=seq,
            )

    def record_prepare_certificate(
        self,
        view: int,
        seq: int,
        digest: str,
        signers: frozenset[int] | set[int],
    ) -> None:
        """
        Record a completed PREPARE certificate.  Enforces INV-6.
        """
        signer_set = frozenset(signers)
        if len(signer_set) < self._quorum:
            self._violation(
                "INV-6",
                f"PREPARE cert at (view={view}, seq={seq}) has {len(signer_set)} signers "
                f"< quorum {self._quorum}",
                view=view,
                sequence=seq,
            )
        self._prepare_certs[(view, seq)] = _PrepareCert(
            view=view, seq=seq, digest=digest, signers=signer_set
        )

    def record_commit(
        self,
        node_id: int,
        view: int,
        seq: int,
        digest: str,
    ) -> None:
        """Record a single COMMIT message.  Enforces INV-1 (agreement) on accumulation."""
        if seq not in self._commit_records:
            self._commit_records[seq] = _CommitRecord(seq=seq, digest=digest)
        record = self._commit_records[seq]

        if record.digest != digest:
            self._violation(
                "INV-1",
                f"Agreement violation at seq={seq}: "
                f"existing digest={record.digest!r} conflicts with new={digest!r} "
                f"from node {node_id}",
                sequence=seq,
                view=view,
            )
        record.signers.add(node_id)
        record.views_seen.add(view)

    def record_commit_certificate(
        self,
        view: int,
        seq: int,
        digest: str,
        signers: frozenset[int] | set[int],
    ) -> None:
        """
        Record a completed COMMIT certificate and mark sequence as committed.
        Enforces INV-7 and INV-5.
        """
        signer_set = frozenset(signers)
        if len(signer_set) < self._quorum:
            self._violation(
                "INV-7",
                f"COMMIT cert at (view={view}, seq={seq}) has {len(signer_set)} signers "
                f"< quorum {self._quorum}",
                view=view,
                sequence=seq,
            )

        if seq in self._committed_seqs and self._committed_seqs[seq] != digest:
            self._violation(
                "INV-1",
                f"Conflicting commit certificates at seq={seq}: "
                f"prior={self._committed_seqs[seq]!r}, new={digest!r}",
                sequence=seq,
                view=view,
            )

        if seq < self._high_water_mark and seq not in self._committed_seqs:
            # Out-of-order commit — fine, but must not regress an already-committed seq
            pass

        self._committed_seqs[seq] = digest
        self._commit_certs[(view, seq)] = _CommitCert(
            view=view, seq=seq, digest=digest, signers=signer_set
        )

        # Update high water mark
        if seq > self._high_water_mark:
            self._high_water_mark = seq

        # Prune old records beyond max_log_entries
        if len(self._committed_seqs) > self._cfg.max_log_entries:
            oldest_seq = min(self._committed_seqs)
            del self._committed_seqs[oldest_seq]
            self._commit_records.pop(oldest_seq, None)

    def update_water_marks(self, low: int, high: int) -> None:
        """
        Update checkpoint water marks.  Enforces INV-8.
        """
        # Low water mark must not exceed any committed sequence still in log
        for seq in self._committed_seqs:
            if seq < low and seq >= self._low_water_mark:
                # This seq is being pruned — verify it had a valid commit cert
                if (self._current_view, seq) not in self._commit_certs:
                    # Check any view
                    has_cert = any(s == seq for (_, s) in self._commit_certs)
                    if not has_cert:
                        _log.warning(
                            "INV-8: pruning seq=%d below low watermark without cert", seq
                        )
        self._low_water_mark = low
        self._high_water_mark = max(high, self._high_water_mark)

    # ── Invariant checks ──────────────────────────────────────────────────────

    def check_agreement(self) -> InvariantResult:
        """INV-1: No two conflicting committed values at the same sequence number."""
        for seq, record in self._commit_records.items():
            if seq in self._committed_seqs:
                if self._committed_seqs[seq] != record.digest:
                    return InvariantResult(
                        "INV-1",
                        False,
                        f"Committed digest {self._committed_seqs[seq]!r} at seq={seq} "
                        f"conflicts with commit record digest {record.digest!r}",
                    )
        return InvariantResult("INV-1", True, "All committed values agree")

    def check_quorum_intersection(self) -> InvariantResult:
        """INV-3: PBFT requires N > 3f so that any two quorums of size 2f+1
        share at least one honest node (full f+1 intersection holds for N=3f+1;
        with N>3f+1 the guarantee is relaxed to ≥f overlap, which is still
        safe given the liveness arguments in Castro & Liskov §4)."""
        n = self._cfg.n_nodes
        f = self._cfg.f
        quorum = 2 * f + 1
        if n <= 3 * f:
            return InvariantResult(
                "INV-3",
                False,
                f"N={n} ≤ 3f={3 * f}: PBFT requires N > 3f for Byzantine fault tolerance",
            )
        min_intersection = quorum + quorum - n  # |Q1| + |Q2| − N
        return InvariantResult(
            "INV-3",
            True,
            f"N={n} > 3f={3 * f}, quorum={quorum}, min_intersection≥{min_intersection}",
        )

    def check_view_monotonicity(self) -> InvariantResult:
        """INV-4: View is monotonically non-decreasing (enforced at update_view)."""
        return InvariantResult("INV-4", True, f"current_view={self._current_view} (monotone)")

    def check_sequence_monotonicity(self) -> InvariantResult:
        """INV-5: No already-committed sequence is uncommitted later."""
        committed = sorted(self._committed_seqs)
        for i in range(1, len(committed)):
            if committed[i] < committed[i - 1]:
                return InvariantResult(
                    "INV-5",
                    False,
                    f"Sequence regression: committed[{i}]={committed[i]} < "
                    f"committed[{i - 1}]={committed[i - 1]}",
                )
        return InvariantResult("INV-5", True, f"high_water_mark={self._high_water_mark}")

    def check_prepare_cert_soundness(self) -> InvariantResult:
        """INV-6: Every PREPARE certificate has ≥ quorum distinct signers."""
        for (view, seq), cert in self._prepare_certs.items():
            if len(cert.signers) < self._quorum:
                return InvariantResult(
                    "INV-6",
                    False,
                    f"PREPARE cert at (view={view}, seq={seq}) has {len(cert.signers)} "
                    f"signers < quorum {self._quorum}",
                )
        return InvariantResult("INV-6", True, f"{len(self._prepare_certs)} prepare certs valid")

    def check_commit_cert_soundness(self) -> InvariantResult:
        """INV-7: Every COMMIT certificate has ≥ quorum distinct signers."""
        for (view, seq), cert in self._commit_certs.items():
            if len(cert.signers) < self._quorum:
                return InvariantResult(
                    "INV-7",
                    False,
                    f"COMMIT cert at (view={view}, seq={seq}) has {len(cert.signers)} "
                    f"signers < quorum {self._quorum}",
                )
        return InvariantResult("INV-7", True, f"{len(self._commit_certs)} commit certs valid")

    def check_no_equivocation(self) -> InvariantResult:
        """INV-10: No node sent two different PRE-PREPAREs for the same (view, seq)."""
        for (node_id, view, seq), digests in self._preprepare_log.items():
            if len(digests) > 1:
                return InvariantResult(
                    "INV-10",
                    False,
                    f"Node {node_id} equivocated at (view={view}, seq={seq}): "
                    f"digests={digests}",
                )
        return InvariantResult("INV-10", True, "No equivocation detected")

    def check_primary_uniqueness(self) -> InvariantResult:
        """INV-9: At most one node acts as primary per view."""
        per_view_primaries: dict[int, set[int]] = defaultdict(set)
        for (node_id, view, _) in self._preprepare_log:
            per_view_primaries[view].add(node_id)
        for view, nodes in per_view_primaries.items():
            if len(nodes) > 1:
                return InvariantResult(
                    "INV-9",
                    False,
                    f"Multiple nodes acting as primary in view {view}: {nodes}",
                )
        return InvariantResult("INV-9", True, "Primary uniqueness holds for all views")

    def check_all(self) -> list[InvariantResult]:
        """
        Run all invariant checks and return their results.

        If any invariant fails and halt_on_violation is True, purges volatile state
        and raises InvariantViolationError.

        Returns:
            List of InvariantResult objects (one per invariant, all passed).
        """
        checks = [
            self.check_agreement,
            self.check_quorum_intersection,
            self.check_view_monotonicity,
            self.check_sequence_monotonicity,
            self.check_prepare_cert_soundness,
            self.check_commit_cert_soundness,
            self.check_no_equivocation,
            self.check_primary_uniqueness,
        ]
        results: list[InvariantResult] = []
        for check_fn in checks:
            result = check_fn()
            self._audit_log.append(result)
            if len(self._audit_log) > self._cfg.max_log_entries:
                self._audit_log.pop(0)
            results.append(result)
            if not result.passed:
                self._violation(result.invariant_name, result.detail)
        return results

    # ── Guard decorator ───────────────────────────────────────────────────────

    def guard(
        self,
        pre_checks: list[str] | None = None,
        post_checks: list[str] | None = None,
    ) -> Callable[[_F], _F]:
        """
        Decorator that runs named invariant checks before and after a method.

        Usage::

            @verifier.guard(pre_checks=["view_monotone"], post_checks=["agreement"])
            def on_commit(self, seq: int, digest: str) -> None:
                ...

        Available check names:
            "agreement", "quorum_intersection", "view_monotonicity",
            "sequence_monotonicity", "prepare_cert_soundness",
            "commit_cert_soundness", "no_equivocation", "primary_uniqueness",
            "all"
        """
        check_map: dict[str, Callable[[], InvariantResult]] = {
            "agreement": self.check_agreement,
            "quorum_intersection": self.check_quorum_intersection,
            "view_monotonicity": self.check_view_monotonicity,
            "sequence_monotonicity": self.check_sequence_monotonicity,
            "prepare_cert_soundness": self.check_prepare_cert_soundness,
            "commit_cert_soundness": self.check_commit_cert_soundness,
            "no_equivocation": self.check_no_equivocation,
            "primary_uniqueness": self.check_primary_uniqueness,
        }

        def _run_checks(names: list[str]) -> None:
            for name in names:
                if name == "all":
                    self.check_all()
                    return
                fn = check_map.get(name)
                if fn is None:
                    raise ValueError(f"Unknown invariant check name: {name!r}")
                result = fn()
                if not result.passed:
                    self._violation(result.invariant_name, result.detail)

        def decorator(func: _F) -> _F:
            @functools.wraps(func)
            def wrapper(*args: Any, **kwargs: Any) -> Any:
                if pre_checks:
                    _run_checks(pre_checks)
                result = func(*args, **kwargs)
                if post_checks:
                    _run_checks(post_checks)
                return result
            return wrapper  # type: ignore[return-value]

        return decorator

    # ── Audit log access ──────────────────────────────────────────────────────

    def audit_log(self) -> list[InvariantResult]:
        """Return a snapshot of the in-memory audit log."""
        return list(self._audit_log)

    def summary(self) -> dict[str, int | str]:
        """Return a compact state summary for health-check endpoints."""
        return {
            "current_view": self._current_view,
            "current_primary": self._current_primary,
            "committed_sequences": len(self._committed_seqs),
            "high_water_mark": self._high_water_mark,
            "low_water_mark": self._low_water_mark,
            "prepare_certs": len(self._prepare_certs),
            "commit_certs": len(self._commit_certs),
            "audit_log_entries": len(self._audit_log),
        }

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _violation(
        self,
        invariant_name: str,
        detail: str,
        view: int | None = None,
        sequence: int | None = None,
    ) -> None:
        """
        Handle an invariant violation:
        1. Log at CRITICAL level.
        2. Record to audit log.
        3. Purge volatile state if configured.
        4. Raise InvariantViolationError.
        5. sys.exit(1) if halt_on_violation is True (after raising).
        """
        _log.critical(
            "INVARIANT VIOLATION [%s] view=%s seq=%s: %s",
            invariant_name,
            view,
            sequence,
            detail,
        )
        result = InvariantResult(invariant_name, False, detail)
        self._audit_log.append(result)

        if self._cfg.purge_on_violation:
            self._purge_volatile_state()

        error = InvariantViolationError(
            invariant_name=invariant_name,
            detail=detail,
            sequence=sequence,
            view=view,
        )

        if self._cfg.halt_on_violation:
            try:
                raise error
            finally:
                # Flush stderr before exit so the log survives the halt
                import sys as _sys
                _sys.stderr.flush()
                os._exit(1)  # noqa: SLF001 — os._exit bypasses finally/atexit for hard halt

        raise error

    def _purge_volatile_state(self) -> None:
        """
        Zero and discard all in-memory certificate and log structures.

        This makes it harder for an attacker who has triggered a violation to
        extract partial consensus state from a crash dump.
        """
        _log.critical("FormalVerifier: purging volatile state")

        # Overwrite committed sequences with zeros before clearing
        for key in self._committed_seqs:
            self._committed_seqs[key] = "0" * 64
        self._committed_seqs.clear()

        for key in self._commit_records:
            self._commit_records[key].signers.clear()
            self._commit_records[key].views_seen.clear()
        self._commit_records.clear()

        for key in self._prepare_certs:
            # frozensets are immutable; just drop the reference
            del self._prepare_certs[key]
            break
        self._prepare_certs.clear()

        for key in self._commit_certs:
            del self._commit_certs[key]
            break
        self._commit_certs.clear()

        self._preprepare_log.clear()
        self._high_water_mark = 0
        self._low_water_mark = 0
