"""
Genesis Swarm — BM25 Regulatory Knowledge Base (Air-Gapped RAG)

Zero-download, zero-API retrieval over a curated corpus of Luxembourg
financial regulation excerpts using BM25Okapi ranking.

Corpus covers:
  CSSF 22/806  — Cloud outsourcing & digital resilience
  CSSF 22/816  — Cybersecurity
  CSSF 14/592  — AIFMD Luxembourg implementation
  CSSF 11/512  — UCI risk management
  UCITS Dir.   — UCITS IV/V key articles
  AIFMD        — CDR 231/2013 leverage rules
  DORA Reg.    — Articles 5, 11, 17, 19, 26, 28, 30
  RAIF Law     — Law of 23 July 2016
  SIF Law      — Law of 13 February 2007

Usage:
    from genesis_swarm.document_review import rag_store
    hits = rag_store.query("cloud provider register exit strategy EEA", k=3)
    for h in hits:
        print(h.score, h.text[:120], h.citation)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import NamedTuple

from rank_bm25 import BM25Okapi


# ── Corpus ────────────────────────────────────────────────────────────────────

class _Doc(NamedTuple):
    doc_id:   str
    section:  str
    article:  str
    text:     str


_CORPUS: list[_Doc] = [
    # ── CSSF 22/806 (Cloud Outsourcing) ──────────────────────────────────────
    _Doc("CSSF 22/806", "Section 3.2", "Art. 3(2)",
         "Regulated entities must maintain a cloud service provider register listing each "
         "provider name, service type, data classification tier, contractual reference, "
         "and date of last review.  The register must be available for inspection by the CSSF "
         "on demand and updated no less than annually."),
    _Doc("CSSF 22/806", "Section 5", "Art. 5",
         "A documented exit strategy and portability plan must be maintained for every "
         "cloud service.  The plan must address data portability, switching procedures, "
         "reversibility windows, and fallback to an alternative provider or in-house "
         "infrastructure without material business disruption."),
    _Doc("CSSF 22/806", "Section 6", "Art. 6",
         "Personal data and critical operational data processed under cloud outsourcing "
         "arrangements must remain resident within the European Economic Area (EEA) unless "
         "an adequacy decision under GDPR Chapter V applies.  Data localisation obligations "
         "must be contractually enshrined."),
    _Doc("CSSF 22/806", "Section 7", "Art. 7",
         "Service Level Agreements (SLAs) with cloud providers must specify availability "
         "targets, incident notification timescales, and audit rights.  The regulated entity "
         "must retain the right to audit the cloud service provider directly or via a "
         "designated third-party auditor."),
    _Doc("CSSF 22/806", "Section 4", "Art. 4",
         "Material cloud outsourcing arrangements must be notified to the CSSF prior to "
         "implementation.  The notification must include a risk assessment, due diligence "
         "summary, and description of the concentration risk arising from the arrangement."),

    # ── CSSF 22/816 (Cybersecurity) ───────────────────────────────────────────
    _Doc("CSSF 22/816", "Section 2", "Art. 2",
         "Regulated entities must classify ICT-related incidents according to the impact "
         "tiers defined by CSSF 22/816: Critical (systemic impact, regulatory breach), "
         "High (material operational disruption), Medium (contained incident with recovery "
         "plan active), and Low (negligible impact, resolved within SLA)."),
    _Doc("CSSF 22/816", "Section 3", "Art. 3",
         "A Business Continuity Plan (BCP) and Disaster Recovery Plan (DRP) must be "
         "documented, tested at least annually, and reviewed after every major incident.  "
         "Test results and remediation actions must be recorded."),
    _Doc("CSSF 22/816", "Section 4", "Art. 4",
         "Threat-Led Penetration Testing (TLPT) is required for systemically important "
         "entities at a minimum of every three years.  The scope must cover critical systems "
         "and the test must be conducted by a TIBER-EU accredited provider."),

    # ── CSSF 14/592 (AIFMD) ───────────────────────────────────────────────────
    _Doc("CSSF 14/592", "Section 2", "Art. 2",
         "Alternative Investment Fund Managers (AIFMs) marketing or managing AIFs in or "
         "from Luxembourg must be authorised by the CSSF under Part II of the Law of "
         "12 July 2013.  An AIFM authorisation reference number must appear in fund "
         "documentation including the prospectus and annual report."),
    _Doc("CSSF 14/592", "Section 4", "Art. 4",
         "Every AIF domiciled in Luxembourg must appoint a single depositary that is "
         "a credit institution or investment firm authorised in Luxembourg.  The depositary "
         "agreement must clearly specify asset safekeeping, cash flow monitoring, and "
         "oversight duties."),
    _Doc("CSSF 14/592", "Section 6", "Art. 6",
         "The AIFM must disclose to investors the leverage policy including the maximum "
         "leverage permitted.  Under CDR 231/2013 Art. 111, gross method leverage may "
         "not exceed 300% of NAV and net (commitment method) leverage may not exceed "
         "200% of NAV without prior CSSF notification."),

    # ── CSSF 11/512 (UCI Risk Management) ────────────────────────────────────
    _Doc("CSSF 11/512", "Section 2", "Art. 2",
         "UCIs and their management companies must have a documented risk management "
         "process that identifies, measures, monitors, and manages the risks of each "
         "fund on an ongoing basis.  The process must be independent from the portfolio "
         "management function and reviewed at least annually."),
    _Doc("CSSF 11/512", "Section 3", "Art. 3",
         "Liquidity risk management must ensure that the liquidity profile of investments "
         "is compatible with the redemption policy disclosed to investors.  Stress tests "
         "of liquidity must be conducted regularly and documented."),
    _Doc("CSSF 11/512", "Section 5", "Art. 5",
         "Operational risk must be monitored and reported to senior management and the "
         "board at least quarterly.  The risk management framework must address technology "
         "risk, counterparty risk, legal risk, and reputational risk."),

    # ── UCITS Directive (2009/65/EC and amendments) ───────────────────────────
    _Doc("UCITS Directive", "Art. 52", "Art. 52",
         "A UCITS fund may not invest more than 5% of its net assets in transferable "
         "securities or money market instruments issued by the same body.  This limit "
         "may be raised to 10% provided that the total value of positions exceeding 5% "
         "does not exceed 40% of the fund's net assets (the '5/10/40 rule')."),
    _Doc("UCITS Directive", "Art. 51", "Art. 51",
         "A UCITS using the commitment approach to measure global exposure must ensure "
         "that exposure does not exceed 100% of net assets, meaning total leverage "
         "(assets plus derivatives commitment) does not exceed 200% of NAV.  The "
         "absolute VaR limit under the VaR approach is 20% of NAV."),
    _Doc("UCITS Directive", "Art. 76", "Art. 76",
         "UCITS must offer redemption of units or shares at least twice per month, "
         "unless the fund's dealing frequency is clearly disclosed and at least once per "
         "fortnight for money market and bond funds.  The dealing frequency must be "
         "prominently disclosed in the prospectus."),
    _Doc("UCITS Directive", "Art. 78", "Art. 78",
         "A Key Investor Information Document (KIID) must be provided to investors before "
         "subscription.  The KIID must include the fund's investment objectives and policy, "
         "risk and reward profile, charges, and past performance.  It must be updated "
         "annually."),
    _Doc("UCITS Directive", "Art. 5", "Art. 5",
         "A UCITS must be managed by a management company (ManCo) authorised under "
         "the UCITS Directive, or operate as a self-managed investment company.  The "
         "ManCo must have minimum own funds of EUR 125,000 and an additional capital "
         "buffer for assets under management exceeding EUR 250 million."),
    _Doc("UCITS Directive", "Art. 50", "Art. 50",
         "A UCITS may invest only in eligible assets including transferable securities "
         "admitted to trading, money market instruments, units of UCITS or eligible "
         "non-UCITS funds, deposits with credit institutions, and financial derivative "
         "instruments.  Investment in other assets requires explicit regulatory approval."),

    # ── AIFMD / CDR 231/2013 ─────────────────────────────────────────────────
    _Doc("CDR 231/2013", "Art. 111(1)(a)", "Art. 111(1)(a)",
         "Net leverage of an AIF calculated using the commitment method must not exceed "
         "200% of the net asset value of the AIF.  The AIFM must notify the competent "
         "authority when this limit is reached or a breach is imminent."),
    _Doc("CDR 231/2013", "Art. 111(1)(b)", "Art. 111(1)(b)",
         "Gross leverage of an AIF calculated using the gross method must not exceed "
         "300% of the net asset value of the AIF.  The gross method includes all derivative "
         "exposures converted to equivalent underlying positions and all borrowings."),
    _Doc("CDR 231/2013", "Art. 24", "Art. 24",
         "AIFMs must report to national competent authorities on a regular basis.  Reports "
         "must include the main instruments traded, principal markets, and leverage details "
         "including total leverage employed expressed as a ratio to NAV."),

    # ── DORA Regulation (EU 2022/2554) ────────────────────────────────────────
    _Doc("DORA Regulation", "Art. 5", "Art. 5",
         "Financial entities must have in place a comprehensive and documented ICT risk "
         "management framework that is reviewed at least annually by the management body.  "
         "The framework must identify, classify, and document ICT functions and assets, "
         "and map information flows and interdependencies."),
    _Doc("DORA Regulation", "Art. 11", "Art. 11",
         "Financial entities must implement a Business Continuity Policy including ICT "
         "business continuity plans.  Recovery Time Objectives (RTOs) for critical ICT "
         "systems must not exceed two hours.  Plans must be tested at least annually."),
    _Doc("DORA Regulation", "Art. 17", "Art. 17",
         "Financial entities must classify ICT-related incidents based on the criteria "
         "set out in RTS under DORA.  Major incidents must be escalated immediately to "
         "senior management.  An internal incident register must be maintained and "
         "reviewed quarterly."),
    _Doc("DORA Regulation", "Art. 19(1)", "Art. 19(1)",
         "For major ICT-related incidents, financial entities must submit an initial "
         "notification to the competent authority within 4 hours of classification.  "
         "The initial notification must describe the nature of the incident, its scope, "
         "and the immediate containment actions taken."),
    _Doc("DORA Regulation", "Art. 19(3)", "Art. 19(3)",
         "An intermediate report on a major ICT-related incident must be submitted to "
         "the competent authority within 72 hours of the initial notification.  The "
         "intermediate report must include an updated impact assessment, root cause "
         "analysis progress, and remediation timeline."),
    _Doc("DORA Regulation", "Art. 19(5)", "Art. 19(5)",
         "A final report on a major ICT-related incident must be submitted to the "
         "competent authority within one month of the incident being classified as resolved.  "
         "The final report must include full root cause analysis, lessons learned, and "
         "measures implemented to prevent recurrence."),
    _Doc("DORA Regulation", "Art. 26", "Art. 26",
         "Significant financial entities are required to conduct threat-led penetration "
         "tests (TLPT) based on the TIBER-EU framework at least every three years.  "
         "Tests must cover all critical or important functions and must be performed by "
         "a certified external provider."),
    _Doc("DORA Regulation", "Art. 28", "Art. 28",
         "Financial entities must manage ICT third-party risk throughout the lifecycle "
         "of service relationships.  A register of third-party ICT service providers "
         "must be maintained and provided to the competent authority on request."),
    _Doc("DORA Regulation", "Art. 30", "Art. 30",
         "Contracts with ICT third-party service providers must include provisions "
         "covering description of services, data location, audit rights, sub-outsourcing "
         "conditions, exit strategies, and incident reporting obligations."),

    # ── RAIF Law (23 July 2016) ───────────────────────────────────────────────
    _Doc("RAIF Law 2016", "Art. 2", "Art. 2",
         "A Reserved Alternative Investment Fund (RAIF) does not require prior CSSF "
         "authorisation before launch.  Instead, regulatory oversight is exercised "
         "indirectly through the mandatory appointment of an authorised External AIFM "
         "regulated under Part II of the Law of 12 July 2013."),
    _Doc("RAIF Law 2016", "Art. 4", "Art. 4",
         "Investors in a RAIF must qualify as well-informed investors as defined in "
         "the SIF Law.  The minimum initial subscription is EUR 125,000 per investor, "
         "or an equivalent amount in another currency, unless a competent authority "
         "certifies the investor's expertise."),
    _Doc("RAIF Law 2016", "Art. 7", "Art. 7",
         "Every RAIF must appoint a depositary established in Luxembourg.  The depositary "
         "must be a bank authorised under the Law of 5 April 1993 relating to the financial "
         "sector.  The depositary agreement must be in writing and cover all assets."),
    _Doc("RAIF Law 2016", "Art. 20", "Art. 20",
         "RAIFs must publish an annual report within six months of the end of the financial "
         "year.  The report must include audited financial statements, the list of investments "
         "as at year-end, and a statement of changes in net assets during the period."),

    # ── SIF Law (13 February 2007) ────────────────────────────────────────────
    _Doc("SIF Law 2007", "Art. 2", "Art. 2",
         "A Specialised Investment Fund (SIF) is open only to well-informed investors.  "
         "A well-informed investor is an institutional investor, a professional investor "
         "within the meaning of MiFID II, or any other investor who confirms in writing "
         "that they understand the risks and invests a minimum of EUR 125,000."),
    _Doc("SIF Law 2007", "Art. 7(2)", "Art. 7(2)",
         "A SIF may not invest more than 30% of its assets or commitments to subscribe "
         "in securities of the same type issued by the same issuer.  This diversification "
         "requirement is a hard legal limit and may not be waived by the fund's documents."),
    _Doc("SIF Law 2007", "Art. 5", "Art. 5",
         "A SIF must be supervised by the CSSF and must obtain authorisation before "
         "commencing activities.  The promoter or sponsor of the SIF must be a reputable "
         "entity with adequate financial standing and professional experience."),
    _Doc("SIF Law 2007", "Art. 16", "Art. 16",
         "SIFs are required to have at least three investors.  A SIF with a single investor "
         "must convert to a SICAR or obtain a specific derogation from the CSSF within "
         "six months of the single-investor condition arising."),
    _Doc("SIF Law 2007", "Art. 52", "Art. 52",
         "Every SIF must appoint a depositary.  The depositary must be a Luxembourg "
         "credit institution and must hold all assets of the SIF.  The depositary "
         "agreement must specify the fees, liability, and reporting obligations."),

    # ── SICAR Law (15 June 2004) ──────────────────────────────────────────────
    _Doc("SICAR Law 2004", "Art. 1", "Art. 1",
         "A SICAR (Société d'Investissement en Capital à Risque) invests exclusively in "
         "risk capital instruments.  Risk capital means the direct or indirect contribution "
         "to entities in view of their launch, development, or listing on a stock exchange.  "
         "SICARs may not invest in assets of an ordinary investment character."),
    _Doc("SICAR Law 2004", "Art. 2", "Art. 2",
         "SICAR investors must be well-informed investors with a minimum initial investment "
         "of EUR 125,000 per investor.  The SICAR must have at least one investor at all "
         "times and must obtain CSSF authorisation prior to commencement of activities."),

    # ── GDPR / CSSF Data Protection ───────────────────────────────────────────
    _Doc("GDPR Art. 5", "Art. 5(1)(a-f)", "Art. 5",
         "Personal data must be processed lawfully, fairly, and transparently.  Data must "
         "be collected for specified and legitimate purposes and not further processed in a "
         "manner incompatible with those purposes.  The data minimisation principle requires "
         "that only data strictly necessary for the purpose is processed."),
    _Doc("GDPR Art. 17", "Art. 17", "Art. 17",
         "Data subjects have the right to erasure ('right to be forgotten').  Financial "
         "entities must have documented procedures for erasure requests, including those "
         "arising from client off-boarding.  Retention schedules must be defensible under "
         "applicable regulatory retention requirements."),
]


# ── BM25 index ────────────────────────────────────────────────────────────────

def _tokenise(text: str) -> list[str]:
    return text.lower().split()


_TOKENISED = [_tokenise(d.text) for d in _CORPUS]
_INDEX: BM25Okapi = BM25Okapi(_TOKENISED)


# ── Public types ──────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class RAGResult:
    score:      float
    doc_id:     str
    section:    str
    article:    str
    text:       str

    @property
    def citation(self) -> str:
        return f"Citation: {self.doc_id}, {self.section}, {self.article}"


# ── Public API ────────────────────────────────────────────────────────────────

def query(text: str, k: int = 3) -> list[RAGResult]:
    """
    Retrieve the top-k most relevant regulatory passages for *text*.

    Returns passages ranked by BM25 score (descending).  Passages with
    score 0.0 are excluded — they share no vocabulary with the query.
    """
    tokens = _tokenise(text)
    scores = _INDEX.get_scores(tokens)

    ranked = sorted(
        zip(scores, range(len(_CORPUS))),
        key=lambda x: x[0],
        reverse=True,
    )

    results: list[RAGResult] = []
    for score, idx in ranked[:k]:
        if score <= 0.0:
            break
        doc = _CORPUS[idx]
        results.append(RAGResult(
            score=float(score),
            doc_id=doc.doc_id,
            section=doc.section,
            article=doc.article,
            text=doc.text,
        ))
    return results


def corpus_size() -> int:
    """Return the number of regulatory passages in the knowledge base."""
    return len(_CORPUS)
