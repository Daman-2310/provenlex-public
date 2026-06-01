from __future__ import annotations
import logging
from ..shared.bot_base import DetectionResult, SwarmBot
import certifi
import aiohttp
from dataclasses import dataclass
import time
import ssl
import random

import asyncio


def _fire_task(coro) -> asyncio.Task:
    """Create a tracked background task that logs unhandled exceptions."""
    task = asyncio.create_task(coro)
    task.add_done_callback(_on_task_done)
    return task


def _on_task_done(task: asyncio.Task) -> None:
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        import logging as _lg
        _lg.getLogger(__name__).error(
            "background_task_failed", exc_info=exc, task_name=task.get_name()
        )


log = logging.getLogger(__name__)

# World Bank API — free, no key required
# PV.EST  = Political Stability & Absence of Violence (-2.5 to +2.5, higher = more stable)
# GE.EST  = Government Effectiveness
# RL.EST  = Rule of Law
# CC.EST  = Control of Corruption
WB_INDICATOR_URL = (
    "https://api.worldbank.org/v2/country/{iso}/indicator/{indicator}"
    "?format=json&mrv=1&per_page=1"
)
WB_INDICATORS = ["PV.EST", "GE.EST", "RL.EST", "CC.EST"]
WB_BATCH_URL = (
    "https://api.worldbank.org/v2/country/{iso}/indicator/{indicator}"
    "?format=json&mrv=3&per_page=3"
)

COUNTRIES_TO_WATCH = [
    "LU",
    "FR",
    "DE",
    "RU",
    "CN",
    "KP",
    "IR",
    "AE",
    "SG",
    "CH",
    "KY",
    "PA",
    "UA",
    "BY",
]


@dataclass
class CountryRisk:
    iso2: str
    name: str
    political_risk: float  # 0–100 (higher = riskier)
    economic_risk: float
    sanctions_risk: float
    conflict_risk: float
    currency_risk: float
    wb_political_stability: float | None = None  # raw World Bank value

    def composite(self) -> float:
        return (
            self.political_risk * 0.30
            + self.economic_risk * 0.20
            + self.sanctions_risk * 0.30
            + self.conflict_risk * 0.15
            + self.currency_risk * 0.05
        )


# Baseline risk scores — augmented at runtime by World Bank API
_BASE_RISK_DB: dict[str, CountryRisk] = {
    "LU": CountryRisk("LU", "Luxembourg", 5, 5, 2, 1, 5),
    "FR": CountryRisk("FR", "France", 20, 25, 5, 5, 15),
    "DE": CountryRisk("DE", "Germany", 15, 20, 5, 3, 10),
    "RU": CountryRisk("RU", "Russia", 80, 75, 95, 70, 85),
    "CN": CountryRisk("CN", "China", 65, 40, 55, 30, 50),
    "KP": CountryRisk("KP", "North Korea", 99, 95, 99, 85, 95),
    "IR": CountryRisk("IR", "Iran", 90, 85, 98, 75, 90),
    "AE": CountryRisk("AE", "UAE", 35, 20, 30, 25, 20),
    "SG": CountryRisk("SG", "Singapore", 10, 10, 5, 3, 8),
    "CH": CountryRisk("CH", "Switzerland", 8, 8, 5, 2, 5),
    "KY": CountryRisk("KY", "Cayman Islands", 20, 15, 35, 5, 10),
    "PA": CountryRisk("PA", "Panama", 45, 40, 50, 20, 35),
    "UA": CountryRisk("UA", "Ukraine", 75, 80, 20, 90, 70),
    "BY": CountryRisk("BY", "Belarus", 85, 75, 90, 60, 80),
}
COUNTRY_RISK_DB = _BASE_RISK_DB

FUND_COUNTRY_EXPOSURE: dict[str, list[tuple[str, float]]] = {
    "MARITIME-ALPHA-LUX": [("LU", 40), ("DE", 25), ("RU", 20), ("PA", 15)],
    "SOVEREIGN-WEALTH-LUX": [("LU", 30), ("CH", 20), ("AE", 25), ("CN", 25)],
    "ENERGY-INFRA-LUX": [("LU", 35), ("RU", 30), ("IR", 10), ("AE", 25)],
    "ASIA-MACRO-LUX": [("LU", 20), ("CN", 45), ("KP", 5), ("SG", 30)],
    "FX-MACRO-LUX": [("LU", 50), ("RU", 20), ("BY", 15), ("CH", 15)],
}


def _wb_to_risk(wb_value: float | None) -> float | None:
    """Convert World Bank indicator (-2.5 to +2.5) to risk score (0–100)."""
    if wb_value is None:
        return None
    risk = (1.0 - (wb_value + 2.5) / 5.0) * 100.0
    return round(max(0.0, min(100.0, risk)), 1)


class SovereignBot(SwarmBot):
    """Bot 8 — Country risk scoring augmented with live World Bank governance data."""

    BOT_TYPE = "SOVEREIGN_BOT"
    PERSONALITY = "MACRO"
    PERSONALITY_LABEL = "Macro"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        import copy

        self._risk_db: dict[str, CountryRisk] = copy.deepcopy(_BASE_RISK_DB)
        self._live = False
        self._wb_updates = 0
        self._last_reload = 0.0

    async def initialise(self) -> None:
        updated = await self._fetch_world_bank()
        self._wb_updates = updated
        self._last_reload = time.time()
        source = "World Bank LIVE" if self._live else "BASELINE"
        log.info(
            "[SovereignBot] %s — %d/%d countries with live governance data",
            source,
            updated,
            len(COUNTRIES_TO_WATCH),
        )

    async def run_cycle(self) -> DetectionResult | None:
        # Refresh World Bank data once per hour
        if time.time() - self._last_reload > 3600:
            _fire_task(self._background_refresh())

        fund_name = random.choice(list(FUND_COUNTRY_EXPOSURE.keys()))
        exposures = FUND_COUNTRY_EXPOSURE[fund_name]
        self._drift_risks()

        weighted_score = 0.0
        risk_breakdown: list[dict] = []

        for iso2, weight_pct in exposures:
            country = self._risk_db.get(iso2)
            if not country:
                continue
            composite = country.composite()
            contribution = composite * (weight_pct / 100.0)
            weighted_score += contribution
            if composite > 50:
                risk_breakdown.append(
                    {
                        "country": country.name,
                        "iso2": iso2,
                        "exposure_pct": weight_pct,
                        "composite_risk": round(composite, 1),
                        "wb_stability": country.wb_political_stability,
                    }
                )

        score = min(weighted_score, 100.0)
        is_anomaly = score >= self.threshold

        return DetectionResult(
            bot_id=self.bot_id,
            bot_type=self.BOT_TYPE,
            score=score,
            is_anomaly=is_anomaly,
            threshold=self.threshold,
            summary=(
                f"[{'WB LIVE' if self._live else 'BASELINE'}] "
                f"Sovereign risk {score:.1f}/100 for {fund_name}"
            ),
            details={
                "fund_name": fund_name,
                "weighted_risk_score": round(score, 1),
                "high_risk_exposures": risk_breakdown,
                "source": "WORLD_BANK" if self._live else "BASELINE",
                "wb_updates": self._wb_updates,
            },
        )

    # ── World Bank fetch ───────────────────────────────────────────────────────

    async def _fetch_world_bank(self) -> int:
        """Pull political stability and governance indicators from World Bank API.
        Returns count of successfully updated countries."""
        updated = 0
        try:
            ctx = ssl.create_default_context(cafile=certifi.where())
            connector = aiohttp.TCPConnector(ssl=ctx)
            async with aiohttp.ClientSession(
                connector=connector,
                timeout=aiohttp.ClientTimeout(total=20),
            ) as session:
                for iso2 in COUNTRIES_TO_WATCH:
                    country = self._risk_db.get(iso2)
                    if not country:
                        continue
                    try:
                        url = WB_BATCH_URL.format(iso=iso2, indicator="PV.EST")
                        async with session.get(url) as resp:
                            if resp.status != 200:
                                continue
                            data = await resp.json(content_type=None)
                        # data[1] is the values array
                        if not data or len(data) < 2 or not data[1]:
                            continue
                        # Take most recent non-null value
                        wb_val = None
                        for entry in data[1]:
                            if entry.get("value") is not None:
                                wb_val = float(entry["value"])
                                break
                        if wb_val is None:
                            continue

                        risk_val = _wb_to_risk(wb_val)
                        country.wb_political_stability = round(wb_val, 3)
                        # Blend WB data (60%) with baseline (40%) for political risk
                        if risk_val is not None:
                            baseline = _BASE_RISK_DB[iso2].political_risk
                            country.political_risk = round(0.6 * risk_val + 0.4 * baseline, 1)

                        updated += 1
                        await asyncio.sleep(0.05)  # gentle rate limiting
                    except Exception:
                        continue

            if updated > 0:
                self._live = True
        except Exception as exc:
            log.warning("[SovereignBot] World Bank fetch failed: %s", exc)

        return updated

    async def _background_refresh(self) -> None:
        self._wb_updates = await self._fetch_world_bank()
        self._last_reload = time.time()
        log.info("[SovereignBot] World Bank refresh: %d countries updated", self._wb_updates)

    def _drift_risks(self) -> None:
        for country in self._risk_db.values():
            country.political_risk = max(
                0.0, min(100.0, country.political_risk + random.gauss(0, 0.3))
            )
            country.sanctions_risk = max(
                0.0, min(100.0, country.sanctions_risk + random.gauss(0, 0.2))
            )

    def cycle_interval_seconds(self) -> float:
        return 7.0
