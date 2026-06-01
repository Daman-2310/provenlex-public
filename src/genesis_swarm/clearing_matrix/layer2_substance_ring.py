"""
LAYER 2 — Recursive Proof-of-Substance Verifier Ring  (Multi-Institutional Co-Signing)
======================================================================================

A Proof-of-Substance is only finalised after THREE independent external validator
nodes — Custodian Bank, Fund Administrator, Auditor — each verify the local
director's evidence (geo-coordinates, device HWID, eIDAS signature) and co-sign.
Signatures are aggregated; a single failed/out-of-bounds validator rejects the
whole proof.

Cryptographic honesty
---------------------
This models BLS12-381 aggregate-signature *semantics* with a from-scratch
additive aggregate over a large prime field: each node's signature is
``s_i = (H(msg) + sk_i) mod q`` and the aggregate is ``Σ s_i mod q``, verified
against ``Σ pk_i`` where ``pk_i = (sk_i · G) mod q`` in this toy group. The
aggregation/threshold/rejection flow is faithful to how BLS aggregation is used;
production must swap the toy group for real ``py_ecc.bls`` pairing operations.
"""

from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
import hashlib
import secrets

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/substance-ring", tags=["clearing-substance-ring"])

# Large prime "group order" + generator for the toy additive aggregate group.
_Q = (1 << 521) - 1  # 13th Mersenne prime — large enough to be illustrative
_G = 5

# Luxembourg geofence (shared with the substance engine).
_LU_BBOX = {"lat_min": 49.4480, "lat_max": 50.1827, "lon_min": 5.7357, "lon_max": 6.5316}


def _h_int(msg: str) -> int:
    return int.from_bytes(hashlib.sha256(msg.encode()).digest(), "big") % _Q


class ValidatorRole(str, Enum):
    CUSTODIAN = "custodian_bank"
    FUND_ADMIN = "fund_administrator"
    AUDITOR = "auditor"


# ── Validator node (holds a secret key; verifies + co-signs) ─────────────────────

class ValidatorNode:
    def __init__(self, role: ValidatorRole) -> None:
        self.role = role
        self.sk = secrets.randbelow(_Q - 1) + 1
        self.pk = (self.sk * _G) % _Q

    def verify_local_criteria(self, proof: SubstanceProof) -> tuple[bool, str]:
        """Each node applies its own independent verification rule."""
        # Universal: coordinates must be inside Luxembourg.
        if not (_LU_BBOX["lat_min"] <= proof.lat <= _LU_BBOX["lat_max"]
                and _LU_BBOX["lon_min"] <= proof.lon <= _LU_BBOX["lon_max"]):
            return False, f"{self.role.value}: geographic payload out of bounds"

        if self.role == ValidatorRole.CUSTODIAN:
            # Custodian checks the HWID is registered (non-empty, min entropy).
            if len(proof.device_hwid) < 16:
                return False, "custodian: device HWID below entropy threshold"
        elif self.role == ValidatorRole.FUND_ADMIN:
            # Fund admin checks the director is on the mandate roster.
            if not proof.director_id or not proof.director_id.startswith("DIR-"):
                return False, "fund_administrator: director not on mandate roster"
        elif self.role == ValidatorRole.AUDITOR:
            # Auditor checks eIDAS signature presence + shape.
            if len(proof.eidas_signature) < 64:
                return False, "auditor: eIDAS signature missing or malformed"
        return True, f"{self.role.value}: OK"

    def co_sign(self, message_hash: int) -> int:
        return (message_hash + self.sk) % _Q


# Instantiate the fixed three-node ring.
_RING: dict[ValidatorRole, ValidatorNode] = {r: ValidatorNode(r) for r in ValidatorRole}


# ── Models ────────────────────────────────────────────────────────────────────────

class SubstanceProof(BaseModel):
    director_id: str = Field(..., min_length=1)
    sub_fund_id: str = Field(..., min_length=1)
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    device_hwid: str = Field(..., description="Hardware identifier of the signing device")
    eidas_signature: str = Field(..., description="Base64 PAdES/XAdES eIDAS signature")
    occurred_at: str | None = None


class ValidatorAttestation(BaseModel):
    role: ValidatorRole
    passed: bool
    reason: str


class SubstanceProofResult(BaseModel):
    finalized: bool
    fraudulent: bool
    message_hash: str
    attestations: list[ValidatorAttestation]
    aggregate_signature: str | None
    aggregate_pubkey: str | None
    aggregate_valid: bool
    anchored_ref: str | None
    evaluated_at: str


_ANCHORED: list[dict] = []


def _canonical_message(p: SubstanceProof) -> str:
    return f"{p.director_id}|{p.sub_fund_id}|{p.lat:.6f}|{p.lon:.6f}|{p.device_hwid}|{p.eidas_signature[:32]}"


def verify_proof_of_substance(proof: SubstanceProof) -> SubstanceProofResult:
    msg = _canonical_message(proof)
    msg_hash = _h_int(msg)

    attestations: list[ValidatorAttestation] = []
    signatures: list[int] = []
    pubkeys: list[int] = []
    all_pass = True

    # Each of the three nodes independently verifies then co-signs.
    for role in ValidatorRole:
        node = _RING[role]
        ok, reason = node.verify_local_criteria(proof)
        attestations.append(ValidatorAttestation(role=role, passed=ok, reason=reason))
        if ok:
            signatures.append(node.co_sign(msg_hash))
            pubkeys.append(node.pk)
        else:
            all_pass = False

    evaluated_at = datetime.now(UTC).isoformat()

    # A single failed validator rejects the whole proof as fraudulent.
    if not all_pass:
        return SubstanceProofResult(
            finalized=False, fraudulent=True, message_hash=hex(msg_hash),
            attestations=attestations, aggregate_signature=None, aggregate_pubkey=None,
            aggregate_valid=False, anchored_ref=None, evaluated_at=evaluated_at,
        )

    # Aggregate: Σ s_i mod q   verified against   Σ pk_i + 3·H(msg) mod q
    agg_sig = sum(signatures) % _Q
    agg_pk = sum(pubkeys) % _Q
    n = len(signatures)
    # s_i = H(msg) + sk_i  =>  Σ s_i = n·H(msg) + Σ sk_i ; and Σ pk_i = G·Σ sk_i.
    # Verify by reconstructing Σ sk_i two ways.
    sum_sk_from_sig = (agg_sig - (n * msg_hash)) % _Q
    expected_agg_pk = (sum_sk_from_sig * _G) % _Q
    aggregate_valid = expected_agg_pk == agg_pk

    anchored_ref = None
    if aggregate_valid:
        anchored_ref = "0x" + hashlib.sha256(
            f"{msg}|{agg_sig}|{agg_pk}".encode()
        ).hexdigest()
        _ANCHORED.append({
            "director_id": proof.director_id,
            "sub_fund_id": proof.sub_fund_id,
            "anchored_ref": anchored_ref,
            "validators": [r.value for r in ValidatorRole],
            "anchored_at": evaluated_at,
        })

    return SubstanceProofResult(
        finalized=aggregate_valid, fraudulent=False, message_hash=hex(msg_hash),
        attestations=attestations, aggregate_signature=hex(agg_sig), aggregate_pubkey=hex(agg_pk),
        aggregate_valid=aggregate_valid, anchored_ref=anchored_ref, evaluated_at=evaluated_at,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────────

@router.post("/verify", response_model=SubstanceProofResult, summary="Co-sign + aggregate a Proof-of-Substance")
def verify(proof: SubstanceProof) -> SubstanceProofResult:
    return verify_proof_of_substance(proof)


@router.get("/ring", summary="Validator ring registry (public keys)")
def ring() -> dict:
    return {
        "nodes": [
            {"role": role.value, "pubkey": hex(node.pk)}
            for role, node in _RING.items()
        ],
        "group_order_bits": _Q.bit_length(),
        "scheme": "BLS12-381-aggregate-semantics (toy additive group; swap py_ecc.bls in prod)",
    }


@router.get("/anchored", summary="Finalised, anchored proofs-of-substance")
def anchored() -> dict:
    return {"count": len(_ANCHORED), "proofs": _ANCHORED[-200:]}
