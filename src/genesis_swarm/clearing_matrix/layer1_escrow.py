"""
LAYER 1 — Programmatic Escrow Circuit Breaker  (Atomic Transaction Isolation)
=============================================================================

Listens for tokenised-transfer ingress events, evaluates each against AIFMD II
leverage caps + sanctions lists, and dispatches an on-chain ``lock`` to the
GenesisEscrowGateway contract *before* settlement finality whenever a breach is
detected — otherwise dispatches ``release``.

The on-chain dispatch is abstracted behind ``ChainClient`` so the in-memory
default can be swapped for a real ``web3.py`` signer (BFT multi-sig) in prod.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import UTC, datetime
from enum import Enum
import hashlib
import json
import time

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/escrow", tags=["clearing-escrow"])

# ── Compliance reference data (mirrors lux_regtech.aifmd_monitor) ───────────────

LEVERAGE_CAP_CLOSED = 3.00
LEVERAGE_CAP_OPEN = 1.75
# Minimal demonstrative sanctions set; production wires OFAC/EU consolidated list.
SANCTIONS_BLOCKLIST: set[str] = {
    "0x0000000000000000000000000000000000000bad",
    "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
}


class HoldStatus(str, Enum):
    HELD = "held"
    RELEASED = "released"
    LOCKED = "locked"


# ── On-chain client abstraction ─────────────────────────────────────────────────

class ChainClient(ABC):
    @abstractmethod
    def dispatch_resolution(self, hold_id: str, release: bool, compliance_ref: str) -> str:
        """Submit releaseOrLockTransaction; returns a tx hash."""


class InMemoryChainClient(ChainClient):
    """Deterministic stand-in that records dispatched resolutions."""

    def __init__(self) -> None:
        self.dispatched: list[dict] = []

    def dispatch_resolution(self, hold_id: str, release: bool, compliance_ref: str) -> str:
        tx_hash = "0x" + hashlib.sha256(
            f"{hold_id}|{release}|{compliance_ref}|{time.time_ns()}".encode()
        ).hexdigest()
        self.dispatched.append({
            "tx_hash": tx_hash,
            "hold_id": hold_id,
            "action": "release" if release else "lock",
            "compliance_ref": compliance_ref,
            "submitted_at": datetime.now(UTC).isoformat(),
        })
        return tx_hash


_CHAIN: ChainClient = InMemoryChainClient()
_HOLDS: dict[str, dict] = {}


# ── Models ──────────────────────────────────────────────────────────────────────

class FundContext(BaseModel):
    fund_id: str
    structure: str = Field(..., pattern="^(open_ended|closed_ended)$")
    nav_eur: float = Field(..., gt=0)
    gross_exposure_eur: float = Field(..., ge=0)


class IngressTransaction(BaseModel):
    hold_id: str = Field(..., min_length=1)
    token: str = Field("0x0", description="ERC-3643/ERC-20 address; 0x0 == native")
    sender: str
    beneficiary: str
    amount_eur: float = Field(..., gt=0)
    adds_exposure_eur: float = Field(0.0, ge=0, description="Commitment-method exposure this transfer adds")
    fund: FundContext


class ComplianceBreach(BaseModel):
    code: str
    detail: str


class EscrowDecision(BaseModel):
    hold_id: str
    action: HoldStatus
    breaches: list[ComplianceBreach]
    compliance_ref: str
    tx_hash: str
    evaluated_at: str


# ── Evaluation logic ──────────────────────────────────────────────────────────────

def _evaluate(tx: IngressTransaction) -> list[ComplianceBreach]:
    breaches: list[ComplianceBreach] = []

    # 1) Sanctions screening on both counterparties
    for role, addr in (("sender", tx.sender), ("beneficiary", tx.beneficiary)):
        if addr.lower() in SANCTIONS_BLOCKLIST:
            breaches.append(ComplianceBreach(
                code="SANCTIONS_HIT",
                detail=f"{role} address {addr} present on sanctions blocklist.",
            ))

    # 2) AIFMD II leverage cap on the post-transfer state
    cap = LEVERAGE_CAP_CLOSED if tx.fund.structure == "closed_ended" else LEVERAGE_CAP_OPEN
    post_gross = tx.fund.gross_exposure_eur + tx.adds_exposure_eur
    post_leverage = post_gross / tx.fund.nav_eur
    if post_leverage > cap + 1e-9:
        breaches.append(ComplianceBreach(
            code="LEVERAGE_CAP_BREACH",
            detail=(f"Post-transfer leverage {post_leverage:.2%} exceeds {tx.fund.structure} "
                    f"cap {cap:.0%} (€{post_gross:,.0f} / €{tx.fund.nav_eur:,.0f})."),
        ))

    # 3) Notional sanity — transfer cannot exceed NAV (gross mis-booking guard)
    if tx.amount_eur > tx.fund.nav_eur:
        breaches.append(ComplianceBreach(
            code="NOTIONAL_EXCEEDS_NAV",
            detail=f"Transfer €{tx.amount_eur:,.0f} exceeds fund NAV €{tx.fund.nav_eur:,.0f}.",
        ))

    return breaches


def _compliance_ref(tx: IngressTransaction, breaches: list[ComplianceBreach]) -> str:
    payload = json.dumps(
        {"hold_id": tx.hold_id, "breaches": [b.code for b in breaches],
         "ts": datetime.now(UTC).isoformat()},
        sort_keys=True, separators=(",", ":"),
    )
    return "0x" + hashlib.sha256(payload.encode()).hexdigest()


def process_ingress(tx: IngressTransaction) -> EscrowDecision:
    breaches = _evaluate(tx)
    release = len(breaches) == 0
    ref = _compliance_ref(tx, breaches)
    tx_hash = _CHAIN.dispatch_resolution(tx.hold_id, release, ref)
    decision = EscrowDecision(
        hold_id=tx.hold_id,
        action=HoldStatus.RELEASED if release else HoldStatus.LOCKED,
        breaches=breaches,
        compliance_ref=ref,
        tx_hash=tx_hash,
        evaluated_at=datetime.now(UTC).isoformat(),
    )
    _HOLDS[tx.hold_id] = decision.model_dump()
    return decision


# ── Endpoints ─────────────────────────────────────────────────────────────────────

@router.post("/ingress", response_model=EscrowDecision, summary="Evaluate an ingress transfer and release/lock on-chain")
def ingress(tx: IngressTransaction) -> EscrowDecision:
    return process_ingress(tx)


@router.get("/hold/{hold_id}", response_model=EscrowDecision, summary="Resolved escrow decision for a hold")
def get_hold(hold_id: str) -> EscrowDecision:
    from fastapi import HTTPException
    rec = _HOLDS.get(hold_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Unknown hold_id.")
    return EscrowDecision(**rec)


@router.get("/dispatched", summary="On-chain resolutions dispatched by the gateway")
def dispatched() -> dict:
    client = _CHAIN
    rows = getattr(client, "dispatched", [])
    return {"count": len(rows), "dispatched": rows[-200:]}
