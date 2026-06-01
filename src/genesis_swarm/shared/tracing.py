"""
OpenTelemetry tracing for Genesis Swarm.

Instruments:
  - PBFT consensus rounds (span per round, per phase)
  - Bot cycle spans
  - Alert dispatch spans

Configure OTLP exporter:
  OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4317
  OTEL_SERVICE_NAME=genesis-swarm

If OTEL is not installed or the exporter is not configured, all tracing
calls are silently no-ops (using the OTEL NoOp tracer).

Usage in bot code:
    from genesis_swarm.shared.tracing import tracer, record_bot_cycle

    with tracer.start_as_current_span("pbft_round") as span:
        span.set_attribute("pbft.view", view)
        span.set_attribute("pbft.seq", seq)
        ...
"""

from __future__ import annotations

import contextlib
import os
from typing import Any, Generator

try:
    from opentelemetry import trace
    from opentelemetry.sdk.resources import SERVICE_NAME, Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter

    _provider = TracerProvider(
        resource=Resource.create(
            {
                SERVICE_NAME: os.getenv("OTEL_SERVICE_NAME", "genesis-swarm"),
            }
        )
    )

    _endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")
    if _endpoint:
        try:
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

            _provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=_endpoint)))
        except ImportError:
            try:
                from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
                    OTLPSpanExporter as OTLPHttp,
                )

                _provider.add_span_processor(BatchSpanProcessor(OTLPHttp(endpoint=_endpoint)))
            except ImportError:
                pass
    elif os.getenv("OTEL_CONSOLE_EXPORT", "").lower() in ("1", "true"):
        _provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))

    trace.set_tracer_provider(_provider)
    tracer = trace.get_tracer("genesis_swarm", "0.5.0")
    _OTEL_OK = True

except ImportError:
    # OTel not installed — use NoOp tracer
    _OTEL_OK = False

    class _NoOpSpan:
        def set_attribute(self, *a, **kw):
            pass

        def record_exception(self, *a, **kw):
            pass

        def set_status(self, *a, **kw):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            pass

    class _NoOpTracer:
        @contextlib.contextmanager
        def start_as_current_span(self, name: str, **kwargs) -> Generator[_NoOpSpan, None, None]:
            yield _NoOpSpan()

    tracer = _NoOpTracer()  # type: ignore[assignment]


# ── Convenience context managers ───────────────────────────────────────────────


@contextlib.contextmanager
def pbft_round_span(transaction_id: str, view: int, seq: int) -> Generator[Any, None, None]:
    """Span wrapping a full PBFT round (all three phases)."""
    with tracer.start_as_current_span("pbft.round") as span:
        span.set_attribute("pbft.transaction_id", transaction_id)
        span.set_attribute("pbft.view", view)
        span.set_attribute("pbft.seq", seq)
        yield span


@contextlib.contextmanager
def pbft_phase_span(phase: str, view: int, seq: int) -> Generator[Any, None, None]:
    """Span for a single PBFT phase (pre_prepare / prepare / commit)."""
    with tracer.start_as_current_span(f"pbft.{phase}") as span:
        span.set_attribute("pbft.phase", phase)
        span.set_attribute("pbft.view", view)
        span.set_attribute("pbft.seq", seq)
        yield span


@contextlib.contextmanager
def bot_cycle_span(bot_type: str, cycle: int = 0) -> Generator[Any, None, None]:
    """Span wrapping a single bot monitoring cycle."""
    with tracer.start_as_current_span("bot.cycle") as span:
        span.set_attribute("bot.type", bot_type)
        span.set_attribute("bot.cycle", cycle)
        yield span


@contextlib.contextmanager
def alert_dispatch_span(bot_type: str, severity: str, score: float) -> Generator[Any, None, None]:
    """Span wrapping alert dispatch (email + Slack + webhook)."""
    with tracer.start_as_current_span("alert.dispatch") as span:
        span.set_attribute("alert.bot_type", bot_type)
        span.set_attribute("alert.severity", severity)
        span.set_attribute("alert.score", score)
        yield span
