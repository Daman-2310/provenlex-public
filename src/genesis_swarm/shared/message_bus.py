from __future__ import annotations

import asyncio
import fnmatch
import logging
from abc import ABC, abstractmethod
from typing import Awaitable, Callable

from genesis_swarm.shared.task import fire

log = logging.getLogger(__name__)

MessageHandler = Callable[[str, dict], Awaitable[None]]


class MessageBus(ABC):
    @abstractmethod
    async def connect(self) -> None: ...
    @abstractmethod
    async def disconnect(self) -> None: ...
    @abstractmethod
    async def publish(self, topic: str, payload: dict) -> None: ...
    @abstractmethod
    async def subscribe(self, topic: str, handler: MessageHandler) -> None: ...
    @abstractmethod
    async def unsubscribe(self, topic: str) -> None: ...


class MockMessageBus(MessageBus):
    """In-process pub/sub — no external server needed for testing."""

    def __init__(self):
        self._subs: dict[str, list[MessageHandler]] = {}
        self._connected = False

    async def connect(self) -> None:
        self._connected = True
        log.info("[Bus] MockMessageBus connected")

    async def disconnect(self) -> None:
        self._connected = False

    async def publish(self, topic: str, payload: dict) -> None:
        for pattern, handlers in self._subs.items():
            if fnmatch.fnmatch(topic, pattern):
                for handler in handlers:
                    fire(handler(topic, payload), name=f"bus-{topic}")

    async def subscribe(self, topic: str, handler: MessageHandler) -> None:
        self._subs.setdefault(topic, []).append(handler)

    async def unsubscribe(self, topic: str) -> None:
        self._subs.pop(topic, None)


class NATSMessageBus(MessageBus):
    """Real NATS JetStream bus — requires nats-py and a running NATS server."""

    def __init__(self, url: str):
        self._url = url
        self._nc = None
        self._subs: dict[str, object] = {}

    async def connect(self) -> None:
        try:
            import nats

            self._nc = await nats.connect(self._url)
            log.info("[Bus] Connected to NATS at %s", self._url)
        except ImportError:
            raise RuntimeError("nats-py not installed — pip install genesis-swarm[nats]")

    async def disconnect(self) -> None:
        if self._nc:
            await self._nc.close()

    async def publish(self, topic: str, payload: dict) -> None:
        import json

        await self._nc.publish(topic, json.dumps(payload).encode())

    async def subscribe(self, topic: str, handler: MessageHandler) -> None:
        import json

        async def _wrap(msg):
            data = json.loads(msg.data.decode())
            await handler(msg.subject, data)

        sub = await self._nc.subscribe(topic, cb=_wrap)
        self._subs[topic] = sub

    async def unsubscribe(self, topic: str) -> None:
        sub = self._subs.pop(topic, None)
        if sub:
            await sub.unsubscribe()


def create_message_bus(
    use_mock: bool = True, nats_url: str = "nats://localhost:4222"
) -> MessageBus:
    if use_mock:
        return MockMessageBus()
    return NATSMessageBus(nats_url)
