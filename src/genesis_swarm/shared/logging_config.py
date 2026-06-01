"""
Structured JSON logging for Genesis Swarm.

Call configure_logging() once at process startup (main.py / cloud_app startup).
All loggers then emit JSON lines compatible with Datadog, Grafana Loki, and ELK.

Context binding
---------------
Use bind_log_context() inside request handlers or bot cycles to attach
persistent key-value pairs to every log line emitted in that coroutine:

    with bind_log_context(bot_id="CARGO_BOT", round_id="A3F2"):
        log.info("cycle_complete", score=42.1)
    # → {"bot_id": "CARGO_BOT", "round_id": "A3F2", "event": "cycle_complete", ...}

Usage
-----
    from genesis_swarm.shared.logging_config import configure_logging, get_logger
    configure_logging(level="INFO")
    log = get_logger(__name__)
    log.info("server_started", host="0.0.0.0", port=8080)
"""

from __future__ import annotations

import contextlib
import logging
import os
import sys
from collections.abc import Generator
from typing import Any

try:
    import structlog

    _STRUCTLOG_OK = True
except ImportError:
    _STRUCTLOG_OK = False


def configure_logging(
    level: str | None = None,
    json_output: bool | None = None,
) -> None:
    """Configure root logging. Safe to call multiple times — idempotent."""
    log_level_str = (level or os.getenv("LOG_LEVEL", "INFO")).upper()
    log_level = getattr(logging, log_level_str, logging.INFO)

    use_json = (
        json_output
        if json_output is not None
        else os.getenv("LOG_FORMAT", "json").lower() == "json"
    )

    if _STRUCTLOG_OK:
        _configure_structlog(log_level, use_json)
    else:
        _configure_stdlib(log_level, use_json)

    # Reduce noise from third-party libraries
    _quiet_loggers = {
        "uvicorn.access": logging.WARNING,
        "uvicorn.error": logging.WARNING,
        "httpx": logging.WARNING,
        "httpcore": logging.WARNING,
        "hpack": logging.WARNING,
        "asyncio": logging.WARNING,
        "websockets": logging.WARNING,
        "grpc": logging.WARNING,
        "aiohttp.access": logging.WARNING,
    }
    for name, lvl in _quiet_loggers.items():
        logging.getLogger(name).setLevel(lvl)


def _configure_structlog(log_level: int, use_json: bool) -> None:
    shared_processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.ExceptionRenderer(),
    ]

    renderer: Any = (
        structlog.processors.JSONRenderer()
        if use_json
        else structlog.dev.ConsoleRenderer(colors=True)
    )

    structlog.configure(
        processors=shared_processors + [structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
        foreign_pre_chain=shared_processors,
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(log_level)


def _configure_stdlib(log_level: int, use_json: bool) -> None:
    if use_json:
        fmt = (
            '{"ts":"%(asctime)s","level":"%(levelname)s",'
            '"logger":"%(name)s","event":%(message)r}'
        )
    else:
        fmt = "%(asctime)s %(levelname)-8s [%(name)s] %(message)s"

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(fmt))

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(log_level)


def get_logger(name: str) -> Any:
    """Return a structlog or stdlib logger bound to *name*."""
    if _STRUCTLOG_OK:
        return structlog.get_logger(name)
    return logging.getLogger(name)


@contextlib.contextmanager
def bind_log_context(**kwargs: Any) -> Generator[None, None, None]:
    """
    Context manager that binds key-value pairs to every log line emitted
    within its scope (coroutine-safe via structlog contextvars).

    Usage:
        async def handle_round(round_id: str) -> None:
            with bind_log_context(round_id=round_id, node="replica-0"):
                log.info("round_started")          # includes round_id + node
                await do_pbft_phase()
                log.info("round_complete")          # includes round_id + node
    """
    if _STRUCTLOG_OK:
        token = structlog.contextvars.bind_contextvars(**kwargs)
        try:
            yield
        finally:
            structlog.contextvars.reset_contextvars(**{k: token for k in kwargs})
    else:
        # Stdlib fallback: no-op context (fields not auto-injected without structlog)
        yield
