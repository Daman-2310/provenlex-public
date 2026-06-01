from __future__ import annotations

"""Deterministic audit replay engine for incident investigation.

Yields ``AuditRecord`` dicts in chronological order, optionally at an
accelerated playback speed, so compliance officers can reconstruct any
swarm incident and submit a CSSF-formatted evidence package.
"""

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator

from ..audit_logger import AuditRecord
from .merkle_tree import MerkleAuditLog

log = logging.getLogger(__name__)


def _iso(ts: float) -> str:
    """Convert a Unix timestamp to an ISO-8601 UTC string."""
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


class AuditReplayer:
    """Deterministic replay of swarm audit records for incident investigation.

    Parameters
    ----------
    merkle_log:
        Live :class:`~genesis_swarm.shared.security.merkle_tree.MerkleAuditLog`
        instance — used to obtain Merkle proofs and verify record integrity.
    audit_logger:
        The swarm's :class:`~genesis_swarm.shared.audit_logger.AuditLogger`
        whose in-memory ``_buffer`` is used as the source of truth.
    """

    def __init__(self, merkle_log: MerkleAuditLog, audit_logger) -> None:
        self._merkle = merkle_log
        self._audit_logger = audit_logger
        # Direct reference to the audit logger's mutable record buffer so that
        # newly appended records are visible without explicit refresh.
        self._records: list[AuditRecord] = audit_logger._buffer

    # ── Internal helpers ───────────────────────────────────────────────────────

    def _records_in_window(self, from_ts: float, to_ts: float) -> list[AuditRecord]:
        """Return all in-memory records whose timestamp falls in [from_ts, to_ts]."""
        return [r for r in self._records if from_ts <= r.timestamp <= to_ts]

    # ── Public API ─────────────────────────────────────────────────────────────

    async def replay_incident(
        self,
        incident_id: str,
        from_ts: float,
        to_ts: float,
        speed: float = 1.0,
    ) -> AsyncGenerator[dict, None]:
        """Async generator that yields audit record dicts in chronological order.

        Each record is yielded after a delay proportional to the wall-clock gap
        between it and its predecessor, scaled by ``1 / speed``.

        Parameters
        ----------
        incident_id:
            Human-readable label used in log lines (does not filter records).
        from_ts:
            Start of the replay window (Unix timestamp, inclusive).
        to_ts:
            End of the replay window (Unix timestamp, inclusive).
        speed:
            Playback multiplier.  ``1.0`` = real-time, ``10.0`` = 10× faster,
            ``0.0`` (or negative) falls back to ``1.0`` to prevent division
            by zero.

        Yields
        ------
        dict
            ``AuditRecord.to_dict()`` for each record in the window.
        """
        if speed <= 0:
            speed = 1.0

        window = sorted(
            self._records_in_window(from_ts, to_ts),
            key=lambda r: r.timestamp,
        )
        log.info(
            "[AuditReplayer] Replaying incident=%s records=%d speed=%.1fx",
            incident_id,
            len(window),
            speed,
        )

        prev_ts: float = from_ts
        for record in window:
            gap = record.timestamp - prev_ts
            delay = gap / speed
            if delay > 0:
                await asyncio.sleep(delay)
            prev_ts = record.timestamp
            yield record.to_dict()

    def get_incident_summary(self, from_ts: float, to_ts: float) -> dict:
        """Summarise a time window for quick triage.

        Returns
        -------
        dict
            ``{record_count, bots_involved, consensus_rounds,
            anomalies_detected, merkle_verified}``
        """
        window = self._records_in_window(from_ts, to_ts)

        bots_involved: set[str] = set()
        consensus_rounds: int = 0
        anomalies_detected: int = 0
        merkle_verified: int = 0

        for rec in window:
            bots_involved.add(rec.bot_id)
            et = rec.event_type.upper()
            if "CONSENSUS" in et:
                consensus_rounds += 1
            if "ANOMALY" in et or "ALERT" in et or "BYPASS" in et:
                anomalies_detected += 1
            # Verify the record's hash against the Merkle tree
            if self._merkle.verify_leaf(rec.to_dict(), rec.record_hash):
                merkle_verified += 1

        return {
            "record_count": len(window),
            "bots_involved": sorted(bots_involved),
            "consensus_rounds": consensus_rounds,
            "anomalies_detected": anomalies_detected,
            "merkle_verified": merkle_verified,
        }

    def export_incident(self, from_ts: float, to_ts: float) -> dict:
        """Build a CSSF-formatted incident report for regulatory submission.

        Returns
        -------
        dict
            A fully serialisable report dict containing Merkle proofs,
            consensus round summaries, anomaly records, and an integrity
            proof block ready for submission to the CSSF/AIFMD portal.
        """
        report_id = f"CSSF-INCIDENT-{str(uuid.uuid4())[:8].upper()}"
        generated_at = _iso(__import__("time").time())

        window = sorted(
            self._records_in_window(from_ts, to_ts),
            key=lambda r: r.timestamp,
        )

        # ── Categorise records ────────────────────────────────────────────────
        consensus_rounds: list[dict] = []
        anomalies: list[dict] = []
        bots_active: set[str] = set()
        leaf_hashes: list[str] = []

        for rec in window:
            bots_active.add(rec.bot_id)
            rd = rec.to_dict()
            et = rec.event_type.upper()

            if "CONSENSUS" in et:
                consensus_rounds.append(
                    {
                        "ts": _iso(rec.timestamp),
                        "bot_id": rec.bot_id,
                        "bot_type": rec.bot_type,
                        "event_type": rec.event_type,
                        "payload": rec.payload,
                        "record_hash": rec.record_hash,
                    }
                )
            if "ANOMALY" in et or "ALERT" in et or "BYPASS" in et or "CHAOS" in et:
                anomalies.append(
                    {
                        "ts": _iso(rec.timestamp),
                        "bot_id": rec.bot_id,
                        "bot_type": rec.bot_type,
                        "event_type": rec.event_type,
                        "payload": rec.payload,
                        "record_hash": rec.record_hash,
                    }
                )

            # Collect leaf hash if the record is already in the Merkle tree
            if self._merkle.verify_leaf(rd, rec.record_hash):
                leaf_hashes.append(rec.record_hash)

        # ── Integrity proof block ─────────────────────────────────────────────
        merkle_root = self._merkle.root or ""
        merkle_verified = bool(leaf_hashes) and bool(merkle_root)

        integrity_proof = {
            "merkle_root": merkle_root,
            "leaf_hashes": leaf_hashes,
            "leaf_count": len(leaf_hashes),
            "tree_depth": self._merkle.depth,
        }

        return {
            "report_id": report_id,
            "generated_at": generated_at,
            "period": {
                "from": _iso(from_ts),
                "to": _iso(to_ts),
            },
            "merkle_root": merkle_root,
            "merkle_verified": merkle_verified,
            "total_records": len(window),
            "consensus_rounds": consensus_rounds,
            "anomalies": anomalies,
            "bots_active": sorted(bots_active),
            "integrity_proof": integrity_proof,
        }
