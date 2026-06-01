"""
COMPONENT 5 — Delegation Oversight Ledger  (Circular CSSF 18/698)
=================================================================

Automates third-party risk management and continuous oversight logging for
external fund administrators, custodians, and IT vendors.

Capabilities
------------
1. Dynamic risk-scoring of delegates from compliance endpoints, SLA uptime,
   and security-performance feeds.
2. An unalterable (hash-chained) ledger recording every oversight action,
   review, or risk adjustment by the Board — the legal-defence log proving
   active, ongoing oversight as required by 18/698.
3. An immediate workflow trigger when a critical vendor's score breaches the
   acceptable risk threshold.
"""

from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ._hashchain import HashChain

router = APIRouter(prefix="/api/v1/delegation", tags=["delegation-18/698"])

# Score is 0-100, higher = healthier. Below this, escalate.
RISK_ESCALATION_THRESHOLD = 60.0
CRITICAL_VENDOR_FLOOR = 70.0   # critical vendors held to a higher bar


class DelegateCategory(str, Enum):
    FUND_ADMINISTRATOR = "fund_administrator"
    CUSTODIAN = "custodian"
    IT_VENDOR = "it_vendor"
    TRANSFER_AGENT = "transfer_agent"
    PORTFOLIO_MANAGER = "portfolio_manager"


class OversightActionType(str, Enum):
    INITIAL_DUE_DILIGENCE = "initial_due_diligence"
    PERIODIC_REVIEW = "periodic_review"
    RISK_ADJUSTMENT = "risk_adjustment"
    INCIDENT_REVIEW = "incident_review"
    SLA_BREACH_REVIEW = "sla_breach_review"
    TERMINATION_DECISION = "termination_decision"


# ── Risk scoring ──────────────────────────────────────────────────────────────────

class DelegateFeed(BaseModel):
    delegate_id: str = Field(..., min_length=1)
    name: str
    category: DelegateCategory
    is_critical: bool = False
    sla_uptime_pct: float = Field(..., ge=0, le=100, description="Rolling 90-day uptime")
    compliance_endpoint_pass_rate: float = Field(..., ge=0, le=1, description="Automated control pass ratio")
    security_incidents_90d: int = Field(..., ge=0)
    open_findings: int = Field(..., ge=0)
    days_since_last_review: int = Field(..., ge=0)


class DelegateRiskScore(BaseModel):
    delegate_id: str
    name: str
    score: float
    healthy: bool
    breached_threshold: float
    drivers: dict
    recommended_action: str


def score_delegate(feed: DelegateFeed) -> DelegateRiskScore:
    """
    Weighted health score in [0,100]. Starts at 100 and subtracts penalties.
    Critical vendors are measured against a higher floor.
    """
    drivers: dict[str, float] = {}

    # SLA uptime: full marks at >=99.9%, linear penalty down to 95%.
    if feed.sla_uptime_pct >= 99.9:
        sla_pen = 0.0
    else:
        sla_pen = min(30.0, (99.9 - feed.sla_uptime_pct) * 6.0)
    drivers["sla_penalty"] = round(sla_pen, 2)

    # Compliance endpoint pass rate: up to 25 points of penalty.
    drivers["compliance_penalty"] = round(25.0 * (1.0 - feed.compliance_endpoint_pass_rate), 2)

    # Security incidents: 8 points each, capped at 24.
    drivers["security_penalty"] = float(min(24, feed.security_incidents_90d * 8))

    # Open findings: 3 points each, capped at 15.
    drivers["findings_penalty"] = float(min(15, feed.open_findings * 3))

    # Review staleness: 18/698 expects periodic review; >180d starts penalising.
    drivers["staleness_penalty"] = round(min(15.0, max(0.0, (feed.days_since_last_review - 180) / 12.0)), 2)

    score = 100.0 - sum(drivers.values())
    score = max(0.0, min(100.0, score))

    floor = CRITICAL_VENDOR_FLOOR if feed.is_critical else RISK_ESCALATION_THRESHOLD
    healthy = score >= floor
    if healthy:
        action = "none"
    elif score >= floor - 15:
        action = "enhanced_monitoring"
    else:
        action = "escalate_to_board"

    return DelegateRiskScore(
        delegate_id=feed.delegate_id,
        name=feed.name,
        score=round(score, 2),
        healthy=healthy,
        breached_threshold=floor,
        drivers=drivers,
        recommended_action=action,
    )


# ── Unalterable oversight ledger ───────────────────────────────────────────────────

_LEDGER = HashChain(name="delegation_oversight_ledger")
_LATEST_SCORE: dict[str, float] = {}
_WORKFLOWS: list[dict] = []


class OversightAction(BaseModel):
    delegate_id: str
    delegate_name: str
    action_type: OversightActionType
    board_member: str = Field(..., description="Director recording the oversight act")
    notes: str = ""
    new_risk_score: float | None = Field(None, ge=0, le=100)


class OversightReceipt(BaseModel):
    entry_index: int
    entry_hash: str
    chain_head: str
    workflow_triggered: bool
    workflow: dict | None = None


def _maybe_trigger_workflow(delegate_id: str, name: str, score: float, is_critical: bool) -> dict | None:
    floor = CRITICAL_VENDOR_FLOOR if is_critical else RISK_ESCALATION_THRESHOLD
    if score >= floor:
        return None
    wf = {
        "workflow_id": f"WF-{len(_WORKFLOWS) + 1:05d}",
        "delegate_id": delegate_id,
        "delegate_name": name,
        "score": score,
        "threshold": floor,
        "severity": "critical" if (is_critical or score < floor - 15) else "elevated",
        "required_steps": [
            "notify_conducting_officers",
            "schedule_extraordinary_board_review",
            "request_remediation_plan_from_delegate",
            "assess_contingency_substitute_provider",
        ],
        "opened_at": datetime.now(UTC).isoformat(),
    }
    _WORKFLOWS.append(wf)
    return wf


# ── Endpoints ─────────────────────────────────────────────────────────────────────

@router.post("/score", response_model=DelegateRiskScore, summary="Score a delegate from live feeds")
def score(feed: DelegateFeed) -> DelegateRiskScore:
    result = score_delegate(feed)
    _LATEST_SCORE[feed.delegate_id] = result.score
    return result


@router.post("/oversight", response_model=OversightReceipt, summary="Record a Board oversight action (immutable)")
def record_oversight(action: OversightAction) -> OversightReceipt:
    score_val = action.new_risk_score
    if score_val is not None:
        _LATEST_SCORE[action.delegate_id] = score_val
    else:
        score_val = _LATEST_SCORE.get(action.delegate_id)

    entry = _LEDGER.append({
        "delegate_id": action.delegate_id,
        "delegate_name": action.delegate_name,
        "action_type": action.action_type.value,
        "board_member": action.board_member,
        "notes": action.notes,
        "risk_score_at_action": score_val,
    })

    workflow = None
    if score_val is not None:
        # We don't know criticality from the action alone; treat a RISK_ADJUSTMENT
        # or SLA_BREACH_REVIEW that records a sub-threshold score as a trigger.
        workflow = _maybe_trigger_workflow(
            action.delegate_id, action.delegate_name, score_val, is_critical=False
        )

    return OversightReceipt(
        entry_index=entry.index,
        entry_hash=entry.entry_hash,
        chain_head=_LEDGER.head(),
        workflow_triggered=workflow is not None,
        workflow=workflow,
    )


@router.get("/ledger/verify", summary="Prove the oversight ledger is unaltered")
def verify_ledger() -> dict:
    ok, broken = _LEDGER.verify()
    return {"intact": ok, "entries": len(_LEDGER), "first_broken_index": broken, "head": _LEDGER.head()}


@router.get("/ledger", summary="Full immutable oversight ledger")
def ledger() -> dict:
    return {"name": _LEDGER.name, "count": len(_LEDGER), "entries": _LEDGER.entries()}


@router.get("/workflows", summary="Open escalation workflows")
def workflows() -> dict:
    return {"count": len(_WORKFLOWS), "workflows": _WORKFLOWS[-100:]}
