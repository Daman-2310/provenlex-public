"""
Worker 10 — Report Compiler & Dispatcher

Compiles all worker outputs into a single, schema-validated ComplianceReport
ready for WebSocket dispatch and Human-in-the-Loop sign-off.

The report is intentionally non-prescriptive: it presents evidence, citations,
and risk scores but makes no final binary compliance decision.  The
recommendation field guides the compliance officer's review without
replacing their professional judgment.
"""

from __future__ import annotations

import time

from ..schemas import (
    ComplianceFlag,
    ComplianceReport,
    DocumentFormat,
    DocumentLanguage,
    FundStructure,
    PipelineContext,
    RiskScore,
    Severity,
    VerificationResult,
)


def _count_severity(flags: list[ComplianceFlag], severity: Severity) -> int:
    return sum(1 for f in flags if f.severity == severity)


def _build_recommendation(
    flags: list[ComplianceFlag],
    risk: RiskScore,
    verification: VerificationResult,
) -> str:
    critical = _count_severity(flags, Severity.CRITICAL)
    high     = _count_severity(flags, Severity.HIGH)

    if critical > 0 or not verification.passed:
        return (
            f"⛔ BLOCK — {critical} CRITICAL flag(s) and/or {verification.checks_failed} "
            f"mathematical verification failure(s) detected. "
            "Do not approve until all CRITICAL items are resolved. "
            "Refer to the compliance officer and legal counsel immediately."
        )
    if high > 0 or risk.overall >= 50.0:
        return (
            f"⚠️ CONDITIONAL — {high} HIGH severity flag(s) require remediation before launch. "
            f"Overall risk score: {risk.overall:.1f}/100. "
            "Compliance officer review mandatory before sign-off."
        )
    if risk.overall >= 20.0:
        return (
            f"ℹ️ REVIEW — {len(flags)} advisory flag(s) identified. "
            f"Overall risk score: {risk.overall:.1f}/100. "
            "Compliance officer should review and acknowledge each finding."
        )
    return (
        f"✅ CLEAN PASS — No critical or high-severity issues detected. "
        f"Overall risk score: {risk.overall:.1f}/100. "
        "Standard sign-off process may proceed."
    )


async def run(ctx: PipelineContext) -> ComplianceReport:
    t0 = time.perf_counter()

    # Safe defaults if upstream workers failed
    risk = ctx.risk_score or RiskScore(
        overall=100.0, leverage=0.0, liquidity=0.0,
        governance=0.0, ict=0.0, esg=0.0,
    )
    verification = ctx.verification or VerificationResult(
        passed=False, checks_run=0, checks_failed=0,
    )

    flags = ctx.flags
    parsed = ctx.parsed
    translated = ctx.translated
    anonymized = ctx.anonymized

    report = ComplianceReport(
        session_id=ctx.frame.session_id,
        frame_id=ctx.frame.frame_id,
        filename=ctx.frame.filename,
        format=parsed.format if parsed else DocumentFormat.BINARY,
        source_language=(
            parsed.detected_language if parsed else DocumentLanguage.UNK
        ),
        page_count=parsed.page_count if parsed else 0,
        fund_structure=(
            translated.fund_structure if translated else FundStructure.UNKNOWN
        ),
        pii_count=anonymized.pii_count if anonymized else 0,
        gdpr_clean=anonymized.gdpr_clean if anonymized else False,
        flags=tuple(flags),
        critical_count=_count_severity(flags, Severity.CRITICAL),
        high_count=_count_severity(flags, Severity.HIGH),
        medium_count=_count_severity(flags, Severity.MEDIUM),
        low_count=_count_severity(flags, Severity.LOW),
        risk_score=risk,
        verification=verification,
        sign_off_required=True,
        recommendation=_build_recommendation(flags, risk, verification),
        content_hash=ctx.frame.content_hash(),
    )

    ctx.worker_timings["W10"] = (time.perf_counter() - t0) * 1_000
    return report
