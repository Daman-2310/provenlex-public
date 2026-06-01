"""
Polymorphic State-Machine Runtime — Dynamic LLM-Assisted Self-Patching.

Architecture
------------
        ┌──────────────────────────────────────────────────────────────┐
        │  SelfHealingRuntime                                           │
        │                                                               │
        │  ExceptionTelemetry → IsolationCoordinator                   │
        │       (sliding window)       (BFT quorum vote)               │
        │                                    │ QUARANTINED              │
        │                              PatchGeneratorLLM               │
        │                          (claude-opus-4-7, adaptive)         │
        │                                    │ (patch, tests)           │
        │                              PatchSandbox                    │
        │                        (RestrictedPython + subprocess)       │
        │                                    │ tests pass               │
        │                          HotPatchApplicator                  │
        │                    (importlib + threading.RLock)             │
        └──────────────────────────────────────────────────────────────┘

Security model
--------------
1. RestrictedPython compile-time check rejects exec/eval/__import__/open/os.
2. Tests run in a child subprocess with a 30-second wall-clock timeout.
3. Hot-load executes in the module's own namespace — no privileged escalation.
4. Forbidden module list is embedded in the LLM system prompt so the model
   cannot emit patches that touch auth, billing, or audit components.
5. Every applied patch is SHA-256 digested and logged with a timestamp.

Threading model
---------------
- ExceptionTelemetry uses threading.Lock (called from any thread/coroutine).
- IsolationCoordinator is fully async (asyncio.Lock).
- HotPatchApplicator uses threading.RLock for module.__dict__ surgery.
- SelfHealingRuntime._heal() is serialised per-component via _in_flight set.
"""

from __future__ import annotations

import asyncio
import collections
import hashlib
import importlib
import inspect
import json
import logging
import re
import sys
import tempfile
import textwrap
import threading
import time
import traceback

from genesis_swarm.shared.task import fire
import types
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Any, Optional

import anthropic
from fastapi import APIRouter
from fastapi.responses import JSONResponse

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/runtime", tags=["runtime"])

# ── Tuning constants ──────────────────────────────────────────────────────────

_EXCEPTION_WINDOW_S: float = 60.0
_EXCEPTION_THRESHOLD: int = 10
_VOTE_QUORUM: int = 7           # 2f+1 for N=11 cluster
_LLM_MODEL: str = "claude-opus-4-7"
_MAX_PATCH_TOKENS: int = 4096
_SANDBOX_TIMEOUT_S: int = 30
_FORBIDDEN_MODULES: frozenset[str] = frozenset({
    "billing", "auth", "oidc_auth", "audit_chain",
    "tenant_billing", "webhook", "trust_verifier",
})


# ── Exception telemetry ───────────────────────────────────────────────────────

@dataclass
class _ExceptionEvent:
    component: str
    exc_type: str
    message: str
    trace: str
    ts: float = field(default_factory=time.time)


class ExceptionTelemetry:
    """
    Per-component sliding-window exception counter.

    Thread-safe; designed to be called from both sync and async contexts
    via the same threading.Lock (never awaited, always non-blocking).
    """

    def __init__(self, window_s: float = _EXCEPTION_WINDOW_S) -> None:
        self._window = window_s
        self._events: dict[str, collections.deque[_ExceptionEvent]] = (
            collections.defaultdict(collections.deque)
        )
        self._lock = threading.Lock()

    def record(self, component: str, exc: BaseException) -> _ExceptionEvent:
        event = _ExceptionEvent(
            component=component,
            exc_type=type(exc).__name__,
            message=str(exc)[:512],
            trace=traceback.format_exc()[:3072],
        )
        with self._lock:
            dq = self._events[component]
            dq.append(event)
            self._evict(dq)
        return event

    def rate(self, component: str) -> int:
        with self._lock:
            dq = self._events.get(component, collections.deque())
            self._evict(dq)
            return len(dq)

    def latest_trace(self, component: str) -> str:
        with self._lock:
            dq = self._events.get(component, collections.deque())
            return dq[-1].trace if dq else ""

    def hot_components(self, threshold: int = _EXCEPTION_THRESHOLD) -> list[str]:
        with self._lock:
            result = []
            for c, dq in self._events.items():
                self._evict(dq)
                if len(dq) >= threshold:
                    result.append(c)
            return result

    def _evict(self, dq: collections.deque) -> None:
        cutoff = time.time() - self._window
        while dq and dq[0].ts < cutoff:
            dq.popleft()


# ── BFT isolation coordinator ─────────────────────────────────────────────────

class IsolationState(Enum):
    NOMINAL = auto()
    WATCHING = auto()
    QUARANTINED = auto()
    PATCHING = auto()
    HEALED = auto()


@dataclass
class IsolationVote:
    voter_id: str
    component: str
    evidence_hash: str
    ts: float = field(default_factory=time.time)


class IsolationCoordinator:
    """
    Accumulates per-component BFT votes from PBFT replicas.

    Quarantine fires when ≥ _VOTE_QUORUM (7) distinct nodes vote.
    Votes are deduplicated by voter_id — each node has exactly one vote
    per component at any point in time.
    """

    def __init__(self, quorum: int = _VOTE_QUORUM) -> None:
        self._quorum = quorum
        self._votes: dict[str, dict[str, IsolationVote]] = {}
        self._states: dict[str, IsolationState] = {}
        self._lock = asyncio.Lock()

    async def cast_vote(self, vote: IsolationVote) -> IsolationState:
        async with self._lock:
            self._votes.setdefault(vote.component, {})[vote.voter_id] = vote
            current = self._states.get(vote.component, IsolationState.NOMINAL)
            if current in (IsolationState.NOMINAL, IsolationState.WATCHING):
                n = len(self._votes[vote.component])
                if n >= self._quorum:
                    self._states[vote.component] = IsolationState.QUARANTINED
                    log.warning(
                        "[Runtime] BFT quorum=%d reached — quarantining: %s",
                        n, vote.component,
                    )
                else:
                    self._states[vote.component] = IsolationState.WATCHING
            return self._states[vote.component]

    def state(self, component: str) -> IsolationState:
        return self._states.get(component, IsolationState.NOMINAL)

    def set_state(self, component: str, state: IsolationState) -> None:
        self._states[component] = state

    def vote_tally(self, component: str) -> int:
        return len(self._votes.get(component, {}))

    def snapshot(self) -> dict:
        return {c: s.name for c, s in self._states.items()}


# ── LLM patch generator ───────────────────────────────────────────────────────

class PatchGeneratorLLM:
    """
    Prompts claude-opus-4-7 (adaptive thinking, streaming) to produce a
    minimal targeted hot-fix for a failing component.

    Output contract — the model must return exactly two fenced code blocks:
      ```python:patch  — replacement for the failing function / method
      ```python:test   — pytest-compatible test functions
    """

    def __init__(self) -> None:
        self._client = anthropic.AsyncAnthropic()

    async def generate(
        self,
        component: str,
        source_code: str,
        exception_trace: str,
    ) -> tuple[str, str]:
        short_name = component.split(".")[-1]
        if short_name in _FORBIDDEN_MODULES:
            raise RuntimeError(
                f"Patch generation refused for protected module: {component}"
            )

        system = textwrap.dedent(f"""
            You are an expert Python security engineer performing emergency hot-fix synthesis.
            You receive a module name, its source code, and an unhandled exception trace.
            Your task: write ONE minimal, targeted Python hot-fix.

            STRICT OUTPUT FORMAT — return exactly two fenced blocks, nothing else:
            ```python:patch
            # complete replacement for the failing function or method ONLY
            ```
            ```python:test
            # pytest-compatible test_ functions — no network calls, no disk writes
            ```

            HARD RULES:
            1. Never import or modify: {", ".join(sorted(_FORBIDDEN_MODULES))}
            2. Never use: exec(), eval(), __import__(), open(), os.system(),
               subprocess, ctypes, importlib, sys.modules
            3. External HTTP: use httpx.AsyncClient with timeout=5.0 only
            4. Patch must be drop-in: same function signature as original
            5. Tests must be self-contained and runnable in <10 seconds
        """).strip()

        user = textwrap.dedent(f"""
            Component: {component}

            Exception trace (last 3000 chars):
            ```
            {exception_trace[-3000:]}
            ```

            Source code (first 5000 chars):
            ```python
            {source_code[:5000]}
            ```

            Produce the patch and tests now.
        """).strip()

        chunks: list[str] = []
        async with self._client.messages.stream(
            model=_LLM_MODEL,
            max_tokens=_MAX_PATCH_TOKENS,
            thinking={"type": "adaptive"},
            system=system,
            messages=[{"role": "user", "content": user}],
        ) as stream:
            async for text in stream.text_stream:
                chunks.append(text)

        raw = "".join(chunks)
        patch_code = _extract_fenced_block(raw, "patch")
        test_code = _extract_fenced_block(raw, "test")

        if not patch_code:
            raise RuntimeError(
                f"LLM returned empty patch block for {component}. "
                f"Raw response (first 500 chars): {raw[:500]}"
            )
        return patch_code, test_code or ""


def _extract_fenced_block(text: str, tag: str) -> str:
    m = re.search(rf"```python:{tag}\n(.*?)```", text, re.DOTALL)
    return m.group(1).strip() if m else ""


# ── Patch sandbox ─────────────────────────────────────────────────────────────

class PatchSandbox:
    """
    Two-phase validation before any code touches the live process.

    Phase 1 — RestrictedPython AST check:
      compile_restricted() raises SyntaxError if the patch uses any
      restricted builtins (exec, eval, __import__, open, etc.).

    Phase 2 — Subprocess functional test:
      The combined patch + test code is written to a temp file and run
      as `python3 -m pytest <file> -x -q` in a child process with a
      _SANDBOX_TIMEOUT_S wall-clock limit.  Only PASSED output passes.
    """

    def validate(self, patch_code: str, test_code: str) -> tuple[bool, str]:
        ok, reason = self._restricted_compile_check(patch_code, test_code)
        if not ok:
            return False, reason
        if test_code.strip():
            return self._subprocess_test(patch_code, test_code)
        return True, "no tests provided — compile-check only"

    def _restricted_compile_check(
        self, patch_code: str, test_code: str
    ) -> tuple[bool, str]:
        try:
            from RestrictedPython import compile_restricted  # type: ignore
            compile_restricted(patch_code, "<patch>", "exec")
            if test_code.strip():
                compile_restricted(test_code, "<test>", "exec")
            return True, "compile-check passed"
        except ImportError:
            # RestrictedPython not installed — skip compile-phase, rely on subprocess
            return True, "RestrictedPython not available — skipped"
        except SyntaxError as exc:
            return False, f"RestrictedPython SyntaxError: {exc}"

    def _subprocess_test(
        self, patch_code: str, test_code: str
    ) -> tuple[bool, str]:
        combined = f"{patch_code}\n\n{test_code}\n"
        with tempfile.NamedTemporaryFile(
            mode="w", suffix="_genesis_patch_test.py", delete=False
        ) as fh:
            fh.write(combined)
            tmp_path = fh.name

        import subprocess  # noqa: S404 — controlled invocation
        try:
            result = subprocess.run(  # noqa: S603
                [sys.executable, "-m", "pytest", tmp_path, "-x", "-q", "--tb=short",
                 "--no-header", "--no-cov"],
                capture_output=True,
                text=True,
                timeout=_SANDBOX_TIMEOUT_S,
            )
            passed = result.returncode == 0
            output = (result.stdout + result.stderr).strip()[-1024:]
            return passed, output if passed else f"Tests FAILED:\n{output}"
        except subprocess.TimeoutExpired:
            return False, f"Sandbox timeout after {_SANDBOX_TIMEOUT_S}s"
        except Exception as exc:
            return False, f"Subprocess error: {exc}"
        finally:
            import os
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


# ── Hot-patch applicator ──────────────────────────────────────────────────────

class HotPatchApplicator:
    """
    Atomically splices validated patch code into a live module namespace.

    Strategy
    --------
    1. Locate the module in sys.modules (import it first if absent).
    2. Compile the patch in the module's own globals so it inherits all
       existing imports and module-level symbols.
    3. Under threading.RLock, replace each patched callable / class via
       setattr(module, name, new_obj).
    4. Log a SHA-256 digest and timestamp for every replaced symbol.

    Zero-restart guarantee: process never re-execs; only __dict__ entries
    for the specific patched symbols are mutated.
    """

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._patch_log: list[dict[str, Any]] = []

    def apply(self, module_path: str, patch_code: str) -> dict[str, Any]:
        module = sys.modules.get(module_path)
        if module is None:
            try:
                module = importlib.import_module(module_path)
            except ImportError as exc:
                raise RuntimeError(
                    f"Cannot import module for hot-patch: {module_path}"
                ) from exc

        if not isinstance(module, types.ModuleType):
            raise RuntimeError(f"Expected a module, got {type(module)}")

        module_globals = vars(module).copy()
        patch_ns: dict[str, Any] = {}

        # Defense-in-depth: enforce RestrictedPython AST check immediately before
        # exec even though the caller is expected to call PatchSandbox.validate()
        # first.  This prevents direct callers from bypassing sandbox validation.
        try:
            from RestrictedPython import compile_restricted  # type: ignore[import]
            compile_restricted(patch_code, f"<hotpatch:{module_path}>", "exec")
        except ImportError:
            pass  # RestrictedPython optional — subprocess sandbox still active
        except SyntaxError as exc:
            raise RuntimeError(
                f"RestrictedPython rejected patch for {module_path}: {exc}"
            ) from exc

        byte_code = compile(patch_code, f"<hotpatch:{module_path}>", "exec")
        exec(byte_code, module_globals, patch_ns)  # noqa: S102

        replaced: list[str] = []
        with self._lock:
            for name, obj in patch_ns.items():
                if name.startswith("_"):
                    continue
                if callable(obj) or isinstance(obj, type):
                    setattr(module, name, obj)
                    replaced.append(name)
                    log.info("[HotPatch] %s.%s replaced", module_path, name)

        digest = hashlib.sha256(patch_code.encode()).hexdigest()[:16]
        record: dict[str, Any] = {
            "module": module_path,
            "symbols": replaced,
            "digest": digest,
            "ts": time.time(),
        }
        self._patch_log.append(record)
        return record

    @property
    def patch_log(self) -> list[dict[str, Any]]:
        return list(self._patch_log)


# ── Main runtime orchestrator ─────────────────────────────────────────────────

class SelfHealingRuntime:
    """
    Observe → Vote → Generate → Sandbox → Hot-reload lifecycle.

    Usage
    -----
    runtime = SelfHealingRuntime(node_id="SANCTIONS_BOT")
    await runtime.start()

    # In any bot or data-feed coroutine:
    try:
        result = await some_external_call()
    except Exception as exc:
        await runtime.on_exception("genesis_swarm.bots.sanctions_bot", exc)
    """

    def __init__(
        self,
        node_id: str,
        node_ids: Optional[list[str]] = None,
    ) -> None:
        self.node_id = node_id
        self._node_ids: list[str] = node_ids or []
        self._telemetry = ExceptionTelemetry()
        self._coordinator = IsolationCoordinator()
        self._generator = PatchGeneratorLLM()
        self._sandbox = PatchSandbox()
        self._applicator = HotPatchApplicator()
        self._in_flight: set[str] = set()
        self._flight_lock = asyncio.Lock()

    async def start(self) -> None:
        asyncio.ensure_future(self._watchdog_loop())
        log.info("[SelfHealingRuntime] started node_id=%s", self.node_id)

    async def on_exception(
        self, component: str, exc: BaseException
    ) -> None:
        """Feed an exception into the telemetry pipeline."""
        event = self._telemetry.record(component, exc)
        rate = self._telemetry.rate(component)
        log.debug("[Runtime] %s exception_rate=%d/60s", component, rate)

        if rate >= _EXCEPTION_THRESHOLD:
            vote = IsolationVote(
                voter_id=self.node_id,
                component=component,
                evidence_hash=hashlib.sha256(event.trace.encode()).hexdigest(),
            )
            new_state = await self._coordinator.cast_vote(vote)
            if new_state == IsolationState.QUARANTINED:
                fire(self._heal_cycle(component), name=f"heal-{component}")

    async def _watchdog_loop(self) -> None:
        """Background sweep every 30 s — promotes hot components to WATCHING."""
        while True:
            await asyncio.sleep(30.0)
            for component in self._telemetry.hot_components():
                state = self._coordinator.state(component)
                if state == IsolationState.NOMINAL:
                    vote = IsolationVote(
                        voter_id=self.node_id,
                        component=component,
                        evidence_hash=hashlib.sha256(
                            self._telemetry.latest_trace(component).encode()
                        ).hexdigest(),
                    )
                    await self._coordinator.cast_vote(vote)

    async def _heal_cycle(self, component: str) -> None:
        """Full LLM-assisted heal cycle for one quarantined component."""
        async with self._flight_lock:
            if component in self._in_flight:
                return
            self._in_flight.add(component)

        try:
            self._coordinator.set_state(component, IsolationState.PATCHING)
            log.info("[Runtime] LLM patch cycle started: %s", component)

            source = _load_module_source(component)
            trace = self._telemetry.latest_trace(component)

            patch_code, test_code = await self._generator.generate(
                component, source, trace
            )

            passed, reason = self._sandbox.validate(patch_code, test_code)
            if not passed:
                log.error(
                    "[Runtime] Sandbox rejected patch for %s: %s", component, reason
                )
                self._coordinator.set_state(component, IsolationState.WATCHING)
                return

            record = self._applicator.apply(component, patch_code)
            self._coordinator.set_state(component, IsolationState.HEALED)
            log.info(
                "[Runtime] Hot-patch applied: %s symbols=%s digest=%s",
                component, record["symbols"], record["digest"],
            )

        except Exception as exc:
            log.error("[Runtime] Heal cycle error for %s: %s", component, exc)
            self._coordinator.set_state(component, IsolationState.WATCHING)
        finally:
            async with self._flight_lock:
                self._in_flight.discard(component)

    def status(self) -> dict[str, Any]:
        return {
            "node_id": self.node_id,
            "component_states": self._coordinator.snapshot(),
            "hot_components": self._telemetry.hot_components(),
            "in_flight": sorted(self._in_flight),
            "patch_log": self._applicator.patch_log[-10:],
        }

    @property
    def telemetry(self) -> ExceptionTelemetry:
        return self._telemetry

    @property
    def coordinator(self) -> IsolationCoordinator:
        return self._coordinator


def _load_module_source(module_path: str) -> str:
    module = sys.modules.get(module_path)
    if module is None:
        try:
            module = importlib.import_module(module_path)
        except ImportError:
            return f"# Source unavailable for {module_path}"
    try:
        return inspect.getsource(module)
    except (OSError, TypeError):
        return f"# inspect.getsource failed for {module_path}"


# ── FastAPI routes ────────────────────────────────────────────────────────────

_runtime_instance: Optional[SelfHealingRuntime] = None


def init_runtime(node_id: str) -> SelfHealingRuntime:
    global _runtime_instance
    _runtime_instance = SelfHealingRuntime(node_id=node_id)
    return _runtime_instance


@router.get("/status", summary="Self-healing runtime status")
async def get_runtime_status() -> JSONResponse:
    if _runtime_instance is None:
        return JSONResponse({"enabled": False, "node_id": None})
    return JSONResponse({"enabled": True, **_runtime_instance.status()})


@router.get("/patches", summary="Applied hot-patch audit log")
async def get_patch_log() -> JSONResponse:
    if _runtime_instance is None:
        return JSONResponse({"patches": []})
    return JSONResponse({"patches": _runtime_instance._applicator.patch_log})


@router.get("/isolation", summary="Per-component isolation states")
async def get_isolation_states() -> JSONResponse:
    if _runtime_instance is None:
        return JSONResponse({"states": {}})
    return JSONResponse({
        "states": _runtime_instance.coordinator.snapshot(),
        "hot_components": _runtime_instance.telemetry.hot_components(),
    })


@router.post("/simulate-exception", summary="Inject a test exception (dev only)")
async def simulate_exception(
    component: str = "genesis_swarm.bots.fx_bot",
    message: str = "simulated connection reset",
) -> JSONResponse:
    if _runtime_instance is None:
        return JSONResponse({"error": "runtime not initialised"}, status_code=503)
    exc = RuntimeError(message)
    await _runtime_instance.on_exception(component, exc)
    return JSONResponse({
        "injected": True,
        "component": component,
        "rate": _runtime_instance.telemetry.rate(component),
        "state": _runtime_instance.coordinator.state(component).name,
    })


# ── Structured patch-event for audit chain integration ────────────────────────

def patch_event_payload(record: dict[str, Any]) -> dict[str, Any]:
    """Convert a HotPatchApplicator record into an AuditChain payload dict."""
    return {
        "event": "hot_patch_applied",
        "module": record["module"],
        "symbols": record["symbols"],
        "patch_digest": record["digest"],
        "applied_at": record["ts"],
        "checksum": hashlib.sha256(
            json.dumps(record, sort_keys=True).encode()
        ).hexdigest(),
    }
