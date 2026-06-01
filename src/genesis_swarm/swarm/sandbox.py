"""
Isolated Containerized Sandbox Runtime — Pillar 6.

SecureExecutionSandbox wraps the low-level Docker SDK to spin up ephemeral
python:3.11-slim containers for executing agent-generated code with strict
resource and network containment.

Security constraints enforced per container:
  - network_mode="none"       → no outbound/inbound network access
  - mem_limit="128m"          → 128 MiB hard memory ceiling
  - memswap_limit="128m"      → disables swap (prevents OOM-escape)
  - nano_cpus=1_000_000_000   → exactly 1.0 physical CPU core
  - pids_limit=64             → prevents fork-bomb process exhaustion
  - cap_drop=["ALL"]          → strips all Linux capabilities
  - security_opt=["no-new-privileges:true"]
  - read_only=True            → immutable container root FS

Code injection mechanism:
  Code is base64-encoded and passed as the __GENESIS_SCRIPT env var.
  The container entrypoint decodes and exec()s it inside a try/except so
  that tracebacks are captured in stdout and surfaced in SandboxResult.

Usage:
    sandbox = SecureExecutionSandbox.from_env()
    result = await sandbox.execute(code="print(\'hello\')", timeout_s=10.0)
    if result.exit_code == 0:
        print(result.stdout)
"""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import textwrap
import time
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

_log = logging.getLogger(__name__)

# ── Optional Docker SDK import ────────────────────────────────────────────────

try:
    import docker  # type: ignore[import-untyped]
    import docker.errors  # type: ignore[import-untyped]
    import docker.models.containers  # type: ignore[import-untyped]
    from docker import DockerClient  # type: ignore[import-untyped]

    _DOCKER_AVAILABLE = True
except ImportError:
    _DOCKER_AVAILABLE = False
    docker = None  # type: ignore[assignment]

# ── Constants ─────────────────────────────────────────────────────────────────

_SANDBOX_IMAGE = os.getenv("GENESIS_SANDBOX_IMAGE", "python:3.11-slim")
_DEFAULT_MEM_LIMIT = os.getenv("GENESIS_SANDBOX_MEM", "128m")
_DEFAULT_CPU_NANO = int(os.getenv("GENESIS_SANDBOX_NANO_CPU", str(1_000_000_000)))
_DEFAULT_PIDS = int(os.getenv("GENESIS_SANDBOX_PIDS", "64"))
_DEFAULT_TIMEOUT_S = float(os.getenv("GENESIS_SANDBOX_TIMEOUT_S", "30.0"))
_PULL_ON_STARTUP = os.getenv("GENESIS_SANDBOX_PULL", "false").lower() == "true"
_MAX_CODE_SIZE = 512 * 1024  # 512 KiB — cap before spinning up a container

# Entrypoint bootstrap injected into container; decodes __GENESIS_SCRIPT and
# wraps execution so tracebacks are captured in stdout rather than stderr.
_BOOTSTRAP_TEMPLATE = textwrap.dedent(
    """
    import base64, os, sys, traceback

    _script = base64.b64decode(os.environ["__GENESIS_SCRIPT"]).decode()
    _ns: dict = {}
    try:
        exec(compile(_script, "<genesis-sandbox>", "exec"), _ns)
    except SystemExit as _e:
        sys.exit(_e.code)
    except Exception:
        print(traceback.format_exc(), file=sys.stderr)
        sys.exit(1)
    """
).strip()


# ── Exceptions ────────────────────────────────────────────────────────────────


class SandboxUnavailableError(RuntimeError):
    """Raised when Docker daemon is unreachable or SDK is not installed."""


class ContainerStartError(RuntimeError):
    """Raised when the Docker container fails to start (image pull error, OOM, etc.)."""

    def __init__(self, message: str, cause: Exception | None = None) -> None:
        super().__init__(message)
        self.cause = cause


class ExecutionTimeoutError(TimeoutError):
    """Raised when the sandboxed execution exceeds the allowed wall-clock budget."""

    def __init__(self, timeout_s: float, code_preview: str = "") -> None:
        super().__init__(
            f"Sandbox execution exceeded {timeout_s:.1f}s time limit. "
            f"Code preview: {code_preview[:120]!r}"
        )
        self.timeout_s = timeout_s
        self.code_preview = code_preview


# ── Result model ──────────────────────────────────────────────────────────────


class SandboxResult(BaseModel):
    """Immutable execution result returned by SecureExecutionSandbox.execute()."""

    model_config = ConfigDict(frozen=True)

    exit_code: int
    stdout: str
    stderr: str
    duration_s: float = Field(ge=0.0)
    image: str
    timed_out: bool = False
    container_id: str | None = None

    @property
    def success(self) -> bool:
        return self.exit_code == 0 and not self.timed_out


# ── Internal state ────────────────────────────────────────────────────────────


@dataclass
class _SandboxStats:
    executions: int = 0
    timeouts: int = 0
    errors: int = 0
    total_duration_s: float = 0.0
    containers_leaked: int = 0


# ── Main sandbox class ────────────────────────────────────────────────────────


class SecureExecutionSandbox:
    """
    Manages ephemeral Docker containers for isolated agent code execution.

    Thread/coroutine safety: a single asyncio.Lock serialises container lifecycle
    (start → wait → cleanup) so concurrent execute() calls queue rather than
    spawn unbounded containers.  Adjust max_concurrent for higher throughput.
    """

    def __init__(
        self,
        *,
        image: str = _SANDBOX_IMAGE,
        mem_limit: str = _DEFAULT_MEM_LIMIT,
        nano_cpus: int = _DEFAULT_CPU_NANO,
        pids_limit: int = _DEFAULT_PIDS,
        default_timeout_s: float = _DEFAULT_TIMEOUT_S,
        max_concurrent: int = 4,
        pull_on_startup: bool = _PULL_ON_STARTUP,
        extra_env: dict[str, str] | None = None,
    ) -> None:
        if not _DOCKER_AVAILABLE:
            raise SandboxUnavailableError(
                "docker SDK not installed. "
                "Run: pip install 'genesis-swarm[sandbox]'  # or: pip install docker>=7.0"
            )
        self._image = image
        self._mem_limit = mem_limit
        self._nano_cpus = nano_cpus
        self._pids_limit = pids_limit
        self._default_timeout_s = default_timeout_s
        self._max_concurrent = max_concurrent
        self._pull_on_startup = pull_on_startup
        self._extra_env: dict[str, str] = extra_env or {}

        self._client: DockerClient | None = None
        self._semaphore: asyncio.Semaphore | None = None
        self._stats = _SandboxStats()
        self._lock = asyncio.Lock()
        self._initialised = False

    # ── Factory ────────────────────────────────────────────────────────────

    @classmethod
    def from_env(
        cls,
        *,
        max_concurrent: int = 4,
        extra_env: dict[str, str] | None = None,
    ) -> "SecureExecutionSandbox":
        """
        Construct from environment variables.

        GENESIS_SANDBOX_IMAGE, GENESIS_SANDBOX_MEM, GENESIS_SANDBOX_NANO_CPU,
        GENESIS_SANDBOX_PIDS, GENESIS_SANDBOX_TIMEOUT_S, GENESIS_SANDBOX_PULL
        """
        return cls(
            image=_SANDBOX_IMAGE,
            mem_limit=_DEFAULT_MEM_LIMIT,
            nano_cpus=_DEFAULT_CPU_NANO,
            pids_limit=_DEFAULT_PIDS,
            default_timeout_s=_DEFAULT_TIMEOUT_S,
            pull_on_startup=_PULL_ON_STARTUP,
            max_concurrent=max_concurrent,
            extra_env=extra_env,
        )

    # ── Lifecycle ──────────────────────────────────────────────────────────

    async def _ensure_initialised(self) -> None:
        if self._initialised:
            return
        async with self._lock:
            if self._initialised:
                return
            self._semaphore = asyncio.Semaphore(self._max_concurrent)
            loop = asyncio.get_event_loop()
            try:
                self._client = await loop.run_in_executor(None, docker.from_env)
            except Exception as exc:
                raise SandboxUnavailableError(
                    f"Cannot connect to Docker daemon: {exc}. "
                    "Is Docker running? Does the process user have socket access?"
                ) from exc

            if self._pull_on_startup:
                await self._pull_image()

            self._initialised = True
            _log.info("sandbox_initialised image=%s max_concurrent=%d",
                      self._image, self._max_concurrent)

    async def _pull_image(self) -> None:
        loop = asyncio.get_event_loop()
        try:
            _log.info("sandbox_image_pull_start image=%s", self._image)
            # type: ignore[union-attr]
            await loop.run_in_executor(None, lambda: self._client.images.pull(self._image))
            _log.info("sandbox_image_pull_done image=%s", self._image)
        except Exception as exc:
            _log.warning("sandbox_image_pull_failed image=%s error=%s", self._image, exc)

    async def close(self) -> None:
        """Release Docker client resources."""
        if self._client is not None:
            try:
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, self._client.close)
            except Exception as exc:
                _log.debug("sandbox_client_close_error error=%s", exc)
            finally:
                self._client = None
                self._initialised = False

    async def __aenter__(self) -> "SecureExecutionSandbox":
        await self._ensure_initialised()
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self.close()

    # ── Core execution ─────────────────────────────────────────────────────

    async def execute(
        self,
        code: str,
        *,
        timeout_s: float | None = None,
        extra_env: dict[str, str] | None = None,
        working_dir: str = "/tmp",  # noqa: S108
    ) -> SandboxResult:
        """
        Execute *code* in an ephemeral container, return SandboxResult.

        Raises:
            SandboxUnavailableError   — Docker unreachable / SDK absent
            ContainerStartError       — container failed to start
            ExecutionTimeoutError     — execution exceeded timeout_s
        """
        encoded = code.encode()
        if len(encoded) > _MAX_CODE_SIZE:
            raise ValueError(
                f"Code submission exceeds {_MAX_CODE_SIZE // 1024} KiB limit "
                f"({len(encoded):,} bytes). Split into smaller blocks."
            )

        await self._ensure_initialised()
        assert self._semaphore is not None  # guaranteed by _ensure_initialised

        effective_timeout = timeout_s if timeout_s is not None else self._default_timeout_s

        async with self._semaphore:
            return await self._run_container(
                code=code,
                timeout_s=effective_timeout,
                extra_env=extra_env or {},
                working_dir=working_dir,
            )

    async def _run_container(
        self,
        *,
        code: str,
        timeout_s: float,
        extra_env: dict[str, str],
        working_dir: str,
    ) -> SandboxResult:
        container = None
        started_at = time.perf_counter()

        # Encode user code as base64 to avoid shell-escaping issues
        encoded_script = base64.b64encode(code.encode()).decode()

        env: dict[str, str] = {
            **self._extra_env,
            **extra_env,
            "__GENESIS_SCRIPT": encoded_script,
        }

        # Build the container command: python executes the bootstrap
        bootstrap_b64 = base64.b64encode(_BOOTSTRAP_TEMPLATE.encode()).decode()
        command = [
            "python",
            "-c",
            (
                f"import base64, os; "
                f"exec(base64.b64decode(\'{bootstrap_b64}\').decode())"
            ),
        ]

        loop = asyncio.get_event_loop()
        try:
            container = await loop.run_in_executor(
                None,
                lambda: self._client.containers.run(  # type: ignore[union-attr]
                    image=self._image,
                    command=command,
                    environment=env,
                    working_dir=working_dir,
                    # ── Security constraints ─────────────────────────────
                    network_mode="none",
                    mem_limit=self._mem_limit,
                    memswap_limit=self._mem_limit,
                    nano_cpus=self._nano_cpus,
                    pids_limit=self._pids_limit,
                    cap_drop=["ALL"],
                    security_opt=["no-new-privileges:true"],
                    read_only=True,
                    # ── Lifecycle flags ──────────────────────────────────
                    detach=True,
                    auto_remove=False,
                    remove=False,
                    stdout=True,
                    stderr=True,
                ),
            )
        except docker.errors.ImageNotFound:  # type: ignore[union-attr]
            raise ContainerStartError(
                f"Sandbox image not found: {self._image!r}. "
                f"Set GENESIS_SANDBOX_PULL=true or pull manually: docker pull {self._image}"
            )
        except docker.errors.APIError as exc:  # type: ignore[union-attr]
            raise ContainerStartError(
                f"Docker API error starting container: {exc}",
                cause=exc,
            ) from exc
        except Exception as exc:
            raise ContainerStartError(
                f"Unexpected error starting sandbox container: {exc}",
                cause=exc,
            ) from exc

        # ── Wait for completion with timeout ───────────────────────────────
        timed_out = False
        exit_code = -1
        stdout_bytes = b""
        stderr_bytes = b""

        try:
            result_dict = await asyncio.wait_for(
                loop.run_in_executor(None, container.wait),
                timeout=timeout_s,
            )
            exit_code = result_dict.get("StatusCode", -1)

        except asyncio.TimeoutError:
            timed_out = True
            self._stats.timeouts += 1
            _log.warning(
                "sandbox_timeout timeout_s=%.1f container=%s code_preview=%r",
                timeout_s, container.id[:12], code[:80],
            )

        finally:
            # ── Unconditional cleanup — never skip ─────────────────────────
            try:
                stdout_bytes = await loop.run_in_executor(
                    None,
                    # type: ignore[possibly-undefined]
                    lambda: container.logs(stdout=True, stderr=False),
                )
            except Exception as exc:
                _log.debug("sandbox_stdout_fetch_failed error=%s", exc)

            try:
                stderr_bytes = await loop.run_in_executor(
                    None,
                    # type: ignore[possibly-undefined]
                    lambda: container.logs(stdout=False, stderr=True),
                )
            except Exception as exc:
                _log.debug("sandbox_stderr_fetch_failed error=%s", exc)

            leaked = False
            try:
                await loop.run_in_executor(
                    None,
                    lambda: container.stop(timeout=3),  # type: ignore[possibly-undefined]
                )
            except Exception as exc:
                _log.debug("sandbox_stop_failed error=%s", exc)
                leaked = True

            try:
                await loop.run_in_executor(
                    None,
                    lambda: container.remove(force=True),  # type: ignore[possibly-undefined]
                )
                leaked = False
            except Exception as exc:
                _log.warning("sandbox_remove_failed error=%s", exc)
                leaked = True

            if leaked:
                self._stats.containers_leaked += 1
                _log.error(
                    "sandbox_container_leaked container=%s hint='docker rm -f <id>'",
                    container.id[:12],  # type: ignore[possibly-undefined]
                )

        duration_s = time.perf_counter() - started_at

        self._stats.executions += 1
        self._stats.total_duration_s += duration_s
        if not timed_out and exit_code != 0:
            self._stats.errors += 1

        result = SandboxResult(
            exit_code=1 if timed_out else exit_code,
            stdout=stdout_bytes.decode(errors="replace"),
            stderr=stderr_bytes.decode(errors="replace"),
            duration_s=round(duration_s, 4),
            image=self._image,
            timed_out=timed_out,
            container_id=container.id[:12] if container else None,
        )

        if timed_out:
            raise ExecutionTimeoutError(
                timeout_s=timeout_s,
                code_preview=code[:120],
            )

        _log.info(
            "sandbox_execution_complete exit_code=%d duration_s=%.4f timed_out=%s",
            result.exit_code, result.duration_s, result.timed_out,
        )
        return result

    # ── Batch execution ────────────────────────────────────────────────────

    async def execute_batch(
        self,
        code_blocks: list[str],
        *,
        timeout_s: float | None = None,
        stop_on_error: bool = False,
    ) -> list[SandboxResult | Exception]:
        """
        Execute multiple code blocks, respecting max_concurrent.
        Returns a list parallel to code_blocks — each element is either a
        SandboxResult or the exception that was raised.
        """
        results: list[SandboxResult | Exception] = []

        async def _run_one(code: str) -> SandboxResult | Exception:
            try:
                return await self.execute(code, timeout_s=timeout_s)
            except Exception as exc:
                return exc

        if stop_on_error:
            for block in code_blocks:
                outcome = await _run_one(block)
                results.append(outcome)
                if isinstance(
                        outcome,
                        Exception) and not isinstance(
                        outcome,
                        ExecutionTimeoutError):
                    break
        else:
            coros = [_run_one(b) for b in code_blocks]
            outcomes = await asyncio.gather(*coros, return_exceptions=False)
            results.extend(outcomes)

        return results

    # ── Diagnostics ────────────────────────────────────────────────────────

    def stats(self) -> dict[str, Any]:
        avg_dur = (
            self._stats.total_duration_s / self._stats.executions
            if self._stats.executions > 0
            else 0.0
        )
        return {
            "executions": self._stats.executions,
            "timeouts": self._stats.timeouts,
            "errors": self._stats.errors,
            "containers_leaked": self._stats.containers_leaked,
            "avg_duration_s": round(avg_dur, 4),
            "image": self._image,
            "mem_limit": self._mem_limit,
            "nano_cpus": self._nano_cpus,
            "max_concurrent": self._max_concurrent,
        }

    async def ping(self) -> bool:
        """Return True if Docker daemon is reachable."""
        await self._ensure_initialised()
        loop = asyncio.get_event_loop()
        try:
            await loop.run_in_executor(None, self._client.ping)  # type: ignore[union-attr]
            return True
        except Exception:
            return False
