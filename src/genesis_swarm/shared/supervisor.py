"""
BotSupervisor — asyncio task supervisor with real restart capability.

Each bot runs as a monitored asyncio task. When the task exits (exception,
cancellation, or clean stop), the supervisor recreates the bot instance and
restarts it with exponential backoff.  Health is verified by a heartbeat
probe that calls bot.get_status() every PROBE_INTERVAL seconds.

Supervisor vs. self_healing.py:
  • self_healing.py tracks *logical* failures (model drift, consensus failure…)
  • supervisor.py handles *process-level* failures (crashes, hangs, OOM)
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Coroutine

from genesis_swarm.shared.task import fire

log = logging.getLogger(__name__)

PROBE_INTERVAL = 10.0  # seconds between health probes
MAX_RESTART_WAIT = 60.0  # cap for exponential backoff
MAX_RESTARTS = 10  # after this many consecutive failures → FAILED state


@dataclass
class BotRecord:
    bot_id: str
    factory: Callable[[], Any]  # callable that creates a fresh bot instance
    run_coro: Callable[[Any], Coroutine]  # bot.run(stop_event)
    stop_event: asyncio.Event
    instance: Any = field(default=None, repr=False)
    task: asyncio.Task | None = None
    restarts: int = 0
    last_start: float = field(default_factory=time.monotonic)
    last_heartbeat: float = field(default_factory=time.monotonic)
    status: str = "STARTING"  # RUNNING | CRASHED | RESTARTING | FAILED | STOPPED


class BotSupervisor:
    """
    Supervises a collection of SwarmBot instances as asyncio tasks.

    Usage:
        sup = BotSupervisor()
        sup.register("nav-detector", factory=lambda: NavDetectorBot(), run_coro=lambda b: b.run(stop))
        await sup.start_all()
        # later:
        await sup.stop_all()
    """

    def __init__(self) -> None:
        self._bots: dict[str, BotRecord] = {}
        self._probe_task: asyncio.Task | None = None
        self._running = False

    def register(
        self,
        bot_id: str,
        factory: Callable[[], Any],
        run_coro: Callable[[Any], Coroutine],
        stop_event: asyncio.Event | None = None,
    ) -> None:
        if stop_event is None:
            stop_event = asyncio.Event()
        self._bots[bot_id] = BotRecord(
            bot_id=bot_id,
            factory=factory,
            run_coro=run_coro,
            stop_event=stop_event,
        )

    async def start_all(self) -> None:
        self._running = True
        for rec in self._bots.values():
            await self._start_bot(rec)
        self._probe_task = asyncio.create_task(self._probe_loop(), name="supervisor-probe")

    async def stop_all(self) -> None:
        self._running = False
        for rec in self._bots.values():
            rec.stop_event.set()
            rec.status = "STOPPED"
        if self._probe_task:
            self._probe_task.cancel()
        for rec in self._bots.values():
            if rec.task and not rec.task.done():
                rec.task.cancel()
                try:
                    await asyncio.wait_for(rec.task, timeout=5.0)
                except (asyncio.CancelledError, asyncio.TimeoutError):
                    pass

    async def restart_bot(self, bot_id: str, reason: str = "manual") -> bool:
        rec = self._bots.get(bot_id)
        if not rec:
            return False
        log.info("[SUPERVISOR] Restarting %s (reason: %s)", bot_id, reason)
        if rec.task and not rec.task.done():
            rec.task.cancel()
            try:
                await asyncio.wait_for(rec.task, timeout=3.0)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass
        rec.stop_event.clear()
        await self._start_bot(rec, reset_restarts=False)
        return True

    def get_status(self) -> dict[str, dict]:
        now = time.monotonic()
        return {
            bid: {
                "status": rec.status,
                "restarts": rec.restarts,
                "uptime_s": round(now - rec.last_start),
                "last_heartbeat_s": round(now - rec.last_heartbeat),
                "healthy": rec.status == "RUNNING"
                and (now - rec.last_heartbeat) < PROBE_INTERVAL * 3,
            }
            for bid, rec in self._bots.items()
        }

    def record_heartbeat(self, bot_id: str) -> None:
        rec = self._bots.get(bot_id)
        if rec:
            rec.last_heartbeat = time.monotonic()
            if rec.status != "RUNNING":
                rec.status = "RUNNING"

    # ── Internals ─────────────────────────────────────────────────────────────

    async def _start_bot(self, rec: BotRecord, reset_restarts: bool = False) -> None:
        if reset_restarts:
            rec.restarts = 0
        rec.status = "STARTING"
        rec.last_start = time.monotonic()
        try:
            rec.instance = rec.factory()
            if hasattr(rec.instance, "initialise"):
                await rec.instance.initialise()
        except Exception as exc:
            log.error("[SUPERVISOR] %s factory failed: %s", rec.bot_id, exc)
            rec.status = "CRASHED"
            fire(self._schedule_restart(rec), name=f"restart-{rec.bot_id}")
            return

        rec.task = asyncio.create_task(
            self._guarded_run(rec),
            name=f"bot-{rec.bot_id}",
        )
        rec.status = "RUNNING"
        rec.last_heartbeat = time.monotonic()
        log.info("[SUPERVISOR] %s started (restarts=%d)", rec.bot_id, rec.restarts)

    async def _guarded_run(self, rec: BotRecord) -> None:
        try:
            await rec.run_coro(rec.instance)
        except asyncio.CancelledError:
            log.debug("[SUPERVISOR] %s cancelled", rec.bot_id)
            raise
        except Exception as exc:
            if rec.status != "STOPPED":
                log.error("[SUPERVISOR] %s crashed: %s", rec.bot_id, exc)
                rec.status = "CRASHED"
                fire(self._schedule_restart(rec), name=f"restart-{rec.bot_id}")

    async def _schedule_restart(self, rec: BotRecord) -> None:
        if not self._running or rec.status == "STOPPED":
            return
        rec.restarts += 1
        if rec.restarts > MAX_RESTARTS:
            log.critical(
                "[SUPERVISOR] %s exceeded max restarts (%d) — FAILED", rec.bot_id, MAX_RESTARTS
            )
            rec.status = "FAILED"
            return

        rec.status = "RESTARTING"
        # Exponential backoff: 1s, 2s, 4s … capped at MAX_RESTART_WAIT
        delay = min(2 ** (rec.restarts - 1), MAX_RESTART_WAIT)
        log.info(
            "[SUPERVISOR] %s will restart in %.0fs (attempt %d)", rec.bot_id, delay, rec.restarts
        )
        await asyncio.sleep(delay)
        await self._start_bot(rec)

    async def _probe_loop(self) -> None:
        """Periodically check each bot's health via heartbeat timeout."""
        while self._running:
            await asyncio.sleep(PROBE_INTERVAL)
            now = time.monotonic()
            for rec in list(self._bots.values()):
                if rec.status not in ("RUNNING", "STARTING"):
                    continue
                # Task completed without crash signal → zombie
                if rec.task and rec.task.done():
                    exc = rec.task.exception() if not rec.task.cancelled() else None
                    log.warning("[SUPERVISOR] %s task ended silently (exc=%s)", rec.bot_id, exc)
                    rec.status = "CRASHED"
                    fire(self._schedule_restart(rec), name=f"restart-{rec.bot_id}")
                    continue
                # Heartbeat timeout → stale / stuck
                stale_s = now - rec.last_heartbeat
                if stale_s > PROBE_INTERVAL * 3:
                    log.warning(
                        "[SUPERVISOR] %s heartbeat stale for %.0fs — forcing restart",
                        rec.bot_id,
                        stale_s,
                    )
                    await self.restart_bot(rec.bot_id, reason="heartbeat_timeout")
