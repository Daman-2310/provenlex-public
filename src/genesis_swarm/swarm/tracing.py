"""
OpenTelemetry orchestration & distributed tracing — Pillar 2.

Provides a per-agent ``SwarmTracer`` facade that:
  - Creates OTel spans with agent_id and tenant_id bound to every span
  - Injects W3C traceparent headers into MeshEnvelope for cross-node tracing
  - Exports task counters and latency histograms to a Prometheus /metrics endpoint

When opentelemetry-sdk or opentelemetry-exporter-prometheus are not installed,
all operations degrade to no-ops so the swarm continues running unobserved.

Relation to shared/tracing.py
------------------------------
``shared/tracing.py`` provides a lightweight module-level tracer used by PBFT
and bot code.  This module provides the higher-level ``SwarmTracer`` with
per-agent bindings, Prometheus metrics, and W3C context propagation.
``configure_tracing()`` here upgrades the shared TracerProvider to use a
BatchSpanProcessor + OTLP exporter.

Env vars
--------
GENESIS_TRACING_ENABLED          true (default) | false
OTEL_EXPORTER_OTLP_ENDPOINT      http://localhost:4317
GENESIS_PROMETHEUS_PORT           9090 (default)

Usage
-----
    from genesis_swarm.swarm.tracing import SwarmTracer, configure_tracing

    configure_tracing()  # once at startup

    tracer = SwarmTracer(agent_id="compliance-bot", tenant_id="acme-fund")

    with tracer.span("evaluate_case", attributes={"case.id": "C-001"}) as span:
        span.set_attribute("risk_score", 0.92)
        traceparent = tracer.current_traceparent()
        envelope = mesh.make_envelope("alerts", payload, traceparent=traceparent)
        await mesh.publish("alerts", envelope)

    # On the receiving node — restores upstream trace context:
    with tracer.span("handle_alert", remote_context=envelope.traceparent):
        ...
"""

from __future__ import annotations

import logging
import os
import time
from contextlib import contextmanager
from typing import Any, Generator

_log = logging.getLogger(__name__)

# ── Optional OTel core ────────────────────────────────────────────────────────

try:
    from opentelemetry import context as _otel_ctx
    from opentelemetry import trace as _trace_api
    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider as _SDKTracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

    _OTEL_AVAILABLE = True
except ImportError:
    _OTEL_AVAILABLE = False

# ── Optional Prometheus metrics exporter ──────────────────────────────────────

try:
    from opentelemetry.exporter.prometheus import PrometheusMetricReader
    from opentelemetry.metrics import get_meter_provider as _get_meter_provider
    from opentelemetry.metrics import set_meter_provider as _set_meter_provider
    from opentelemetry.sdk.metrics import MeterProvider as _SDKMeterProvider
    from prometheus_client import start_http_server as _prom_start_http

    _PROMETHEUS_AVAILABLE = True
except ImportError:
    _PROMETHEUS_AVAILABLE = False

# ── Module-level singletons populated by configure_tracing() ─────────────────

_tracer_provider: Any = None
_propagator: Any = None
_task_counter: Any = None
_task_failure_counter: Any = None
_latency_histogram: Any = None
_token_counter: Any = None
_tracing_configured: bool = False
_prom_started: bool = False


def configure_tracing(
    *,
    service_name: str = "genesis-swarm",
    otlp_endpoint: str | None = None,
    prometheus_port: int | None = None,
    enabled: bool | None = None,
) -> None:
    """
    Idempotent one-time tracing and metrics setup.

    Sets up a ``TracerProvider`` with ``BatchSpanProcessor → OTLP`` export and,
    when opentelemetry-exporter-prometheus is available, a Prometheus scrape
    endpoint for live metrics.

    Safe to call multiple times — only the first call has effect.
    """
    global _tracing_configured, _tracer_provider, _propagator
    global _task_counter, _task_failure_counter, _latency_histogram, _token_counter
    global _prom_started

    if _tracing_configured:
        return
    _tracing_configured = True

    if enabled is None:
        enabled = os.getenv("GENESIS_TRACING_ENABLED", "true").lower() == "true"

    if not enabled or not _OTEL_AVAILABLE:
        _log.info(
            "tracing_noop",
            extra={
                "enabled": enabled,
                "otel_available": _OTEL_AVAILABLE,
                "hint": "pip install opentelemetry-sdk to enable distributed tracing",
            },
        )
        return

    endpoint = otlp_endpoint or os.getenv(
        "OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317"
    )
    resource = Resource.create(
        {"service.name": service_name, "service.version": "0.5.0"}
    )

    # ── Tracer provider ───────────────────────────────────────────────────────
    provider: _SDKTracerProvider = _SDKTracerProvider(resource=resource)
    exporter = OTLPSpanExporter(endpoint=endpoint, insecure=True)
    provider.add_span_processor(BatchSpanProcessor(exporter))
    _trace_api.set_tracer_provider(provider)
    _tracer_provider = provider
    _propagator = TraceContextTextMapPropagator()

    # ── Prometheus meter + metrics ────────────────────────────────────────────
    if _PROMETHEUS_AVAILABLE:
        prom_port = prometheus_port or int(os.getenv("GENESIS_PROMETHEUS_PORT", "9090"))
        reader = PrometheusMetricReader()
        meter_provider = _SDKMeterProvider(resource=resource, metric_readers=[reader])
        _set_meter_provider(meter_provider)
        meter = _get_meter_provider().get_meter("genesis_swarm", version="0.5.0")

        _task_counter = meter.create_counter(
            "swarm_tasks_total",
            unit="1",
            description="Total agent task executions",
        )
        _task_failure_counter = meter.create_counter(
            "swarm_task_failures_total",
            unit="1",
            description="Total failed agent task executions",
        )
        _latency_histogram = meter.create_histogram(
            "swarm_task_duration_ms",
            unit="ms",
            description="Agent task duration in milliseconds",
        )
        _token_counter = meter.create_counter(
            "swarm_tokens_consumed_total",
            unit="1",
            description="Total LLM tokens consumed across all agents",
        )

        if not _prom_started:
            try:
                _prom_start_http(prom_port)
                _prom_started = True
                _log.info("prometheus_scrape_started", extra={"port": prom_port})
            except OSError:
                _log.warning(
                    "prometheus_port_unavailable",
                    extra={"port": prom_port, "hint": "port already in use"},
                )

    _log.info(
        "tracing_configured",
        extra={"endpoint": endpoint, "prometheus": _PROMETHEUS_AVAILABLE},
    )


# ── No-op span ────────────────────────────────────────────────────────────────


class _NoOpSpan:
    """Sentinel span used when OTel is unavailable or disabled."""

    def set_attribute(self, key: str, value: Any) -> None:
        pass

    def record_exception(self, exc: BaseException) -> None:
        pass

    def set_status(self, status: Any, description: str = "") -> None:
        pass

    def add_event(self, name: str, attributes: dict[str, Any] | None = None) -> None:
        pass


# ── Internal metric helpers ───────────────────────────────────────────────────


def _inc_task(agent_id: str, tenant_id: str, operation: str) -> None:
    if _task_counter is not None:
        _task_counter.add(
            1,
            {"agent.id": agent_id, "tenant.id": tenant_id, "operation": operation},
        )


def _inc_failure(agent_id: str, tenant_id: str, operation: str) -> None:
    if _task_failure_counter is not None:
        _task_failure_counter.add(
            1,
            {"agent.id": agent_id, "tenant.id": tenant_id, "operation": operation},
        )


def _record_latency(
    agent_id: str, tenant_id: str, operation: str, elapsed_ms: float
) -> None:
    if _latency_histogram is not None:
        _latency_histogram.record(
            elapsed_ms,
            {"agent.id": agent_id, "tenant.id": tenant_id, "operation": operation},
        )


# ── SwarmTracer ───────────────────────────────────────────────────────────────


class SwarmTracer:
    """
    Per-agent OpenTelemetry facade.

    Binds ``agent_id`` and ``tenant_id`` to every span and metric data-point.
    Provides W3C traceparent injection and extraction helpers for cross-process
    trace context propagation through ``MeshEnvelope.traceparent``.

    Parameters
    ----------
    agent_id:
        Unique agent identifier; bound to every span as ``agent.id``.
    tenant_id:
        Tenant partition; bound to every span as ``tenant.id``.
    """

    def __init__(self, agent_id: str, tenant_id: str = "default") -> None:
        self._agent_id = agent_id
        self._tenant_id = tenant_id
        self._tracer: Any = (
            _trace_api.get_tracer(f"genesis_swarm.{agent_id}")
            if _OTEL_AVAILABLE and _tracer_provider is not None
            else None
        )

    @contextmanager
    def span(
        self,
        operation: str,
        *,
        attributes: dict[str, Any] | None = None,
        remote_context: str | None = None,
    ) -> Generator[Any, None, None]:
        """
        Context manager creating an OTel span for *operation*.

        Parameters
        ----------
        operation:
            Span name, e.g. ``"evaluate_case"`` or ``"dispatch_to_mesh"``.
        attributes:
            Extra span attributes merged with ``agent.id`` and ``tenant.id``.
        remote_context:
            W3C ``traceparent`` string extracted from an inbound MeshEnvelope.
            Pass this to stitch the current span into the upstream trace so the
            full cross-machine call graph is visible in your trace backend.
        """
        start_ns = time.perf_counter_ns()
        merged: dict[str, Any] = {
            "agent.id": self._agent_id,
            "tenant.id": self._tenant_id,
        }
        if attributes:
            merged.update(attributes)

        if self._tracer is None:
            yield _NoOpSpan()
            return

        ctx = _otel_ctx.get_current()
        if remote_context and _propagator is not None:
            ctx = _propagator.extract({"traceparent": remote_context})  # type: ignore[arg-type]

        with self._tracer.start_as_current_span(
            operation, context=ctx, attributes=merged
        ) as active_span:
            try:
                yield active_span
            except Exception as exc:
                active_span.record_exception(exc)
                active_span.set_status(
                    _trace_api.StatusCode.ERROR,  # type: ignore[attr-defined]
                    description=str(exc),
                )
                _inc_failure(self._agent_id, self._tenant_id, operation)
                raise
            finally:
                elapsed_ms = (time.perf_counter_ns() - start_ns) / 1_000_000
                _inc_task(self._agent_id, self._tenant_id, operation)
                _record_latency(self._agent_id, self._tenant_id, operation, elapsed_ms)

    def current_traceparent(self) -> str | None:
        """
        Serialise the active span context to a W3C traceparent string.

        Returns ``None`` when OTel is unavailable or there is no active span.
        Inject the returned value into ``MeshEnvelope.traceparent`` before
        publishing so downstream agents can restore the full trace lineage.
        """
        if not _OTEL_AVAILABLE or _propagator is None:
            return None
        carrier: dict[str, str] = {}
        _propagator.inject(carrier)  # type: ignore[arg-type]
        return carrier.get("traceparent")

    def record_tokens(self, count: int, *, model: str = "unknown") -> None:
        """Record LLM token usage against the global ``swarm_tokens_consumed_total`` counter."""
        if _token_counter is not None:
            _token_counter.add(
                count,
                {
                    "agent.id": self._agent_id,
                    "tenant.id": self._tenant_id,
                    "model": model,
                },
            )
