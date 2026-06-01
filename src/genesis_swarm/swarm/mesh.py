"""
Globally distributed event mesh — Pillar 1.

Replaces asyncio.Queue pipelines with a Redis Streams (or NATS JetStream)
message broker, enabling agent nodes to communicate across physical machines
with at-least-once delivery and consumer-group fan-out.

Topologies
----------
PUBLISH / SUBSCRIBE
    ``await mesh.publish(topic, envelope)``
    ``async for entry_id, envelope in mesh.subscribe(topic, group=...):``

REQUEST / REPLY
    ``reply_env = await mesh.request(topic, envelope, timeout_s=10.0)``
    ``await mesh.reply(inbound_envelope, response_payload={...})``

Message envelope
----------------
``MeshEnvelope`` is a frozen Pydantic model serialised to UTF-8 JSON bytes.
The ``traceparent`` field carries the W3C Trace Context header injected by
``SwarmTracer`` so cross-process spans stitch into a single distributed trace.

Backends
--------
GENESIS_MESH_BACKEND=redis (default)  →  RedisStreamBackend
GENESIS_MESH_BACKEND=nats             →  _NatsMeshBackend (requires nats-py)

Stream key namespace: ``swarm:{tenant_id}:{topic}``

Usage
-----
    async with SwarmMesh.from_env(tenant_id="acme-fund") as mesh:
        envelope = mesh.make_envelope("alerts", {"score": 0.97})
        await mesh.publish("alerts", envelope)

        async for entry_id, msg in mesh.subscribe("alerts", group="compliance-bots"):
            process(msg)
            await mesh.ack("alerts", "compliance-bots", entry_id)
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from collections.abc import AsyncGenerator
from typing import Any, ClassVar

import redis.asyncio as aioredis
from pydantic import BaseModel, ConfigDict, Field

_log = logging.getLogger(__name__)

_MAXLEN_APPROX: int = 10_000


# ── Message envelope ──────────────────────────────────────────────────────────


class MeshEnvelope(BaseModel):
    """Typed, versioned envelope for all inter-node mesh messages."""

    model_config = ConfigDict(frozen=True)

    message_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    correlation_id: str | None = None
    topic: str
    sender_id: str
    tenant_id: str
    payload: dict[str, Any]
    traceparent: str | None = None
    timestamp: float = Field(default_factory=time.time)
    schema_version: ClassVar[str] = "1"

    def to_bytes(self) -> bytes:
        return self.model_dump_json().encode()

    @classmethod
    def from_bytes(cls, raw: bytes) -> "MeshEnvelope":
        return cls.model_validate_json(raw)

    @classmethod
    def from_redis_entry(cls, entry: dict[bytes, bytes]) -> "MeshEnvelope":
        return cls.from_bytes(entry[b"data"])


# ── Redis Streams backend ─────────────────────────────────────────────────────


class RedisStreamBackend:
    """
    Redis Streams-backed mesh backend.

    Streams are keyed ``swarm:{tenant_id}:{topic}``.
    Consumer groups are created lazily (XGROUP CREATE ... MKSTREAM).
    Delivery guarantee: at-least-once via XREADGROUP + XACK.
    """

    def __init__(self, url: str, tenant_id: str = "default") -> None:
        self._url = url
        self._tenant_id = tenant_id
        self._redis: aioredis.Redis | None = None  # type: ignore[type-arg]
        self._pending_replies: dict[str, asyncio.Future[MeshEnvelope]] = {}

    def _key(self, topic: str) -> str:
        return f"swarm:{self._tenant_id}:{topic}"

    def _reply_key(self, correlation_id: str) -> str:
        return f"swarm:reply:{correlation_id}"

    @property
    def _r(self) -> aioredis.Redis:  # type: ignore[type-arg]
        if self._redis is None:
            raise RuntimeError("RedisStreamBackend not connected — call connect() first")
        return self._redis

    async def connect(self) -> None:
        self._redis = aioredis.from_url(
            self._url,
            encoding="utf-8",
            decode_responses=False,
            socket_connect_timeout=5,
            socket_keepalive=True,
        )
        await self._redis.ping()
        _log.info("redis_mesh_connected", extra={"url": self._url})

    async def disconnect(self) -> None:
        if self._redis:
            await self._redis.aclose()
            self._redis = None
        _log.info("redis_mesh_disconnected")

    async def publish(self, stream: str, envelope: MeshEnvelope) -> str:
        key = self._key(stream)
        entry_id: bytes = await self._r.xadd(  # type: ignore[assignment]
            key,
            {"data": envelope.to_bytes()},
            maxlen=_MAXLEN_APPROX,
            approximate=True,
        )
        _log.debug(
            "mesh_published",
            extra={"stream": stream, "message_id": envelope.message_id},
        )
        return entry_id.decode() if isinstance(entry_id, bytes) else str(entry_id)

    async def _ensure_group(self, stream_key: str, group: str) -> None:
        try:
            await self._r.xgroup_create(stream_key, group, id="0", mkstream=True)
        except aioredis.ResponseError as exc:
            if "BUSYGROUP" not in str(exc):
                raise

    async def subscribe(
        self,
        stream: str,
        group: str,
        consumer: str,
        *,
        block_ms: int = 5_000,
        batch: int = 10,
    ) -> AsyncGenerator[tuple[bytes, MeshEnvelope], None]:
        """
        Yield ``(entry_id, envelope)`` tuples from the Redis stream.

        Call ``await backend.ack(stream, group, entry_id)`` after processing
        each message to advance the consumer group offset.
        """
        key = self._key(stream)
        await self._ensure_group(key, group)
        while True:
            results: list[Any] = await self._r.xreadgroup(
                groupname=group,
                consumername=consumer,
                streams={key: ">"},
                count=batch,
                block=block_ms,
                noack=False,
            )
            if not results:
                continue
            for _stream_name, entries in results:
                for entry_id, entry_data in entries:
                    try:
                        envelope = MeshEnvelope.from_redis_entry(entry_data)
                    except Exception as exc:
                        _log.error(
                            "mesh_deserialise_failed",
                            extra={"entry_id": entry_id, "error": str(exc)},
                        )
                        await self.ack(stream, group, entry_id)
                        continue
                    yield entry_id, envelope

    async def ack(self, stream: str, group: str, entry_id: bytes) -> None:
        await self._r.xack(self._key(stream), group, entry_id)

    async def request(
        self,
        stream: str,
        envelope: MeshEnvelope,
        *,
        timeout_s: float = 10.0,
    ) -> MeshEnvelope:
        """
        Publish a request envelope and block until the correlated reply arrives.

        A fresh correlation_id is generated per call and injected into the
        envelope so the reply can be routed back to this exact waiter.
        """
        correlation_id = str(uuid.uuid4())
        env = envelope.model_copy(update={"correlation_id": correlation_id})

        loop = asyncio.get_event_loop()
        fut: asyncio.Future[MeshEnvelope] = loop.create_future()
        self._pending_replies[correlation_id] = fut

        reply_key = self._reply_key(correlation_id)
        await self._ensure_group(reply_key, "rr-listener")
        await self.publish(stream, env)

        try:
            return await asyncio.wait_for(fut, timeout=timeout_s)
        except asyncio.TimeoutError:
            self._pending_replies.pop(correlation_id, None)
            raise TimeoutError(
                f"No reply received for correlation_id={correlation_id!r} within {timeout_s}s"
            )

    async def reply(
        self, envelope: MeshEnvelope, response_payload: dict[str, Any]
    ) -> None:
        """Publish a reply correlated to ``envelope.correlation_id``."""
        if not envelope.correlation_id:
            raise ValueError("Cannot reply — envelope has no correlation_id")
        reply_env = MeshEnvelope(
            correlation_id=envelope.correlation_id,
            topic=f"reply:{envelope.topic}",
            sender_id="mesh-reply",
            tenant_id=envelope.tenant_id,
            payload=response_payload,
        )
        reply_key = self._reply_key(envelope.correlation_id)
        await self._r.xadd(reply_key, {"data": reply_env.to_bytes()}, maxlen=100)
        await self._r.expire(reply_key, 60)
        fut = self._pending_replies.pop(envelope.correlation_id, None)
        if fut is not None and not fut.done():
            fut.set_result(reply_env)


# ── NATS JetStream backend (optional) ─────────────────────────────────────────


class _NatsMeshBackend:
    """
    NATS JetStream-backed mesh backend (requires nats-py>=2.6).

    Subjects are keyed ``swarm.{tenant_id}.{topic}``.
    JetStream durable pull consumers provide at-least-once delivery.
    Install: pip install 'genesis-swarm[nats]'
    """

    def __init__(self, url: str, tenant_id: str = "default") -> None:
        self._url = url
        self._tenant_id = tenant_id
        self._nc: Any = None
        self._js: Any = None

    def _subject(self, topic: str) -> str:
        return f"swarm.{self._tenant_id}.{topic}"

    async def connect(self) -> None:
        try:
            import nats as nats_lib  # type: ignore[import-untyped]
        except ImportError as exc:
            raise ImportError(
                "nats-py is required for the NATS backend. "
                "Install with: pip install 'genesis-swarm[nats]'"
            ) from exc
        self._nc = await nats_lib.connect(self._url)
        self._js = self._nc.jetstream()
        _log.info("nats_mesh_connected", extra={"url": self._url})

    async def disconnect(self) -> None:
        if self._nc:
            await self._nc.drain()
        _log.info("nats_mesh_disconnected")

    async def publish(self, stream: str, envelope: MeshEnvelope) -> str:
        ack = await self._js.publish(self._subject(stream), envelope.to_bytes())
        return str(ack.seq)

    async def subscribe(
        self,
        stream: str,
        group: str,
        consumer: str,
        *,
        block_ms: int = 5_000,
        batch: int = 10,
    ) -> AsyncGenerator[tuple[bytes, MeshEnvelope], None]:
        sub = await self._js.pull_subscribe(self._subject(stream), durable=group)
        while True:
            try:
                msgs = await sub.fetch(batch, timeout=block_ms / 1_000)
            except Exception:
                await asyncio.sleep(0.1)
                continue
            for msg in msgs:
                try:
                    envelope = MeshEnvelope.from_bytes(msg.data)
                except Exception as exc:
                    _log.error(
                        "nats_deserialise_failed",
                        extra={"subject": self._subject(stream), "error": str(exc)},
                    )
                    await msg.ack()
                    continue
                entry_id = (msg.reply or "nats").encode()
                yield entry_id, envelope
                await msg.ack()

    async def ack(self, stream: str, group: str, entry_id: bytes) -> None:
        # NATS messages are acked inline after yield in subscribe(); this is a no-op
        pass

    async def request(
        self,
        stream: str,
        envelope: MeshEnvelope,
        *,
        timeout_s: float = 10.0,
    ) -> MeshEnvelope:
        msg = await self._nc.request(
            self._subject(stream), envelope.to_bytes(), timeout=timeout_s
        )
        return MeshEnvelope.from_bytes(msg.data)

    async def reply(
        self, envelope: MeshEnvelope, response_payload: dict[str, Any]
    ) -> None:
        raise NotImplementedError(
            "NATS reply() must be called from inside subscribe() using the "
            "msg.reply_subject of the inbound message."
        )


# ── Backend union type ────────────────────────────────────────────────────────

_AnyBackend = RedisStreamBackend | _NatsMeshBackend


def _build_backend(backend_type: str, url: str, tenant_id: str) -> _AnyBackend:
    if backend_type == "nats":
        return _NatsMeshBackend(url=url, tenant_id=tenant_id)
    return RedisStreamBackend(url=url, tenant_id=tenant_id)


# ── SwarmMesh public façade ───────────────────────────────────────────────────


class SwarmMesh:
    """
    High-level distributed event mesh facade.

    Manages the backend lifecycle and exposes clean publish/subscribe and
    request/reply surfaces.  Use as an async context manager or call
    ``start()`` / ``stop()`` explicitly.

    Env vars
    --------
    GENESIS_MESH_BACKEND   redis (default) | nats
    REDIS_URL              redis://localhost:6379
    NATS_URL               nats://localhost:4222
    GENESIS_NODE_ID        stable identifier for this process node
    """

    def __init__(self, backend: _AnyBackend) -> None:
        self._backend = backend
        self._node_id: str = os.getenv("GENESIS_NODE_ID", str(uuid.uuid4())[:8])

    @classmethod
    def from_env(cls, tenant_id: str = "default") -> "SwarmMesh":
        """Construct from environment variables."""
        backend_type = os.getenv("GENESIS_MESH_BACKEND", "redis").lower()
        if backend_type == "nats":
            url = os.getenv("NATS_URL", "nats://localhost:4222")
        else:
            url = os.getenv("REDIS_URL", "redis://localhost:6379")
        return cls(backend=_build_backend(backend_type, url, tenant_id))

    async def start(self) -> None:
        await self._backend.connect()

    async def stop(self) -> None:
        await self._backend.disconnect()

    async def __aenter__(self) -> "SwarmMesh":
        await self.start()
        return self

    async def __aexit__(self, _et: Any, _ev: Any, _tb: Any) -> None:
        await self.stop()

    async def publish(self, topic: str, envelope: MeshEnvelope) -> str:
        """Publish *envelope* to *topic*. Returns the broker entry ID."""
        return await self._backend.publish(topic, envelope)

    def subscribe(
        self,
        topic: str,
        *,
        group: str,
        consumer: str | None = None,
        block_ms: int = 5_000,
        batch: int = 10,
    ) -> AsyncGenerator[tuple[bytes, MeshEnvelope], None]:
        """
        Return an async generator that yields ``(entry_id, envelope)`` tuples.

        Call ``await mesh.ack(topic, group, entry_id)`` after processing each
        message to advance the consumer group offset and prevent re-delivery.

        Example::

            async for entry_id, msg in mesh.subscribe("alerts", group="bots"):
                handle(msg)
                await mesh.ack("alerts", "bots", entry_id)
        """
        _consumer = consumer or f"{self._node_id}-{group}"
        return self._backend.subscribe(
            topic, group, _consumer, block_ms=block_ms, batch=batch
        )

    async def ack(self, topic: str, group: str, entry_id: bytes) -> None:
        """Acknowledge *entry_id* to commit the consumer group offset."""
        await self._backend.ack(topic, group, entry_id)

    async def request(
        self,
        topic: str,
        envelope: MeshEnvelope,
        *,
        timeout_s: float = 10.0,
    ) -> MeshEnvelope:
        """Send a request and block until the correlated reply arrives."""
        return await self._backend.request(topic, envelope, timeout_s=timeout_s)

    async def reply(
        self, envelope: MeshEnvelope, response_payload: dict[str, Any]
    ) -> None:
        """Publish a reply correlated to *envelope.correlation_id*."""
        await self._backend.reply(envelope, response_payload)

    def make_envelope(
        self,
        topic: str,
        payload: dict[str, Any],
        *,
        tenant_id: str = "default",
        correlation_id: str | None = None,
        traceparent: str | None = None,
    ) -> MeshEnvelope:
        """Build a ``MeshEnvelope`` with this node's ``sender_id`` pre-filled."""
        return MeshEnvelope(
            topic=topic,
            sender_id=self._node_id,
            tenant_id=tenant_id,
            payload=payload,
            correlation_id=correlation_id,
            traceparent=traceparent,
        )
