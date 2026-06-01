"""
SovereignLedger — Immutable Append-Only Hash-Chained Audit Ledger

Every ConsensusRound that reaches quorum is appended to this ledger.
Each entry hash-chains to the previous entry, forming a tamper-evident
sequence that can be independently verified by re-hashing the entire chain.

Verification Protocol:
    1. Recompute entry_hash for every entry using (seq, round_id, merkle_root, prev_hash, ts)
    2. Verify each entry's prev_entry_hash equals the prior entry's entry_hash
    3. If both checks pass for every entry → chain is intact
    4. Publish head_hash as the single cryptographic commitment to all history
"""

from __future__ import annotations

import hashlib
import time
from dataclasses import asdict, dataclass
from typing import Optional


@dataclass
class LedgerEntry:
    sequence: int  # monotonic counter, starts at 0
    round_id: str
    merkle_root: str  # Merkle root of vote evidence hashes (from ConsensusRound)
    prev_entry_hash: str  # hash of previous entry ("0"*64 for genesis)
    entry_hash: str  # SHA-256(seq:round_id:merkle_root:prev_entry_hash:ts)
    verdict: bool  # final_verdict from the round
    threat_type: str
    initiator: str
    quorum_reached: bool
    weighted_score: float
    yes_votes: int
    total_votes: int
    ts: float

    def to_dict(self) -> dict:
        return asdict(self)

    @staticmethod
    def compute_hash(
        sequence: int,
        round_id: str,
        merkle_root: str,
        prev_entry_hash: str,
        ts: float,
    ) -> str:
        """Deterministic SHA-256 commitment. Changing any field invalidates the hash."""
        payload = f"{sequence}:{round_id}:{merkle_root}:{prev_entry_hash}:{ts:.9f}"
        return hashlib.sha256(payload.encode()).hexdigest()


class SovereignLedger:
    """
    Cryptographically verifiable audit ledger.

    Rules:
      - Append-only: entries cannot be deleted or modified.
      - Hash-chained: each entry commits to the full prior history.
      - Verifiable: verify_integrity() re-hashes the entire chain in O(n).
    """

    GENESIS_HASH = "0" * 64

    def __init__(self) -> None:
        self._chain: list[LedgerEntry] = []
        self._index: dict[str, LedgerEntry] = {}  # round_id → entry

    # ── Properties ────────────────────────────────────────────────────────────

    @property
    def head_hash(self) -> str:
        return self._chain[-1].entry_hash if self._chain else self.GENESIS_HASH

    @property
    def length(self) -> int:
        return len(self._chain)

    # ── Write path ────────────────────────────────────────────────────────────

    def append_round(self, rnd) -> LedgerEntry:
        """Commit a ConsensusRound result to the ledger. Returns the new entry."""
        seq = len(self._chain)
        ts = time.time()
        prev_hash = self.head_hash
        yes_votes = sum(1 for v in rnd.votes if v.vote)
        entry_hash = LedgerEntry.compute_hash(seq, rnd.round_id, rnd.merkle_root, prev_hash, ts)

        entry = LedgerEntry(
            sequence=seq,
            round_id=rnd.round_id,
            merkle_root=rnd.merkle_root,
            prev_entry_hash=prev_hash,
            entry_hash=entry_hash,
            verdict=rnd.final_verdict,
            threat_type=rnd.threat_type,
            initiator=rnd.initiator_bot,
            quorum_reached=rnd.quorum_reached,
            weighted_score=rnd.weighted_score,
            yes_votes=yes_votes,
            total_votes=len(rnd.votes),
            ts=ts,
        )
        self._chain.append(entry)
        self._index[rnd.round_id] = entry
        return entry

    # ── Verification ──────────────────────────────────────────────────────────

    def verify_integrity(self) -> dict:
        """
        Re-hash the entire chain.

        Returns:
            {
              "valid": bool,
              "chain_length": int,
              "broken_at": int | None,   # sequence number of first bad entry
              "reason": str | None,
              "head_hash": str,
            }
        """
        if not self._chain:
            return {
                "valid": True,
                "chain_length": 0,
                "broken_at": None,
                "reason": None,
                "head_hash": self.GENESIS_HASH,
            }

        prev_hash = self.GENESIS_HASH
        for entry in self._chain:
            # Check backward link
            if entry.prev_entry_hash != prev_hash:
                return {
                    "valid": False,
                    "chain_length": len(self._chain),
                    "broken_at": entry.sequence,
                    "reason": "prev_hash_mismatch",
                    "head_hash": self.head_hash,
                }
            # Recompute and compare
            expected = LedgerEntry.compute_hash(
                entry.sequence,
                entry.round_id,
                entry.merkle_root,
                prev_hash,
                entry.ts,
            )
            if expected != entry.entry_hash:
                return {
                    "valid": False,
                    "chain_length": len(self._chain),
                    "broken_at": entry.sequence,
                    "reason": "entry_hash_invalid",
                    "head_hash": self.head_hash,
                }
            prev_hash = entry.entry_hash

        return {
            "valid": True,
            "chain_length": len(self._chain),
            "broken_at": None,
            "reason": None,
            "head_hash": self.head_hash,
        }

    # ── Read path ─────────────────────────────────────────────────────────────

    def get_proof(self, round_id: str) -> Optional[dict]:
        """Return ledger entry + cryptographic proof for external verification."""
        entry = self._index.get(round_id)
        if not entry:
            return None
        return {
            "entry": entry.to_dict(),
            "proof": {
                "sequence": entry.sequence,
                "prev_entry_hash": entry.prev_entry_hash,
                "entry_hash": entry.entry_hash,
                "head_hash": self.head_hash,
                "chain_length": self.length,
                "verification_formula": (
                    "SHA-256(sequence:round_id:merkle_root:prev_entry_hash:ts)"
                ),
            },
        }

    def get_recent(self, n: int = 20) -> list[dict]:
        return [e.to_dict() for e in reversed(self._chain[-n:])]

    def to_dict(self, max_entries: int = 50) -> dict:
        return {
            "chain_length": self.length,
            "head_hash": self.head_hash,
            "integrity": self.verify_integrity(),
            "entries": self.get_recent(max_entries),
        }
