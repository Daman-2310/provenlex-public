from __future__ import annotations

import asyncio
import logging
import random
import time
from collections import deque

import numpy as np

from ..shared.bot_base import DetectionResult, SwarmBot

log = logging.getLogger(__name__)

# Yahoo Finance tickers for energy commodities (futures)
_ENERGY_TICKERS: dict[str, str] = {
    "crude_oil_wti": "CL=F",  # WTI crude oil front-month futures (USD/bbl)
    "natural_gas_tt": "NG=F",  # Natural gas Henry Hub futures (USD/MMBtu)
    "heating_oil": "HO=F",  # Heating oil futures (USD/gal)
    "bunker_fuel_380": "BZ=F",  # Brent crude as bunker proxy (USD/bbl)
    "lng_spot": "TTF=F",  # TTF gas futures where available
}

# Seed prices used when yfinance is unavailable
_SEED_PRICES: dict[str, float] = {
    "crude_oil_wti": 78.50,
    "natural_gas_tt": 2.80,
    "heating_oil": 2.45,
    "bunker_fuel_380": 79.00,
    "lng_spot": 2.90,
}

ENERGY_PRODUCTS = list(_SEED_PRICES.keys())


def _sync_fetch_prices() -> dict[str, float]:
    """Synchronous yfinance batch fetch — runs in a thread pool."""
    import yfinance as yf

    prices: dict[str, float] = {}
    for product, ticker in _ENERGY_TICKERS.items():
        try:
            hist = yf.Ticker(ticker).history(period="5d", auto_adjust=True)
            if hist.empty:
                continue
            close = hist["Close"].dropna()
            if close.empty:
                continue
            prices[product] = float(close.iloc[-1])
        except Exception as exc:
            log.debug("[FuelBot] yfinance fetch failed for %s (%s): %s", product, ticker, exc)
    return prices


def _sync_fetch_history(days: int = 90) -> dict[str, list[float]]:
    """Fetch 90-day history for each energy product (seed the baseline)."""
    import yfinance as yf

    result: dict[str, list[float]] = {}
    for product, ticker in _ENERGY_TICKERS.items():
        try:
            hist = yf.Ticker(ticker).history(period=f"{days + 10}d", auto_adjust=True)
            if hist.empty or len(hist) < 5:
                continue
            prices = hist["Close"].dropna().tolist()
            result[product] = [float(p) for p in prices[-days:]]
        except Exception:
            pass
    return result


class FuelBot(SwarmBot):
    """Bot 3 — Energy price manipulation detector using live yfinance commodity futures."""

    BOT_TYPE = "COMMODITY_MONITOR"
    PERSONALITY = "MOMENTUM"
    PERSONALITY_LABEL = "Momentum"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._prices: dict[str, deque] = {p: deque(maxlen=90) for p in ENERGY_PRODUCTS}
        self._baseline: dict[str, float] = {}
        self._live = False
        self._fetch_errors = 0
        self._last_live_fetch = 0.0

    async def initialise(self) -> None:
        # Seed with real 90-day history
        try:
            history = await asyncio.to_thread(_sync_fetch_history, 90)
            if history:
                for product, prices in history.items():
                    for p in prices:
                        self._prices[product].append(p)
                    if prices:
                        self._baseline[product] = float(np.mean(prices))
                self._live = True
                n_products = len(history)
                log.info(
                    "[FuelBot] LIVE — seeded %d energy products from Yahoo Finance", n_products
                )
            else:
                raise ValueError("no data returned")
        except Exception as exc:
            log.warning("[FuelBot] yfinance history failed (%s) — using synthetic seed", exc)
            self._seed_synthetic()

        # Fill any missing products with synthetic
        for product, seed in _SEED_PRICES.items():
            if not self._prices[product]:
                self._seed_product(product, seed)
            if product not in self._baseline:
                self._baseline[product] = seed

        log.info(
            "[FuelBot] Ready — %d products, baseline WTI=%.2",
            len(ENERGY_PRODUCTS),
            self._baseline.get("crude_oil_wti", 0),
        )

    async def run_cycle(self) -> DetectionResult | None:
        # Fetch live prices every 60s (futures don't change faster than that)
        now = time.time()
        if now - self._last_live_fetch >= 60.0:
            await self._refresh_live_prices()
            self._last_live_fetch = now
        else:
            # Intra-cycle: simulate micro-ticks between live fetches
            self._simulate_tick()

        anomalies: list[dict] = []
        max_score = 0.0

        for product in ENERGY_PRODUCTS:
            if not self._prices[product]:
                continue
            current = self._prices[product][-1]
            prev = self._prices[product][-2] if len(self._prices[product]) >= 2 else current
            change = (current - prev) / (prev + 1e-9)

            score = self._score_product(product, current, change)
            if score >= self.threshold:
                anomalies.append(
                    {
                        "product": product,
                        "price": round(current, 4),
                        "change_pct": round(change * 100, 3),
                        "score": round(score, 1),
                        "ticker": _ENERGY_TICKERS.get(product, "N/A"),
                    }
                )
                max_score = max(max_score, score)

        source_tag = "LIVE" if self._live else "SIM"

        if not anomalies:
            return DetectionResult(
                bot_id=self.bot_id,
                bot_type=self.BOT_TYPE,
                score=random.uniform(10, 40),
                is_anomaly=False,
                threshold=self.threshold,
                summary=(
                    f"[{source_tag}] Energy markets nominal — WTI ${self._prices['crude_oil_wti'][-1]:.2f}"
                    if self._prices["crude_oil_wti"]
                    else f"[{source_tag}] Energy markets nominal"
                ),
                details={
                    "fund_name": "ENERGY-INFRA-LUX",
                    "source": source_tag,
                    "prices": self._current_prices(),
                },
            )

        top = anomalies[0]
        return DetectionResult(
            bot_id=self.bot_id,
            bot_type=self.BOT_TYPE,
            score=max_score,
            is_anomaly=True,
            threshold=self.threshold,
            summary=f"[{source_tag}] Energy anomaly: {top['product']} {top['change_pct']:+.2f}%",
            details={
                "fund_name": "ENERGY-INFRA-LUX",
                "anomalies": anomalies,
                "score": max_score,
                "source": source_tag,
                "prices": self._current_prices(),
            },
        )

    # ── Live fetch ─────────────────────────────────────────────────────────────

    async def _refresh_live_prices(self) -> None:
        try:
            fresh = await asyncio.to_thread(_sync_fetch_prices)
            if fresh:
                for product, price in fresh.items():
                    self._prices[product].append(price)
                self._live = True
                self._fetch_errors = 0
                log.debug(
                    "[FuelBot] Live prices refreshed: %s",
                    {k: round(v, 2) for k, v in fresh.items()},
                )
            else:
                raise ValueError("empty fetch")
        except Exception as exc:
            self._fetch_errors += 1
            log.debug("[FuelBot] Live fetch error #%d: %s", self._fetch_errors, exc)
            if self._fetch_errors >= 3:
                await self._healer.respond(
                    self.bot_id,
                    "feed_quality_degraded",
                    {"reason": "yfinance energy futures unavailable", "errors": self._fetch_errors},
                )
            self._simulate_tick()

    # ── Simulation ─────────────────────────────────────────────────────────────

    def _simulate_tick(self) -> None:
        for product in ENERGY_PRODUCTS:
            last = self._prices[product][-1] if self._prices[product] else _SEED_PRICES[product]
            change = random.gauss(0, 0.008)
            # Occasional spike (4% chance)
            if random.random() < 0.04:
                change += random.choice([-1, 1]) * random.uniform(0.03, 0.10)
            self._prices[product].append(last * (1.0 + change))

    def _seed_synthetic(self) -> None:
        rng = np.random.default_rng(42)
        for product, seed in _SEED_PRICES.items():
            price = seed
            for _ in range(60):
                price *= np.exp(rng.normal(0, 0.012))
                self._prices[product].append(float(price))
            self._baseline[product] = float(np.mean(list(self._prices[product])))

    def _seed_product(self, product: str, seed: float) -> None:
        rng = np.random.default_rng(hash(product) % (2**31))
        price = seed
        for _ in range(30):
            price *= np.exp(rng.normal(0, 0.012))
            self._prices[product].append(float(price))

    # ── Scoring ────────────────────────────────────────────────────────────────

    def _score_product(self, product: str, price: float, change: float) -> float:
        score = 0.0
        abs_change = abs(change)
        if abs_change > 0.10:
            score += 60
        elif abs_change > 0.05:
            score += 30
        elif abs_change > 0.03:
            score += 15

        baseline = self._baseline.get(product, price)
        deviation = abs(price - baseline) / (baseline + 1e-9)
        if deviation > 0.25:
            score += 30
        elif deviation > 0.15:
            score += 15

        return min(score, 100.0)

    def _current_prices(self) -> dict[str, float]:
        return {p: round(self._prices[p][-1], 4) for p in ENERGY_PRODUCTS if self._prices[p]}

    def cycle_interval_seconds(self) -> float:
        return 4.0
