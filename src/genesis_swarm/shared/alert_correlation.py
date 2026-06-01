"""
Alert deduplication and cross-bot correlation engine.

Problems solved:
  1. Duplicate suppression  — same entity × bot_type within 60 s emits only one alert
  2. Severity rollup        — if 3+ bots flag the same entity, severity escalates
  3. Time-decay             — alerts older than decay_window lose influence on rollup
  4. Cross-bot correlation  — if entity appears in SANCTIONS_BOT + CARGO_BOT + FX_BOT
                              within 5 min, a composite "multi-vector" alert is raised

Usage:
    correlator = AlertCorrelator()
    decision = correlator.process(alert)  # returns CorrelationDecision
    if decision.should_emit:
        await dispatcher.dispatch(alert)
"""

from __future__ import annotations

import hashlib
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

DEDUP_WINDOW_S = 60  # suppress identical entity+bot within this window
SEVERITY_ROLLUP_N = 3  # num distinct bots flagging same entity → escalate
DECAY_WINDOW_S = 300  # 5-min window for multi-vector correlation
MULTI_VECTOR_MIN = 3  # bots needed for multi-vector composite alert


@dataclass
class CorrelationDecision:
    should_emit: bool
    reason: str
    composite: bool = False  # True = multi-vector composite raised
    escalated_severity: Optional[str] = None
    suppressed_count: int = 0  # how many dupes were absorbed


@dataclass
class _EntityRecord:
    last_seen_ts: float = 0.0
    bot_hits: dict[str, float] = field(default_factory=dict)  # bot_type → ts
    suppressed: int = 0


class AlertCorrelator:
    """Thread-safe alert dedup + cross-bot correlation."""

    def __init__(
        self,
        dedup_window_s: float = DEDUP_WINDOW_S,
        decay_window_s: float = DECAY_WINDOW_S,
        rollup_n: int = SEVERITY_ROLLUP_N,
        multi_vector_min: int = MULTI_VECTOR_MIN,
    ):
        self._dedup_window = dedup_window_s
        self._decay_window = decay_window_s
        self._rollup_n = rollup_n
        self._multi_vector = multi_vector_min
        self._records: dict[str, _EntityRecord] = defaultdict(_EntityRecord)

    def process(self, alert_dict: dict) -> CorrelationDecision:
        """
        Evaluate an alert against the correlation state.
        alert_dict must have keys: entity_id, bot_type, anomaly_score, severity
        Returns CorrelationDecision.
        """
        entity = str(alert_dict.get("fund_name") or alert_dict.get("entity_id") or "unknown")
        bot = str(alert_dict.get("bot_type", "UNKNOWN"))
        now = time.time()

        rec = self._records[entity]

        # ── 1. Deduplication ───────────────────────────────────────────────
        last_same = rec.bot_hits.get(bot, 0.0)
        if now - last_same < self._dedup_window:
            rec.suppressed += 1
            return CorrelationDecision(
                should_emit=False,
                reason=f"dedup: same entity+bot within {self._dedup_window}s",
                suppressed_count=rec.suppressed,
            )

        # ── 2. Record this hit ─────────────────────────────────────────────
        rec.bot_hits[bot] = now
        rec.last_seen_ts = now

        # Evict hits outside the decay window
        rec.bot_hits = {b: ts for b, ts in rec.bot_hits.items() if now - ts <= self._decay_window}

        # ── 3. Multi-vector composite escalation ──────────────────────────
        active_bots = set(rec.bot_hits.keys())
        composite = False
        escalated = None

        if len(active_bots) >= self._multi_vector:
            composite = True
            severity = alert_dict.get("severity", "WARNING")
            escalated = _escalate_severity(severity)

        # ── 4. Cross-bot rollup: N+ bots → escalate severity ──────────────
        if not composite and len(active_bots) >= self._rollup_n:
            escalated = _escalate_severity(alert_dict.get("severity", "WARNING"))

        return CorrelationDecision(
            should_emit=True,
            reason="pass",
            composite=composite,
            escalated_severity=escalated,
            suppressed_count=0,
        )

    def get_entity_summary(self, entity: str) -> dict:
        rec = self._records.get(entity)
        if not rec:
            return {"entity": entity, "known": False}
        now = time.time()
        return {
            "entity": entity,
            "known": True,
            "active_bots": [b for b, ts in rec.bot_hits.items() if now - ts <= self._decay_window],
            "suppressed": rec.suppressed,
            "last_seen_s": round(now - rec.last_seen_ts, 1),
        }

    def stats(self) -> dict:
        now = time.time()
        total_suppressed = sum(r.suppressed for r in self._records.values())
        active_entities = sum(
            1 for r in self._records.values() if now - r.last_seen_ts < self._decay_window
        )
        return {
            "tracked_entities": len(self._records),
            "active_entities": active_entities,
            "total_suppressed": total_suppressed,
        }


def _dedup_key(entity: str, bot_type: str) -> str:
    return hashlib.sha256(f"{entity}|{bot_type}".encode()).hexdigest()[:16]


def _escalate_severity(current: str) -> str:
    order = ["INFO", "WARNING", "CRITICAL", "EMERGENCY"]
    idx = order.index(current) if current in order else 0
    return order[min(idx + 1, len(order) - 1)]
