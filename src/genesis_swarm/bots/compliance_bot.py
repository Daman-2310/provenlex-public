from __future__ import annotations
import logging
from ..shared.bot_base import DetectionResult, SwarmBot
import numpy as np
from dataclasses import dataclass, field
import time
import random

import asyncio
from ..shared.native_compliance import check_aifmd_from_ratios, native_available as _rust_available


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

# Real UCITS ETFs on Euronext Amsterdam — used as live NAV proxies for fund monitoring.
# Each fund is mapped to a representative ETF whose price history drives real compliance metrics.
FUND_TICKERS: dict[str, str] = {
    "MARITIME-ALPHA-LUX": "IWDA.AS",  # iShares Core MSCI World UCITS
    "ENERGY-INFRA-LUX": "INRG.AS",  # iShares Global Clean Energy UCITS
    "SOVEREIGN-WEALTH-LUX": "VWRL.AS",  # Vanguard FTSE All-World UCITS
    "ASIA-MACRO-LUX": "EIMI.AS",  # iShares Core MSCI EM IMI UCITS
    "FX-MACRO-LUX": "AGGH.AS",  # iShares Core Global Aggregate Bond UCITS
}

# Real AIFMD/UCITS regulatory thresholds (ESMA guidelines + CSSF circular)
AIFMD_RULES = {
    "leverage_breach": lambda f: f.leverage_ratio > 3.0,
    "liquidity_breach": lambda f: f.liquidity_ratio < 0.10,
    "concentration_breach": lambda f: f.concentration_top5 > 0.40,
    "redemption_stress": lambda f: f.redemption_queue_pct > 0.15,
    "reporting_overdue": lambda f: f.reporting_delay_days > 30,
    "audit_overdue": lambda f: f.last_audit_days > 365,
    "nav_drawdown": lambda f: f.nav_drawdown_30d < -0.10,
    "high_volatility": lambda f: f.nav_vol_30d > 0.25,
}

RULE_WEIGHTS = {
    "leverage_breach": 35,
    "liquidity_breach": 30,
    "concentration_breach": 20,
    "redemption_stress": 25,
    "reporting_overdue": 15,
    "audit_overdue": 10,
    "nav_drawdown": 30,
    "high_volatility": 20,
}


@dataclass(init=False)
class FundSnapshot:
    fund_id: str
    fund_name: str
    ticker: str
    nav: float
    aum_eur: float
    leverage_ratio: float
    liquidity_ratio: float
    concentration_top5: float
    redemption_queue_pct: float
    reporting_delay_days: int
    last_audit_days: int
    nav_drawdown_30d: float = 0.0
    nav_vol_30d: float = 0.0
    nav_history: list[float] = field(default_factory=list)
    source: str = "SIM"

    def __init__(
        self,
        fund_id: str,
        fund_name: str,
        *args,
        ticker: str | None = None,
        nav: float | None = None,
        aum_eur: float | None = None,
        leverage_ratio: float | None = None,
        liquidity_ratio: float | None = None,
        concentration_top5: float | None = None,
        redemption_queue_pct: float | None = None,
        reporting_delay_days: int | None = None,
        last_audit_days: int | None = None,
        nav_drawdown_30d: float = 0.0,
        nav_vol_30d: float = 0.0,
        nav_history: list[float] | None = None,
        source: str = "SIM",
    ) -> None:
        if args:
            if len(args) == 8:
                (
                    nav,
                    aum_eur,
                    leverage_ratio,
                    liquidity_ratio,
                    concentration_top5,
                    redemption_queue_pct,
                    reporting_delay_days,
                    last_audit_days,
                ) = args
                ticker = ticker or FUND_TICKERS.get(fund_name, "SIM")
            elif len(args) == 9:
                (
                    ticker,
                    nav,
                    aum_eur,
                    leverage_ratio,
                    liquidity_ratio,
                    concentration_top5,
                    redemption_queue_pct,
                    reporting_delay_days,
                    last_audit_days,
                ) = args
            else:
                raise TypeError(
                    "FundSnapshot expects either 8 legacy positional metrics "
                    "or 9 positional values including ticker"
                )

        missing = [
            name
            for name, value in {
                "ticker": ticker,
                "nav": nav,
                "aum_eur": aum_eur,
                "leverage_ratio": leverage_ratio,
                "liquidity_ratio": liquidity_ratio,
                "concentration_top5": concentration_top5,
                "redemption_queue_pct": redemption_queue_pct,
                "reporting_delay_days": reporting_delay_days,
                "last_audit_days": last_audit_days,
            }.items()
            if value is None
        ]
        if missing:
            raise TypeError(f"Missing required FundSnapshot fields: {', '.join(missing)}")

        self.fund_id = fund_id
        self.fund_name = fund_name
        self.ticker = str(ticker)
        self.nav = float(nav)
        self.aum_eur = float(aum_eur)
        self.leverage_ratio = float(leverage_ratio)
        self.liquidity_ratio = float(liquidity_ratio)
        self.concentration_top5 = float(concentration_top5)
        self.redemption_queue_pct = float(redemption_queue_pct)
        self.reporting_delay_days = int(reporting_delay_days)
        self.last_audit_days = int(last_audit_days)
        self.nav_drawdown_30d = float(nav_drawdown_30d)
        self.nav_vol_30d = float(nav_vol_30d)
        self.nav_history = list(nav_history or [])
        self.source = source


def _sync_fetch_nav_history(ticker: str, days: int = 90) -> list[float] | None:
    """Synchronous yfinance fetch for NAV history."""
    try:
        import yfinance as yf

        hist = yf.Ticker(ticker).history(period=f"{days + 10}d", auto_adjust=True)
        if hist.empty or len(hist) < 20:
            return None
        prices = hist["Close"].dropna().tolist()
        return [float(p) for p in prices[-days:]]
    except Exception as exc:
        log.debug("[ComplianceBot] yfinance fetch failed for %s: %s", ticker, exc)
        return None


def _compute_nav_metrics(prices: list[float]) -> tuple[float, float]:
    """Returns (nav_drawdown_30d, nav_vol_30d_annualized) from price history."""
    if len(prices) < 10:
        return 0.0, 0.0
    arr = np.array(prices[-30:] if len(prices) >= 30 else prices)
    peak = float(np.max(arr))
    current = arr[-1]
    drawdown = (current - peak) / (peak + 1e-9)
    returns = np.diff(arr) / (arr[:-1] + 1e-9)
    vol = float(np.std(returns) * np.sqrt(252)) if len(returns) >= 2 else 0.0
    return round(drawdown, 4), round(vol, 4)


def _vol_to_leverage(vol: float) -> float:
    """Higher volatility → implied leverage heuristic (from AIFMD commitment approach)."""
    if vol > 0.40:
        return 3.2 + random.gauss(0, 0.1)
    elif vol > 0.25:
        return 2.4 + random.gauss(0, 0.15)
    elif vol > 0.15:
        return 1.8 + random.gauss(0, 0.1)
    return 1.2 + random.gauss(0, 0.05)


def _drawdown_to_liquidity(drawdown: float) -> float:
    """Larger drawdown → redemption pressure → lower liquidity ratio."""
    base = 0.25
    if drawdown < -0.15:
        return max(0.03, base + drawdown)
    elif drawdown < -0.08:
        return max(0.08, base + drawdown * 0.5)
    return base + random.gauss(0, 0.02)


class ComplianceBot(SwarmBot):
    """Bot 6 — AIFMD/UCITS breach detector driven by real ETF NAV data via yfinance."""

    BOT_TYPE = "COMPLIANCE_BOT"
    PERSONALITY = "CONSERVATIVE"
    PERSONALITY_LABEL = "Conservative"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._funds: list[FundSnapshot] = []
        self._live_count = 0
        self._last_nav_refresh = 0.0

    async def initialise(self) -> None:
        self._funds = await self._build_fund_snapshots()
        source = f"{self._live_count}/{len(self._funds)} live (yfinance)"
        log.info("[ComplianceBot] %s funds loaded — %s", len(self._funds), source)

    async def run_cycle(self) -> DetectionResult | None:
        # Refresh NAV data every 5 minutes
        if time.time() - self._last_nav_refresh > 300:
            _fire_task(self._refresh_navs())

        fund = random.choice(self._funds)
        self._drift_fund(fund)

        # ── Rust native hot path: AIFMD/DORA limits via sovereign-engine ─────────
        # check_aifmd_from_ratios() routes to genesis_native (PyO3) when built;
        # falls back to identical pure-Python path otherwise.
        native_result = check_aifmd_from_ratios(
            gross_leverage     = fund.leverage_ratio,
            net_leverage       = fund.leverage_ratio * 0.65,
            concentration_top5 = fund.concentration_top5,
            dora_score         = 0.0,
        )
        breaches = [rule for rule, check in AIFMD_RULES.items() if check(fund)]
        if native_result.gross_breach and 'leverage_breach' not in breaches:
            breaches.append('leverage_breach')
        if native_result.concentration_breach and 'concentration_breach' not in breaches:
            breaches.append('concentration_breach')
        score = min(sum(RULE_WEIGHTS.get(b, 10) for b in breaches) + random.uniform(0, 5), 100.0)
        is_anomaly = (not native_result.compliant or len(breaches) > 0) and score >= self.threshold
        source_tag = fund.source + ('/rust' if _rust_available() else '/py')

        return DetectionResult(
            bot_id=self.bot_id,
            bot_type=self.BOT_TYPE,
            score=score,
            is_anomaly=is_anomaly,
            threshold=self.threshold,
            summary=(
                f"[{source_tag}] {fund.fund_name}: {len(breaches)} AIFMD breach(es) — {score:.1f}"
            ),
            details={
                "fund_name": fund.fund_name,
                "fund_id": fund.fund_id,
                "ticker": fund.ticker,
                "breaches": breaches,
                "leverage_ratio": round(fund.leverage_ratio, 2),
                "liquidity_ratio": round(fund.liquidity_ratio, 3),
                "concentration_top5": round(fund.concentration_top5, 3),
                "redemption_queue_pct": round(fund.redemption_queue_pct, 3),
                "reporting_delay_days": fund.reporting_delay_days,
                "nav": round(fund.nav, 4),
                "nav_drawdown_30d": round(fund.nav_drawdown_30d, 4),
                "nav_vol_30d": round(fund.nav_vol_30d, 4),
                "score": round(score, 1),
                "source": source_tag,
            },
        )

    # ── Fund snapshot builder ──────────────────────────────────────────────────

    async def _build_fund_snapshots(self) -> list[FundSnapshot]:
        snapshots: list[FundSnapshot] = []
        seed_params = [
            ("F001", "MARITIME-ALPHA-LUX", 420e6, 0.03, 5, 180),
            ("F002", "ENERGY-INFRA-LUX", 280e6, 0.05, 12, 320),
            ("F003", "SOVEREIGN-WEALTH-LUX", 680e6, 0.01, 3, 90),
            ("F004", "ASIA-MACRO-LUX", 150e6, 0.08, 28, 400),
            ("F005", "FX-MACRO-LUX", 95e6, 0.20, 45, 380),
        ]

        for fund_id, fund_name, aum, redeem_q, rep_delay, audit_age in seed_params:
            ticker = FUND_TICKERS[fund_name]
            prices = await asyncio.to_thread(_sync_fetch_nav_history, ticker, 90)

            if prices and len(prices) >= 20:
                nav = prices[-1]
                drawdown, vol = _compute_nav_metrics(prices)
                leverage = _vol_to_leverage(vol)
                liquidity = _drawdown_to_liquidity(drawdown)
                source = "YF_LIVE"
                self._live_count += 1
                log.info(
                    "[ComplianceBot] %s: NAV=%.2f dd=%.2f%% vol=%.1f%%",
                    fund_name,
                    nav,
                    drawdown * 100,
                    vol * 100,
                )
            else:
                # Synthetic fallback
                nav = {"F001": 98.5, "F002": 102.3, "F003": 95.7, "F004": 88.4, "F005": 101.1}[
                    fund_id
                ]
                drawdown = random.gauss(-0.03, 0.02)
                vol = random.uniform(0.10, 0.30)
                leverage = {"F001": 1.8, "F002": 2.1, "F003": 1.2, "F004": 2.8, "F005": 3.5}[
                    fund_id
                ]
                liquidity = {"F001": 0.22, "F002": 0.15, "F003": 0.45, "F004": 0.08, "F005": 0.05}[
                    fund_id
                ]
                prices = []
                source = "SIM"

            snapshots.append(
                FundSnapshot(
                    fund_id=fund_id,
                    fund_name=fund_name,
                    ticker=ticker,
                    nav=float(nav),
                    aum_eur=aum,
                    leverage_ratio=float(leverage),
                    liquidity_ratio=max(0.0, min(1.0, float(liquidity))),
                    concentration_top5={
                        "F001": 0.28,
                        "F002": 0.32,
                        "F003": 0.18,
                        "F004": 0.38,
                        "F005": 0.45,
                    }[fund_id],
                    redemption_queue_pct=float(redeem_q),
                    reporting_delay_days=rep_delay,
                    last_audit_days=audit_age,
                    nav_drawdown_30d=float(drawdown),
                    nav_vol_30d=float(vol),
                    nav_history=prices,
                    source=source,
                )
            )

        return snapshots

    async def _refresh_navs(self) -> None:
        for fund in self._funds:
            prices = await asyncio.to_thread(_sync_fetch_nav_history, fund.ticker, 90)
            if prices and len(prices) >= 20:
                fund.nav = prices[-1]
                fund.nav_history = prices
                drawdown, vol = _compute_nav_metrics(prices)
                fund.nav_drawdown_30d = drawdown
                fund.nav_vol_30d = vol
                fund.leverage_ratio = _vol_to_leverage(vol)
                fund.liquidity_ratio = max(0.0, min(1.0, _drawdown_to_liquidity(drawdown)))
                fund.source = "YF_LIVE"
        self._last_nav_refresh = time.time()
        log.debug("[ComplianceBot] NAV refresh complete")

    # ── Fund drift (between live refreshes) ────────────────────────────────────

    def _drift_fund(self, fund: FundSnapshot) -> None:
        fund.leverage_ratio = max(0.5, fund.leverage_ratio + random.gauss(0, 0.03))
        fund.liquidity_ratio = max(0.0, min(1.0, fund.liquidity_ratio + random.gauss(0, 0.005)))
        fund.concentration_top5 = max(
            0.0, min(1.0, fund.concentration_top5 + random.gauss(0, 0.005))
        )
        fund.redemption_queue_pct = max(
            0.0, min(1.0, fund.redemption_queue_pct + random.gauss(0, 0.003))
        )
        fund.reporting_delay_days += random.choice([0, 0, 0, 1])

    def cycle_interval_seconds(self) -> float:
        return 5.0
