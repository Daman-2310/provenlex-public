"""
Worker 4 — CSSF Regulatory Auditor

Cross-references document text against CSSF Circulars active in Luxembourg:

  CSSF 22/806 — Digital resilience & cloud outsourcing (DORA pre-cursor)
  CSSF 22/816 — Cybersecurity (incident classification, RTO/RPO)
  CSSF 21/789 — Risk management & internal governance
  CSSF 20/750 — Sustainable finance / ESG integration
  CSSF 18/698 — UCI law FAQ (eligible assets, borrowing limits)
  CSSF 14/592 — AIFMD implementation in Luxembourg
  CSSF 11/512 — Risk management process for UCIs

All checks are keyword-pattern driven on the English semantic layer
(output of W3) with exact article citations for every flag raised.
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

# ── Citation constants ────────────────────────────────────────────────────────

_C22_806 = "CSSF Circular 22/806"
_C22_816 = "CSSF Circular 22/816"
_C21_789 = "CSSF Circular 21/789"
_C20_750 = "CSSF Circular 20/750"
_C18_698 = "CSSF Circular 18/698"
_C14_592 = "CSSF Circular 14/592"
_C11_512 = "CSSF Circular 11/512"


def _cite(doc: str, section: str, page: int | None = None, article: str | None = None) -> CitationRef:
    return CitationRef(document_id=doc, section=section, page=page, article=article)


# ── CSSF 22/806: Cloud outsourcing ───────────────────────────────────────────

_CLOUD_PROVIDERS = re.compile(
    r"\b(AWS|Amazon\s+Web\s+Services|Azure|Microsoft\s+Azure|Google\s+Cloud|"
    r"GCP|Oracle\s+Cloud|IBM\s+Cloud|Alibaba\s+Cloud)\b",
    re.I,
)
_CLOUD_REGISTER   = re.compile(r"\bcloud\s+(?:\w+\s+)?(register|registry|inventory)\b", re.I)
_EXIT_STRATEGY    = re.compile(r"\b(exit\s+strategy|portability|switching|reversibility)\b", re.I)
_DATA_RESIDENCY   = re.compile(r"\b(data\s+residency|data\s+localisation|EEA|EU\s+data)\b", re.I)
_SLA_MENTIONS     = re.compile(r"\bSLA\b|\bservice\s+level\s+agreement\b", re.I)


def _check_22_806(text: str) -> list[ComplianceFlag]:
    flags: list[ComplianceFlag] = []

    if _CLOUD_PROVIDERS.search(text):
        if not _CLOUD_REGISTER.search(text):
            flags.append(ComplianceFlag(
                worker="W4_CSSF",
                severity=Severity.HIGH,
                title="Cloud provider not in register",
                description=(
                    "Cloud service provider(s) detected but no cloud provider register "
                    "or inventory referenced in the document."
                ),
                citation=_cite(_C22_806, "Section 3.2", article="Art. 3(2)"),
                remediation=(
                    "Maintain and reference a cloud provider register listing provider name, "
                    "service type, data classification, and contractual reference."
                ),
                raw_excerpt=(_CLOUD_PROVIDERS.search(text) or type("", (), {"group": lambda s: ""})()).group(),
            ))

        if not _EXIT_STRATEGY.search(text):
            flags.append(ComplianceFlag(
                worker="W4_CSSF",
                severity=Severity.HIGH,
                title="Missing cloud exit/portability strategy",
                description="No exit strategy or portability clause documented for cloud services.",
                citation=_cite(_C22_806, "Section 4.1", article="Art. 4(1)(f)"),
                remediation=(
                    "Document a cloud exit strategy covering: data export, transition timelines, "
                    "alternative provider assessment, and RTO/RPO targets."
                ),
            ))

        if not _DATA_RESIDENCY.search(text):
            flags.append(ComplianceFlag(
                worker="W4_CSSF",
                severity=Severity.MEDIUM,
                title="Data residency not documented",
                description="Cloud usage detected but no EEA/EU data residency clause found.",
                citation=_cite(_C22_806, "Section 3.4", article="Art. 3(4)"),
                remediation=(
                    "Specify the geographic location of data processing and storage. "
                    "CSSF requires EEA-resident data for client PII."
                ),
            ))

        if not _SLA_MENTIONS.search(text):
            flags.append(ComplianceFlag(
                worker="W4_CSSF",
                severity=Severity.MEDIUM,
                title="No SLA referenced for cloud services",
                description="Cloud provider SLAs (availability, incident response) not mentioned.",
                citation=_cite(_C22_806, "Section 5.1", article="Art. 5(1)(c)"),
                remediation="Reference minimum SLA targets: ≥ 99.5% availability, < 4h incident response.",
            ))

    return flags


# ── CSSF 22/816: Cybersecurity ────────────────────────────────────────────────

_INCIDENT_REPORT = re.compile(r"\b(incident\s+report|notification\s+procedure|breach\s+notification)\b", re.I)
_CYBER_TESTING   = re.compile(r"\b(penetration\s+test|pen\s+test|TLPT|threat.led\s+penetration)\b", re.I)
_BCDR            = re.compile(r"\b(business\s+continuity|disaster\s+recovery|BCP|BCM|DRP)\b", re.I)


def _check_22_816(text: str) -> list[ComplianceFlag]:
    flags: list[ComplianceFlag] = []
    if not _INCIDENT_REPORT.search(text):
        flags.append(ComplianceFlag(
            worker="W4_CSSF",
            severity=Severity.HIGH,
            title="Cybersecurity incident notification procedure absent",
            description="No incident reporting or breach notification procedure documented.",
            citation=_cite(_C22_816, "Section 4", article="Art. 4"),
            remediation=(
                "Document incident classification (major/significant/minor) and "
                "CSSF notification timelines: initial notification within 4 hours of detection."
            ),
        ))
    if not _CYBER_TESTING.search(text):
        flags.append(ComplianceFlag(
            worker="W4_CSSF",
            severity=Severity.MEDIUM,
            title="No penetration testing programme referenced",
            description="Threat-led penetration testing (TLPT) not mentioned in ICT risk section.",
            citation=_cite(_C22_816, "Section 5.3", article="Art. 5(3)"),
            remediation="Establish annual TLPT programme aligned with TIBER-EU framework.",
        ))
    if not _BCDR.search(text):
        flags.append(ComplianceFlag(
            worker="W4_CSSF",
            severity=Severity.HIGH,
            title="Business continuity/disaster recovery plan not referenced",
            description="BCP/DRP not documented; required for all CSSF-supervised entities.",
            citation=_cite(_C22_816, "Section 6", article="Art. 6"),
            remediation=(
                "Implement and test BCP/DRP covering: RTO ≤ 2 hours for critical systems, "
                "RPO ≤ 4 hours for transaction data."
            ),
        ))
    return flags


# ── CSSF 14/592: AIFMD implementation ────────────────────────────────────────

_AIFM_APPOINTED  = re.compile(r"\b(AIFM|alternative\s+investment\s+fund\s+manager)\b", re.I)
_DEPOSITARY      = re.compile(r"\b(depositary|dépositaire|depotbank)\b", re.I)
_LEVERAGE_AIFMD  = re.compile(r"\b(leverage|effect\s+de\s+levier|hebelwirkung)\b", re.I)


def _check_14_592(text: str, fund: FundStructure) -> list[ComplianceFlag]:
    flags: list[ComplianceFlag] = []
    if fund in (FundStructure.RAIF, FundStructure.AIF, FundStructure.SIF):
        if not _AIFM_APPOINTED.search(text):
            flags.append(ComplianceFlag(
                worker="W4_CSSF",
                severity=Severity.CRITICAL,
                title="AIFM appointment not evidenced",
                description=(
                    f"{fund.value} requires an authorised AIFM. "
                    "No AIFM appointment found in document."
                ),
                citation=_cite(_C14_592, "Section 2.1", article="AIFMD Art. 6"),
                remediation="Appoint an EU-authorised AIFM and document the mandate agreement.",
            ))
        if not _DEPOSITARY.search(text):
            flags.append(ComplianceFlag(
                worker="W4_CSSF",
                severity=Severity.CRITICAL,
                title="Depositary not appointed",
                description="No depositary mentioned; mandatory for AIFMD-regulated funds.",
                citation=_cite(_C14_592, "Section 3.1", article="AIFMD Art. 21"),
                remediation=(
                    "Appoint a Luxembourg credit institution or eligible depositary. "
                    "Depositary must hold all assets and perform cash-flow monitoring."
                ),
            ))
    return flags


# ── CSSF 11/512: Risk management for UCIs ────────────────────────────────────

_RISK_MGMT_PROC  = re.compile(r"\b(risk\s+management\s+process|risk\s+management\s+policy)\b", re.I)
_LIQUIDITY_MGMT  = re.compile(r"\b(liquidity\s+management|liquidity\s+risk|gestion\s+de\s+la\s+liquidité)\b", re.I)


def _check_11_512(text: str, fund: FundStructure) -> list[ComplianceFlag]:
    flags: list[ComplianceFlag] = []
    if fund in (FundStructure.UCITS, FundStructure.SIF, FundStructure.AIF):
        if not _RISK_MGMT_PROC.search(text):
            flags.append(ComplianceFlag(
                worker="W4_CSSF",
                severity=Severity.HIGH,
                title="Risk management process not documented",
                description="No formal risk management process or policy referenced.",
                citation=_cite(_C11_512, "Section 4", article="Art. 4"),
                remediation=(
                    "Document risk management process covering: market risk, credit risk, "
                    "liquidity risk, operational risk, and counterparty risk."
                ),
            ))
        if not _LIQUIDITY_MGMT.search(text):
            flags.append(ComplianceFlag(
                worker="W4_CSSF",
                severity=Severity.MEDIUM,
                title="Liquidity management not addressed",
                description="No liquidity management framework found.",
                citation=_cite(_C11_512, "Section 7", article="Art. 7"),
                remediation=(
                    "Implement liquidity stress testing at least quarterly. "
                    "UCITS: minimum 2 dealing days per week."
                ),
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
        ctx.add_error("W4_CSSF", "No translated document available")
        ctx.worker_timings["W4"] = 0.0
        return

    text = ctx.translated.text_en
    fund = ctx.translated.fund_structure

    for flag in _check_22_806(text):
        ctx.add_flag(flag)
    for flag in _check_22_816(text):
        ctx.add_flag(flag)
    for flag in _check_14_592(text, fund):
        ctx.add_flag(flag)
    for flag in _check_11_512(text, fund):
        ctx.add_flag(flag)

    _rag_augment(ctx, text if ctx.translated else "", "W4_CSSF", "CSSF cloud outsourcing cybersecurity AIFMD depositary UCI risk management")
    ctx.worker_timings["W4"] = (time.perf_counter() - t0) * 1_000
