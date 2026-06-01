"""
Worker 7 — DORA ICT Risk Auditor

Enforces Digital Operational Resilience Act (EU 2022/2554) obligations
as applicable to Luxembourg fund managers, ManCos, and depositaries:

  Art. 5  — ICT risk management framework governance
  Art. 9  — ICT systems: resilience, capacity, BCP
  Art. 17 — ICT incident classification and reporting
  Art. 19 — Reporting timelines (4h initial, 72h intermediate, 1 month final)
  Art. 26 — Digital operational resilience testing (TLPT)
  Art. 28 — ICT third-party risk management
  Art. 30 — Key contractual provisions for ICT providers

Cross-references CSSF Circular 22/806 (cloud outsourcing) for overlapping
provisions on third-party risk, which is already checked by W4.
"""

from __future__ import annotations

import re
import time

from .. import rag_store
from ..schemas import (
    CitationRef,
    ComplianceFlag,
    PipelineContext,
    RegulatoryThreshold,
    Severity,
)

_DORA = "DORA Regulation (EU) 2022/2554"


def _cite(section: str, article: str | None = None) -> CitationRef:
    return CitationRef(document_id=_DORA, section=section, article=article)


# ── Patterns ──────────────────────────────────────────────────────────────────

_ICT_FRAMEWORK = re.compile(
    r"\b(ICT\s+risk\s+management\s+framework|ICT\s+governance|"
    r"cadre\s+de\s+gestion\s+des\s+risques\s+TIC|IKT.Risikomanagement)\b",
    re.I,
)
_INCIDENT_CLASS = re.compile(
    r"\b(incident\s+classif|major\s+ICT\s+incident|classification\s+des\s+incidents)\b",
    re.I,
)
_INITIAL_NOTIF = re.compile(
    r"\b(initial\s+notification|4[\s\-]?hour|four.hour\s+notification|"
    r"notification\s+initiale|premiere\s+notification)\b",
    re.I,
)
_INTERMEDIATE_NOTIF = re.compile(
    r"\b(intermediate\s+report|72[\s\-]?hour|seventy.two.hour|"
    r"rapport\s+intermédiaire)\b",
    re.I,
)
_FINAL_NOTIF = re.compile(
    r"\b(final\s+report|one.month|1\s+month\s+report|rapport\s+final)\b",
    re.I,
)
_TLPT = re.compile(
    r"\b(TLPT|threat.led\s+penetration\s+test|TIBER.EU|"
    r"digital\s+operational\s+resilience\s+test)\b",
    re.I,
)
_THIRD_PARTY_ICT = re.compile(
    r"\b(ICT\s+third.party|third.party\s+ICT|fournisseur\s+TIC\s+tiers|"
    r"IKT.Drittanbieter|critical\s+ICT\s+provider)\b",
    re.I,
)
_CONTRACTUAL = re.compile(
    r"\b(contractual\s+arrangement|service\s+level|SLA|exit\s+clause|"
    r"audit\s+right|droit\s+d.audit)\b",
    re.I,
)
_RTO_RPO = re.compile(
    r"\b(RTO|RPO|recovery\s+time\s+objective|recovery\s+point\s+objective|"
    r"objectif\s+de\s+délai\s+de\s+reprise)\b",
    re.I,
)
_BCP_TEST = re.compile(
    r"\b(BCP\s+test|continuity\s+test|resilience\s+test|test\s+du\s+plan\s+de\s+continuité)\b",
    re.I,
)

# Extract RTO value in hours
_RTO_HOURS = re.compile(r"RTO[^.]{0,60}?(\d+(?:\.\d+)?)\s*h(?:our)?", re.I)



def _rag_augment(ctx, text: str, worker: str, query: str) -> None:
    """Append INFO flags from BM25 RAG for top-scoring regulatory passages."""
    for hit in rag_store.query(query + " " + text[:500], k=2):
        if hit.score < 2.5:
            break
        ctx.add_flag(ComplianceFlag(
            worker=worker,
            severity=Severity.INFO,
            title=f"Regulatory Reference — {hit.doc_id} {hit.section}",
            description=hit.text[:280],
            citation=CitationRef(
                document_id=hit.doc_id,
                section=hit.section,
                page=None,
                article=hit.article,
            ),
            remediation="Review the full referenced regulation for context.",
        ))

async def run(ctx: PipelineContext) -> None:
    t0 = time.perf_counter()
    if ctx.translated is None:
        ctx.worker_timings["W7"] = 0.0
        return

    text = ctx.translated.text_en

    # Art. 5 — ICT risk management framework
    if not _ICT_FRAMEWORK.search(text):
        ctx.add_flag(ComplianceFlag(
            worker="W7_DORA",
            severity=Severity.HIGH,
            title="DORA: ICT risk management framework not documented",
            description=(
                "No ICT risk management framework reference found. "
                "DORA requires a comprehensive, documented ICT risk management framework "
                "approved by the management body."
            ),
            citation=_cite("Article 5", "Art. 5(1)"),
            remediation=(
                "Document an ICT risk management framework covering: ICT risk appetite, "
                "ICT strategy, policies and procedures, risk identification, protection, "
                "detection, response, recovery, and communication."
            ),
        ))

    # Art. 17 — Incident classification
    if not _INCIDENT_CLASS.search(text):
        ctx.add_flag(ComplianceFlag(
            worker="W7_DORA",
            severity=Severity.HIGH,
            title="DORA: ICT incident classification not addressed",
            description="No incident classification criteria or thresholds documented.",
            citation=_cite("Article 17", "Art. 17(1)"),
            remediation=(
                "Implement incident classification using DORA criteria: number of clients affected, "
                "duration, geographic spread, data loss, economic impact, reputational impact."
            ),
        ))

    # Art. 19 — Reporting timelines (all three mandatory notifications)
    missing_notifications: list[str] = []
    if not _INITIAL_NOTIF.search(text):
        missing_notifications.append("initial (4-hour)")
    if not _INTERMEDIATE_NOTIF.search(text):
        missing_notifications.append("intermediate (72-hour)")
    if not _FINAL_NOTIF.search(text):
        missing_notifications.append("final (1-month)")

    if missing_notifications:
        ctx.add_flag(ComplianceFlag(
            worker="W7_DORA",
            severity=Severity.HIGH,
            title=f"DORA: incident reporting timeline(s) missing — {', '.join(missing_notifications)}",
            description=(
                f"The following mandatory CSSF notification stages are not documented: "
                f"{', '.join(missing_notifications)}."
            ),
            citation=_cite("Article 19", "Art. 19(3)-(5)"),
            remediation=(
                "Document all three reporting stages:\n"
                "  • Initial notification: within 4 hours of classification as major incident\n"
                "  • Intermediate report: within 72 hours of initial notification\n"
                "  • Final report: within 1 month of incident closure"
            ),
        ))

    # Art. 26 — TLPT / resilience testing
    if not _TLPT.search(text):
        ctx.add_flag(ComplianceFlag(
            worker="W7_DORA",
            severity=Severity.MEDIUM,
            title="DORA: threat-led penetration testing (TLPT) not referenced",
            description="No TLPT programme documented for critical ICT systems.",
            citation=_cite("Article 26", "Art. 26(1)"),
            remediation=(
                "Establish TLPT programme aligned with TIBER-EU framework. "
                "Significant entities: TLPT every 3 years. "
                "Testing must cover live production systems with scoped controls."
            ),
        ))

    # Art. 28 — Third-party ICT risk
    if not _THIRD_PARTY_ICT.search(text):
        ctx.add_flag(ComplianceFlag(
            worker="W7_DORA",
            severity=Severity.HIGH,
            title="DORA: ICT third-party risk management not addressed",
            description="No ICT third-party risk management provisions found.",
            citation=_cite("Article 28", "Art. 28(1)"),
            remediation=(
                "Maintain an ICT third-party provider register. "
                "Classify providers as critical/non-critical. "
                "Conduct pre-contract due diligence and annual risk assessments."
            ),
        ))

    # Art. 30 — Contractual provisions
    if not _CONTRACTUAL.search(text):
        ctx.add_flag(ComplianceFlag(
            worker="W7_DORA",
            severity=Severity.MEDIUM,
            title="DORA: mandatory contractual provisions for ICT providers absent",
            description="ICT service contracts must include DORA Art. 30 minimum provisions.",
            citation=_cite("Article 30", "Art. 30(2)"),
            remediation=(
                "Ensure all critical ICT contracts include: service description, SLA targets, "
                "audit rights (direct or via third parties), exit/termination rights, "
                "incident notification obligations, data portability, and sub-outsourcing controls."
            ),
        ))

    # BCP/RTO validation
    if not _BCP_TEST.search(text):
        ctx.add_flag(ComplianceFlag(
            worker="W7_DORA",
            severity=Severity.MEDIUM,
            title="DORA: BCP resilience testing not referenced",
            description="BCP/DRP must be tested annually; no test programme mentioned.",
            citation=_cite("Article 11", "Art. 11(6)"),
            remediation=(
                "Establish annual BCP test programme. Document test results and remediation "
                "actions. Critical systems RTO target: ≤ 2 hours."
            ),
        ))
    else:
        rto_match = _RTO_HOURS.search(text)
        if rto_match:
            rto_hours = float(rto_match.group(1))
            if rto_hours > 4.0:
                ctx.add_flag(ComplianceFlag(
                    worker="W7_DORA",
                    severity=Severity.HIGH,
                    title=f"DORA: RTO of {rto_hours:.0f}h exceeds recommended 2–4h for critical systems",
                    description=(
                        f"Stated RTO of {rto_hours:.0f} hours. "
                        "DORA expects critical ICT systems to have RTO ≤ 2 hours."
                    ),
                    citation=_cite("Article 11", "Art. 11(4)"),
                    threshold=RegulatoryThreshold(
                        name="RTO for critical ICT systems",
                        limit=4.0,
                        unit="hours",
                        actual=rto_hours,
                        breached=rto_hours > 4.0,
                        citation=_cite("Article 11"),
                    ),
                    remediation=(
                        "Reduce RTO for critical systems to ≤ 2 hours. "
                        "Implement hot standby or active-active configuration."
                    ),
                ))

    _rag_augment(ctx, text if ctx.translated else "", "W7_DORA", "DORA ICT incident reporting 4 hours BCP RTO TLPT third-party")
    ctx.worker_timings["W7"] = (time.perf_counter() - t0) * 1_000
