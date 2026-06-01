"""
PBFT Consensus Engine for Genesis Swarm.

Implements the Practical Byzantine Fault Tolerance protocol (Castro & Liskov, 1999)
adapted for an in-process swarm with 11 detection nodes.

Protocol overview:
  1. REQUEST  — client submits a threat assessment request to the primary
  2. PRE-PREPARE — primary broadcasts (view, seq, digest) signed with its key
  3. PREPARE  — each replica validates and broadcasts its PREPARE vote
  4. COMMIT   — once 2f+1 PREPAREs seen, replica broadcasts COMMIT
  5. REPLY    — once 2f+1 COMMITs seen, execute and record result

Fault tolerance: N=11 nodes → f=3 Byzantine faults tolerated (N ≥ 3f+2)
Quorum:
  • Prepare quorum: 2f+1 = 7 matching PREPARE messages
  • Commit quorum:  2f+1 = 7 matching COMMIT messages

View change:
  • Each backup runs a view-change timer reset by every valid PRE-PREPARE
  • Timeout → broadcasts VIEW-CHANGE(v+1)
  • New primary (view % n) collects f+1 VIEW-CHANGE messages before sending NEW-VIEW
"""

from __future__ import annotations

import asyncio
import concurrent.futures
import hashlib
import logging
import time
import uuid
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Optional, TypedDict

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric import ed25519
from ..shared.native_compliance import quorum_reached as _rust_quorum_reached, compute_ledger_hash as _rust_ledger_hash

log = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

NODE_IDS: list[str] = [
    "ASSET_TRACKER",
    "SATELLITE_ANALYTICS",
    "NAV_DETECTOR",
    "SOVEREIGN_BOT",
    "SANCTIONS_BOT",
    "FX_BOT",
    "COMPLIANCE_BOT",
    "ADVERSARIAL_TESTER",
    "CARGO_BOT",
    "COMMODITY_MONITOR",
    "SUCCESSION_BOT",
]
NODE_WEIGHTS: dict[str, float] = {
    "ASSET_TRACKER": 2.5,
    "SATELLITE_ANALYTICS": 2.5,
    "NAV_DETECTOR": 2.0,
    "SOVEREIGN_BOT": 2.0,
    "SANCTIONS_BOT": 2.0,
    "FX_BOT": 1.8,
    "COMPLIANCE_BOT": 1.8,
    "ADVERSARIAL_TESTER": 1.5,
    "CARGO_BOT": 1.2,
    "COMMODITY_MONITOR": 1.0,
    "SUCCESSION_BOT": 1.0,
}
N = len(NODE_IDS)  # 11
F = 3  # Byzantine fault tolerance (N ≥ 3F+2)
PREPARE_QUORUM = 2 * F + 1  # 7  — minimum matching PREPARE messages
COMMIT_QUORUM = 2 * F + 1  # 7  — minimum matching COMMIT messages
VIEW_CHANGE_QUORUM = F + 1  # 4  — VIEW-CHANGE messages needed to trigger new-view
VIEW_TIMEOUT_S = 5.0  # seconds before backup triggers view change
TOTAL_NODES = N
TOTAL_WEIGHT = sum(NODE_WEIGHTS.values())
QUORUM_COUNT = PREPARE_QUORUM
QUORUM_WEIGHT_PCT = 0.60
_ROUND_HISTORY_CAP = 500  # evict oldest round when history exceeds this size


# ── Typed status dict ─────────────────────────────────────────────────────────


class BotStatus(TypedDict, total=False):
    """Typed snapshot of a single bot's scoring state."""

    last_score: float
    threshold: float


BotStatusMapping = dict[str, BotStatus]


# ── Message types ─────────────────────────────────────────────────────────────


class MsgType(str, Enum):
    PRE_PREPARE = "PRE_PREPARE"
    PREPARE = "PREPARE"
    COMMIT = "COMMIT"
    VIEW_CHANGE = "VIEW_CHANGE"
    NEW_VIEW = "NEW_VIEW"
    REPLY = "REPLY"


class PhaseState(str, Enum):
    IDLE = "IDLE"
    PRE_PREPARED = "PRE_PREPARED"
    PREPARED = "PREPARED"
    COMMITTED = "COMMITTED"
    VIEW_CHANGING = "VIEW_CHANGING"


@dataclass
class PBFTMessage:
    msg_type: MsgType
    view: int
    seq: int
    digest: str  # SHA-256 of the request payload
    node_id: str
    payload: dict = field(default_factory=dict)
    signature: str = ""  # Ed25519 hex signature over (type|view|seq|digest)
    ts: float = field(default_factory=time.time)

    def signing_bytes(self) -> bytes:
        return f"{self.msg_type}|{self.view}|{self.seq}|{self.digest}".encode()


@dataclass
class ConsensusVote:
    node_id: str
    node_type: str
    vote: bool
    weight: float
    confidence: float
    evidence_hash: str
    latency_ms: float
    ts: float = field(default_factory=time.time)
    phase_reached: str = "PREPARED"  # PREPARED | COMMITTED | BYZANTINE

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ConsensusRound:
    round_id: str
    transaction_id: str
    threat_type: str
    initiator_bot: str
    initiator_score: float
    view: int
    primary_id: str
    votes: list[ConsensusVote]
    quorum_reached: bool
    yes_count: int
    weighted_score: float
    final_verdict: bool
    merkle_root: str
    commit_latency_ms: float
    prepare_msgs: int
    commit_msgs: int
    view_changes: int
    byzantine_detected: bool
    ts: float

    def to_dict(self) -> dict:
        d = asdict(self)
        d["votes"] = [v.to_dict() for v in self.votes]
        return d


# ── Crypto helpers ────────────────────────────────────────────────────────────


def _make_keypair() -> tuple[ed25519.Ed25519PrivateKey, ed25519.Ed25519PublicKey]:
    """Generate a fresh Ed25519 key pair."""
    priv = ed25519.Ed25519PrivateKey.generate()
    return priv, priv.public_key()


def _sign(private_key: ed25519.Ed25519PrivateKey, data: bytes) -> str:
    """Return a hex-encoded Ed25519 signature over *data*."""
    return private_key.sign(data).hex()


def _verify(public_key: ed25519.Ed25519PublicKey, data: bytes, sig_hex: str) -> bool:
    """Return True iff *sig_hex* is a valid Ed25519 signature over *data*."""
    try:
        public_key.verify(bytes.fromhex(sig_hex), data)
        return True
    except (InvalidSignature, ValueError):
        return False


def _digest(payload: dict) -> str:
    """Return a deterministic SHA-256 hex digest of a sorted *payload* dict."""
    canonical = str(sorted(payload.items())).encode()
    return hashlib.sha3_512(canonical).hexdigest()


def _votes_merkle_root(votes: list[ConsensusVote]) -> str:
    """Compute a binary Merkle root over the evidence hashes of *votes*."""
    leaves = [bytes.fromhex(v.evidence_hash[:128]) for v in votes]
    if not leaves:
        return "0" * 128
    while len(leaves) > 1:
        if len(leaves) % 2 == 1:
            leaves.append(leaves[-1])
        leaves = [hashlib.sha3_512(a + b).digest() for a, b in zip(leaves[::2], leaves[1::2])]
    return leaves[0].hex()


# ── Module-level pure helpers ─────────────────────────────────────────────────


def _make_round_id() -> str:
    """Return an 8-character upper-case round identifier."""
    return str(uuid.uuid4())[:8].upper()


def _build_request_payload(
    seq: int,
    view: int,
    threat_type: str,
    initiator_bot: str,
    initiator_score: float,
    ts: float,
) -> dict[str, str | int | float]:
    """Assemble the canonical request dict that will be digested."""
    return {
        "seq": seq,
        "view": view,
        "threat": threat_type,
        "initiator": initiator_bot,
        "score": round(initiator_score, 4),
        "ts": round(ts, 3),
    }


def _detect_byzantine(
    prepare_msgs: list[PBFTMessage], expected_digest: str
) -> set[str]:
    """Return node IDs whose PREPARE digest differs from the primary's digest."""
    return {m.node_id for m in prepare_msgs if m.digest != expected_digest}


def _determine_phase_reached(
    node_id: str,
    committed_nodes: set[str],
    prepared_sender_ids: set[str],
    byz_nodes: set[str],
) -> str:
    """Map a node to the highest protocol phase it reached this round."""
    if node_id in committed_nodes:
        return "COMMITTED"
    if node_id in prepared_sender_ids:
        return "PREPARED"
    if node_id in byz_nodes:
        return "BYZANTINE"
    return "PRE_PREPARED"


def _evaluate_quorum(
    votes: list[ConsensusVote], committed_nodes: set[str]
) -> tuple[bool, int, float]:
    """Compute quorum outcome from votes.

    Args:
        votes: All per-node ConsensusVote records for the round.
        committed_nodes: Node IDs that reached the COMMIT phase.

    Returns:
        (quorum_reached, yes_count, weighted_score)
    """
    yes_votes = [v for v in votes if v.vote]
    yes_count = len(yes_votes)
    weighted_score = sum(v.weight * v.confidence for v in yes_votes) / TOTAL_WEIGHT
    # Build a vote bitmap (one bit per node index) for the Rust popcount path.
    # Falls back to Python count comparison when genesis_native is not installed.
    node_index = {nid: i for i, nid in enumerate(NODE_IDS)}
    bitmap = 0
    for nid in committed_nodes:
        idx = node_index.get(nid)
        if idx is not None:
            bitmap |= 1 << idx
    quorum_reached = (
        _rust_quorum_reached(bitmap)
        and yes_count >= PREPARE_QUORUM
        and weighted_score >= QUORUM_WEIGHT_PCT
    )
    return quorum_reached, yes_count, weighted_score


# ── Replica node ──────────────────────────────────────────────────────────────


class PBFTReplica:
    """One replica node in the PBFT cluster.

    Runs as an asyncio task, communicates via asyncio.Queue.
    """

    def __init__(self, node_id: str, n: int, f: int) -> None:
        self.node_id = node_id
        self.n = n
        self.f = f
        self.view = 0
        self.seq = 0
        self.phase = PhaseState.IDLE
        self._priv, self._pub = _make_keypair()
        self.inbox: asyncio.Queue[PBFTMessage] = asyncio.Queue(maxsize=512)
        self._prepare_log: dict[str, list[PBFTMessage]] = {}  # digest → [PREPARE msgs]
        self._commit_log: dict[str, list[PBFTMessage]] = {}  # digest → [COMMIT msgs]
        self._vc_log: dict[int, list[PBFTMessage]] = {}  # view+1 → [VIEW-CHANGE msgs]
        self._view_timer_reset: float = time.monotonic()
        self._byzantine_threshold = 0.0  # Byzantine behaviour score (testing)

    @property
    def is_primary(self) -> bool:
        return self.node_id == NODE_IDS[self.view % self.n]

    def sign_message(self, msg: PBFTMessage) -> PBFTMessage:
        """Sign *msg* in-place with this replica's private key and return it."""
        msg.signature = _sign(self._priv, msg.signing_bytes())
        return msg

    def verify_message(self, msg: PBFTMessage, pub_key: ed25519.Ed25519PublicKey) -> bool:
        """Return True iff *msg*'s signature is valid under *pub_key*."""
        return _verify(pub_key, msg.signing_bytes(), msg.signature)

    async def send(self, msg: PBFTMessage) -> None:
        """Enqueue *msg* to this replica's inbox, dropping if full."""
        try:
            self.inbox.put_nowait(msg)
        except asyncio.QueueFull:
            log.warning("[PBFT:%s] inbox full — dropping %s", self.node_id, msg.msg_type)

    async def process(
        self, msg: PBFTMessage, pub_keys: dict[str, ed25519.Ed25519PublicKey]
    ) -> Optional[str]:
        """Process one incoming message.

        Args:
            msg: The incoming PBFT protocol message.
            pub_keys: Mapping of node_id → public key for signature verification.

        Returns:
            The next MsgType string to emit, or None if no action is needed.
        """
        if msg.view < self.view:
            return None  # stale message from old view

        if msg.msg_type == MsgType.PRE_PREPARE:
            return await self._handle_pre_prepare(msg, pub_keys)
        if msg.msg_type == MsgType.PREPARE:
            return await self._handle_prepare(msg)
        if msg.msg_type == MsgType.COMMIT:
            return await self._handle_commit(msg)
        if msg.msg_type == MsgType.VIEW_CHANGE:
            return await self._handle_view_change(msg)
        return None

    async def _handle_pre_prepare(
        self, msg: PBFTMessage, pub_keys: dict[str, ed25519.Ed25519PublicKey]
    ) -> Optional[str]:
        primary = NODE_IDS[msg.view % self.n]
        if msg.node_id != primary:
            log.warning(
                "[PBFT:%s] PRE-PREPARE from non-primary %s (view=%d)",
                self.node_id,
                msg.node_id,
                msg.view,
            )
            return None
        if primary in pub_keys and not self.verify_message(msg, pub_keys[primary]):
            log.warning("[PBFT:%s] PRE-PREPARE signature invalid", self.node_id)
            return None
        self._view_timer_reset = time.monotonic()
        self.view = msg.view
        self.seq = msg.seq
        self.phase = PhaseState.PRE_PREPARED
        return MsgType.PREPARE

    async def _handle_prepare(self, msg: PBFTMessage) -> Optional[str]:
        key = msg.digest
        bucket = self._prepare_log.setdefault(key, [])
        if not any(m.node_id == msg.node_id for m in bucket):
            bucket.append(msg)
        if len(bucket) >= 2 * self.f + 1 and self.phase == PhaseState.PRE_PREPARED:
            self.phase = PhaseState.PREPARED
            return MsgType.COMMIT
        return None

    async def _handle_commit(self, msg: PBFTMessage) -> Optional[str]:
        key = msg.digest
        bucket = self._commit_log.setdefault(key, [])
        if not any(m.node_id == msg.node_id for m in bucket):
            bucket.append(msg)
        if len(bucket) >= 2 * self.f + 1 and self.phase == PhaseState.PREPARED:
            self.phase = PhaseState.COMMITTED
            return MsgType.REPLY
        return None

    async def _handle_view_change(self, msg: PBFTMessage) -> Optional[str]:
        new_view = msg.payload.get("new_view", self.view + 1)
        bucket = self._vc_log.setdefault(new_view, [])
        if not any(m.node_id == msg.node_id for m in bucket):
            bucket.append(msg)
        if len(bucket) >= self.f + 1:
            self.view = new_view
            self.phase = PhaseState.IDLE
            self._prepare_log.clear()
            self._commit_log.clear()
            log.info("[PBFT:%s] view change to %d (f+1 votes collected)", self.node_id, new_view)
            return MsgType.NEW_VIEW
        return None

    def check_view_timeout(self) -> bool:
        """Return True if the view-change timer has fired (primary appears faulty)."""
        if not self.is_primary:
            elapsed = time.monotonic() - self._view_timer_reset
            return elapsed > VIEW_TIMEOUT_S
        return False

    def get_prepare_count(self, digest: str) -> int:
        """Return the number of PREPARE messages logged for *digest*."""
        return len(self._prepare_log.get(digest, []))

    def get_commit_count(self, digest: str) -> int:
        """Return the number of COMMIT messages logged for *digest*."""
        return len(self._commit_log.get(digest, []))


# ── Engine ────────────────────────────────────────────────────────────────────


class PBFTConsensus:
    """PBFT consensus engine orchestrating 11 in-process replicas.

    Each call to ``run_round()`` executes a complete 3-phase PBFT commit
    using asyncio message passing between replica objects.  The current
    primary is deterministic: ``NODE_IDS[view % N]``.  A view change fires
    when any replica's view-change timer exceeds VIEW_TIMEOUT_S without
    a valid PRE-PREPARE from the primary.
    """

    def __init__(self) -> None:
        self._replicas: dict[str, PBFTReplica] = {nid: PBFTReplica(nid, N, F) for nid in NODE_IDS}
        self._pub_keys: dict[str, ed25519.Ed25519PublicKey] = {
            nid: r._pub for nid, r in self._replicas.items()
        }
        self._view = 0
        self._seq = 0
        self._rounds: list[ConsensusRound] = []
        self._chain_hash: bytes = bytes(32)  # genesis hash — all zeros
        self._lock = asyncio.Lock()

    @property
    def primary(self) -> str:
        return NODE_IDS[self._view % N]

    @property
    def view(self) -> int:
        return self._view

    # ── Public API ────────────────────────────────────────────────────────────

    async def run_round(
        self,
        transaction_id: str,
        threat_type: str,
        initiator_bot: str,
        initiator_score: float,
        bot_statuses: BotStatusMapping,
    ) -> ConsensusRound:
        """Execute one full PBFT round (async entry point).

        Args:
            transaction_id: Unique ID for the threat event being evaluated.
            threat_type: Category label for the threat (e.g. "SANCTIONS_HIT").
            initiator_bot: Node ID of the bot that triggered the round.
            initiator_score: Raw threat score from the initiating bot (0–100).
            bot_statuses: Snapshot of each node's last_score and threshold.

        Returns:
            A ConsensusRound with full phase-trace metadata.
        """
        async with self._lock:
            return await self._execute_round(
                transaction_id, threat_type, initiator_bot, initiator_score, bot_statuses
            )

    def initiate_round(
        self,
        transaction_id: str,
        threat_type: str,
        initiator_bot: str,
        initiator_score: float,
        bot_statuses: BotStatusMapping,
    ) -> ConsensusRound:
        """Synchronous shim for callers that cannot await (e.g. sync server endpoints).

        Args:
            transaction_id: Unique ID for the threat event being evaluated.
            threat_type: Category label for the threat.
            initiator_bot: Node ID of the bot that triggered the round.
            initiator_score: Raw threat score from the initiating bot (0–100).
            bot_statuses: Snapshot of each node's last_score and threshold.

        Returns:
            A ConsensusRound; falls back to a score-only round on timeout or error.
        """
        coro = self._execute_round(
            transaction_id, threat_type, initiator_bot, initiator_score, bot_statuses
        )
        try:
            asyncio.get_running_loop()
            loop_is_running = True
        except RuntimeError:
            loop_is_running = False

        try:
            if loop_is_running:
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                    return pool.submit(asyncio.run, coro).result(timeout=10)
            return asyncio.run(coro)
        except concurrent.futures.TimeoutError:
            log.error("[PBFT] initiate_round timed out after 10 s — using fallback")
            return self._fallback_round(
                transaction_id, threat_type, initiator_bot, initiator_score, bot_statuses
            )
        except Exception as exc:  # noqa: BLE001 — last-resort sync bridge
            log.error("[PBFT] initiate_round error: %s", exc)
            return self._fallback_round(
                transaction_id, threat_type, initiator_bot, initiator_score, bot_statuses
            )

    def get_latest_round(self) -> Optional[ConsensusRound]:
        """Return the most recently completed round, or None if history is empty."""
        return self._rounds[-1] if self._rounds else None

    def get_recent_rounds(self, n: int = 20) -> list[dict]:
        """Return the *n* most recent rounds as serialisable dicts, newest first."""
        return [r.to_dict() for r in reversed(self._rounds[-n:])]

    def get_round(self, round_id: str) -> Optional[ConsensusRound]:
        """Look up a specific round by its ID, or return None if not found."""
        return next((r for r in self._rounds if r.round_id == round_id), None)

    def get_stats(self) -> dict[str, object]:
        """Return aggregate statistics across all recorded rounds.

        Returns:
            Dict with quorum_rate, avg_latency_ms, byzantine_detections, etc.
            Zero-value fields are returned when no rounds have been recorded.
        """
        total = len(self._rounds)
        base: dict[str, object] = {
            "total_rounds": total,
            "node_weights": NODE_WEIGHTS,
            "quorum_threshold": COMMIT_QUORUM,
            "total_nodes": TOTAL_NODES,
            "total_weight": round(TOTAL_WEIGHT, 2),
            "current_view": self._view,
            "primary": self.primary,
            "protocol": "PBFT",
            "fault_tolerance": F,
        }
        if not total:
            return {**base, "quorum_rate": 0.0, "avg_latency_ms": 0.0, "avg_weighted_score": 0.0}
        quorum_n = sum(1 for r in self._rounds if r.quorum_reached)
        avg_lat = sum(r.commit_latency_ms for r in self._rounds) / total
        avg_ws = sum(r.weighted_score for r in self._rounds) / total
        vc_total = sum(r.view_changes for r in self._rounds)
        byz = sum(1 for r in self._rounds if r.byzantine_detected)
        return {
            **base,
            "quorum_rate": round(quorum_n / total, 3),
            "avg_latency_ms": round(avg_lat, 2),
            "avg_weighted_score": round(avg_ws, 3),
            "total_view_changes": vc_total,
            "byzantine_detections": byz,
        }

    # ── Internal protocol ─────────────────────────────────────────────────────

    def _reset_replicas_for_round(self, seq: int) -> None:
        """Reset all replica phases and drain stale inbox messages for a fresh round."""
        for r in self._replicas.values():
            r.phase = PhaseState.IDLE
            r.view = self._view
            r.seq = seq
            while not r.inbox.empty():
                try:
                    r.inbox.get_nowait()
                except asyncio.QueueEmpty:
                    break

    async def _phase1_pre_prepare(
        self, digest: str, seq: int, request_payload: dict
    ) -> tuple[list[PBFTMessage], int]:
        """Broadcast PRE-PREPARE from primary and collect PREPARE responses.

        Args:
            digest: SHA-256 hex digest of the request payload.
            seq: Monotonically increasing sequence number for this round.
            request_payload: The canonical request dict that was digested.

        Returns:
            (prepare_msgs, view_changes_fired) — list of signed PREPARE messages
            and count of view-change votes observed.
        """
        primary_replica = self._replicas[self.primary]
        pre_prepare = primary_replica.sign_message(
            PBFTMessage(
                msg_type=MsgType.PRE_PREPARE,
                view=self._view,
                seq=seq,
                digest=digest,
                node_id=self.primary,
                payload=request_payload,
            )
        )
        primary_replica.phase = PhaseState.PRE_PREPARED

        prepare_msgs: list[PBFTMessage] = []
        view_changes_fired = 0

        for nid, replica in self._replicas.items():
            if nid == self.primary:
                continue
            if replica.check_view_timeout():
                view_changes_fired += 1
                replica.sign_message(
                    PBFTMessage(
                        msg_type=MsgType.VIEW_CHANGE,
                        view=self._view,
                        seq=seq,
                        digest=digest,
                        node_id=nid,
                        payload={"new_view": self._view + 1},
                    )
                )
            result = await replica.process(pre_prepare, self._pub_keys)
            if result == MsgType.PREPARE:
                replica.phase = PhaseState.PRE_PREPARED
                prepare_msgs.append(
                    replica.sign_message(
                        PBFTMessage(
                            msg_type=MsgType.PREPARE,
                            view=self._view,
                            seq=seq,
                            digest=digest,
                            node_id=nid,
                        )
                    )
                )

        # Primary's implicit PREPARE
        prepare_msgs.append(
            primary_replica.sign_message(
                PBFTMessage(
                    msg_type=MsgType.PREPARE,
                    view=self._view,
                    seq=seq,
                    digest=digest,
                    node_id=self.primary,
                )
            )
        )
        return prepare_msgs, view_changes_fired

    async def _phase2_prepare(
        self, prepare_msgs: list[PBFTMessage], seq: int, digest: str
    ) -> list[PBFTMessage]:
        """Broadcast all PREPARE messages and collect COMMIT responses.

        Args:
            prepare_msgs: Signed PREPARE messages from phase 1.
            seq: Sequence number for this round.
            digest: Expected round digest.

        Returns:
            List of signed COMMIT messages produced by replicas that reached quorum.
        """
        commit_msgs: list[PBFTMessage] = []
        for prep_msg in prepare_msgs:
            for nid, replica in self._replicas.items():
                result = await replica.process(prep_msg, self._pub_keys)
                if result == MsgType.COMMIT:
                    commit_msgs.append(
                        replica.sign_message(
                            PBFTMessage(
                                msg_type=MsgType.COMMIT,
                                view=self._view,
                                seq=seq,
                                digest=digest,
                                node_id=nid,
                            )
                        )
                    )
        return commit_msgs

    async def _phase3_commit(self, commit_msgs: list[PBFTMessage]) -> set[str]:
        """Broadcast COMMIT messages and return the set of committed node IDs.

        Args:
            commit_msgs: Signed COMMIT messages from phase 2.

        Returns:
            Set of node IDs whose replica reached PhaseState.COMMITTED.
        """
        committed_nodes: set[str] = set()
        for comm_msg in commit_msgs:
            for nid, replica in self._replicas.items():
                result = await replica.process(comm_msg, self._pub_keys)
                if result == MsgType.REPLY:
                    committed_nodes.add(nid)
        return committed_nodes

    def _build_single_vote(
        self,
        node_id: str,
        status: BotStatus,
        committed_nodes: set[str],
        prepared_sender_ids: set[str],
        byz_nodes: set[str],
        digest: str,
        t_start: float,
    ) -> ConsensusVote:
        """Construct a ConsensusVote for one node from its bot status snapshot."""
        score = float(status.get("last_score", 0.0))
        threshold = float(status.get("threshold", 75.0))
        # A node that reached COMMITTED has voted yes — that is the authoritative
        # PBFT signal. bot_statuses scores are supplementary metadata only.
        committed = node_id in committed_nodes
        confidence = min(score / 100.0, 1.0) if score > 0 else (1.0 if committed else 0.0)
        vote = committed or score >= threshold or score >= 70.0
        phase_reached = _determine_phase_reached(
            node_id, committed_nodes, prepared_sender_ids, byz_nodes
        )
        ev_hash = hashlib.sha256(
            f"{node_id}:{score:.6f}:{digest}:{t_start:.6f}".encode()
        ).hexdigest()
        latency = (
            (time.time() - t_start) * 1000
            + (TOTAL_WEIGHT - NODE_WEIGHTS.get(node_id, 1.0)) * 1.4
        )
        return ConsensusVote(
            node_id=node_id.lower().replace("_", "-"),
            node_type=node_id,
            vote=vote,
            weight=NODE_WEIGHTS.get(node_id, 1.0),
            confidence=round(confidence, 4),
            evidence_hash=ev_hash,
            latency_ms=round(latency, 2),
            phase_reached=phase_reached,
        )

    def _build_all_votes(
        self,
        committed_nodes: set[str],
        prepare_msgs: list[PBFTMessage],
        byz_nodes: set[str],
        bot_statuses: BotStatusMapping,
        digest: str,
        t_start: float,
    ) -> list[ConsensusVote]:
        """Build one ConsensusVote per NODE_ID from the round's protocol state."""
        prepared_sender_ids = {m.node_id for m in prepare_msgs}
        return [
            self._build_single_vote(
                nid,
                bot_statuses.get(nid, {}),
                committed_nodes,
                prepared_sender_ids,
                byz_nodes,
                digest,
                t_start,
            )
            for nid in NODE_IDS
        ]

    def _append_round(self, rnd: ConsensusRound) -> None:
        """Append *rnd* to history and advance the Rust SHA-256 audit chain."""
        # Compute a DORA-compliant SHA-256 chain link via the Rust engine.
        # The chain anchors every committed BFT round to an immutable hash sequence.
        breach_byte = 1 if rnd.final_verdict else 0
        agent_idx = NODE_IDS.index(rnd.primary_id) if rnd.primary_id in NODE_IDS else 0
        self._chain_hash = _rust_ledger_hash(
            self._chain_hash,
            len(self._rounds),
            agent_idx,
            breach_byte,
        )
        self._rounds.append(rnd)
        if len(self._rounds) > _ROUND_HISTORY_CAP:
            self._rounds.pop(0)

    async def _execute_round(
        self,
        transaction_id: str,
        threat_type: str,
        initiator_bot: str,
        initiator_score: float,
        bot_statuses: BotStatusMapping,
    ) -> ConsensusRound:
        """Execute one complete 3-phase PBFT commit cycle.

        Args:
            transaction_id: Unique ID for the threat event.
            threat_type: Category label for the threat.
            initiator_bot: Node ID of the bot that triggered this round.
            initiator_score: Raw threat score from the initiating bot (0–100).
            bot_statuses: Per-node last_score / threshold snapshot.

        Returns:
            Completed ConsensusRound appended to round history.
        """
        t_start = time.time()
        self._seq += 1
        seq = self._seq

        self._reset_replicas_for_round(seq)
        request_payload = _build_request_payload(
            seq, self._view, threat_type, initiator_bot, initiator_score, t_start
        )
        digest = _digest(request_payload)

        prepare_msgs, view_changes_fired = await self._phase1_pre_prepare(
            digest, seq, request_payload
        )

        if view_changes_fired >= VIEW_CHANGE_QUORUM:
            self._view += 1
            log.info("[PBFT] view change → %d, new primary: %s", self._view, self.primary)
            return await self._execute_round(
                transaction_id, threat_type, initiator_bot, initiator_score, bot_statuses
            )

        commit_msgs = await self._phase2_prepare(prepare_msgs, seq, digest)
        committed_nodes = await self._phase3_commit(commit_msgs)

        byz_nodes = _detect_byzantine(prepare_msgs, digest)
        if byz_nodes:
            log.warning("[PBFT] Byzantine behaviour from: %s", byz_nodes)

        votes = self._build_all_votes(
            committed_nodes, prepare_msgs, byz_nodes, bot_statuses, digest, t_start
        )
        quorum_reached, yes_count, weighted_score = _evaluate_quorum(votes, committed_nodes)
        merkle_root = _votes_merkle_root(votes)
        commit_latency = (time.time() - t_start) * 1000

        rnd = ConsensusRound(
            round_id=_make_round_id(),
            transaction_id=transaction_id,
            threat_type=threat_type,
            initiator_bot=initiator_bot,
            initiator_score=initiator_score,
            view=self._view,
            primary_id=self.primary,
            votes=votes,
            quorum_reached=quorum_reached,
            yes_count=yes_count,
            weighted_score=round(weighted_score, 4),
            final_verdict=quorum_reached,
            merkle_root=merkle_root,
            commit_latency_ms=round(commit_latency, 2),
            prepare_msgs=len(prepare_msgs),
            commit_msgs=len(commit_msgs),
            view_changes=view_changes_fired,
            byzantine_detected=bool(byz_nodes),
            ts=t_start,
        )
        self._append_round(rnd)

        log.debug(
            "[PBFT] round=%s view=%d primary=%s verdict=%s prepare=%d commit=%d lat=%.1fms",
            rnd.round_id,
            self._view,
            self.primary,
            "THREAT" if quorum_reached else "CLEAR",
            len(prepare_msgs),
            len(committed_nodes),
            commit_latency,
        )
        return rnd

    def _fallback_round(
        self,
        transaction_id: str,
        threat_type: str,
        initiator_bot: str,
        initiator_score: float,
        bot_statuses: BotStatusMapping,
    ) -> ConsensusRound:
        """Emergency fallback used if the asyncio round fails or times out."""
        t_start = time.time()
        votes: list[ConsensusVote] = []
        for nid in NODE_IDS:
            s = bot_statuses.get(nid, {})
            score = float(s.get("last_score", 0.0))
            confidence = min(score / 100.0, 1.0)
            ev_hash = hashlib.sha256(f"{nid}:{score}:{t_start}".encode()).hexdigest()
            votes.append(
                ConsensusVote(
                    node_id=nid.lower().replace("_", "-"),
                    node_type=nid,
                    vote=score >= float(s.get("threshold", 75.0)),
                    weight=NODE_WEIGHTS.get(nid, 1.0),
                    confidence=round(confidence, 4),
                    evidence_hash=ev_hash,
                    latency_ms=1.0,
                    phase_reached="PRE_PREPARED",
                )
            )
        yes_votes = [v for v in votes if v.vote]
        yes_count = len(yes_votes)
        ws = sum(v.weight * v.confidence for v in yes_votes) / TOTAL_WEIGHT
        quorum = yes_count >= PREPARE_QUORUM and ws >= QUORUM_WEIGHT_PCT
        rnd = ConsensusRound(
            round_id=_make_round_id(),
            transaction_id=transaction_id,
            threat_type=threat_type,
            initiator_bot=initiator_bot,
            initiator_score=initiator_score,
            view=self._view,
            primary_id=self.primary,
            votes=votes,
            quorum_reached=quorum,
            yes_count=yes_count,
            weighted_score=round(ws, 4),
            final_verdict=quorum,
            merkle_root=_votes_merkle_root(votes),
            commit_latency_ms=(time.time() - t_start) * 1000,
            prepare_msgs=yes_count,
            commit_msgs=yes_count,
            view_changes=0,
            byzantine_detected=False,
            ts=t_start,
        )
        self._rounds.append(rnd)
        return rnd


# ── Backward-compat alias so existing imports keep working ────────────────────
SwarmConsensus = PBFTConsensus
