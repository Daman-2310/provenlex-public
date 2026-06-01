"""
Abstract PBFT transport protocol.

Defines the message envelope and the ABC that every transport backend
(in-process asyncio queues, TLS WebSocket, gRPC) must implement.

The separation lets PBFTConsensus stay transport-agnostic: it calls
``transport.broadcast()`` and ``transport.recv()`` without knowing whether
messages travel through asyncio.Queue objects or cross-container TCP sockets.

Message signing
---------------
Every PBFTEnvelope carries an Ed25519 signature over the canonical bytes
  type|view|seq|digest
produced by ``signing_bytes()``.  The transport layer verifies signatures
before delivering messages to the protocol engine — forged messages are
dropped at the transport boundary, never reaching consensus logic.

Partition detection
-------------------
Transports track per-peer heartbeat timestamps.  A peer that misses
``HEARTBEAT_MISS_LIMIT`` consecutive heartbeats is declared partitioned.
The engine is notified via ``on_partition_detected`` so it can trigger
a view-change without waiting for the full VIEW_TIMEOUT.

Recovery
--------
When a peer reconnects it sends a ``SYNC_REQUEST`` containing its last
committed sequence number and Merkle root.  The quorum responds with a
``SYNC_RESPONSE`` containing all missing round digests so the rejoining
node can replay and recompute its Merkle state before participating.
"""

from __future__ import annotations

import hashlib
import json
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Awaitable, Callable


# ── Message types ─────────────────────────────────────────────────────────────


class MsgType(str, Enum):
    PRE_PREPARE = "PRE_PREPARE"
    PREPARE = "PREPARE"
    COMMIT = "COMMIT"
    VIEW_CHANGE = "VIEW_CHANGE"
    NEW_VIEW = "NEW_VIEW"
    REPLY = "REPLY"
    HEARTBEAT = "HEARTBEAT"
    SYNC_REQUEST = "SYNC_REQUEST"
    SYNC_RESPONSE = "SYNC_RESPONSE"


# ── Wire envelope ─────────────────────────────────────────────────────────────


@dataclass
class PBFTEnvelope:
    """
    Canonical over-the-wire PBFT message.

    All fields serialise to JSON; ``signature`` is an Ed25519 hex string
    computed over ``signing_bytes()``.  Transport backends MUST verify the
    signature before handing the envelope to the engine.
    """

    msg_type: MsgType
    view: int
    seq: int
    digest: str  # SHA-256 of the request payload (hex)
    sender_id: str
    payload: dict = field(default_factory=dict)
    signature: str = ""  # Ed25519 hex — empty until signed
    ts: float = field(default_factory=time.time)

    # Sync fields (used only in SYNC_REQUEST / SYNC_RESPONSE)
    last_committed_seq: int = 0
    merkle_root: str = ""

    def signing_bytes(self) -> bytes:
        """Canonical bytes that the Ed25519 signature covers."""
        return f"{self.msg_type}|{self.view}|{self.seq}|{self.digest}".encode()

    def to_json(self) -> str:
        return json.dumps(
            {
                "msg_type": self.msg_type,
                "view": self.view,
                "seq": self.seq,
                "digest": self.digest,
                "sender_id": self.sender_id,
                "payload": self.payload,
                "signature": self.signature,
                "ts": self.ts,
                "last_committed_seq": self.last_committed_seq,
                "merkle_root": self.merkle_root,
            },
            separators=(",", ":"),
        )

    @classmethod
    def from_json(cls, raw: str | bytes) -> "PBFTEnvelope":
        d = json.loads(raw)
        return cls(
            msg_type=MsgType(d["msg_type"]),
            view=int(d["view"]),
            seq=int(d["seq"]),
            digest=str(d["digest"]),
            sender_id=str(d["sender_id"]),
            payload=d.get("payload", {}),
            signature=str(d.get("signature", "")),
            ts=float(d.get("ts", time.time())),
            last_committed_seq=int(d.get("last_committed_seq", 0)),
            merkle_root=str(d.get("merkle_root", "")),
        )


# ── Sync state passed during partition recovery ───────────────────────────────


@dataclass
class NodeSyncState:
    node_id: str
    last_committed_seq: int
    merkle_root: str
    # list of (seq, digest) tuples for rounds the node is missing
    missing_rounds: list[tuple[int, str]] = field(default_factory=list)


# ── Callbacks the engine registers on the transport ──────────────────────────

MessageHandler = Callable[[PBFTEnvelope], Awaitable[None]]
PartitionHandler = Callable[[str], Awaitable[None]]  # peer_id
RecoveryHandler = Callable[[NodeSyncState], Awaitable[None]]


# ── Abstract transport ────────────────────────────────────────────────────────


class PBFTTransport(ABC):
    """
    Abstract base class for PBFT network transports.

    Concrete implementations:
      - ``InProcessTransport``  : asyncio.Queue (single process, dev/test)
      - ``WebSocketTransport``  : TLS WebSocket + Ed25519 (multi-container)
      - ``GRPCTransport``       : gRPC bidirectional streams (future)
    """

    def __init__(self, node_id: str) -> None:
        self.node_id = node_id
        self._on_message: MessageHandler | None = None
        self._on_partition: PartitionHandler | None = None
        self._on_recovery: RecoveryHandler | None = None

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    @abstractmethod
    async def start(self) -> None:
        """Start listening for incoming connections / messages."""

    @abstractmethod
    async def stop(self) -> None:
        """Graceful shutdown — flush pending sends, close connections."""

    # ── Messaging ─────────────────────────────────────────────────────────────

    @abstractmethod
    async def send(self, peer_id: str, envelope: PBFTEnvelope) -> None:
        """Send *envelope* to a specific peer. Non-blocking (fire-and-forget)."""

    @abstractmethod
    async def broadcast(self, envelope: PBFTEnvelope, exclude: set[str] | None = None) -> None:
        """Broadcast *envelope* to all known peers except *exclude*."""

    # ── Callbacks ─────────────────────────────────────────────────────────────

    def on_message(self, handler: MessageHandler) -> None:
        """Register coroutine called for every valid, signature-verified message."""
        self._on_message = handler

    def on_partition(self, handler: PartitionHandler) -> None:
        """Register coroutine called when a peer stops responding."""
        self._on_partition = handler

    def on_recovery(self, handler: RecoveryHandler) -> None:
        """Register coroutine called when a partitioned peer reconnects."""
        self._on_recovery = handler

    # ── Peer discovery ────────────────────────────────────────────────────────

    @abstractmethod
    def peer_ids(self) -> list[str]:
        """Return IDs of all known peers (connected or not)."""

    @abstractmethod
    def connected_peers(self) -> list[str]:
        """Return IDs of peers with live connections."""

    def partitioned_peers(self) -> list[str]:
        """Return IDs of known-but-disconnected peers."""
        all_p = set(self.peer_ids())
        connected = set(self.connected_peers())
        return list(all_p - connected)

    # ── Status ────────────────────────────────────────────────────────────────

    @abstractmethod
    def status(self) -> dict:
        """Return a dict suitable for health-check / metrics endpoints."""


# ── Digest helpers (shared by all transport implementations) ──────────────────


def make_digest(payload: dict) -> str:
    """Stable SHA-256 digest of a request payload dict."""
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def verify_digest(payload: dict, digest: str) -> bool:
    return make_digest(payload) == digest
