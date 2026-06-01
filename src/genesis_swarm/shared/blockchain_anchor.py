"""
On-chain Merkle root anchoring — Ethereum calldata + IPFS fallback.

Every anchored Merkle root is written to the Ethereum blockchain as transaction
calldata (no smart contract required). The transaction hash is the permanent,
publicly-verifiable proof that the root existed at that block height.

Ethereum calldata anchoring:
  - No smart contract needed
  - No ETH spent beyond gas (~21,000 gas for bare calldata tx ≈ $0.05 on mainnet)
  - Transaction is permanently on-chain, queryable by anyone
  - Uses web3.py + any RPC provider (Infura, Alchemy, public mainnet)

IPFS fallback:
  - Pins a JSON document {merkle_root, timestamp, chain_hash} to IPFS
  - Returns the IPFS CID as the anchor proof
  - Free via nft.storage or web3.storage API

Usage:
    anchorer = BlockchainAnchor()
    proof = await anchorer.anchor(merkle_root="abc123...", chain_hash="def456...")
    # proof.tx_hash  — Ethereum tx hash (or None if IPFS only)
    # proof.ipfs_cid — IPFS CID (or None if ETH only)

Environment variables:
    GENESIS_ETH_RPC_URL     Ethereum RPC endpoint (e.g., https://mainnet.infura.io/v3/KEY)
    GENESIS_ETH_PRIVATE_KEY 32-byte hex private key of the anchoring wallet
    GENESIS_ETH_CHAIN_ID    Chain ID (1=mainnet, 11155111=Sepolia testnet, default: 11155111)
    GENESIS_IPFS_API_KEY    nft.storage or web3.storage API key (IPFS fallback)
    GENESIS_ANCHOR_INTERVAL Seconds between auto-anchors (default: 3600 = 1 hour)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass
from typing import Optional

log = logging.getLogger(__name__)

try:
    from web3 import Web3
    from web3.middleware import geth_poa_middleware

    _WEB3_OK = True
except ImportError:
    _WEB3_OK = False

try:
    import httpx as _httpx

    _HTTPX_OK = True
except ImportError:
    _HTTPX_OK = False


@dataclass
class AnchorProof:
    merkle_root: str
    timestamp: float
    tx_hash: Optional[str] = None  # Ethereum tx hash
    block_num: Optional[int] = None  # Ethereum block number
    ipfs_cid: Optional[str] = None  # IPFS CID
    method: str = "none"  # "ethereum" | "ipfs" | "none"
    chain_id: int = 0
    error: Optional[str] = None


class BlockchainAnchor:
    """
    Anchors Merkle roots to Ethereum and/or IPFS.

    Call anchor() to anchor a single root. Call start_auto_anchor() to run
    a background task that anchors every GENESIS_ANCHOR_INTERVAL seconds.
    """

    def __init__(self):
        self._eth_rpc = os.getenv("GENESIS_ETH_RPC_URL", "")
        self._priv_key = os.getenv("GENESIS_ETH_PRIVATE_KEY", "")
        self._chain_id = int(os.getenv("GENESIS_ETH_CHAIN_ID", "11155111"))  # Sepolia
        self._ipfs_key = os.getenv("GENESIS_IPFS_API_KEY", "")
        self._interval = int(os.getenv("GENESIS_ANCHOR_INTERVAL", "3600"))
        self._anchor_log: list[AnchorProof] = []
        self._auto_task: Optional[asyncio.Task] = None

        if _WEB3_OK and self._eth_rpc:
            self._w3 = Web3(Web3.HTTPProvider(self._eth_rpc))
            if self._chain_id in (5, 80001, 11155111):  # PoA testnets
                self._w3.middleware_onion.inject(geth_poa_middleware, layer=0)
        else:
            self._w3 = None

    async def anchor(self, merkle_root: str, chain_hash: str = "") -> AnchorProof:
        """
        Anchor the given Merkle root. Tries Ethereum first, falls back to IPFS.
        Returns an AnchorProof with the transaction hash or IPFS CID.
        """
        proof = AnchorProof(merkle_root=merkle_root, timestamp=time.time())

        # Try Ethereum
        if self._w3 and self._priv_key:
            proof = await self._anchor_ethereum(merkle_root, chain_hash, proof)
            if proof.tx_hash:
                return proof

        # Try IPFS
        if self._ipfs_key or True:  # always try IPFS (free with nft.storage)
            proof = await self._anchor_ipfs(merkle_root, chain_hash, proof)
            if proof.ipfs_cid:
                return proof

        log.warning("[Anchor] No anchor method succeeded for root %s...", merkle_root[:12])
        proof.error = "No anchor method configured or available"
        return proof

    async def _anchor_ethereum(self, root: str, chain_hash: str, proof: AnchorProof) -> AnchorProof:
        """Write root to Ethereum calldata."""
        try:
            if not _WEB3_OK:
                raise ImportError("web3 not installed")
            w3 = self._w3
            account = w3.eth.account.from_key(self._priv_key)

            # Calldata: "GENESIS:" + merkle_root + ":" + chain_hash[:8]
            calldata = f"GENESIS:{root}:{chain_hash[:16]}".encode("utf-8")

            tx = {
                "nonce": w3.eth.get_transaction_count(account.address),
                "to": account.address,  # self-send (cheapest)
                "value": 0,
                "gas": 25000,
                "maxFeePerGas": w3.eth.gas_price,
                "maxPriorityFeePerGas": w3.to_wei(1, "gwei"),
                "chainId": self._chain_id,
                "data": calldata,
            }

            signed = account.sign_transaction(tx)
            tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
            receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

            proof.tx_hash = tx_hash.hex()
            proof.block_num = receipt["blockNumber"]
            proof.method = "ethereum"
            proof.chain_id = self._chain_id

            log.info("[Anchor] Ethereum tx %s at block %d", proof.tx_hash[:16], proof.block_num)
            self._anchor_log.append(proof)
            return proof

        except Exception as exc:
            log.warning("[Anchor] Ethereum anchoring failed: %s", exc)
            proof.error = str(exc)
            return proof

    async def _anchor_ipfs(self, root: str, chain_hash: str, proof: AnchorProof) -> AnchorProof:
        """Pin a JSON document to IPFS via nft.storage."""
        if not _HTTPX_OK:
            proof.error = "httpx not installed for IPFS upload"
            return proof

        document = {
            "genesis_swarm_anchor": True,
            "merkle_root": root,
            "chain_hash": chain_hash,
            "timestamp": proof.timestamp,
            "timestamp_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(proof.timestamp)),
            "version": "0.5.0",
        }
        body = json.dumps(document).encode()

        headers = {"Content-Type": "application/json"}
        if self._ipfs_key:
            headers["Authorization"] = f"Bearer {self._ipfs_key}"

        try:
            async with _httpx.AsyncClient(timeout=30) as client:
                # Try nft.storage (free, no key needed for small files via /upload)
                r = await client.post(
                    "https://api.nft.storage/upload",
                    content=body,
                    headers=headers,
                )
                if r.status_code == 200:
                    cid = r.json().get("value", {}).get("cid")
                    if cid:
                        proof.ipfs_cid = cid
                        proof.method = "ipfs"
                        log.info("[Anchor] IPFS CID: %s", cid)
                        self._anchor_log.append(proof)
                        return proof
        except Exception as exc:
            log.warning("[Anchor] IPFS anchoring failed: %s", exc)
            proof.error = str(exc)

        return proof

    def start_auto_anchor(self, get_current_root_fn) -> None:
        """
        Start a background asyncio task that calls anchor() every
        GENESIS_ANCHOR_INTERVAL seconds using get_current_root_fn() to
        retrieve the latest Merkle root.
        """

        async def _loop():
            while True:
                await asyncio.sleep(self._interval)
                try:
                    root = get_current_root_fn()
                    if root:
                        await self.anchor(root)
                except Exception as exc:
                    log.warning("[Anchor] Auto-anchor error: %s", exc)

        self._auto_task = asyncio.create_task(_loop())
        log.info("[Anchor] Auto-anchor started (interval=%ds)", self._interval)

    def stop_auto_anchor(self) -> None:
        if self._auto_task:
            self._auto_task.cancel()

    def recent_proofs(self, n: int = 10) -> list[dict]:
        return [
            {
                "merkle_root": p.merkle_root[:16] + "...",
                "timestamp": p.timestamp,
                "method": p.method,
                "tx_hash": p.tx_hash,
                "ipfs_cid": p.ipfs_cid,
                "error": p.error,
            }
            for p in self._anchor_log[-n:]
        ]
