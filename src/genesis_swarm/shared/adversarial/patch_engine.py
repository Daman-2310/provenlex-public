from __future__ import annotations

import time
from collections import defaultdict, deque
from dataclasses import dataclass, field

from .attack_library import AttackResult, AttackVector

THRESHOLD_FLOOR = 35.0  # never lower detection threshold below this
SAFETY_MARGIN = 7.0  # new_threshold = evaded_score - SAFETY_MARGIN
INITIAL_THRESHOLD = 75.0


@dataclass
class PatchRecord:
    patch_id: str
    vector_id: str
    target_bot_type: str
    technique: str
    old_threshold: float
    new_threshold: float
    evaded_score: float
    description: str
    ts: float = field(default_factory=time.time)
    verified: bool = False

    def to_dict(self) -> dict:
        return {
            "patch_id": self.patch_id,
            "vector_id": self.vector_id,
            "target_bot_type": self.target_bot_type,
            "technique": self.technique,
            "old_threshold": round(self.old_threshold, 1),
            "new_threshold": round(self.new_threshold, 1),
            "evaded_score": round(self.evaded_score, 1),
            "description": self.description,
            "ts": self.ts,
            "verified": self.verified,
        }


class PatchEngine:
    """
    Auto-patches detection thresholds when Shadow Bot finds a bypass.

    Each attack vector has its own threshold, starting at 75.0.
    On bypass: new_threshold = max(FLOOR, evaded_score - SAFETY_MARGIN)
    This ensures the same attack at the same evasion level will now be caught.

    The patch engine also tracks per-bot global hardening level:
    as thresholds drop, the overall detection sensitivity increases.
    """

    def __init__(self):
        self._thresholds: dict[str, float] = defaultdict(lambda: INITIAL_THRESHOLD)
        self._patches: deque[PatchRecord] = deque(maxlen=200)
        self._patch_count: int = 0
        self._per_bot_patches: dict[str, int] = defaultdict(int)

    # ── Public API ────────────────────────────────────────────────────────────

    def get_threshold(self, vector_id: str) -> float:
        return self._thresholds[vector_id]

    def apply_patch(self, result: AttackResult, vector: AttackVector) -> PatchRecord:
        old_t = self._thresholds[vector.vector_id]
        new_t = max(THRESHOLD_FLOOR, result.evaded_score - SAFETY_MARGIN)

        # Only patch if threshold would actually tighten
        if new_t >= old_t:
            new_t = max(THRESHOLD_FLOOR, old_t - 8.0)

        self._thresholds[vector.vector_id] = new_t
        self._patch_count += 1
        self._per_bot_patches[result.target_bot_type] += 1

        patch = PatchRecord(
            patch_id=f"PATCH-{self._patch_count:04d}",
            vector_id=vector.vector_id,
            target_bot_type=result.target_bot_type,
            technique=result.technique,
            old_threshold=old_t,
            new_threshold=new_t,
            evaded_score=result.evaded_score,
            description=vector.patch_description,
        )
        self._patches.appendleft(patch)
        return patch

    def mark_verified(self, patch_id: str) -> None:
        for p in self._patches:
            if p.patch_id == patch_id:
                p.verified = True
                return

    def get_patches(self, n: int = 20) -> list[dict]:
        return [p.to_dict() for p in list(self._patches)[:n]]

    def get_hardening_summary(self) -> dict:
        """Returns per-bot threshold deltas — shows how much each bot has been hardened."""
        summary: dict[str, dict] = {}
        for vid, threshold in self._thresholds.items():
            # vector_id format: "SANC-001" → target is first 4 chars
            bot_prefix = vid[:4]
            bot_map = {
                "SANC": "SANCTIONS_BOT",
                "CARG": "CARGO_BOT",
                "FXBT": "FX_BOT",
                "COMP": "COMPLIANCE_BOT",
                "ORBT": "SATELLITE_ANALYTICS",
                "SUCC": "SUCCESSION_BOT",
            }
            bot = bot_map.get(bot_prefix, "UNKNOWN")
            if bot not in summary:
                summary[bot] = {"min_threshold": threshold, "patches": self._per_bot_patches[bot]}
            else:
                summary[bot]["min_threshold"] = min(summary[bot]["min_threshold"], threshold)
        return summary
