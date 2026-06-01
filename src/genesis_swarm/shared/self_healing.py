from __future__ import annotations

import asyncio
import inspect
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Awaitable, Callable, Optional

log = logging.getLogger(__name__)

EscalationCallback = Callable[[str, str, dict], Awaitable[None]]


class HealingTier(int, Enum):
    AUTO = 1  # Resolve silently
    NOTIFY = 2  # Resolve and notify commander
    ESCALATE = 3  # Human intervention required


class HealingAction(str, Enum):
    RESTART_BOT = "restart_bot"
    SWITCH_BACKUP_FEED = "switch_to_backup_feed"
    RETRAIN_MODEL = "queue_model_retrain"
    QUARANTINE_BOT = "quarantine_misbehaving_bot"
    ADJUST_QUORUM = "dynamically_adjust_quorum"
    RECONNECT_BUS = "reconnect_message_bus"
    ESCALATE_HUMAN = "escalate_to_human_operator"


HEALING_MATRIX: dict[str, tuple[HealingAction, HealingTier]] = {
    "heartbeat_timeout": (HealingAction.RESTART_BOT, HealingTier.AUTO),
    "feed_quality_degraded": (HealingAction.SWITCH_BACKUP_FEED, HealingTier.AUTO),
    "bus_disconnect": (HealingAction.RECONNECT_BUS, HealingTier.AUTO),
    "model_drift_detected": (HealingAction.RETRAIN_MODEL, HealingTier.NOTIFY),
    "signature_invalid": (HealingAction.QUARANTINE_BOT, HealingTier.NOTIFY),
    "consensus_failure": (HealingAction.ADJUST_QUORUM, HealingTier.NOTIFY),
    "byzantine_detected": (HealingAction.ESCALATE_HUMAN, HealingTier.ESCALATE),
    "data_breach_attempt": (HealingAction.ESCALATE_HUMAN, HealingTier.ESCALATE),
    "sanctions_hit_unverified": (HealingAction.ESCALATE_HUMAN, HealingTier.ESCALATE),
}


@dataclass
class HealingEvent:
    bot_id: str
    failure_type: str
    action: str
    tier: int
    auto_resolved: bool
    context: dict
    timestamp: float = field(default_factory=time.time)


@dataclass
class BotHeartbeat:
    bot_id: str
    last_seen: float = field(default_factory=time.monotonic)
    miss_count: int = 0
    restart_count: int = 0


class HealthMonitor:
    def __init__(self, timeout_seconds: float = 15.0):
        self.timeout = timeout_seconds
        self._bots: dict[str, BotHeartbeat] = {}

    def record_heartbeat(self, bot_id: str) -> None:
        hb = self._bots.setdefault(bot_id, BotHeartbeat(bot_id=bot_id))
        hb.last_seen = time.monotonic()
        hb.miss_count = 0

    def get_timed_out_bots(self) -> list[str]:
        now = time.monotonic()
        return [bid for bid, hb in self._bots.items() if (now - hb.last_seen) > self.timeout]

    def bot_count(self) -> int:
        return len(self._bots)

    def all_healthy(self) -> bool:
        return len(self.get_timed_out_bots()) == 0

    def status_map(self) -> dict[str, str]:
        now = time.monotonic()
        return {
            bid: "healthy" if (now - hb.last_seen) <= self.timeout else "timed_out"
            for bid, hb in self._bots.items()
        }


class SelfHealingOrchestrator:
    """
    Three-tier healing:
      Tier 1 (AUTO)     — resolves silently
      Tier 2 (NOTIFY)   — resolves and pings Commander Bot
      Tier 3 (ESCALATE) — always pages human operator
    """

    def __init__(
        self,
        health_monitor: HealthMonitor,
        escalation_cb: Optional[EscalationCallback] = None,
    ):
        self.monitor = health_monitor
        self._escalation_cb = escalation_cb
        self._event_log: list[HealingEvent] = []
        self._action_handlers: dict[HealingAction, Callable] = {}

    def register_handler(self, action: HealingAction, handler: Callable) -> None:
        self._action_handlers[action] = handler

    async def respond(self, bot_id: str, failure_type: str, context: dict) -> HealingEvent:
        action, tier = HEALING_MATRIX.get(
            failure_type,
            (HealingAction.ESCALATE_HUMAN, HealingTier.ESCALATE),
        )
        event = HealingEvent(
            bot_id=bot_id,
            failure_type=failure_type,
            action=action.value,
            tier=tier.value,
            auto_resolved=tier < HealingTier.ESCALATE,
            context=context,
        )
        self._event_log.append(event)
        log.info(
            "[SelfHeal] %s | Tier-%d | %s → %s", bot_id, tier.value, failure_type, action.value
        )

        if tier == HealingTier.ESCALATE:
            await self._escalate(bot_id, failure_type, context)
        else:
            await self._execute(action, context)

        return event

    async def watch_heartbeats(self) -> None:
        while True:
            await asyncio.sleep(5)
            for bot_id in self.monitor.get_timed_out_bots():
                await self.respond(bot_id, "heartbeat_timeout", {"bot_id": bot_id})

    async def _execute(self, action: HealingAction, context: dict) -> None:
        handler = self._action_handlers.get(action)
        if handler:
            try:
                if inspect.iscoroutinefunction(handler):
                    await handler(context)
                else:
                    handler(context)
            except Exception as e:
                log.error("Healing action %s failed: %s", action.value, e)
        else:
            log.debug("No handler for %s (logged only)", action.value)

    async def _escalate(self, bot_id: str, failure_type: str, context: dict) -> None:
        log.critical(
            "[ESCALATE] Human required: bot=%s failure=%s context=%s", bot_id, failure_type, context
        )
        if self._escalation_cb:
            try:
                await self._escalation_cb(bot_id, failure_type, context)
            except Exception as e:
                log.error("Escalation callback failed: %s", e)

    @property
    def event_log(self) -> list[HealingEvent]:
        return list(self._event_log)

    def stats(self) -> dict:
        total = len(self._event_log)
        auto = sum(1 for e in self._event_log if e.auto_resolved)
        return {
            "total_events": total,
            "auto_resolved": auto,
            "escalated": total - auto,
            "by_bot": {
                bid: sum(1 for e in self._event_log if e.bot_id == bid)
                for bid in {e.bot_id for e in self._event_log}
            },
        }
