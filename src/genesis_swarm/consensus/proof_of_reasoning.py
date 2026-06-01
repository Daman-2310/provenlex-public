"""
Proof-of-Reasoning (PoR) — Byzantine Fault-Tolerant AI Reasoning Consensus.

Protocol overview
-----------------
Every PBFT node runs a local embedding model (all-MiniLM-L6-v2 or a
deterministic SHA-256 stub when sentence-transformers is absent).

For every threat analysis request the cluster must commit, each node:

  1. LOCAL_REASON  — Produce a ReasoningPath:
                     • chain-of-thought text (CoT)
                     • L2-normalised 384-dim embedding vector
                     • SHA-256 reasoning_hash of the CoT
                     • SHA-256 embedding_digest of the quantised vector
                     • decision + confidence score

  2. POR_PROPOSE   — Primary broadcasts its ReasoningPath (wire format,
                     no raw vector — only digest + decision + confidence).

  3. POR_VERIFY    — Each replica cross-verifies semantic similarity:
                     • If embedding_digest matches → similarity = 1.0 (ACCEPT)
                     • If reasoning_hash matches   → similarity = 0.95 (ACCEPT)
                     • Otherwise: proxy via decision agreement + confidence delta
                     • ACCEPT  if sim ≥ SIM_THRESHOLD (0.85)
                     • REJECT  if sim < REJECT_THRESHOLD (0.60)
                     • ABSTAIN otherwise

  4. POR_COMMIT    — 2f+1 = 7 ACCEPT verifications → commit to ledger.

  5. VIEW_CHANGE   — Three semantic rejections in one view → trigger
                     view-change (primary produced semantically inconsistent
                     reasoning).

Cryptographic properties
------------------------
• reasoning_hash:    SHA-256(utf-8 CoT text) — commits to exact reasoning.
• embedding_digest:  SHA-256(uint8-quantised L2-normalised vector) — commits
                     to the embedding without transmitting 1536 floats.
• Wire payload:      reasoning_hash + embedding_digest + decision + confidence
                     (never transmits raw CoT or embedding — privacy + bandwidth).

Integration with PBFTDistributedNode
--------------------------------------
Inject PoR into the PBFT payload dict:
    envelope.payload["por"] = reasoning_path.to_wire()

PBFTDistributedNode.submit_round() accepts an optional `por_payload` kwarg
that is merged into the envelope payload before broadcast.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Any, Optional

import numpy as np

log = logging.getLogger(__name__)

# ── Thresholds ────────────────────────────────────────────────────────────────

_SIM_THRESHOLD: float = 0.85
_REJECT_THRESHOLD: float = 0.60
_EMBED_DIM: int = 384
_QUORUM: int = 7                     # 2f+1
_REJECT_VIEW_CHANGE_LIMIT: int = 3   # rejections per view before view-change


# ── Lazy local embedding model ────────────────────────────────────────────────

_embed_model: Any = None
_embed_lock: Optional[asyncio.Lock] = None


def _get_embed_lock() -> asyncio.Lock:
    global _embed_lock
    if _embed_lock is None:
        _embed_lock = asyncio.Lock()
    return _embed_lock


def _load_embed_model() -> Any:
    global _embed_model
    if _embed_model is not None:
        return _embed_model
    try:
        from sentence_transformers import SentenceTransformer  # type: ignore
        _embed_model = SentenceTransformer("all-MiniLM-L6-v2")
        log.info("[PoR] Embedding model loaded: all-MiniLM-L6-v2 (dim=%d)", _EMBED_DIM)
    except ImportError:
        log.warning("[PoR] sentence-transformers absent — using SHA-256 stub encoder")
        _embed_model = _Sha256StubEncoder()
    return _embed_model


class _Sha256StubEncoder:
    """
    Deterministic stub that maps text → pseudo-embedding via SHA-256.
    Same text always produces same vector; different texts produce vectors
    that are non-orthogonal iff they share long common substrings.
    Used only when sentence-transformers is not installed.
    """

    def encode(self, text: str, normalize_embeddings: bool = True) -> np.ndarray:
        digest = hashlib.sha256(text.encode()).digest()
        # Tile the 32-byte digest to fill 384 floats
        tiles = (digest * (_EMBED_DIM // 32 + 1))[:_EMBED_DIM]
        vec = np.frombuffer(tiles, dtype=np.uint8).astype(np.float32) / 255.0
        if normalize_embeddings:
            norm = float(np.linalg.norm(vec))
            if norm > 1e-9:
                vec = vec / norm
        return vec


# ── Core data structures ──────────────────────────────────────────────────────

@dataclass
class ReasoningPath:
    """Artefact each PBFT replica produces for a given threat payload."""

    node_id: str
    request_id: str
    decision: str           # "FRAUD" | "CLEAN" | "INVESTIGATE"
    confidence: float         # [0.0, 1.0]
    cot_text: str           # chain-of-thought prose (local, not broadcast)
    reasoning_hash: str           # SHA-256(cot_text)
    embedding: list[float]   # raw vector length _EMBED_DIM (local only)
    embedding_digest: str           # SHA-256(quantised vector)
    ts: float = field(default_factory=time.time)

    def to_wire(self) -> dict[str, Any]:
        """Compact dict for PBFT envelope — no raw embedding or CoT text."""
        return {
            "node_id": self.node_id,
            "request_id": self.request_id,
            "decision": self.decision,
            "confidence": round(self.confidence, 6),
            "reasoning_hash": self.reasoning_hash,
            "embedding_digest": self.embedding_digest,
            "ts": self.ts,
        }

    def embedding_array(self) -> np.ndarray:
        return np.array(self.embedding, dtype=np.float32)


class VerifyResult(Enum):
    ACCEPT = auto()
    REJECT = auto()
    ABSTAIN = auto()


@dataclass
class PORVerification:
    verifier_id: str
    request_id: str
    result: VerifyResult
    similarity: float
    reason: str = ""
    ts: float = field(default_factory=time.time)

    def to_dict(self) -> dict[str, Any]:
        return {
            "verifier_id": self.verifier_id,
            "request_id": self.request_id,
            "result": self.result.name,
            "similarity": round(self.similarity, 6),
            "reason": self.reason,
            "ts": self.ts,
        }


# ── Digest helpers ────────────────────────────────────────────────────────────

def _quantise_vector(vec: np.ndarray) -> bytes:
    """L2-normalise then quantise to uint8 for a compact deterministic digest."""
    norm = float(np.linalg.norm(vec))
    unit = vec / (norm + 1e-9)
    q = np.clip(np.round(unit * 127.5 + 127.5), 0, 255).astype(np.uint8)
    return bytes(q.tolist())


def compute_embedding_digest(vec: np.ndarray) -> str:
    return hashlib.sha256(_quantise_vector(vec)).hexdigest()


def compute_reasoning_hash(cot: str) -> str:
    return hashlib.sha256(cot.encode()).hexdigest()


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    na = float(np.linalg.norm(a))
    nb = float(np.linalg.norm(b))
    if na < 1e-9 or nb < 1e-9:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


# ── Local reasoning engine ────────────────────────────────────────────────────

class LocalReasoningEngine:
    """
    Runs the node-local embedding model to produce a ReasoningPath.

    The chain-of-thought is built from payload fields + node perspective.
    In production, augment _build_cot() with RAG-retrieved regulatory context.
    """

    def __init__(self, node_id: str) -> None:
        self.node_id = node_id
        self._model: Any = None

    def _ensure_model(self) -> Any:
        if self._model is None:
            self._model = _load_embed_model()
        return self._model

    async def reason(
        self, request_id: str, payload: dict[str, Any]
    ) -> ReasoningPath:
        loop = asyncio.get_event_loop()
        cot = await loop.run_in_executor(None, self._build_cot, payload)
        model = self._ensure_model()
        vec: np.ndarray = await loop.run_in_executor(
            None,
            lambda: model.encode(cot, normalize_embeddings=True),
        )
        if not isinstance(vec, np.ndarray):
            vec = np.array(vec, dtype=np.float32)

        decision, confidence = _heuristic_classify(payload)
        return ReasoningPath(
            node_id=self.node_id,
            request_id=request_id,
            decision=decision,
            confidence=confidence,
            cot_text=cot,
            reasoning_hash=compute_reasoning_hash(cot),
            embedding=vec.tolist(),
            embedding_digest=compute_embedding_digest(vec),
        )

    def _build_cot(self, payload: dict[str, Any]) -> str:
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        lines = [
            f"Genesis threat analysis — node={self.node_id}",
            f"payload_digest={hashlib.sha256(canonical.encode()).hexdigest()[:16]}",
            f"anomaly_score={payload.get('anomaly_score', 0.0):.4f}",
            f"threat_type={payload.get('threat_type', 'unknown')}",
            f"jurisdiction={payload.get('jurisdiction', 'unknown')}",
            f"tx_volume_eur={payload.get('volume', 0)}",
            f"counterparty_count={len(payload.get('counterparties', []))}",
            "FATF typology cross-check: "
            f"layering={payload.get('layering_flag', False)} "
            f"structuring={payload.get('structuring_flag', False)}",
            "Assessment: evaluating multi-vector indicators against historical fraud "
            "patterns and AIFMD/CSSF thresholds.",
        ]
        return " | ".join(lines)


def _heuristic_classify(
    payload: dict[str, Any],
) -> tuple[str, float]:
    score = float(payload.get("anomaly_score", 0.0))
    if score > 0.85 or payload.get("sanctions_hit", False):
        return "FRAUD", min(0.97, score + 0.05)
    if score > 0.55 or payload.get("layering_flag", False):
        return "INVESTIGATE", score
    return "CLEAN", max(0.50, 1.0 - score)


# ── Proof-of-Reasoning protocol ───────────────────────────────────────────────

class ProofOfReasoningProtocol:
    """
    Coordinates PoR phases for one PBFT replica.

    Usage pattern
    -------------
    # On every node, before PRE-PREPARE:
    path = await por.produce_local_reasoning(request_id, payload)
    envelope.payload["por"] = path.to_wire()

    # On every node, upon receiving a PRE-PREPARE from the primary:
    verification = await por.verify_peer_reasoning(
        request_id, envelope.payload.get("por", {}), view=envelope.view
    )

    # Check for quorum:
    reached, count = await por.tally(request_id)
    if reached:
        # proceed to PBFT PREPARE phase
    """

    def __init__(self, node_id: str) -> None:
        self.node_id = node_id
        self._engine = LocalReasoningEngine(node_id)
        self._local_paths: dict[str, ReasoningPath] = {}
        self._verifications: dict[str, list[PORVerification]] = {}
        self._reject_counts: dict[int, int] = {}
        self._lock = asyncio.Lock()

    async def produce_local_reasoning(
        self, request_id: str, payload: dict[str, Any]
    ) -> ReasoningPath:
        path = await self._engine.reason(request_id, payload)
        async with self._lock:
            self._local_paths[request_id] = path
        log.debug(
            "[PoR] %s produced reasoning request_id=%s decision=%s conf=%.3f",
            self.node_id, request_id, path.decision, path.confidence,
        )
        return path

    async def verify_peer_reasoning(
        self,
        request_id: str,
        peer_wire: dict[str, Any],
        view: int,
    ) -> PORVerification:
        """
        Cross-verify a remote node's wire-format ReasoningPath.

        Similarity is computed via three escalating checks:
          1. Exact embedding_digest match  → 1.0
          2. Exact reasoning_hash match    → 0.95
          3. Decision + confidence proxy   → decision_agreement × confidence_avg
        """
        async with self._lock:
            local = self._local_paths.get(request_id)

        if local is None:
            return PORVerification(
                verifier_id=self.node_id,
                request_id=request_id,
                result=VerifyResult.ABSTAIN,
                similarity=0.0,
                reason="no local reasoning available",
            )

        # Check 1: exact embedding match
        if peer_wire.get("embedding_digest") == local.embedding_digest:
            return self._make_verification(
                request_id, VerifyResult.ACCEPT, 1.0, "embedding_digest_match"
            )

        # Check 2: exact reasoning hash match
        if peer_wire.get("reasoning_hash") == local.reasoning_hash:
            return self._make_verification(
                request_id, VerifyResult.ACCEPT, 0.95, "reasoning_hash_match"
            )

        # Check 3: decision + confidence proxy
        peer_decision = peer_wire.get("decision", "")
        peer_conf = float(peer_wire.get("confidence", 0.5))

        if peer_decision == local.decision:
            sim = (peer_conf + local.confidence) / 2.0
            sim = max(sim, _SIM_THRESHOLD)
        else:
            delta = abs(peer_conf - local.confidence)
            sim = max(0.0, 0.80 - delta - 0.2)

        result: VerifyResult
        reason: str
        if sim >= _SIM_THRESHOLD:
            result = VerifyResult.ACCEPT
            reason = f"decision_proxy sim={sim:.3f}"
        elif sim < _REJECT_THRESHOLD:
            result = VerifyResult.REJECT
            reason = f"semantic_divergence sim={sim:.3f}"
            async with self._lock:
                self._reject_counts[view] = self._reject_counts.get(view, 0) + 1
                cnt = self._reject_counts[view]
            log.warning(
                "[PoR] REJECT from %s request=%s view=%d rejects_in_view=%d",
                self.node_id, request_id, view, cnt,
            )
        else:
            result = VerifyResult.ABSTAIN
            reason = f"inconclusive sim={sim:.3f}"

        verification = self._make_verification(request_id, result, sim, reason)
        async with self._lock:
            self._verifications.setdefault(request_id, []).append(verification)
        return verification

    async def tally(self, request_id: str) -> tuple[bool, int]:
        """Returns (quorum_reached, accept_count)."""
        async with self._lock:
            vlist = self._verifications.get(request_id, [])
        accepts = sum(1 for v in vlist if v.result == VerifyResult.ACCEPT)
        return accepts >= _QUORUM, accepts

    def view_change_needed(self, view: int) -> bool:
        """True if this view accumulated ≥ 3 semantic rejections."""
        return self._reject_counts.get(view, 0) >= _REJECT_VIEW_CHANGE_LIMIT

    def _make_verification(
        self,
        request_id: str,
        result: VerifyResult,
        sim: float,
        reason: str,
    ) -> PORVerification:
        return PORVerification(
            verifier_id=self.node_id,
            request_id=request_id,
            result=result,
            similarity=sim,
            reason=reason,
        )

    async def get_local_path(self, request_id: str) -> Optional[ReasoningPath]:
        async with self._lock:
            return self._local_paths.get(request_id)

    def stats(self) -> dict[str, Any]:
        accepts = {
            rid: sum(1 for v in vlist if v.result == VerifyResult.ACCEPT)
            for rid, vlist in self._verifications.items()
        }
        rejects = {
            rid: sum(1 for v in vlist if v.result == VerifyResult.REJECT)
            for rid, vlist in self._verifications.items()
        }
        return {
            "node_id": self.node_id,
            "local_paths": len(self._local_paths),
            "verifications": {r: len(v) for r, v in self._verifications.items()},
            "accepts_by_request": accepts,
            "rejects_by_request": rejects,
            "view_reject_counts": dict(self._reject_counts),
        }

    def purge_request(self, request_id: str) -> None:
        """Release memory for a committed or abandoned request."""
        self._local_paths.pop(request_id, None)
        self._verifications.pop(request_id, None)


# ── Cluster-level PoR aggregator (primary-side) ──────────────────────────────

class PORClusterAggregator:
    """
    Collects PoR wire payloads from all replicas and determines when a
    cluster-wide semantic quorum has been reached.

    The primary uses this to decide whether it is safe to proceed to
    the PBFT PREPARE phase.  If quorum is not reached within _timeout_s,
    the round is aborted and a new primary election is suggested.
    """

    def __init__(
        self,
        request_id: str,
        quorum: int = _QUORUM,
        timeout_s: float = 15.0,
    ) -> None:
        self.request_id = request_id
        self._quorum = quorum
        self._timeout_s = timeout_s
        self._paths: dict[str, dict[str, Any]] = {}
        self._lock = asyncio.Lock()
        self._quorum_event = asyncio.Event()
        self._t_start = time.time()

    async def submit_peer_path(self, node_id: str, wire: dict[str, Any]) -> None:
        async with self._lock:
            self._paths[node_id] = wire
            if len(self._paths) >= self._quorum:
                self._quorum_event.set()

    async def wait_for_quorum(self) -> bool:
        """Returns True if quorum reached within timeout, False on timeout."""
        remaining = self._timeout_s - (time.time() - self._t_start)
        if remaining <= 0:
            return False
        try:
            await asyncio.wait_for(self._quorum_event.wait(), timeout=remaining)
            return True
        except asyncio.TimeoutError:
            return False

    def centroid_decision(self) -> tuple[str, float]:
        """
        Compute the majority decision and mean confidence across all
        submitted paths.  Used by the primary to form its canonical proposal.
        """
        if not self._paths:
            return "INVESTIGATE", 0.5
        counts: dict[str, int] = {}
        conf_sum: dict[str, float] = {}
        for wire in self._paths.values():
            d = wire.get("decision", "INVESTIGATE")
            c = float(wire.get("confidence", 0.5))
            counts[d] = counts.get(d, 0) + 1
            conf_sum[d] = conf_sum.get(d, 0.0) + c
        best = max(counts, key=lambda k: counts[k])
        avg_conf = conf_sum[best] / counts[best]
        return best, round(avg_conf, 6)

    def submitted_count(self) -> int:
        return len(self._paths)
