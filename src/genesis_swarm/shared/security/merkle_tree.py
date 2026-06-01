from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class MerkleNode:
    """A single node in the Merkle tree.

    Leaf nodes carry ``data`` and set ``left = right = None``.
    Internal nodes carry only a ``hash`` computed from their children.
    """

    hash: str
    left: Optional[MerkleNode] = field(default=None, repr=False)
    right: Optional[MerkleNode] = field(default=None, repr=False)
    data: Optional[dict] = field(default=None, repr=False)


def _sha3_512(value: str) -> str:
    return hashlib.sha3_512(value.encode("utf-8")).hexdigest()


def _hash_pair(left: str, right: str) -> str:
    """Hash two child hashes together (sorted-pair convention omitted
    intentionally — order preserves append sequence for audit integrity)."""
    return _sha3_512(left + right)


class MerkleAuditLog:
    """Deterministic SHA3-512 Merkle tree for BFT audit logs.

    Leaves are appended in insertion order.  The root is recomputed on every
    append using a full bottom-up pass so that proofs are always valid for the
    current root.

    Notes
    -----
    Odd-length levels duplicate the last node (standard Bitcoin-style
    Merkle tree convention) so the tree is always complete.
    """

    def __init__(self) -> None:
        self._leaves: list[MerkleNode] = []
        self._root: Optional[str] = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def append(self, record: dict) -> str:
        """Serialize *record* to canonical JSON, hash it, add a leaf.

        Returns the leaf hash.
        """
        canonical = json.dumps(record, sort_keys=True, separators=(",", ":"))
        leaf_hash = _sha3_512(canonical)
        node = MerkleNode(hash=leaf_hash, data=record)
        self._leaves.append(node)
        self._root = self._compute_root([n.hash for n in self._leaves])
        return leaf_hash

    @property
    def root(self) -> Optional[str]:
        """Current Merkle root, or ``None`` if the tree is empty."""
        return self._root

    @property
    def depth(self) -> int:
        """Height of the tree (0 = empty, 1 = single leaf, …)."""
        if not self._leaves:
            return 0
        n = len(self._leaves)
        d = 0
        while n > 1:
            n = (n + 1) // 2
            d += 1
        return d + 1  # +1 for the leaf level

    def verify_leaf(self, record: dict, leaf_hash: str) -> bool:
        """Return ``True`` when *record* hashes to *leaf_hash* **and** that
        hash exists among the current leaves."""
        canonical = json.dumps(record, sort_keys=True, separators=(",", ":"))
        computed = _sha3_512(canonical)
        if computed != leaf_hash:
            return False
        return any(n.hash == leaf_hash for n in self._leaves)

    def get_proof(self, leaf_hash: str) -> list[dict]:
        """Return the Merkle proof path for *leaf_hash*.

        Each element is ``{"hash": str, "side": "L" | "R"}`` where *side*
        indicates which side the sibling sits on relative to the path node.
        Returns an empty list when the hash is not found.
        """
        leaf_hashes = [n.hash for n in self._leaves]
        try:
            idx = leaf_hashes.index(leaf_hash)
        except ValueError:
            return []

        proof: list[dict] = []
        current_level = leaf_hashes[:]

        while len(current_level) > 1:
            if len(current_level) % 2 == 1:
                current_level.append(current_level[-1])  # duplicate last

            sibling_idx = idx ^ 1  # XOR flips LSB: 0↔1, 2↔3, …
            if sibling_idx < len(current_level):
                side = "R" if idx % 2 == 0 else "L"
                proof.append({"hash": current_level[sibling_idx], "side": side})

            # Move up one level
            next_level = []
            for i in range(0, len(current_level), 2):
                next_level.append(_hash_pair(current_level[i], current_level[i + 1]))
            idx //= 2
            current_level = next_level

        return proof

    def verify_proof(
        self,
        leaf_hash: str,
        proof: list[dict],
        root: str,
    ) -> bool:
        """Verify a Merkle proof without rebuilding the full tree.

        Parameters
        ----------
        leaf_hash:
            Hash of the leaf whose membership is being proved.
        proof:
            List of ``{"hash": str, "side": "L"|"R"}`` siblings returned by
            :meth:`get_proof`.
        root:
            The expected root hash to verify against.
        """
        current = leaf_hash
        for step in proof:
            sibling = step["hash"]
            side = step["side"]
            if side == "R":
                # current is left child, sibling is right
                current = _hash_pair(current, sibling)
            else:
                # current is right child, sibling is left
                current = _hash_pair(sibling, current)
        return current == root

    def to_dict(self, max_leaves: int = 50) -> dict:
        """Return a serializable snapshot of the current tree state.

        Parameters
        ----------
        max_leaves:
            Maximum number of leaf entries to include in the snapshot.
            Most-recent leaves are preferred.
        """
        recent = self._leaves[-max_leaves:]
        return {
            "root": self._root,
            "total_leaves": len(self._leaves),
            "depth": self.depth,
            "leaves": [
                {"index": len(self._leaves) - len(recent) + i, "hash": n.hash}
                for i, n in enumerate(recent)
            ],
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _compute_root(self, leaves: list[str]) -> str:
        """Standard recursive pair-hashing with odd-node duplication."""
        if not leaves:
            return _sha3_512("")
        current_level = leaves[:]
        while len(current_level) > 1:
            if len(current_level) % 2 == 1:
                current_level.append(current_level[-1])
            next_level = []
            for i in range(0, len(current_level), 2):
                next_level.append(_hash_pair(current_level[i], current_level[i + 1]))
            current_level = next_level
        return current_level[0]
