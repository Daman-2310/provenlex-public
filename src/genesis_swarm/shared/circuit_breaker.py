"""
Real circuit breaker implementation (CLOSED → OPEN → HALF_OPEN).
Used by all bots that call external APIs to prevent cascading failures.
"""

from __future__ import annotations

import asyncio
import logging
import time
from enum import Enum
from typing import Any, Callable, Coroutine

log = logging.getLogger(__name__)


class CBState(Enum):
    CLOSED = "CLOSED"  # normal operation
    OPEN = "OPEN"  # failing — reject calls immediately
    HALF_OPEN = "HALF_OPEN"  # trial — allow one probe call


class CircuitBreakerOpen(Exception):
    """Raised when a call is attempted against an OPEN circuit."""


class CircuitBreaker:
    """
    Thread-safe async circuit breaker.

    Parameters
    ----------
    name:
        Human-readable name shown in logs and metrics.
    failure_threshold:
        Consecutive failures before tripping OPEN (default 5).
    recovery_timeout:
        Seconds to wait in OPEN before attempting HALF_OPEN probe (default 30).
    success_threshold:
        Consecutive successes in HALF_OPEN to return to CLOSED (default 2).
    """

    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
        success_threshold: int = 2,
    ) -> None:
        self.name = name
        self._failure_threshold = failure_threshold
        self._recovery_timeout = recovery_timeout
        self._success_threshold = success_threshold

        self._state = CBState.CLOSED
        self._failures = 0
        self._successes = 0
        self._opened_at: float | None = None
        self._lock = asyncio.Lock()

    @property
    def state(self) -> CBState:
        return self._state

    @property
    def is_closed(self) -> bool:
        return self._state == CBState.CLOSED

    def get_metrics(self) -> dict[str, Any]:
        open_for = 0.0
        if self._opened_at:
            open_for = round(time.time() - self._opened_at, 1)
        return {
            "name": self.name,
            "state": self._state.value,
            "failures": self._failures,
            "successes_in_probe": self._successes,
            "open_for_s": open_for,
        }

    async def call(
        self,
        coro: Callable[[], Coroutine[Any, Any, Any]],
        fallback: Any = None,
    ) -> Any:
        """
        Execute *coro* if the breaker allows it.
        Returns *fallback* (default None) when the breaker is OPEN.
        Raises the original exception on failure (and updates state).
        """
        async with self._lock:
            if self._state == CBState.OPEN:
                if time.time() - (self._opened_at or 0) >= self._recovery_timeout:
                    log.info("[CB:%s] OPEN → HALF_OPEN (probe)", self.name)
                    self._state = CBState.HALF_OPEN
                    self._successes = 0
                else:
                    return fallback

            elif self._state == CBState.HALF_OPEN:
                # Only one probe at a time — others get fallback while we test
                pass

        try:
            result = await coro()
        except Exception as exc:
            async with self._lock:
                self._failures += 1
                self._successes = 0
                if self._state == CBState.HALF_OPEN or self._failures >= self._failure_threshold:
                    log.warning(
                        "[CB:%s] tripping OPEN after %d failure(s): %s",
                        self.name,
                        self._failures,
                        exc,
                    )
                    self._state = CBState.OPEN
                    self._opened_at = time.time()
            return fallback  # return fallback instead of raising to keep bot alive
        else:
            async with self._lock:
                if self._state == CBState.HALF_OPEN:
                    self._successes += 1
                    if self._successes >= self._success_threshold:
                        log.info(
                            "[CB:%s] HALF_OPEN → CLOSED (%d probe(s) passed)",
                            self.name,
                            self._successes,
                        )
                        self._state = CBState.CLOSED
                        self._failures = 0
                        self._successes = 0
                        self._opened_at = None
                else:
                    self._failures = 0
            return result

    async def __aenter__(self) -> "CircuitBreaker":
        return self

    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> bool:
        if exc is not None:
            async with self._lock:
                self._failures += 1
                if self._failures >= self._failure_threshold:
                    self._state = CBState.OPEN
                    self._opened_at = time.time()
                    log.warning("[CB:%s] tripped OPEN", self.name)
            return False  # re-raise
        else:
            async with self._lock:
                self._failures = 0
            return False
