from __future__ import annotations

import asyncio
import logging
import time
from collections import deque

from .feed_sentinel import FeedSentinel
from .memory_guardian import MemoryGuardian

log = logging.getLogger(__name__)


class RemediationOrchestrator:
    """
    Top-level controller for all autonomous remediation workflows.

    Coordinates:
      - MemoryGuardian: detects RSS spikes, triggers GC / bot restarts
      - FeedSentinel:   detects feed failures, reroutes traffic to backups

    Provides a unified API consumed by the dashboard and commander.
    Publishes all remediation events to the message bus.
    """

    def __init__(self, bots, bus, alerter, auditor):
        self._bots = bots
        self._bus = bus
        self._alerter = alerter
        self._auditor = auditor
        self._running = False

        self.memory_guardian = MemoryGuardian(bots, bus, alerter, auditor)
        self.feed_sentinel = FeedSentinel(bots, bus, alerter)

        # Raw bus event log for the dashboard "live feed"
        self._event_log: deque[dict] = deque(maxlen=500)

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        self._running = True
        log.info("[Remediation] Orchestrator online — MemoryGuardian + FeedSentinel active")

        await self._bus.subscribe("remediation.*", self._on_event)

        await asyncio.gather(
            self.memory_guardian.run(),
            self.feed_sentinel.run(),
            self._status_loop(),
        )

    def stop(self) -> None:
        self._running = False

    # ── Event ingestion ────────────────────────────────────────────────────────

    async def _on_event(self, topic: str, payload: dict) -> None:
        entry = {"topic": topic, "ts": time.time(), **payload}
        self._event_log.appendleft(entry)
        log.info("[Remediation] ← %s | wf=%s", topic, payload.get("workflow_id", "-"))

    async def _status_loop(self) -> None:
        """Periodic health summary log."""
        while self._running:
            await asyncio.sleep(60)
            status = self.get_status()
            log.info(
                "[Remediation] Status — mem: %.0fMB (%s) | feeds: %d healthy / %d rerouted | "
                "workflows: %d active, %d total",
                status["memory_mb"],
                status["memory_status"],
                status["healthy_feeds"],
                status["rerouted_feeds"],
                status["active_workflows"],
                status["total_workflows"],
            )

    # ── Demo injection API ─────────────────────────────────────────────────────

    async def demo_memory_spike(self, severity: str = "HIGH") -> dict:
        """Inject a synthetic memory spike for demo/showcase purposes."""
        log.info("[Remediation] Injecting demo memory spike (%s)", severity)
        await self.memory_guardian.inject_spike(severity)
        return {"injected": "memory_spike", "severity": severity}

    async def demo_feed_failure(self, feed_id: str = "ecb_rates") -> dict:
        """Inject a synthetic feed failure for demo/showcase purposes."""
        log.info("[Remediation] Injecting demo feed failure: %s", feed_id)
        await self.feed_sentinel.inject_failure(feed_id)
        return {"injected": "feed_failure", "feed_id": feed_id}

    async def demo_feed_restore(self, feed_id: str = "ecb_rates") -> dict:
        """Inject a synthetic feed restore for demo/showcase purposes."""
        await self.feed_sentinel.inject_restore(feed_id)
        return {"injected": "feed_restore", "feed_id": feed_id}

    # ── Public status API ─────────────────────────────────────────────────────

    def get_status(self) -> dict:
        mem_mb = self.memory_guardian.current_mb()
        feeds = self.feed_sentinel.get_feed_status()
        mem_wfs = self.memory_guardian.get_report(20)
        feed_wfs = self.feed_sentinel.get_report(20)

        all_wfs = sorted(
            mem_wfs + feed_wfs,
            key=lambda w: w["started_at"],
            reverse=True,
        )[:30]

        active_wfs = [w for w in all_wfs if w["stage"] not in ("COMPLETE", "FAILED", "ESCALATED")]

        healthy_feeds = sum(1 for s in feeds.values() if s["status"] == "HEALTHY")
        rerouted_feeds = sum(1 for s in feeds.values() if s["status"] == "REROUTED")
        failed_feeds = sum(1 for s in feeds.values() if s["status"] == "FAILED")

        return {
            "memory_mb": mem_mb,
            "memory_trend": self.memory_guardian.mb_trend(),
            "memory_status": (
                "CRITICAL"
                if mem_mb >= 600
                else "HIGH" if mem_mb >= 450 else "WARN" if mem_mb >= 300 else "OK"
            ),
            "feeds": feeds,
            "healthy_feeds": healthy_feeds,
            "rerouted_feeds": rerouted_feeds,
            "failed_feeds": failed_feeds,
            "total_workflows": len(all_wfs),
            "active_workflows": len(active_wfs),
            "workflows": all_wfs,
        }

    def get_recent_events(self, n: int = 20) -> list[dict]:
        return list(self._event_log)[:n]
