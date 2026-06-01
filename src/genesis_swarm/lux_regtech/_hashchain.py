"""
Shared tamper-evident hash-chain primitive.

Used by the Substance Audit Engine (Component 1) and the Delegation Oversight
Ledger (Component 5). Each appended entry binds to its predecessor via
``entry_hash = SHA-256(prev_hash || canonical_json(payload))`` so any
retroactive edit invalidates every subsequent link — the cryptographic basis
for an append-only legal-defence log.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
import hashlib
import json
import threading
from typing import Any

GENESIS_PREV_HASH = "0" * 64


def _canonical(payload: dict[str, Any]) -> str:
    """Deterministic JSON serialisation (sorted keys, no whitespace drift)."""
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


def compute_entry_hash(prev_hash: str, payload: dict[str, Any]) -> str:
    digest = hashlib.sha256()
    digest.update(prev_hash.encode("utf-8"))
    digest.update(_canonical(payload).encode("utf-8"))
    return digest.hexdigest()


@dataclass
class ChainEntry:
    index: int
    timestamp: str
    payload: dict[str, Any]
    prev_hash: str
    entry_hash: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "index": self.index,
            "timestamp": self.timestamp,
            "payload": self.payload,
            "prev_hash": self.prev_hash,
            "entry_hash": self.entry_hash,
        }


@dataclass
class HashChain:
    """Thread-safe in-memory append-only chain.

    In production each ``append`` maps to one INSERT into the corresponding
    ``*_ledger`` table (see schema.sql); ``verify`` re-walks the chain to prove
    integrity for an auditor or regulator.
    """

    name: str
    _entries: list[ChainEntry] = field(default_factory=list)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def append(self, payload: dict[str, Any]) -> ChainEntry:
        with self._lock:
            prev_hash = self._entries[-1].entry_hash if self._entries else GENESIS_PREV_HASH
            index = len(self._entries)
            timestamp = datetime.now(UTC).isoformat()
            bound = {**payload, "_index": index, "_timestamp": timestamp}
            entry_hash = compute_entry_hash(prev_hash, bound)
            entry = ChainEntry(index, timestamp, payload, prev_hash, entry_hash)
            self._entries.append(entry)
            return entry

    def verify(self) -> tuple[bool, int | None]:
        """Re-derive every link. Returns (ok, first_broken_index)."""
        prev_hash = GENESIS_PREV_HASH
        for entry in self._entries:
            bound = {**entry.payload, "_index": entry.index, "_timestamp": entry.timestamp}
            expected = compute_entry_hash(prev_hash, bound)
            if expected != entry.entry_hash or entry.prev_hash != prev_hash:
                return False, entry.index
            prev_hash = entry.entry_hash
        return True, None

    def entries(self) -> list[dict[str, Any]]:
        return [e.to_dict() for e in self._entries]

    def head(self) -> str:
        return self._entries[-1].entry_hash if self._entries else GENESIS_PREV_HASH

    def __len__(self) -> int:
        return len(self._entries)
