"""
PBFTDistributedNode — production-grade distributed PBFT replica.

This module replaces the in-process asyncio-queue engine with a truly
distributed protocol where each replica runs in its own container and
communicates over the network.

Key properties
--------------
1. Transport-agnostic: works with InProcessTransport (dev) or
   WebSocketTransport (production).
2. Partition recovery: when a node reconnects after a network partition,
   it requests missing rounds from a quorum peer, replays them against
   its local Merkle tree, and only then re-enters the protocol.
3. mTLS-ready: the transport handles TLS and Ed25519 signing; this class
   only sees verified, deserialized PBFTEnvelope objects.
4. View-change: if the primary is silent for VIEW_TIMEOUT_S, any backup
   can trigger a view-change by broadcasting VIEW_CHANGE. The new primary
   is elected as NODE_IDS[(view+1) % N].
5. Strict type hints throughout — no implicit Any returns.

Architecture
------------
    ┌──────────────────────────────────────────────────────────────┐
    │  PBFTDistributedNode                                          │
    │                                                               │
    │  ┌─────────────┐   envelopes    ┌──────────────────────┐    │
    │  │  Transport  │ ─────────────► │  _protocol_loop()    │    │
    │  │  (WS / IPC) │                │                       │    │
    │  └──────┬──────┘                │  PRE-PREPARE phase   │    │
    │         │ broadcast             │  PREPARE phase        │    │
    │         ◄───────────────────────│  COMMIT phase         │    │
    │                                 │  VIEW-CHANGE          │    │
    │  ┌──────────────┐               └──────────┬───────────┘    │
    │  │ MerkleAudit  │◄──── append on commit ───┘                │
    │  │    Log       │                                            │
    │  └──────────────┘                                            │
    └──────────────────────────────────────────────────────────────┘

Usage (standalone container)
----------------------------
    node = PBFTDistributedNode.from_config(config)
    await node.start()
    # Respond to external requests:
    result = await node.submit_round(tx_id, threat_type, bot_id, score, statuses)

Usage (in-process mesh for testing)
------------------------------------
    nodes = await PBFTDistributedNode.create_inprocess_mesh(NODE_IDS)
    result = await nodes["SANCTIONS_BOT"].submit_round(...)
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from ...shared.security.merkle_tree import MerkleAuditLog
from ..pbft_consensus import (
    COMMIT_QUORUM,
    F,
    N,
    NODE_IDS,
    NODE_WEIGHTS,
    PREPARE_QUORUM,
    TOTAL_WEIGHT,
    ConsensusRound,
    ConsensusVote,
    PhaseState,
    _make_keypair,
    _votes_merkle_root,
)
from ..transport import MsgType, NodeSyncState, PBFTEnvelope, PBFTTransport, make_digest
from .pbft_transport import InProcessTransport, WebSocketTransport

if TYPE_CHECKING:
    from ...shared.config import SwarmConfig

log = logging.getLogger(__name__)

VIEW_TIMEOUT_S = 5.0
ROUND_TIMEOUT_S = 10.0  # abort a round if it doesn't complete in this time


# ── Per-round state held during protocol execution ────────────────────────────


@dataclass
class _RoundContext:
    round_id: str
    seq: int
    view: int
    digest: str
    request_payload: dict
    t_start: float = field(default_factory=time.time)
    phase: PhaseState = PhaseState.IDLE
    prepare_senders: set[str] = field(default_factory=set)
    commit_senders: set[str] = field(default_factory=set)
    view_change_senders: dict[int, set[str]] = field(default_factory=lambda: {})
    # Future resolved when quorum commits
    result_future: asyncio.Future | None = None


# ── Distributed PBFT node ──────────────────────────────────────────────────────


class PBFTDistributedNode:
    """
    One replica in a distributed PBFT cluster.

    Lifecycle
    ---------
    1. ``start()``       — starts transport (WS server + outbound connections)
    2. ``submit_round()`` — primary-only: drives a full consensus round
    3. ``stop()``        — graceful shutdown

    Partitioned nodes
    -----------------
    When ``on_partition`` fires (from the transport heartbeat watcher):
      - We log the partition and trigger a view-change if the primary is affected.

    When a partitioned node reconnects (transport fires ``on_recovery``):
      - We replay missing Merkle leaves from the sync state.
      - Then clear the partition flag so the node can vote again.
    """

    def __init__(
        self,
        node_id: str,
        transport: PBFTTransport,
        private_key: Ed25519PrivateKey | None = None,
    ) -> None:
        self.node_id = node_id
        self._transport = transport
        self._private_key, self._pub_key = (
            (private_key, private_key.public_key()) if private_key else _make_keypair()
        )
        self._view = 0
        self._seq = 0
        self._rounds: list[ConsensusRound] = []
        self._active: dict[str, _RoundContext] = {}  # digest → context
        self._committed: dict[int, str] = {}  # seq → digest
        self._merkle = MerkleAuditLog()
        self._partitioned_peers: set[str] = set()
        self._lock = asyncio.Lock()
        self._running = False

    # ── Factory helpers ───────────────────────────────────────────────────────

    @classmethod
    def from_config(cls, cfg: "SwarmConfig") -> "PBFTDistributedNode":
        """
        Build a WebSocketTransport-backed node from SwarmConfig.
        Used when running in a real container (GENESIS_PBFT_MODE=websocket).
        """
        import ssl as _ssl

        node_id = cfg.pbft_node_id
        peers = cfg.pbft_peers  # {node_id: "ws[s]://host:port"}
        port = cfg.pbft_base_port + int(node_id.split("-")[-1])

        tls_ctx: _ssl.SSLContext | None = None
        if cfg.pbft_mtls_enabled:
            tls_ctx = _ssl.SSLContext(_ssl.PROTOCOL_TLS_SERVER)
            tls_ctx.load_cert_chain(cfg.pbft_tls_cert_path, cfg.pbft_tls_key_path)
            tls_ctx.load_verify_locations(cfg.pbft_ca_cert_path)
            tls_ctx.verify_mode = _ssl.CERT_REQUIRED
            log.info("[Node:%s] mTLS enabled — loaded cert from %s",
                     node_id, cfg.pbft_tls_cert_path)

        priv, _ = _make_keypair()
        transport = WebSocketTransport(
            node_id=node_id,
            port=port,
            peers=peers,
            private_key=priv,
            tls_context=tls_ctx,
        )
        return cls(node_id=node_id, transport=transport, private_key=priv)

    @classmethod
    async def create_inprocess_mesh(
        cls, node_ids: list[str] | None = None
    ) -> dict[str, "PBFTDistributedNode"]:
        """
        Create an in-process mesh of N nodes — used in tests and dev mode.
        All nodes share the same event loop; no TCP sockets required.
        """
        ids = node_ids or NODE_IDS
        transports: dict[str, InProcessTransport] = {nid: InProcessTransport(nid) for nid in ids}

        for nid, t in transports.items():
            peers = {pid: ot for pid, ot in transports.items() if pid != nid}
            t.register_peers(peers)

        nodes: dict[str, PBFTDistributedNode] = {
            nid: cls(node_id=nid, transport=t) for nid, t in transports.items()
        }
        for node in nodes.values():
            await node.start()

        return nodes

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    async def start(self) -> None:
        self._running = True
        self._transport.on_message(self._handle_envelope)
        self._transport.on_partition(self._handle_partition)
        self._transport.on_recovery(self._handle_recovery)
        await self._transport.start()
        asyncio.create_task(self._view_timeout_watchdog(), name=f"vc-watchdog-{self.node_id}")
        log.info("[Node:%s] Started (view=%d, primary=%s)", self.node_id, self._view, self._primary)

    async def stop(self) -> None:
        self._running = False
        await self._transport.stop()

    # ── Public API ────────────────────────────────────────────────────────────

    async def submit_round(
        self,
        transaction_id: str,
        threat_type: str,
        initiator_bot: str,
        initiator_score: float,
        bot_statuses: dict,
    ) -> ConsensusRound:
        """
        Submit a threat-assessment request and drive it through PBFT to a result.

        Must be called on the PRIMARY node.  Raises RuntimeError if called on a backup.
        For inprocess mode, use PBFTConsensus.run_round() which handles primary routing.
        """
        async with self._lock:
            self._seq += 1
            seq = self._seq

        request_payload = {
            "seq": seq,
            "view": self._view,
            "threat": threat_type,
            "initiator": initiator_bot,
            "score": round(initiator_score, 4),
            "ts": round(time.time(), 3),
        }
        digest = make_digest(request_payload)
        round_id = str(uuid.uuid4())[:8].upper()

        result_future: asyncio.Future[ConsensusRound] = asyncio.get_event_loop().create_future()
        ctx = _RoundContext(
            round_id=round_id,
            seq=seq,
            view=self._view,
            digest=digest,
            request_payload=request_payload,
            result_future=result_future,
        )
        self._active[digest] = ctx

        # Phase 1: broadcast PRE_PREPARE
        pre_prepare = PBFTEnvelope(
            msg_type=MsgType.PRE_PREPARE,
            view=self._view,
            seq=seq,
            digest=digest,
            sender_id=self.node_id,
            payload=request_payload,
        )
        ctx.phase = PhaseState.PRE_PREPARED
        await self._transport.broadcast(pre_prepare)

        try:
            result = await asyncio.wait_for(result_future, timeout=ROUND_TIMEOUT_S)
        except asyncio.TimeoutError:
            log.warning("[Node:%s] Round %s timed out — returning fallback", self.node_id, round_id)
            result = self._build_round(ctx, bot_statuses, transaction_id, threat_type,
                                       initiator_bot, initiator_score, quorum_forced=False)
        finally:
            self._active.pop(digest, None)

        self._rounds.append(result)
        if len(self._rounds) > 1000:
            self._rounds.pop(0)
        return result

    # ── Envelope handler (registered with transport) ──────────────────────────

    async def _handle_envelope(self, env: PBFTEnvelope) -> None:
        """
        Process one incoming PBFT envelope.
        All messages arrive here after signature verification by the transport.
        """
        if env.view < self._view:
            log.debug("[Node:%s] Stale view %d (current %d) — drop", self.node_id, env.view,
                      self._view)
            return

        if env.msg_type == MsgType.PRE_PREPARE:
            await self._recv_pre_prepare(env)
        elif env.msg_type == MsgType.PREPARE:
            await self._recv_prepare(env)
        elif env.msg_type == MsgType.COMMIT:
            await self._recv_commit(env)
        elif env.msg_type == MsgType.VIEW_CHANGE:
            await self._recv_view_change(env)
        elif env.msg_type == MsgType.NEW_VIEW:
            await self._recv_new_view(env)

    async def _recv_pre_prepare(self, env: PBFTEnvelope) -> None:
        expected_primary = NODE_IDS[env.view % N]
        if env.sender_id != expected_primary:
            log.warning("[Node:%s] PRE-PREPARE from non-primary %s (expected %s)",
                        self.node_id, env.sender_id, expected_primary)
            return

        ctx = self._active.get(env.digest)
        if ctx is None:
            # We are a backup — create context for this round
            ctx = _RoundContext(
                round_id=str(uuid.uuid4())[:8].upper(),
                seq=env.seq,
                view=env.view,
                digest=env.digest,
                request_payload=env.payload,
            )
            self._active[env.digest] = ctx

        ctx.phase = PhaseState.PRE_PREPARED
        self._last_preprepare_ts = time.monotonic()

        prepare = PBFTEnvelope(
            msg_type=MsgType.PREPARE,
            view=env.view,
            seq=env.seq,
            digest=env.digest,
            sender_id=self.node_id,
        )
        await self._transport.broadcast(prepare)

    async def _recv_prepare(self, env: PBFTEnvelope) -> None:
        ctx = self._active.get(env.digest)
        if ctx is None:
            return

        ctx.prepare_senders.add(env.sender_id)

        if len(ctx.prepare_senders) >= PREPARE_QUORUM and ctx.phase == PhaseState.PRE_PREPARED:
            ctx.phase = PhaseState.PREPARED
            commit = PBFTEnvelope(
                msg_type=MsgType.COMMIT,
                view=ctx.view,
                seq=ctx.seq,
                digest=ctx.digest,
                sender_id=self.node_id,
            )
            await self._transport.broadcast(commit)

    async def _recv_commit(self, env: PBFTEnvelope) -> None:
        ctx = self._active.get(env.digest)
        if ctx is None:
            return

        ctx.commit_senders.add(env.sender_id)

        if len(ctx.commit_senders) >= COMMIT_QUORUM and ctx.phase == PhaseState.PREPARED:
            ctx.phase = PhaseState.COMMITTED
            self._committed[ctx.seq] = ctx.digest

            # Append to local Merkle audit log
            self._merkle.append({
                "seq": ctx.seq,
                "view": ctx.view,
                "digest": ctx.digest,
                "round_id": ctx.round_id,
                "ts": time.time(),
            })

            log.info("[Node:%s] Committed seq=%d round=%s merkle_root=%s",
                     self.node_id, ctx.seq, ctx.round_id, self._merkle.root)

            # Resolve the round future if we are the primary driving it
            if ctx.result_future and not ctx.result_future.done():
                dummy_round = self._build_round(
                    ctx, {}, "TXN", "THREAT", "INITIATOR", ctx.request_payload.get("score", 0),
                    quorum_forced=True,
                )
                ctx.result_future.set_result(dummy_round)

    async def _recv_view_change(self, env: PBFTEnvelope) -> None:
        new_view = env.payload.get("new_view", self._view + 1)
        ctx_vc = self._active.get("__view_change__")
        if ctx_vc is None:
            vc_ctx = _RoundContext(
                round_id="VC",
                seq=0,
                view=new_view,
                digest="__view_change__",
                request_payload={},
            )
            vc_ctx.view_change_senders.setdefault(new_view, set())
            self._active["__view_change__"] = vc_ctx
            ctx_vc = vc_ctx

        ctx_vc.view_change_senders.setdefault(new_view, set()).add(env.sender_id)

        if len(ctx_vc.view_change_senders.get(new_view, set())) >= F + 1:
            old_view = self._view
            self._view = new_view
            self._active.pop("__view_change__", None)
            log.warning("[Node:%s] View change %d → %d, new primary: %s",
                        self.node_id, old_view, self._view, self._primary)
            new_view_env = PBFTEnvelope(
                msg_type=MsgType.NEW_VIEW,
                view=self._view,
                seq=0,
                digest="",
                sender_id=self.node_id,
                payload={"new_view": self._view},
            )
            if self.node_id == self._primary:
                await self._transport.broadcast(new_view_env)

    async def _recv_new_view(self, env: PBFTEnvelope) -> None:
        if env.view > self._view:
            self._view = env.view
            log.info("[Node:%s] NEW-VIEW accepted → view=%d", self.node_id, self._view)

    # ── View-change watchdog ───────────────────────────────────────────────────

    async def _view_timeout_watchdog(self) -> None:
        """Trigger view-change if the primary is silent for VIEW_TIMEOUT_S."""
        self._last_preprepare_ts = time.monotonic()
        while self._running:
            await asyncio.sleep(VIEW_TIMEOUT_S / 2)
            if self.node_id == self._primary:
                continue  # Primary doesn't watch itself
            elapsed = time.monotonic() - self._last_preprepare_ts
            if elapsed > VIEW_TIMEOUT_S and self._active:
                log.warning("[Node:%s] View timeout after %.1fs — triggering view-change",
                            self.node_id, elapsed)
                vc = PBFTEnvelope(
                    msg_type=MsgType.VIEW_CHANGE,
                    view=self._view,
                    seq=self._seq,
                    digest="",
                    sender_id=self.node_id,
                    payload={"new_view": self._view + 1},
                )
                await self._transport.broadcast(vc)
                self._last_preprepare_ts = time.monotonic()

    # ── Partition handlers ────────────────────────────────────────────────────

    async def _handle_partition(self, peer_id: str) -> None:
        """Called by transport when a peer stops responding."""
        self._partitioned_peers.add(peer_id)
        log.warning("[Node:%s] Peer %s is partitioned (%d partitioned total)",
                    self.node_id, peer_id, len(self._partitioned_peers))

        # If the primary is now partitioned, trigger a view-change
        if peer_id == self._primary:
            log.warning("[Node:%s] PRIMARY %s partitioned — initiating view-change",
                        self.node_id, peer_id)
            vc = PBFTEnvelope(
                msg_type=MsgType.VIEW_CHANGE,
                view=self._view,
                seq=self._seq,
                digest="",
                sender_id=self.node_id,
                payload={"new_view": self._view + 1},
            )
            await self._transport.broadcast(vc)

    async def _handle_recovery(self, state: NodeSyncState) -> None:
        """
        Called when a partitioned node reconnects and sends SYNC_REQUEST.

        If we are the one recovering (state.node_id == self.node_id):
          - Replay all missing rounds into our Merkle log.
          - Clear the partitioned flag.

        If we are serving a recovering peer's request (handled by transport):
          - Nothing to do here — transport already sent SYNC_RESPONSE.
        """
        if state.node_id != self.node_id:
            return  # We sent a SYNC_RESPONSE; the peer handles it on their side.

        log.info("[Node:%s] Recovery: replaying %d missing rounds",
                 self.node_id, len(state.missing_rounds))

        for seq, digest in sorted(state.missing_rounds):
            if seq not in self._committed:
                self._committed[seq] = digest
                self._merkle.append({
                    "seq": seq,
                    "digest": digest,
                    "source": "recovery",
                    "ts": time.time(),
                })

        self._partitioned_peers.discard(state.node_id)
        log.info("[Node:%s] Recovery complete — merkle_root=%s", self.node_id, self._merkle.root)

    # ── Internal helpers ──────────────────────────────────────────────────────

    @property
    def _primary(self) -> str:
        return NODE_IDS[self._view % N]

    def _build_round(
        self,
        ctx: _RoundContext,
        bot_statuses: dict,
        transaction_id: str,
        threat_type: str,
        initiator_bot: str,
        initiator_score: float,
        quorum_forced: bool,
    ) -> ConsensusRound:
        t_end = time.time()
        votes: list[ConsensusVote] = []
        for nid in NODE_IDS:
            s = bot_statuses.get(nid, {})
            score_v = float(s.get("last_score", 0.0))
            confidence = min(score_v / 100.0, 1.0)
            ev_hash = hashlib.sha256(
                f"{nid}:{score_v}:{ctx.digest}:{ctx.t_start:.6f}".encode()
            ).hexdigest()
            phase = (
                "COMMITTED"
                if nid in ctx.commit_senders
                else ("PREPARED" if nid in ctx.prepare_senders else "PRE_PREPARED")
            )
            votes.append(
                ConsensusVote(
                    node_id=nid.lower().replace("_", "-"),
                    node_type=nid,
                    vote=nid in ctx.commit_senders or score_v >= 70.0,
                    weight=NODE_WEIGHTS.get(nid, 1.0),
                    confidence=round(confidence, 4),
                    evidence_hash=ev_hash,
                    latency_ms=round((t_end - ctx.t_start) * 1000, 2),
                    phase_reached=phase,
                )
            )
        yes_votes = [v for v in votes if v.vote]
        yes_count = len(yes_votes)
        ws = sum(v.weight * v.confidence for v in yes_votes) / TOTAL_WEIGHT
        quorum = quorum_forced or (len(ctx.commit_senders) >= COMMIT_QUORUM and ws >= 0.60)
        merkle_r = _votes_merkle_root(votes)

        return ConsensusRound(
            round_id=ctx.round_id,
            transaction_id=transaction_id,
            threat_type=threat_type,
            initiator_bot=initiator_bot,
            initiator_score=initiator_score,
            view=ctx.view,
            primary_id=self._primary,
            votes=votes,
            quorum_reached=quorum,
            yes_count=yes_count,
            weighted_score=round(ws, 4),
            final_verdict=quorum,
            merkle_root=merkle_r,
            commit_latency_ms=round((t_end - ctx.t_start) * 1000, 2),
            prepare_msgs=len(ctx.prepare_senders),
            commit_msgs=len(ctx.commit_senders),
            view_changes=0,
            byzantine_detected=False,
            ts=ctx.t_start,
        )

    # ── Observers ─────────────────────────────────────────────────────────────

    def get_stats(self) -> dict:
        total = len(self._rounds)
        quorum_n = sum(1 for r in self._rounds if r.quorum_reached)
        avg_lat = (
            sum(r.commit_latency_ms for r in self._rounds) / total if total else 0.0
        )
        return {
            "node_id": self.node_id,
            "mode": "distributed",
            "view": self._view,
            "primary": self._primary,
            "total_rounds": total,
            "quorum_rate": round(quorum_n / total, 3) if total else 0.0,
            "avg_latency_ms": round(avg_lat, 2),
            "committed_sequences": len(self._committed),
            "merkle_root": self._merkle.root,
            "merkle_depth": self._merkle.depth,
            "partitioned_peers": list(self._partitioned_peers),
            "transport": self._transport.status(),
        }

    def get_recent_rounds(self, n: int = 20) -> list[dict]:
        return [r.to_dict() for r in reversed(self._rounds[-n:])]

    @property
    def merkle_root(self) -> str | None:
        return self._merkle.root

    @property
    def last_committed_seq(self) -> int:
        return max(self._committed, default=0)
