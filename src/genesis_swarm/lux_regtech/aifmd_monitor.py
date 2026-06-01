"""
COMPONENT 3 — AIFMD II Arbitrage & Limit Monitor  (2026 mandates)
=================================================================

Real-time pre-trade simulation and compliance monitoring for loan-originating
alternative investment funds (AIFs).

Hard rules enforced
-------------------
* Leverage cap: 300% for closed-ended, 175% for open-ended loan-originating AIFs
  (AIFMD II Art. 15 / 16, commitment-method leverage as % of NAV).
* Risk retention: at least 5% nominal value retained on originated loans that
  are subsequently transferred (AIFMD II Art. 15(7)).
* Diversification: no more than 20% of capital exposed to a single financial-
  institution borrower (AIFMD II Art. 15(4a)).

Plus an ESMA third-party delegation risk score and a ``/trade/simulate`` endpoint
that returns an ``allowed`` flag with full remaining-headroom breakdown.
"""

from __future__ import annotations

from enum import Enum

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/aifmd", tags=["aifmd-ii"])

# ── Regulatory constants ─────────────────────────────────────────────────────────

LEVERAGE_CAP_CLOSED = 3.00      # 300% of NAV
LEVERAGE_CAP_OPEN = 1.75        # 175% of NAV
MIN_LOAN_RETENTION = 0.05       # 5% nominal retained on transfer
MAX_SINGLE_FI_CONCENTRATION = 0.20  # 20% to a single financial-institution borrower


class FundStructure(str, Enum):
    OPEN_ENDED = "open_ended"
    CLOSED_ENDED = "closed_ended"


class BorrowerType(str, Enum):
    FINANCIAL_INSTITUTION = "financial_institution"
    CORPORATE = "corporate"
    SOVEREIGN = "sovereign"
    OTHER = "other"


# ── Portfolio + trade models ─────────────────────────────────────────────────────

class PortfolioState(BaseModel):
    fund_id: str
    structure: FundStructure
    nav_eur: float = Field(..., gt=0)
    gross_exposure_eur: float = Field(..., ge=0, description="Current commitment-method exposure")
    # Existing per-borrower exposures (borrower_id -> EUR exposure)
    borrower_exposures_eur: dict[str, float] = Field(default_factory=dict)
    # borrower_id -> BorrowerType, for concentration scoping
    borrower_types: dict[str, BorrowerType] = Field(default_factory=dict)


class ProposedLoan(BaseModel):
    borrower_id: str = Field(..., min_length=1)
    borrower_type: BorrowerType = BorrowerType.FINANCIAL_INSTITUTION
    nominal_eur: float = Field(..., gt=0, description="Loan nominal originated")
    retained_eur: float = Field(..., ge=0, description="Nominal retained on books after transfer")
    added_exposure_eur: float = Field(..., ge=0, description="Commitment-method exposure added")


class TradeSimulationRequest(BaseModel):
    portfolio: PortfolioState
    proposed: ProposedLoan


class RuleCheck(BaseModel):
    rule: str
    passed: bool
    detail: str
    limit: float
    observed: float
    headroom: float


class TradeSimulationResult(BaseModel):
    allowed: bool
    fund_id: str
    checks: list[RuleCheck]
    post_trade: dict
    blocking_rules: list[str]


# ── Rules engine ─────────────────────────────────────────────────────────────────

def _leverage_cap(structure: FundStructure) -> float:
    return LEVERAGE_CAP_CLOSED if structure == FundStructure.CLOSED_ENDED else LEVERAGE_CAP_OPEN


def simulate_trade(req: TradeSimulationRequest) -> TradeSimulationResult:
    p, loan = req.portfolio, req.proposed
    checks: list[RuleCheck] = []

    # ---- Rule 1: leverage cap (commitment method, % of NAV) ----
    cap = _leverage_cap(p.structure)
    post_gross = p.gross_exposure_eur + loan.added_exposure_eur
    post_leverage = post_gross / p.nav_eur
    lev_headroom_eur = cap * p.nav_eur - post_gross
    checks.append(RuleCheck(
        rule="LEVERAGE_CAP",
        passed=post_leverage <= cap + 1e-9,
        detail=(f"{p.structure.value} cap {cap:.0%} of NAV; post-trade leverage "
                f"{post_leverage:.2%} (€{post_gross:,.0f} / €{p.nav_eur:,.0f})."),
        limit=round(cap, 4),
        observed=round(post_leverage, 6),
        headroom=round(lev_headroom_eur, 2),
    ))

    # ---- Rule 2: minimum 5% risk retention on originated loan ----
    retention_ratio = loan.retained_eur / loan.nominal_eur
    checks.append(RuleCheck(
        rule="LOAN_RETENTION_5PCT",
        passed=retention_ratio >= MIN_LOAN_RETENTION - 1e-9,
        detail=(f"Retained €{loan.retained_eur:,.0f} of €{loan.nominal_eur:,.0f} nominal "
                f"= {retention_ratio:.2%}; minimum {MIN_LOAN_RETENTION:.0%}."),
        limit=MIN_LOAN_RETENTION,
        observed=round(retention_ratio, 6),
        headroom=round(retention_ratio - MIN_LOAN_RETENTION, 6),
    ))

    # ---- Rule 3: 20% single-FI-borrower concentration ----
    prior = p.borrower_exposures_eur.get(loan.borrower_id, 0.0)
    post_borrower = prior + loan.added_exposure_eur
    btype = p.borrower_types.get(loan.borrower_id, loan.borrower_type)
    if btype == BorrowerType.FINANCIAL_INSTITUTION:
        concentration = post_borrower / p.nav_eur
        conc_headroom_eur = MAX_SINGLE_FI_CONCENTRATION * p.nav_eur - post_borrower
        checks.append(RuleCheck(
            rule="SINGLE_FI_CONCENTRATION_20PCT",
            passed=concentration <= MAX_SINGLE_FI_CONCENTRATION + 1e-9,
            detail=(f"Borrower {loan.borrower_id} (FI) post-trade exposure "
                    f"€{post_borrower:,.0f} = {concentration:.2%} of NAV; cap "
                    f"{MAX_SINGLE_FI_CONCENTRATION:.0%}."),
            limit=MAX_SINGLE_FI_CONCENTRATION,
            observed=round(concentration, 6),
            headroom=round(conc_headroom_eur, 2),
        ))
    else:
        checks.append(RuleCheck(
            rule="SINGLE_FI_CONCENTRATION_20PCT",
            passed=True,
            detail=f"Borrower {loan.borrower_id} is {btype.value}; FI concentration cap N/A.",
            limit=MAX_SINGLE_FI_CONCENTRATION,
            observed=0.0,
            headroom=round(MAX_SINGLE_FI_CONCENTRATION * p.nav_eur, 2),
        ))

    blocking = [c.rule for c in checks if not c.passed]
    return TradeSimulationResult(
        allowed=len(blocking) == 0,
        fund_id=p.fund_id,
        checks=checks,
        blocking_rules=blocking,
        post_trade={
            "gross_exposure_eur": round(post_gross, 2),
            "leverage_pct": round(post_leverage * 100, 4),
            "leverage_cap_pct": round(cap * 100, 2),
            "borrower_exposure_eur": round(post_borrower, 2),
            "retention_ratio_pct": round(retention_ratio * 100, 4),
        },
    )


# ── ESMA third-party delegation risk score ───────────────────────────────────────

class DelegationRiskInput(BaseModel):
    delegate_name: str
    is_non_eu: bool = Field(..., description="Delegate domiciled outside the EU")
    portfolio_mgmt_delegated: bool
    risk_mgmt_delegated: bool
    aum_delegated_pct: float = Field(..., ge=0, le=1)
    prior_findings_12m: int = Field(..., ge=0)
    substance_score: float = Field(..., ge=0, le=1, description="0=weak,1=strong local substance")


class DelegationRiskScore(BaseModel):
    delegate_name: str
    score: float
    band: str
    drivers: dict


def score_delegation_risk(d: DelegationRiskInput) -> DelegationRiskScore:
    """
    ESMA letterbox-entity guidance: heavier weight when BOTH portfolio and risk
    management are delegated, to a non-EU delegate, with high AUM share and weak
    local substance. Score in [0,100]; higher = riskier.
    """
    score = 0.0
    drivers: dict[str, float] = {}

    both_core = d.portfolio_mgmt_delegated and d.risk_mgmt_delegated
    drivers["both_core_functions"] = 25.0 if both_core else (
        12.0 if (d.portfolio_mgmt_delegated or d.risk_mgmt_delegated) else 0.0
    )
    drivers["non_eu_delegate"] = 20.0 if d.is_non_eu else 0.0
    drivers["aum_concentration"] = round(20.0 * d.aum_delegated_pct, 2)
    drivers["prior_findings"] = float(min(20, d.prior_findings_12m * 5))
    drivers["substance_weakness"] = round(15.0 * (1.0 - d.substance_score), 2)

    score = sum(drivers.values())
    score = max(0.0, min(100.0, score))
    band = "critical" if score >= 70 else "elevated" if score >= 45 else "moderate" if score >= 25 else "low"
    return DelegationRiskScore(delegate_name=d.delegate_name, score=round(score, 2), band=band, drivers=drivers)


# ── Endpoints ─────────────────────────────────────────────────────────────────────

@router.post("/trade/simulate", response_model=TradeSimulationResult, summary="Pre-trade AIFMD II limit simulation")
def trade_simulate(req: TradeSimulationRequest) -> TradeSimulationResult:
    return simulate_trade(req)


@router.post("/delegation/score", response_model=DelegationRiskScore, summary="ESMA delegation risk score")
def delegation_score(d: DelegationRiskInput) -> DelegationRiskScore:
    return score_delegation_risk(d)


@router.get("/limits", summary="Active AIFMD II regulatory limits")
def limits() -> dict:
    return {
        "leverage_cap_closed_ended_pct": LEVERAGE_CAP_CLOSED * 100,
        "leverage_cap_open_ended_pct": LEVERAGE_CAP_OPEN * 100,
        "min_loan_retention_pct": MIN_LOAN_RETENTION * 100,
        "max_single_fi_concentration_pct": MAX_SINGLE_FI_CONCENTRATION * 100,
    }
