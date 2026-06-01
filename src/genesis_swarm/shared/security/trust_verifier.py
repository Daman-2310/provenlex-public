from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass
class TrustRecord:
    """Accumulated trust metrics for a single bot.

    Attributes
    ----------
    bot_id:
        Unique identifier of the bot.
    total_votes:
        Total number of consensus votes cast by this bot.
    correct_votes:
        Number of votes that aligned with the final consensus decision.
    byzantine_flags:
        Number of times this bot was flagged for Byzantine behaviour.
    last_verified:
        Unix timestamp (float) of the most-recent vote recording.
    """

    bot_id: str
    total_votes: int = 0
    correct_votes: int = 0
    byzantine_flags: int = 0
    last_verified: float = field(default_factory=time.time)


class TrustVerifier:
    """Bot trust scoring for BFT quorum health.

    The trust score formula is:
    ``(correct_votes / max(1, total_votes)) * (1 - 0.3 * min(1, byzantine_flags / 3))``

    A score of 1.0 represents a perfectly reliable bot with no Byzantine
    flags.  Three or more flags apply the full 30 % penalty cap.
    """

    def __init__(self) -> None:
        self._records: dict[str, TrustRecord] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def record_vote(
        self,
        bot_id: str,
        was_correct: bool,
        was_byzantine: bool,
    ) -> None:
        """Update the trust record for *bot_id* after a consensus round.

        Parameters
        ----------
        bot_id:
            The bot whose vote is being recorded.
        was_correct:
            ``True`` when the bot's vote matched the final consensus outcome.
        was_byzantine:
            ``True`` when the bot was flagged as Byzantine in this round.
        """
        record = self._get_or_create(bot_id)
        record.total_votes += 1
        if was_correct:
            record.correct_votes += 1
        if was_byzantine:
            record.byzantine_flags += 1
        record.last_verified = time.time()

    def get_trust_score(self, bot_id: str) -> float:
        """Return a trust score in ``[0.0, 1.0]`` for *bot_id*.

        Bots with no voting history start at a score of ``1.0`` (optimistic
        prior — they have not yet demonstrated untrustworthiness).
        """
        if bot_id not in self._records:
            return 1.0
        record = self._records[bot_id]
        accuracy = record.correct_votes / max(1, record.total_votes)
        penalty = 0.3 * min(1.0, record.byzantine_flags / 3)
        return max(0.0, accuracy * (1.0 - penalty))

    def get_all_trust(self) -> dict[str, dict]:
        """Return a snapshot of every bot's trust information as plain dicts."""
        result: dict[str, dict] = {}
        for bot_id, record in self._records.items():
            result[bot_id] = {
                "bot_id": bot_id,
                "total_votes": record.total_votes,
                "correct_votes": record.correct_votes,
                "byzantine_flags": record.byzantine_flags,
                "last_verified": record.last_verified,
                "trust_score": self.get_trust_score(bot_id),
            }
        return result

    def is_trusted(self, bot_id: str, threshold: float = 0.6) -> bool:
        """Return ``True`` when *bot_id*'s trust score meets *threshold*."""
        return self.get_trust_score(bot_id) >= threshold

    def get_quorum_health(self, bot_ids: list[str]) -> dict:
        """Assess quorum health for the supplied set of *bot_ids*.

        Returns
        -------
        dict with keys:
            ``trusted_count`` – number of trusted bots (score ≥ 0.6).
            ``total``         – total bots assessed.
            ``healthy``       – ``True`` when more than 2/3 are trusted
                                (BFT requirement: < 1/3 faulty).
            ``min_trust``     – lowest individual trust score.
            ``avg_trust``     – mean trust score across all supplied bots.
        """
        if not bot_ids:
            return {
                "trusted_count": 0,
                "total": 0,
                "healthy": False,
                "min_trust": 0.0,
                "avg_trust": 0.0,
            }

        scores = [self.get_trust_score(bid) for bid in bot_ids]
        trusted_count = sum(1 for s in scores if s >= 0.6)
        total = len(bot_ids)
        healthy = trusted_count / total > 2 / 3
        return {
            "trusted_count": trusted_count,
            "total": total,
            "healthy": healthy,
            "min_trust": round(min(scores), 4),
            "avg_trust": round(sum(scores) / total, 4),
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_or_create(self, bot_id: str) -> TrustRecord:
        if bot_id not in self._records:
            self._records[bot_id] = TrustRecord(bot_id=bot_id)
        return self._records[bot_id]
