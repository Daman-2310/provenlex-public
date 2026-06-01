"""
Worker 6 — RAIF / SIF / SICAR Auditor

Enforces Luxembourg alternative fund structure requirements:

  RAIF (Reserved Alternative Investment Fund)
    Law of 23 July 2016 — no CSSF authorisation, mandatory authorised AIFM,
    well-informed investors (professional or ≥ €125 000 commitment).

  SIF (Specialised Investment Fund)
    Law of 13 February 2007 (as amended) — CSSF-supervised,
    well-informed investors, 30% single-entity limit, min 3 investors.

  SICAR (Société d'Investissement en Capital à Risque)
    Law of 15 June 2004 — risk capital / PE only, no diversification mandate,
    well-informed investors, no AIFM requirement below AIFMD thresholds.
"""

from __future__ import annotations

import re
import time

from .. import rag_store
from ..schemas import (
    CitationRef,
    ComplianceFlag,
    FundStructure,
    PipelineContext,
    RegulatoryThreshold,
    Severity,
)

# ── Citation helpers ──────────────────────────────────────────────────────────

_RAIF_LAW  = "Luxembourg RAIF Law of 23 July 2016"
_SIF_LAW   = "Luxembourg SIF Law of 13 February 2007"
_SICAR_LAW = "Luxembourg SICAR Law of 15 June 2004"


def _cite(doc: str, section: str, article: str | None = None) -> CitationRef:
    return CitationRef(document_id=doc, section=section, article=article)


# ── Shared patterns ───────────────────────────────────────────────────────────

_WELL_INFORMED = re.compile(
    r"\b(well.informed\s+investor|investisseur\s+avert[iy]|"
    r"erfahrener\s+anleger|professional\s+investor|qualified\s+investor)\b",
    re.I,
)
_MIN_125K = re.compile(
    r"(€\s*125[\s,.]?000|EUR\s*125[\s,.]?000|125[\s,.]?000\s*(?:EUR|€))",
    re.I,
)
_AIFM_REF = re.compile(r"\b(AIFM|alternative\s+investment\s+fund\s+manager)\b", re.I)
_DEPOSITARY = re.compile(r"\b(depositary|dépositaire|depotbank|depositar)\b", re.I)
_SINGLE_ENTITY_LIMIT = re.compile(
    r"(?:single\s+entity|single\s+issuer|one\s+entity)[^.]{0,80}?(\d{1,3}(?:\.\d+)?)\s*%",
    re.I,
)
_THREE_INVESTORS = re.compile(r"\b(three\s+investor|3\s+investor|minimum.*investor)\b", re.I)
_RISK_CAPITAL = re.compile(
    r"\b(risk\s+capital|venture\s+capital|private\s+equity|capital.risque)\b",
    re.I,
)
_ANNUAL_REPORT = re.compile(r"\b(annual\s+report|rapport\s+annuel|jahresbericht)\b", re.I)
_CSSF_APPROVAL = re.compile(
    r"\b(CSSF\s+approv|autorisation\s+CSSF|authorisation.*CSSF|agreement.*CSSF)\b",
    re.I,
)


# ── RAIF checks ───────────────────────────────────────────────────────────────

def _check_raif(text: str) -> list[ComplianceFlag]:
    flags: list[ComplianceFlag] = []

    # RAIF must NOT be CSSF-authorised (it's the selling point)
    if _CSSF_APPROVAL.search(text):
        flags.append(ComplianceFlag(
            worker="W6_RAIF_SIF",
            severity=Severity.HIGH,
            title="RAIF incorrectly references CSSF authorisation",
            description=(
                "RAIFs are exempt from CSSF authorisation by design. "
                "Referencing CSSF approval may misrepresent the fund's regulatory status."
            ),
            citation=_cite(_RAIF_LAW, "Article 2", article="Art. 2"),
            remediation=(
                "Remove CSSF authorisation references. Clarify that the RAIF is supervised "
                "indirectly through its authorised AIFM."
            ),
        ))

    if not _AIFM_REF.search(text):
        flags.append(ComplianceFlag(
            worker="W6_RAIF_SIF",
            severity=Severity.CRITICAL,
            title="RAIF: authorised AIFM not referenced",
            description="RAIFs must appoint an EU-authorised AIFM. No AIFM reference found.",
            citation=_cite(_RAIF_LAW, "Article 4", article="Art. 4(1)"),
            remediation="Identify the authorised AIFM, its jurisdiction, and authorisation number.",
        ))

    if not _WELL_INFORMED.search(text):
        flags.append(ComplianceFlag(
            worker="W6_RAIF_SIF",
            severity=Severity.HIGH,
            title="RAIF: well-informed investor restriction not stated",
            description="RAIFs are restricted to well-informed investors; this must be disclosed.",
            citation=_cite(_RAIF_LAW, "Article 2", article="Art. 2(1)"),
            remediation=(
                "Add investor eligibility clause: professional investors (MiFID II Annex II) "
                "or investors committing ≥ €125 000 in writing."
            ),
        ))
    elif not _MIN_125K.search(text):
        flags.append(ComplianceFlag(
            worker="W6_RAIF_SIF",
            severity=Severity.MEDIUM,
            title="RAIF: €125 000 minimum commitment threshold not stated",
            description="Well-informed investor threshold of €125 000 not explicitly documented.",
            citation=_cite(_RAIF_LAW, "Article 2", article="Art. 2(1)(c)"),
            remediation="State the €125 000 minimum commitment requirement explicitly.",
        ))

    if not _DEPOSITARY.search(text):
        flags.append(ComplianceFlag(
            worker="W6_RAIF_SIF",
            severity=Severity.CRITICAL,
            title="RAIF: depositary not appointed",
            description="RAIF assets must be entrusted to a Luxembourg-regulated depositary.",
            citation=_cite(_RAIF_LAW, "Article 18", article="Art. 18"),
            remediation="Appoint a Luxembourg credit institution as depositary and name it in the document.",
        ))

    if not _ANNUAL_REPORT.search(text):
        flags.append(ComplianceFlag(
            worker="W6_RAIF_SIF",
            severity=Severity.MEDIUM,
            title="RAIF: annual report requirement not addressed",
            description="No annual report commitment found; RAIFs must publish within 6 months of year-end.",
            citation=_cite(_RAIF_LAW, "Article 22", article="Art. 22"),
            remediation="Commit to publishing audited annual report within 6 months of financial year-end.",
        ))

    return flags


# ── SIF checks ────────────────────────────────────────────────────────────────

def _check_sif(text: str) -> list[ComplianceFlag]:
    flags: list[ComplianceFlag] = []

    if not _WELL_INFORMED.search(text):
        flags.append(ComplianceFlag(
            worker="W6_RAIF_SIF",
            severity=Severity.HIGH,
            title="SIF: well-informed investor restriction not stated",
            description="SIFs are restricted to well-informed investors.",
            citation=_cite(_SIF_LAW, "Article 2", article="Art. 2"),
            remediation="Disclose well-informed investor requirement with €125 000 threshold.",
        ))

    # 30% single-entity limit
    m_single = _SINGLE_ENTITY_LIMIT.search(text)
    if m_single:
        stated_pct = float(m_single.group(1))
        if stated_pct > 30.0:
            flags.append(ComplianceFlag(
                worker="W6_RAIF_SIF",
                severity=Severity.CRITICAL,
                title="SIF: single-entity limit exceeds 30% NAV",
                description=f"Stated single-entity limit of {stated_pct:.1f}% breaches the SIF 30% cap.",
                citation=_cite(_SIF_LAW, "Article 7", article="Art. 7(2)"),
                threshold=RegulatoryThreshold(
                    name="SIF single-entity concentration",
                    limit=30.0,
                    unit="%",
                    actual=stated_pct,
                    breached=True,
                    citation=_cite(_SIF_LAW, "Article 7"),
                ),
                remediation="Reduce single-entity exposure to ≤ 30% NAV.",
            ))
    else:
        flags.append(ComplianceFlag(
            worker="W6_RAIF_SIF",
            severity=Severity.HIGH,
            title="SIF: 30% single-entity concentration limit not disclosed",
            description="SIF prospectus must state the 30% single-entity NAV limit.",
            citation=_cite(_SIF_LAW, "Article 7", article="Art. 7(2)"),
            remediation="Add: 'No more than 30% of fund assets may be invested in a single entity.'",
        ))

    if not _THREE_INVESTORS.search(text) and re.search(r"\bone\s+investor\b|\bsingle\s+investor\b", text, re.I):
        flags.append(ComplianceFlag(
            worker="W6_RAIF_SIF",
            severity=Severity.MEDIUM,
            title="SIF: minimum 3-investor requirement may not be met",
            description="SIF must have at least 3 investors within 12 months of launch.",
            citation=_cite(_SIF_LAW, "Article 7", article="Art. 7(3)"),
            remediation="Confirm at least 3 distinct well-informed investors at or before first close.",
        ))

    if not _DEPOSITARY.search(text):
        flags.append(ComplianceFlag(
            worker="W6_RAIF_SIF",
            severity=Severity.CRITICAL,
            title="SIF: depositary not appointed",
            description="SIFs must appoint a Luxembourg depositary.",
            citation=_cite(_SIF_LAW, "Article 16", article="Art. 16"),
            remediation="Name the appointed depositary and confirm it holds all SIF assets.",
        ))

    return flags


# ── SICAR checks ──────────────────────────────────────────────────────────────

def _check_sicar(text: str) -> list[ComplianceFlag]:
    flags: list[ComplianceFlag] = []

    if not _RISK_CAPITAL.search(text):
        flags.append(ComplianceFlag(
            worker="W6_RAIF_SIF",
            severity=Severity.HIGH,
            title="SICAR: risk capital investment scope not stated",
            description="SICARs must invest exclusively in risk capital. Investment scope unclear.",
            citation=_cite(_SICAR_LAW, "Article 1", article="Art. 1(2)"),
            remediation=(
                "Define 'risk capital' scope: securities of companies in the development or "
                "launch phase, not yet listed on a stock exchange."
            ),
        ))

    if not _WELL_INFORMED.search(text):
        flags.append(ComplianceFlag(
            worker="W6_RAIF_SIF",
            severity=Severity.HIGH,
            title="SICAR: well-informed investor restriction not stated",
            description="SICARs are restricted to well-informed investors.",
            citation=_cite(_SICAR_LAW, "Article 2", article="Art. 2"),
            remediation="Disclose investor eligibility with the €125 000 threshold.",
        ))

    return flags


# ── Main entry ────────────────────────────────────────────────────────────────


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
        ctx.worker_timings["W6"] = 0.0
        return

    text = ctx.translated.text_en
    fund = ctx.translated.fund_structure

    if fund == FundStructure.RAIF:
        for flag in _check_raif(text):
            ctx.add_flag(flag)
    elif fund == FundStructure.SIF:
        for flag in _check_sif(text):
            ctx.add_flag(flag)
    elif fund == FundStructure.SICAR:
        for flag in _check_sicar(text):
            ctx.add_flag(flag)
    else:
        ctx.add_flag(ComplianceFlag(
            worker="W6_RAIF_SIF",
            severity=Severity.INFO,
            title="RAIF/SIF/SICAR checks skipped",
            description=f"Fund structure is {fund.value}. Alternative fund structure checks not applicable.",
            citation=_cite(_RAIF_LAW, "Scope"),
            remediation="No action required.",
        ))

    _rag_augment(ctx, text if ctx.translated else "", "W6_RAIF_SIF", "RAIF SIF well-informed investor depositary concentration AIF SICAR")
    ctx.worker_timings["W6"] = (time.perf_counter() - t0) * 1_000
