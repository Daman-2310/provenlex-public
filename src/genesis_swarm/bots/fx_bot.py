from __future__ import annotations

import logging
import random
from collections import deque
from typing import Optional

import numpy as np

from ..shared.bot_base import DetectionResult, SwarmBot

log = logging.getLogger(__name__)

# ECB Statistical Data Warehouse — free, no API key required
ECB_API = "https://data-api.ecb.europa.eu/service/data/EXR/D.{currency}.EUR.SP00.A?lastNObservations=1&format=jsondata"

# Pairs we track: currency code → fallback seed rate (used if ECB call fails)
FX_PAIRS = {
    "USD": 1.085,
    "GBP": 0.856,
    "CHF": 0.962,
    "JPY": 163.4,
    "CNY": 7.84,
    "RUB": 88.5,
}

HIGH_RISK_CURRENCIES = {"RUB", "CNY"}


class FXBot(SwarmBot):
    """Bot 5 — Currency manipulation detector pulling live ECB reference rates."""

    BOT_TYPE = "FX_BOT"
    PERSONALITY = "SYSTEMATIC"
    PERSONALITY_LABEL = "Systematic"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._rates: dict[str, deque] = {c: deque(maxlen=60) for c in FX_PAIRS}
        self._baseline: dict[str, float] = {}
        self._live: bool = False  # True once first ECB fetch succeeds
        self._fetch_errors: int = 0

    async def initialise(self) -> None:
        # Try to seed with live ECB data, fall back to synthetic if offline
        fetched = await self._fetch_ecb_rates()
        if fetched:
            self._live = True
            log.info("[FXBot] LIVE — seeded from ECB with %d real rates", len(fetched))
        else:
            self._seed_synthetic()
            log.warning("[FXBot] ECB unreachable — running on synthetic data")

        for currency in FX_PAIRS:
            if self._rates[currency]:
                self._baseline[currency] = float(np.mean(list(self._rates[currency])))

    async def run_cycle(self) -> DetectionResult | None:
        # Fetch fresh ECB rates every cycle
        fetched = await self._fetch_ecb_rates()
        if fetched:
            self._live = True
            self._fetch_errors = 0
        else:
            self._fetch_errors += 1
            if self._fetch_errors >= 3:
                await self._healer.respond(
                    self.bot_id,
                    "feed_quality_degraded",
                    {"reason": "ECB API unreachable", "errors": self._fetch_errors},
                )
            self._simulate_tick()  # use last known + noise if ECB is down

        anomalies = []
        max_score = 0.0

        for currency in FX_PAIRS:
            if not self._rates[currency]:
                continue
            current = self._rates[currency][-1]
            prev = self._rates[currency][-2] if len(self._rates[currency]) >= 2 else current
            change = (current - prev) / (prev + 1e-9)

            score = self._score_pair(currency, current, change)
            if score >= self.threshold:
                anomalies.append(
                    {
                        "pair": f"EUR/{currency}",
                        "rate": round(current, 5),
                        "change_pct": round(change * 100, 4),
                        "score": round(score, 1),
                        "source": "ECB_LIVE" if self._live else "SYNTHETIC",
                    }
                )
                max_score = max(max_score, score)

        source_tag = "ECB LIVE" if self._live else "synthetic"

        if not anomalies:
            return DetectionResult(
                bot_id=self.bot_id,
                bot_type=self.BOT_TYPE,
                score=random.uniform(5, 30),
                is_anomaly=False,
                threshold=self.threshold,
                summary=f"FX markets nominal [{source_tag}]",
                details={
                    "fund_name": "FX-MACRO-LUX",
                    "source": source_tag,
                    "rates": self._current_rates(),
                },
            )

        top = anomalies[0]
        return DetectionResult(
            bot_id=self.bot_id,
            bot_type=self.BOT_TYPE,
            score=max_score,
            is_anomaly=True,
            threshold=self.threshold,
            summary=f"FX anomaly [{source_tag}]: {top['pair']} {top['change_pct']:+.4f}%",
            details={
                "fund_name": "FX-MACRO-LUX",
                "source": source_tag,
                "anomalies": anomalies,
                "score": max_score,
                "rates": self._current_rates(),
            },
        )

    # ── ECB API ────────────────────────────────────────────────────────────────

    async def _fetch_ecb_rates(self) -> dict[str, float]:
        """Pull latest reference rates from ECB. Returns {currency: rate} or {}."""
        try:
            import ssl

            import aiohttp
            import certifi

            ctx = ssl.create_default_context(cafile=certifi.where())
            connector = aiohttp.TCPConnector(ssl=ctx)
            fetched = {}
            async with aiohttp.ClientSession(
                connector=connector,
                timeout=aiohttp.ClientTimeout(total=8),
            ) as session:
                for currency in FX_PAIRS:
                    if currency == "RUB":
                        # ECB stopped publishing RUB after 2022 sanctions — use synthetic
                        continue
                    url = ECB_API.format(currency=currency)
                    async with session.get(url, headers={"Accept": "application/json"}) as resp:
                        if resp.status != 200:
                            continue
                        data = await resp.json(content_type=None)
                        rate = self._parse_ecb_response(data)
                        if rate:
                            self._rates[currency].append(rate)
                            fetched[currency] = rate
            return fetched
        except Exception as e:
            log.debug("[FXBot] ECB fetch error: %s", e)
            return {}

    @staticmethod
    def _parse_ecb_response(data: dict) -> Optional[float]:
        try:
            series = data["dataSets"][0]["series"]
            obs = list(series.values())[0]["observations"]
            latest = obs[str(max(int(k) for k in obs.keys()))]
            return float(latest[0])
        except Exception:
            return None

    # ── Fallbacks ──────────────────────────────────────────────────────────────

    def _seed_synthetic(self) -> None:
        rng = np.random.default_rng(42)
        for currency, seed in FX_PAIRS.items():
            rate = seed
            for _ in range(40):
                rate *= np.exp(rng.normal(0, 0.003))
                self._rates[currency].append(float(rate))

    def _simulate_tick(self) -> None:
        for currency in FX_PAIRS:
            last = self._rates[currency][-1] if self._rates[currency] else FX_PAIRS[currency]
            self._rates[currency].append(last * (1 + random.gauss(0, 0.002)))

    # ── Scoring ────────────────────────────────────────────────────────────────

    def _score_pair(self, currency: str, rate: float, change: float) -> float:
        score = 0.0
        abs_ch = abs(change)
        if abs_ch > 0.02:
            score += 50
        elif abs_ch > 0.01:
            score += 25
        elif abs_ch > 0.005:
            score += 10

        baseline = self._baseline.get(currency, rate)
        dev = abs(rate - baseline) / (baseline + 1e-9)
        if dev > 0.08:
            score += 35
        elif dev > 0.04:
            score += 15

        if currency in HIGH_RISK_CURRENCIES:
            score *= 1.25

        return min(score, 100.0)

    def _current_rates(self) -> dict[str, float]:
        return {f"EUR/{c}": round(self._rates[c][-1], 5) for c in FX_PAIRS if self._rates[c]}

    def cycle_interval_seconds(self) -> float:
        return 30.0  # ECB updates once per day — poll every 30s is plenty
