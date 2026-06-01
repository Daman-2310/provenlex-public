"""
Financial Firewall & Loop Circuit Breakers — Pillar 7.

FinancialGuardrailManager enforces two classes of safety constraints across
all agent sessions:

  1. Budget guardrails — per-session and platform-wide USD spend caps.
     Token costs are calculated from real 2025 model tariffs.  When a session
     exceeds its limit the pipeline is frozen and BudgetExceededException is
     raised.

  2. Iteration-depth guardrails — per-agent loop detection.  When a single
     agent surpasses the configured depth threshold within a session,
     InfiniteLoopDetectedException is raised and the session is frozen.

All state mutations are guarded by asyncio.Lock() so the manager is safe for
concurrent use across multiple asyncio tasks.

Usage:
    from genesis_swarm.swarm.guardrails import (
        FinancialGuardrailManager,
        ModelTariff,
        TokenTransaction,
        BudgetExceededException,
        InfiniteLoopDetectedException,
    )

    mgr = FinancialGuardrailManager(session_budget_usd=1.00)

    # Record a completed LLM call
    await mgr.record_transaction(TokenTransaction(
        model="claude-opus-4-7",
        input_tokens=1500,
        output_tokens=300,
        agent_id="nav-detector",
        session_id="sess-abc",
    ))

    # Increment loop depth for an agent (raises if limit exceeded)
    await mgr.check_iteration_depth("sess-abc", "nav-detector")

    # Decorator usage
    @mgr.guardrail(session_id="sess-abc", agent_id="nav-detector")
    async def agent_step(payload):
        ...
"""

from __future__ import annotations

import asyncio
import functools
import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, TypeVar

from pydantic import BaseModel, ConfigDict, Field

_log = logging.getLogger(__name__)

_F = TypeVar("_F", bound=Callable[..., Awaitable[Any]])

# ── Exceptions ────────────────────────────────────────────────────────────────


class BudgetExceededException(RuntimeError):
    """Raised when a session or platform budget is exhausted."""

    def __init__(
        self,
        limit_usd: float,
        actual_usd: float,
        session_id: str,
        *,
        scope: str = "session",
    ) -> None:
        super().__init__(
            f"[{scope}] Budget exceeded for session {session_id!r}: "
            f"limit=${limit_usd:.4f}, actual=${actual_usd:.4f}"
        )
        self.limit_usd = limit_usd
        self.actual_usd = actual_usd
        self.session_id = session_id
        self.scope = scope


class InfiniteLoopDetectedException(RuntimeError):
    """Raised when an agent's iteration depth exceeds the configured limit."""

    def __init__(self, agent_id: str, depth: int, limit: int, session_id: str) -> None:
        super().__init__(
            f"Infinite loop detected: agent {agent_id!r} reached depth {depth} "
            f"(limit={limit}) in session {session_id!r}"
        )
        self.agent_id = agent_id
        self.depth = depth
        self.limit = limit
        self.session_id = session_id


class PipelineFrozenError(RuntimeError):
    """Raised when a request is made against a frozen session."""

    def __init__(self, session_id: str, reason: str) -> None:
        super().__init__(f"Session {session_id!r} is frozen: {reason}")
        self.session_id = session_id
        self.reason = reason


# ── Model tariffs (real 2025 pricing, USD per 1M tokens) ──────────────────────


@dataclass(frozen=True)
class ModelTariff:
    model_id: str
    input_usd_per_1m: float
    output_usd_per_1m: float

    def calculate_cost(self, input_tokens: int, output_tokens: int) -> float:
        """Return total USD cost for the given token counts."""
        return (
            (input_tokens / 1_000_000) * self.input_usd_per_1m
            + (output_tokens / 1_000_000) * self.output_usd_per_1m
        )


# Canonical 2025 model tariffs — update when pricing changes
_MODEL_TARIFFS: dict[str, ModelTariff] = {
    # Claude 4.x family
    "claude-opus-4-7": ModelTariff("claude-opus-4-7", 5.00, 25.00),
    "claude-opus-4-6": ModelTariff("claude-opus-4-6", 5.00, 25.00),
    "claude-sonnet-4-6": ModelTariff("claude-sonnet-4-6", 3.00, 15.00),
    "claude-haiku-4-5": ModelTariff("claude-haiku-4-5", 1.00, 5.00),
    # Claude 3.x family (legacy)
    "claude-opus-3-5": ModelTariff("claude-opus-3-5", 15.00, 75.00),
    "claude-sonnet-3-5": ModelTariff("claude-sonnet-3-5", 3.00, 15.00),
    "claude-haiku-3-5": ModelTariff("claude-haiku-3-5", 0.80, 4.00),
    # OpenAI-compat aliases (estimated)
    "gpt-4o": ModelTariff("gpt-4o", 5.00, 15.00),
    "gpt-4o-mini": ModelTariff("gpt-4o-mini", 0.15, 0.60),
    "gpt-4-turbo": ModelTariff("gpt-4-turbo", 10.00, 30.00),
    # Local / self-hosted — zero cost
    "ollama": ModelTariff("ollama", 0.0, 0.0),
    "vllm": ModelTariff("vllm", 0.0, 0.0),
}

# Fallback tariff used when model_id is not in _MODEL_TARIFFS
_UNKNOWN_TARIFF = ModelTariff("unknown", 5.00, 25.00)


def get_tariff(model_id: str) -> ModelTariff:
    """Return the ModelTariff for *model_id*, falling back to _UNKNOWN_TARIFF."""
    key = model_id.lower().strip()
    # Exact match first
    if key in _MODEL_TARIFFS:
        return _MODEL_TARIFFS[key]
    # Prefix match — handles versioned IDs like "claude-opus-4-7-20251115"
    for tariff_key, tariff in _MODEL_TARIFFS.items():
        if key.startswith(tariff_key):
            return tariff
    _log.warning("unknown_model_tariff", model_id=model_id, fallback=_UNKNOWN_TARIFF.model_id)
    return _UNKNOWN_TARIFF


# ── Transaction model ─────────────────────────────────────────────────────────


class TokenTransaction(BaseModel):
    """Represents a single completed LLM call with its token consumption."""

    model_config = ConfigDict(frozen=True)

    model: str
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)
    agent_id: str
    session_id: str
    timestamp: float = Field(default_factory=time.time)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @property
    def cost_usd(self) -> float:
        return get_tariff(self.model).calculate_cost(self.input_tokens, self.output_tokens)


# ── Per-session metrics ────────────────────────────────────────────────────────


@dataclass
class SessionMetrics:
    session_id: str
    created_at: float = field(default_factory=time.time)
    total_cost_usd: float = 0.0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    transaction_count: int = 0
    # Per-agent iteration depth within this session
    agent_depths: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    frozen: bool = False
    freeze_reason: str = ""
    transactions: list[TokenTransaction] = field(default_factory=list)

    def apply_transaction(self, tx: TokenTransaction) -> None:
        self.total_cost_usd += tx.cost_usd
        self.total_input_tokens += tx.input_tokens
        self.total_output_tokens += tx.output_tokens
        self.transaction_count += 1
        self.transactions.append(tx)

    def increment_depth(self, agent_id: str) -> int:
        self.agent_depths[agent_id] += 1
        return self.agent_depths[agent_id]

    def to_dict(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "total_cost_usd": round(self.total_cost_usd, 6),
            "total_input_tokens": self.total_input_tokens,
            "total_output_tokens": self.total_output_tokens,
            "transaction_count": self.transaction_count,
            "agent_depths": dict(self.agent_depths),
            "frozen": self.frozen,
            "freeze_reason": self.freeze_reason,
            "created_at": self.created_at,
        }


# ── Platform-wide metrics ─────────────────────────────────────────────────────


@dataclass
class _PlatformMetrics:
    total_cost_usd: float = 0.0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    transaction_count: int = 0
    sessions_frozen: int = 0
    budget_violations: int = 0
    loop_violations: int = 0

    def apply_transaction(self, tx: TokenTransaction) -> None:
        self.total_cost_usd += tx.cost_usd
        self.total_input_tokens += tx.input_tokens
        self.total_output_tokens += tx.output_tokens
        self.transaction_count += 1


# ── Main manager ──────────────────────────────────────────────────────────────


class FinancialGuardrailManager:
    """
    Enforces financial and loop-depth safety guardrails across all agent sessions.

    Parameters
    ----------
    session_budget_usd:
        Hard USD cap per session.  None disables per-session enforcement.
    platform_budget_usd:
        Hard USD cap across all sessions combined.  None disables platform enforcement.
    max_iteration_depth:
        Maximum number of times a single agent may be invoked within one session
        before InfiniteLoopDetectedException is raised.
    """

    def __init__(
        self,
        *,
        session_budget_usd: float | None = 1.00,
        platform_budget_usd: float | None = None,
        max_iteration_depth: int = 50,
    ) -> None:
        self._session_budget = session_budget_usd
        self._platform_budget = platform_budget_usd
        self._max_depth = max_iteration_depth

        self._sessions: dict[str, SessionMetrics] = {}
        self._platform = _PlatformMetrics()
        self._lock = asyncio.Lock()

    # ── Internal helpers ────────────────────────────────────────────────────

    def _get_or_create_session(self, session_id: str) -> SessionMetrics:
        if session_id not in self._sessions:
            self._sessions[session_id] = SessionMetrics(session_id=session_id)
        return self._sessions[session_id]

    def _assert_not_frozen(self, session: SessionMetrics) -> None:
        if session.frozen:
            raise PipelineFrozenError(session.session_id, session.freeze_reason)

    def _freeze(self, session: SessionMetrics, reason: str) -> None:
        session.frozen = True
        session.freeze_reason = reason
        self._platform.sessions_frozen += 1
        _log.error("pipeline_frozen session=%s reason=%s", session.session_id, reason)

    # ── Public API ──────────────────────────────────────────────────────────

    async def record_transaction(self, tx: TokenTransaction) -> None:
        """
        Record an LLM token transaction and enforce budget guardrails.

        Raises:
            PipelineFrozenError       — session was frozen by a prior violation
            BudgetExceededException   — this transaction pushes spend over limit
        """
        async with self._lock:
            session = self._get_or_create_session(tx.session_id)
            self._assert_not_frozen(session)

            session.apply_transaction(tx)
            self._platform.apply_transaction(tx)

            _log.debug(
                "transaction_recorded session=%s agent=%s model=%s cost=%.6f total=%.6f",
                tx.session_id, tx.agent_id, tx.model, tx.cost_usd, session.total_cost_usd,
            )

            # Per-session budget check
            if self._session_budget is not None and session.total_cost_usd > self._session_budget:
                self._platform.budget_violations += 1
                self._freeze(
                    session,
                    f"session budget ${self._session_budget:.4f} exceeded "
                    f"(actual=${session.total_cost_usd:.4f})",
                )
                raise BudgetExceededException(
                    limit_usd=self._session_budget,
                    actual_usd=session.total_cost_usd,
                    session_id=tx.session_id,
                    scope="session",
                )

            # Platform budget check
            if (
                self._platform_budget is not None
                and self._platform.total_cost_usd > self._platform_budget
            ):
                self._platform.budget_violations += 1
                self._freeze(
                    session,
                    f"platform budget ${self._platform_budget:.4f} exceeded "
                    f"(actual=${self._platform.total_cost_usd:.4f})",
                )
                raise BudgetExceededException(
                    limit_usd=self._platform_budget,
                    actual_usd=self._platform.total_cost_usd,
                    session_id=tx.session_id,
                    scope="platform",
                )

    async def check_iteration_depth(self, session_id: str, agent_id: str) -> int:
        """
        Increment and validate the iteration depth counter for *agent_id* in *session_id*.

        Returns the current depth after incrementing.

        Raises:
            PipelineFrozenError              — session was frozen by a prior violation
            InfiniteLoopDetectedException    — depth has reached max_iteration_depth
        """
        async with self._lock:
            session = self._get_or_create_session(session_id)
            self._assert_not_frozen(session)

            depth = session.increment_depth(agent_id)

            if depth >= self._max_depth:
                self._platform.loop_violations += 1
                self._freeze(
                    session,
                    f"agent {agent_id!r} hit iteration depth {depth} (limit={self._max_depth})",
                )
                raise InfiniteLoopDetectedException(
                    agent_id=agent_id,
                    depth=depth,
                    limit=self._max_depth,
                    session_id=session_id,
                )

            _log.debug(
                "iteration_depth_checked session=%s agent=%s depth=%d limit=%d",
                session_id, agent_id, depth, self._max_depth,
            )
            return depth

    async def freeze_pipeline(self, session_id: str, reason: str) -> None:
        """Manually freeze a session, preventing any further transactions or depth checks."""
        async with self._lock:
            session = self._get_or_create_session(session_id)
            if not session.frozen:
                self._freeze(session, reason)

    async def reset_session(self, session_id: str) -> None:
        """Clear all metrics and frozen state for a session (use with caution)."""
        async with self._lock:
            if session_id in self._sessions:
                del self._sessions[session_id]
                _log.info("session_reset session=%s", session_id)

    # ── Reporting ───────────────────────────────────────────────────────────

    def session_summary(self, session_id: str) -> dict[str, Any]:
        """Return a snapshot of session metrics (no lock — read-only snapshot)."""
        session = self._sessions.get(session_id)
        if session is None:
            return {"session_id": session_id, "exists": False}
        return session.to_dict()

    def platform_summary(self) -> dict[str, Any]:
        """Return a snapshot of platform-wide aggregate metrics."""
        return {
            "total_cost_usd": round(self._platform.total_cost_usd, 6),
            "total_input_tokens": self._platform.total_input_tokens,
            "total_output_tokens": self._platform.total_output_tokens,
            "transaction_count": self._platform.transaction_count,
            "sessions_active": len(self._sessions),
            "sessions_frozen": self._platform.sessions_frozen,
            "budget_violations": self._platform.budget_violations,
            "loop_violations": self._platform.loop_violations,
            "session_budget_usd": self._session_budget,
            "platform_budget_usd": self._platform_budget,
            "max_iteration_depth": self._max_depth,
        }

    def is_frozen(self, session_id: str) -> bool:
        """Return True if the session is currently frozen."""
        session = self._sessions.get(session_id)
        return session.frozen if session is not None else False

    # ── Decorator factory ───────────────────────────────────────────────────

    def guardrail(
        self,
        *,
        session_id: str,
        agent_id: str,
        model: str | None = None,
    ) -> Callable[[_F], _F]:
        """
        Async decorator factory that wraps an agent step with guardrail checks.

        Before the call:
          - Verifies session is not frozen
          - Increments and checks iteration depth

        After the call (if the wrapped function returns a result with
        .usage.input_tokens / .usage.output_tokens attributes, e.g. LLMResponse):
          - Records the token transaction automatically

        Usage:
            @mgr.guardrail(session_id="sess-abc", agent_id="nav-detector",
                           model="claude-opus-4-7")
            async def agent_step(payload):
                return await llm.complete(request)
        """

        def decorator(fn: _F) -> _F:
            @functools.wraps(fn)
            async def wrapper(*args: Any, **kwargs: Any) -> Any:
                # Pre-call: depth check
                await self.check_iteration_depth(session_id, agent_id)

                result = await fn(*args, **kwargs)

                # Post-call: auto-record if result carries usage metadata
                if result is not None and hasattr(result, "usage") and model:
                    usage = result.usage
                    in_tok = getattr(usage, "input_tokens", 0) or 0
                    out_tok = getattr(usage, "output_tokens", 0) or 0
                    if in_tok > 0 or out_tok > 0:
                        tx = TokenTransaction(
                            model=model,
                            input_tokens=in_tok,
                            output_tokens=out_tok,
                            agent_id=agent_id,
                            session_id=session_id,
                        )
                        await self.record_transaction(tx)

                return result

            return wrapper  # type: ignore[return-value]

        return decorator
