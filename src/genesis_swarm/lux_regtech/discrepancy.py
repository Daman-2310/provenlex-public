"""
COMPONENT 2 — Cross-Departmental Discrepancy Engine
====================================================

Eliminates internal data silos by cross-referencing three live streams and
flagging anomalies *before* regulatory submission.

Streams
-------
A. Valuation / NAV          — per-asset valuations + fund NAV
B. Risk / Liquidity / VaR   — liquidity buffer, VaR, redemption coverage
C. Asset Allocation / Trades — live asset weights + prospectus limits

Reconciliation rules
--------------------
* NAV-vs-liquidity misalignment  > 0.50%  -> discrepancy
* Asset weight breaching prospectus guideline -> discrepancy
* Stream-A asset set vs Stream-C asset set divergence -> discrepancy

The pipeline is asynchronous so multiple sub-funds reconcile concurrently, and
every run is written to an audit trail for internal sign-off.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from enum import Enum

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/reconciliation", tags=["discrepancy-engine"])

NAV_LIQUIDITY_TOLERANCE = 0.005   # 0.50%
WEIGHT_BREACH_EPSILON = 1e-6


# ── Stream models ───────────────────────────────────────────────────────────────

class AssetValuation(BaseModel):
    asset_id: str
    market_value_eur: float = Field(..., ge=0)


class StreamA_Valuation(BaseModel):
    fund_id: str
    reported_nav_eur: float = Field(..., gt=0)
    assets: list[AssetValuation]


class StreamB_Risk(BaseModel):
    fund_id: str
    liquidity_buffer_eur: float = Field(..., ge=0)
    var_95_eur: float = Field(..., ge=0)
    redemption_obligations_eur: float = Field(..., ge=0)


class AssetWeight(BaseModel):
    asset_id: str
    weight: float = Field(..., ge=0, le=1)
    prospectus_max_weight: float = Field(..., ge=0, le=1)


class StreamC_Allocation(BaseModel):
    fund_id: str
    weights: list[AssetWeight]


class ReconciliationRequest(BaseModel):
    stream_a: StreamA_Valuation
    stream_b: StreamB_Risk
    stream_c: StreamC_Allocation


# ── Result models ───────────────────────────────────────────────────────────────

class Severity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class Discrepancy(BaseModel):
    code: str
    severity: Severity
    detail: str
    observed: float | None = None
    threshold: float | None = None


class ReconciliationResult(BaseModel):
    fund_id: str
    reconciled_at: str
    clean: bool
    discrepancies: list[Discrepancy]
    computed: dict


# ── Core logic ───────────────────────────────────────────────────────────────────

def _reconcile(req: ReconciliationRequest) -> ReconciliationResult:
    a, b, c = req.stream_a, req.stream_b, req.stream_c
    discrepancies: list[Discrepancy] = []

    # 1) NAV reconstruction from Stream A asset valuations vs reported NAV
    summed_assets = sum(x.market_value_eur for x in a.assets)
    nav_gap = abs(summed_assets - a.reported_nav_eur) / a.reported_nav_eur
    if nav_gap > NAV_LIQUIDITY_TOLERANCE:
        discrepancies.append(Discrepancy(
            code="NAV_ASSET_SUM_MISMATCH", severity=Severity.CRITICAL,
            detail=(f"Sum of asset valuations (€{summed_assets:,.2f}) deviates "
                    f"{nav_gap:.2%} from reported NAV (€{a.reported_nav_eur:,.2f})."),
            observed=round(nav_gap, 6), threshold=NAV_LIQUIDITY_TOLERANCE,
        ))

    # 2) NAV-vs-liquidity-buffer alignment (>0.5% misalignment between the
    #    liquidity buffer's implied coverage and NAV-derived expectation)
    implied_buffer = b.liquidity_buffer_eur / a.reported_nav_eur
    # Expectation: buffer should at least cover redemption obligations.
    coverage = (
        b.liquidity_buffer_eur / b.redemption_obligations_eur
        if b.redemption_obligations_eur > 0 else float("inf")
    )
    buffer_gap = abs(b.liquidity_buffer_eur - b.redemption_obligations_eur) / a.reported_nav_eur
    if coverage < 1.0 and buffer_gap > NAV_LIQUIDITY_TOLERANCE:
        discrepancies.append(Discrepancy(
            code="LIQUIDITY_COVERAGE_SHORTFALL", severity=Severity.CRITICAL,
            detail=(f"Liquidity buffer (€{b.liquidity_buffer_eur:,.2f}) covers only "
                    f"{coverage:.2%} of redemption obligations; NAV-relative gap "
                    f"{buffer_gap:.2%} exceeds {NAV_LIQUIDITY_TOLERANCE:.2%}."),
            observed=round(buffer_gap, 6), threshold=NAV_LIQUIDITY_TOLERANCE,
        ))

    # 3) VaR sanity vs buffer (VaR exceeding the liquidity buffer is a warning)
    if b.var_95_eur > b.liquidity_buffer_eur:
        discrepancies.append(Discrepancy(
            code="VAR_EXCEEDS_BUFFER", severity=Severity.WARNING,
            detail=(f"95% VaR (€{b.var_95_eur:,.2f}) exceeds liquidity buffer "
                    f"(€{b.liquidity_buffer_eur:,.2f})."),
            observed=b.var_95_eur, threshold=b.liquidity_buffer_eur,
        ))

    # 4) Prospectus weight breaches (Stream C)
    total_weight = sum(w.weight for w in c.weights)
    if abs(total_weight - 1.0) > 0.01:
        discrepancies.append(Discrepancy(
            code="WEIGHTS_DO_NOT_SUM", severity=Severity.WARNING,
            detail=f"Asset weights sum to {total_weight:.4f}, expected ~1.0.",
            observed=round(total_weight, 6), threshold=1.0,
        ))
    for w in c.weights:
        if w.weight > w.prospectus_max_weight + WEIGHT_BREACH_EPSILON:
            discrepancies.append(Discrepancy(
                code="PROSPECTUS_WEIGHT_BREACH", severity=Severity.CRITICAL,
                detail=(f"Asset {w.asset_id} weight {w.weight:.2%} breaches prospectus "
                        f"limit {w.prospectus_max_weight:.2%}."),
                observed=w.weight, threshold=w.prospectus_max_weight,
            ))

    # 5) Cross-stream asset-set divergence (A vs C)
    a_ids = {x.asset_id for x in a.assets}
    c_ids = {w.asset_id for w in c.weights}
    missing_in_c = a_ids - c_ids
    missing_in_a = c_ids - a_ids
    if missing_in_c or missing_in_a:
        discrepancies.append(Discrepancy(
            code="ASSET_SET_DIVERGENCE", severity=Severity.WARNING,
            detail=(f"Valuation/allocation asset sets diverge — only in valuation: "
                    f"{sorted(missing_in_c)}; only in allocation: {sorted(missing_in_a)}."),
        ))

    return ReconciliationResult(
        fund_id=a.fund_id,
        reconciled_at=datetime.now(UTC).isoformat(),
        clean=len(discrepancies) == 0,
        discrepancies=discrepancies,
        computed={
            "summed_assets_eur": round(summed_assets, 2),
            "nav_gap_pct": round(nav_gap * 100, 4),
            "implied_buffer_ratio": round(implied_buffer, 6),
            "liquidity_coverage_ratio": (round(coverage, 6) if coverage != float("inf") else None),
            "total_weight": round(total_weight, 6),
        },
    )


# ── Async pipeline + audit trail ────────────────────────────────────────────────

_AUDIT_TRAIL: list[dict] = []


async def reconcile_async(req: ReconciliationRequest) -> ReconciliationResult:
    # Offload CPU-light but blocking logic to a thread so many sub-funds
    # reconcile concurrently without starving the event loop.
    result = await asyncio.to_thread(_reconcile, req)
    _AUDIT_TRAIL.append({
        "fund_id": result.fund_id,
        "reconciled_at": result.reconciled_at,
        "clean": result.clean,
        "discrepancy_codes": [d.code for d in result.discrepancies],
        "max_severity": _max_severity(result.discrepancies),
    })
    return result


def _max_severity(ds: list[Discrepancy]) -> str:
    order = {Severity.INFO: 0, Severity.WARNING: 1, Severity.CRITICAL: 2}
    if not ds:
        return "none"
    return max(ds, key=lambda d: order[d.severity]).severity.value


async def reconcile_batch(reqs: list[ReconciliationRequest]) -> list[ReconciliationResult]:
    return await asyncio.gather(*(reconcile_async(r) for r in reqs))


# ── Endpoints ────────────────────────────────────────────────────────────────────

@router.post("/run", response_model=ReconciliationResult, summary="Reconcile one fund's three streams")
async def run_reconciliation(req: ReconciliationRequest) -> ReconciliationResult:
    return await reconcile_async(req)


@router.post("/batch", response_model=list[ReconciliationResult], summary="Concurrent multi-fund reconciliation")
async def run_batch(reqs: list[ReconciliationRequest]) -> list[ReconciliationResult]:
    return await reconcile_batch(reqs)


@router.get("/audit-trail", summary="Internal reconciliation audit trail")
def audit_trail() -> dict:
    return {"count": len(_AUDIT_TRAIL), "runs": _AUDIT_TRAIL[-200:]}
