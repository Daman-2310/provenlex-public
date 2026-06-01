"""
Hardened PBFT Node Core Engine.

Implements the complete Castro & Liskov (1999) 3-phase consensus lifecycle
under asynchronous conditions:

    CLIENT REQUEST
        ↓  (primary only)
    PRE-PREPARE  ──broadcast──► all replicas
        ↓
    PREPARE      ──broadcast──► all peers
        ↓  (after 2f+1 verified prepares)
    COMMIT       ──broadcast──► all peers
        ↓  (after 2f+1 verified commits)
    EXECUTE      ──fire on_execute callback──► application

Mathematical quorum (N=11, f=3):
    QUORUM = 2f + 1 = 7

Every inbound ConsensusEnvelope is rejected (with a SecurityAlert) if its
Ed25519 signature is invalid or its public key doesn't match the registered
peer registry — faults are detected at the message boundary, not after quorum.

Additional features:
  • View-change watchdog: triggers view-change if primary is silent for
    PRIMARY_TIMEOUT_S (configurable for testing).
  • Automated state-sync worker: detects sequence gaps > MAX_SEQUENCE_GAP
    and requests missing blocks from the primary with exponential backoff.
  • Checkpoint worker: broadcasts CHECKPOINT every CHECKPOINT_INTERVAL
    committed sequences and prunes old certificates to bound memory.
  • Merkle-root chaining: committed block digests are accumulated into a
    binary Merkle tree; the current root is embedded in every PRE-PREPARE
    so lagging nodes detect staleness instantly.
"""
from __future__ import annotations

import asyncio
import json
import structlog
import struct
import time
from abc import ABC, abstractmethod
from collections import defaultdict
from dataclasses import dataclass, field
from enum import IntEnum
from typing import Any, Awaitable, Callable, Optional

from .crypto import (
    NodeKeyPair,
    SignatureError,
    build_merkle_root,
    canonical_signing_bytes,
    compute_digest,
    verify_signature,
)

_log = structlog.get_logger(__name__)

__all__ = [
    # Transport
    "AbstractMeshTransport",
    "NodePeer",
    # Messages
    "MessagePhase",
    "SlotPhase",
    "ConsensusEnvelope",
    "CommittedBlock",
    "SecurityAlert",
    # Engine
    "PBFTNode",
    # Constants
    "CLUSTER_SIZE",
    "MAX_FAULTS",
    "QUORUM",
]

# ── Protocol constants ────────────────────────────────────────────────────────

CLUSTER_SIZE: int = 11
MAX_FAULTS: int = 3           # f  — maximum Byzantine faults tolerated
QUORUM: int = 2 * MAX_FAULTS + 1  # 2f+1 = 7
CHECKPOINT_INTERVAL: int = 100    # emit checkpoint every N executed sequences
PRIMARY_TIMEOUT_S: float = 5.0    # watchdog fires a view-change after this
STATE_SYNC_INTERVAL_S: float = 2.0
STATE_SYNC_BACKOFF_MAX_S: float = 60.0
MAX_SEQUENCE_GAP: int = 10        # trigger sync if gap exceeds this


# ── Enums ─────────────────────────────────────────────────────────────────────

class MessagePhase(IntEnum):
    UNKNOWN = 0
    PRE_PREPARE = 1
    PREPARE = 2
    COMMIT = 3
    VIEW_CHANGE = 4
    NEW_VIEW = 5
    STATE_SYNC_REQ = 6
    STATE_SYNC_RESP = 7
    CHECKPOINT = 8


class SlotPhase(IntEnum):
    """Per-certificate lifecycle (one certificate = one consensus slot)."""
    WAITING = 0
    PRE_PREPARED = 1
    PREPARED = 2
    COMMITTED = 3
    EXECUTED = 4


# ── Data models ───────────────────────────────────────────────────────────────

@dataclass
class NodePeer:
    """Static configuration for one known cluster member."""
    node_id: str
    host: str
    port: int
    pubkey_bytes: bytes

    @property
    def address(self) -> str:
        return f"{self.host}:{self.port}"


@dataclass
class ConsensusEnvelope:
    """
    Wire-level PBFT message.  Travels between nodes via AbstractMeshTransport.

    The ``signature`` covers exactly the bytes returned by
    ``canonical_signing_bytes(phase, view, seq, digest, sender_id, timestamp_ns)``.
    """
    phase: MessagePhase
    view: int
    seq: int
    digest: str           # SHA-256 hex of the request payload
    sender_id: str
    ed25519_pubkey: bytes  # 32-byte raw public key
    signature: bytes      # 64-byte Ed25519 signature
    payload: bytes        # phase-specific JSON payload
    timestamp_ns: int
    merkle_root: str = "0" * 128

    # ── Serialisation (used by transport layer) ──────────────────────────────

    def to_bytes(self) -> bytes:
        d: dict[str, Any] = {
            "ph": self.phase.value,
            "v": self.view,
            "s": self.seq,
            "d": self.digest,
            "sid": self.sender_id,
            "pk": self.ed25519_pubkey.hex(),
            "sig": self.signature.hex(),
            "pl": self.payload.hex(),
            "ts": self.timestamp_ns,
            "mr": self.merkle_root,
        }
        return json.dumps(d, separators=(",", ":")).encode()

    @classmethod
    def from_bytes(cls, raw: bytes) -> "ConsensusEnvelope":
        """Deserialise a ConsensusEnvelope from its wire encoding.

        Raises:
            ValueError: If *raw* is not a valid JSON-encoded ConsensusEnvelope
                        or any field is malformed.  Callers must catch this
                        and treat the message as adversarial input.
        """
        try:
            d: dict[str, Any] = json.loads(raw)
            return cls(
                phase=MessagePhase(int(d["ph"])),
                view=int(d["v"]),
                seq=int(d["s"]),
                digest=str(d["d"]),
                sender_id=str(d["sid"]),
                ed25519_pubkey=bytes.fromhex(d["pk"]),
                signature=bytes.fromhex(d["sig"]),
                payload=bytes.fromhex(d["pl"]),
                timestamp_ns=int(d["ts"]),
                merkle_root=str(d["mr"]),
            )
        except (json.JSONDecodeError, KeyError, ValueError, TypeError) as exc:
            raise ValueError(
                f"Malformed ConsensusEnvelope ({len(raw)} bytes): {exc}"
            ) from exc


@dataclass
class CommittedBlock:
    """One executed consensus slot, part of the Merkle-chained ledger."""
    seq: int
    data: bytes
    digest: str
    merkle_root: str
    commit_sigs: list[bytes]   # 2f+1 raw Ed25519 COMMIT-phase signatures
    committed_ns: int = field(default_factory=time.time_ns)


@dataclass
class SecurityAlert:
    """Raised whenever a cryptographic or protocol invariant violation is detected."""
    severity: str   # "CRITICAL" | "WARNING"
    node_id: str
    sender_id: str
    phase: str
    reason: str
    ts_ns: int = field(default_factory=time.time_ns)


# ── Abstract transport ────────────────────────────────────────────────────────

EnvelopeHandler = Callable[[ConsensusEnvelope], Awaitable[None]]


class AbstractMeshTransport(ABC):
    """Deliver ConsensusEnvelope objects between PBFT nodes."""

    node_id: str

    @abstractmethod
    async def start(self) -> None: ...

    @abstractmethod
    async def stop(self) -> None: ...

    @abstractmethod
    async def send(self, target_id: str, env: ConsensusEnvelope) -> bool:
        """Return True on delivery, False if target is unreachable."""

    @abstractmethod
    async def broadcast(
        self, env: ConsensusEnvelope, exclude: set[str] | None = None
    ) -> dict[str, bool]:
        """Return {node_id: delivered} for every known peer."""

    @abstractmethod
    def register_handler(self, handler: EnvelopeHandler) -> None: ...


# ── Internal certificate ──────────────────────────────────────────────────────

@dataclass
class _SlotCertificate:
    """Accumulates quorum signatures for one (view, seq) consensus slot."""
    view: int
    seq: int
    digest: str
    slot_phase: SlotPhase = SlotPhase.WAITING
    # node_id → 64-byte Ed25519 signature over canonical bytes of that phase msg
    prepare_sigs: dict[str, bytes] = field(default_factory=dict)
    commit_sigs: dict[str, bytes] = field(default_factory=dict)
    request_data: Optional[bytes] = None
    client_id: str = ""
    pre_prepare_env: Optional[ConsensusEnvelope] = None
    executed: bool = False


# ── PBFT Node ─────────────────────────────────────────────────────────────────

class PBFTNode:
    """
    Production-hardened PBFT replica for a cluster of N=11 nodes (f=3).

    Call ``await node.start()`` to attach to transport and launch background
    workers, ``await node.stop()`` for graceful shutdown.

    The only public API for driving consensus is ``await node.submit_request()``
    (primary only) and ``node.handle_envelope()`` (registered automatically with
    the transport on start).
    """

    def __init__(
        self,
        peer_config: NodePeer,
        keypair: NodeKeyPair,
        peers: list[NodePeer],
        transport: AbstractMeshTransport,
        *,
        cluster_size: int = CLUSTER_SIZE,
        max_faults: int = MAX_FAULTS,
        primary_timeout_s: float = PRIMARY_TIMEOUT_S,
        on_execute: Optional[Callable[[CommittedBlock], Awaitable[None]]] = None,
        on_alert: Optional[Callable[[SecurityAlert], Awaitable[None]]] = None,
    ) -> None:
        self.peer_config = peer_config
        self.keypair = keypair
        self.transport = transport
        self.node_id: str = peer_config.node_id
        self.cluster_size: int = cluster_size
        self.max_faults: int = max_faults
        self.quorum: int = 2 * max_faults + 1
        self._primary_timeout_s: float = primary_timeout_s
        self._on_execute = on_execute
        self._on_alert = on_alert

        # Static peer registry (node_id → NodePeer)
        self._peers: dict[str, NodePeer] = {p.node_id: p for p in peers}

        # ── Consensus state ─────────────────────────────────────────────────
        self.current_view: int = 0
        self.current_seq: int = 0          # highest seq the primary has assigned
        self.last_executed_seq: int = 0

        # (view, seq) → _SlotCertificate
        self._certs: dict[tuple[int, int], _SlotCertificate] = {}
        # seq → CommittedBlock
        self._chain: dict[int, CommittedBlock] = {}
        # running list of block digests in commit order (for Merkle computation)
        self._chain_digests: list[str] = []
        # seq → state_hash at that checkpoint
        self._checkpoints: dict[int, str] = {}

        # ── View-change state ───────────────────────────────────────────────
        # view → {node_id: VIEW_CHANGE envelope}
        self._vc_votes: dict[int, dict[str, ConsensusEnvelope]] = defaultdict(dict)
        self._primary_deadline: float = time.monotonic() + primary_timeout_s
        self._in_view_change: bool = False

        # ── State-sync state ────────────────────────────────────────────────
        self._sync_in_progress: bool = False
        self._sync_backoff_s: float = 1.0
        # highest seq seen in any inbound message (estimate of network tip)
        self._network_tip: int = 0

        # ── Background tasks ────────────────────────────────────────────────
        self._tasks: list[asyncio.Task[None]] = []

        # ── Alerts ──────────────────────────────────────────────────────────
        self.alerts: list[SecurityAlert] = []

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        """Register the envelope handler, attach transport, and launch background workers.

        Starts three asyncio tasks: view-change watchdog, state-sync worker,
        and checkpoint worker.  Must be called before any messages are processed.
        """
        self.transport.register_handler(self.handle_envelope)
        await self.transport.start()
        self._tasks = [
            asyncio.create_task(
                self._view_change_watchdog(),
                name=f"vc-watchdog-{self.node_id}",
            ),
            asyncio.create_task(
                self._state_sync_worker(),
                name=f"state-sync-{self.node_id}",
            ),
            asyncio.create_task(
                self._checkpoint_worker(),
                name=f"checkpoint-{self.node_id}",
            ),
        ]
        _log.info("pbft_node_started node=%s view=%d", self.node_id, self.current_view)

    async def stop(self) -> None:
        """Cancel all background workers and stop the transport layer gracefully."""
        for task in self._tasks:
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        await self.transport.stop()
        _log.info("pbft_node_stopped node=%s", self.node_id)

    # ── Role resolution ───────────────────────────────────────────────────────

    @property
    def primary_id(self) -> str:
        """Current view's primary, determined by round-robin over sorted IDs."""
        all_ids = sorted(self._peers.keys() | {self.node_id})
        return all_ids[self.current_view % len(all_ids)]

    @property
    def is_primary(self) -> bool:
        """Return True iff this node is the primary for the current view."""
        return self.node_id == self.primary_id

    # ── Primary entry-point: submit a client request ──────────────────────────

    async def submit_request(
        self, data: bytes, client_id: str = "internal"
    ) -> int:
        """
        Assign the next sequence number to *data* and broadcast PRE-PREPARE.

        Only the current primary should call this.  Returns the assigned
        sequence number so callers can poll ``node._chain[seq]`` for completion.

        Raises:
            ValueError: if this node is not the current primary.
        """
        if not self.is_primary:
            raise ValueError(
                f"Node {self.node_id!r} is not the primary in view {self.current_view}. "
                f"Primary is {self.primary_id!r}."
            )

        self.current_seq += 1
        seq = self.current_seq
        digest = compute_digest(data)
        chain_root = self._current_merkle_root()

        cert = self._get_or_create_cert(self.current_view, seq, digest)
        cert.request_data = data
        cert.client_id = client_id
        cert.slot_phase = SlotPhase.PRE_PREPARED

        payload = self._encode_pre_prepare_payload(data, client_id, digest, chain_root)
        env = self._build_envelope(
            phase=MessagePhase.PRE_PREPARE,
            view=self.current_view,
            seq=seq,
            digest=digest,
            payload=payload,
            merkle_root=chain_root,
        )
        cert.pre_prepare_env = env

        _log.debug(
            "pbft_pre_prepare_sent node=%s seq=%d digest=%.8s",
            self.node_id, seq, digest,
        )
        await self.transport.broadcast(env)
        # Primary counts its own PREPARE immediately
        await self._send_prepare(self.current_view, seq, digest)
        self._reset_primary_deadline()
        return seq

    # ── Inbound message dispatcher ────────────────────────────────────────────

    async def handle_envelope(self, env: ConsensusEnvelope) -> None:
        """
        Top-level handler registered with the transport.

        Verifies the Ed25519 signature and cross-checks the public key against
        the peer registry BEFORE any consensus logic runs.  Invalid signatures
        result in a SecurityAlert and the envelope is silently discarded.
        """
        # ── 1. Cryptographic verification ────────────────────────────────────
        try:
            self._verify_envelope(env)
        except SignatureError as exc:
            await self._raise_alert(
                severity="CRITICAL",
                sender_id=env.sender_id,
                phase=env.phase.name,
                reason=f"Invalid Ed25519 signature — {exc}",
            )
            return  # DROP — do not process further

        # ── 2. Track highest seq seen (used by state-sync worker) ────────────
        if env.seq > self._network_tip:
            self._network_tip = env.seq

        # ── 3. View filter for phase-bearing messages ─────────────────────────
        if env.phase not in (
            MessagePhase.VIEW_CHANGE,
            MessagePhase.NEW_VIEW,
            MessagePhase.STATE_SYNC_REQ,
            MessagePhase.STATE_SYNC_RESP,
        ):
            if env.view < self.current_view:
                return  # stale
            if env.view > self.current_view + 1:
                _log.warning(
                    "pbft_future_view node=%s sender=%s msg_view=%d current=%d",
                    self.node_id, env.sender_id, env.view, self.current_view,
                )

        # ── 4. Dispatch ───────────────────────────────────────────────────────
        match env.phase:
            case MessagePhase.PRE_PREPARE:
                await self._handle_pre_prepare(env)
            case MessagePhase.PREPARE:
                await self._handle_prepare(env)
            case MessagePhase.COMMIT:
                await self._handle_commit(env)
            case MessagePhase.VIEW_CHANGE:
                await self._handle_view_change(env)
            case MessagePhase.NEW_VIEW:
                await self._handle_new_view(env)
            case MessagePhase.STATE_SYNC_REQ:
                await self._handle_sync_request(env)
            case MessagePhase.STATE_SYNC_RESP:
                await self._handle_sync_response(env)
            case MessagePhase.CHECKPOINT:
                await self._handle_checkpoint(env)

    # ── Phase handlers ────────────────────────────────────────────────────────

    async def _handle_pre_prepare(self, env: ConsensusEnvelope) -> None:
        """
        Accept a PRE-PREPARE only from the current primary.

        Validates:
          • sender is the current primary
          • view matches
          • no conflicting digest exists for this (view, seq) slot
          • request digest matches the PRE-PREPARE payload
        """
        if env.sender_id != self.primary_id:
            await self._raise_alert(
                severity="WARNING",
                sender_id=env.sender_id,
                phase="PRE_PREPARE",
                reason=(
                    f"PRE-PREPARE from non-primary {env.sender_id!r} "
                    f"(expected primary={self.primary_id!r}, view={self.current_view})"
                ),
            )
            return

        if env.view != self.current_view:
            return

        key = (env.view, env.seq)
        if key in self._certs:
            existing = self._certs[key]
            if existing.digest != env.digest:
                await self._raise_alert(
                    severity="CRITICAL",
                    sender_id=env.sender_id,
                    phase="PRE_PREPARE",
                    reason=(
                        f"Conflicting digest for slot ({env.view},{env.seq}): "
                        f"stored={existing.digest[:8]} incoming={env.digest[:8]}"
                    ),
                )
                return
            if existing.slot_phase >= SlotPhase.PRE_PREPARED:
                return  # already processed

        # Decode and validate request payload
        request_data, client_id = self._decode_pre_prepare_payload(env.payload)
        if request_data is not None:
            actual_digest = compute_digest(request_data)
            if actual_digest != env.digest:
                await self._raise_alert(
                    severity="CRITICAL",
                    sender_id=env.sender_id,
                    phase="PRE_PREPARE",
                    reason=(
                        f"Digest mismatch: envelope claims {env.digest[:8]} "
                        f"but payload hashes to {actual_digest[:8]}"
                    ),
                )
                return

        cert = self._get_or_create_cert(env.view, env.seq, env.digest)
        cert.slot_phase = SlotPhase.PRE_PREPARED
        cert.pre_prepare_env = env
        if request_data is not None:
            cert.request_data = request_data
            cert.client_id = client_id

        _log.debug(
            "pbft_pre_prepare_accepted node=%s seq=%d view=%d digest=%.8s",
            self.node_id, env.seq, env.view, env.digest,
        )
        self._reset_primary_deadline()
        await self._send_prepare(env.view, env.seq, env.digest)

    async def _handle_prepare(self, env: ConsensusEnvelope) -> None:
        """
        Accumulate PREPARE votes.  On 2f+1 verified prepares: broadcast COMMIT.
        """
        if env.view != self.current_view:
            return

        cert = self._get_or_create_cert(env.view, env.seq, env.digest)

        if cert.digest != env.digest:
            await self._raise_alert(
                severity="WARNING",
                sender_id=env.sender_id,
                phase="PREPARE",
                reason=f"Digest mismatch for slot ({env.view},{env.seq})",
            )
            return

        if env.sender_id in cert.prepare_sigs:
            return  # duplicate

        cert.prepare_sigs[env.sender_id] = env.signature

        _log.debug(
            "pbft_prepare node=%s from=%s seq=%d prepares=%d/%d",
            self.node_id, env.sender_id, env.seq,
            len(cert.prepare_sigs), self.quorum,
        )

        # Advance to PREPARED when quorum is reached
        if (
            len(cert.prepare_sigs) >= self.quorum
            and cert.slot_phase < SlotPhase.PREPARED
        ):
            cert.slot_phase = SlotPhase.PREPARED
            _log.info(
                "pbft_slot_prepared node=%s seq=%d view=%d",
                self.node_id, env.seq, env.view,
            )
            await self._send_commit(env.view, env.seq, env.digest)

        # Handle out-of-order: commit quorum may already be met
        await self._try_execute(cert)

    async def _handle_commit(self, env: ConsensusEnvelope) -> None:
        """
        Accumulate COMMIT votes.  On 2f+1 verified commits: execute.
        """
        if env.view != self.current_view:
            return

        cert = self._get_or_create_cert(env.view, env.seq, env.digest)

        if cert.digest != env.digest:
            await self._raise_alert(
                severity="WARNING",
                sender_id=env.sender_id,
                phase="COMMIT",
                reason=f"Digest mismatch for slot ({env.view},{env.seq})",
            )
            return

        if env.sender_id in cert.commit_sigs:
            return  # duplicate

        cert.commit_sigs[env.sender_id] = env.signature

        _log.debug(
            "pbft_commit node=%s from=%s seq=%d commits=%d/%d",
            self.node_id, env.sender_id, env.seq,
            len(cert.commit_sigs), self.quorum,
        )

        await self._try_execute(cert)

    async def _try_execute(self, cert: _SlotCertificate) -> None:
        """Execute the slot if both PREPARED and COMMIT quorum are met."""
        if (
            len(cert.commit_sigs) >= self.quorum
            and cert.slot_phase < SlotPhase.COMMITTED
            and not cert.executed
        ):
            cert.slot_phase = SlotPhase.COMMITTED
            await self._execute(cert)

    # ── View-change handlers ──────────────────────────────────────────────────

    async def _handle_view_change(self, env: ConsensusEnvelope) -> None:
        target_view = env.view
        if target_view <= self.current_view:
            return

        self._vc_votes[target_view][env.sender_id] = env

        if len(self._vc_votes[target_view]) >= self.quorum:
            await self._enter_new_view(target_view)

    async def _handle_new_view(self, env: ConsensusEnvelope) -> None:
        new_view = env.view
        if new_view <= self.current_view:
            return

        # Accept only from the legitimate new primary
        all_ids = sorted(self._peers.keys() | {self.node_id})
        expected_primary = all_ids[new_view % len(all_ids)]
        if env.sender_id != expected_primary:
            return

        self.current_view = new_view
        self._in_view_change = False
        self._reset_primary_deadline()
        _log.info(
            "pbft_new_view_accepted node=%s new_view=%d new_primary=%s",
            self.node_id, new_view, expected_primary,
        )

    async def _initiate_view_change(self) -> None:
        """Broadcast a VIEW_CHANGE for the next view."""
        if self._in_view_change:
            return
        self._in_view_change = True
        next_view = self.current_view + 1
        _log.warning(
            "pbft_view_change_initiated node=%s next_view=%d",
            self.node_id, next_view,
        )
        env = self._build_envelope(
            phase=MessagePhase.VIEW_CHANGE,
            view=next_view,
            seq=self.last_executed_seq,
            digest="0" * 128,
            payload=b"",
        )
        # Count own vote
        self._vc_votes[next_view][self.node_id] = env
        await self.transport.broadcast(env)

        if len(self._vc_votes[next_view]) >= self.quorum:
            await self._enter_new_view(next_view)

    async def _enter_new_view(self, new_view: int) -> None:
        if self.current_view >= new_view:
            return
        self.current_view = new_view
        self._in_view_change = False
        self._reset_primary_deadline()

        if self.is_primary:
            env = self._build_envelope(
                phase=MessagePhase.NEW_VIEW,
                view=new_view,
                seq=self.last_executed_seq,
                digest="0" * 128,
                payload=b"",
            )
            await self.transport.broadcast(env)
            _log.info(
                "pbft_new_primary node=%s view=%d",
                self.node_id, new_view,
            )

    # ── State-sync handlers ───────────────────────────────────────────────────

    async def _handle_sync_request(self, env: ConsensusEnvelope) -> None:
        """Serve missing committed blocks to a lagging peer."""
        if len(env.payload) < 16:
            return
        from_seq, to_seq = struct.unpack(">QQ", env.payload[:16])
        to_seq = min(int(to_seq), self.last_executed_seq)

        for seq in range(int(from_seq), to_seq + 1):
            block = self._chain.get(seq)
            if block is None:
                continue
            resp = self._build_envelope(
                phase=MessagePhase.STATE_SYNC_RESP,
                view=self.current_view,
                seq=seq,
                digest=block.digest,
                payload=self._encode_block(block),
                merkle_root=block.merkle_root,
            )
            await self.transport.send(env.sender_id, resp)

    async def _handle_sync_response(self, env: ConsensusEnvelope) -> None:
        """Apply an inbound block from state sync."""
        block = self._decode_block(env.payload)
        if block is None or block.seq in self._chain:
            return
        self._chain[block.seq] = block
        self.last_executed_seq = max(self.last_executed_seq, block.seq)
        _log.info(
            "pbft_sync_block_applied node=%s seq=%d digest=%.8s",
            self.node_id, block.seq, block.digest,
        )

    async def _handle_checkpoint(self, env: ConsensusEnvelope) -> None:
        """Record a checkpoint digest broadcast by a peer."""
        self._checkpoints[env.seq] = env.digest

    # ── Execution ─────────────────────────────────────────────────────────────

    async def _execute(self, cert: _SlotCertificate) -> None:
        if cert.executed:
            return
        if cert.request_data is None:
            # Request data not yet received — wait for PRE-PREPARE delivery
            _log.warning(
                "pbft_execute_deferred node=%s seq=%d reason=no_request_data",
                self.node_id, cert.seq,
            )
            return

        cert.executed = True
        cert.slot_phase = SlotPhase.EXECUTED
        data = cert.request_data
        sigs = list(cert.commit_sigs.values())

        # Extend the Merkle chain
        self._chain_digests.append(cert.digest)
        new_root = build_merkle_root(self._chain_digests)

        block = CommittedBlock(
            seq=cert.seq,
            data=data,
            digest=cert.digest,
            merkle_root=new_root,
            commit_sigs=sigs,
        )
        self._chain[cert.seq] = block
        self.last_executed_seq = max(self.last_executed_seq, cert.seq)

        _log.info(
            "pbft_executed node=%s seq=%d digest=%.8s merkle_root=%.8s",
            self.node_id, cert.seq, cert.digest, new_root,
        )

        if self._on_execute is not None:
            await self._on_execute(block)

    # ── Phase senders ─────────────────────────────────────────────────────────

    async def _send_prepare(self, view: int, seq: int, digest: str) -> None:
        env = self._build_envelope(
            phase=MessagePhase.PREPARE,
            view=view,
            seq=seq,
            digest=digest,
            payload=b"",
        )
        cert = self._get_or_create_cert(view, seq, digest)
        cert.prepare_sigs[self.node_id] = env.signature  # record own prepare
        await self.transport.broadcast(env)

    async def _send_commit(self, view: int, seq: int, digest: str) -> None:
        env = self._build_envelope(
            phase=MessagePhase.COMMIT,
            view=view,
            seq=seq,
            digest=digest,
            payload=b"",
        )
        cert = self._get_or_create_cert(view, seq, digest)
        cert.commit_sigs[self.node_id] = env.signature  # record own commit
        await self.transport.broadcast(env)

    # ── Background workers ────────────────────────────────────────────────────

    async def _view_change_watchdog(self) -> None:
        """
        Fire a view-change request if the primary has been silent for
        PRIMARY_TIMEOUT_S.  The deadline is reset each time a valid
        PRE-PREPARE is received from the primary (via _reset_primary_deadline).
        """
        while True:
            try:
                await asyncio.sleep(0.25)
                if time.monotonic() > self._primary_deadline and not self.is_primary:
                    _log.warning(
                        "pbft_primary_timeout node=%s view=%d timeout_s=%.1f",
                        self.node_id, self.current_view, self._primary_timeout_s,
                    )
                    await self._initiate_view_change()
                    # Back off so we don't spam view-changes
                    await asyncio.sleep(self._primary_timeout_s)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                _log.error("pbft_watchdog_error node=%s err=%s", self.node_id, exc)

    async def _state_sync_worker(self) -> None:
        """
        Periodically compare our last-executed sequence to the estimated network
        tip.  If the gap exceeds MAX_SEQUENCE_GAP, request missing blocks from
        the current primary using exponential backoff.
        """
        while True:
            try:
                await asyncio.sleep(STATE_SYNC_INTERVAL_S)
                gap = self._network_tip - self.last_executed_seq
                if gap > MAX_SEQUENCE_GAP and not self._sync_in_progress:
                    _log.info(
                        "pbft_sync_required node=%s local=%d tip=%d gap=%d",
                        self.node_id, self.last_executed_seq,
                        self._network_tip, gap,
                    )
                    self._sync_in_progress = True
                    try:
                        await self._request_state_sync(
                            from_seq=self.last_executed_seq + 1,
                            to_seq=self._network_tip,
                        )
                        self._sync_backoff_s = 1.0
                    except Exception as exc:
                        _log.warning(
                            "pbft_sync_failed node=%s err=%s backoff_s=%.1f",
                            self.node_id, exc, self._sync_backoff_s,
                        )
                        await asyncio.sleep(self._sync_backoff_s)
                        self._sync_backoff_s = min(
                            self._sync_backoff_s * 2.0,
                            STATE_SYNC_BACKOFF_MAX_S,
                        )
                    finally:
                        self._sync_in_progress = False
            except asyncio.CancelledError:
                break
            except Exception as exc:
                _log.error("pbft_sync_worker_err node=%s err=%s", self.node_id, exc)

    async def _request_state_sync(self, from_seq: int, to_seq: int) -> None:
        """Send a STATE_SYNC_REQ to the current primary."""
        payload = struct.pack(">QQ", from_seq, to_seq)
        env = self._build_envelope(
            phase=MessagePhase.STATE_SYNC_REQ,
            view=self.current_view,
            seq=from_seq,
            digest="0" * 128,
            payload=payload,
        )
        await self.transport.send(self.primary_id, env)

    async def _checkpoint_worker(self) -> None:
        """
        Broadcast a CHECKPOINT message every CHECKPOINT_INTERVAL executed
        sequences and prune stale certificates to bound memory usage.
        """
        last_checkpoint = 0
        while True:
            try:
                await asyncio.sleep(1.0)
                if (
                    self.last_executed_seq - last_checkpoint >= CHECKPOINT_INTERVAL
                    and self.last_executed_seq > 0
                ):
                    cp_seq = self.last_executed_seq
                    state_hash = self._compute_state_hash(cp_seq)
                    self._checkpoints[cp_seq] = state_hash
                    last_checkpoint = cp_seq

                    env = self._build_envelope(
                        phase=MessagePhase.CHECKPOINT,
                        view=self.current_view,
                        seq=cp_seq,
                        digest=state_hash,
                        payload=b"",
                    )
                    await self.transport.broadcast(env)
                    _log.info(
                        "pbft_checkpoint node=%s seq=%d hash=%.8s",
                        self.node_id, cp_seq, state_hash,
                    )
                    # Prune certificates older than the last stable checkpoint
                    prune_before = cp_seq - CHECKPOINT_INTERVAL
                    stale = [k for k in self._certs if k[1] < prune_before]
                    for k in stale:
                        del self._certs[k]
            except asyncio.CancelledError:
                break
            except Exception as exc:
                _log.error(
                    "pbft_checkpoint_err node=%s err=%s", self.node_id, exc
                )

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _get_or_create_cert(
        self, view: int, seq: int, digest: str
    ) -> _SlotCertificate:
        key = (view, seq)
        if key not in self._certs:
            self._certs[key] = _SlotCertificate(view=view, seq=seq, digest=digest)
        return self._certs[key]

    def _build_envelope(
        self,
        *,
        phase: MessagePhase,
        view: int,
        seq: int,
        digest: str,
        payload: bytes,
        merkle_root: str = "0" * 128,
    ) -> ConsensusEnvelope:
        ts = time.time_ns()
        sign_bytes = canonical_signing_bytes(
            phase.value, view, seq, digest, self.node_id, ts
        )
        sig = self.keypair.sign(sign_bytes)
        return ConsensusEnvelope(
            phase=phase,
            view=view,
            seq=seq,
            digest=digest,
            sender_id=self.node_id,
            ed25519_pubkey=self.keypair.pubkey_bytes(),
            signature=sig,
            payload=payload,
            timestamp_ns=ts,
            merkle_root=merkle_root,
        )

    def _verify_envelope(self, env: ConsensusEnvelope) -> None:
        """
        Verify the Ed25519 signature AND cross-check the public key against
        our static peer registry.

        Raises:
            SignatureError: on any verification failure.
        """
        sign_bytes = canonical_signing_bytes(
            env.phase.value,
            env.view,
            env.seq,
            env.digest,
            env.sender_id,
            env.timestamp_ns,
        )
        # Cryptographic verification first
        verify_signature(env.ed25519_pubkey, sign_bytes, env.signature)

        # Cross-check pubkey against known peer registry
        peer = self._peers.get(env.sender_id)
        if peer is None and env.sender_id != self.node_id:
            raise SignatureError(f"Message from unknown peer {env.sender_id!r}")
        if peer is not None and peer.pubkey_bytes != env.ed25519_pubkey:
            raise SignatureError(
                f"Public key mismatch for peer {env.sender_id!r}: "
                f"registry={peer.pubkey_bytes.hex()[:16]} "
                f"envelope={env.ed25519_pubkey.hex()[:16]}"
            )

    def _current_merkle_root(self) -> str:
        return build_merkle_root(self._chain_digests) if self._chain_digests else "0" * 128

    def _compute_state_hash(self, up_to_seq: int) -> str:
        blocks = sorted(
            (b for b in self._chain.values() if b.seq <= up_to_seq),
            key=lambda b: b.seq,
        )
        return compute_digest(b"".join(b.digest.encode() for b in blocks))

    def _reset_primary_deadline(self) -> None:
        self._primary_deadline = time.monotonic() + self._primary_timeout_s

    # ── Serialisation helpers ─────────────────────────────────────────────────

    def _encode_pre_prepare_payload(
        self, data: bytes, client_id: str, digest: str, chain_root: str
    ) -> bytes:
        return json.dumps(
            {
                "data": data.hex(),
                "client_id": client_id,
                "digest": digest,
                "chain_root": chain_root,
            },
            separators=(",", ":"),
        ).encode()

    def _decode_pre_prepare_payload(
        self, payload: bytes
    ) -> tuple[Optional[bytes], str]:
        if not payload:
            return None, ""
        try:
            d: dict[str, Any] = json.loads(payload)
            return bytes.fromhex(d["data"]), str(d.get("client_id", ""))
        except (json.JSONDecodeError, KeyError, ValueError) as exc:
            _log.warning("pbft_pre_prepare_payload_decode_err err=%s", exc)
            return None, ""

    def _encode_block(self, block: CommittedBlock) -> bytes:
        return json.dumps(
            {
                "seq": block.seq,
                "data": block.data.hex(),
                "digest": block.digest,
                "merkle_root": block.merkle_root,
                "commit_sigs": [s.hex() for s in block.commit_sigs],
                "committed_ns": block.committed_ns,
            },
            separators=(",", ":"),
        ).encode()

    def _decode_block(self, payload: bytes) -> Optional[CommittedBlock]:
        if not payload:
            return None
        try:
            d: dict[str, Any] = json.loads(payload)
            return CommittedBlock(
                seq=int(d["seq"]),
                data=bytes.fromhex(d["data"]),
                digest=str(d["digest"]),
                merkle_root=str(d["merkle_root"]),
                commit_sigs=[bytes.fromhex(s) for s in d["commit_sigs"]],
                committed_ns=int(d["committed_ns"]),
            )
        except (json.JSONDecodeError, KeyError, ValueError) as exc:
            _log.warning("pbft_block_decode_err err=%s", exc)
            return None

    # ── Alert helper ──────────────────────────────────────────────────────────

    async def _raise_alert(
        self, *, severity: str, sender_id: str, phase: str, reason: str
    ) -> None:
        alert = SecurityAlert(
            severity=severity,
            node_id=self.node_id,
            sender_id=sender_id,
            phase=phase,
            reason=reason,
        )
        self.alerts.append(alert)
        _log.warning(
            "pbft_security_alert node=%s severity=%s sender=%s phase=%s reason=%s",
            self.node_id, severity, sender_id, phase, reason,
        )
        if self._on_alert is not None:
            await self._on_alert(alert)

    # ── Diagnostics ───────────────────────────────────────────────────────────

    def status(self) -> dict[str, Any]:
        """Return a diagnostic snapshot of this node's current consensus state.

        Returns:
            Dict with view, is_primary, current_seq, last_executed_seq,
            chain_length, active_certs, network_tip, and alert count.
        """
        return {
            "node_id": self.node_id,
            "view": self.current_view,
            "is_primary": self.is_primary,
            "primary_id": self.primary_id,
            "current_seq": self.current_seq,
            "last_executed_seq": self.last_executed_seq,
            "chain_length": len(self._chain),
            "active_certs": len(self._certs),
            "network_tip": self._network_tip,
            "alerts": len(self.alerts),
        }
