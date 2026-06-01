"""
Asynchronous self-healing swarm core — GenesisSwarmCore.

Architecture
------------
GenesisSwarmCore is the decentralised multi-agent coordinator built on a
single ``asyncio`` event loop.  Every registered agent runs inside an
``AgentSlot`` — a lightweight struct holding its inbox queue, FSM state,
telemetry facade, and background task handle.

FSM
---
States are encoded in ``AgentState`` (Enum).  The only legal transitions are
declared in ``_VALID_TRANSITIONS``; any attempt to perform an illegal jump
raises ``InvalidTransitionError`` at the call site, making bugs loud.

    INIT
      │  (start)
      ▼
    IDLE ◄───────────────────┐
      │  (inbox message)     │
      ▼                      │ (heal success)
    RUNNING ─── (anomaly) ──► WATCHING ──► HEALING ──► QUARANTINED ──► TERMINATED
      └──────────────────────────────────────────────────────────────────────┘
                                                    (max failures)

Inter-agent communication
--------------------------
Each agent has an ``asyncio.Queue[AgentMessage]`` inbox.  ``dispatch()`` puts
a single message; ``broadcast()`` puts the same message onto every inbox.  No
shared mutable state is read outside the event loop — no data races.

Retry & circuit-breaker
-----------------------
``_with_retry()`` wraps any coroutine factory in a tenacity ``AsyncRetrying``
loop with exponential-backoff-with-jitter.  ``_CircuitBreaker`` sits in front
of external calls: if ``failure_threshold`` consecutive failures are recorded,
further calls raise ``CircuitBreakerOpenError`` until the recovery window
expires.

Background task lifecycle
--------------------------
``_fire_task()`` creates a tracked task and stores it in ``_bg_tasks``, using
``task.add_done_callback(self._bg_tasks.discard)`` to prevent the set from
growing unboundedly.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable, Coroutine
from dataclasses import dataclass, field
from enum import Enum
from types import TracebackType
from typing import Final, Literal, TypeVar

from tenacity import (
    AsyncRetrying,
    RetryError,
    before_sleep_log,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

from .config import CircuitBreakerPolicy, RetryPolicy, SwarmNodeConfig
from .telemetry import MetricsAccumulator, SwarmTelemetry, get_accumulator

_log = logging.getLogger(__name__)
_T = TypeVar("_T")

# ── FSM state enumeration ─────────────────────────────────────────────────────


class AgentState(Enum):
    """Immutable finite-state-machine states for every swarm agent."""

    INIT = "INIT"
    IDLE = "IDLE"
    RUNNING = "RUNNING"
    WATCHING = "WATCHING"
    HEALING = "HEALING"
    QUARANTINED = "QUARANTINED"
    TERMINATED = "TERMINATED"


_VALID_TRANSITIONS: Final[dict[AgentState, frozenset[AgentState]]] = {
    AgentState.INIT: frozenset({AgentState.IDLE}),
    AgentState.IDLE: frozenset({AgentState.RUNNING, AgentState.WATCHING, AgentState.TERMINATED}),
    AgentState.RUNNING: frozenset({AgentState.IDLE, AgentState.WATCHING, AgentState.HEALING}),
    AgentState.WATCHING: frozenset({AgentState.RUNNING, AgentState.HEALING, AgentState.TERMINATED}),
    AgentState.HEALING: frozenset({AgentState.IDLE, AgentState.QUARANTINED}),
    AgentState.QUARANTINED: frozenset({AgentState.TERMINATED}),
    AgentState.TERMINATED: frozenset(),
}

# ── Payload type (two-level scalar hierarchy, avoids Any) ─────────────────────

ScalarValue = str | int | float | bool | None
PayloadValue = ScalarValue | list[ScalarValue] | dict[str, ScalarValue]

# ── Message ───────────────────────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class AgentMessage:
    """
    Immutable inter-agent communication payload.

    ``payload`` keys and values are restricted to scalar / one-level-nested
    types.  This eliminates the need for runtime type-erasure via ``Any``.
    The reference is frozen; do not mutate the dict after construction.
    """

    sender_id: str
    message_type: str
    payload: dict[str, PayloadValue]
    timestamp: float = field(default_factory=time.monotonic)
    sequence_number: int = 0


# ── Agent slot ────────────────────────────────────────────────────────────────


@dataclass(slots=True)
class AgentSlot:
    """Runtime container for a single registered agent."""

    agent_id: str
    state: AgentState
    telemetry: SwarmTelemetry
    inbox: asyncio.Queue[AgentMessage]
    task: asyncio.Task[None] | None
    failure_count: int
    last_heartbeat: float


# ── Exceptions ────────────────────────────────────────────────────────────────


class InvalidTransitionError(RuntimeError):
    """Raised when an FSM transition is not in ``_VALID_TRANSITIONS``."""


class CircuitBreakerOpenError(RuntimeError):
    """Raised when a call is rejected because the circuit breaker is open."""


# ── Circuit breaker ───────────────────────────────────────────────────────────


class _CircuitBreaker:
    """
    Asyncio-native half-open circuit breaker.

    States
    ------
    closed    — normal operation; failures are counted.
    open      — calls rejected immediately; recovery timer runs.
    half-open — one probe request allowed; success → closed, failure → open.

    This class is NOT thread-safe.  All interaction must occur within the
    owning event loop (no cross-thread use).
    """

    __slots__ = (
        "_failure_count",
        "_success_count",
        "_state",
        "_last_failure_ts",
        "_cfg",
    )

    def __init__(self, cfg: CircuitBreakerPolicy) -> None:
        self._failure_count: int = 0
        self._success_count: int = 0
        self._state: Literal["closed", "open", "half-open"] = "closed"
        self._last_failure_ts: float = 0.0
        self._cfg = cfg

    @property
    def state(self) -> Literal["closed", "open", "half-open"]:
        return self._state

    def _maybe_half_open(self) -> None:
        """Transition from open → half-open once the recovery window has passed."""
        if (
            self._state == "open"
            and time.monotonic() - self._last_failure_ts > self._cfg.recovery_timeout_s
        ):
            self._state = "half-open"
            self._success_count = 0

    def check(self) -> None:
        """
        Assert that the circuit is not open.

        Raises ``CircuitBreakerOpenError`` if the breaker is open and the
        recovery window has not yet elapsed.
        """
        self._maybe_half_open()
        if self._state == "open":
            remaining = (
                self._cfg.recovery_timeout_s
                - (time.monotonic() - self._last_failure_ts)
            )
            raise CircuitBreakerOpenError(
                f"Circuit breaker is open.  Recovery in {remaining:.1f}s."
            )

    def record_success(self) -> None:
        """Record a successful call.  Closes the breaker from half-open."""
        if self._state == "half-open":
            self._success_count += 1
            if self._success_count >= self._cfg.success_threshold:
                self._state = "closed"
                self._failure_count = 0
        elif self._state == "closed":
            self._failure_count = max(0, self._failure_count - 1)

    def record_failure(self) -> None:
        """Record a failed call.  Opens the breaker once the threshold is hit."""
        self._failure_count += 1
        self._last_failure_ts = time.monotonic()
        if self._failure_count >= self._cfg.failure_threshold:
            self._state = "open"
            _log.warning(
                "circuit_breaker_opened",
                failure_count=self._failure_count,
                threshold=self._cfg.failure_threshold,
            )


# ── Message handler type alias ────────────────────────────────────────────────

MessageHandler = Callable[[AgentSlot, AgentMessage], Awaitable[None]]

# ── GenesisSwarmCore ─────────────────────────────────────────────────────────


class GenesisSwarmCore:
    """
    Decentralised multi-agent coordinator.

    Lifecycle
    ---------
    1. Instantiate with a ``SwarmNodeConfig``.
    2. Register agents with ``register_agent()``.
    3. Optionally register message handlers with ``register_handler()``.
    4. Call ``await start()`` — launches agent tasks and the watchdog.
    5. Send work with ``dispatch()`` or ``broadcast()``.
    6. Call ``await stop()`` to gracefully drain all agents.

    Internal invariants
    -------------------
    - Exactly one asyncio Task per registered agent is running at any time.
    - ``_slots`` is only mutated under ``_lock``.
    - Background tasks are tracked in ``_bg_tasks`` to prevent GC-before-done.
    """

    def __init__(
        self,
        config: SwarmNodeConfig,
        accumulator: MetricsAccumulator | None = None,
    ) -> None:
        self._cfg = config
        self._accumulator: MetricsAccumulator = (
            accumulator if accumulator is not None else get_accumulator()
        )
        self._slots: dict[str, AgentSlot] = {}
        self._handlers: dict[str, MessageHandler] = {}
        self._lock: asyncio.Lock | None = None          # created in start()
        self._shutdown: asyncio.Event | None = None     # created in start()
        self._watchdog_task: asyncio.Task[None] | None = None
        self._bg_tasks: set[asyncio.Task[None]] = set()
        self._circuit_breakers: dict[str, _CircuitBreaker] = {}

    # ── Public API ────────────────────────────────────────────────────────────

    def register_agent(self, agent_id: str) -> None:
        """
        Pre-register an agent before ``start()`` is called.

        Calling after ``start()`` is safe but the agent will not get a
        lifecycle task until the next ``start()`` invocation.
        """
        if agent_id in self._slots:
            return
        tel = SwarmTelemetry(
            agent_uuid=agent_id,
            initial_fsm_state=AgentState.INIT.value,
            accumulator=self._accumulator,
        )
        self._slots[agent_id] = AgentSlot(
            agent_id=agent_id,
            state=AgentState.INIT,
            telemetry=tel,
            inbox=asyncio.Queue(maxsize=self._cfg.agent.inbox_maxsize),
            task=None,
            failure_count=0,
            last_heartbeat=time.monotonic(),
        )
        self._circuit_breakers[agent_id] = _CircuitBreaker(self._cfg.circuit_breaker)

    def register_handler(self, message_type: str, handler: MessageHandler) -> None:
        """
        Register a coroutine handler for a given message type.

        The handler receives the ``AgentSlot`` and the ``AgentMessage`` and is
        awaited inside the agent's lifecycle task.  A single handler per
        message type is supported; re-registration overwrites the previous one.
        """
        self._handlers[message_type] = handler

    async def start(self) -> None:
        """Launch agent lifecycle tasks and the heartbeat watchdog."""
        self._lock = asyncio.Lock()
        self._shutdown = asyncio.Event()

        for slot in self._slots.values():
            await self._launch_slot(slot)

        self._watchdog_task = asyncio.create_task(
            self._watchdog(), name="genesis-watchdog"
        )
        _log.info("swarm_core_started", n_agents=len(self._slots))

    async def stop(self) -> None:
        """
        Gracefully stop all agents and the watchdog.

        Signals the shutdown event, cancels all running tasks, and waits for
        them to finish.  Cancelled tasks raise ``asyncio.CancelledError``
        inside their lifecycle coroutines, which is caught and ignored.
        """
        if self._shutdown is not None:
            self._shutdown.set()

        tasks_to_cancel: list[asyncio.Task[None]] = []

        if self._watchdog_task is not None and not self._watchdog_task.done():
            tasks_to_cancel.append(self._watchdog_task)

        for slot in self._slots.values():
            if slot.task is not None and not slot.task.done():
                tasks_to_cancel.append(slot.task)

        for task in tasks_to_cancel:
            task.cancel()

        if tasks_to_cancel:
            await asyncio.gather(*tasks_to_cancel, return_exceptions=True)

        _log.info("swarm_core_stopped", n_agents=len(self._slots))

    async def dispatch(self, agent_id: str, message: AgentMessage) -> None:
        """
        Send a message to a specific agent's inbox.

        Raises ``KeyError`` if the agent is not registered.
        Raises ``asyncio.QueueFull`` if the inbox is at capacity.
        """
        slot = self._slots[agent_id]
        slot.last_heartbeat = time.monotonic()
        await slot.inbox.put(message)

    async def broadcast(
        self,
        message: AgentMessage,
        exclude: frozenset[str] | None = None,
    ) -> None:
        """
        Put a message into every registered agent's inbox.

        Agents whose IDs appear in ``exclude`` are skipped.  Agents whose
        inboxes are full are skipped with a warning rather than blocking.
        """
        excluded = exclude if exclude is not None else frozenset()
        for agent_id, slot in self._slots.items():
            if agent_id in excluded:
                continue
            if slot.state is AgentState.TERMINATED:
                continue
            try:
                slot.inbox.put_nowait(message)
                slot.last_heartbeat = time.monotonic()
            except asyncio.QueueFull:
                slot.telemetry.warning(
                    "broadcast_inbox_full",
                    agent_id=agent_id,
                    message_type=message.message_type,
                )

    def status(self) -> dict[str, str]:
        """Return a snapshot of each agent's current FSM state."""
        return {k: v.state.value for k, v in self._slots.items()}

    def circuit_breaker_status(self) -> dict[str, str]:
        """Return each agent's circuit-breaker state."""
        return {k: cb.state for k, cb in self._circuit_breakers.items()}

    # ── FSM transition ────────────────────────────────────────────────────────

    async def _transition(self, slot: AgentSlot, target: AgentState) -> None:
        """
        Atomically move ``slot`` to ``target`` state, enforcing the FSM graph.

        Raises ``InvalidTransitionError`` if the transition is not in
        ``_VALID_TRANSITIONS``.  The lock is not held across await points;
        the caller is responsible for not calling ``_transition`` concurrently
        for the same slot.
        """
        allowed = _VALID_TRANSITIONS.get(slot.state, frozenset())
        if target not in allowed:
            raise InvalidTransitionError(
                f"[{slot.agent_id}] FSM: {slot.state.value!r} → {target.value!r} "
                "is not a valid transition."
            )
        slot.state = target
        slot.telemetry.update_state(target.value)
        slot.telemetry.debug(
            "fsm_transition",
            agent_id=slot.agent_id,
            new_state=target.value,
        )

    # ── Agent lifecycle FSM ───────────────────────────────────────────────────

    async def _launch_slot(self, slot: AgentSlot) -> None:
        """Start the lifecycle task for one agent slot."""
        task: asyncio.Task[None] = asyncio.create_task(
            self._agent_lifecycle(slot),
            name=f"agent-{slot.agent_id}",
        )
        slot.task = task

    async def _agent_lifecycle(self, slot: AgentSlot) -> None:
        """Primary FSM loop for a single agent.

        Runs indefinitely until the shutdown event is set or the agent
        transitions to TERMINATED.
        """
        await self._transition(slot, AgentState.IDLE)
        slot.telemetry.info("agent_started", agent_id=slot.agent_id)

        shutdown = self._shutdown
        if shutdown is None:
            return

        while slot.state is not AgentState.TERMINATED:
            if shutdown.is_set():
                break
            try:
                message: AgentMessage = await asyncio.wait_for(
                    slot.inbox.get(),
                    timeout=self._cfg.agent.heartbeat_timeout_s,
                )
            except asyncio.TimeoutError:
                await self._handle_inbox_timeout(slot)
                continue
            except asyncio.CancelledError:
                break

            slot.last_heartbeat = time.monotonic()
            await self._maybe_transition_to_running(slot)
            await self._process_message_with_breaker(slot, message)

        self._mark_terminated_if_allowed(slot)
        slot.telemetry.info("agent_terminated", agent_id=slot.agent_id)

    async def _handle_inbox_timeout(self, slot: AgentSlot) -> None:
        """Increment failure count and trigger WATCHING or a heal attempt on repeat timeouts."""
        slot.failure_count += 1
        slot.telemetry.warning(
            "heartbeat_timeout",
            agent_id=slot.agent_id,
            failure_count=slot.failure_count,
        )
        if (
            slot.failure_count >= self._cfg.agent.max_idle_timeouts
            and slot.state is AgentState.IDLE
        ):
            await self._transition(slot, AgentState.WATCHING)
        if (
            slot.failure_count >= self._cfg.agent.failure_threshold
            and slot.state is AgentState.WATCHING
        ):
            self._fire_task(self._heal_agent(slot))

    async def _maybe_transition_to_running(self, slot: AgentSlot) -> None:
        """Transition IDLE or WATCHING → RUNNING when a message arrives."""
        if slot.state in (AgentState.IDLE, AgentState.WATCHING):
            await self._transition(slot, AgentState.RUNNING)

    async def _process_message_with_breaker(
        self, slot: AgentSlot, message: AgentMessage
    ) -> None:
        """Process *message* with circuit-breaker protection and failure accounting."""
        cb = self._circuit_breakers.get(slot.agent_id)
        try:
            if cb is not None:
                cb.check()
            await self._process_message(slot, message)
            if cb is not None:
                cb.record_success()
            slot.inbox.task_done()
            slot.failure_count = max(0, slot.failure_count - 1)
            slot.telemetry.record_step()
            if slot.state is AgentState.RUNNING:
                await self._transition(slot, AgentState.IDLE)
        except CircuitBreakerOpenError as exc:
            slot.telemetry.warning(
                "circuit_breaker_rejected",
                agent_id=slot.agent_id,
                reason=str(exc),
            )
            slot.inbox.task_done()
            if slot.state is AgentState.RUNNING:
                await self._transition(slot, AgentState.WATCHING)
        except Exception as exc:  # noqa: BLE001 — handler exceptions are unknown at this layer
            slot.telemetry.error(
                "message_processing_failed",
                agent_id=slot.agent_id,
                exc_info=exc,
            )
            if cb is not None:
                cb.record_failure()
            slot.inbox.task_done()
            slot.failure_count += 1
            if slot.failure_count >= self._cfg.agent.failure_threshold:
                if slot.state is AgentState.RUNNING:
                    await self._transition(slot, AgentState.WATCHING)
                self._fire_task(self._heal_agent(slot))

    def _mark_terminated_if_allowed(self, slot: AgentSlot) -> None:
        """Set slot to TERMINATED if the FSM allows it from the current state."""
        if slot.state is AgentState.TERMINATED:
            return
        if AgentState.TERMINATED in _VALID_TRANSITIONS.get(slot.state, frozenset()):
            slot.state = AgentState.TERMINATED
            slot.telemetry.update_state(AgentState.TERMINATED.value)

    async def _process_message(self, slot: AgentSlot, message: AgentMessage) -> None:
        """
        Route an ``AgentMessage`` to its registered handler.

        Falls back to a no-op warning if no handler is registered for the
        given ``message_type``.  Heal messages (``__heal__``) use a dedicated
        hook registered under the ``"__heal__"`` key.
        """
        handler = self._handlers.get(message.message_type)
        if handler is None:
            slot.telemetry.warning(
                "no_handler_for_message_type",
                agent_id=slot.agent_id,
                message_type=message.message_type,
            )
            return
        with slot.telemetry.timed(f"handler:{message.message_type}"):
            await handler(slot, message)

    # ── Watchdog coroutine ────────────────────────────────────────────────────

    async def _watchdog(self) -> None:
        """
        Periodic coroutine that detects stale heartbeats and triggers healing.

        Runs every ``agent.watchdog_interval_s`` seconds.  Agents already in
        HEALING or QUARANTINED are skipped to avoid pile-on heal attempts.
        """
        shutdown = self._shutdown
        if shutdown is None:
            return

        while not shutdown.is_set():
            try:
                await asyncio.wait_for(
                    asyncio.shield(shutdown.wait()),
                    timeout=self._cfg.agent.watchdog_interval_s,
                )
                break
            except asyncio.TimeoutError:
                pass

            now = time.monotonic()
            stale: list[AgentSlot] = [
                slot
                for slot in self._slots.values()
                if slot.state
                not in (AgentState.HEALING, AgentState.QUARANTINED, AgentState.TERMINATED)
                and (now - slot.last_heartbeat) > self._cfg.agent.heartbeat_timeout_s
            ]
            for slot in stale:
                elapsed = now - slot.last_heartbeat
                slot.telemetry.warning(
                    "watchdog_stale_heartbeat",
                    agent_id=slot.agent_id,
                    elapsed_s=round(elapsed, 2),
                )
                self._fire_task(self._heal_agent(slot))

    # ── Healing ───────────────────────────────────────────────────────────────

    async def _heal_agent(self, slot: AgentSlot) -> None:
        """
        Attempt to recover a failing agent via tenacity retry loop.

        Transitions
        -----------
        WATCHING / RUNNING  → HEALING  (start of heal cycle)
        HEALING             → IDLE     (successful recovery)
        HEALING             → QUARANTINED  (retries exhausted)

        If the agent is already in HEALING or QUARANTINED this call is a no-op
        to prevent concurrent heal attempts.
        """
        if slot.state in (AgentState.HEALING, AgentState.QUARANTINED, AgentState.TERMINATED):
            return

        if slot.state in _VALID_TRANSITIONS and AgentState.HEALING in (
            _VALID_TRANSITIONS.get(slot.state, frozenset())
        ):
            await self._transition(slot, AgentState.HEALING)
        else:
            slot.telemetry.warning(
                "heal_skipped_invalid_state",
                agent_id=slot.agent_id,
                current_state=slot.state.value,
            )
            return

        slot.telemetry.info("heal_started", agent_id=slot.agent_id)

        try:
            async for attempt in AsyncRetrying(
                wait=wait_exponential_jitter(
                    initial=self._cfg.retry.initial_wait_s,
                    max=self._cfg.retry.max_wait_s,
                    jitter=self._cfg.retry.jitter_s,
                ),
                stop=stop_after_attempt(self._cfg.retry.max_attempts),
                retry=retry_if_exception_type((OSError, TimeoutError, asyncio.TimeoutError)),
                reraise=False,
                before_sleep=before_sleep_log(_log, logging.WARNING),
            ):
                with attempt:
                    await self._perform_heal(slot)
        except RetryError:
            slot.telemetry.error(
                "heal_retries_exhausted",
                agent_id=slot.agent_id,
                attempts=self._cfg.retry.max_attempts,
            )
            await self._transition(slot, AgentState.QUARANTINED)
            return

        slot.failure_count = 0
        cb = self._circuit_breakers.get(slot.agent_id)
        if cb is not None:
            cb.record_success()

        await self._transition(slot, AgentState.IDLE)
        slot.last_heartbeat = time.monotonic()
        slot.telemetry.info("heal_complete", agent_id=slot.agent_id)

    async def _perform_heal(self, slot: AgentSlot) -> None:
        """
        Execute one heal attempt for a quarantined agent.

        Strategy
        --------
        1. Drain the inbox, discarding messages that arrived during the fault
           window.  Stale messages could cause immediate re-failure on resume.
        2. Invoke the ``"__heal__"`` handler if one is registered, allowing
           application-level hooks (model reload, cache clear, etc.).
        3. Reset the circuit breaker to give the agent a clean slate.
        """
        drained = 0
        while not slot.inbox.empty():
            try:
                slot.inbox.get_nowait()
                slot.inbox.task_done()
                drained += 1
            except asyncio.QueueEmpty:
                break

        if drained > 0:
            slot.telemetry.info(
                "heal_inbox_drained",
                agent_id=slot.agent_id,
                messages_dropped=drained,
            )

        heal_handler = self._handlers.get("__heal__")
        if heal_handler is not None:
            heal_message = AgentMessage(
                sender_id="__core__",
                message_type="__heal__",
                payload={"agent_id": slot.agent_id, "failure_count": slot.failure_count},
            )
            await heal_handler(slot, heal_message)

        cb = self._circuit_breakers.get(slot.agent_id)
        if cb is not None:
            cb.record_success()

    # ── Retry wrapper ─────────────────────────────────────────────────────────

    async def _with_retry(
        self,
        factory: Callable[[], Awaitable[_T]],
        label: str,
        retry_policy: RetryPolicy | None = None,
    ) -> _T:
        """
        Execute ``factory()`` inside a tenacity retry loop.

        Parameters
        ----------
        factory:
            Callable that returns a fresh coroutine each time it is called.
            A coroutine cannot be re-awaited; the factory is called on every
            retry attempt to produce a new one.
        label:
            Human-readable label for log messages and tracing.
        retry_policy:
            Override the node-level retry policy for this specific call.
        """
        policy = retry_policy if retry_policy is not None else self._cfg.retry
        last_exc: BaseException | None = None

        async for attempt in AsyncRetrying(
            wait=wait_exponential_jitter(
                initial=policy.initial_wait_s,
                max=policy.max_wait_s,
                jitter=policy.jitter_s,
            ),
            stop=stop_after_attempt(policy.max_attempts),
            retry=retry_if_exception_type((OSError, TimeoutError, asyncio.TimeoutError)),
            reraise=True,
            before_sleep=before_sleep_log(_log, logging.WARNING),
        ):
            with attempt:
                try:
                    result: _T = await factory()
                    _log.debug("retry_succeeded", label=label,
                               attempt=attempt.retry_state.attempt_number)
                    return result
                except (OSError, TimeoutError, asyncio.TimeoutError) as exc:
                    last_exc = exc
                    _log.warning(
                        "retry_attempt_failed",
                        label=label,
                        attempt=attempt.retry_state.attempt_number,
                        error=str(exc),
                    )
                    raise

        raise RetryError(last_exc) from last_exc

    # ── Task fire-and-forget ──────────────────────────────────────────────────

    def _fire_task(self, coro: Coroutine[None, None, None]) -> None:
        """
        Schedule a coroutine as a background task without blocking.

        The task is stored in ``_bg_tasks`` until completion to prevent
        premature garbage collection.  The done-callback removes it on finish.
        """
        task: asyncio.Task[None] = asyncio.create_task(coro)
        self._bg_tasks.add(task)
        task.add_done_callback(self._bg_tasks.discard)
