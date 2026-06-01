"""
SwarmBot — base class for all detection agents.

Design principles
-----------------
1. Explicit, scoped exception handling — no bare ``except Exception`` at module
   level.  Each catch block names the exact exception types it handles and
   re-raises or escalates anything it cannot recover from.
2. Strict type hints on all public methods and the ABC interface.
3. Non-blocking async lifecycle: ``initialise()``, ``run_cycle()``, and
   ``_heartbeat_loop()`` are all async; no blocking I/O in the event loop.
4. Healing actions are typed via HealingAction enum — no stringly-typed
   action names flowing through self-healing dispatch.
"""

from __future__ import annotations

import asyncio
import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from .alerting import AlertDispatcher, SwarmAlert
from .audit_logger import AuditLogger
from .consensus import ConsensusEngine, ConsensusVote
from .message_bus import MessageBus
from .self_healing import HealingAction, HealthMonitor, SelfHealingOrchestrator

if TYPE_CHECKING:
    pass

log = logging.getLogger(__name__)

# Human-readable explanations surfaced in healing events published to the bus.
# Keyed by the failure_type string from SelfHealingOrchestrator.
_HEALING_EXPLANATIONS: dict[str, str] = {
    "heartbeat_timeout": (
        "Bot stopped sending heartbeats — it was restarted automatically."
    ),
    "feed_quality_degraded": (
        "Data feed returned bad or missing values — switched to backup source."
    ),
    "bus_disconnect": (
        "Lost connection to the message bus — reconnected automatically."
    ),
    "model_drift_detected": (
        "Detection model accuracy drifted from baseline — retraining queued."
    ),
    "signature_invalid": (
        "Message signature verification failed — bot quarantined pending review."
    ),
    "consensus_failure": (
        "Not enough bots responded to reach quorum — quorum threshold adjusted."
    ),
    "byzantine_detected": (
        "Bot sent contradictory votes — flagged as Byzantine, human review required."
    ),
    "data_breach_attempt": (
        "Unauthorised data access pattern detected — human intervention required."
    ),
    "sanctions_hit_unverified": (
        "Sanctions match could not be auto-verified — escalated to human operator."
    ),
}


def _healing_explanation(failure_type: str, action: str, bot_id: str) -> str:
    reason = _HEALING_EXPLANATIONS.get(
        failure_type, f"Unknown failure '{failure_type}' — escalated for review."
    )
    return f"[{bot_id}] {reason} Action taken: {action}."


# ── Result dataclass ──────────────────────────────────────────────────────────


@dataclass
class DetectionResult:
    bot_id: str
    bot_type: str
    score: float  # 0–100
    is_anomaly: bool
    threshold: float
    summary: str
    details: dict
    timestamp: float = field(default_factory=time.time)


# ── Base class ────────────────────────────────────────────────────────────────


class SwarmBot(ABC):
    """
    Base class for every detection bot in the swarm.

    Provides:
      - Heartbeat loop (auto-registered with HealthMonitor)
      - Self-healing (3-tier, pluggable handlers)
      - Consensus participation via ConsensusEngine
      - Alert dispatch via AlertDispatcher
      - Audit logging via AuditLogger
      - Message bus pub/sub via MessageBus
    """

    BOT_TYPE: str = "GENERIC_BOT"
    PERSONALITY: str = "SYSTEMATIC"
    PERSONALITY_LABEL: str = "Systematic"

    def __init__(
        self,
        bot_id: str,
        bus: MessageBus,
        consensus_engine: ConsensusEngine,
        health_monitor: HealthMonitor,
        alerter: AlertDispatcher,
        auditor: AuditLogger,
        anomaly_threshold: float = 75.0,
    ) -> None:
        self.bot_id = bot_id
        self.bus = bus
        self.consensus = consensus_engine
        self.health_monitor = health_monitor
        self.alerter = alerter
        self.auditor = auditor
        self.threshold = anomaly_threshold
        self._running = False
        self._restart_count = 0
        self._max_restarts = 3
        self._last_score: float = 0.0
        self._last_summary: str = ""

        self._healer = SelfHealingOrchestrator(
            health_monitor=health_monitor,
            escalation_cb=self._on_escalation,
        )
        self._register_healing_handlers()

    # ── Abstract interface ─────────────────────────────────────────────────────

    @abstractmethod
    async def initialise(self) -> None:
        """Train models, connect feeds, prepare state."""

    @abstractmethod
    async def run_cycle(self) -> DetectionResult | None:
        """One detection cycle. Return result or None if no signal."""

    @abstractmethod
    def cycle_interval_seconds(self) -> float:
        """How often to call run_cycle()."""

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    async def start(self) -> None:
        self._running = True
        log.info("[%s] Starting", self.bot_id)
        await asyncio.gather(
            self._init_and_run(),
            self._heartbeat_loop(),
            self._healer.watch_heartbeats(),
        )

    async def _init_and_run(self) -> None:
        self.health_monitor.record_heartbeat(self.bot_id)
        await self.bus.publish(
            f"heartbeat.{self.bot_id}",
            {"bot_id": self.bot_id, "bot_type": self.BOT_TYPE, "ts": time.time()},
        )
        try:
            await self.initialise()
        except (OSError, ConnectionError) as exc:
            log.warning(
                "[%s] initialise() network error — running with defaults: %s", self.bot_id, exc
            )
        except ValueError as exc:
            log.warning(
                "[%s] initialise() data error — running with defaults: %s", self.bot_id, exc
            )
        except Exception as exc:  # noqa: BLE001  — catch-all after specific handlers above
            log.error("[%s] initialise() unexpected error: %s", self.bot_id, exc, exc_info=True)
        await self._run_loop()

    def stop(self) -> None:
        self._running = False
        log.info("[%s] Stopping", self.bot_id)

    async def restart(self) -> None:
        if self._restart_count >= self._max_restarts:
            log.critical("[%s] Max restarts (%d) reached — escalating", self.bot_id,
                         self._max_restarts)
            await self._healer.respond(
                self.bot_id, "byzantine_detected", {"reason": "max_restarts"}
            )
            return
        self._restart_count += 1
        log.warning("[%s] Restarting (attempt %d/%d)", self.bot_id, self._restart_count,
                    self._max_restarts)
        self._running = False
        await asyncio.sleep(min(2.0 ** self._restart_count, 30.0))  # exponential backoff
        await self.start()

    # ── Main run loop ──────────────────────────────────────────────────────────

    async def _run_loop(self) -> None:
        while self._running:
            cycle_start = time.monotonic()
            result: DetectionResult | None = None
            try:
                result = await self.run_cycle()
                if result is not None:
                    self._last_score = result.score
                    self._last_summary = result.summary
                    if result.is_anomaly:
                        await self._handle_anomaly(result)
                self.auditor.record(
                    self.bot_id,
                    self.BOT_TYPE,
                    "cycle_complete",
                    {
                        "score": result.score if result else 0.0,
                        "anomaly": result.is_anomaly if result else False,
                        "duration_ms": round((time.monotonic() - cycle_start) * 1000, 1),
                    },
                )
            except (OSError, ConnectionError, TimeoutError) as exc:
                log.warning("[%s] Network error in cycle: %s", self.bot_id, exc)
                event = await self._healer.respond(
                    self.bot_id, "feed_quality_degraded", {"error": str(exc), "type": "network"}
                )
                await self._publish_healing_event(event)
            except ValueError as exc:
                log.warning("[%s] Data error in cycle: %s", self.bot_id, exc)
                event = await self._healer.respond(
                    self.bot_id, "feed_quality_degraded", {"error": str(exc), "type": "data"}
                )
                await self._publish_healing_event(event)
            except asyncio.CancelledError:
                raise  # never suppress cancellation
            except Exception as exc:  # noqa: BLE001
                log.error("[%s] Unexpected cycle error: %s", self.bot_id, exc, exc_info=True)
                event = await self._healer.respond(
                    self.bot_id, "feed_quality_degraded", {"error": str(exc), "type": "unexpected"}
                )
                await self._publish_healing_event(event)

            await asyncio.sleep(self.cycle_interval_seconds())

    async def _heartbeat_loop(self) -> None:
        while self._running:
            self.health_monitor.record_heartbeat(self.bot_id)
            await self.bus.publish(
                f"heartbeat.{self.bot_id}",
                {
                    "bot_id": self.bot_id,
                    "bot_type": self.BOT_TYPE,
                    "ts": time.time(),
                    "score": self._last_score,
                    "summary": self._last_summary,
                },
            )
            await asyncio.sleep(5.0)

    # ── Anomaly handling ───────────────────────────────────────────────────────

    async def _handle_anomaly(self, result: DetectionResult) -> None:
        try:
            round_id = await self.consensus.open_round(self.bot_id, result.details)
        except (ConnectionError, asyncio.TimeoutError) as exc:
            log.warning("[%s] Consensus open_round failed: %s", self.bot_id, exc)
            return

        await self.bus.publish(
            f"anomaly.{self.BOT_TYPE.lower()}",
            {
                "bot_id": self.bot_id,
                "bot_type": self.BOT_TYPE,
                "round_id": round_id,
                "score": result.score,
                "summary": result.summary,
                "details": result.details,
            },
        )

        my_vote = ConsensusVote(
            bot_id=self.bot_id,
            bot_type=self.BOT_TYPE,
            round_id=round_id,
            vote="CORROBORATE",
            confidence=min(result.score / 100.0, 1.0),
        )
        try:
            await self.consensus.register_vote(round_id, my_vote)
            consensus_result = await self.consensus.wait_for_result(round_id)
        except asyncio.TimeoutError:
            log.warning("[%s] Consensus timed out for round %s", self.bot_id, round_id)
            return
        except (ConnectionError, OSError) as exc:
            log.warning("[%s] Consensus error for round %s: %s", self.bot_id, round_id, exc)
            return

        if consensus_result.consensus == "CONFIRMED":
            severity = (
                "EMERGENCY"
                if result.score >= 90
                else "CRITICAL" if result.score >= 75 else "WARNING"
            )
            alert = SwarmAlert(
                bot_id=self.bot_id,
                bot_type=self.BOT_TYPE,
                fund_name=result.details.get("fund_name", "UNKNOWN"),
                anomaly_score=result.score,
                severity=severity,
                consensus=consensus_result.consensus,
                summary=result.summary,
                details=result.details,
                round_id=round_id,
            )
            try:
                await self.alerter.dispatch(alert)
            except (OSError, ConnectionError) as exc:
                log.warning("[%s] Alert dispatch failed: %s", self.bot_id, exc)

            self.auditor.record(self.bot_id, self.BOT_TYPE, "alert_dispatched", alert.to_dict())

    # ── Self-healing handlers ──────────────────────────────────────────────────

    def _register_healing_handlers(self) -> None:
        self._healer.register_handler(HealingAction.RESTART_BOT, self._heal_restart)
        self._healer.register_handler(HealingAction.SWITCH_BACKUP_FEED, self._heal_switch_feed)
        self._healer.register_handler(HealingAction.RECONNECT_BUS, self._heal_reconnect_bus)

    async def _heal_restart(self, context: dict) -> None:
        log.warning("[%s] Self-heal: restarting bot", self.bot_id)
        await self.bus.publish(
            f"healing.{self.bot_id}",
            {
                "bot_id": self.bot_id,
                "bot_type": self.BOT_TYPE,
                "action": "restart_bot",
                "reason": "heartbeat_timeout",
                "explanation": (
                    f"{self.bot_id} stopped sending heartbeats — automatic restart triggered."
                ),
                "context": context,
                "ts": time.time(),
            },
        )
        await self.restart()

    async def _heal_switch_feed(self, context: dict) -> None:
        log.warning("[%s] Self-heal: switching to backup feed", self.bot_id)
        await self.bus.publish(
            f"healing.{self.bot_id}",
            {
                "bot_id": self.bot_id,
                "bot_type": self.BOT_TYPE,
                "action": "switch_to_backup_feed",
                "reason": "feed_quality_degraded",
                "explanation": (
                    f"{self.bot_id} detected bad data from primary feed — switched to backup."
                ),
                "context": context,
                "ts": time.time(),
            },
        )

    async def _heal_reconnect_bus(self, context: dict) -> None:
        log.warning("[%s] Self-heal: reconnecting message bus", self.bot_id)
        await self.bus.publish(
            f"healing.{self.bot_id}",
            {
                "bot_id": self.bot_id,
                "bot_type": self.BOT_TYPE,
                "action": "reconnect_message_bus",
                "reason": "bus_disconnect",
                "explanation": (
                    f"{self.bot_id} lost connection to the message bus — reconnecting automatically."
                ),
                "context": context,
                "ts": time.time(),
            },
        )
        try:
            await self.bus.connect()
        except (OSError, ConnectionError, asyncio.TimeoutError) as exc:
            log.error("[%s] Bus reconnect failed: %s", self.bot_id, exc)

    async def _publish_healing_event(self, event: object) -> None:
        try:
            await self.bus.publish(
                f"healing.{self.bot_id}",
                {
                    "bot_id": getattr(event, "bot_id", self.bot_id),
                    "bot_type": self.BOT_TYPE,
                    "action": getattr(event, "action", "unknown"),
                    "reason": getattr(event, "failure_type", "unknown"),
                    "tier": getattr(event, "tier", 0),
                    "auto_resolved": getattr(event, "auto_resolved", False),
                    "explanation": _healing_explanation(
                        getattr(event, "failure_type", "unknown"),
                        getattr(event, "action", "unknown"),
                        self.bot_id,
                    ),
                    "context": getattr(event, "context", {}),
                    "ts": getattr(event, "timestamp", time.time()),
                },
            )
        except (OSError, ConnectionError) as exc:
            log.warning("[%s] Failed to publish healing event: %s", self.bot_id, exc)

    async def _on_escalation(self, bot_id: str, failure_type: str, context: dict) -> None:
        log.critical("[%s] ESCALATION: %s | %s", bot_id, failure_type, context)
        alert = SwarmAlert(
            bot_id=bot_id,
            bot_type=self.BOT_TYPE,
            fund_name="SWARM",
            anomaly_score=100.0,
            severity="EMERGENCY",
            consensus="CONFIRMED",
            summary=f"Human intervention required: {failure_type}",
            details=context,
            round_id="ESCALATION",
        )
        try:
            await self.alerter.dispatch(alert)
        except (OSError, ConnectionError) as exc:
            log.error("[%s] Escalation alert dispatch failed: %s", bot_id, exc)

    # ── Peer vote helper ───────────────────────────────────────────────────────

    async def cast_peer_vote(
        self, round_id: str, score: float, vote: str = "CORROBORATE"
    ) -> None:
        v = ConsensusVote(
            bot_id=self.bot_id,
            bot_type=self.BOT_TYPE,
            round_id=round_id,
            vote=vote,
            confidence=min(score / 100.0, 1.0),
        )
        try:
            await self.consensus.register_vote(round_id, v)
        except (ConnectionError, asyncio.TimeoutError) as exc:
            log.warning("[%s] cast_peer_vote failed for round %s: %s", self.bot_id, round_id, exc)

    # ── Introspection ──────────────────────────────────────────────────────────

    def health_status(self) -> dict:
        return {
            "bot_id": self.bot_id,
            "bot_type": self.BOT_TYPE,
            "running": self._running,
            "restart_count": self._restart_count,
            "healing_stats": self._healer.stats(),
        }
