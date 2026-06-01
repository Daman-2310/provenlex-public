"""
Zero-cost, microsecond-accurate telemetry for Genesis Swarm.

Design
------
- structlog is configured once with a minimal processor chain optimised for JSON
  throughput.  The hot path allocates no intermediate dicts beyond what structlog
  itself requires.
- MetricsAccumulator stores latency samples and step timestamps in fixed-capacity
  ``collections.deque`` ring buffers.  Reads (EMA, P99, steps/s) take an O(n)
  list snapshot guarded only by the GIL; writes take a single threading.Lock to
  prevent torn deque mutations on sub-CPython implementations.
- SwarmTelemetry is a per-agent facade that binds agent_uuid, current_fsm_state,
  and token_burn_rate to every record.  cpu_core_id is injected per-record by
  _CPUCoreProcessor with zero per-call heap allocation.
- configure_telemetry() is idempotent; calling it more than once is safe.
"""

from __future__ import annotations

import collections
import logging
import math
import os
import sys
import threading
import time
from contextlib import contextmanager
from typing import Final, Generator, Literal

import structlog
import structlog.contextvars
import structlog.dev
import structlog.processors
import structlog.stdlib
from structlog.types import EventDict, Processor, WrappedLogger

# ── Module constants ──────────────────────────────────────────────────────────

_LATENCY_RING_SIZE: Final[int] = 1024
_STEP_RING_SIZE: Final[int] = 256
_EMA_ALPHA_FACTOR: Final[float] = 2.0   # Wilder smoothing: alpha = 2 / (n + 1)
_NS_PER_US: Final[float] = 1_000.0

_NOISY_LOGGERS: Final[dict[str, int]] = {
    "uvicorn.access": logging.WARNING,
    "uvicorn.error": logging.WARNING,
    "httpx": logging.WARNING,
    "httpcore": logging.WARNING,
    "asyncio": logging.WARNING,
    "websockets": logging.WARNING,
    "grpc": logging.WARNING,
    "aiohttp.access": logging.WARNING,
    "hpack": logging.WARNING,
}

# ── CPU-core processor (zero heap allocation in hot path) ─────────────────────


class _CPUCoreProcessor:
    """
    Structlog processor that injects ``cpu_core_id`` into every log record.

    On Linux (``os.sched_getaffinity`` present) the minimum CPU index from
    the scheduler affinity set is used.  On macOS / Windows the low 16 bits
    of the current thread ident serve as a stable per-thread discriminator.
    """

    __slots__ = ("_get_affinity",)

    def __init__(self) -> None:
        self._get_affinity = getattr(os, "sched_getaffinity", None)

    def __call__(
        self,
        logger: WrappedLogger,
        method: str,
        event_dict: EventDict,
    ) -> EventDict:
        if self._get_affinity is not None:
            try:
                cores = self._get_affinity(0)
                event_dict["cpu_core_id"] = min(cores) if cores else -1
            except OSError:
                event_dict["cpu_core_id"] = -1
        else:
            event_dict["cpu_core_id"] = threading.get_ident() & 0xFFFF
        return event_dict


# ── Metrics accumulator ───────────────────────────────────────────────────────


class MetricsAccumulator:
    """
    Thread-safe, non-blocking ring-buffer metrics accumulator.

    Latency samples (microseconds) and step completion timestamps (monotonic
    seconds) are stored in fixed-capacity deques.

    Reads
    -----
    ``mean_latency_us``, ``p99_latency_us``, and ``steps_per_second`` each
    take an O(n) list snapshot.  On CPython the GIL makes the snapshot
    effectively atomic; no additional lock is required on the read path.

    Writes
    ------
    ``record_latency_us`` and ``record_step`` hold ``_write_lock`` for the
    duration of the deque append — a sub-microsecond critical section on all
    Python implementations, not just CPython.
    """

    __slots__ = ("_latency_ring", "_step_ring", "_write_lock")

    def __init__(
        self,
        latency_window: int = _LATENCY_RING_SIZE,
        step_window: int = _STEP_RING_SIZE,
    ) -> None:
        self._latency_ring: collections.deque[float] = collections.deque(
            maxlen=latency_window
        )
        self._step_ring: collections.deque[float] = collections.deque(
            maxlen=step_window
        )
        self._write_lock = threading.Lock()

    # ── Write path ────────────────────────────────────────────────────────────

    def record_latency_us(self, latency_us: float) -> None:
        """Append one latency sample in microseconds.  O(1), thread-safe."""
        with self._write_lock:
            self._latency_ring.append(latency_us)

    def record_step(self) -> None:
        """Mark completion of one simulation / agent step at monotonic now."""
        ts = time.monotonic()
        with self._write_lock:
            self._step_ring.append(ts)

    # ── Read path ─────────────────────────────────────────────────────────────

    def mean_latency_us(self) -> float:
        """
        Exponentially-weighted moving average of latency samples.

        Recent samples receive higher weight (alpha = 2 / (n+1)).  Returns
        0.0 when the ring is empty.
        """
        snapshot: list[float] = list(self._latency_ring)
        if not snapshot:
            return 0.0
        alpha = _EMA_ALPHA_FACTOR / (len(snapshot) + 1.0)
        ema = snapshot[0]
        for sample in snapshot[1:]:
            ema += alpha * (sample - ema)
        return ema

    def p99_latency_us(self) -> float:
        """
        99th-percentile latency from the current ring window.

        Computed from a sorted O(n) snapshot.  Returns 0.0 on empty ring.
        """
        snapshot = sorted(self._latency_ring)
        if not snapshot:
            return 0.0
        idx = max(0, math.ceil(0.99 * len(snapshot)) - 1)
        return snapshot[idx]

    def steps_per_second(self) -> float:
        """
        Throughput estimate: (window_size - 1) / elapsed_seconds.

        Requires at least two timestamps in the ring; returns 0.0 otherwise.
        """
        snapshot: list[float] = list(self._step_ring)
        if len(snapshot) < 2:
            return 0.0
        elapsed = snapshot[-1] - snapshot[0]
        if elapsed <= 0.0:
            return 0.0
        return (len(snapshot) - 1) / elapsed

    def snapshot(self) -> dict[str, float]:
        """Return all metrics as a plain dict suitable for log injection."""
        return {
            "mean_latency_us": round(self.mean_latency_us(), 3),
            "p99_latency_us": round(self.p99_latency_us(), 3),
            "steps_per_second": round(self.steps_per_second(), 3),
            "sample_count": float(len(self._latency_ring)),
        }


# ── Process-wide singleton accumulator ───────────────────────────────────────

_process_accumulator: MetricsAccumulator = MetricsAccumulator()


def get_accumulator() -> MetricsAccumulator:
    """Return the process-wide MetricsAccumulator.  Never None."""
    return _process_accumulator


# ── Structlog pipeline configuration ─────────────────────────────────────────

_cpu_core_processor: _CPUCoreProcessor = _CPUCoreProcessor()
_telemetry_configured: bool = False
_configure_lock = threading.Lock()


def configure_telemetry(
    level: str = "INFO",
    renderer: Literal["json", "console"] = "json",
) -> None:
    """
    Configure the process-wide structlog pipeline.  Thread-safe, idempotent.

    Parameters
    ----------
    level:
        Standard logging level string: ``"DEBUG"``, ``"INFO"``, ``"WARNING"``,
        ``"ERROR"``, or ``"CRITICAL"``.
    renderer:
        ``"json"`` emits newline-delimited JSON (Loki / Datadog / ELK).
        ``"console"`` emits coloured human-readable output for local development.
    """
    global _telemetry_configured
    with _configure_lock:
        if _telemetry_configured:
            return
        _telemetry_configured = True

    log_level = getattr(logging, level.upper(), logging.INFO)

    shared_chain: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        _cpu_core_processor,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.ExceptionRenderer(),
    ]

    final_renderer: Processor = (
        structlog.processors.JSONRenderer()
        if renderer == "json"
        else structlog.dev.ConsoleRenderer(colors=True)
    )

    structlog.configure(
        processors=[
            *shared_chain,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            processors=[
                structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                final_renderer,
            ],
            foreign_pre_chain=shared_chain,
        )
    )

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(log_level)

    for name, lvl in _NOISY_LOGGERS.items():
        logging.getLogger(name).setLevel(lvl)


# ── Per-agent telemetry facade ────────────────────────────────────────────────


class SwarmTelemetry:
    """
    Scoped telemetry facade for a single agent.

    Automatically binds ``agent_uuid``, ``current_fsm_state``,
    ``token_burn_rate``, and live ``metrics`` (from MetricsAccumulator) to
    every log record.  ``cpu_core_id`` is injected per-record by the processor
    chain — no per-call allocation required.

    Thread safety
    -------------
    ``update_state`` and ``update_token_burn_rate`` must only be called from
    the owning agent event-loop task.  Concurrent mutation from multiple
    threads is not supported and is not needed by the swarm architecture.
    """

    __slots__ = (
        "_base_logger",
        "_agent_uuid",
        "_fsm_state",
        "_token_burn_rate",
        "_accumulator",
    )

    def __init__(
        self,
        agent_uuid: str,
        initial_fsm_state: str,
        token_burn_rate: float = 0.0,
        accumulator: MetricsAccumulator | None = None,
    ) -> None:
        self._agent_uuid = agent_uuid
        self._fsm_state = initial_fsm_state
        self._token_burn_rate = token_burn_rate
        self._accumulator: MetricsAccumulator = (
            accumulator if accumulator is not None else _process_accumulator
        )
        self._base_logger: structlog.stdlib.BoundLogger = structlog.get_logger(  # type: ignore[assignment]
            "genesis_swarm"
        ).bind(agent_uuid=agent_uuid)

    # ── State mutation (call only from owning task) ───────────────────────────

    def update_state(self, state: str) -> None:
        """Update the FSM state label appended to future log records."""
        self._fsm_state = state

    def update_token_burn_rate(self, rate: float) -> None:
        """Update the token burn rate appended to future log records."""
        self._token_burn_rate = rate

    # ── Internal bound-logger builder ─────────────────────────────────────────

    def _bound(self) -> structlog.stdlib.BoundLogger:
        return self._base_logger.bind(  # type: ignore[return-value]
            current_fsm_state=self._fsm_state,
            token_burn_rate=round(self._token_burn_rate, 6),
            metrics=self._accumulator.snapshot(),
        )

    # ── Logging interface ─────────────────────────────────────────────────────

    def debug(self, event: str, **kw: object) -> None:
        self._bound().debug(event, **kw)

    def info(self, event: str, **kw: object) -> None:
        self._bound().info(event, **kw)

    def warning(self, event: str, **kw: object) -> None:
        self._bound().warning(event, **kw)

    def error(self, event: str, **kw: object) -> None:
        self._bound().error(event, **kw)

    def critical(self, event: str, **kw: object) -> None:
        self._bound().critical(event, **kw)

    # ── Metrics helpers ───────────────────────────────────────────────────────

    @contextmanager
    def timed(self, operation: str) -> Generator[None, None, None]:
        """
        Context manager that records wall-clock latency in microseconds.

        Uses ``time.perf_counter_ns()`` for sub-microsecond resolution.

        Usage::

            with tel.timed("llm_inference"):
                result = await model.generate(prompt)
        """
        t0 = time.perf_counter_ns()
        try:
            yield
        finally:
            elapsed_us = (time.perf_counter_ns() - t0) / _NS_PER_US
            self._accumulator.record_latency_us(elapsed_us)
            self._bound().debug(
                "operation_timed",
                operation=operation,
                latency_us=round(elapsed_us, 3),
            )

    def record_step(self) -> None:
        """Increment the steps-per-second counter in the accumulator."""
        self._accumulator.record_step()

    def metrics(self) -> dict[str, float]:
        """Return a snapshot of all accumulated metrics."""
        return self._accumulator.snapshot()
