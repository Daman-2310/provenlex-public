"""
Genesis Swarm — Autonomous Financial Clearing Matrix
====================================================

Three deep-tech infrastructure layers that sit above the BFT RegTech core.
Each layer is a self-contained, microservice-splittable module (Pydantic models
+ business logic + FastAPI router). PostgreSQL DDL for all three lives in
``schema.sql``; the Solidity gateway for Layer 1 lives in
``GenesisEscrowGateway.sol``.

Layers
------
1. ``layer1_escrow``        — programmatic escrow circuit-breaker (atomic
                              transaction isolation; on-chain lock before
                              settlement finality on a compliance breach).
2. ``layer2_substance_ring``— recursive proof-of-substance verifier ring
                              (multi-institutional BLS-style co-signing).
3. ``layer3_dark_pool``     — homomorphic exposure moat (real Paillier additive
                              homomorphic compute over encrypted order books).

Honest scope notes
------------------
* Layer 3 Paillier is a *real* additively-homomorphic implementation — you can
  verify ``D(E(a) · E(b)) == a + b`` without decrypting intermediates.
* Layer 2 models BLS12-381 aggregate-signature *semantics* with a from-scratch
  additive aggregate over a large prime; production should swap in
  ``py_ecc.bls`` / ``blspy`` for pairing-based BLS. The threshold logic,
  rejection rules, and co-signing flow are real.
* Layer 1's on-chain dispatch uses a pluggable ``ChainClient`` interface with an
  in-memory default; drop in a ``web3.py`` client for mainnet/testnet.
"""

from __future__ import annotations

from .layer1_escrow import router as escrow_router
from .layer2_substance_ring import router as substance_ring_router
from .layer3_dark_pool import router as dark_pool_router

ALL_ROUTERS = (escrow_router, substance_ring_router, dark_pool_router)

__all__ = [
    "ALL_ROUTERS",
    "dark_pool_router",
    "escrow_router",
    "substance_ring_router",
]
