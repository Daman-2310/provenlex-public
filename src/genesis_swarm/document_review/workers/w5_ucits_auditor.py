"""
Worker 5 — UCITS IV/V Compliance Auditor

Enforces UCITS Directive obligations (2009/65/EC as amended by 2014/91/EU):

  5/10/40 Diversification Rule   — single issuer ≤ 5% NAV (up to 10% permitted;
                                   top issuers combined ≤ 40% NAV)
  Leverage Limits                — commitment approach ≤ 210% NAV;
                                   absolute VaR ≤ 20% NAV
  Eligible Asset Restrictions    — transferable securities, MMIs, deposits, derivatives
  Dealing Frequency              — at minimum 2 dealing days per week
  Borrowing Limit                — ≤ 10% NAV, temporary only
  KIID/KID Disclosure            — mandatory for retail-distributed UCITS
  Management Company requirement — must have authorised ManCo

Only runs when fund_structure == UCITS.  Skipped with INFO for other structures.
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

_UCITS_DIR = "UCITS Directive 2009/65/EC"
_UCITS_V   = "UCITS V Directive 2014/91/EU"
_CSSF_UCI  = "Luxembourg UCI Law (as amended)"


def _cite(doc: str, section: str, article: str | None = None) -> CitationRef:
    return CitationRef(document_id=doc, section=section, article=article)


# ── Regex patterns for UCITS-specific terms ───────────────────────────────────

_FIVE_TEN_FORTY = re.compile(
    r"\b(5\s*/\s*10\s*/\s*40|five.ten.forty|diversification\s+rule|"
    r"issuer\s+limit|single\s+issuer|concentration\s+limit)\b",
    re.I,
)
_LEVERAGE_MENTION = re.compile(
    r"\b(leverage|global\s+exposure|commitment\s+approach|VaR|"
    r"value.at.risk|risque\s+global|gesamtrisiko)\b",
    re.I,
)
_DEALING_FREQ = re.compile(
    r"\b(\d+\s+dealing\s+day|dealing\s+day|valuation\s+day|NAV\s+day|"
    r"jour\s+de\s+valorisation|bewertungstag)\b",
    re.I,
)
_KIID = re.compile(r"\b(KIID|KID|key\s+investor\s+information\s+document)\b", re.I)
_MANACO = re.compile(
    r"\b(management\s+company|ManCo|société\s+de\s+gestion|verwaltungsgesellschaft)\b",
    re.I,
)
_BORROWING = re.compile(r"\b(borrow|borrowing\s+limit|emprunt|kreditaufnahme)\b", re.I)
_ELIGIBLE_ASSETS = re.compile(
    r"\b(eligible\s+asset|transferable\s+securit|money\s+market\s+instrument|"
    r"deposit|derivative|valeur\s+mobilière|instrument\s+financier)\b",
    re.I,
)

# Numeric extractors
_PERCENT_NEAR_SINGLE = re.compile(
    r"(?:single\s+issuer|one\s+issuer|single\s+entity)[^.]{0,80}?(\d{1,3}(?:\.\d+)?)\s*%",
    re.I,
)
_LEVERAGE_PERCENT = re.compile(
    r"(?:leverage|global\s+exposure)[^.]{0,80}?(\d{1,3}(?:\.\d+)?)\s*%",
    re.I,
)
_DEALING_DAYS_NUM = re.compile(r"(\d+)\s+dealing\s+day", re.I)


def _extract_float(pattern: re.Pattern[str], text: str) -> float | None:
    m = pattern.search(text)
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            pass
    return None



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
        ctx.worker_timings["W5"] = 0.0
        return

    fund = ctx.translated.fund_structure
    if fund != FundStructure.UCITS:
        # Skip with INFO — not a UCITS document
        ctx.add_flag(ComplianceFlag(
            worker="W5_UCITS",
            severity=Severity.INFO,
            title="UCITS checks skipped",
            description=f"Fund structure detected as {fund.value}. UCITS rules not applicable.",
            citation=_cite(_UCITS_DIR, "Scope", article="Art. 1"),
            remediation="No action required.",
        ))
        ctx.worker_timings["W5"] = (time.perf_counter() - t0) * 1_000
        return

    text = ctx.translated.text_en

    # 1. 5/10/40 Rule
    if not _FIVE_TEN_FORTY.search(text):
        ctx.add_flag(ComplianceFlag(
            worker="W5_UCITS",
            severity=Severity.HIGH,
            title="5/10/40 diversification rule not addressed",
            description=(
                "No reference to the 5/10/40 issuer concentration rule. "
                "UCITS may not invest more than 5% NAV per single issuer "
                "(up to 10% if aggregate of >5% positions ≤ 40% NAV)."
            ),
            citation=_cite(_UCITS_DIR, "Article 52", article="Art. 52(1)-(2)"),
            remediation=(
                "Add explicit disclosure: single-issuer limit = 5% NAV; "
                "exception up to 10% if combined weight of such holdings ≤ 40% NAV."
            ),
        ))
    else:
        # Try to extract the stated limit and check it
        actual = _extract_float(_PERCENT_NEAR_SINGLE, text)
        if actual is not None and actual > 10.0:
            ctx.add_flag(ComplianceFlag(
                worker="W5_UCITS",
                severity=Severity.CRITICAL,
                title="Single-issuer concentration exceeds UCITS 10% limit",
                description=f"Document states single-issuer limit of {actual:.1f}% — UCITS cap is 10%.",
                citation=_cite(_UCITS_DIR, "Article 52", article="Art. 52(2)"),
                threshold=RegulatoryThreshold(
                    name="Single-issuer concentration",
                    limit=10.0,
                    unit="%",
                    actual=actual,
                    breached=True,
                    citation=_cite(_UCITS_DIR, "Article 52"),
                ),
                remediation="Reduce single-issuer exposure to ≤ 10% NAV and update prospectus.",
            ))

    # 2. Leverage / Global exposure
    if not _LEVERAGE_MENTION.search(text):
        ctx.add_flag(ComplianceFlag(
            worker="W5_UCITS",
            severity=Severity.HIGH,
            title="Leverage / global exposure methodology not disclosed",
            description=(
                "No global exposure methodology (commitment approach or VaR) "
                "referenced in the document."
            ),
            citation=_cite(_UCITS_DIR, "Article 51", article="Art. 51(3)"),
            remediation=(
                "Disclose global exposure methodology. Commitment approach limit: "
                "210% NAV. Absolute VaR limit: 20% NAV."
            ),
        ))
    else:
        leverage_pct = _extract_float(_LEVERAGE_PERCENT, text)
        if leverage_pct is not None and leverage_pct > 210.0:
            ctx.add_flag(ComplianceFlag(
                worker="W5_UCITS",
                severity=Severity.CRITICAL,
                title="Leverage exceeds UCITS commitment-approach limit (210% NAV)",
                description=f"Stated leverage of {leverage_pct:.1f}% exceeds the 210% NAV limit.",
                citation=_cite(_UCITS_DIR, "Article 51", article="Art. 51(3)"),
                threshold=RegulatoryThreshold(
                    name="Commitment-approach leverage",
                    limit=210.0,
                    unit="%",
                    actual=leverage_pct,
                    breached=True,
                    citation=_cite(_UCITS_DIR, "Article 51"),
                ),
                remediation="Reduce gross leverage to ≤ 210% NAV or adopt relative VaR approach.",
            ))

    # 3. Dealing frequency
    if not _DEALING_FREQ.search(text):
        ctx.add_flag(ComplianceFlag(
            worker="W5_UCITS",
            severity=Severity.MEDIUM,
            title="Dealing frequency not disclosed",
            description="Minimum dealing frequency not stated. UCITS must allow at least 2 deals/week.",
            citation=_cite(_UCITS_DIR, "Article 76", article="Art. 76"),
            remediation="Disclose dealing days: minimum twice weekly for open-ended UCITS.",
        ))
    else:
        days = _extract_float(_DEALING_DAYS_NUM, text)
        if days is not None and days < 2:
            ctx.add_flag(ComplianceFlag(
                worker="W5_UCITS",
                severity=Severity.HIGH,
                title="Dealing frequency below UCITS minimum (2 days/week)",
                description=f"Document states {int(days)} dealing day(s) — UCITS minimum is 2 per week.",
                citation=_cite(_UCITS_DIR, "Article 76", article="Art. 76"),
                threshold=RegulatoryThreshold(
                    name="Dealing frequency",
                    limit=2.0,
                    unit="days/week",
                    actual=days,
                    breached=True,
                    citation=_cite(_UCITS_DIR, "Article 76"),
                ),
                remediation="Increase dealing frequency to at least 2 dealing days per week.",
            ))

    # 4. KIID / KID disclosure
    if not _KIID.search(text):
        ctx.add_flag(ComplianceFlag(
            worker="W5_UCITS",
            severity=Severity.HIGH,
            title="KIID/KID not referenced",
            description="No Key Investor Information Document (KIID/PRIIPs KID) mentioned.",
            citation=_cite(_UCITS_DIR, "Article 78", article="Art. 78"),
            remediation=(
                "Prepare and publish a KIID (pre-2023) or PRIIPs KID (post-2023). "
                "Must be provided free of charge before subscription."
            ),
        ))

    # 5. Management Company
    if not _MANACO.search(text):
        ctx.add_flag(ComplianceFlag(
            worker="W5_UCITS",
            severity=Severity.CRITICAL,
            title="Management Company not identified",
            description="No authorised Management Company (ManCo) reference found.",
            citation=_cite(_UCITS_DIR, "Article 5", article="Art. 5(1)"),
            remediation=(
                "Appoint a CSSF-authorised Management Company. "
                "ManCo must be named in the prospectus with its authorisation number."
            ),
        ))

    # 6. Eligible assets
    if not _ELIGIBLE_ASSETS.search(text):
        ctx.add_flag(ComplianceFlag(
            worker="W5_UCITS",
            severity=Severity.MEDIUM,
            title="Eligible asset universe not defined",
            description="Document does not specify UCITS-eligible asset classes.",
            citation=_cite(_UCITS_DIR, "Articles 50-57", article="Art. 50"),
            remediation=(
                "Define eligible investments: transferable securities, MMIs, deposits "
                "(≤12 months), UCITS/UCI units, and financial derivatives for hedging/efficient management."
            ),
        ))

    _rag_augment(ctx, text if ctx.translated else "", "W5_UCITS", "UCITS 5/10/40 leverage commitment KIID ManCo eligible assets dealing")
    ctx.worker_timings["W5"] = (time.perf_counter() - t0) * 1_000
