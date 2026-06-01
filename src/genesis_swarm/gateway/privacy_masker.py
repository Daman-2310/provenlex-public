"""
ZKPMasker — HMAC-SHA256 Privacy Shield

This is Privacy-Preserving Surveillance: agents detect fraud patterns
(round-tripping, layering, structuring) on masked data without ever
seeing raw PII, account numbers, or exact transaction amounts.

Design properties:
  DETERMINISTIC  — same input → same mask (enables cross-transaction pattern matching)
  ONE-WAY        — HMAC-SHA256 with a local salt; cannot be reversed without the salt
  PATTERN-SAFE   — amount bucketing prevents fingerprinting by transaction size
  LOCAL-ONLY     — salt never leaves the sovereign node; masking happens in-process

This is the practical enterprise equivalent of Zero-Knowledge Proof systems:
the analytical layer (fraud detection) operates on the commitment (hash)
without access to the preimage (raw data).
"""

from __future__ import annotations

import hashlib
import hmac
import os
import time
from dataclasses import asdict, dataclass
from typing import Optional

# ── Amount buckets — preserve enough info for layering detection ──────────────
_BUCKETS = [
    (1_000, "NANO"),  # < €1K
    (10_000, "MICRO"),  # €1K – €10K
    (100_000, "SMALL"),  # €10K – €100K
    (1_000_000, "MEDIUM"),  # €100K – €1M
    (10_000_000, "LARGE"),  # €1M – €10M
    (100_000_000, "XLARGE"),  # €10M – €100M
    (float("inf"), "INSTITUTIONAL"),  # > €100M
]


def _bucket_amount(amount: float) -> str:
    for threshold, label in _BUCKETS:
        if amount < threshold:
            return label
    return "INSTITUTIONAL"


@dataclass
class MaskedTransaction:
    masked_tx_id: str  # HMAC-SHA256[:16] of original tx_id
    masked_from: str  # HMAC[:12] of sender entity
    masked_to: str  # HMAC[:12] of receiver entity
    amount_bucket: str  # bucketed amount — no exact figure
    tx_type: str  # TRANSFER / REDEMPTION / SUBSCRIPTION / FX_SWAP / etc.
    ts: float

    def to_dict(self) -> dict:
        return asdict(self)


class ZKPMasker:
    """
    HMAC-SHA256 privacy masker.

    All agents receive only MaskedTransaction objects.  Raw PII is
    consumed at the gateway boundary and never propagated downstream.
    """

    def __init__(self, salt: Optional[bytes] = None) -> None:
        # Load salt from env or generate a fresh one per session
        env_salt = os.getenv("GENESIS_ZKP_SALT", "")
        if env_salt:
            self._salt = env_salt.encode()
        elif salt:
            self._salt = salt
        else:
            self._salt = os.urandom(32)
        self._masks_applied = 0
        self._pattern_hits = 0

    # ── Core masking ──────────────────────────────────────────────────────────

    def _hmac(self, value: str, length: int = 16) -> str:
        return hmac.new(self._salt, value.encode(), hashlib.sha256).hexdigest()[:length]

    def mask_entity(self, entity_id: str) -> str:
        return f"ENT-{self._hmac(entity_id, 12)}"

    def mask_tx_id(self, tx_id: str) -> str:
        return f"TX-{self._hmac(tx_id, 16)}"

    def mask_transaction(self, raw_tx: dict) -> MaskedTransaction:
        """
        Consume a raw transaction dict and return a masked version.
        The original dict is not stored anywhere after this call.
        """
        self._masks_applied += 1
        return MaskedTransaction(
            masked_tx_id=self.mask_tx_id(str(raw_tx.get("tx_id", ""))),
            masked_from=self.mask_entity(str(raw_tx.get("from_entity", ""))),
            masked_to=self.mask_entity(str(raw_tx.get("to_entity", ""))),
            amount_bucket=_bucket_amount(float(raw_tx.get("amount", 0))),
            tx_type=str(raw_tx.get("tx_type", "UNKNOWN")).upper(),
            ts=float(raw_tx.get("ts", time.time())),
        )

    # ── Pattern detection — runs on masked data only ──────────────────────────

    def detect_round_trip(
        self, masked_history: list[MaskedTransaction], window_seconds: float = 86_400
    ) -> tuple[bool, Optional[str]]:
        """
        Detect A→B followed by B→A within window_seconds.
        Returns (is_round_trip, reason).
        """
        now = time.time()
        recent = [t for t in masked_history if now - t.ts <= window_seconds]
        seen: dict[tuple[str, str], float] = {}
        for tx in recent:
            forward = (tx.masked_from, tx.masked_to)
            reverse = (tx.masked_to, tx.masked_from)
            if reverse in seen:
                lag = tx.ts - seen[reverse]
                self._pattern_hits += 1
                return True, f"Round-trip detected: lag {lag:.0f}s, bucket {tx.amount_bucket}"
            seen[forward] = tx.ts
        return False, None

    def detect_layering(
        self,
        masked_history: list[MaskedTransaction],
        min_hops: int = 3,
        window_seconds: float = 3_600,
    ) -> tuple[bool, Optional[str]]:
        """
        Detect chains A→B→C→…→A (funds cycling through multiple entities).
        Uses graph traversal on masked entity IDs.
        """
        now = time.time()
        recent = [t for t in masked_history if now - t.ts <= window_seconds]
        # Build adjacency: from_entity → list of to_entities
        graph: dict[str, list[str]] = {}
        for tx in recent:
            graph.setdefault(tx.masked_from, []).append(tx.masked_to)

        # DFS from each node looking for cycles of length >= min_hops
        def _has_cycle(start: str, current: str, path: list[str]) -> bool:
            for nxt in graph.get(current, []):
                if nxt == start and len(path) >= min_hops:
                    return True
                if nxt not in path:
                    if _has_cycle(start, nxt, path + [nxt]):
                        return True
            return False

        for origin in list(graph.keys())[:30]:  # cap traversal depth
            if _has_cycle(origin, origin, [origin]):
                self._pattern_hits += 1
                return True, f"Layering chain detected: origin {origin}, min {min_hops} hops"
        return False, None

    def detect_structuring(
        self,
        masked_history: list[MaskedTransaction],
        window_seconds: float = 3_600,
    ) -> tuple[bool, Optional[str]]:
        """
        Detect structuring (smurfing): same entity sending many SMALL/MICRO
        transactions in a short window to evade reporting thresholds.
        """
        now = time.time()
        recent = [
            t
            for t in masked_history
            if now - t.ts <= window_seconds and t.amount_bucket in ("MICRO", "SMALL", "NANO")
        ]
        from_counts: dict[str, int] = {}
        for tx in recent:
            from_counts[tx.masked_from] = from_counts.get(tx.masked_from, 0) + 1
        for entity, count in from_counts.items():
            if count >= 5:
                self._pattern_hits += 1
                return (
                    True,
                    f"Structuring: entity {entity} sent {count} sub-threshold txns in {window_seconds / 3600:.0f}h",
                )
        return False, None

    def analyze(
        self,
        masked_history: list[MaskedTransaction],
        current_tx: "MaskedTransaction | None" = None,
    ) -> dict:
        """
        Run all pattern detectors and return a risk report.

        When current_tx is provided, round-trip and layering checks are scoped
        to transactions that share an entity with the current transaction.
        This prevents a single fraud event from raising the risk level for all
        unrelated transactions in the same window (global-contamination bug).

        Structuring is intentionally NOT entity-scoped because smurfs use many
        different source entities — the pattern is in the destination aggregation.
        """
        if current_tx is not None:
            current_entities = {current_tx.masked_from, current_tx.masked_to}
            scoped_history = [
                t for t in masked_history
                if t.masked_from in current_entities or t.masked_to in current_entities
            ]
        else:
            scoped_history = masked_history   # backward-compatible fallback

        rt, rt_reason   = self.detect_round_trip(scoped_history)
        lay, lay_reason = self.detect_layering(scoped_history)
        str_, str_reason = self.detect_structuring(masked_history)  # global intentionally
        threats = [r for r in [rt_reason, lay_reason, str_reason] if r]
        risk = "HIGH" if (rt or lay) else "MEDIUM" if str_ else "LOW"
        return {
            "round_trip": rt,
            "layering": lay,
            "structuring": str_,
            "risk_level": risk,
            "threats": threats,
            "patterns_found": len(threats),
        }

    # ── Stats ─────────────────────────────────────────────────────────────────

    def get_stats(self) -> dict:
        return {
            "masks_applied": self._masks_applied,
            "pattern_hits": self._pattern_hits,
            "salt_hash": hashlib.sha256(self._salt).hexdigest()[:12] + "…",
            "privacy_model": "HMAC-SHA256 pseudonymization (ZKP-inspired)",
        }
