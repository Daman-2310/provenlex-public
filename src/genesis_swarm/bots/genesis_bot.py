from __future__ import annotations

import asyncio
import logging
from typing import Optional

import numpy as np
import pandas as pd

from ..shared.bot_base import DetectionResult, SwarmBot

log = logging.getLogger(__name__)

FEATURE_NAMES = [
    "nav_change_pct",
    "nav_z_score_90d",
    "nav_rolling_vol_30d",
    "nav_drawdown_30d",
    "nav_momentum_5d",
    "nav_rsi_14",
]

# Real Luxembourg-domiciled UCITS ETFs on Euronext Amsterdam
# These are used as NAV proxies — real fund NAVs aren't published intraday
UCITS_TICKERS = {
    "MARITIME-ALPHA-LUX": "IWDA.AS",  # iShares Core MSCI World UCITS ETF
    "ENERGY-INFRA-LUX": "CSPX.AS",  # iShares Core S&P 500 UCITS ETF
    "SOVEREIGN-WEALTH-LUX": "VWRL.AS",  # Vanguard FTSE All-World UCITS ETF
}


def _compute_features(series: pd.Series) -> Optional[np.ndarray]:
    if len(series) < 30:
        return None
    s = series.astype(float)
    ch = s.pct_change().iloc[-1]
    mu = s.rolling(90, min_periods=30).mean().iloc[-1]
    std = s.rolling(90, min_periods=30).std().iloc[-1]
    z = (s.iloc[-1] - mu) / (std + 1e-9)
    vol = s.pct_change().rolling(30).std().iloc[-1]
    peak = s.rolling(30).max().iloc[-1]
    dd = (s.iloc[-1] - peak) / (peak + 1e-9)
    mom = (s.iloc[-1] - s.iloc[-5]) / (s.iloc[-5] + 1e-9) if len(s) >= 5 else 0.0
    delta = s.pct_change()
    gain = delta.clip(lower=0).rolling(14).mean().iloc[-1]
    loss = (-delta.clip(upper=0)).rolling(14).mean().iloc[-1]
    rsi = 100 - (100 / (1 + gain / (loss + 1e-9)))
    return np.array([ch, z, vol, dd, mom, rsi], dtype=float)


def _sync_fetch_history(ticker: str, days: int = 252) -> Optional[pd.Series]:
    """Synchronous NAV history fetch — call via asyncio.to_thread."""
    try:
        import yfinance as yf

        hist = yf.Ticker(ticker).history(period=f"{days + 50}d", auto_adjust=True)
        if hist.empty or len(hist) < 30:
            return None
        series = hist["Close"].dropna()
        series.index = series.index.tz_localize(None)
        log.info("[GenesisBot] Fetched %d real NAV points for %s", len(series), ticker)
        return series
    except Exception as e:
        log.debug("[GenesisBot] Yahoo Finance fetch failed for %s: %s", ticker, e)
        return None


def _sync_fetch_latest_price(ticker: str) -> Optional[float]:
    """Synchronous latest-price fetch — call via asyncio.to_thread."""
    try:
        import yfinance as yf

        hist = yf.Ticker(ticker).history(period="3d", auto_adjust=True)
        if hist.empty:
            return None
        close = hist["Close"].dropna()
        return float(close.iloc[-1]) if not close.empty else None
    except Exception:
        return None


class GenesisBot(SwarmBot):
    """Bot 1 — NAV Anomaly Detector trained on real UCITS ETF data (Yahoo Finance)."""

    BOT_TYPE = "NAV_DETECTOR"
    PERSONALITY = "CONTRARIAN"
    PERSONALITY_LABEL = "Contrarian"

    def __init__(self, fund_name: str = "MARITIME-ALPHA-LUX", **kwargs):
        super().__init__(**kwargs)
        self.fund_name = fund_name
        self._ticker = UCITS_TICKERS.get(fund_name, "IWDA.AS")
        self._history: list[float] = []
        self._model = None
        self._trained = False
        self._live = False
        self._fetch_errors = 0

    async def initialise(self) -> None:
        import asyncio

        from sklearn.ensemble import IsolationForest

        # Try real data first (non-blocking)
        real_series = await asyncio.to_thread(_sync_fetch_history, self._ticker)
        if real_series is not None and len(real_series) >= 60:
            self._history = real_series.tolist()
            self._live = True
            log.info(
                "[GenesisBot] LIVE — trained on %d real NAV points from %s",
                len(self._history),
                self._ticker,
            )
        else:
            self._history = self._synthetic_history(252)
            log.warning("[GenesisBot] Yahoo Finance unavailable — using synthetic data")

        series = pd.Series(self._history)
        X = [_compute_features(series.iloc[:i]) for i in range(30, len(series))]
        X = np.array([f for f in X if f is not None])
        import os

        import joblib

        model_path = "genesis_bot_model.joblib"
        if os.path.exists(model_path):
            self._model = joblib.load(model_path)
            self._trained = True
            log.info("[GenesisBot] Model loaded from disk: %s", model_path)
        else:
            self._model = IsolationForest(contamination=0.05, random_state=42)
            self._model.fit(X)
            joblib.dump(self._model, model_path)
            self._trained = True
            source = f"Yahoo Finance ({self._ticker})" if self._live else "synthetic GBM"
            log.info(
                "[GenesisBot] Model trained on %d feature vectors and saved to disk — source: %s",
                len(X),
                source,
            )

    async def run_cycle(self) -> DetectionResult | None:
        if not self._trained:
            return None

        # Try to get a fresh live price (non-blocking)
        if self._live:
            latest = await asyncio.to_thread(_sync_fetch_latest_price, self._ticker)
            if latest:
                self._fetch_errors = 0
                new_nav = latest
            else:
                self._fetch_errors += 1
                if self._fetch_errors >= 3:
                    await self._healer.respond(
                        self.bot_id,
                        "feed_quality_degraded",
                        {"reason": "Yahoo Finance unreachable", "ticker": self._ticker},
                    )
                new_nav = self._simulate_next()
        else:
            new_nav = self._simulate_next()

        self._history.append(float(new_nav))
        if len(self._history) > 500:
            self._history = self._history[-500:]

        series = pd.Series(self._history)
        feat = _compute_features(series)
        if feat is None:
            return None

        raw = self._model.decision_function([feat])[0]
        score = float(np.clip((0.5 - raw) * 200, 0, 100))
        is_anomaly = score >= self.threshold
        source = f"LIVE ({self._ticker})" if self._live else "synthetic"

        return DetectionResult(
            bot_id=self.bot_id,
            bot_type=self.BOT_TYPE,
            score=score,
            is_anomaly=is_anomaly,
            threshold=self.threshold,
            summary=f"NAV {score:.1f}/100 [{source}] — {self.fund_name}",
            details={
                "fund_name": self.fund_name,
                "ticker": self._ticker,
                "nav": round(new_nav, 4),
                "source": source,
                "score": score,
                "features": dict(zip(FEATURE_NAMES, feat.tolist())),
            },
        )

    def _simulate_next(self) -> float:
        last = self._history[-1] if self._history else 100.0
        rng = np.random.default_rng()
        return last * np.exp(rng.normal(0.06 / 252, 0.12 / np.sqrt(252)))

    @staticmethod
    def _synthetic_history(days: int) -> list[float]:
        rng = np.random.default_rng(42)
        nav, result = 100.0, []
        for _ in range(days):
            nav *= np.exp(rng.normal(0.06 / 252, 0.12 / np.sqrt(252)))
            result.append(nav)
        return result

    def cycle_interval_seconds(self) -> float:
        return 60.0  # Yahoo Finance is daily data — no need to hammer every 2s
