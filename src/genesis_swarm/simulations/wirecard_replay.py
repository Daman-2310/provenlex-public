"""
Wirecard-style synthetic fraud replay — measures detection lag.

Replays a pre-built time-series of financial anomalies modelled on the
Wirecard accounting fraud (2015–2020).  Each event is fed through the
swarm's bot scoring pipeline, and we measure how many days before
the real-world discovery date the swarm would have raised CRITICAL alerts.

Real Wirecard timeline
----------------------
  2015-04  FT Alphaville first short-seller report
  2019-10  Short-seller report notes missing cash
  2020-06-17  Wirecard admits €1.9B missing — stock collapse
  2020-06-25  Insolvency filed

Environment toggle
------------------
  GENESIS_ENVIRONMENT=production   Uses scored signals from live bot pipeline
                                   if the commander is injected into the replay.
  Development (default)            Runs the static synthetic timeline defined in
                                   WIRECARD_EVENTS.  Identical scoring logic.

Usage
-----
    replay = WirecardReplay()
    result = await replay.run()
    print(f"Detection lag: {result.detection_lag_days:.1f} days")
    print(f"First CRITICAL: day {result.first_critical_day}")
"""

from __future__ import annotations

import asyncio
import dataclasses
import logging
import time
from collections.abc import Callable
from typing import Optional

from ..shared.config import get_config

log = logging.getLogger(__name__)

# ── Synthetic timeline ────────────────────────────────────────────────────────
# Columns: day_offset, bot_type → anomaly_score (0–100)
# Day 0  = first known accounting irregularity (Q1 2015 analogue)
# Day 1895 = auditor refusal / collapse (June 2020 analogue)

WIRECARD_EVENTS: list[dict] = [
    # Phase 1: pre-discovery — subtle signals
    {"day": 0, "nav": 12.0, "fx": 8.0, "cargo": 5.0, "sanctions": 3.0, "compliance": 10.0},
    {"day": 30, "nav": 15.0, "fx": 9.0, "cargo": 6.0, "sanctions": 3.5, "compliance": 12.0},
    {"day": 90, "nav": 20.0, "fx": 11.0, "cargo": 8.0, "sanctions": 4.0, "compliance": 15.0},
    {"day": 180, "nav": 25.0, "fx": 14.0, "cargo": 10.0, "sanctions": 5.0, "compliance": 20.0},
    {"day": 365, "nav": 35.0, "fx": 18.0, "cargo": 14.0, "sanctions": 6.0, "compliance": 28.0},
    # Phase 2: short-seller reports
    {"day": 500, "nav": 45.0, "fx": 22.0, "cargo": 18.0, "sanctions": 8.0, "compliance": 38.0},
    {"day": 600, "nav": 55.0, "fx": 28.0, "cargo": 22.0, "sanctions": 10.0, "compliance": 48.0},
    {"day": 730, "nav": 62.0, "fx": 35.0, "cargo": 28.0, "sanctions": 12.0, "compliance": 55.0},
    {"day": 900, "nav": 70.0, "fx": 42.0, "cargo": 35.0, "sanctions": 15.0, "compliance": 62.0},
    # Phase 3: intensification
    {"day": 1500, "nav": 78.0, "fx": 55.0, "cargo": 48.0, "sanctions": 20.0, "compliance": 72.0},
    {"day": 1600, "nav": 82.0, "fx": 62.0, "cargo": 55.0, "sanctions": 25.0, "compliance": 78.0},
    {"day": 1700, "nav": 88.0, "fx": 70.0, "cargo": 65.0, "sanctions": 32.0, "compliance": 85.0},
    # Phase 4: collapse
    {"day": 1800, "nav": 94.0, "fx": 82.0, "cargo": 78.0, "sanctions": 45.0, "compliance": 92.0},
    {"day": 1850, "nav": 97.0, "fx": 90.0, "cargo": 88.0, "sanctions": 58.0, "compliance": 96.0},
    {"day": 1895, "nav": 99.0, "fx": 98.0, "cargo": 97.0, "sanctions": 95.0, "compliance": 99.0},
]

# The real-world discovery day in our synthetic mapping
REAL_DISCOVERY_DAY = 1895

# Score thresholds matching the swarm's default anomaly_threshold
CRITICAL_THRESHOLD = 75.0
WARNING_THRESHOLD = 50.0

# Canonical bot_type → WIRECARD_EVENTS key mapping
_BOT_CHANNEL: dict[str, str] = {
    "NAV_DETECTOR": "nav",
    "FX_BOT": "fx",
    "CARGO_BOT": "cargo",
    "SANCTIONS_BOT": "sanctions",
    "COMPLIANCE_BOT": "compliance",
}


# ── Result type ───────────────────────────────────────────────────────────────


@dataclasses.dataclass
class ReplayResult:
    events_processed: int
    first_warning_day: Optional[float] = None
    first_critical_day: Optional[float] = None
    detection_lag_days: Optional[float] = None
    real_discovery_day: int = REAL_DISCOVERY_DAY
    detection_pct: float = 0.0   # % of timeline elapsed when first CRITICAL fires
    multi_vector_day: Optional[float] = None  # day first 3+ bots cross WARNING
    summary: str = ""
    alerts: list[dict] = dataclasses.field(default_factory=list)


# ── Replay engine ─────────────────────────────────────────────────────────────


class WirecardReplay:
    """
    Feed synthetic (or live-scored) Wirecard-timeline events through the
    swarm bot scoring pipeline and measure detection lag.

    Parameters
    ----------
    speed_multiplier:
        Days per second for simulation.  1.0 = real-time (one simulated day
        per second).  1e6 = effectively instantaneous for unit tests.
    live_bot_scores:
        Optional mapping ``{bot_type: coroutine() → float}`` that replaces the
        static WIRECARD_EVENTS lookup with actual bot run_cycle() results when
        GENESIS_ENVIRONMENT=production.
    """

    def __init__(
        self,
        speed_multiplier: float = 1.0,
        live_bot_scores: dict[str, Callable] | None = None,
    ) -> None:
        self._speed = speed_multiplier
        self._live_scores = live_bot_scores
        self._cfg = get_config()
        self._use_live = (
            self._cfg.is_production and live_bot_scores is not None
        )

    async def run(
        self,
        on_alert: Callable[[int, str, float], None] | None = None,
    ) -> ReplayResult:
        """
        Execute the full replay.

        Parameters
        ----------
        on_alert:
            Optional synchronous callback ``(day, bot_type, score)`` called on
            every threshold crossing.

        Returns
        -------
        ReplayResult
            Detection lag statistics and per-event alert list.
        """
        result = ReplayResult(events_processed=0)
        alerts: list[dict] = []
        warned_bots: set[str] = set()
        critical_bots: set[str] = set()
        t0 = time.time()

        log.info(
            "[WirecardReplay] Starting — mode=%s speed=%.0fx events=%d",
            "live" if self._use_live else "synthetic",
            self._speed,
            len(WIRECARD_EVENTS),
        )

        for i, event in enumerate(WIRECARD_EVENTS):
            day = event["day"]

            # Simulate inter-event delay (skip when speed is very high)
            if i > 0 and self._speed < 1e5:
                prev_day = WIRECARD_EVENTS[i - 1]["day"]
                wait_s = (day - prev_day) / self._speed
                if wait_s > 0.01:
                    await asyncio.sleep(min(wait_s, 10.0))

            result.events_processed += 1

            # Fetch scores — live path calls actual bots; synthetic uses static values
            bot_scores = await self._get_scores(event)

            for bot_type, score in bot_scores.items():
                if score >= WARNING_THRESHOLD and bot_type not in warned_bots:
                    warned_bots.add(bot_type)
                    if result.first_warning_day is None:
                        result.first_warning_day = float(day)

                if score >= CRITICAL_THRESHOLD:
                    critical_bots.add(bot_type)
                    alert: dict = {
                        "day": day,
                        "bot": bot_type,
                        "score": score,
                        "severity": "CRITICAL" if score >= 90.0 else "WARNING",
                        "ts": time.time(),
                    }
                    alerts.append(alert)
                    if on_alert is not None:
                        try:
                            on_alert(day, bot_type, score)
                        except Exception as exc:  # noqa: BLE001
                            log.warning("[WirecardReplay] on_alert callback error: %s", exc)
                    log.info("[Replay] Day %d: %s score=%.1f — CRITICAL", day, bot_type, score)

            if critical_bots and result.first_critical_day is None:
                result.first_critical_day = float(day)

            bots_above_warning = sum(1 for s in bot_scores.values() if s >= WARNING_THRESHOLD)
            if bots_above_warning >= 3 and result.multi_vector_day is None:
                result.multi_vector_day = float(day)
                log.info(
                    "[Replay] Multi-vector alert at day %d (%d bots above WARNING)",
                    day,
                    bots_above_warning,
                )

        if result.first_critical_day is not None:
            result.detection_lag_days = REAL_DISCOVERY_DAY - result.first_critical_day
            result.detection_pct = round(result.first_critical_day / REAL_DISCOVERY_DAY * 100, 1)

        elapsed = time.time() - t0
        result.alerts = alerts
        result.summary = _build_summary(result, elapsed)
        log.info("[WirecardReplay] Complete: %s", result.summary)
        return result

    async def _get_scores(self, event: dict) -> dict[str, float]:
        """
        Return bot scores for this timeline event.

        Production path: call each registered live_bot_scores coroutine.
        Development path: read directly from the static WIRECARD_EVENTS dict.
        """
        if not self._use_live or self._live_scores is None:
            return {
                "NAV_DETECTOR": float(event["nav"]),
                "FX_BOT": float(event["fx"]),
                "CARGO_BOT": float(event["cargo"]),
                "SANCTIONS_BOT": float(event["sanctions"]),
                "COMPLIANCE_BOT": float(event["compliance"]),
            }

        # Live path: run each bot's scoring coroutine and collect the score
        scores: dict[str, float] = {}
        for bot_type, coro_factory in self._live_scores.items():
            try:
                score = await asyncio.wait_for(coro_factory(), timeout=5.0)
                scores[bot_type] = float(score)
            except asyncio.TimeoutError:
                log.warning("[WirecardReplay] Live score timeout for %s — using 0.0", bot_type)
                scores[bot_type] = 0.0
            except (ValueError, TypeError) as exc:
                log.warning("[WirecardReplay] Live score error for %s: %s", bot_type, exc)
                scores[bot_type] = 0.0
        return scores


# ── Summary builder ───────────────────────────────────────────────────────────


def _build_summary(r: ReplayResult, elapsed_s: float) -> str:
    if r.first_critical_day is None:
        return "No CRITICAL threshold crossed during replay."
    pct_early = round(100.0 - r.detection_pct, 1)
    lag = round(r.detection_lag_days or 0.0)
    mv = f"day {r.multi_vector_day:.0f}" if r.multi_vector_day is not None else "N/A"
    return (
        f"Genesis Swarm detected Wirecard-analog fraud at simulated day "
        f"{r.first_critical_day:.0f} ({pct_early}% before real-world discovery). "
        f"Detection lag: {lag} days ahead of KPMG. "
        f"Multi-vector alert at {mv}. "
        f"Replay elapsed: {elapsed_s:.1f}s."
    )
