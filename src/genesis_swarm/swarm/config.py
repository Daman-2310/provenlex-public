"""
Formally-verified configuration schemas for Genesis Swarm.

All runtime parameters are expressed as Pydantic v2 ``BaseModel`` subclasses
with ``model_config = ConfigDict(frozen=True)``.  Immutability is intentional:
configuration must be treated as a read-only contract once the process starts.

Schema hierarchy
----------------
TelemetryConfig      — structlog renderer, log level, ring-buffer capacities
RetryPolicy          — tenacity backoff parameters per operation class
CircuitBreakerPolicy — failure/recovery thresholds for external calls
AgentConfig          — per-agent FSM and heartbeat parameters
ClusterConfig        — cluster topology and quorum requirements
SwarmNodeConfig      — root config composed from all of the above

Cross-field invariants enforced by validators
---------------------------------------------
- RetryPolicy.max_wait_s  > RetryPolicy.initial_wait_s
- CircuitBreakerPolicy.recovery_timeout_s > 0 and > half of failure_timeout_s
- AgentConfig.failure_threshold >= AgentConfig.max_idle_timeouts
- ClusterConfig.quorum <= ClusterConfig.n_nodes and satisfies Byzantine bound
- SwarmNodeConfig.cluster.quorum >= 2 * SwarmNodeConfig.cluster.max_faulty + 1
"""

from __future__ import annotations

import os
from typing import Annotated, Final, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# ── Module-level constraints ───────────────────────────────────────────────────

_MIN_QUORUM_MULTIPLIER: Final[int] = 2  # quorum >= 2f + 1  (Byzantine fault tolerance)

# ── TelemetryConfig ───────────────────────────────────────────────────────────


class TelemetryConfig(BaseModel):
    """Configuration for the structlog pipeline and MetricsAccumulator."""

    model_config = ConfigDict(frozen=True)

    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        default="INFO",
        description="Root logging level applied to the structlog pipeline.",
    )
    renderer: Literal["json", "console"] = Field(
        default="json",
        description=(
            "'json' emits newline-delimited JSON compatible with Loki/Datadog/ELK. "
            "'console' emits coloured output for local development."
        ),
    )
    latency_ring_size: Annotated[int, Field(ge=64, le=65_536)] = Field(
        default=1024,
        description="Capacity of the per-process latency ring buffer (samples).",
    )
    step_ring_size: Annotated[int, Field(ge=16, le=8_192)] = Field(
        default=256,
        description="Capacity of the per-process step-timestamp ring buffer.",
    )

    @field_validator("log_level", mode="before")
    @classmethod
    def normalise_level(cls, v: object) -> str:
        if isinstance(v, str):
            return v.upper()
        raise ValueError(f"log_level must be a string, got {type(v).__name__}")


# ── RetryPolicy ───────────────────────────────────────────────────────────────


class RetryPolicy(BaseModel):
    """
    Tenacity exponential-backoff-with-jitter parameters.

    Applied to external networking calls, LLM token requests, and physics
    simulation ticks via ``GenesisSwarmCore._with_retry()``.
    """

    model_config = ConfigDict(frozen=True)

    max_attempts: Annotated[int, Field(ge=1, le=20)] = Field(
        default=5,
        description="Maximum number of attempts before raising RetryError.",
    )
    initial_wait_s: Annotated[float, Field(gt=0.0, le=30.0)] = Field(
        default=0.25,
        description="Initial wait before the first retry (seconds).",
    )
    max_wait_s: Annotated[float, Field(gt=0.0, le=300.0)] = Field(
        default=30.0,
        description="Upper bound on per-retry wait duration (seconds).",
    )
    jitter_s: Annotated[float, Field(ge=0.0, le=10.0)] = Field(
        default=0.5,
        description="Maximum random jitter added to each wait interval (seconds).",
    )
    retriable_exceptions: tuple[str, ...] = Field(
        default=("OSError", "TimeoutError", "asyncio.TimeoutError"),
        description="Fully-qualified exception class names that trigger a retry.",
    )

    @model_validator(mode="after")
    def wait_bounds_consistent(self) -> "RetryPolicy":
        if self.max_wait_s <= self.initial_wait_s:
            raise ValueError(
                f"max_wait_s ({self.max_wait_s}) must be strictly greater than "
                f"initial_wait_s ({self.initial_wait_s})."
            )
        return self


# ── CircuitBreakerPolicy ──────────────────────────────────────────────────────


class CircuitBreakerPolicy(BaseModel):
    """
    Half-open circuit breaker thresholds.

    When ``failure_threshold`` consecutive failures are recorded the breaker
    opens.  After ``recovery_timeout_s`` seconds in the open state, it
    transitions to half-open and allows one probe request through.
    """

    model_config = ConfigDict(frozen=True)

    failure_threshold: Annotated[int, Field(ge=1, le=50)] = Field(
        default=5,
        description="Consecutive failure count that trips the breaker open.",
    )
    recovery_timeout_s: Annotated[float, Field(gt=0.0, le=3_600.0)] = Field(
        default=30.0,
        description="Seconds in the open state before transitioning to half-open.",
    )
    success_threshold: Annotated[int, Field(ge=1, le=10)] = Field(
        default=2,
        description=(
            "Consecutive successes required in half-open state to close the breaker."
        ),
    )

    @model_validator(mode="after")
    def recovery_exceeds_failure_window(self) -> "CircuitBreakerPolicy":
        min_recovery = self.failure_threshold * 0.5
        if self.recovery_timeout_s < min_recovery:
            raise ValueError(
                f"recovery_timeout_s ({self.recovery_timeout_s}s) is suspiciously "
                f"short for failure_threshold={self.failure_threshold}.  "
                f"Expected at least {min_recovery}s."
            )
        return self


# ── AgentConfig ───────────────────────────────────────────────────────────────


class AgentConfig(BaseModel):
    """
    Per-agent FSM lifecycle and heartbeat parameters.

    These values are read-only once the swarm has started.  Changing them
    at runtime would violate the invariants of in-flight FSM transitions.
    """

    model_config = ConfigDict(frozen=True)

    heartbeat_timeout_s: Annotated[float, Field(gt=0.0, le=300.0)] = Field(
        default=15.0,
        description=(
            "Seconds without a heartbeat after which the watchdog triggers healing."
        ),
    )
    watchdog_interval_s: Annotated[float, Field(gt=0.0, le=60.0)] = Field(
        default=5.0,
        description="Polling interval of the watchdog coroutine (seconds).",
    )
    max_idle_timeouts: Annotated[int, Field(ge=1, le=20)] = Field(
        default=3,
        description=(
            "Number of consecutive heartbeat timeouts before the FSM transitions "
            "from IDLE to WATCHING."
        ),
    )
    failure_threshold: Annotated[int, Field(ge=1, le=50)] = Field(
        default=5,
        description=(
            "Cumulative failure count that triggers FSM transition to HEALING."
        ),
    )
    inbox_maxsize: Annotated[int, Field(ge=1, le=100_000)] = Field(
        default=1_024,
        description="Capacity of the agent's asyncio.Queue inbox.",
    )

    @model_validator(mode="after")
    def thresholds_ordered(self) -> "AgentConfig":
        if self.failure_threshold < self.max_idle_timeouts:
            raise ValueError(
                f"failure_threshold ({self.failure_threshold}) must be >= "
                f"max_idle_timeouts ({self.max_idle_timeouts}) so that repeated "
                "idle timeouts eventually trigger healing."
            )
        if self.watchdog_interval_s >= self.heartbeat_timeout_s:
            raise ValueError(
                f"watchdog_interval_s ({self.watchdog_interval_s}s) must be "
                f"strictly less than heartbeat_timeout_s ({self.heartbeat_timeout_s}s) "
                "so the watchdog can detect missed heartbeats in time."
            )
        return self


# ── ClusterConfig ─────────────────────────────────────────────────────────────


class ClusterConfig(BaseModel):
    """
    Cluster topology and Byzantine-fault-tolerant quorum settings.

    Invariant enforced: ``quorum >= 2 * max_faulty + 1``  (PBFT safety bound).
    This is checked both here and in ``SwarmNodeConfig.validate_bft_bound``.
    """

    model_config = ConfigDict(frozen=True)

    n_nodes: Annotated[int, Field(ge=4, le=1_000)] = Field(
        default=11,
        description="Total number of voting nodes in the cluster.",
    )
    max_faulty: Annotated[int, Field(ge=1, le=333)] = Field(
        default=3,
        description=(
            "Maximum number of Byzantine-faulty nodes the protocol can tolerate."
        ),
    )
    quorum: Annotated[int, Field(ge=3, le=1_000)] = Field(
        default=7,
        description=(
            "Minimum number of votes required to commit a decision.  "
            "Must satisfy quorum >= 2 * max_faulty + 1."
        ),
    )
    consensus_timeout_s: Annotated[float, Field(gt=0.0, le=60.0)] = Field(
        default=3.0,
        description="Maximum wait for quorum before a view change is triggered.",
    )
    view_change_timeout_s: Annotated[float, Field(gt=0.0, le=120.0)] = Field(
        default=10.0,
        description="Maximum wait during a PBFT view-change phase.",
    )

    @model_validator(mode="after")
    def topology_valid(self) -> "ClusterConfig":
        bft_minimum = _MIN_QUORUM_MULTIPLIER * self.max_faulty + 1
        if self.quorum < bft_minimum:
            raise ValueError(
                f"quorum ({self.quorum}) violates the Byzantine safety bound "
                f"quorum >= 2f+1 = {bft_minimum} for max_faulty={self.max_faulty}."
            )
        if self.quorum > self.n_nodes:
            raise ValueError(
                f"quorum ({self.quorum}) cannot exceed n_nodes ({self.n_nodes})."
            )
        if self.max_faulty >= self.n_nodes // 3 + 1:
            raise ValueError(
                f"max_faulty ({self.max_faulty}) must be strictly less than "
                f"floor(n_nodes / 3) + 1 = {self.n_nodes // 3 + 1} for BFT."
            )
        return self


# ── SwarmNodeConfig ───────────────────────────────────────────────────────────


class SwarmNodeConfig(BaseModel):
    """
    Root configuration for a single Genesis Swarm node.

    Composes TelemetryConfig, RetryPolicy, CircuitBreakerPolicy, AgentConfig,
    and ClusterConfig.  Can be constructed from environment variables via
    ``SwarmNodeConfig.from_env()``.
    """

    model_config = ConfigDict(frozen=True)

    node_id: str = Field(
        default="",
        description=(
            "Unique identifier for this node (e.g. 'replica-0').  "
            "Must be non-empty in multi-node deployments."
        ),
    )
    environment: Literal["production", "staging", "development"] = Field(
        default="development",
        description=(
            "'production' enables strict validation and disables simulation fallbacks."
        ),
    )
    telemetry: TelemetryConfig = Field(default_factory=TelemetryConfig)
    retry: RetryPolicy = Field(default_factory=RetryPolicy)
    circuit_breaker: CircuitBreakerPolicy = Field(default_factory=CircuitBreakerPolicy)
    agent: AgentConfig = Field(default_factory=AgentConfig)
    cluster: ClusterConfig = Field(default_factory=ClusterConfig)

    @model_validator(mode="after")
    def production_gate(self) -> "SwarmNodeConfig":
        if self.environment == "production" and not self.node_id:
            raise ValueError(
                "node_id must be set in production environment.  "
                "Set the GENESIS_NODE_ID environment variable."
            )
        return self

    @model_validator(mode="after")
    def validate_bft_bound(self) -> "SwarmNodeConfig":
        """Re-check the BFT invariant at the root level for belt-and-suspenders safety."""
        bft_min = _MIN_QUORUM_MULTIPLIER * self.cluster.max_faulty + 1
        if self.cluster.quorum < bft_min:
            raise ValueError(
                f"[SwarmNodeConfig] cluster.quorum ({self.cluster.quorum}) < "
                f"2 * max_faulty + 1 = {bft_min}.  Cluster cannot tolerate "
                f"{self.cluster.max_faulty} Byzantine faults."
            )
        return self

    @classmethod
    def from_env(cls) -> "SwarmNodeConfig":
        """
        Construct a SwarmNodeConfig from GENESIS_* environment variables.

        Recognised variables
        --------------------
        GENESIS_NODE_ID           — node_id
        GENESIS_ENVIRONMENT       — environment
        GENESIS_LOG_LEVEL         — telemetry.log_level
        GENESIS_LOG_RENDERER      — telemetry.renderer  (json | console)
        GENESIS_N_NODES           — cluster.n_nodes
        GENESIS_MAX_FAULTY        — cluster.max_faulty
        GENESIS_QUORUM            — cluster.quorum
        GENESIS_RETRY_MAX         — retry.max_attempts
        GENESIS_CB_FAILURE_THRESH — circuit_breaker.failure_threshold
        """
        _env = os.environ.get

        def _int(key: str, default: int) -> int:
            raw = _env(key)
            return int(raw) if raw is not None else default

        def _float(key: str, default: float) -> float:
            raw = _env(key)
            return float(raw) if raw is not None else default

        n_nodes = _int("GENESIS_N_NODES", 11)
        max_faulty = _int("GENESIS_MAX_FAULTY", 3)
        quorum = _int("GENESIS_QUORUM", 2 * max_faulty + 1)

        return cls(
            node_id=_env("GENESIS_NODE_ID", ""),
            environment=_env("GENESIS_ENVIRONMENT", "development"),  # type: ignore[arg-type]
            telemetry=TelemetryConfig(
                log_level=_env("GENESIS_LOG_LEVEL", "INFO"),  # type: ignore[arg-type]
                renderer=_env("GENESIS_LOG_RENDERER", "json"),  # type: ignore[arg-type]
            ),
            retry=RetryPolicy(
                max_attempts=_int("GENESIS_RETRY_MAX", 5),
                initial_wait_s=_float("GENESIS_RETRY_INITIAL_WAIT", 0.25),
                max_wait_s=_float("GENESIS_RETRY_MAX_WAIT", 30.0),
            ),
            circuit_breaker=CircuitBreakerPolicy(
                failure_threshold=_int("GENESIS_CB_FAILURE_THRESH", 5),
            ),
            cluster=ClusterConfig(
                n_nodes=n_nodes,
                max_faulty=max_faulty,
                quorum=quorum,
            ),
        )


# ── Module-level default config (process singleton) ───────────────────────────

_default_config: SwarmNodeConfig | None = None


def get_config() -> SwarmNodeConfig:
    """Return the process-wide SwarmNodeConfig singleton, built from environment."""
    global _default_config
    if _default_config is None:
        _default_config = SwarmNodeConfig.from_env()
    return _default_config


def reset_config() -> None:
    """Force config re-read on next ``get_config()`` call.  Use in tests only."""
    global _default_config
    _default_config = None
