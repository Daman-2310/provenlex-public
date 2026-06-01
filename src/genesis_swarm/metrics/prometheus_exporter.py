from __future__ import annotations

"""Prometheus metrics for Genesis Swarm.

Tries to import ``prometheus_client``; if the package is absent every class
and function degrades to a no-op so the application keeps running without
Prometheus installed.
"""

import logging

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Conditional import — graceful no-op fallback
# ---------------------------------------------------------------------------

try:
    from prometheus_client import (
        Counter,
        Gauge,
        Histogram,
    )
    from prometheus_client import start_http_server as _prom_start_http_server

    _PROMETHEUS_AVAILABLE = True
except ImportError:  # pragma: no cover
    _PROMETHEUS_AVAILABLE = False
    log.warning(
        "[Metrics] prometheus_client not installed — all metrics are no-ops. "
        "Install with: pip install genesis-swarm[metrics]"
    )

    # ── Stub classes ──────────────────────────────────────────────────────────

    class _Stub:
        """Universal no-op stub for any Prometheus metric."""

        def __init__(self, *args, **kwargs):  # noqa: D107
            pass

        def labels(self, **kwargs):  # noqa: D102
            return self

        def inc(self, amount=1):  # noqa: D102
            pass

        def set(self, value):  # noqa: D102
            pass

        def observe(self, value):  # noqa: D102
            pass

        def time(self):  # noqa: D102
            import contextlib

            return contextlib.nullcontext()

    Counter = Histogram = Gauge = _Stub  # type: ignore[assignment,misc]

    def _prom_start_http_server(port: int, **kwargs) -> None:  # type: ignore[misc]
        log.warning(
            "[Metrics] prometheus_client unavailable — HTTP server not started on port %d", port
        )


# ---------------------------------------------------------------------------
# Metric definitions
# ---------------------------------------------------------------------------


def _make_counter(name: str, doc: str, labels=()) -> object:
    if _PROMETHEUS_AVAILABLE:
        return Counter(name, doc, labels)
    return _Stub()  # type: ignore[return-value]


def _make_histogram(name: str, doc: str, labels=(), buckets=()) -> object:
    if _PROMETHEUS_AVAILABLE:
        kwargs = {"buckets": buckets} if buckets else {}
        return Histogram(name, doc, labels, **kwargs)
    return _Stub()  # type: ignore[return-value]


def _make_gauge(name: str, doc: str, labels=()) -> object:
    if _PROMETHEUS_AVAILABLE:
        return Gauge(name, doc, labels)
    return _Stub()  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# GenesisMetrics singleton
# ---------------------------------------------------------------------------


class GenesisMetrics:
    """Centralised Prometheus metrics registry for the Genesis Swarm.

    Instantiate once at module level (see ``METRICS`` below).  Every component
    imports ``from genesis_swarm.metrics.prometheus_exporter import METRICS``
    and calls the record/update helpers.

    If ``prometheus_client`` is not installed all methods are no-ops and the
    application continues running normally.
    """

    def __init__(self) -> None:
        # ── Counters ──────────────────────────────────────────────────────────
        self._bft_rounds_total = _make_counter(
            "genesis_bft_rounds_total",
            "Total BFT consensus rounds by outcome",
            labels=["outcome"],
        )
        self._pii_masks_total = _make_counter(
            "genesis_pii_masks_total",
            "Total PII masking operations by mask type",
            labels=["mask_type"],
        )
        self._chaos_attacks_total = _make_counter(
            "genesis_chaos_attacks_total",
            "Total chaos-monkey attacks by type and whether they were blocked",
            labels=["attack_type", "blocked"],
        )
        self._rag_queries_total = _make_counter(
            "genesis_rag_queries_total",
            "Total RAG memory queries",
        )

        # ── Histograms ────────────────────────────────────────────────────────
        self._time_to_consensus_seconds = _make_histogram(
            "genesis_time_to_consensus_seconds",
            "Time from first vote to confirmed/rejected consensus outcome",
            buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
        )
        self._nats_latency_ms = _make_histogram(
            "genesis_nats_latency_ms",
            "NATS message round-trip latency in milliseconds",
            buckets=[1, 2, 5, 10, 25, 50, 100, 250, 500],
        )
        self._api_request_seconds = _make_histogram(
            "genesis_api_request_seconds",
            "FastAPI endpoint request duration in seconds",
            labels=["endpoint"],
            buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
        )

        # ── Gauges ────────────────────────────────────────────────────────────
        self._bot_anomaly_score = _make_gauge(
            "genesis_bot_anomaly_score",
            "Current anomaly score per bot type (0–100)",
            labels=["bot_type"],
        )
        self._bot_trust_score = _make_gauge(
            "genesis_bot_trust_score",
            "Current BFT trust score per bot (0–1)",
            labels=["bot_id"],
        )
        self._fear_index = _make_gauge(
            "genesis_fear_index",
            "Swarm-wide fear/risk index (0–100)",
        )
        self._events_per_second = _make_gauge(
            "genesis_events_per_second",
            "Rolling events-per-second throughput across the message bus",
        )
        self._merkle_depth = _make_gauge(
            "genesis_merkle_depth",
            "Current depth of the Merkle audit tree",
        )
        self._active_alerts = _make_gauge(
            "genesis_active_alerts",
            "Number of currently active (unresolved) alerts",
        )
        self._bypass_rate_pct = _make_gauge(
            "genesis_bypass_rate_pct",
            "Shadow bot detection bypass rate in percent (rolling)",
        )

    # ── Counter helpers ───────────────────────────────────────────────────────

    def record_consensus(self, outcome: str, duration_s: float) -> None:
        """Increment the BFT rounds counter and record time-to-consensus.

        Parameters
        ----------
        outcome:
            ``"CONFIRMED"``, ``"REJECTED"``, or ``"INCONCLUSIVE"``.
        duration_s:
            Wall-clock seconds from first vote to final decision.
        """
        self._bft_rounds_total.labels(outcome=outcome).inc()
        self._time_to_consensus_seconds.observe(duration_s)

    def record_pii_mask(self, mask_type: str) -> None:
        """Increment the PII masking counter for a given mask type."""
        self._pii_masks_total.labels(mask_type=mask_type).inc()

    def record_chaos(self, attack_type: str, blocked: bool) -> None:
        """Increment the chaos-attacks counter.

        Parameters
        ----------
        attack_type:
            ``AttackType`` enum value string (e.g. ``"BYZANTINE_VOTE"``).
        blocked:
            Whether the attack was intercepted before reaching its target.
        """
        self._chaos_attacks_total.labels(
            attack_type=attack_type,
            blocked=str(blocked).lower(),
        ).inc()

    def record_rag_query(self) -> None:
        """Increment the RAG query counter by one."""
        self._rag_queries_total.inc()

    # ── Histogram helpers ─────────────────────────────────────────────────────

    def record_consensus_latency(self, ms: float) -> None:
        """Record NATS round-trip latency in milliseconds."""
        self._nats_latency_ms.observe(ms)

    def record_api_request(self, endpoint: str, duration_s: float) -> None:
        """Record a FastAPI request duration.

        Parameters
        ----------
        endpoint:
            Route path string, e.g. ``"/api/consensus/status"``.
        duration_s:
            Request wall-clock duration in seconds.
        """
        self._api_request_seconds.labels(endpoint=endpoint).observe(duration_s)

    # ── Gauge helpers ─────────────────────────────────────────────────────────

    def update_bot_score(self, bot_type: str, score: float) -> None:
        """Set the anomaly score gauge for a bot type."""
        self._bot_anomaly_score.labels(bot_type=bot_type).set(score)

    def update_trust(self, bot_id: str, score: float) -> None:
        """Set the BFT trust score for a specific bot instance."""
        self._bot_trust_score.labels(bot_id=bot_id).set(score)

    def update_fear_index(self, v: float) -> None:
        """Update the swarm-wide fear/risk index."""
        self._fear_index.set(v)

    def update_events_per_second(self, v: float) -> None:
        """Update the rolling events-per-second throughput gauge."""
        self._events_per_second.set(v)

    def update_merkle_depth(self, n: int) -> None:
        """Update the Merkle audit tree depth gauge."""
        self._merkle_depth.set(n)

    def update_alerts(self, n: int) -> None:
        """Set the active-alerts gauge to *n*."""
        self._active_alerts.set(n)

    def update_bypass_rate(self, pct: float) -> None:
        """Update the shadow-bot bypass rate gauge."""
        self._bypass_rate_pct.set(pct)

    # ── HTTP server ───────────────────────────────────────────────────────────

    def start_http_server(self, port: int = 9091) -> None:
        """Start the Prometheus HTTP metrics scrape endpoint.

        Parameters
        ----------
        port:
            TCP port to listen on (default ``9091``).  Prometheus should be
            configured to scrape ``http://<host>:<port>/metrics``.
        """
        _prom_start_http_server(port)
        log.info("[Metrics] Prometheus HTTP server started on port %d", port)


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

METRICS = GenesisMetrics()
