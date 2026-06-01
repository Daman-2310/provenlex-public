from __future__ import annotations

import hashlib
import os
import time
from dataclasses import dataclass
from typing import Optional

_MAX_HISTORY = 100


@dataclass
class AnchorResult:
    root_hash: str
    tx_hash: str
    network: str
    timestamp: float
    etherscan_url: str
    block_number: Optional[int]
    simulated: bool


class BlockchainAnchor:
    """Anchors Merkle root hashes to Ethereum Sepolia testnet.

    Falls back to deterministic simulation when web3 is not installed
    or ETHEREUM_PRIVATE_KEY is not set — simulated=True in that case.
    """

    _SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com"
    _EXPLORER = "https://sepolia.etherscan.io/tx/{}"

    def __init__(self) -> None:
        self._history: list[AnchorResult] = []
        self._by_root: dict[str, AnchorResult] = {}

    # ── Public API ─────────────────────────────────────────────────────────────

    def anchor(self, root_hash: str) -> AnchorResult:
        private_key = os.getenv("ETHEREUM_PRIVATE_KEY", "")
        if private_key:
            result = self._anchor_real(root_hash, private_key)
        else:
            result = self._anchor_simulated(root_hash)
        self._store(result)
        return result

    def get_anchors(self) -> list[AnchorResult]:
        return list(reversed(self._history))

    def verify(self, root_hash: str) -> Optional[AnchorResult]:
        return self._by_root.get(root_hash)

    # ── Internal ───────────────────────────────────────────────────────────────

    def _store(self, result: AnchorResult) -> None:
        self._history.append(result)
        if len(self._history) > _MAX_HISTORY:
            old = self._history.pop(0)
            self._by_root.pop(old.root_hash, None)
        self._by_root[result.root_hash] = result

    def _anchor_simulated(self, root_hash: str) -> AnchorResult:
        ts = time.time()
        raw = f"{root_hash}:{ts}".encode()
        tx_hash = "0x" + hashlib.sha256(raw).hexdigest()
        return AnchorResult(
            root_hash=root_hash,
            tx_hash=tx_hash,
            network="sepolia-simulated",
            timestamp=ts,
            etherscan_url=self._EXPLORER.format(tx_hash),
            block_number=None,
            simulated=True,
        )

    def _anchor_real(self, root_hash: str, private_key: str) -> AnchorResult:
        try:
            from web3 import Web3

            rpc_url = os.getenv("ETHEREUM_RPC_URL", self._SEPOLIA_RPC)
            w3 = Web3(Web3.HTTPProvider(rpc_url))
            account = w3.eth.account.from_key(private_key)
            calldata = "0x" + root_hash.lstrip("0x")
            tx = {
                "from": account.address,
                "to": account.address,
                "value": 0,
                "data": calldata,
                "gas": 50_000,
                "gasPrice": w3.eth.gas_price,
                "nonce": w3.eth.get_transaction_count(account.address),
                "chainId": 11155111,  # Sepolia
            }
            signed = w3.eth.account.sign_transaction(tx, private_key)
            tx_hash_bytes = w3.eth.send_raw_transaction(signed.raw_transaction)
            receipt = w3.eth.wait_for_transaction_receipt(tx_hash_bytes, timeout=60)
            tx_hash = receipt.transactionHash.hex()
            return AnchorResult(
                root_hash=root_hash,
                tx_hash=tx_hash,
                network="sepolia",
                timestamp=time.time(),
                etherscan_url=self._EXPLORER.format(tx_hash),
                block_number=receipt.blockNumber,
                simulated=False,
            )
        except Exception:
            return self._anchor_simulated(root_hash)
