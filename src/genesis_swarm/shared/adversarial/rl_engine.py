from __future__ import annotations

import random
from collections import defaultdict

from .attack_library import ATTACK_VECTORS, AttackVector

# Initial Q-value seeds — reflects estimated bypass difficulty before learning
_SEED_Q: dict[str, float] = {
    "SANC-001": 0.60,  # token_removal — easy, only needs 1 token dropped
    "SANC-002": 0.45,
    "SANC-003": 0.45,
    "SANC-004": 0.55,  # entity_type_pivot — type confusion, moderately hard to detect
    "CARG-001": 0.55,  # ais_gap_fragmentation
    "CARG-002": 0.50,
    "CARG-003": 0.30,
    "CARG-004": 0.35,
    "FXBT-001": 0.55,  # rate_smoothing
    "FXBT-002": 0.48,
    "FXBT-003": 0.62,  # currency_rotation — most sophisticated FX evasion
    "FXBT-004": 0.40,
    "COMP-001": 0.70,  # leverage_structuring — trivially easy, just set 2.999
    "COMP-002": 0.52,
    "COMP-003": 0.45,
    "COMP-004": 0.30,
    "ORBT-001": 0.48,
    "ORBT-002": 0.50,
    "SUCC-001": 0.58,  # ubo_layering
    "SUCC-002": 0.45,
}

EPSILON = 0.25  # exploration rate — 25% random, 75% exploit best known attack
ALPHA = 0.20  # learning rate


class RLEngine:
    """
    Epsilon-greedy Q-learning bandit for attack vector selection.

    Each attack vector is a "arm" in the bandit. Q[v] estimates the
    probability that vector v bypasses the current detection threshold.
    After each attempt the Q-value is updated via:
        Q[v] += alpha * (reward - Q[v])
    where reward = 1.0 on bypass, 0.0 on block.
    """

    def __init__(self):
        self._q: dict[str, float] = dict(_SEED_Q)
        self._counts: dict[str, int] = defaultdict(int)
        self._total_pulls: int = 0
        self._bypass_streak: int = 0
        self._block_streak: int = 0

    # ── Selection ─────────────────────────────────────────────────────────────

    def select_attack(self, vectors: list[AttackVector] | None = None) -> AttackVector:
        pool = vectors or ATTACK_VECTORS
        if random.random() < EPSILON:
            return random.choice(pool)
        best = max(pool, key=lambda v: self._q.get(v.vector_id, 0.40))
        return best

    # ── Update ────────────────────────────────────────────────────────────────

    def update(self, vector_id: str, success: bool) -> None:
        reward = 1.0 if success else 0.0
        old = self._q.get(vector_id, 0.40)
        self._q[vector_id] = old + ALPHA * (reward - old)
        self._counts[vector_id] += 1
        self._total_pulls += 1

        if success:
            self._bypass_streak += 1
            self._block_streak = 0
        else:
            self._block_streak += 1
            self._bypass_streak = 0

    # ── Reporting ─────────────────────────────────────────────────────────────

    def get_top_threats(self, n: int = 8) -> list[dict]:
        sorted_vecs = sorted(
            ATTACK_VECTORS,
            key=lambda v: self._q.get(v.vector_id, 0.40),
            reverse=True,
        )[:n]
        return [
            {
                "vector_id": v.vector_id,
                "technique": v.technique,
                "target": v.target_bot_type,
                "category": v.category,
                "severity": v.severity,
                "q_value": round(self._q.get(v.vector_id, 0.40), 3),
                "attempts": self._counts.get(v.vector_id, 0),
            }
            for v in sorted_vecs
        ]

    def get_state(self) -> dict:
        return {
            "total_pulls": self._total_pulls,
            "bypass_streak": self._bypass_streak,
            "block_streak": self._block_streak,
            "q_table": {k: round(v, 3) for k, v in self._q.items()},
            "counts": dict(self._counts),
        }
