"""
Pydantic Schemas — Strict API Validation Layer

All data crossing the API boundary is validated here.
Pydantic guarantees type safety and prevents internal state leakage
into external responses.  No raw dicts should leave the server unchecked.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator

# ── Bot & Swarm ───────────────────────────────────────────────────────────────


class BotStatusSchema(BaseModel):
    bot_id: str
    bot_type: str
    personality_label: str = ""
    last_score: float = Field(ge=0.0, le=100.0)
    is_anomaly: bool
    healthy: bool
    last_summary: str = ""
    threshold: float = Field(ge=0.0, le=100.0, default=75.0)
    status: str = "HEALTHY"


class SwarmStatusSchema(BaseModel):
    status: str = "starting"
    uptime_seconds: int = Field(ge=0, default=0)
    total_bots: int = Field(ge=0, default=0)
    healthy_bots: int = Field(ge=0, default=0)
    active_alerts: int = Field(ge=0, default=0)
    top_threat: Optional[str] = None
    top_score: float = Field(ge=0.0, le=100.0, default=0.0)
    consensus_rounds: int = Field(ge=0, default=0)
    healing_events: int = Field(ge=0, default=0)
    mode: str = "NORMAL"
    fear_index: float = Field(ge=0.0, le=100.0, default=0.0)
    safe_haven: bool = False


# ── Consensus ─────────────────────────────────────────────────────────────────


class ConsensusVoteSchema(BaseModel):
    node_id: str
    node_type: str
    vote: bool
    weight: float = Field(gt=0.0)
    confidence: float = Field(ge=0.0, le=1.0)
    evidence_hash: str = Field(min_length=64, max_length=64)
    latency_ms: float = Field(ge=0.0)
    ts: float


class ConsensusRoundSchema(BaseModel):
    round_id: str
    transaction_id: str
    threat_type: str
    initiator_bot: str
    initiator_score: float = Field(ge=0.0, le=100.0)
    votes: list[ConsensusVoteSchema]
    quorum_reached: bool
    yes_count: int = Field(ge=0)
    weighted_score: float = Field(ge=0.0, le=1.0)
    final_verdict: bool
    merkle_root: str = Field(min_length=64, max_length=64)
    commit_latency_ms: float = Field(ge=0.0)
    ts: float

    @field_validator("votes")
    @classmethod
    def votes_not_empty(cls, v: list) -> list:
        if not v:
            raise ValueError("votes cannot be empty")
        return v


class ConsensusStatsSchema(BaseModel):
    total_rounds: int = Field(ge=0)
    quorum_rate: float = Field(ge=0.0, le=1.0)
    avg_latency_ms: float = Field(ge=0.0)
    avg_weighted_score: float = Field(ge=0.0, le=1.0)
    node_weights: dict[str, float]
    quorum_threshold: int
    total_nodes: int
    total_weight: float


# ── Sovereign Ledger ──────────────────────────────────────────────────────────


class LedgerEntrySchema(BaseModel):
    sequence: int = Field(ge=0)
    round_id: str
    merkle_root: str = Field(min_length=64, max_length=64)
    prev_entry_hash: str = Field(min_length=64, max_length=64)
    entry_hash: str = Field(min_length=64, max_length=64)
    verdict: bool
    threat_type: str
    initiator: str
    quorum_reached: bool
    weighted_score: float = Field(ge=0.0, le=1.0)
    yes_votes: int = Field(ge=0)
    total_votes: int = Field(ge=0)
    ts: float


class LedgerIntegritySchema(BaseModel):
    valid: bool
    chain_length: int = Field(ge=0)
    broken_at: Optional[int] = None
    reason: Optional[str] = None
    head_hash: str


class LedgerStateSchema(BaseModel):
    chain_length: int = Field(ge=0)
    head_hash: str
    integrity: LedgerIntegritySchema
    entries: list[LedgerEntrySchema]


class LedgerProofSchema(BaseModel):
    entry: LedgerEntrySchema
    proof: dict


# ── Cases ─────────────────────────────────────────────────────────────────────


class CaseSchema(BaseModel):
    id: str
    bot_type: str
    score: float = Field(ge=0.0, le=100.0)
    summary: str = ""
    status: str = "OPEN"
    notes: str = ""
    created_at: float
    updated_at: float


# ── Alerts ────────────────────────────────────────────────────────────────────


class AlertSchema(BaseModel):
    alert_id: str
    bot_id: str
    bot_type: str
    score: float = Field(ge=0.0, le=100.0)
    threshold: float = Field(ge=0.0, le=100.0)
    severity: str
    message: str
    ts: float
    acknowledged: bool = False


# ── Memory / RAG ─────────────────────────────────────────────────────────────


class PrecedentSchema(BaseModel):
    id: str
    document: str
    similarity: float = Field(ge=0.0, le=1.0, default=0.0)
    metadata: dict = {}


class MemoryQueryResponseSchema(BaseModel):
    query: str
    answer: str
    precedents: list[PrecedentSchema]
    confidence: float = Field(ge=0.0, le=1.0)
    top_match: Optional[str] = None  # e.g. "WIRECARD 2020"
    top_similarity: float = 0.0
