"""
Production async gRPC networking pipeline for Genesis Swarm PBFT mesh.

Integrates :mod:`genesis_swarm.shared.binary_serializer` for zero-copy binary
wire encoding, manages per-peer gRPC channel lifecycle with TCP keep-alive,
and implements exponential-backoff retry to prevent network deadlocks during
multi-region connection spikes.

Architecture
────────────
    NetworkCore (implements AbstractMeshTransport)
      ├── _ManagedChannel × N   — one per PBFT peer
      │     ├── grpc.aio.Channel  (with TCP keep-alive + SO_REUSEPORT)
      │     └── ChannelStats      (health, RTT counters, error tracking)
      ├── _KeepAliveLoop          — async background task
      │     └── pings all channels every ``keepalive_interval_s``
      │           ├── marks unhealthy after ``unhealthy_threshold`` failures
      │           └── resets channel on recovery
      └── _NetworkCoreServer      — grpc.aio.Server receiving inbound frames
            └── _ConsensusHandler (GenericRpcHandler)
                  ├── /SendConsensus — unary→unary, binary ENV in/out
                  └── /Ping          — unary→unary, binary liveness check

Wire Protocol
─────────────
All messages use the binary ENV frame from ``binary_serializer``.
Ping request/response uses the compact TX frame (magic ``GSTX``) with
``tenant_id=0``, ``sequence_id=0``, ``balance_delta=0.0``, and a 1-byte
signature carrying the node_id hash preamble.

The module is a drop-in replacement for
:class:`~genesis_swarm.consensus.grpc_transport.GRPCMeshTransport`; it
implements :class:`~genesis_swarm.consensus.pbft_node.AbstractMeshTransport`
and can be wired into a :class:`~genesis_swarm.consensus.pbft_node.PBFTNode`
without any changes to the consensus engine.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import random
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Final

try:
    import grpc
    import grpc.aio

    _GRPC_AVAILABLE: bool = True
except ImportError:  # pragma: no cover
    grpc = None  # type: ignore[assignment]
    _GRPC_AVAILABLE = False

from genesis_swarm.consensus.pbft_node import (
    AbstractMeshTransport,
    ConsensusEnvelope,
    EnvelopeHandler,
    MessagePhase,
    NodePeer,
)
from genesis_swarm.shared.binary_serializer import (
    BinaryParserError,
    EnvelopeFrame,
    pack_envelope,
    pack_transaction,
    unpack_envelope,
    unpack_transaction,
)

_log = logging.getLogger(__name__)

# ── gRPC service paths (mirror consensus_mesh.proto) ─────────────────────────

_SERVICE_NAME: Final[str] = "genesis_swarm.consensus.ConsensusMesh"
_SEND_METHOD: Final[str] = f"/{_SERVICE_NAME}/SendConsensus"
_PING_METHOD: Final[str] = f"/{_SERVICE_NAME}/Ping"

# Passthrough serializers for raw-bytes RPC methods (no compiled stubs)
_PASS: Callable[[bytes], bytes] = lambda x: x

# ── Tunable defaults (all overridable via environment variables) ──────────────

_KEEPALIVE_TIME_MS: Final[int] = int(os.getenv("NC_KEEPALIVE_TIME_MS", "10000"))
_KEEPALIVE_TIMEOUT_MS: Final[int] = int(os.getenv("NC_KEEPALIVE_TIMEOUT_MS", "5000"))
_MAX_RECONNECT_BACKOFF_MS: Final[int] = int(
    os.getenv("NC_MAX_RECONNECT_BACKOFF_MS", "10000")
)
_INITIAL_RECONNECT_BACKOFF_MS: Final[int] = int(
    os.getenv("NC_INITIAL_RECONNECT_BACKOFF_MS", "100")
)
_SEND_TIMEOUT_S: Final[float] = float(os.getenv("NC_SEND_TIMEOUT_S", "5.0"))
_PING_TIMEOUT_S: Final[float] = float(os.getenv("NC_PING_TIMEOUT_S", "2.0"))
_KEEPALIVE_INTERVAL_S: Final[float] = float(os.getenv("NC_KEEPALIVE_INTERVAL_S", "10.0"))
_UNHEALTHY_THRESHOLD: Final[int] = int(os.getenv("NC_UNHEALTHY_THRESHOLD", "3"))
_MAX_CONCURRENT_STREAMS: Final[int] = int(os.getenv("NC_MAX_CONCURRENT_STREAMS", "100"))

# Retry policy
_RETRY_BASE_DELAY_S: Final[float] = 0.1
_RETRY_MAX_DELAY_S: Final[float] = 10.0
_RETRY_MAX_ATTEMPTS: Final[int] = 5
_RETRY_JITTER_FACTOR: Final[float] = 0.25   # ±25% Gaussian jitter cap

# Ping frame constants (tenant_id=0, seq=0, delta=0.0, 1-byte sig)
_PING_TENANT_ID: Final[int] = 0
_PING_SEQ_ID: Final[int] = 0
_PING_BALANCE_DELTA: Final[float] = 0.0
_PING_SIG_LEN: Final[int] = 1


# ── Network configuration ─────────────────────────────────────────────────────

@dataclass
class NetworkConfig:
    """Full configuration for a :class:`NetworkCore` instance.

    Attributes:
        node_id: Unique identifier for the local node.
        host: Local gRPC server bind address (e.g. ``"0.0.0.0"``).
        port: Local gRPC server port.
        peers: Ordered list of known cluster members (excludes self).
        credentials: gRPC channel credentials, or ``None`` for insecure.
        keepalive_time_ms: Milliseconds between HTTP/2 keep-alive pings.
        keepalive_timeout_ms: Milliseconds to wait for a keep-alive ACK.
        max_reconnect_backoff_ms: Maximum backoff for gRPC internal reconnect.
        initial_reconnect_backoff_ms: Initial backoff for gRPC internal reconnect.
        max_concurrent_streams: Maximum concurrent HTTP/2 streams per channel.
        send_timeout_s: Per-RPC send timeout in seconds.
        ping_timeout_s: Keep-alive ping RPC timeout in seconds.
        keepalive_interval_s: Seconds between background health-ping sweeps.
        unhealthy_threshold: Consecutive ping failures before marking unhealthy.
    """

    node_id: str
    host: str
    port: int
    peers: list[NodePeer]
    credentials: Any | None = None   # grpc.ChannelCredentials | None
    keepalive_time_ms: int = _KEEPALIVE_TIME_MS
    keepalive_timeout_ms: int = _KEEPALIVE_TIMEOUT_MS
    max_reconnect_backoff_ms: int = _MAX_RECONNECT_BACKOFF_MS
    initial_reconnect_backoff_ms: int = _INITIAL_RECONNECT_BACKOFF_MS
    max_concurrent_streams: int = _MAX_CONCURRENT_STREAMS
    send_timeout_s: float = _SEND_TIMEOUT_S
    ping_timeout_s: float = _PING_TIMEOUT_S
    keepalive_interval_s: float = _KEEPALIVE_INTERVAL_S
    unhealthy_threshold: int = _UNHEALTHY_THRESHOLD


# ── Channel health statistics ─────────────────────────────────────────────────

@dataclass
class ChannelStats:
    """Per-peer connection health snapshot.

    Attributes:
        peer_id: Node identifier of the remote peer.
        address: ``host:port`` of the peer.
        is_healthy: ``True`` when recent pings succeed.
        consecutive_failures: Consecutive failed pings since last recovery.
        last_ping_ns: Monotonic nanoseconds of most recent successful ping.
        rtt_ns: Round-trip time of most recent successful ping in nanoseconds,
            or ``None`` if no successful ping has been recorded yet.
        messages_sent: Total :class:`ConsensusEnvelope` objects delivered.
        bytes_sent: Total wire bytes transmitted (before retries).
    """

    peer_id: str
    address: str
    is_healthy: bool = True
    consecutive_failures: int = 0
    last_ping_ns: int = 0
    rtt_ns: int | None = None
    messages_sent: int = 0
    bytes_sent: int = 0


# ── Exponential backoff with jitter ──────────────────────────────────────────

class _RetryPolicy:
    """Exponential backoff retry with bounded Gaussian jitter.

    Attributes:
        base_delay_s: Initial delay in seconds (before jitter).
        max_delay_s: Maximum delay cap in seconds (before jitter).
        max_attempts: Maximum retry attempts before propagating the exception.
    """

    def __init__(
        self,
        *,
        base_delay_s: float = _RETRY_BASE_DELAY_S,
        max_delay_s: float = _RETRY_MAX_DELAY_S,
        max_attempts: int = _RETRY_MAX_ATTEMPTS,
    ) -> None:
        self._base = base_delay_s
        self._max = max_delay_s
        self._max_attempts = max_attempts

    def _delay(self, attempt: int) -> float:
        """Compute jittered delay for *attempt* (0-indexed).

        Args:
            attempt: Zero-indexed attempt number.

        Returns:
            Jittered sleep duration in seconds.
        """
        raw = min(self._base * (2.0 ** attempt), self._max)
        jitter = raw * _RETRY_JITTER_FACTOR * random.gauss(0.0, 1.0)
        return max(0.0, raw + jitter)

    async def run(self, coro_fn: Callable[[], Awaitable[Any]]) -> Any:
        """Execute *coro_fn()* retrying on :class:`Exception` up to max_attempts.

        Args:
            coro_fn: Zero-argument async callable to execute and potentially retry.

        Returns:
            Return value of the first successful execution.

        Raises:
            Exception: The last exception raised after exhausting all retries.
        """
        last_exc: Exception | None = None
        for attempt in range(self._max_attempts):
            try:
                return await coro_fn()
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                if attempt < self._max_attempts - 1:
                    delay = self._delay(attempt)
                    _log.debug(
                        "retry attempt %d/%d in %.3f s: %s",
                        attempt + 1,
                        self._max_attempts,
                        delay,
                        exc,
                    )
                    await asyncio.sleep(delay)
        raise last_exc  # type: ignore[misc]


# ── Per-peer managed channel ──────────────────────────────────────────────────

def _build_channel_options(cfg: NetworkConfig) -> list[tuple[str, Any]]:
    """Build gRPC channel options list from *cfg*.

    Args:
        cfg: Active :class:`NetworkConfig`.

    Returns:
        List of ``(option_name, value)`` pairs suitable for ``grpc.aio.secure_channel``
        or ``grpc.aio.insecure_channel``.
    """
    return [
        ("grpc.keepalive_time_ms", cfg.keepalive_time_ms),
        ("grpc.keepalive_timeout_ms", cfg.keepalive_timeout_ms),
        # Allow keep-alive pings even when there are no active RPCs
        ("grpc.keepalive_permit_without_calls", 1),
        # Disable gRPC-level flood protection (our own policy limits rates)
        ("grpc.http2.max_pings_without_data", 0),
        ("grpc.http2.min_time_between_pings_ms", cfg.keepalive_time_ms),
        ("grpc.http2.min_ping_interval_without_data_ms", cfg.keepalive_timeout_ms),
        ("grpc.max_reconnect_backoff_ms", cfg.max_reconnect_backoff_ms),
        ("grpc.initial_reconnect_backoff_ms", cfg.initial_reconnect_backoff_ms),
        # Disable built-in gRPC retries — _RetryPolicy handles retries explicitly
        ("grpc.enable_retries", 0),
        ("grpc.max_concurrent_streams", cfg.max_concurrent_streams),
        # Linux: enable TCP zero-copy TX (NOOP on other platforms)
        ("grpc.tcp_tx_zerocopy_enabled", 1),
        # Enable TCP SO_REUSEPORT for fast socket recycling
        ("grpc.so_reuseport", 1),
    ]


class _ManagedChannel:
    """Lifecycle-managed gRPC channel to a single PBFT peer.

    Owns an ``asyncio.Lock`` to serialise channel resets.  Health statistics
    are updated after every send attempt and background ping sweep.

    Args:
        peer: Static peer configuration.
        cfg: Active :class:`NetworkConfig` (used for channel options).
    """

    def __init__(self, peer: NodePeer, cfg: NetworkConfig) -> None:
        if not _GRPC_AVAILABLE:
            raise RuntimeError("grpcio is not installed — cannot create ManagedChannel")
        self._peer = peer
        self._cfg = cfg
        self._options = _build_channel_options(cfg)
        self.stats = ChannelStats(peer_id=peer.node_id, address=peer.address)
        self._lock = asyncio.Lock()
        self._channel: grpc.aio.Channel = self._open()

    def _open(self) -> grpc.aio.Channel:
        """Open a new gRPC channel to the peer's address.

        Returns:
            A fresh ``grpc.aio.Channel`` instance.
        """
        if self._cfg.credentials is not None:
            return grpc.aio.secure_channel(
                self._peer.address, self._cfg.credentials, options=self._options
            )
        return grpc.aio.insecure_channel(self._peer.address, options=self._options)

    async def reset(self) -> None:
        """Close the existing channel and open a fresh one.

        Acquires the internal lock to serialise concurrent resets.
        """
        async with self._lock:
            try:
                await self._channel.close(grace=0)
            except Exception:  # noqa: BLE001
                pass
            self._channel = self._open()
            self.stats.consecutive_failures = 0
            self.stats.is_healthy = True
            _log.info("reset channel to peer %s", self._peer.node_id)

    async def send_raw(self, raw: bytes, *, timeout_s: float) -> bytes:
        """Transmit *raw* bytes via the ``/SendConsensus`` unary RPC.

        Args:
            raw: Binary-encoded :class:`ConsensusEnvelope` frame.
            timeout_s: RPC deadline in seconds.

        Returns:
            Raw bytes returned by the peer (ACK frame).

        Raises:
            grpc.RpcError: On RPC failure (callers should handle and track health).
        """
        stub = self._channel.unary_unary(
            _SEND_METHOD,
            request_serializer=_PASS,
            response_deserializer=_PASS,
        )
        return await stub(raw, timeout=timeout_s)

    async def ping_raw(self, ping_frame: bytes, *, timeout_s: float) -> tuple[bool, int]:
        """Send a binary ping frame and return ``(success, rtt_ns)``.

        Args:
            ping_frame: Packed TX ping frame.
            timeout_s: RPC deadline in seconds.

        Returns:
            ``(True, rtt_ns)`` on success, ``(False, 0)`` on any failure.
        """
        stub = self._channel.unary_unary(
            _PING_METHOD,
            request_serializer=_PASS,
            response_deserializer=_PASS,
        )
        t0 = time.monotonic_ns()
        try:
            await stub(ping_frame, timeout=timeout_s)
            rtt = time.monotonic_ns() - t0
            return True, rtt
        except Exception:  # noqa: BLE001
            return False, 0

    async def close(self) -> None:
        """Gracefully close the underlying gRPC channel.

        Args: (none)

        Returns: (none)
        """
        async with self._lock:
            try:
                await self._channel.close(grace=2)
            except Exception:  # noqa: BLE001
                pass


# ── Background keep-alive loop ────────────────────────────────────────────────

class _KeepAliveLoop:
    """Async background task that pings all managed channels periodically.

    A ping sweep runs every ``interval_s`` seconds.  If a channel accumulates
    ``threshold`` consecutive failures its ``is_healthy`` flag is cleared and
    the channel is scheduled for a reset on the next successful probe.

    Args:
        channels: Mapping of ``peer_id → _ManagedChannel``.
        ping_frame: Serialised binary ping frame (reused across sweeps).
        ping_timeout_s: Per-ping RPC timeout.
        interval_s: Seconds between complete sweep cycles.
        threshold: Consecutive failures before marking a channel unhealthy.
    """

    def __init__(
        self,
        channels: dict[str, _ManagedChannel],
        ping_frame: bytes,
        *,
        ping_timeout_s: float,
        interval_s: float,
        threshold: int,
    ) -> None:
        self._channels = channels
        self._ping_frame = ping_frame
        self._ping_timeout_s = ping_timeout_s
        self._interval_s = interval_s
        self._threshold = threshold
        self._task: asyncio.Task[None] | None = None
        self._stopping = False

    async def start(self) -> None:
        """Start the background ping sweep task.

        Returns: (none)
        """
        self._stopping = False
        self._task = asyncio.create_task(self._run(), name="nc-keepalive")

    async def stop(self) -> None:
        """Cancel the background task and await its completion.

        Returns: (none)
        """
        self._stopping = True
        if self._task is not None and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None

    async def _run(self) -> None:
        """Main sweep loop — runs until cancelled.

        Returns: (none)
        """
        while not self._stopping:
            await asyncio.sleep(self._interval_s)
            await self._sweep()

    async def _sweep(self) -> None:
        """Probe every channel concurrently in a single asyncio gather.

        Returns: (none)
        """
        tasks = {
            peer_id: asyncio.create_task(
                ch.ping_raw(self._ping_frame, timeout_s=self._ping_timeout_s)
            )
            for peer_id, ch in self._channels.items()
        }
        results: dict[str, tuple[bool, int]] = {}
        for peer_id, task in tasks.items():
            try:
                results[peer_id] = await task
            except Exception:  # noqa: BLE001
                results[peer_id] = (False, 0)

        for peer_id, (ok, rtt_ns) in results.items():
            ch = self._channels[peer_id]
            stats = ch.stats
            if ok:
                stats.consecutive_failures = 0
                stats.is_healthy = True
                stats.last_ping_ns = time.monotonic_ns()
                stats.rtt_ns = rtt_ns
            else:
                stats.consecutive_failures += 1
                if stats.consecutive_failures >= self._threshold:
                    if stats.is_healthy:
                        _log.warning(
                            "peer %s marked unhealthy after %d consecutive ping failures",
                            peer_id,
                            stats.consecutive_failures,
                        )
                    stats.is_healthy = False
                    # Attempt channel reset on the next sweep detection
                    asyncio.ensure_future(ch.reset())


# ── gRPC server — inbound frame handling ─────────────────────────────────────

class _ConsensusHandler(grpc.GenericRpcHandler if _GRPC_AVAILABLE else object):
    """Raw-bytes gRPC service handler for the ConsensusMesh service.

    Registers the ``/SendConsensus`` and ``/Ping`` methods without compiled
    protobuf stubs.  All framing uses the binary ENV format from
    :mod:`genesis_swarm.shared.binary_serializer`.

    Args:
        handler: Async callback invoked for every valid inbound
            :class:`ConsensusEnvelope`.
        node_id: Local node identifier (returned in ping ACK).
    """

    def __init__(self, handler: EnvelopeHandler, node_id: str) -> None:
        self._handler = handler
        self._node_id = node_id
        # Pre-compute a 1-byte ping signature from the local node ID hash
        self._ping_sig: bytes = bytes(
            [hashlib.sha256(node_id.encode()).digest()[0]]
        )

    def service_name(self) -> str:
        """Return the gRPC service name string.

        Returns:
            Service name as it appears in the proto definition.
        """
        return _SERVICE_NAME

    def service(
        self, handler_call_details: grpc.HandlerCallDetails
    ) -> grpc.RpcMethodHandler | None:
        """Route an inbound call to the appropriate RPC method handler.

        Args:
            handler_call_details: Contains the full method path.

        Returns:
            A :class:`grpc.RpcMethodHandler` or ``None`` when the method is
            not implemented.
        """
        method: str = handler_call_details.method
        if method == _SEND_METHOD:
            return grpc.unary_unary_rpc_method_handler(
                self._handle_send,
                request_deserializer=_PASS,
                response_serializer=_PASS,
            )
        if method == _PING_METHOD:
            return grpc.unary_unary_rpc_method_handler(
                self._handle_ping,
                request_deserializer=_PASS,
                response_serializer=_PASS,
            )
        return None

    async def _handle_send(self, raw: bytes, context: Any) -> bytes:
        """Decode an inbound binary ENV frame, dispatch to the handler.

        Args:
            raw: Binary ENV frame received from a peer.
            context: gRPC server call context.

        Returns:
            Binary ACK frame (echo of the seq field as a 1-byte ping frame).
        """
        try:
            frame: EnvelopeFrame = unpack_envelope(raw)
        except BinaryParserError as exc:
            _log.warning("rejected malformed inbound frame from peer: %s", exc)
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(exc))
            return b""

        env = _frame_to_envelope(frame)
        try:
            await self._handler(env)
        except Exception as exc:  # noqa: BLE001
            _log.error("envelope handler raised: %s", exc, exc_info=True)
            await context.abort(grpc.StatusCode.INTERNAL, "handler error")
            return b""

        # Minimal ACK: single-byte ping frame confirming seq delivery
        return pack_transaction(
            tenant_id=0, sequence_id=env.seq, balance_delta=0.0,
            signature=self._ping_sig,
        )

    async def _handle_ping(self, raw: bytes, context: Any) -> bytes:
        """Respond to a binary ping frame with an echo ACK.

        Args:
            raw: Binary TX ping frame from a peer.
            context: gRPC server call context.

        Returns:
            Echo ping frame confirming liveness.
        """
        try:
            unpack_transaction(raw)
        except BinaryParserError as exc:
            _log.debug("invalid ping frame: %s", exc)
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(exc))
            return b""

        return pack_transaction(
            tenant_id=0,
            sequence_id=0,
            balance_delta=0.0,
            signature=self._ping_sig,
        )


class _NetworkCoreServer:
    """Thin wrapper around a ``grpc.aio.Server`` for inbound consensus frames.

    Args:
        cfg: :class:`NetworkConfig` supplying address and credential settings.
        handler: Async callback invoked for each valid inbound envelope.
    """

    def __init__(self, cfg: NetworkConfig, handler: EnvelopeHandler) -> None:
        if not _GRPC_AVAILABLE:
            raise RuntimeError("grpcio is not installed — cannot start server")
        self._cfg = cfg
        self._handler = handler
        self._server: grpc.aio.Server | None = None

    async def start(self) -> None:
        """Create and start the gRPC server.

        Returns: (none)
        """
        server_options = [
            ("grpc.max_concurrent_streams", self._cfg.max_concurrent_streams),
            ("grpc.keepalive_time_ms", self._cfg.keepalive_time_ms),
            ("grpc.keepalive_timeout_ms", self._cfg.keepalive_timeout_ms),
            ("grpc.keepalive_permit_without_calls", 1),
            ("grpc.so_reuseport", 1),
        ]
        self._server = grpc.aio.server(options=server_options)
        self._server.add_generic_rpc_handlers(
            [_ConsensusHandler(self._handler, self._cfg.node_id)]
        )
        address = f"{self._cfg.host}:{self._cfg.port}"
        if self._cfg.credentials is not None:
            self._server.add_secure_port(address, self._cfg.credentials)
        else:
            self._server.add_insecure_port(address)
        await self._server.start()
        _log.info("NetworkCore server listening on %s", address)

    async def stop(self, grace_s: float = 3.0) -> None:
        """Gracefully stop the gRPC server.

        Args:
            grace_s: Seconds to wait for in-flight RPCs to complete.

        Returns: (none)
        """
        if self._server is not None:
            await self._server.stop(grace_s)
            self._server = None


# ── Envelope ↔ binary frame bridge ───────────────────────────────────────────

def _envelope_to_wire(env: ConsensusEnvelope) -> bytes:
    """Serialise a :class:`ConsensusEnvelope` into a binary ENV wire frame.

    Args:
        env: Outbound consensus message.

    Returns:
        Binary ENV frame bytes.

    Raises:
        BinaryParserError: If any envelope field fails boundary validation.
    """
    return pack_envelope(
        phase=int(env.phase),
        view=env.view,
        seq=env.seq,
        timestamp_ns=env.timestamp_ns,
        digest=env.digest.encode("ascii"),
        merkle_root=env.merkle_root.encode("ascii"),
        ed25519_pubkey=env.ed25519_pubkey,
        ed25519_sig=env.signature,
        sender_id=env.sender_id,
        payload=env.payload,
    )


def _frame_to_envelope(frame: EnvelopeFrame) -> ConsensusEnvelope:
    """Convert a decoded :class:`EnvelopeFrame` back to a :class:`ConsensusEnvelope`.

    Args:
        frame: Decoded binary frame from :func:`~binary_serializer.unpack_envelope`.

    Returns:
        A fully populated :class:`ConsensusEnvelope`.
    """
    return ConsensusEnvelope(
        phase=MessagePhase(frame.phase),
        view=frame.view,
        seq=frame.seq,
        digest=frame.digest.decode("ascii"),
        sender_id=frame.sender_id,
        ed25519_pubkey=frame.ed25519_pubkey,
        signature=frame.ed25519_sig,
        payload=frame.payload,
        timestamp_ns=frame.timestamp_ns,
        merkle_root=frame.merkle_root.decode("ascii"),
    )


# ── NetworkCore — top-level facade ────────────────────────────────────────────

class NetworkCore(AbstractMeshTransport):
    """Production async gRPC transport implementing :class:`AbstractMeshTransport`.

    Replaces JSON-over-WebSocket transport with binary-encoded gRPC channels,
    per-peer connection lifecycle management, and a background keep-alive loop.

    Args:
        cfg: Full :class:`NetworkConfig` for this node.

    Example::

        peers = [NodePeer("node-001", "10.0.0.1", 9001, pubkey_bytes), ...]
        cfg = NetworkConfig(node_id="node-000", host="0.0.0.0", port=9000, peers=peers)
        transport = NetworkCore(cfg)
        transport.register_handler(my_pbft_node.handle_envelope)
        await transport.start()
        # ... run consensus ...
        await transport.stop()
    """

    def __init__(self, cfg: NetworkConfig) -> None:
        if not _GRPC_AVAILABLE:
            raise RuntimeError(
                "grpcio is not installed.  Install it with: pip install grpcio"
            )
        self._cfg = cfg
        self.node_id: str = cfg.node_id
        self._handler: EnvelopeHandler | None = None
        self._channels: dict[str, _ManagedChannel] = {
            p.node_id: _ManagedChannel(p, cfg) for p in cfg.peers
        }
        self._retry = _RetryPolicy(
            base_delay_s=_RETRY_BASE_DELAY_S,
            max_delay_s=_RETRY_MAX_DELAY_S,
            max_attempts=_RETRY_MAX_ATTEMPTS,
        )
        # Pre-build the ping frame once (reused across all keep-alive sweeps)
        _ping_sig = bytes([hashlib.sha256(cfg.node_id.encode()).digest()[0]])
        self._ping_frame = pack_transaction(
            tenant_id=_PING_TENANT_ID,
            sequence_id=_PING_SEQ_ID,
            balance_delta=_PING_BALANCE_DELTA,
            signature=_ping_sig,
        )
        self._keepalive = _KeepAliveLoop(
            self._channels,
            self._ping_frame,
            ping_timeout_s=cfg.ping_timeout_s,
            interval_s=cfg.keepalive_interval_s,
            threshold=cfg.unhealthy_threshold,
        )
        self._server: _NetworkCoreServer | None = None

    # ── AbstractMeshTransport interface ──────────────────────────────────────

    def register_handler(self, handler: EnvelopeHandler) -> None:
        """Register the async callback that processes inbound envelopes.

        Args:
            handler: Coroutine function ``async def handler(env: ConsensusEnvelope) -> None``.

        Returns: (none)
        """
        self._handler = handler

    async def start(self) -> None:
        """Start the gRPC server and the background keep-alive loop.

        The handler *must* be registered via :meth:`register_handler` before
        calling ``start()``.

        Returns: (none)

        Raises:
            RuntimeError: If no handler has been registered.
        """
        if self._handler is None:
            raise RuntimeError(
                "NetworkCore.start() called before register_handler() — "
                "register the PBFT node handler first."
            )
        self._server = _NetworkCoreServer(self._cfg, self._handler)
        await self._server.start()
        await self._keepalive.start()
        _log.info(
            "NetworkCore started: node=%s  peers=%d",
            self.node_id,
            len(self._channels),
        )

    async def stop(self) -> None:
        """Gracefully shut down the server, keep-alive loop, and all channels.

        Returns: (none)
        """
        await self._keepalive.stop()
        if self._server is not None:
            await self._server.stop(grace_s=3.0)
        close_tasks = [ch.close() for ch in self._channels.values()]
        await asyncio.gather(*close_tasks, return_exceptions=True)
        _log.info("NetworkCore stopped: node=%s", self.node_id)

    async def send(self, target_id: str, env: ConsensusEnvelope) -> bool:
        """Serialise *env* and deliver it to *target_id* with retry.

        Unhealthy channels are still attempted — the retry policy may recover
        them.  The keep-alive loop resets channels that become permanently
        unresponsive.

        Args:
            target_id: Node ID of the intended recipient.
            env: :class:`ConsensusEnvelope` to deliver.

        Returns:
            ``True`` on successful delivery, ``False`` if the target is unknown
            or all retry attempts are exhausted.
        """
        ch = self._channels.get(target_id)
        if ch is None:
            _log.warning("send to unknown peer %r ignored", target_id)
            return False

        try:
            raw = _envelope_to_wire(env)
        except BinaryParserError as exc:
            _log.error("envelope serialisation failed for peer %s: %s", target_id, exc)
            return False

        timeout_s = self._cfg.send_timeout_s

        async def _attempt() -> None:
            await ch.send_raw(raw, timeout_s=timeout_s)

        try:
            await self._retry.run(_attempt)
            ch.stats.messages_sent += 1
            ch.stats.bytes_sent += len(raw)
            ch.stats.consecutive_failures = 0
            ch.stats.is_healthy = True
            return True
        except Exception as exc:  # noqa: BLE001
            ch.stats.consecutive_failures += 1
            if ch.stats.consecutive_failures >= self._cfg.unhealthy_threshold:
                ch.stats.is_healthy = False
            _log.warning(
                "send to %s failed after %d attempts: %s",
                target_id,
                _RETRY_MAX_ATTEMPTS,
                exc,
            )
            return False

    async def broadcast(
        self,
        env: ConsensusEnvelope,
        exclude: set[str] | None = None,
    ) -> dict[str, bool]:
        """Send *env* to all known peers concurrently.

        Args:
            env: :class:`ConsensusEnvelope` to broadcast.
            exclude: Optional set of peer node IDs to skip.

        Returns:
            ``{peer_id: delivered}`` mapping for every known peer that was
            not excluded.
        """
        targets = [
            pid for pid in self._channels
            if exclude is None or pid not in exclude
        ]
        tasks = {
            pid: asyncio.create_task(self.send(pid, env), name=f"nc-bcast-{pid}")
            for pid in targets
        }
        results: dict[str, bool] = {}
        for pid, task in tasks.items():
            try:
                results[pid] = await task
            except Exception:  # noqa: BLE001
                results[pid] = False
        return results

    # ── Additional operational methods ────────────────────────────────────────

    async def ping(
        self, target_id: str, *, timeout_s: float | None = None
    ) -> tuple[bool, float | None]:
        """Send a liveness ping to *target_id*.

        Args:
            target_id: Node ID of the peer to probe.
            timeout_s: Override for ping RPC timeout.  Uses config default when
                ``None``.

        Returns:
            ``(reachable, rtt_s)`` — ``rtt_s`` is ``None`` on failure.
        """
        ch = self._channels.get(target_id)
        if ch is None:
            return False, None
        t = timeout_s if timeout_s is not None else self._cfg.ping_timeout_s
        ok, rtt_ns = await ch.ping_raw(self._ping_frame, timeout_s=t)
        rtt_s = rtt_ns / 1e9 if ok else None
        return ok, rtt_s

    async def ping_all(
        self, *, timeout_s: float | None = None
    ) -> dict[str, tuple[bool, float | None]]:
        """Ping every known peer concurrently.

        Args:
            timeout_s: Override for each ping's RPC timeout.

        Returns:
            ``{peer_id: (reachable, rtt_s)}`` for all known peers.
        """
        tasks = {
            pid: asyncio.create_task(
                self.ping(pid, timeout_s=timeout_s), name=f"nc-ping-{pid}"
            )
            for pid in self._channels
        }
        results: dict[str, tuple[bool, float | None]] = {}
        for pid, task in tasks.items():
            try:
                results[pid] = await task
            except Exception:  # noqa: BLE001
                results[pid] = (False, None)
        return results

    def channel_stats(self) -> list[ChannelStats]:
        """Return a snapshot of per-channel health statistics.

        Returns:
            List of :class:`ChannelStats`, one per known peer.
        """
        return [ch.stats for ch in self._channels.values()]

    def healthy_peer_ids(self) -> list[str]:
        """Return node IDs of all currently healthy peers.

        Returns:
            List of peer node ID strings where ``is_healthy`` is ``True``.
        """
        return [pid for pid, ch in self._channels.items() if ch.stats.is_healthy]

    def peer_count(self) -> int:
        """Return the total number of known peers (healthy and unhealthy).

        Returns:
            Integer count of peers registered at construction time.
        """
        return len(self._channels)
