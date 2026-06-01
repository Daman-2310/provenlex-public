"""
COMPONENT 1 — Substance Audit Engine  (CSSF Circular 24/856)
============================================================

Programmatically tracks the physical presence and active operational hours of
independent fund directors and local compliance officers, and proves it with a
tamper-evident audit log.

Capabilities
------------
1. Geofencing — verifies an IP-derived country and/or lat/lon coordinate sits
   inside Luxembourg at the moment of a board vote or operational sign-off.
2. Hash-chained audit log — append-only record of (director, sub-fund,
   location, timestamps, active hours), each link bound to its predecessor.
3. Alerting — flags directors whose tracked annual hours fall below the
   substance threshold, or whose core actions originate outside authorised
   geographical zones.
"""

from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from ._hashchain import HashChain

router = APIRouter(prefix="/api/v1/substance", tags=["substance-24/856"])

# ── Geofencing ────────────────────────────────────────────────────────────────

# Luxembourg bounding box (fast reject) + a simplified border polygon for an
# actual point-in-polygon test. Polygon is intentionally conservative; production
# would swap in the official GADM/Natural-Earth LU boundary.
_LU_BBOX = {"lat_min": 49.4480, "lat_max": 50.1827, "lon_min": 5.7357, "lon_max": 6.5316}
_LU_POLYGON: list[tuple[float, float]] = [
    (49.4969, 5.8946), (49.6446, 5.7357), (49.8538, 6.1067), (50.1827, 6.1389),
    (50.0998, 6.4286), (49.8714, 6.5316), (49.6112, 6.4286), (49.4480, 6.3658),
    (49.4520, 6.1067), (49.4969, 5.8946),
]


def _point_in_polygon(lat: float, lon: float, polygon: list[tuple[float, float]]) -> bool:
    """Ray-casting point-in-polygon. ``polygon`` is a list of (lat, lon)."""
    inside = False
    n = len(polygon)
    j = n - 1
    for i in range(n):
        lat_i, lon_i = polygon[i]
        lat_j, lon_j = polygon[j]
        intersects = ((lon_i > lon) != (lon_j > lon)) and (
            lat < (lat_j - lat_i) * (lon - lon_i) / (lon_j - lon_i + 1e-12) + lat_i
        )
        if intersects:
            inside = not inside
        j = i
    return inside


def verify_in_luxembourg(
    *, country_iso: str | None = None, lat: float | None = None, lon: float | None = None
) -> tuple[bool, str]:
    """
    Returns (is_inside, method). Coordinate evidence wins over IP country when
    both are present (coordinates are harder to spoof for a board portal).
    """
    if lat is not None and lon is not None:
        if not (_LU_BBOX["lat_min"] <= lat <= _LU_BBOX["lat_max"]
                and _LU_BBOX["lon_min"] <= lon <= _LU_BBOX["lon_max"]):
            return False, "coordinate_bbox_reject"
        return (_point_in_polygon(lat, lon, _LU_POLYGON), "coordinate_polygon")
    if country_iso is not None:
        return (country_iso.upper() == "LU", "ip_country")
    return False, "no_evidence"


# ── Substance thresholds (CSSF 24/856 supervisory expectations) ────────────────

# Indicative minimum board-engagement hours per director per year, and the
# minimum share of "core" actions that must originate from within Luxembourg.
SUBSTANCE_MIN_ANNUAL_HOURS = 120.0
SUBSTANCE_MIN_LOCAL_ACTION_RATIO = 0.50


# ── Models ─────────────────────────────────────────────────────────────────────

class ActionType(str, Enum):
    BOARD_VOTE = "board_vote"
    NAV_SIGN_OFF = "nav_sign_off"
    RISK_SIGN_OFF = "risk_sign_off"
    DELEGATION_REVIEW = "delegation_review"
    GENERAL = "general"


class SignOffEvent(BaseModel):
    director_id: str = Field(..., min_length=1)
    director_name: str = Field(..., min_length=1)
    sub_fund_id: str = Field(..., min_length=1)
    action_type: ActionType = ActionType.GENERAL
    active_hours: float = Field(..., ge=0, le=24, description="Hours logged for this action")
    country_iso: str | None = Field(None, min_length=2, max_length=2)
    lat: float | None = Field(None, ge=-90, le=90)
    lon: float | None = Field(None, ge=-180, le=180)
    occurred_at: datetime | None = None

    @field_validator("country_iso")
    @classmethod
    def _upper(cls, v: str | None) -> str | None:
        return v.upper() if v else v


class SignOffResult(BaseModel):
    accepted: bool
    geofence_pass: bool
    geofence_method: str
    entry_index: int
    entry_hash: str
    chain_head: str
    alerts: list[str]


class DirectorSubstanceSummary(BaseModel):
    director_id: str
    total_actions: int
    total_active_hours: float
    local_actions: int
    local_action_ratio: float
    annual_hours_ok: bool
    geography_ok: bool
    compliant: bool
    deficiencies: list[str]


# ── Store (in-memory; one INSERT per event into substance_audit_log in prod) ───

_CHAIN = HashChain(name="substance_audit_log")
# Aggregate tracker keyed by director_id for O(1) threshold checks.
_DIRECTOR_STATS: dict[str, dict[str, float]] = {}


def _record_stats(ev: SignOffEvent, geo_pass: bool) -> None:
    s = _DIRECTOR_STATS.setdefault(
        ev.director_id, {"actions": 0.0, "hours": 0.0, "local": 0.0}
    )
    s["actions"] += 1
    s["hours"] += ev.active_hours
    if geo_pass:
        s["local"] += 1


def _evaluate_alerts(ev: SignOffEvent, geo_pass: bool) -> list[str]:
    alerts: list[str] = []
    if not geo_pass:
        alerts.append(
            f"GEOFENCE_BREACH: {ev.action_type.value} for {ev.director_id} "
            f"originated outside Luxembourg authorised zone."
        )
    s = _DIRECTOR_STATS[ev.director_id]
    if s["hours"] < SUBSTANCE_MIN_ANNUAL_HOURS:
        alerts.append(
            f"LOW_HOURS_WATCH: {ev.director_id} at {s['hours']:.1f}h of "
            f"{SUBSTANCE_MIN_ANNUAL_HOURS:.0f}h substance minimum."
        )
    ratio = s["local"] / s["actions"] if s["actions"] else 0.0
    if ratio < SUBSTANCE_MIN_LOCAL_ACTION_RATIO:
        alerts.append(
            f"GEOGRAPHY_WATCH: {ev.director_id} local-action ratio {ratio:.0%} "
            f"below {SUBSTANCE_MIN_LOCAL_ACTION_RATIO:.0%} minimum."
        )
    return alerts


# ── Endpoints ───────────────────────────────────────────────────────────────────

@router.post("/sign-off", response_model=SignOffResult, summary="Record a geofenced sign-off")
def record_sign_off(event: SignOffEvent) -> SignOffResult:
    geo_pass, method = verify_in_luxembourg(
        country_iso=event.country_iso, lat=event.lat, lon=event.lon
    )
    _record_stats(event, geo_pass)
    alerts = _evaluate_alerts(event, geo_pass)

    occurred = (event.occurred_at or datetime.now(UTC)).isoformat()
    entry = _CHAIN.append(
        {
            "director_id": event.director_id,
            "director_name": event.director_name,
            "sub_fund_id": event.sub_fund_id,
            "action_type": event.action_type.value,
            "active_hours": event.active_hours,
            "location": {"country": event.country_iso, "lat": event.lat, "lon": event.lon},
            "geofence_pass": geo_pass,
            "geofence_method": method,
            "occurred_at": occurred,
        }
    )
    return SignOffResult(
        accepted=True,
        geofence_pass=geo_pass,
        geofence_method=method,
        entry_index=entry.index,
        entry_hash=entry.entry_hash,
        chain_head=_CHAIN.head(),
        alerts=alerts,
    )


@router.get(
    "/director/{director_id}",
    response_model=DirectorSubstanceSummary,
    summary="Substance summary + deficiency check for a director",
)
def director_summary(director_id: str) -> DirectorSubstanceSummary:
    s = _DIRECTOR_STATS.get(director_id)
    if not s:
        raise HTTPException(status_code=404, detail="No substance records for director.")
    actions = int(s["actions"])
    ratio = s["local"] / actions if actions else 0.0
    annual_ok = s["hours"] >= SUBSTANCE_MIN_ANNUAL_HOURS
    geo_ok = ratio >= SUBSTANCE_MIN_LOCAL_ACTION_RATIO
    deficiencies: list[str] = []
    if not annual_ok:
        deficiencies.append("annual_hours_below_minimum")
    if not geo_ok:
        deficiencies.append("local_action_ratio_below_minimum")
    return DirectorSubstanceSummary(
        director_id=director_id,
        total_actions=actions,
        total_active_hours=round(s["hours"], 2),
        local_actions=int(s["local"]),
        local_action_ratio=round(ratio, 4),
        annual_hours_ok=annual_ok,
        geography_ok=geo_ok,
        compliant=annual_ok and geo_ok,
        deficiencies=deficiencies,
    )


@router.get("/audit-log/verify", summary="Verify hash-chain integrity")
def verify_audit_log() -> dict:
    ok, broken = _CHAIN.verify()
    return {"intact": ok, "entries": len(_CHAIN), "first_broken_index": broken, "head": _CHAIN.head()}


@router.get("/audit-log", summary="Full append-only audit log")
def audit_log() -> dict:
    return {"name": _CHAIN.name, "count": len(_CHAIN), "entries": _CHAIN.entries()}
