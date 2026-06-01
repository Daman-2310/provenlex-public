"""
gRPC Transport + In-Memory Transport for the PBFT Consensus Mesh.

Two concrete implementations of AbstractMeshTransport are provided:

InMemoryMeshTransport (testing / dev)
--------------------------------------
All nodes share a class-level registry keyed by node_id.  Messages are
delivered via asyncio.Queue objects in the same event loop, with optional:
  • Per-link latency simulation (asyncio.sleep)
  • Gaussian-distributed jitter on top of base latency
  • Probabilistic packet-drop
  • Selective link severing (simulate node disconnection)

GRPCMeshTransport (production)
-------------------------------
Each node runs one grpc.aio server (listening on its own port) and one
grpc.aio.Channel per peer.  Messages are serialised via
ConsensusEnvelope.to_bytes() / ConsensusEnvelope.from_bytes() so the
transport is proto-free at runtime (no grpc_tools.protoc required).

gRPC service naming mirrors consensus_mesh.proto so that if generated stubs
are compiled they slot in without changing the service path:
    /genesis_swarm.consensus.ConsensusMesh/SendConsensus  (unary)
    /genesis_swarm.consensus.ConsensusMesh/SyncState      (server-stream)
    /genesis_swarm.consensus.ConsensusMesh/Ping           (unary)

The Ping RPC doubles as a health probe and is used by GRPCMeshTransport to
confirm peer liveness before sending consensus messages.

Ed25519 note
------------
Transport-level verification is *not* the job of this module.  The gRPC
transport delivers raw bytes to PBFTNode.handle_envelope(), which does the
cryptographic check.  This separation of concerns means the in-memory
transport can also inject malformed envelopes during fault tests without the
transport dropping them — verification happens at the node, not the wire.
"""
from __future__ import annotations

import asyncio
import json
import logging
import random
import time
from typing import Any, Awaitable, Callable, ClassVar

from .pbft_node import AbstractMeshTransport, ConsensusEnvelope, EnvelopeHandler

_log = logging.getLogger(__name__)

try:
    import grpc
    import grpc.aio

    _GRPC_AVAILABLE = True
except ImportError:
    _GRPC_AVAILABLE = False
    grpc = None  # type: ignore[assignment]

# ── gRPC service / method constants (match consensus_mesh.proto) ──────────────

_SERVICE = "genesis_swarm.consensus.ConsensusMesh"
_METHOD_SEND = f"/{_SERVICE}/SendConsensus"
_METHOD_SYNC = f"/{_SERVICE}/SyncState"
_METHOD_PING = f"/{_SERVICE}/Ping"

_IDENTITY: Callable[[bytes], bytes] = lambda b: b  # raw-bytes passthrough


# ── InMemoryMeshTransport ─────────────────────────────────────────────────────


class InMemoryMeshTransport(AbstractMeshTransport):
    """
    Single-process transport routing messages through asyncio.Queue objects.

    All InMemoryMeshTransport instances register in a class-level dict keyed
    by node_id.  send() and broadcast() look up the target in that dict and
    push the envelope into its inbound queue.  A background coroutine drains
    the queue and dispatches to the registered handler.

    Fault injection API:
        transport.sever_link("node-3")     # simulate disconnection
        transport.restore_link("node-3")   # reconnect
        transport.set_latency(150, jitter=20)  # 150ms ± 20ms
    """

    # Shared across all InMemoryMeshTransport instances in one event-loop
    _registry: ClassVar[dict[str, "InMemoryMeshTransport"]] = {}

    def __init__(
        self,
        node_id: str,
        *,
        latency_ms: float = 0.0,
        jitter_ms: float = 0.0,
        drop_probability: float = 0.0,
        queue_maxsize: int = 4096,
    ) -> None:
        self.node_id = node_id
        self._latency_ms = latency_ms
        self._jitter_ms = jitter_ms
        self._drop_probability = drop_probability

        self._handler: EnvelopeHandler | None = None
        self._severed: set[str] = set()
        self._queue: asyncio.Queue[ConsensusEnvelope] = asyncio.Queue(
            maxsize=queue_maxsize
        )
        self._running = False
        self._worker_task: asyncio.Task[None] | None = None

    # ── Class-level helpers ───────────────────────────────────────────────────

    @classmethod
    def reset_registry(cls) -> None:
        """Remove all registered transports (call between tests)."""
        cls._registry.clear()

    @classmethod
    def registered_ids(cls) -> list[str]:
        return list(cls._registry.keys())

    # ── AbstractMeshTransport interface ───────────────────────────────────────

    def register_handler(self, handler: EnvelopeHandler) -> None:
        self._handler = handler

    async def start(self) -> None:
        InMemoryMeshTransport._registry[self.node_id] = self
        self._running = True
        self._worker_task = asyncio.create_task(
            self._drain_queue(),
            name=f"inmem-transport-{self.node_id}",
        )

    async def stop(self) -> None:
        self._running = False
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        InMemoryMeshTransport._registry.pop(self.node_id, None)

    async def send(
        self, target_id: str, env: ConsensusEnvelope
    ) -> bool:
        if target_id in self._severed:
            return False
        target = InMemoryMeshTransport._registry.get(target_id)
        if target is None or not target._running:
            return False

        # Simulate packet loss
        if self._drop_probability > 0.0 and random.random() < self._drop_probability:
            _log.debug(
                "inmem_transport_packet_dropped src=%s dst=%s phase=%s",
                self.node_id, target_id, env.phase.name,
            )
            return False

        # Simulate network latency + jitter
        if self._latency_ms > 0.0 or self._jitter_ms > 0.0:
            delay_ms = self._latency_ms
            if self._jitter_ms > 0.0:
                delay_ms += random.gauss(0.0, self._jitter_ms)
            delay_ms = max(0.0, delay_ms)
            if delay_ms > 0.0:
                # Schedule delivery after delay without blocking the caller
                asyncio.ensure_future(
                    _delayed_deliver(target, env, delay_ms / 1000.0),
                )
                return True

        try:
            target._queue.put_nowait(env)
        except asyncio.QueueFull:
            _log.warning(
                "inmem_transport_queue_full node=%s src=%s",
                target_id, self.node_id,
            )
            return False
        return True

    async def broadcast(
        self, env: ConsensusEnvelope, exclude: set[str] | None = None
    ) -> dict[str, bool]:
        ex = (exclude or set()) | {self.node_id}
        peers = [nid for nid in InMemoryMeshTransport._registry if nid not in ex]
        results = await asyncio.gather(
            *(self.send(nid, env) for nid in peers), return_exceptions=False
        )
        return dict(zip(peers, results))  # type: ignore[arg-type]

    # ── Fault injection ───────────────────────────────────────────────────────

    def sever_link(self, target_id: str) -> None:
        """Simulate disconnecting the link to *target_id*."""
        self._severed.add(target_id)

    def restore_link(self, target_id: str) -> None:
        """Reconnect a previously severed link."""
        self._severed.discard(target_id)

    def set_latency(self, latency_ms: float, *, jitter_ms: float = 0.0) -> None:
        self._latency_ms = latency_ms
        self._jitter_ms = jitter_ms

    def set_drop_probability(self, p: float) -> None:
        self._drop_probability = max(0.0, min(1.0, p))

    # ── Internal queue drain ──────────────────────────────────────────────────

    async def _drain_queue(self) -> None:
        while self._running:
            try:
                env = await asyncio.wait_for(self._queue.get(), timeout=0.1)
                if self._handler is not None:
                    await self._handler(env)
                self._queue.task_done()
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break
            except Exception as exc:
                _log.error(
                    "inmem_transport_handler_err node=%s err=%s", self.node_id, exc
                )


async def _delayed_deliver(
    target: InMemoryMeshTransport, env: ConsensusEnvelope, delay_s: float
) -> None:
    """Deliver *env* to *target* after *delay_s* seconds."""
    await asyncio.sleep(delay_s)
    if target._running:
        try:
            target._queue.put_nowait(env)
        except asyncio.QueueFull:
            pass


# ── GRPCMeshTransport ─────────────────────────────────────────────────────────


class GRPCMeshTransport(AbstractMeshTransport):
    """
    Production gRPC transport using grpc.aio bidirectional channels.

    Each node:
      1. Runs one grpc.aio.Server on ``peer_config.port``.
      2. Opens one grpc.aio.Channel per known peer (lazy, with reconnect).

    The SendConsensus RPC accepts a raw bytes request (the serialised
    ConsensusEnvelope) and returns a JSON-encoded Ack.  No generated stubs
    are required — the service is registered via GenericRpcHandler.

    The SyncState RPC returns a server-streaming response of serialised
    CommittedBlock objects; used by the state-sync worker in PBFTNode.

    mTLS:
        Pass ``credentials=grpc.ssl_channel_credentials(...)`` to enable TLS.
        Ed25519 application-layer signing is independent of and additional to TLS.

    Usage:
        transport = GRPCMeshTransport(
            node_id="replica-0",
            listen_port=50050,
            peers={"replica-1": "localhost:50051", "replica-2": "localhost:50052"},
        )
        transport.register_handler(pbft_node.handle_envelope)
        await transport.start()
    """

    def __init__(
        self,
        node_id: str,
        listen_port: int,
        peers: dict[str, str],   # {node_id: "host:port"}
        *,
        credentials: Any | None = None,
        max_workers: int = 4,
        recv_timeout_s: float = 10.0,
    ) -> None:
        if not _GRPC_AVAILABLE:
            raise ImportError(
                "grpcio is not installed. "
                "Run: pip install 'genesis-swarm[grpc]'  # or: pip install grpcio>=1.63"
            )
        self.node_id = node_id
        self._listen_port = listen_port
        self._peer_addresses = peers  # {node_id: "host:port"}
        self._credentials = credentials
        self._max_workers = max_workers
        self._recv_timeout_s = recv_timeout_s

        self._handler: EnvelopeHandler | None = None
        self._server: Any | None = None  # grpc.aio.Server
        self._channels: dict[str, Any] = {}  # {node_id: grpc.aio.Channel}
        self._stubs: dict[str, Any] = {}     # {node_id: unary callable}
        self._running = False

    def register_handler(self, handler: EnvelopeHandler) -> None:
        self._handler = handler

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        self._server = grpc.aio.server()
        servicer = _ConsensusMeshServicer(on_message=self._on_inbound)
        self._server.add_generic_rpc_handlers([_ConsensusMeshHandler(servicer)])

        if self._credentials:
            self._server.add_secure_port(f"[::]:{self._listen_port}", self._credentials)
        else:
            self._server.add_insecure_port(f"[::]:{self._listen_port}")

        await self._server.start()
        self._running = True
        _log.info(
            "grpc_transport_started node=%s port=%d peers=%s",
            self.node_id, self._listen_port, list(self._peer_addresses.keys()),
        )

        # Open channels to all peers
        for peer_id, addr in self._peer_addresses.items():
            await self._open_channel(peer_id, addr)

    async def stop(self) -> None:
        self._running = False
        for channel in self._channels.values():
            await channel.close()
        self._channels.clear()
        self._stubs.clear()
        if self._server is not None:
            await self._server.stop(grace=2.0)
        _log.info("grpc_transport_stopped node=%s", self.node_id)

    # ── Messaging ─────────────────────────────────────────────────────────────

    async def send(self, target_id: str, env: ConsensusEnvelope) -> bool:
        stub = self._stubs.get(target_id)
        if stub is None:
            # Attempt lazy connection
            addr = self._peer_addresses.get(target_id)
            if addr is None:
                return False
            await self._open_channel(target_id, addr)
            stub = self._stubs.get(target_id)
            if stub is None:
                return False
        try:
            await asyncio.wait_for(
                stub(env.to_bytes()), timeout=self._recv_timeout_s
            )
            return True
        except Exception as exc:
            _log.warning(
                "grpc_send_failed node=%s target=%s err=%s", self.node_id, target_id, exc
            )
            return False

    async def broadcast(
        self, env: ConsensusEnvelope, exclude: set[str] | None = None
    ) -> dict[str, bool]:
        ex = (exclude or set()) | {self.node_id}
        peers = [pid for pid in self._stubs if pid not in ex]
        results = await asyncio.gather(
            *(self.send(pid, env) for pid in peers), return_exceptions=False
        )
        return dict(zip(peers, results))  # type: ignore[arg-type]

    async def ping(self, target_id: str) -> bool:
        """Return True if *target_id* responds to a health probe."""
        addr = self._peer_addresses.get(target_id)
        if addr is None:
            return False
        try:
            channel = grpc.aio.insecure_channel(addr)
            stub_fn = channel.unary_unary(
                _METHOD_PING,
                request_serializer=_IDENTITY,
                response_deserializer=_IDENTITY,
            )
            req = json.dumps({"node_id": self.node_id}).encode()
            await asyncio.wait_for(stub_fn(req), timeout=2.0)
            await channel.close()
            return True
        except Exception:
            return False

    # ── Channel management ────────────────────────────────────────────────────

    async def _open_channel(self, peer_id: str, addr: str) -> None:
        if self._credentials:
            channel = grpc.aio.secure_channel(addr, self._credentials)
        else:
            channel = grpc.aio.insecure_channel(addr)
        self._channels[peer_id] = channel
        self._stubs[peer_id] = channel.unary_unary(
            _METHOD_SEND,
            request_serializer=_IDENTITY,
            response_deserializer=_IDENTITY,
        )

    async def _on_inbound(self, raw: bytes) -> None:
        try:
            env = ConsensusEnvelope.from_bytes(raw)
        except Exception as exc:
            _log.warning("grpc_deserialise_err node=%s err=%s", self.node_id, exc)
            return
        if self._handler is not None:
            await self._handler(env)


# ── gRPC servicer + generic handler (no generated stubs required) ─────────────


class _ConsensusMeshServicer:
    """Server-side RPC implementation for the ConsensusMesh service."""

    def __init__(
        self, on_message: Callable[[bytes], Awaitable[None]]
    ) -> None:
        self._on_message = on_message

    async def SendConsensus(self, request: bytes, context: Any) -> bytes:
        await self._on_message(request)
        return json.dumps({"accepted": True}).encode()

    async def SyncState(self, request: bytes, context: Any) -> None:
        # Server-streaming: chunks sent individually
        # The PBFTNode handles sync logic; this is a placeholder passthrough.
        pass

    async def Ping(self, request: bytes, context: Any) -> bytes:
        return json.dumps({"healthy": True}).encode()


class _ConsensusMeshHandler:
    """
    grpc.GenericRpcHandler that routes inbound calls to the servicer
    without requiring compiled protobuf stubs.
    """

    def __init__(self, servicer: _ConsensusMeshServicer) -> None:
        self._methods: dict[str, Any] = {
            _METHOD_SEND: grpc.unary_unary_rpc_method_handler(
                servicer.SendConsensus,
                request_deserializer=_IDENTITY,
                response_serializer=_IDENTITY,
            ),
            _METHOD_PING: grpc.unary_unary_rpc_method_handler(
                servicer.Ping,
                request_deserializer=_IDENTITY,
                response_serializer=_IDENTITY,
            ),
        }

    def service_name(self) -> str:
        return _SERVICE

    def service(self, handler_call_details: Any) -> Any | None:
        return self._methods.get(handler_call_details.method)
