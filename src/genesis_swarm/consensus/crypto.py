"""
Ed25519 cryptographic primitives for PBFT node-to-node authentication.

Every node generates a deterministic Ed25519 key-pair at startup.
All ConsensusEnvelope objects are signed by the sender's private key and
verified against the registered public key before reaching consensus logic.

Merkle-root chaining
--------------------
Committed block digests are accumulated into a binary Merkle tree whose root
is embedded in every subsequent PRE-PREPARE, creating a tamper-evident chain.
Any node that receives a PRE-PREPARE whose Merkle root diverges from its own
local chain root knows it has fallen behind and triggers state synchronisation.
"""
from __future__ import annotations

import hashlib
import struct
from dataclasses import dataclass
from typing import Sequence

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

__all__ = [
    "NodeKeyPair",
    "SignatureError",
    "verify_signature",
    "compute_digest",
    "build_merkle_root",
    "canonical_signing_bytes",
]


class SignatureError(ValueError):
    """Raised when an Ed25519 signature fails verification."""


@dataclass(frozen=True)
class NodeKeyPair:
    """
    Immutable Ed25519 key pair for one PBFT node.

    The 32-byte raw public key is the node's network identity and is embedded
    in every ConsensusEnvelope so receivers can verify without a separate key
    exchange.  The private key never leaves this object.
    """

    node_id: str
    private_key: Ed25519PrivateKey
    public_key: Ed25519PublicKey

    def __post_init__(self) -> None:
        # Cache serialised forms — frozen dataclass requires object.__setattr__
        object.__setattr__(
            self,
            "_pubkey_bytes_cache",
            self.public_key.public_bytes(
                serialization.Encoding.Raw, serialization.PublicFormat.Raw
            ),
        )

    @classmethod
    def generate(cls, node_id: str) -> "NodeKeyPair":
        """Generate a fresh random key pair for *node_id*."""
        priv = Ed25519PrivateKey.generate()
        return cls(node_id=node_id, private_key=priv, public_key=priv.public_key())

    @classmethod
    def from_private_bytes(cls, node_id: str, raw_private: bytes) -> "NodeKeyPair":
        """Restore a key pair from 32 raw private-key bytes."""
        priv = Ed25519PrivateKey.from_private_bytes(raw_private)
        return cls(node_id=node_id, private_key=priv, public_key=priv.public_key())

    def pubkey_bytes(self) -> bytes:
        """Return the 32-byte raw Ed25519 public key."""
        return self._pubkey_bytes_cache  # type: ignore[attr-defined]

    def sign(self, data: bytes) -> bytes:
        """Return a 64-byte Ed25519 signature over *data*."""
        return self.private_key.sign(data)

    def pubkey_hex(self) -> str:
        return self.pubkey_bytes().hex()


# ── Standalone crypto utilities ───────────────────────────────────────────────


def verify_signature(pubkey_bytes: bytes, data: bytes, signature: bytes) -> None:
    """
    Verify an Ed25519 *signature* of *data* against *pubkey_bytes*.

    Raises:
        SignatureError: if the signature is invalid or *pubkey_bytes* is malformed.
    """
    if len(signature) != 64:
        raise SignatureError(
            f"Signature must be 64 bytes, got {len(signature)}"
        )
    if len(pubkey_bytes) != 32:
        raise SignatureError(
            f"Ed25519 public key must be 32 bytes, got {len(pubkey_bytes)}"
        )
    try:
        key = Ed25519PublicKey.from_public_bytes(pubkey_bytes)
        key.verify(signature, data)
    except (InvalidSignature, ValueError, TypeError) as exc:
        raise SignatureError(f"Ed25519 verification failed: {exc}") from exc


def compute_digest(data: bytes) -> str:
    """Return the lowercase hex SHA3-512 digest of *data*."""
    return hashlib.sha3_512(data).hexdigest()


def build_merkle_root(digests: Sequence[str]) -> str:
    """
    Compute the SHA3-512 binary Merkle root of *digests*.

    Each element of *digests* must be a 128-hex-char SHA3-512 string.
    Returns the 128-char sentinel "0"*128 for an empty sequence.

    Algorithm: standard binary Merkle tree with duplication of the last leaf
    when the layer has an odd length.
    """
    if not digests:
        return "0" * 128

    # Convert hex digests to raw bytes for hashing
    layer: list[bytes] = [bytes.fromhex(d) for d in digests]

    while len(layer) > 1:
        if len(layer) % 2:
            layer.append(layer[-1])  # duplicate last leaf for odd-length layer
        layer = [
            hashlib.sha3_512(layer[i] + layer[i + 1]).digest()
            for i in range(0, len(layer), 2)
        ]

    return layer[0].hex()


def canonical_signing_bytes(
    phase: int,
    view: int,
    seq: int,
    digest: str,
    sender_id: str,
    ts_ns: int,
) -> bytes:
    """
    Produce deterministic bytes that the Ed25519 signature covers.

    Layout (big-endian):
        1B  phase  (uint8)
        8B  view   (uint64)
        8B  seq    (uint64)
        nB  digest (ASCII hex, null-terminated)
        mB  sender_id (UTF-8, null-terminated)
        8B  ts_ns  (uint64)

    Null terminators separate variable-length fields to prevent length-extension
    ambiguity.
    """
    return (
        struct.pack(">BQQ", phase & 0xFF, view, seq)
        + digest.encode("ascii")
        + b"\x00"
        + sender_id.encode("utf-8")
        + b"\x00"
        + struct.pack(">Q", ts_ns)
    )
