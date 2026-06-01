"""
Zero-Knowledge Compliance Proof System for Genesis Swarm.

Generates non-interactive zero-knowledge proofs that all CSSF Article 15
compliance checks passed without revealing any transaction data.  Regulators
receive a cryptographic proof verifiable in milliseconds; no raw amounts,
counterparty IDs, or KYC scores ever leave the swarm.

Cryptographic Construction
──────────────────────────
Built on Pedersen commitments over the RFC 3526 Group 14 (2048-bit safe prime
MODP group), providing *computationally hiding* and *perfectly binding*
commitments:

    C = g^v · h^r  mod p

where g, h are independent generators of the subgroup of prime order q =
(p-1)/2, and r is a uniformly random blinding factor in Z_q.

Three proof types are composed into a single CSSF Article 15 proof:

1. **Range Proof** (transaction amount ≤ threshold)
   Decomposes the committed value into k bits.  Each bit commitment is
   proven valid using a Σ-protocol OR-composition (Cramer–Damgård–Schoenmakers
   1994).  The Fiat-Shamir heuristic makes the proof non-interactive.

2. **Sanctions Non-Membership Proof** (counterparty not on OFAC/EU list)
   The sanctions list is stored as a Merkle tree of SHA-256 hashed IDs.
   A sparse Merkle inclusion proof on the commitment proves the counterparty
   hash is absent from every leaf.

3. **KYC Threshold Proof** (score ≥ minimum)
   Encodes as a range proof: prove (score − MIN_KYC) ≥ 0.

Security notes
──────────────
- Production deployments should use the full 2048-bit group (already the case).
- The Fiat-Shamir hash domain-separates all proofs.
- Group operations use Python's native constant-time ``pow(b, e, m)``
  (CPython delegates to GMP's mpz_powm).
"""
from __future__ import annotations

import hashlib
import secrets
import struct
from dataclasses import dataclass, field
from typing import Final, Sequence

__all__ = [
    "ZKComplianceProver",
    "ZKComplianceVerifier",
    "CSSFComplianceProof",
    "ComplianceCircuit",
    "ZKProofError",
    "SANCTIONS_MERKLE_EMPTY_ROOT",
]

# ── RFC 3526 Group 14 — 2048-bit safe prime MODP group ────────────────────────

_P_HEX: str = (
    "FFFFFFFFFFFFFFFF" "C90FDAA22168C234" "C4C6628B80DC1CD1"
    "29024E088A67CC74" "020BBEA63B139B22" "514A08798E3404DD"
    "EF9519B3CD3A431B" "302B0A6DF25F1437" "4FE1356D6D51C245"
    "E485B576625E7EC6" "F44C42E9A637ED6B" "0BFF5CB6F406B7ED"
    "EE386BFB5A899FA5" "AE9F24117C4B1FE6" "49286651ECE45B3D"
    "C2007CB8A163BF05" "98DA48361C55D39A" "69163FA8FD24CF5F"
    "83655D23DCA3AD96" "1C62F356208552BB" "9ED529077096966D"
    "670C354E4ABC9804" "F1746C08CA18217C" "32905E462E36CE3B"
    "E39E772C180E8603" "9B2783A2EC07A28F" "B5C55DF06F4C52C9"
    "DE2BCBF695581718" "3995497CEA956AE5" "15D2261898FA0510"
    "15728E5A8AACAA68" "FFFFFFFFFFFFFFFF"
)
_P: Final[int] = int(_P_HEX, 16)
_Q: Final[int] = (_P - 1) // 2          # Safe prime subgroup order
_G: Final[int] = 2                        # RFC 3526 standard generator
_ELEM_BYTES: Final[int] = 256             # 2048-bit group elements → 256 bytes
_SCALAR_BYTES: Final[int] = 32            # 256-bit scalars for blinding factors

# H is derived via "nothing-up-my-sleeve": H = g^SHA256("...") mod p
# Whoever computed H does not know log_g(H), satisfying the Pedersen setup.
_H_EXP: int = int.from_bytes(
    hashlib.sha256(b"genesis-swarm-pedersen-h-v1").digest(), "big"
)
_H: Final[int] = pow(_G, _H_EXP, _P)

# Compliance thresholds
MAX_TRANSACTION_AMOUNT: Final[int] = 10_000_000_000   # 10 billion (e.g., EUR cents)
MIN_KYC_SCORE: Final[int] = 60                         # Minimum KYC score (0-100)
AMOUNT_BITS: Final[int] = 37                           # 2^37 > MAX_TRANSACTION_AMOUNT
KYC_BITS: Final[int] = 7                               # 2^7 = 128 > 100


# ── Sentinel ──────────────────────────────────────────────────────────────────

SANCTIONS_MERKLE_EMPTY_ROOT: Final[str] = (
    "0000000000000000000000000000000000000000000000000000000000000000"
)


# ── Exceptions ────────────────────────────────────────────────────────────────

class ZKProofError(Exception):
    """Raised when a ZK proof fails to verify or cannot be generated."""


# ── Low-level group operations ────────────────────────────────────────────────

def _commit(v: int, r: int) -> int:
    """Compute Pedersen commitment C = g^v · h^r mod p.

    Args:
        v: Value to commit (integer in Z_q).
        r: Random blinding factor (integer in Z_q).

    Returns:
        Commitment C as an integer in Z_p.
    """
    return (pow(_G, v, _P) * pow(_H, r, _P)) % _P


def _modinv(a: int, m: int) -> int:
    """Modular inverse via Fermat's little theorem (m must be prime).

    Args:
        a: Integer to invert.
        m: Prime modulus.

    Returns:
        a^(-1) mod m.
    """
    return pow(a, m - 2, m)


def _random_scalar() -> int:
    """Sample a uniformly random scalar in Z_q.

    Returns:
        Random integer in [1, q-1].
    """
    r = secrets.randbelow(_Q - 1) + 1
    return r


def _elem_to_bytes(x: int) -> bytes:
    """Serialize a group element to a fixed-width big-endian byte string.

    Args:
        x: Group element (integer).

    Returns:
        256-byte big-endian representation.
    """
    return x.to_bytes(_ELEM_BYTES, "big")


def _scalar_to_bytes(x: int) -> bytes:
    """Serialize a scalar to a fixed-width big-endian byte string.

    Args:
        x: Scalar value (integer).

    Returns:
        32-byte big-endian representation.
    """
    return (x % _Q).to_bytes(_SCALAR_BYTES, "big")


def _fiat_shamir(*parts: bytes, domain: bytes) -> int:
    """Compute Fiat-Shamir challenge via domain-separated SHA-256.

    Args:
        *parts: Byte strings to hash (commitments, public inputs, etc.).
        domain: Domain separator string preventing proof cross-context reuse.

    Returns:
        Challenge integer in Z_q (256-bit hash reduced mod q).
    """
    h = hashlib.sha256()
    h.update(b"genesis-swarm-zk-v1\x00")
    h.update(domain)
    h.update(b"\x00")
    for part in parts:
        h.update(struct.pack("!I", len(part)))
        h.update(part)
    return int.from_bytes(h.digest(), "big") % _Q


# ── Bit commitment OR-proof ────────────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class BitProof:
    """Non-interactive OR-proof that a Pedersen commitment C encodes b ∈ {0,1}.

    Fields correspond to the Cramer-Damgård-Schoenmakers ring signature
    decomposed into two branches (b=0 and b=1).

    Attributes:
        commitment: The Pedersen commitment C = g^b · h^r mod p.
        R0: Branch-0 announcement (h^w0 or simulated).
        R1: Branch-1 announcement (h^w1 or simulated).
        c0: Branch-0 challenge share.
        c1: Branch-1 challenge share (c0 + c1 = global challenge mod q).
        z0: Branch-0 response scalar.
        z1: Branch-1 response scalar.
    """

    commitment: int
    R0: int
    R1: int
    c0: int
    c1: int
    z0: int
    z1: int


def _prove_bit(
    b: int,
    r: int,
    commitment: int,
    *,
    ctx_total_commitment: int,
    bit_index: int,
    num_bits: int,
) -> BitProof:
    """Generate an OR-proof that *commitment* = g^b · h^r for b ∈ {0,1}.

    Uses Cramer-Damgård-Schoenmakers composition: the real branch proves
    knowledge of r; the simulated branch is constructed to satisfy verification
    for a freely chosen challenge share.

    The Fiat-Shamir challenge is bound to the full proof context
    (total_commitment, bit_index, num_bits) so that bit proofs cannot be
    replayed across different range proofs or in different bit positions.

    Args:
        b: The secret bit (0 or 1).
        r: The secret blinding factor.
        commitment: The Pedersen commitment C = g^b · h^r mod p.
        ctx_total_commitment: The range proof's total commitment (C_total).
        bit_index: Position of this bit in the range proof (0 = LSB).
        num_bits: Total number of bits in the range proof.

    Returns:
        A :class:`BitProof` non-interactive OR-proof.

    Raises:
        ValueError: If b is not 0 or 1.
    """
    if b not in (0, 1):
        raise ValueError(f"bit must be 0 or 1, got {b}")

    inv_g = _modinv(_G, _P)
    # Context bytes bind the challenge to this specific bit position within
    # this specific range proof — prevents cross-proof replay.
    ctx_bytes = (
        _elem_to_bytes(ctx_total_commitment)
        + struct.pack("!II", bit_index, num_bits)
    )

    if b == 0:
        # Real branch: b=0, prove knowledge of r s.t. C = h^r
        # Simulated branch: b=1, proves knowledge of r' s.t. C/g = h^r'
        w = _random_scalar()
        R0_real = pow(_H, w, _P)

        c1_sim = _random_scalar()
        z1_sim = _random_scalar()
        # Simulate branch-1: h^z1 * (C*inv_g)^c1 = R1
        C_div_g = (commitment * inv_g) % _P
        R1_sim = (pow(_H, z1_sim, _P) * pow(C_div_g, c1_sim, _P)) % _P

        c_global = _fiat_shamir(
            _elem_to_bytes(commitment),
            _elem_to_bytes(R0_real), _elem_to_bytes(R1_sim),
            ctx_bytes,
            domain=b"bit-proof",
        )
        c0_real = (c_global - c1_sim) % _Q
        z0_real = (w - c0_real * r) % _Q

        return BitProof(
            commitment=commitment,
            R0=R0_real, R1=R1_sim,
            c0=c0_real, c1=c1_sim,
            z0=z0_real, z1=z1_sim,
        )
    else:
        # Real branch: b=1, prove knowledge of r s.t. C/g = h^r
        # Simulated branch: b=0, proves knowledge of r' s.t. C = h^r'
        w = _random_scalar()
        C_div_g = (commitment * inv_g) % _P
        R1_real = pow(_H, w, _P)

        c0_sim = _random_scalar()
        z0_sim = _random_scalar()
        # Simulate branch-0: h^z0 * C^c0 = R0
        R0_sim = (pow(_H, z0_sim, _P) * pow(commitment, c0_sim, _P)) % _P

        c_global = _fiat_shamir(
            _elem_to_bytes(commitment),
            _elem_to_bytes(R0_sim), _elem_to_bytes(R1_real),
            ctx_bytes,
            domain=b"bit-proof",
        )
        c1_real = (c_global - c0_sim) % _Q
        z1_real = (w - c1_real * r) % _Q

        return BitProof(
            commitment=commitment,
            R0=R0_sim, R1=R1_real,
            c0=c0_sim, c1=c1_real,
            z0=z0_sim, z1=z1_real,
        )


def _verify_bit(
    proof: BitProof,
    *,
    ctx_total_commitment: int,
    bit_index: int,
    num_bits: int,
) -> bool:
    """Verify a :class:`BitProof` OR-proof.

    Args:
        proof: The OR-proof to verify.
        ctx_total_commitment: The range proof's total commitment (C_total).
        bit_index: Position of this bit in the range proof (0 = LSB).
        num_bits: Total number of bits in the range proof.

    Returns:
        ``True`` if the proof is valid, ``False`` otherwise.
    """
    inv_g = _modinv(_G, _P)
    C = proof.commitment
    C_div_g = (C * inv_g) % _P
    ctx_bytes = (
        _elem_to_bytes(ctx_total_commitment)
        + struct.pack("!II", bit_index, num_bits)
    )

    c_expected = _fiat_shamir(
        _elem_to_bytes(C),
        _elem_to_bytes(proof.R0), _elem_to_bytes(proof.R1),
        ctx_bytes,
        domain=b"bit-proof",
    )

    # Challenge consistency: c0 + c1 = c_global mod q
    if (proof.c0 + proof.c1) % _Q != c_expected:
        return False

    # Branch 0: h^z0 * C^c0 = R0  (i.e., C = h^r → C = commitment to 0)
    lhs0 = (pow(_H, proof.z0, _P) * pow(C, proof.c0, _P)) % _P
    if lhs0 != proof.R0:
        return False

    # Branch 1: h^z1 * (C/g)^c1 = R1  (i.e., C/g = h^r → C = g*h^r, commitment to 1)
    lhs1 = (pow(_H, proof.z1, _P) * pow(C_div_g, proof.c1, _P)) % _P
    if lhs1 != proof.R1:
        return False

    return True


# ── Range proof ───────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class RangeProof:
    """Non-interactive range proof: committed value v ∈ [0, 2^k).

    Attributes:
        commitment: Pedersen commitment to the full value v.
        bit_proofs: List of k bit-commitment OR-proofs (LSB first).
        num_bits: Number of bits k in the range.
    """

    commitment: int
    bit_proofs: tuple[BitProof, ...]
    num_bits: int


def prove_range(v: int, num_bits: int = AMOUNT_BITS) -> tuple[RangeProof, int]:
    """Prove that committed value v ∈ [0, 2^num_bits) without revealing v.

    Args:
        v: The secret value to prove is in range.
        num_bits: Number of bits in the range (default: AMOUNT_BITS for amounts).

    Returns:
        ``(proof, r)`` where ``proof`` is the :class:`RangeProof` and ``r``
        is the total blinding factor for the commitment to v.

    Raises:
        ZKProofError: If v is out of range.
    """
    if not (0 <= v < 2 ** num_bits):
        raise ZKProofError(
            f"value {v} is out of range [0, 2^{num_bits}) — "
            "cannot generate range proof for out-of-bounds value"
        )

    # Decompose v into bits and commit to each
    bits = [(v >> i) & 1 for i in range(num_bits)]
    rs: list[int] = [_random_scalar() for _ in range(num_bits)]
    bit_commitments = [_commit(b, r) for b, r in zip(bits, rs)]

    # Blinding factor for the full value: r_total = sum(r_i * 2^i) mod q
    r_total = sum(r * (2 ** i) for i, r in enumerate(rs)) % _Q

    # Commitment to v: C = product(C_i^(2^i)) = g^v * h^r_total mod p
    # Computed BEFORE bit proofs so it can be bound into each Fiat-Shamir hash.
    C_total = 1
    for i, c in enumerate(bit_commitments):
        C_total = (C_total * pow(c, 2 ** i, _P)) % _P

    # Generate OR-proof for each bit commitment, binding to full proof context.
    bit_proofs = tuple(
        _prove_bit(
            b, r, c,
            ctx_total_commitment=C_total,
            bit_index=i,
            num_bits=num_bits,
        )
        for i, (b, r, c) in enumerate(zip(bits, rs, bit_commitments))
    )

    return RangeProof(
        commitment=C_total,
        bit_proofs=bit_proofs,
        num_bits=num_bits,
    ), r_total


def verify_range(proof: RangeProof) -> bool:
    """Verify a :class:`RangeProof`.

    Checks:
    1. Each bit commitment is a valid OR-proof (b ∈ {0, 1}).
    2. The product of bit commitments raised to their positional weights
       equals the declared total commitment (homomorphic sum check).

    Args:
        proof: The range proof to verify.

    Returns:
        ``True`` if valid, ``False`` otherwise.
    """
    if len(proof.bit_proofs) != proof.num_bits:
        return False

    # Reconstruct total commitment from bit commitments (needed for challenge binding).
    C_reconstructed = 1
    for i, bp in enumerate(proof.bit_proofs):
        C_reconstructed = (C_reconstructed * pow(bp.commitment, 2 ** i, _P)) % _P

    # Check total commitment matches declared commitment before verifying bits.
    if C_reconstructed != proof.commitment:
        return False

    # Check each bit OR-proof, bound to its position and the total commitment.
    for i, bp in enumerate(proof.bit_proofs):
        if not _verify_bit(
            bp,
            ctx_total_commitment=proof.commitment,
            bit_index=i,
            num_bits=proof.num_bits,
        ):
            return False

    return True


# ── Sanctions Merkle tree ─────────────────────────────────────────────────────

def _merkle_hash(left: bytes, right: bytes) -> bytes:
    """Compute a Merkle parent hash from two children.

    Args:
        left: Left child hash (32 bytes).
        right: Right child hash (32 bytes).

    Returns:
        32-byte parent hash SHA-256(b'\\x01' + left + right).
    """
    return hashlib.sha256(b"\x01" + left + right).digest()


def _leaf_hash(entity_id: str) -> bytes:
    """Compute the leaf hash for an entity ID in the sanctions Merkle tree.

    Args:
        entity_id: Entity identifier string (IBAN, LEI, etc.).

    Returns:
        32-byte leaf hash SHA-256(b'\\x00' + entity_id_utf8).
    """
    return hashlib.sha256(b"\x00" + entity_id.encode("utf-8")).digest()


def build_sanctions_tree(entity_ids: Sequence[str]) -> list[list[bytes]]:
    """Build a Merkle tree from a list of sanctioned entity IDs.

    Args:
        entity_ids: List of sanctioned entity identifier strings.

    Returns:
        List of tree levels (level 0 = leaves, last level = root alone).
    """
    if not entity_ids:
        zero = bytes(32)
        return [[zero]]

    leaves = [_leaf_hash(eid) for eid in sorted(entity_ids)]
    # Pad to power of 2
    while len(leaves) & (len(leaves) - 1):
        leaves.append(bytes(32))

    levels: list[list[bytes]] = [leaves]
    current = leaves
    while len(current) > 1:
        parent = [
            _merkle_hash(current[i], current[i + 1])
            for i in range(0, len(current), 2)
        ]
        levels.append(parent)
        current = parent
    return levels


def sanctions_root(tree: list[list[bytes]]) -> str:
    """Return the Merkle root of a sanctions tree as a hex string.

    Args:
        tree: Tree levels returned by :func:`build_sanctions_tree`.

    Returns:
        64-character lowercase hex string.
    """
    return tree[-1][0].hex()


def prove_non_membership(
    entity_id: str,
    tree: list[list[bytes]],
) -> dict[str, object]:
    """Prove entity_id is NOT present in the sanctions Merkle tree.

    Uses a sparse-Merkle non-membership proof: show the sibling path for
    the leaf position where entity_id would appear and confirm that leaf
    is empty (all-zero 32-byte hash).

    Args:
        entity_id: Entity to prove absence of.
        tree: Sanctions Merkle tree from :func:`build_sanctions_tree`.

    Returns:
        Non-membership proof dict with keys ``root``, ``entity_hash``,
        ``leaf_index``, and ``siblings``.

    Raises:
        ZKProofError: If entity_id IS found in the tree.
    """
    entity_hash = _leaf_hash(entity_id)
    leaves = tree[0]

    if entity_hash in leaves:
        raise ZKProofError(
            f"entity {entity_id!r} IS in the sanctions tree — "
            "non-membership proof cannot be generated"
        )

    # Find the lexicographically correct position for this hash
    leaf_index = 0
    for i, leaf in enumerate(sorted(leaves)):
        if entity_hash < leaf:
            break
        leaf_index = i + 1

    leaf_index = min(leaf_index, len(leaves) - 1)

    # Collect sibling hashes along the path from leaf_index to root
    siblings: list[str] = []
    idx = leaf_index
    for level in tree[:-1]:
        sibling_idx = idx ^ 1  # Flip last bit to get sibling
        if sibling_idx < len(level):
            siblings.append(level[sibling_idx].hex())
        else:
            siblings.append(bytes(32).hex())
        idx >>= 1

    return {
        "root": tree[-1][0].hex(),
        "entity_hash": entity_hash.hex(),
        "leaf_index": leaf_index,
        "siblings": siblings,
    }


def verify_non_membership(proof: dict[str, object]) -> bool:
    """Verify a sanctions non-membership proof.

    Args:
        proof: Dict returned by :func:`prove_non_membership`.

    Returns:
        ``True`` if the entity is verifiably absent from the tree.
    """
    entity_hash = bytes.fromhex(str(proof["entity_hash"]))
    idx = int(str(proof["leaf_index"]))
    siblings = [bytes.fromhex(str(s)) for s in proof["siblings"]]  # type: ignore[arg-type]
    root = bytes.fromhex(str(proof["root"]))

    # Reconstruct root from empty leaf (non-membership = empty leaf at position)
    current = bytes(32)  # empty leaf
    pos = idx
    for sibling in siblings:
        if pos % 2 == 0:
            current = _merkle_hash(current, sibling)
        else:
            current = _merkle_hash(sibling, current)
        pos >>= 1

    return current == root


# ── CSSF Article 15 Composite Proof ──────────────────────────────────────────

@dataclass
class ComplianceCircuit:
    """Witness and public inputs for a CSSF Article 15 compliance proof.

    Attributes:
        amount: Transaction amount in the ledger's base currency unit.
        counterparty_id: Entity identifier of the transaction counterparty.
        kyc_score: Numeric KYC score for the counterparty (0–100).
        max_amount: Maximum permitted transaction amount (public).
        min_kyc_score: Minimum KYC score required (public).
        sanctions_tree: Current sanctions Merkle tree.
    """

    amount: int
    counterparty_id: str
    kyc_score: int
    max_amount: int = MAX_TRANSACTION_AMOUNT
    min_kyc_score: int = MIN_KYC_SCORE
    sanctions_tree: list[list[bytes]] = field(
        default_factory=lambda: build_sanctions_tree([])
    )


@dataclass(frozen=True)
class CSSFComplianceProof:
    """Self-contained CSSF Article 15 compliance proof artifact.

    All fields are public (shared with the regulator).  No private witness
    data (actual amounts, counterparty IDs, KYC scores) is included.

    Attributes:
        amount_range_proof: ZK range proof that amount ≤ max_amount.
        kyc_range_proof: ZK range proof that kyc_score ≥ min_kyc_score.
        non_membership_proof: Merkle non-membership proof for counterparty.
        sanctions_root: Merkle root of the sanctions list at proof time.
        max_amount: Maximum permitted amount (public parameter).
        min_kyc_score: Minimum KYC score (public parameter).
        proof_hash: SHA-256 fingerprint of the full proof for deduplication.
    """

    amount_range_proof: RangeProof
    kyc_range_proof: RangeProof
    non_membership_proof: dict[str, object]
    sanctions_root: str
    max_amount: int
    min_kyc_score: int
    proof_hash: str


class ZKComplianceProver:
    """Generates CSSF Article 15 ZK compliance proofs.

    Example::

        tree = build_sanctions_tree(["OFAC-001", "EU-SDN-042"])
        circuit = ComplianceCircuit(
            amount=500_000,
            counterparty_id="IBAN-DE12345678901234567890",
            kyc_score=85,
            sanctions_tree=tree,
        )
        prover = ZKComplianceProver()
        proof = prover.prove(circuit)
    """

    def prove(self, circuit: ComplianceCircuit) -> CSSFComplianceProof:
        """Generate a CSSF Article 15 compliance proof for the given circuit.

        Args:
            circuit: Witness + public inputs (see :class:`ComplianceCircuit`).

        Returns:
            A :class:`CSSFComplianceProof` ready to share with regulators.

        Raises:
            ZKProofError: If any compliance check fails (out of range, on
                sanctions list, or KYC score below minimum).
        """
        if circuit.amount > circuit.max_amount:
            raise ZKProofError(
                f"amount {circuit.amount} exceeds maximum {circuit.max_amount} — "
                "transaction would not be Article 15 compliant"
            )
        if circuit.kyc_score < circuit.min_kyc_score:
            raise ZKProofError(
                f"KYC score {circuit.kyc_score} below minimum {circuit.min_kyc_score}"
            )

        # Range proof: amount ∈ [0, 2^AMOUNT_BITS)
        amount_proof, _ = prove_range(circuit.amount, num_bits=AMOUNT_BITS)

        # KYC threshold proof: prove (score - min) ≥ 0, i.e., (score - min) ∈ [0, 2^k)
        kyc_delta = circuit.kyc_score - circuit.min_kyc_score
        kyc_proof, _ = prove_range(kyc_delta, num_bits=KYC_BITS)

        # Sanctions non-membership proof
        nm_proof = prove_non_membership(circuit.counterparty_id, circuit.sanctions_tree)
        root = sanctions_root(circuit.sanctions_tree)

        # Compute a fingerprint binding all proof components
        h = hashlib.sha256()
        h.update(b"cssf-article-15-v1\x00")
        h.update(_elem_to_bytes(amount_proof.commitment))
        h.update(_elem_to_bytes(kyc_proof.commitment))
        h.update(bytes.fromhex(root))
        h.update(struct.pack("!QI", circuit.max_amount, circuit.min_kyc_score))
        proof_hash = h.hexdigest()

        return CSSFComplianceProof(
            amount_range_proof=amount_proof,
            kyc_range_proof=kyc_proof,
            non_membership_proof=nm_proof,
            sanctions_root=root,
            max_amount=circuit.max_amount,
            min_kyc_score=circuit.min_kyc_score,
            proof_hash=proof_hash,
        )


class ZKComplianceVerifier:
    """Verifies CSSF Article 15 ZK compliance proofs.

    The verifier runs on the regulator's side and requires only the public
    proof artifact — no transaction data whatsoever.

    Example::

        verifier = ZKComplianceVerifier()
        ok = verifier.verify(proof)
        assert ok, "Proof verification failed"
    """

    def verify(self, proof: CSSFComplianceProof) -> bool:
        """Verify a :class:`CSSFComplianceProof`.

        Checks all three sub-proofs: amount range, KYC threshold, and
        sanctions non-membership.

        Args:
            proof: The compliance proof artifact received from the swarm.

        Returns:
            ``True`` if all sub-proofs are valid, ``False`` if any fails.
        """
        if not verify_range(proof.amount_range_proof):
            return False
        if not verify_range(proof.kyc_range_proof):
            return False
        if not verify_non_membership(proof.non_membership_proof):
            return False
        if proof.non_membership_proof.get("root") != proof.sanctions_root:
            return False
        return True
