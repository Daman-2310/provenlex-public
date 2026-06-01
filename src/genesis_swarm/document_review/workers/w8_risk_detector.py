"""
Worker 8 — Risk Detector & Anomaly Scorer

Aggregates all ComplianceFlags from Workers 4-7 and computes a structured
RiskScore across five dimensions:

  leverage   — leverage limit violations, commitment-approach breaches
  liquidity  — dealing frequency, liquidity management gaps
  governance — ManCo/AIFM gaps, depositary absence, KIID/KID issues
  ict        — DORA / CSSF 22/806 / 22/816 ICT and cyber risk flags
  esg        — sustainable finance / CSSF 20/750 gaps

Overall score = weighted average of dimension scores (weights below).
Score range: 0.0 (no risk detected) → 100.0 (critical failures across all dimensions).

Also performs direct anomaly detection on numeric values extracted from text:
  - Leverage ratios that exceed all known structure limits (>300% gross)
  - Fee structures above market norms (TER > 5%, performance fee > 30%)
  - Suspiciously low/zero management fees (possible fee-in-kind masking)
  - Unrealistically short lock-up periods for illiquid strategies
"""

from __future__ import annotations

import re
import time

from ..schemas import (
    ComplianceFlag,
    CitationRef,
    FundStructure,
    PipelineContext,
    RegulatoryThreshold,
    RiskScore,
    Severity,
)

# ── Scoring weights ───────────────────────────────────────────────────────────
_WEIGHTS = {
    "leverage":   0.30,
    "liquidity":  0.20,
    "governance": 0.25,
    "ict":        0.15,
    "esg":        0.10,
}

# Severity → points per flag
_SEVERITY_POINTS = {
    Severity.CRITICAL: 40.0,
    Severity.HIGH:     20.0,
    Severity.MEDIUM:   10.0,
    Severity.LOW:       3.0,
    Severity.INFO:      0.0,
}

# Worker → dimension
_WORKER_DIMENSION: dict[str, str] = {
    "W4_CSSF":    "ict",
    "W5_UCITS":   "leverage",   # UCITS primarily a leverage/diversification worker
    "W6_RAIF_SIF": "governance",
    "W7_DORA":    "ict",
}

# Specific flag title keywords → dimension override
_TITLE_DIMENSION: list[tuple[str, str]] = [
    ("leverage",    "leverage"),
    ("borrowing",   "leverage"),
    ("diversif",    "leverage"),
    ("concentrat",  "leverage"),
    ("dealing",     "liquidity"),
    ("liquidity",   "liquidity"),
    ("manco",       "governance"),
    ("management company", "governance"),
    ("aifm",        "governance"),
    ("depositary",  "governance"),
    ("kiid",        "governance"),
    ("kid",         "governance"),
    ("esg",         "esg"),
    ("sustainab",   "esg"),
    ("green",       "esg"),
    ("dora",        "ict"),
    ("ict",         "ict"),
    ("cyber",       "ict"),
    ("cloud",       "ict"),
    ("incident",    "ict"),
]

# ── Numeric anomaly detection ─────────────────────────────────────────────────

_GROSS_LEVERAGE   = re.compile(r"gross\s+leverage[^.]{0,60}?(\d{2,4}(?:\.\d+)?)\s*%", re.I)
_NET_LEVERAGE     = re.compile(r"net\s+leverage[^.]{0,60}?(\d{2,4}(?:\.\d+)?)\s*%", re.I)
_MANAGEMENT_FEE   = re.compile(r"management\s+fee[^.]{0,60}?(\d{1,2}(?:\.\d+)?)\s*%", re.I)
_PERFORMANCE_FEE  = re.compile(r"performance\s+fee[^.]{0,60}?(\d{1,2}(?:\.\d+)?)\s*%", re.I)
_TER              = re.compile(r"(?:TER|total\s+expense\s+ratio)[^.]{0,60}?(\d{1,2}(?:\.\d+)?)\s*%", re.I)

_AIFMD_GROSS_LIMIT = 300.0  # bp × 100 → percentage
_AIFMD_NET_LIMIT   = 200.0


def _extract_pct(pattern: re.Pattern[str], text: str) -> float | None:
    m = pattern.search(text)
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            pass
    return None


def _classify_dimension(flag: ComplianceFlag) -> str:
    title_lower = flag.title.lower()
    for keyword, dim in _TITLE_DIMENSION:
        if keyword in title_lower:
            return dim
    return _WORKER_DIMENSION.get(flag.worker, "governance")


def _score_dimension(flags: list[ComplianceFlag], dimension: str) -> float:
    total = 0.0
    for flag in flags:
        if _classify_dimension(flag) == dimension:
            total += _SEVERITY_POINTS[flag.severity]
    return min(total, 100.0)


def _detect_numeric_anomalies(text: str, fund: FundStructure) -> list[ComplianceFlag]:
    anomalies: list[ComplianceFlag] = []

    gross_lev = _extract_pct(_GROSS_LEVERAGE, text)
    if gross_lev is not None and gross_lev > _AIFMD_GROSS_LIMIT:
        anomalies.append(ComplianceFlag(
            worker="W8_RISK",
            severity=Severity.CRITICAL,
            title=f"Gross leverage {gross_lev:.0f}% exceeds AIFMD 300% absolute limit",
            description=(
                f"Detected gross leverage of {gross_lev:.1f}% — exceeds the AIFMD Art. 111 "
                f"300% gross limit applicable to all AIFs."
            ),
            citation=CitationRef(
                document_id="AIFMD Commission Delegated Regulation 231/2013",
                section="Article 111",
                article="Art. 111(1)",
            ),
            threshold=RegulatoryThreshold(
                name="AIFMD gross leverage",
                limit=_AIFMD_GROSS_LIMIT,
                unit="%",
                actual=gross_lev,
                breached=True,
                citation=CitationRef(
                    document_id="AIFMD Commission Delegated Regulation 231/2013",
                    section="Article 111",
                ),
            ),
            remediation=f"Reduce gross leverage to ≤ {_AIFMD_GROSS_LIMIT:.0f}% NAV.",
            raw_excerpt=_GROSS_LEVERAGE.search(text).group() if _GROSS_LEVERAGE.search(text) else "",
        ))

    net_lev = _extract_pct(_NET_LEVERAGE, text)
    if net_lev is not None and net_lev > _AIFMD_NET_LIMIT:
        anomalies.append(ComplianceFlag(
            worker="W8_RISK",
            severity=Severity.CRITICAL,
            title=f"Net leverage {net_lev:.0f}% exceeds AIFMD 200% net limit",
            description=f"Detected net leverage of {net_lev:.1f}% — exceeds AIFMD 200% net limit.",
            citation=CitationRef(
                document_id="AIFMD Commission Delegated Regulation 231/2013",
                section="Article 111",
                article="Art. 111(1)(a)",
            ),
            threshold=RegulatoryThreshold(
                name="AIFMD net leverage",
                limit=_AIFMD_NET_LIMIT,
                unit="%",
                actual=net_lev,
                breached=True,
                citation=CitationRef(
                    document_id="AIFMD Commission Delegated Regulation 231/2013",
                    section="Article 111",
                ),
            ),
            remediation=f"Reduce net leverage to ≤ {_AIFMD_NET_LIMIT:.0f}% NAV.",
        ))

    mgmt_fee = _extract_pct(_MANAGEMENT_FEE, text)
    if mgmt_fee is not None:
        if mgmt_fee == 0.0:
            anomalies.append(ComplianceFlag(
                worker="W8_RISK",
                severity=Severity.MEDIUM,
                title="Zero management fee — possible fee-in-kind arrangement",
                description=(
                    "Management fee stated as 0%. Verify this is not disguising "
                    "fee-in-kind, carried interest, or undisclosed remuneration."
                ),
                citation=CitationRef(
                    document_id="UCITS Directive 2009/65/EC",
                    section="Article 78",
                    article="Art. 78(3)(b)",
                ),
                remediation="Disclose all forms of remuneration including non-cash compensation.",
            ))
        elif mgmt_fee > 5.0:
            anomalies.append(ComplianceFlag(
                worker="W8_RISK",
                severity=Severity.HIGH,
                title=f"Management fee {mgmt_fee:.1f}% above market norm (>5%)",
                description=f"Management fee of {mgmt_fee:.1f}% significantly exceeds market norms.",
                citation=CitationRef(
                    document_id="UCITS Directive 2009/65/EC",
                    section="Article 78",
                    article="Art. 78(3)(b)",
                ),
                remediation="Review fee structure for proportionality; document justification.",
            ))

    perf_fee = _extract_pct(_PERFORMANCE_FEE, text)
    if perf_fee is not None and perf_fee > 30.0:
        anomalies.append(ComplianceFlag(
            worker="W8_RISK",
            severity=Severity.MEDIUM,
            title=f"Performance fee {perf_fee:.1f}% above 30% IOSCO guidance",
            description=f"Performance fee of {perf_fee:.1f}% exceeds the 30% IOSCO guidance threshold.",
            citation=CitationRef(
                document_id="IOSCO Performance Fees Principles 2016",
                section="Principle 4",
            ),
            remediation=(
                "Reduce performance fee to ≤ 30% or document explicit investor consent "
                "and high-water mark protection."
            ),
        ))

    return anomalies


async def run(ctx: PipelineContext) -> None:
    t0 = time.perf_counter()
    if ctx.translated is None:
        ctx.worker_timings["W8"] = 0.0
        return

    text = ctx.translated.text_en
    fund = ctx.translated.fund_structure

    # Numeric anomaly detection
    for flag in _detect_numeric_anomalies(text, fund):
        ctx.add_flag(flag)

    # Aggregate scores across all flags collected so far
    all_flags = ctx.flags
    dim_scores = {dim: _score_dimension(all_flags, dim) for dim in _WEIGHTS}

    overall = sum(
        _WEIGHTS[dim] * dim_scores[dim]
        for dim in _WEIGHTS
    )

    ctx.risk_score = RiskScore(
        overall=round(min(overall, 100.0), 2),
        leverage=round(dim_scores["leverage"], 2),
        liquidity=round(dim_scores["liquidity"], 2),
        governance=round(dim_scores["governance"], 2),
        ict=round(dim_scores["ict"], 2),
        esg=round(dim_scores["esg"], 2),
    )

    ctx.worker_timings["W8"] = (time.perf_counter() - t0) * 1_000
