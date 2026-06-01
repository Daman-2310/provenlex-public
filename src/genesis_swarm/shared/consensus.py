from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field

log = logging.getLogger(__name__)


@dataclass
class ConsensusVote:
    bot_id: str
    bot_type: str
    round_id: str
    vote: str  # CORROBORATE | CONTRADICT | NEUTRAL | ABSTAIN
    confidence: float  # 0.0 – 1.0


@dataclass
class ConsensusResult:
    round_id: str
    consensus: str  # CONFIRMED | REJECTED | INCONCLUSIVE
    corroborate: int
    contradict: int
    neutral: int
    duration_ms: float
    byzantine_flags: list[str] = field(default_factory=list)


class ConsensusEngine:
    def __init__(self, total_bots: int = 11, quorum: int = 7, timeout: float = 3.0):
        self.total_bots = total_bots
        self.quorum = quorum
        self.timeout = timeout
        self._rounds: dict[str, dict] = {}
        self._byzantine: set[str] = set()
        self._lock = asyncio.Lock()

    async def open_round(self, initiator_id: str, context: dict) -> str:
        round_id = f"CR-{uuid.uuid4().hex[:8].upper()}"
        self._rounds[round_id] = {
            "initiator": initiator_id,
            "context": context,
            "votes": {},
            "opened_at": time.monotonic(),
            "result": None,
            "event": asyncio.Event(),
        }
        log.info("[Consensus] Round %s opened by %s", round_id, initiator_id)
        return round_id

    async def register_vote(self, round_id: str, vote: ConsensusVote) -> ConsensusResult | None:
        async with self._lock:
            r = self._rounds.get(round_id)
            if not r or r["result"]:
                return None

            # Byzantine: same bot voting twice with opposite votes
            if vote.bot_id in r["votes"]:
                prev = r["votes"][vote.bot_id]
                if prev.vote != vote.vote:
                    self._byzantine.add(vote.bot_id)
                    log.warning("[Consensus] Byzantine behaviour from %s", vote.bot_id)
                    return None

            r["votes"][vote.bot_id] = vote

            corr = [v for v in r["votes"].values() if v.vote == "CORROBORATE"]
            cont = [v for v in r["votes"].values() if v.vote == "CONTRADICT"]

            if (
                len(corr) >= self.quorum
                or len(cont) >= self.quorum
                or len(r["votes"]) >= self.total_bots
            ):
                return self._finalise(round_id)
            return None

    def _finalise(self, round_id: str) -> ConsensusResult:
        r = self._rounds[round_id]
        votes = list(r["votes"].values())
        corr = [v for v in votes if v.vote == "CORROBORATE"]
        cont = [v for v in votes if v.vote == "CONTRADICT"]
        neut = [v for v in votes if v.vote in ("NEUTRAL", "ABSTAIN")]

        corr_w = sum(v.confidence for v in corr)
        cont_w = sum(v.confidence for v in cont)

        if corr_w > cont_w and len(corr) >= 2:
            consensus = "CONFIRMED"
        elif cont_w > corr_w and len(cont) >= 2:
            consensus = "REJECTED"
        else:
            consensus = "INCONCLUSIVE"

        duration_ms = (time.monotonic() - r["opened_at"]) * 1000
        result = ConsensusResult(
            round_id=round_id,
            consensus=consensus,
            corroborate=len(corr),
            contradict=len(cont),
            neutral=len(neut),
            duration_ms=duration_ms,
            byzantine_flags=list(self._byzantine),
        )
        r["result"] = result
        r["event"].set()
        log.info("[Consensus] Round %s → %s (%.0fms)", round_id, consensus, duration_ms)
        return result

    async def wait_for_result(self, round_id: str) -> ConsensusResult:
        r = self._rounds.get(round_id)
        if not r:
            raise KeyError(f"Unknown round {round_id}")
        try:
            await asyncio.wait_for(r["event"].wait(), timeout=self.timeout)
        except asyncio.TimeoutError:
            if not r["result"]:
                return self._finalise(round_id)
        return r["result"]

    def byzantine_nodes(self) -> set[str]:
        return set(self._byzantine)
