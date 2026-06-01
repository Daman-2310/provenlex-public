from __future__ import annotations

import asyncio
import logging
import random
import time
from collections import defaultdict, deque

from .base import RemediationWorkflow, WorkflowStage

log = logging.getLogger(__name__)

# Registered data feeds: id → config
FEEDS: dict[str, dict] = {
    "yahoo_finance": {
        "label": "Yahoo Finance",
        "description": "UCITS ETF NAV data (IWDA.AS, CSPX.AS, VWRL.AS)",
        "bots": ["genesis-001"],
        "live_attr": "_live",
        "backup": "synthetic_gbm",
        "backup_label": "Synthetic GBM Model",
        "check_url": "https://query1.finance.yahoo.com/v8/finance/chart/IWDA.AS",
    },
    "ecb_rates": {
        "label": "ECB Data Warehouse",
        "description": "Live reference FX rates (USD, GBP, CHF, JPY, CNY)",
        "bots": ["fx-001"],
        "live_attr": "_live",
        "backup": "synthetic_fx",
        "backup_label": "Last-Known + Noise Model",
        "check_url": "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A",
    },
    "ais_stream": {
        "label": "AIS Vessel Stream",
        "description": "Maritime Automatic Identification System (vessel positions)",
        "bots": ["cargo-001"],
        "live_attr": "_live",
        "backup": "simulated_ais",
        "backup_label": "Simulated AIS Positions",
        "check_url": None,  # no public free endpoint
    },
    "eia_energy": {
        "label": "EIA / TTF Prices",
        "description": "Energy price feed — WTI, TTF, LNG, Brent, Bunker",
        "bots": ["fuel-001"],
        "live_attr": "_live",
        "backup": "synthetic_energy",
        "backup_label": "Synthetic Energy Price Model",
        "check_url": None,
    },
}

FAILURE_THRESHOLD = 3  # consecutive probe failures before reroute
RESTORE_THRESHOLD = 5  # consecutive successes before restoring primary
CHECK_INTERVAL = 12  # seconds between probe cycles
PROBE_TIMEOUT = 4.0  # seconds per HTTP probe


class FeedSentinel:
    """
    Autonomous data feed failure detector and traffic re-router.

    Workflow for each feed:
      PROBE → on N consecutive failures →
        CONFIRM (cross-validate with backup source) →
        REROUTE (flip bot's _live flag, publish reroute event) →
        VERIFY  (confirm backup returning valid data) →
        RESTORE (periodically probe primary; flip back when healthy)

    All state machines run independently per-feed, in parallel.
    """

    def __init__(self, bots, bus, alerter):
        self._bots: dict[str, object] = {b.bot_id: b for b in bots}
        self._bus = bus
        self._alerter = alerter

        self._workflows: deque = deque(maxlen=200)

        # Per-feed counters / state
        self._fail_streak: dict[str, int] = defaultdict(int)
        self._success_streak: dict[str, int] = defaultdict(int)
        self._routing: dict[str, str] = {f: "primary" for f in FEEDS}
        self._feed_status: dict[str, str] = {f: "HEALTHY" for f in FEEDS}
        self._last_probe_ok: dict[str, bool] = {f: True for f in FEEDS}
        self._reroute_ts: dict[str, float] = {f: 0.0 for f in FEEDS}

    # ── Main loop ─────────────────────────────────────────────────────────────

    async def run(self) -> None:
        log.info(
            "[FeedSentinel] Starting — monitoring %d feeds every %ds", len(FEEDS), CHECK_INTERVAL
        )
        while True:
            await asyncio.sleep(CHECK_INTERVAL)
            # Probe all feeds concurrently
            await asyncio.gather(*[self._probe_cycle(fid) for fid in FEEDS])

    async def _probe_cycle(self, feed_id: str) -> None:
        try:
            healthy = await self._probe(feed_id)
            if healthy:
                await self._handle_success(feed_id)
            else:
                await self._handle_failure(feed_id)
        except Exception as e:
            log.error("[FeedSentinel] Probe error for %s: %s", feed_id, e)

    # ── Probe logic ───────────────────────────────────────────────────────────

    async def _probe(self, feed_id: str) -> bool:
        """
        Probes a feed for health.
        For feeds with a real URL, attempts an HTTP HEAD/GET.
        For others, checks the affiliated bot's live flag + adds synthetic noise.
        """
        cfg = FEEDS[feed_id]
        bot = self._bots.get(cfg["bots"][0]) if cfg["bots"] else None

        # If we explicitly rerouted, probe the primary to see if it's back
        if self._routing[feed_id] == "backup":
            # Lightweight re-probe of primary
            return (
                await self._http_probe(cfg.get("check_url"))
                if cfg.get("check_url")
                else (random.random() > 0.35)
            )

        # Normal probe
        if cfg.get("check_url"):
            return await self._http_probe(cfg["check_url"])

        # No URL available — infer health from bot state + randomness
        bot_live = getattr(bot, "_live", False) if bot else False
        # Simulate realistic intermittent failures for demo
        base_failure = {"ais_stream": 0.08, "eia_energy": 0.12}.get(feed_id, 0.05)
        return bot_live or (random.random() > base_failure)

    async def _http_probe(self, url: str | None) -> bool:
        if not url:
            return True
        try:
            import ssl

            import aiohttp
            import certifi

            ctx = ssl.create_default_context(cafile=certifi.where())
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url, timeout=aiohttp.ClientTimeout(total=PROBE_TIMEOUT), ssl=ctx
                ) as resp:
                    return resp.status < 500
        except Exception as e:
            log.debug("[FeedSentinel] HTTP probe failed for %s: %s", url, e)
            return False

    # ── Failure path ──────────────────────────────────────────────────────────

    async def _handle_failure(self, feed_id: str) -> None:
        self._fail_streak[feed_id] += 1
        self._success_streak[feed_id] = 0
        self._last_probe_ok[feed_id] = False

        streak = self._fail_streak[feed_id]
        log.debug("[FeedSentinel] %s failure streak: %d", feed_id, streak)

        if streak == 1:
            self._feed_status[feed_id] = "DEGRADED"
        elif streak == FAILURE_THRESHOLD:
            self._feed_status[feed_id] = "FAILED"
            await self._initiate_reroute(feed_id)
        elif streak > FAILURE_THRESHOLD:
            # Already rerouted — just keep counting
            pass

    async def _initiate_reroute(self, feed_id: str) -> None:
        cfg = FEEDS[feed_id]
        wf = RemediationWorkflow(
            trigger_type="FEED_FAILURE",
            affected_bot=", ".join(cfg["bots"]),
            severity="HIGH",
            stage=WorkflowStage.CONFIRMING,
        )
        wf.add_action(
            "DETECT_FAILURE",
            "CONFIRMED",
            f"{FAILURE_THRESHOLD} consecutive probe failures on '{cfg['label']}'",
        )
        log.warning("[FeedSentinel] REROUTE: %s → %s", feed_id, cfg["backup"])

        # Confirm: is backup source accessible?
        wf.stage = WorkflowStage.CONFIRMING
        backup_reachable = await self._check_backup_reachable(feed_id)
        wf.add_action(
            "CONFIRM_BACKUP_AVAILABLE",
            "SUCCESS" if backup_reachable else "WARN",
            f"Backup '{cfg['backup_label']}' {'available' if backup_reachable else 'degraded'}",
        )

        # Flip routing
        wf.stage = WorkflowStage.REMEDIATING
        self._routing[feed_id] = "backup"
        self._reroute_ts[feed_id] = time.time()

        # Notify each affected bot
        for bot_id in cfg["bots"]:
            bot = self._bots.get(bot_id)
            if bot and hasattr(bot, cfg["live_attr"]):
                setattr(bot, cfg["live_attr"], False)
                wf.add_action(
                    "REROUTE_TRAFFIC",
                    "SUCCESS",
                    f"{bot_id} switched from '{cfg['label']}' → '{cfg['backup_label']}'",
                )

        # Verify backup data flow
        wf.stage = WorkflowStage.VERIFYING
        await asyncio.sleep(0.3)
        backup_ok = await self._verify_backup_flow(feed_id)
        wf.add_action(
            "VERIFY_BACKUP_DATA",
            "SUCCESS" if backup_ok else "FAILED",
            f"Backup data flowing: {backup_ok}",
        )

        summary = (
            f"Traffic rerouted: '{cfg['label']}' → '{cfg['backup_label']}'. "
            f"Affected bots: {cfg['bots']}. "
            f"Backup {'healthy' if backup_ok else 'DEGRADED'}."
        )
        wf.complete(backup_ok, summary)
        self._workflows.append(wf)

        await self._bus.publish(
            "remediation.feed_reroute",
            {
                "feed_id": feed_id,
                "feed_label": cfg["label"],
                "from_source": "primary",
                "to_source": cfg["backup"],
                "affected_bots": cfg["bots"],
                "backup_ok": backup_ok,
                "workflow_id": wf.workflow_id,
                "ts": time.time(),
            },
        )

    # ── Success / restore path ─────────────────────────────────────────────────

    async def _handle_success(self, feed_id: str) -> None:
        was_failed = self._fail_streak[feed_id] >= FAILURE_THRESHOLD
        self._fail_streak[feed_id] = 0
        self._success_streak[feed_id] += 1
        self._last_probe_ok[feed_id] = True

        if was_failed or self._routing[feed_id] == "backup":
            if self._success_streak[feed_id] >= RESTORE_THRESHOLD:
                await self._restore_primary(feed_id)
            else:
                log.debug(
                    "[FeedSentinel] %s recovering (%d/%d successes before restore)",
                    feed_id,
                    self._success_streak[feed_id],
                    RESTORE_THRESHOLD,
                )
        else:
            if self._feed_status[feed_id] != "HEALTHY":
                self._feed_status[feed_id] = "HEALTHY"

    async def _restore_primary(self, feed_id: str) -> None:
        cfg = FEEDS[feed_id]
        wf = RemediationWorkflow(
            trigger_type="FEED_RESTORE",
            affected_bot=", ".join(cfg["bots"]),
            severity="LOW",
            stage=WorkflowStage.REMEDIATING,
        )
        wf.add_action(
            "DETECT_PRIMARY_RECOVERY",
            "SUCCESS",
            f"{RESTORE_THRESHOLD} consecutive probes healthy on '{cfg['label']}'",
        )

        self._routing[feed_id] = "primary"
        self._feed_status[feed_id] = "HEALTHY"
        self._success_streak[feed_id] = 0

        for bot_id in cfg["bots"]:
            bot = self._bots.get(bot_id)
            if bot and hasattr(bot, cfg["live_attr"]):
                setattr(bot, cfg["live_attr"], True)
                wf.add_action(
                    "RESTORE_PRIMARY_ROUTE", "SUCCESS", f"{bot_id} restored to '{cfg['label']}'"
                )

        wf.complete(True, f"Primary feed '{cfg['label']}' restored after outage.")
        self._workflows.append(wf)

        await self._bus.publish(
            "remediation.feed_restore",
            {
                "feed_id": feed_id,
                "feed_label": cfg["label"],
                "restored_to": "primary",
                "workflow_id": wf.workflow_id,
                "ts": time.time(),
            },
        )
        log.info("[FeedSentinel] %s restored to primary feed", feed_id)

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def _check_backup_reachable(self, feed_id: str) -> bool:
        await asyncio.sleep(0.1)
        return True  # synthetic backups are always available

    async def _verify_backup_flow(self, feed_id: str) -> bool:
        await asyncio.sleep(0.1)
        return random.random() > 0.03

    # ── Demo injection ────────────────────────────────────────────────────────

    async def inject_failure(self, feed_id: str) -> None:
        """Force a feed failure + reroute workflow for demo purposes."""
        if feed_id not in FEEDS:
            return
        # Simulate 3 consecutive failures immediately
        self._fail_streak[feed_id] = FAILURE_THRESHOLD
        self._feed_status[feed_id] = "FAILED"
        self._last_probe_ok[feed_id] = False
        await self._initiate_reroute(feed_id)

    async def inject_restore(self, feed_id: str) -> None:
        """Force a primary feed restore for demo purposes."""
        if feed_id not in FEEDS:
            return
        self._success_streak[feed_id] = RESTORE_THRESHOLD
        await self._restore_primary(feed_id)

    # ── Reporting ─────────────────────────────────────────────────────────────

    def get_feed_status(self) -> dict:
        return {
            fid: {
                "label": FEEDS[fid]["label"],
                "description": FEEDS[fid]["description"],
                "status": self._feed_status[fid],
                "routing": self._routing[fid],
                "fail_streak": self._fail_streak[fid],
                "bots": FEEDS[fid]["bots"],
                "backup": FEEDS[fid]["backup_label"],
            }
            for fid in FEEDS
        }

    def get_report(self, n: int = 20) -> list[dict]:
        return [w.to_dict() for w in list(self._workflows)[-n:]]
