"""
Secure WebSocket PBFT Transport.

Each PBFT node runs:
  1. A ``websockets`` server that accepts connections from all peers.
  2. One persistent outbound connection per peer (auto-reconnecting).

Security model
--------------
Transport layer  : TLS (optional, controlled by SwarmConfig.pbft_mtls_enabled)
Application layer: Ed25519 — every envelope is signed by the sender's private key
                   and verified against the registered public key before delivery.

Both layers are independent.  Ed25519 signing works even without TLS (useful in
private Docker networks where encryption is handled by the overlay network).

Partition detection
-------------------
Each connection runs a heartbeat ping every HEARTBEAT_INTERVAL_S.  A peer that
misses HEARTBEAT_MISS_LIMIT pings is declared partitioned and ``on_partition``
fires.

Recovery / Merkle resync
------------------------
On reconnect, the rejoining node sends SYNC_REQUEST{last_committed_seq, merkle_root}.
The quorum node responds with SYNC_RESPONSE containing all (seq, digest) pairs for
rounds the requester is missing.  The rejoining node replays them to rebuild its
local Merkle tree before participating in new rounds.

Usage
-----
    transport = WebSocketTransport(
        node_id="replica-0",
        port=50050,
        peers={"replica-1": "ws://pbft-1:50051", "replica-2": "ws://pbft-2:50052"},
        private_key=loaded_ed25519_private_key,
        peer_public_keys={"replica-1": pub1, "replica-2": pub2},
        tls_context=ssl_ctx,      # None → no TLS
    )
    transport.on_message(engine.handle_envelope)
    transport.on_partition(engine.handle_partition)
    transport.on_recovery(engine.handle_recovery)
    await transport.start()
"""

from __future__ import annotations

import asyncio
import logging
import ssl
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

from ..transport import (
    MsgType,
    NodeSyncState,
    PBFTEnvelope,
    PBFTTransport,
)

if TYPE_CHECKING:
    pass

try:
    import websockets
    import websockets.server

    _WS_OK = True
except ImportError:
    _WS_OK = False

log = logging.getLogger(__name__)

HEARTBEAT_INTERVAL_S = 3.0
HEARTBEAT_MISS_LIMIT = 3  # declare partition after this many missed beats
SEND_TIMEOUT_S = 2.0  # per-message send deadline
CONNECT_TIMEOUT_S = 5.0
MAX_MESSAGE_SIZE_BYTES = 256 * 1024  # 256 KB


# ── Peer connection state ─────────────────────────────────────────────────────


@dataclass
class PeerState:
    peer_id: str
    address: str  # ws://host:port or wss://host:port
    websocket: object | None = None  # websockets.WebSocketClientProtocol | None
    connected: bool = False
    last_heartbeat: float = field(default_factory=time.monotonic)
    missed_beats: int = 0
    reconnect_attempts: int = 0
    last_committed_seq: int = 0
    last_merkle_root: str = ""


# ── WebSocket transport ────────────────────────────────────────────────────────


class WebSocketTransport(PBFTTransport):
    """
    Production PBFT transport over TLS WebSockets with Ed25519 message signing.

    Parameters
    ----------
    node_id:
        Identity of this node (e.g. 'replica-0').
    port:
        TCP port this node listens on.
    peers:
        Mapping ``{peer_id: "ws[s]://host:port"}`` for every other replica.
    private_key:
        Ed25519 private key used to sign outbound messages.
    peer_public_keys:
        Mapping ``{peer_id: Ed25519PublicKey}`` used to verify inbound messages.
        Peers with no registered key are accepted but logged as unverified.
    tls_context:
        ``ssl.SSLContext`` for TLS; ``None`` disables encryption (plain ws://).
        For mTLS, load the server cert + CA and set
        ``ctx.verify_mode = ssl.CERT_REQUIRED``.
    committed_rounds:
        Reference to the engine's ``{seq: digest}`` map so SYNC_RESPONSE can
        enumerate missing rounds without copying state.
    """

    def __init__(
        self,
        node_id: str,
        port: int,
        peers: dict[str, str],
        private_key: Ed25519PrivateKey,
        peer_public_keys: dict[str, Ed25519PublicKey] | None = None,
        tls_context: ssl.SSLContext | None = None,
        committed_rounds: dict[int, str] | None = None,
    ) -> None:
        if not _WS_OK:
            raise RuntimeError(
                "websockets package not installed. "
                "pip install 'websockets>=12.0' or pip install genesis-swarm[grpc]"
            )
        super().__init__(node_id)
        self._port = port
        self._peers: dict[str, PeerState] = {
            pid: PeerState(peer_id=pid, address=addr) for pid, addr in peers.items()
        }
        self._private_key = private_key
        self._peer_pub_keys: dict[str, Ed25519PublicKey] = peer_public_keys or {}
        self._tls_ctx = tls_context
        self._committed_rounds: dict[int, str] = committed_rounds if committed_rounds else {}

        self._server: object | None = None  # websockets.WebSocketServer
        self._tasks: list[asyncio.Task] = []
        self._send_queues: dict[str, asyncio.Queue[PBFTEnvelope | None]] = {
            pid: asyncio.Queue(maxsize=256) for pid in peers
        }
        self._inbound_lock = asyncio.Lock()

        # Rate-limit inbound queue to prevent memory exhaustion under flood
        self._inbound: asyncio.Queue[PBFTEnvelope] = asyncio.Queue(maxsize=2048)
        self._running = False

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    async def start(self) -> None:
        self._running = True

        # Start WebSocket server
        serve_kwargs: dict = {
            "host": "0.0.0.0",
            "port": self._port,
            "max_size": MAX_MESSAGE_SIZE_BYTES,
        }
        if self._tls_ctx:
            serve_kwargs["ssl"] = self._tls_ctx

        self._server = await websockets.server.serve(
            self._handle_inbound, **serve_kwargs
        )
        log.info(
            "[Transport:%s] Server listening on port %d (TLS=%s)",
            self.node_id,
            self._port,
            self._tls_ctx is not None,
        )

        # Background tasks: dispatcher + per-peer outbound sender + heartbeat
        self._tasks = [
            asyncio.create_task(self._dispatch_loop(), name=f"dispatch-{self.node_id}"),
            asyncio.create_task(self._heartbeat_loop(), name=f"hb-{self.node_id}"),
        ]
        for peer_id in self._peers:
            self._tasks.append(
                asyncio.create_task(
                    self._outbound_loop(peer_id), name=f"out-{self.node_id}->{peer_id}"
                )
            )

    async def stop(self) -> None:
        self._running = False
        # Signal all send queues to terminate
        for q in self._send_queues.values():
            await q.put(None)

        for t in self._tasks:
            t.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()

        if self._server:
            self._server.close()
            await self._server.wait_closed()
        log.info("[Transport:%s] Stopped", self.node_id)

    # ── Messaging ─────────────────────────────────────────────────────────────

    async def send(self, peer_id: str, envelope: PBFTEnvelope) -> None:
        """Enqueue *envelope* for delivery to *peer_id* (non-blocking)."""
        q = self._send_queues.get(peer_id)
        if q is None:
            log.warning("[Transport:%s] Unknown peer %s — dropping %s", self.node_id, peer_id,
                        envelope.msg_type)
            return
        try:
            q.put_nowait(self._sign(envelope))
        except asyncio.QueueFull:
            log.warning("[Transport:%s] Send queue to %s is full — dropping", self.node_id,
                        peer_id)

    async def broadcast(self, envelope: PBFTEnvelope, exclude: set[str] | None = None) -> None:
        """Enqueue *envelope* for delivery to every peer except *exclude*."""
        signed = self._sign(envelope)
        skip = exclude or set()
        for peer_id, q in self._send_queues.items():
            if peer_id in skip:
                continue
            try:
                q.put_nowait(signed)
            except asyncio.QueueFull:
                log.warning("[Transport:%s] Broadcast queue to %s full", self.node_id, peer_id)

    # ── Peer info ─────────────────────────────────────────────────────────────

    def peer_ids(self) -> list[str]:
        return list(self._peers)

    def connected_peers(self) -> list[str]:
        return [pid for pid, p in self._peers.items() if p.connected]

    def status(self) -> dict:
        return {
            "node_id": self.node_id,
            "port": self._port,
            "tls": self._tls_ctx is not None,
            "peers": {
                pid: {
                    "connected": p.connected,
                    "missed_beats": p.missed_beats,
                    "last_committed_seq": p.last_committed_seq,
                }
                for pid, p in self._peers.items()
            },
        }

    # ── Inbound server handler ────────────────────────────────────────────────

    async def _handle_inbound(self, websocket, path: str = "/") -> None:
        """Called by the websockets server for every inbound connection."""
        remote = getattr(websocket, "remote_address", "?")
        log.debug("[Transport:%s] Inbound connection from %s", self.node_id, remote)
        try:
            async for raw in websocket:
                try:
                    env = PBFTEnvelope.from_json(raw)
                except (ValueError, KeyError) as exc:
                    log.warning("[Transport:%s] Malformed envelope from %s: %s",
                                self.node_id, remote, exc)
                    continue

                if not self._verify(env):
                    log.warning("[Transport:%s] Signature invalid from %s (msg=%s)",
                                self.node_id, env.sender_id, env.msg_type)
                    continue

                # Update peer heartbeat timestamp
                if env.sender_id in self._peers:
                    self._peers[env.sender_id].last_heartbeat = time.monotonic()
                    self._peers[env.sender_id].missed_beats = 0
                    if not self._peers[env.sender_id].connected:
                        self._peers[env.sender_id].connected = True
                        log.info("[Transport:%s] Peer %s reconnected (inbound)",
                                 self.node_id, env.sender_id)

                if env.msg_type == MsgType.HEARTBEAT:
                    continue  # heartbeats update the timestamp above but don't dispatch

                if env.msg_type == MsgType.SYNC_REQUEST:
                    await self._handle_sync_request(env)
                    continue

                if env.msg_type == MsgType.SYNC_RESPONSE:
                    await self._handle_sync_response(env)
                    continue

                try:
                    self._inbound.put_nowait(env)
                except asyncio.QueueFull:
                    log.warning("[Transport:%s] Inbound queue full — dropping %s",
                                self.node_id, env.msg_type)

        except (ConnectionResetError, asyncio.CancelledError):
            pass
        except Exception as exc:
            log.error("[Transport:%s] Inbound handler error: %s", self.node_id, exc)

    # ── Outbound send loop (one per peer) ─────────────────────────────────────

    async def _outbound_loop(self, peer_id: str) -> None:
        """
        Maintain a persistent outbound WebSocket connection to *peer_id*.
        Reconnects with exponential backoff; drains the send queue while connected.
        """
        peer = self._peers[peer_id]
        backoff = 2.0
        while self._running:
            try:
                connect_kwargs: dict = {
                    "open_timeout": CONNECT_TIMEOUT_S,
                    "ping_interval": HEARTBEAT_INTERVAL_S,
                    "ping_timeout": HEARTBEAT_INTERVAL_S * HEARTBEAT_MISS_LIMIT,
                    "max_size": MAX_MESSAGE_SIZE_BYTES,
                }
                if self._tls_ctx:
                    connect_kwargs["ssl"] = self._tls_ctx

                async with websockets.connect(peer.address, **connect_kwargs) as ws:
                    peer.websocket = ws
                    peer.connected = True
                    peer.reconnect_attempts = 0
                    backoff = 2.0
                    log.info("[Transport:%s] Connected to %s at %s",
                             self.node_id, peer_id, peer.address)

                    # Drain the queue while the connection is alive
                    while self._running:
                        try:
                            env = await asyncio.wait_for(
                                self._send_queues[peer_id].get(), timeout=0.5
                            )
                        except asyncio.TimeoutError:
                            continue

                        if env is None:  # sentinel → shut down
                            return

                        try:
                            await asyncio.wait_for(ws.send(env.to_json()), SEND_TIMEOUT_S)
                        except asyncio.TimeoutError:
                            log.warning("[Transport:%s] Send timeout to %s", self.node_id, peer_id)
                            break
                        except (ConnectionResetError, OSError) as exc:
                            log.warning("[Transport:%s] Send failed to %s: %s",
                                        self.node_id, peer_id, exc)
                            break

            except (OSError, TimeoutError, ConnectionRefusedError) as exc:
                log.debug("[Transport:%s] Cannot reach %s (%s) — retry in %.0fs",
                          self.node_id, peer_id, exc, backoff)
            except asyncio.CancelledError:
                return
            except Exception as exc:
                log.warning("[Transport:%s] Outbound loop error for %s: %s",
                            self.node_id, peer_id, exc)
            finally:
                peer.websocket = None
                if peer.connected:
                    peer.connected = False
                    log.info("[Transport:%s] Disconnected from %s", self.node_id, peer_id)

            peer.reconnect_attempts += 1
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2.0, 120.0)

    # ── Dispatcher loop ───────────────────────────────────────────────────────

    async def _dispatch_loop(self) -> None:
        """Pull from inbound queue and call registered message handler."""
        while self._running:
            try:
                env = await asyncio.wait_for(self._inbound.get(), timeout=0.5)
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                return

            if self._on_message:
                try:
                    await self._on_message(env)
                except Exception as exc:
                    log.error("[Transport:%s] Message handler error: %s", self.node_id, exc)

    # ── Heartbeat loop ────────────────────────────────────────────────────────

    async def _heartbeat_loop(self) -> None:
        """
        Send HEARTBEAT to all peers every HEARTBEAT_INTERVAL_S.
        Detect peers that stop responding (network partition).
        """
        while self._running:
            await asyncio.sleep(HEARTBEAT_INTERVAL_S)
            now = time.monotonic()

            hb = PBFTEnvelope(
                msg_type=MsgType.HEARTBEAT,
                view=0,
                seq=0,
                digest="",
                sender_id=self.node_id,
            )
            signed_hb = self._sign(hb)

            for peer_id, peer in self._peers.items():
                # Send heartbeat (best-effort, QueueFull → skip)
                q = self._send_queues[peer_id]
                try:
                    q.put_nowait(signed_hb)
                except asyncio.QueueFull:
                    pass

                # Partition detection: check last received heartbeat from this peer
                elapsed = now - peer.last_heartbeat
                if elapsed > HEARTBEAT_INTERVAL_S * (HEARTBEAT_MISS_LIMIT + 0.5):
                    if peer.connected:
                        peer.missed_beats += 1
                        if peer.missed_beats >= HEARTBEAT_MISS_LIMIT:
                            peer.connected = False
                            log.warning("[Transport:%s] PARTITION detected: %s (%.0fs silent)",
                                        self.node_id, peer_id, elapsed)
                            if self._on_partition:
                                try:
                                    await self._on_partition(peer_id)
                                except Exception as exc:
                                    log.error("[Transport:%s] Partition handler error: %s",
                                              self.node_id, exc)

    # ── Partition recovery: Merkle state sync ─────────────────────────────────

    async def request_sync(self, peer_id: str, last_seq: int, merkle_root: str) -> None:
        """
        Send SYNC_REQUEST to *peer_id* after reconnecting.
        The response will contain all round digests we are missing.
        """
        env = PBFTEnvelope(
            msg_type=MsgType.SYNC_REQUEST,
            view=0,
            seq=0,
            digest="",
            sender_id=self.node_id,
            last_committed_seq=last_seq,
            merkle_root=merkle_root,
        )
        await self.send(peer_id, env)
        log.info("[Transport:%s] SYNC_REQUEST → %s (last_seq=%d)", self.node_id, peer_id, last_seq)

    async def _handle_sync_request(self, env: PBFTEnvelope) -> None:
        """Respond to a peer's SYNC_REQUEST with all rounds they are missing."""
        requester = env.sender_id
        requester_last = env.last_committed_seq

        # Find all rounds committed after the requester's last known seq
        missing: list[tuple[int, str]] = [
            (seq, digest)
            for seq, digest in sorted(self._committed_rounds.items())
            if seq > requester_last
        ]

        response = PBFTEnvelope(
            msg_type=MsgType.SYNC_RESPONSE,
            view=0,
            seq=0,
            digest="",
            sender_id=self.node_id,
            payload={"missing": [[s, d] for s, d in missing]},
        )
        await self.send(requester, response)
        log.info("[Transport:%s] SYNC_RESPONSE → %s (%d rounds)",
                 self.node_id, requester, len(missing))

    async def _handle_sync_response(self, env: PBFTEnvelope) -> None:
        """Process a SYNC_RESPONSE and notify the engine via on_recovery."""
        if not self._on_recovery:
            return
        raw_missing = env.payload.get("missing", [])
        missing_rounds = [(int(s), str(d)) for s, d in raw_missing]

        peer = self._peers.get(env.sender_id)
        state = NodeSyncState(
            node_id=self.node_id,
            last_committed_seq=max((s for s, _ in missing_rounds),
                                   default=0) if missing_rounds else 0,
            merkle_root=env.merkle_root,
            missing_rounds=missing_rounds,
        )
        try:
            await self._on_recovery(state)
        except Exception as exc:
            log.error("[Transport:%s] Recovery handler error: %s", self.node_id, exc)

        if peer:
            peer.last_committed_seq = state.last_committed_seq

    # ── Ed25519 signing / verification ────────────────────────────────────────

    def _sign(self, envelope: PBFTEnvelope) -> PBFTEnvelope:
        """Return a copy of *envelope* with the signature field populated."""
        if not envelope.signing_bytes():
            return envelope
        sig = self._private_key.sign(envelope.signing_bytes())
        envelope.signature = sig.hex()
        return envelope

    def _verify(self, envelope: PBFTEnvelope) -> bool:
        """
        Verify the Ed25519 signature on *envelope*.

        Returns True if:
          - The sender has a registered public key AND the signature verifies, OR
          - The sender has no registered public key (log-and-accept in dev mode).
        Returns False if signature verification fails for a known sender.
        """
        pub = self._peer_pub_keys.get(envelope.sender_id)
        if pub is None:
            # Unknown sender: accept in dev mode, warn
            log.debug("[Transport:%s] No public key for %s — accepting unverified",
                      self.node_id, envelope.sender_id)
            return True

        if not envelope.signature:
            log.warning("[Transport:%s] Missing signature from %s",
                        self.node_id, envelope.sender_id)
            return False

        try:
            pub.verify(bytes.fromhex(envelope.signature), envelope.signing_bytes())
            return True
        except (InvalidSignature, ValueError):
            return False


# ── In-process transport (asyncio queues — dev / test) ───────────────────────


class InProcessTransport(PBFTTransport):
    """
    Single-process transport using asyncio.Queue objects.

    All 11 replicas share the same event loop.  No real TCP; no TLS.
    Suitable for development, unit tests, and the default inprocess mode.

    Usage
    -----
        transports = {nid: InProcessTransport(nid) for nid in NODE_IDS}
        # Wire them together
        for t in transports.values():
            t.register_peers({pid: other for pid, other in transports.items() if pid != t.node_id})
        for t in transports.values():
            await t.start()
    """

    def __init__(self, node_id: str) -> None:
        super().__init__(node_id)
        self._peers_map: dict[str, "InProcessTransport"] = {}
        self._inbox: asyncio.Queue[PBFTEnvelope] = asyncio.Queue(maxsize=1024)
        self._running = False
        self._dispatcher: asyncio.Task | None = None

    def register_peers(self, peers: dict[str, "InProcessTransport"]) -> None:
        self._peers_map = peers

    async def start(self) -> None:
        self._running = True
        self._dispatcher = asyncio.create_task(
            self._dispatch_loop(), name=f"inproc-dispatch-{self.node_id}"
        )

    async def stop(self) -> None:
        self._running = False
        if self._dispatcher:
            self._dispatcher.cancel()
            await asyncio.gather(self._dispatcher, return_exceptions=True)

    async def send(self, peer_id: str, envelope: PBFTEnvelope) -> None:
        target = self._peers_map.get(peer_id)
        if target is None:
            return
        try:
            target._inbox.put_nowait(envelope)
        except asyncio.QueueFull:
            log.warning("[InProc:%s] Inbox of %s full", self.node_id, peer_id)

    async def broadcast(self, envelope: PBFTEnvelope, exclude: set[str] | None = None) -> None:
        skip = exclude or set()
        for peer_id, t in self._peers_map.items():
            if peer_id in skip:
                continue
            try:
                t._inbox.put_nowait(envelope)
            except asyncio.QueueFull:
                log.warning("[InProc:%s] Inbox of %s full", self.node_id, peer_id)

    def peer_ids(self) -> list[str]:
        return list(self._peers_map)

    def connected_peers(self) -> list[str]:
        return list(self._peers_map)  # in-process: always "connected"

    def status(self) -> dict:
        return {
            "node_id": self.node_id,
            "mode": "inprocess",
            "peers": list(self._peers_map),
        }

    async def _dispatch_loop(self) -> None:
        while self._running:
            try:
                env = await asyncio.wait_for(self._inbox.get(), timeout=0.5)
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                return

            if self._on_message:
                try:
                    await self._on_message(env)
                except Exception as exc:
                    log.error("[InProc:%s] Message handler error: %s", self.node_id, exc)
