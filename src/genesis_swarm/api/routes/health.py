from __future__ import annotations

import os
import time

import aiosqlite
from fastapi import APIRouter, Response
from fastapi.responses import JSONResponse

from ..state import _metrics_state, _state

_DB_PATH = os.getenv("GENESIS_CASE_DB_PATH", "cases.db")

router = APIRouter()


@router.get("/api/health", summary="Liveness check", tags=["health"])
def health():
    """Simple liveness probe — returns HTTP 200 if the process is alive."""
    return {"ok": True, "ts": time.time(), "version": "0.5.0"}


@router.get("/api/health/slo", summary="SLO / readiness summary", tags=["health"])
def health_slo():
    """
    SLO readiness probe.
    Returns detailed health including consensus latency percentiles,
    bot health fraction, and alert backlog.
    """
    commander = _state.get("commander")
    latencies = list(_state.get("consensus_latency_ms", []))
    latencies.sort()

    def _pct(data, p):
        if not data:
            return None
        return round(data[max(0, int(len(data) * p / 100) - 1)], 2)

    n_bots = 0
    healthy = 0
    if commander:
        try:
            s = commander.get_summary()
            n_bots = s.total_bots
            healthy = s.healthy_bots
        except Exception:
            pass

    return {
        "ok": True,
        "version": "0.5.0",
        "ts": time.time(),
        "uptime_seconds": round(time.time() - _state["started_at"]),
        "bots": {
            "total": n_bots,
            "healthy": healthy,
            "health_pct": round(healthy / n_bots * 100, 1) if n_bots else None,
        },
        "consensus": {
            "samples": len(latencies),
            "p50_ms": _pct(latencies, 50),
            "p95_ms": _pct(latencies, 95),
            "p99_ms": _pct(latencies, 99),
        },
        "metrics": dict(_metrics_state),
        "slo_targets": {
            "consensus_p99_ms": 500,
            "bot_health_pct": 90,
        },
    }


@router.get(
    "/api/health/ready",
    summary="Readiness probe — verifies DB, Redis, and consensus quorum",
    tags=["health"],
)
async def health_ready() -> JSONResponse:
    """
    Returns 200 when all critical components are healthy; 503 otherwise.
    Use as the k8s readinessProbe target.
    """
    checks: dict[str, str] = {}
    healthy = True

    # ── Database ──────────────────────────────────────────────────────────────
    try:
        async with aiosqlite.connect(_DB_PATH) as conn:
            await conn.execute("SELECT 1")
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"error: {exc}"
        healthy = False

    # ── Redis ─────────────────────────────────────────────────────────────────
    try:
        from .auth import _get_redis
        r = _get_redis()
        if r is not None:
            r.ping()
            checks["redis"] = "ok"
        else:
            checks["redis"] = "not_configured"
    except Exception as exc:
        checks["redis"] = f"error: {exc}"
        healthy = False

    # ── Consensus quorum ──────────────────────────────────────────────────────
    try:
        from ...consensus.pbft_consensus import QUORUM_COUNT
        commander = _state.get("commander")
        if commander:
            s = commander.get_summary()
            if s.healthy_bots >= QUORUM_COUNT:
                checks["consensus_quorum"] = f"ok ({s.healthy_bots}/{QUORUM_COUNT})"
            else:
                checks["consensus_quorum"] = f"degraded ({s.healthy_bots}/{QUORUM_COUNT} — need {QUORUM_COUNT})"
                healthy = False
        else:
            checks["consensus_quorum"] = "not_started"
    except Exception as exc:
        checks["consensus_quorum"] = f"error: {exc}"

    return JSONResponse(
        content={"ready": healthy, "checks": checks, "ts": time.time()},
        status_code=200 if healthy else 503,
    )


@router.get("/metrics", include_in_schema=False)
def prometheus_metrics():
    """
    Prometheus text-format metrics endpoint.
    Add to prometheus.yml:
      scrape_configs:
        - job_name: genesis_swarm
          static_configs:
            - targets: ["api:8000"]
    """
    commander = _state.get("commander")
    latencies = sorted(_state.get("consensus_latency_ms", []))

    def _pct(data, p):
        if not data:
            return 0.0
        return data[max(0, int(len(data) * p / 100) - 1)]

    n_bots = healthy = 0
    top_score = 0.0
    if commander:
        try:
            s = commander.get_summary()
            n_bots = s.total_bots
            healthy = s.healthy_bots
            top_score = s.top_score
        except Exception:
            pass

    lines = [
        "# HELP genesis_swarm_up 1 if the swarm is running",
        "# TYPE genesis_swarm_up gauge",
        "genesis_swarm_up 1",
        "",
        "# HELP genesis_swarm_bots_total Total number of registered bots",
        "# TYPE genesis_swarm_bots_total gauge",
        f"genesis_swarm_bots_total {n_bots}",
        "",
        "# HELP genesis_swarm_bots_healthy Number of healthy bots",
        "# TYPE genesis_swarm_bots_healthy gauge",
        f"genesis_swarm_bots_healthy {healthy}",
        "",
        "# HELP genesis_swarm_top_anomaly_score Highest current anomaly score",
        "# TYPE genesis_swarm_top_anomaly_score gauge",
        f"genesis_swarm_top_anomaly_score {top_score:.2f}",
        "",
        "# HELP genesis_swarm_consensus_latency_p50_ms P50 PBFT commit latency",
        "# TYPE genesis_swarm_consensus_latency_p50_ms gauge",
        f"genesis_swarm_consensus_latency_p50_ms {_pct(latencies, 50):.2f}",
        "",
        "# HELP genesis_swarm_consensus_latency_p99_ms P99 PBFT commit latency",
        "# TYPE genesis_swarm_consensus_latency_p99_ms gauge",
        f"genesis_swarm_consensus_latency_p99_ms {_pct(latencies, 99):.2f}",
        "",
        "# HELP genesis_swarm_api_requests_total Total API requests served",
        "# TYPE genesis_swarm_api_requests_total counter",
        f"genesis_swarm_api_requests_total {_metrics_state['api_requests_total']}",
        "",
        "# HELP genesis_swarm_auth_failures_total Total failed login attempts",
        "# TYPE genesis_swarm_auth_failures_total counter",
        f"genesis_swarm_auth_failures_total {_metrics_state['auth_failures_total']}",
        "",
        "# HELP genesis_swarm_alerts_total Total alerts dispatched",
        "# TYPE genesis_swarm_alerts_total counter",
        f"genesis_swarm_alerts_total {_metrics_state['alerts_total']}",
        "",
        "# HELP genesis_swarm_uptime_seconds Process uptime in seconds",
        "# TYPE genesis_swarm_uptime_seconds counter",
        f"genesis_swarm_uptime_seconds {round(time.time() - _state['started_at'])}",
    ]
    return Response(content="\n".join(lines) + "\n", media_type="text/plain; version=0.0.4")


@router.get("/api/startup-error", tags=["health"])
def startup_error():
    """Returns any error that occurred during swarm startup."""
    err = _state.get("startup_error")
    return {"error": err, "has_error": err is not None}
