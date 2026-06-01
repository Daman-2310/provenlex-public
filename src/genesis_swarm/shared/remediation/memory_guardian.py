from __future__ import annotations

import asyncio
import gc
import logging
import time
from collections import deque

from .base import RemediationWorkflow, WorkflowStage

log = logging.getLogger(__name__)

MEMORY_WARN_MB = 300  # soft warning — run GC
MEMORY_HIGH_MB = 450  # Tier-1: GC + history trim
MEMORY_CRIT_MB = 600  # Tier-2: restart heaviest bot
MAX_BOT_RESTARTS = 3  # before escalating
CHECK_INTERVAL = 6  # seconds between checks


class MemoryGuardian:
    """
    Autonomous memory spike detector and remediator.

    Tier 1 (≥ MEMORY_HIGH_MB):
      → Force Python GC collection
      → Trim history buffers on all bots to last 200 samples

    Tier 2 (≥ MEMORY_CRIT_MB):
      → Identify bot with largest history/state buffer
      → Gracefully stop it, GC, restart it as new asyncio task
      → Verify memory dropped ≥ 10%

    Tier 3 (bot restarted MAX_BOT_RESTARTS times and still critical):
      → Escalate to human via EMERGENCY alert
    """

    def __init__(self, bots, bus, alerter, auditor):
        self._bots = bots
        self._bus = bus
        self._alerter = alerter
        self._auditor = auditor
        self._workflows: deque = deque(maxlen=100)
        self._restart_counts: dict[str, int] = {}
        self._last_mb: float = 0.0
        self._mb_history: deque[float] = deque(maxlen=30)  # 3-minute rolling window
        self._tier1_cooldown: float = 0.0  # prevent thrash
        self._tier2_cooldown: float = 0.0

        self._has_psutil = False
        try:
            import psutil  # noqa: F401

            self._has_psutil = True
            log.info("[MemoryGuardian] psutil available — using real process metrics")
        except ImportError:
            log.warning("[MemoryGuardian] psutil not installed — using estimated metrics")

    # ── Main loop ─────────────────────────────────────────────────────────────

    async def run(self) -> None:
        log.info("[MemoryGuardian] Starting — monitoring process memory every %ds", CHECK_INTERVAL)
        while True:
            await asyncio.sleep(CHECK_INTERVAL)
            try:
                await self._check()
            except Exception as e:
                log.error("[MemoryGuardian] Check error: %s", e)

    async def _check(self) -> None:
        mb = self._sample_memory()
        self._last_mb = mb
        self._mb_history.append(mb)

        if mb >= MEMORY_CRIT_MB and time.time() > self._tier2_cooldown:
            await self._tier2_restart(mb)
        elif mb >= MEMORY_HIGH_MB and time.time() > self._tier1_cooldown:
            await self._tier1_gc(mb)
        elif mb >= MEMORY_WARN_MB:
            log.debug("[MemoryGuardian] Memory WARN %.0f MB (threshold %d)", mb, MEMORY_WARN_MB)
            await self._bus.publish(
                "remediation.memory",
                {
                    "level": "WARN",
                    "memory_mb": round(mb, 1),
                    "action": "monitoring",
                    "ts": time.time(),
                },
            )

    # ── Tier 1: GC + history trim ─────────────────────────────────────────────

    async def _tier1_gc(self, mb: float) -> None:
        wf = RemediationWorkflow(
            trigger_type="MEMORY_SPIKE",
            affected_bot="process",
            severity="HIGH",
            stage=WorkflowStage.REMEDIATING,
        )
        log.warning("[MemoryGuardian] Tier-1 — %.0f MB ≥ %d MB threshold", mb, MEMORY_HIGH_MB)

        # Step 1: Force full GC
        wf.add_action("GC_COLLECT_ALL", "TRIGGERED", f"Python GC forced at {mb:.0f}MB RSS")
        collected = gc.collect(generation=2)
        wf.add_action("GC_COLLECT_ALL", "SUCCESS", f"GC freed {collected} objects")

        # Step 2: Trim history buffers on all bots
        trimmed, freed_est = 0, 0
        for bot in self._bots:
            if hasattr(bot, "_history") and len(bot._history) > 200:
                excess = len(bot._history) - 200
                bot._history = bot._history[-200:]
                freed_est += excess * 8  # ~8 bytes per float64
                trimmed += 1
            # Also trim rate deques on FX bot
            if hasattr(bot, "_rates"):
                for q in bot._rates.values():
                    while len(q) > 120:
                        q.popleft()

        wf.add_action(
            "HISTORY_TRIM",
            "SUCCESS",
            f"Trimmed {trimmed} bot buffers — freed ~{freed_est // 1024}KB",
        )

        # Wait a tick for GC to settle, then verify
        wf.stage = WorkflowStage.VERIFYING
        await asyncio.sleep(0.5)
        gc.collect()
        after = self._sample_memory()
        recovered = mb - after

        wf.add_action(
            "VERIFY_MEMORY",
            "SUCCESS" if after < mb else "FAILED",
            f"Before: {mb:.0f}MB → After: {after:.0f}MB (recovered {recovered:.0f}MB)",
        )
        wf.complete(True, f"Tier-1 GC recovered {recovered:.0f}MB. Memory now {after:.0f}MB.")
        self._workflows.append(wf)
        self._tier1_cooldown = time.time() + 30  # 30s cooldown

        await self._bus.publish(
            "remediation.memory",
            {
                "level": "HIGH",
                "tier": 1,
                "memory_before_mb": round(mb, 1),
                "memory_after_mb": round(after, 1),
                "recovered_mb": round(recovered, 1),
                "workflow_id": wf.workflow_id,
                "ts": time.time(),
            },
        )

    # ── Tier 2: Restart heaviest bot ──────────────────────────────────────────

    async def _tier2_restart(self, mb: float) -> None:
        # Identify heaviest bot by state size
        heaviest = self._heaviest_bot()
        if not heaviest:
            return

        restarts = self._restart_counts.get(heaviest.bot_id, 0)
        wf = RemediationWorkflow(
            trigger_type="MEMORY_SPIKE",
            affected_bot=heaviest.bot_id,
            severity="CRITICAL",
            stage=WorkflowStage.REMEDIATING,
        )

        if restarts >= MAX_BOT_RESTARTS:
            reason = (
                f"{heaviest.bot_id} has been restarted {restarts}× "
                f"and memory is still critical at {mb:.0f}MB — human review required."
            )
            wf.escalate(reason)
            self._workflows.append(wf)
            log.critical("[MemoryGuardian] %s", reason)
            await self._bus.publish(
                "remediation.escalate",
                {
                    "reason": reason,
                    "memory_mb": round(mb, 1),
                    "workflow_id": wf.workflow_id,
                    "ts": time.time(),
                },
            )
            return

        state_kb = self._bot_state_kb(heaviest)
        log.critical(
            "[MemoryGuardian] Tier-2 — %.0f MB critical, restarting %s (%dKB state)",
            mb,
            heaviest.bot_id,
            state_kb,
        )

        wf.add_action(
            "SELECT_RESTART_TARGET",
            "SUCCESS",
            f"{heaviest.bot_id} identified as heaviest ({state_kb}KB state, "
            f"{len(getattr(heaviest, '_history', []))} history samples)",
        )

        # Graceful stop
        wf.stage = WorkflowStage.REMEDIATING
        wf.add_action(
            "GRACEFUL_STOP",
            "TRIGGERED",
            f"Calling {heaviest.bot_id}.stop() — draining in-flight tasks",
        )
        heaviest.stop()
        await asyncio.sleep(0.8)  # drain

        # GC after stop
        gc.collect(generation=2)
        wf.add_action("GC_POST_STOP", "SUCCESS", "GC run after bot stopped")

        # Restart as new task
        wf.add_action(
            "SERVICE_RESTART", "TRIGGERED", f"Spawning new asyncio task for {heaviest.bot_id}"
        )
        asyncio.ensure_future(heaviest.start())
        self._restart_counts[heaviest.bot_id] = restarts + 1

        # Verify recovery
        wf.stage = WorkflowStage.VERIFYING
        await asyncio.sleep(2.5)
        after = self._sample_memory()
        recovered = mb - after
        success = after < mb * 0.88  # need at least 12% reduction

        wf.add_action(
            "VERIFY_MEMORY",
            "SUCCESS" if success else "WARN",
            f"Memory: {mb:.0f}MB → {after:.0f}MB ({recovered:+.0f}MB)",
        )
        wf.complete(
            success,
            f"Restarted {heaviest.bot_id} (attempt {restarts + 1}/{MAX_BOT_RESTARTS}). "
            f"Memory: {mb:.0f}→{after:.0f}MB.",
        )
        self._workflows.append(wf)
        self._tier2_cooldown = time.time() + 60  # 60s cooldown

        await self._bus.publish(
            "remediation.restart",
            {
                "bot_id": heaviest.bot_id,
                "reason": "memory_critical",
                "restart_attempt": restarts + 1,
                "memory_before_mb": round(mb, 1),
                "memory_after_mb": round(after, 1),
                "workflow_id": wf.workflow_id,
                "ts": time.time(),
            },
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _sample_memory(self) -> float:
        if self._has_psutil:
            import os

            import psutil

            return psutil.Process(os.getpid()).memory_info().rss / (1024 * 1024)
        # Estimate from bot state sizes when psutil unavailable
        total_bytes = 0
        for bot in self._bots:
            total_bytes += len(getattr(bot, "_history", [])) * 8
            if hasattr(bot, "_rates"):
                for q in bot._rates.values():
                    total_bytes += len(q) * 8
        # Base overhead ~120MB + scaled state
        return 120.0 + (total_bytes * 50 / (1024 * 1024))

    def _heaviest_bot(self):
        return max(
            self._bots,
            key=lambda b: (
                len(getattr(b, "_history", []))
                + sum(len(q) for q in getattr(b, "_rates", {}).values())
            ),
            default=None,
        )

    def _bot_state_kb(self, bot) -> int:
        total = len(getattr(bot, "_history", [])) * 8
        total += sum(len(q) * 8 for q in getattr(bot, "_rates", {}).values())
        return total // 1024

    # ── Demo injection ────────────────────────────────────────────────────────

    async def inject_spike(self, severity: str = "HIGH") -> None:
        """Force a demo remediation workflow without waiting for real memory threshold."""
        mb = self._sample_memory() + (200 if severity == "CRITICAL" else 130)
        if severity == "CRITICAL":
            await self._tier2_restart(mb)
        else:
            await self._tier1_gc(mb)

    # ── Reporting ─────────────────────────────────────────────────────────────

    def get_report(self, n: int = 20) -> list[dict]:
        return [w.to_dict() for w in list(self._workflows)[-n:]]

    def current_mb(self) -> float:
        return round(self._last_mb or self._sample_memory(), 1)

    def mb_trend(self) -> list[float]:
        return [round(m, 1) for m in list(self._mb_history)[-12:]]
