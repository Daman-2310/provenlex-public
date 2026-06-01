"""
TransactionGateway — Pre-Execution Quorum Engine

Every financial transaction is intercepted here before execution.
The 11-agent swarm votes on whether to APPROVE or HARD_BLOCK it.
Transactions remain in PURGATORY until consensus is reached.

Transaction lifecycle:
  PENDING → PURGATORY (held while swarm votes)
           → APPROVED  (weighted quorum ≥ 72% clean)
           → HARD_BLOCK (weighted suspicion ≥ 28%)

Hard-block threshold: 28% of weighted votes flag it as suspicious.
This is conservative by design — in AML, false negatives are fatal.
"""

from __future__ import annotations

import random
import time
import uuid
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Optional

from .privacy_masker import MaskedTransaction, ZKPMasker


class TxStatus(str, Enum):
    PENDING = "PENDING"
    PURGATORY = "PURGATORY"
    APPROVED = "APPROVED"
    HARD_BLOCK = "HARD_BLOCK"


class TxType(str, Enum):
    TRANSFER = "TRANSFER"
    REDEMPTION = "REDEMPTION"
    SUBSCRIPTION = "SUBSCRIPTION"
    FX_SWAP = "FX_SWAP"
    STRUCTURED = "STRUCTURED"
    WIRE = "WIRE"


_TX_TYPES = list(TxType)

# Entity pool — fictional fund entities for mock generation
_ENTITIES = [
    "ALPHA_FUND_LU",
    "BETA_CAPITAL_LU",
    "GAMMA_HOLDINGS_LU",
    "DELTA_FEEDER_KY",
    "EPSILON_MASTER_BVI",
    "ZETA_SPV_CH",
    "ETA_TRUST_JE",
    "THETA_PARTNER_LU",
    "IOTA_NOMINEE_LI",
    "KAPPA_FUND_IE",
    "LAMBDA_PRIME_LU",
    "MU_SIGMA_HK",
    "NU_DELTA_SG",
    "XI_OMEGA_UK",
    "PI_ALPHA_US",
]

# Node weights mirrored from SwarmConsensus
_NODE_WEIGHTS: dict[str, float] = {
    "ASSET_TRACKER": 2.5,
    "SATELLITE_ANALYTICS": 2.5,
    "NAV_DETECTOR": 2.0,
    "SOVEREIGN_BOT": 2.0,
    "SANCTIONS_BOT": 2.0,
    "FX_BOT": 1.8,
    "COMPLIANCE_BOT": 1.8,
    "ADVERSARIAL_TESTER": 1.5,
    "CARGO_BOT": 1.2,
    "COMMODITY_MONITOR": 1.0,
    "SUCCESSION_BOT": 1.0,
}
_TOTAL_WEIGHT = sum(_NODE_WEIGHTS.values())  # 19.3
_HARD_BLOCK_THRESHOLD = 0.28  # 28% suspicion → HARD_BLOCK
_QUORUM_COUNT = 8


@dataclass
class GatewayVote:
    node_type: str
    weight: float
    flags_suspicious: bool  # True = node thinks tx is suspicious
    confidence: float  # 0.0–1.0
    reason: str
    latency_ms: int


@dataclass
class GatewayDecision:
    tx_id: str
    masked_tx_id: str
    status: TxStatus
    weighted_suspicion: float  # fraction of total weight that flagged suspicious
    yes_count: int  # nodes flagging suspicious
    no_count: int  # nodes clearing
    votes: list[GatewayVote]
    purgatory_ms: int  # time held in purgatory
    amount_bucket: str
    tx_type: str
    hard_block_reason: Optional[str]
    ts: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["status"] = self.status.value
        d["votes"] = [{**v, "flags_suspicious": v["flags_suspicious"]} for v in d["votes"]]
        return d


class TransactionGateway:
    """
    Intercepts transactions, runs a simulated 11-agent weighted BFT vote,
    and either approves or hard-blocks based on aggregated suspicion score.
    """

    def __init__(self, masker: Optional[ZKPMasker] = None) -> None:
        self._masker = masker or ZKPMasker()
        self._purgatory: dict[str, dict] = {}  # tx_id → raw pending tx
        self._decisions: list[GatewayDecision] = []
        self._masked_history: list[MaskedTransaction] = []
        self._approved = 0
        self._blocked = 0
        self._total = 0

    # ── Mock transaction factory ───────────────────────────────────────────────

    @staticmethod
    def generate_mock_transaction(
        force_suspicious: bool = False,
        tx_type: Optional[str] = None,
    ) -> dict:
        """Generate a realistic mock cross-border fund transaction."""
        amount = random.choice(
            [
                random.uniform(500, 9_999),  # sub-threshold (structuring bait)
                random.uniform(10_000, 99_999),  # SMALL
                random.uniform(100_000, 999_999),  # MEDIUM
                random.uniform(1_000_000, 9_999_999),  # LARGE
            ]
        )
        if force_suspicious:
            # Structuring: many small amounts from same entity
            amount = random.uniform(8_000, 9_800)

        from_entity = random.choice(_ENTITIES)
        to_entity = random.choice([e for e in _ENTITIES if e != from_entity])

        chosen_type = tx_type or random.choice(_TX_TYPES).value

        # Suspicious pattern: rapid FX swap between offshore entities
        if force_suspicious and random.random() > 0.5:
            chosen_type = TxType.FX_SWAP.value
            from_entity = random.choice(
                [e for e in _ENTITIES if "BVI" in e or "KY" in e or "JE" in e] or _ENTITIES[:3]
            )

        return {
            "tx_id": str(uuid.uuid4()),
            "from_entity": from_entity,
            "to_entity": to_entity,
            "amount": round(amount, 2),
            "tx_type": chosen_type,
            "currency": random.choice(["EUR", "USD", "GBP", "CHF"]),
            "ts": time.time(),
        }

    # ── Core gateway logic ────────────────────────────────────────────────────

    def _simulate_agent_vote(
        self,
        node_type: str,
        masked_tx: MaskedTransaction,
        pattern_analysis: dict,
        base_suspicion: float,
    ) -> GatewayVote:
        """
        Each agent evaluates the masked transaction through its domain lens.
        base_suspicion is derived from the ZKPMasker pattern analysis [0.0–1.0].
        """
        weight = _NODE_WEIGHTS[node_type]
        # Add per-node noise — specialists see different signals
        node_bias = {
            "SANCTIONS_BOT": 0.15,  # aggressive on any structured amounts
            "ASSET_TRACKER": 0.12,  # flags offshore FX swaps hard
            "SATELLITE_ANALYTICS": 0.10,  # broad pattern detector
            "ADVERSARIAL_TESTER": 0.18,  # always slightly more suspicious
            "NAV_DETECTOR": 0.08,
            "FX_BOT": 0.06 if masked_tx.tx_type == "FX_SWAP" else -0.05,
            "COMPLIANCE_BOT": 0.05,
            "SOVEREIGN_BOT": 0.04,
            "CARGO_BOT": 0.03,
            "COMMODITY_MONITOR": 0.02,
            "SUCCESSION_BOT": 0.01,
        }.get(node_type, 0.0)

        raw = base_suspicion + node_bias + random.gauss(0, 0.05)
        confidence = max(0.0, min(1.0, raw))
        flags = confidence >= 0.35  # flag if > 35% suspicion

        reasons_suspicious = [
            f"Structured amount in {masked_tx.amount_bucket} range",
            "FX_SWAP to masked entity — offshore profile",
            "Round-trip pattern detected in history",
            f"Layering chain — {masked_tx.masked_from} node in cycle",
            "High-frequency sub-threshold transfers",
        ]
        reasons_clean = [
            f"Normal {masked_tx.tx_type} — no pattern match",
            f"Amount bucket {masked_tx.amount_bucket} within norms",
            "Entity pair cleared — no history flags",
            "Transaction velocity within limits",
        ]
        reason = random.choice(reasons_suspicious if flags else reasons_clean)
        latency = int(random.gauss(120, 40))  # ~120ms per node

        return GatewayVote(
            node_type=node_type,
            weight=weight,
            flags_suspicious=flags,
            confidence=round(confidence, 4),
            reason=reason,
            latency_ms=max(20, latency),
        )

    def evaluate(self, raw_tx: dict) -> GatewayDecision:
        """
        Full gateway evaluation:
        1. Mask the transaction (PII stripped at boundary)
        2. Run ZKP pattern analysis on masked history
        3. Place in PURGATORY
        4. Collect 11 agent votes
        5. Compute weighted suspicion score
        6. APPROVE or HARD_BLOCK
        """
        self._total += 1
        tx_id = str(raw_tx.get("tx_id", uuid.uuid4()))
        t_start = time.time()

        # Step 1: Mask
        masked = self._masker.mask_transaction(raw_tx)
        self._masked_history.append(masked)

        # Step 2: Pattern analysis on masked history (last 200 txns)
        history_window = self._masked_history[-200:]
        analysis = self._masker.analyze(history_window, current_tx=masked)

        # Derive base suspicion [0.0–1.0] from pattern analysis
        risk_map = {"HIGH": 0.72, "MEDIUM": 0.42, "LOW": 0.18}
        base_suspicion = risk_map[analysis["risk_level"]]

        # Step 3: Status → PURGATORY
        self._purgatory[tx_id] = raw_tx

        # Step 4: Simulate all 11 agent votes
        votes: list[GatewayVote] = [
            self._simulate_agent_vote(node, masked, analysis, base_suspicion)
            for node in _NODE_WEIGHTS
        ]

        # Step 5: Weighted suspicion score
        suspicious_weight = sum(v.weight for v in votes if v.flags_suspicious)
        weighted_suspicion = suspicious_weight / _TOTAL_WEIGHT
        yes_count = sum(1 for v in votes if v.flags_suspicious)
        no_count = len(votes) - yes_count

        # Step 6: Decision
        purgatory_ms = int((time.time() - t_start) * 1000)
        del self._purgatory[tx_id]

        if weighted_suspicion >= _HARD_BLOCK_THRESHOLD:
            status = TxStatus.HARD_BLOCK
            self._blocked += 1
            block_reason = (
                f"Weighted suspicion {weighted_suspicion:.1%} ≥ {_HARD_BLOCK_THRESHOLD:.0%} threshold. "
                f"{yes_count}/11 agents flagged. Risk: {analysis['risk_level']}."
            )
        else:
            status = TxStatus.APPROVED
            self._approved += 1
            block_reason = None

        decision = GatewayDecision(
            tx_id=tx_id,
            masked_tx_id=masked.masked_tx_id,
            status=status,
            weighted_suspicion=round(weighted_suspicion, 4),
            yes_count=yes_count,
            no_count=no_count,
            votes=votes,
            purgatory_ms=purgatory_ms,
            amount_bucket=masked.amount_bucket,
            tx_type=masked.tx_type,
            hard_block_reason=block_reason,
        )
        self._decisions.append(decision)
        return decision

    def evaluate_batch(self, transactions: list[dict]) -> list[GatewayDecision]:
        return [self.evaluate(tx) for tx in transactions]

    # ── State accessors ───────────────────────────────────────────────────────

    def get_recent_decisions(self, limit: int = 20) -> list[dict]:
        return [d.to_dict() for d in self._decisions[-limit:]]

    def get_purgatory_queue(self) -> list[str]:
        return list(self._purgatory.keys())

    def get_stats(self) -> dict:
        decisions = self._decisions
        if not decisions:
            avg_suspicion = 0.0
            avg_purgatory = 0
        else:
            avg_suspicion = sum(d.weighted_suspicion for d in decisions) / len(decisions)
            avg_purgatory = sum(d.purgatory_ms for d in decisions) // len(decisions)

        return {
            "total_evaluated": self._total,
            "approved": self._approved,
            "hard_blocked": self._blocked,
            "block_rate_pct": round(self._blocked / max(1, self._total) * 100, 1),
            "avg_suspicion_pct": round(avg_suspicion * 100, 1),
            "avg_purgatory_ms": avg_purgatory,
            "purgatory_queue": len(self._purgatory),
            "masked_history_len": len(self._masked_history),
            "masker_stats": self._masker.get_stats(),
        }
