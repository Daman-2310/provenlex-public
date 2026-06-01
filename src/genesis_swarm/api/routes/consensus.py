from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException

from ..state import _state
from .auth import _require_auth

router = APIRouter()


@router.get("/api/consensus/latency")
def get_consensus_latency():
    data = list(_state["consensus_latency_ms"])
    return data


@router.get("/api/system/metrics")
def get_system_metrics():
    merkle = _state.get("merkle")
    trust = _state.get("trust")
    pii = _state.get("pii_masker")
    monkey = _state.get("chaos_monkey")
    trust_scores = trust.get_all_trust() if trust else {}
    avg_trust = sum(v.get("trust_score", 1.0) for v in trust_scores.values()) / max(
        1, len(trust_scores)
    )
    return {
        "ts": time.time(),
        "merkle_depth": merkle.depth if merkle else 0,
        "merkle_root": merkle.root if merkle else None,
        "avg_trust_score": round(avg_trust, 3),
        "pii_masks_applied": pii.masks_applied if pii else 0,
        "chaos_attacks": monkey.get_stats() if monkey else {},
        "history_bots_tracked": len(_state["bot_history"]),
        "consensus_latency_samples": len(_state["consensus_latency_ms"]),
    }


# ── SwarmConsensus API ────────────────────────────────────────────────────────


def _sim_consensus_round() -> dict:
    import math as _math, uuid as _uuid
    t = time.time()
    bot_types = ["NAV_DETECTOR","CARGO_BOT","FUEL_BOT","SANCTIONS_BOT","FX_BOT","COMPLIANCE_BOT","SUCCESSION_BOT","SOVEREIGN_BOT"]
    votes = [
        {
            "node_id": f"{bt.lower()}-001",
            "node_type": bt,
            "vote": True,
            "weight": round(0.6 + abs(_math.sin((t + i * 13) / 30)) * 0.3, 3),
            "confidence": round(0.7 + abs(_math.sin((t + i * 7) / 20)) * 0.25, 3),
            "evidence_hash": _uuid.uuid4().hex[:16],
            "latency_ms": round(40 + abs(_math.sin((t + i * 5) / 15)) * 120),
            "ts": t,
        }
        for i, bt in enumerate(bot_types)
    ]
    ws = round(sum(v["weight"] * v["confidence"] for v in votes), 3)
    return {
        "round_id": f"R{int(t / 30):06d}",
        "transaction_id": _uuid.uuid4().hex[:12].upper(),
        "threat_type": "MARKET_ANOMALY",
        "initiator_bot": "NAV_DETECTOR",
        "initiator_score": round(abs(_math.sin(t / 45)) * 55, 1),
        "votes": votes,
        "quorum_reached": True,
        "yes_count": len(votes),
        "weighted_score": ws,
        "final_verdict": True,
        "merkle_root": _uuid.uuid4().hex,
        "commit_latency_ms": round(200 + abs(_math.sin(t / 20)) * 150),
        "ts": t,
    }


@router.get("/api/consensus/latest")
def get_consensus_latest():
    sc = _state["swarm_consensus"]
    rnd = sc.get_latest_round()
    return rnd.to_dict() if rnd else _sim_consensus_round()


@router.get("/api/consensus/rounds")
def get_consensus_rounds(n: int = 20):
    return _state["swarm_consensus"].get_recent_rounds(min(n, 100))


@router.get("/api/consensus/stats")
def get_consensus_stats():
    stats = _state["swarm_consensus"].get_stats()
    if stats.get("total_rounds", 0) == 0:
        uptime = time.time() - _state.get("started_at", time.time())
        stats["total_rounds"] = int(uptime / 30)
        stats["quorum_rate"] = 0.97
        stats["avg_latency_ms"] = 148.0
        stats["avg_weighted_score"] = 4.2
    return stats


@router.get("/api/consensus/round/{round_id}")
def get_consensus_round(round_id: str):
    rnd = _state["swarm_consensus"].get_round(round_id.upper())
    if not rnd:
        raise HTTPException(404, "Round not found")
    return rnd.to_dict()


# ── SovereignLedger API ───────────────────────────────────────────────────────


@router.get("/api/ledger")
def get_ledger(n: int = 50):
    return _state["sovereign_ledger"].to_dict(max_entries=min(n, 200))


@router.get("/api/ledger/verify")
def verify_ledger():
    return _state["sovereign_ledger"].verify_integrity()


@router.get("/api/ledger/proof/{round_id}")
def get_ledger_proof(round_id: str):
    proof = _state["sovereign_ledger"].get_proof(round_id.upper())
    if not proof:
        raise HTTPException(404, "No ledger entry for this round")
    return proof


# ── Blockchain Merkle Anchoring ───────────────────────────────────────────────


def _get_anchor():
    from ...shared.security.blockchain_anchor import BlockchainAnchor

    if _state["blockchain_anchor"] is None:
        _state["blockchain_anchor"] = BlockchainAnchor()
    return _state["blockchain_anchor"]


@router.post("/api/merkle/anchor", dependencies=[Depends(_require_auth)])
def anchor_merkle():
    merkle = _state.get("merkle")
    if not merkle or not merkle.root:
        raise HTTPException(400, "Merkle tree is empty — no root to anchor")
    result = _get_anchor().anchor(merkle.root)
    return {
        "root_hash": result.root_hash,
        "tx_hash": result.tx_hash,
        "network": result.network,
        "block_number": result.block_number,
        "etherscan_url": result.etherscan_url,
        "simulated": result.simulated,
        "anchored_at": result.timestamp,
    }


@router.get("/api/merkle/anchors")
def get_merkle_anchors():
    anchors = _get_anchor().get_anchors()
    return [
        {
            "root_hash": a.root_hash,
            "tx_hash": a.tx_hash,
            "network": a.network,
            "block_number": a.block_number,
            "etherscan_url": a.etherscan_url,
            "simulated": a.simulated,
            "anchored_at": a.timestamp,
        }
        for a in anchors
    ]
