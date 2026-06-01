"""
ARQ worker entry point.

Run with:
    python -m arq genesis_swarm.workers.worker.WorkerSettings

Or via the CLI helper registered in pyproject.toml:
    genesis-worker
"""
from __future__ import annotations

import os

from arq.connections import RedisSettings

from .tasks import (
    deliver_webhook_event,
    reload_ofac_sdn,
    send_alert_email,
    send_slack_alert,
)

_redis_url = os.getenv("GENESIS_REDIS_URL", "redis://localhost:6379/0")


class WorkerSettings:
    """ARQ worker configuration.

    One worker process handles all task types.  Scale horizontally by running
    multiple worker replicas — ARQ uses Redis BLPOP so tasks are distributed
    automatically without coordination overhead.
    """

    # ── Registered task functions ─────────────────────────────────────────────
    functions = [
        send_alert_email,
        send_slack_alert,
        deliver_webhook_event,
        reload_ofac_sdn,
    ]

    # ── Redis connection ──────────────────────────────────────────────────────
    redis_settings = RedisSettings.from_dsn(_redis_url)

    # ── Retries ───────────────────────────────────────────────────────────────
    # Default retry policy: up to 3 attempts, 5 s initial delay, exponential
    max_tries = 3
    retry_delay = 5           # seconds

    # ── Concurrency ───────────────────────────────────────────────────────────
    # Each worker process runs up to 10 tasks concurrently.  Increase for
    # I/O-bound tasks (webhook delivery); keep low for CPU-bound ones.
    max_jobs = 10

    # ── Health ────────────────────────────────────────────────────────────────
    health_check_interval = 30          # seconds between Redis PING checks
    health_check_key = "genesis:worker:health"

    # ── Scheduled tasks (cron-like) ───────────────────────────────────────────
    # Reload OFAC SDN list every 6 hours so the screener always has fresh data
    # without requiring a process restart.
    cron_jobs = [
        # arq.cron takes (coroutine, *, hour, minute, second, weekday, month)
        # Run at :00 on hours 0, 6, 12, 18 UTC
        {
            "coroutine": reload_ofac_sdn,
            "hour": {0, 6, 12, 18},
            "minute": 0,
            "unique": True,
        }
    ]
