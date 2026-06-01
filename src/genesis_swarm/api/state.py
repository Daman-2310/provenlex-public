from __future__ import annotations

import time
from collections import deque

from ..compliance.ofac_screener import OFACScreener
from ..compliance.regulatory_parser import RegulatoryParser
from ..consensus.pbft_consensus import PBFTConsensus as SwarmConsensus
from ..consensus.sovereign_ledger import SovereignLedger
from ..gateway.transaction_gateway import TransactionGateway as _TxGateway
from ..simulations.wirecard_simulation import WirecardSimulation
from ..sovereign.sovereign_node import SovereignNode

_state: dict = {
    "commander": None,
    "bots": [],
    "remediator": None,
    "shadow_bot": None,
    "started_at": time.time(),
    "stop_event": None,
    "memory": None,  # InstitutionalMemory
    "rag": None,  # RAGEngine
    "merkle": None,  # MerkleAuditLog
    "trust": None,  # TrustVerifier
    "pii_masker": None,  # PIIMasker
    "chaos_monkey": None,  # ChaosMonkeyBot
    "audit_replayer": None,  # AuditReplayer
    "metrics": None,  # GenesisMetrics
    "bot_history": {},  # bot_type -> deque[dict] (last 200 data points)
    "consensus_latency_ms": deque(maxlen=200),
    "swarm_consensus": SwarmConsensus(),  # Weighted BFT engine
    "sovereign_ledger": SovereignLedger(),  # Immutable hash-chained ledger
    "chaos_quarantine": None,  # bot_type quarantined in chaos mode
    "tx_gateway": _TxGateway(),  # Pre-execution quorum engine
    "reg_parser": RegulatoryParser(),  # Semantic regulatory weighting
    "sovereign_node": SovereignNode(),  # Air-gap validator
    "wirecard_sim": WirecardSimulation(),
    # BlockchainAnchor (lazy-init on first use) # Historical fraud replay engine
    "blockchain_anchor": None,
    "ofac_screener": OFACScreener(auto_bootstrap=True),  # Live OFAC SDN list screener
}
_boardroom_sessions: dict[str, dict] = {}

# Prometheus-style counters (in-process; exported via /metrics)
_metrics_state: dict = {
    "consensus_rounds_total": 0,
    "alerts_total": 0,
    "api_requests_total": 0,
    "auth_failures_total": 0,
    "pdf_reports_total": 0,
}


def attach_state(
    commander,
    bots,
    remediator=None,
    shadow_bot=None,
    stop_event=None,
    memory=None,
    rag=None,
    merkle=None,
    trust=None,
    pii_masker=None,
    chaos_monkey=None,
    audit_replayer=None,
    metrics=None,
) -> None:
    _state["commander"] = commander
    _state["bots"] = bots
    _state["remediator"] = remediator
    _state["shadow_bot"] = shadow_bot
    _state["started_at"] = time.time()
    _state["stop_event"] = stop_event
    _state["memory"] = memory
    _state["rag"] = rag
    _state["merkle"] = merkle
    _state["trust"] = trust
    _state["pii_masker"] = pii_masker
    _state["chaos_monkey"] = chaos_monkey
    _state["audit_replayer"] = audit_replayer
    _state["metrics"] = metrics
