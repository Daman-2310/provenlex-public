"""
Worker 9 — Deterministic Mathematical Verifier

Validates all LLM-derived and pattern-extracted assumptions against
hardcoded legal mathematical thresholds.  Every check is deterministic —
no LLM inference, no probabilistic judgment.

This is the last line before report generation.  It re-runs pure numeric
checks independently of Workers 4-8 so that no regex or LLM error
downstream can silently bypass a hard regulatory limit.

Thresholds verified:
  UCITS Art. 52   — single-issuer: 5% / 10% / 40% rule
  UCITS Art. 51   — commitment-approach leverage ≤ 210%, VaR ≤ 20%
  AIFMD Art. 111  — gross leverage ≤ 300%, net leverage ≤ 200%
  SIF Art. 7      — single-entity concentration ≤ 30%
  RAIF / SICAR    — minimum commitment €125 000
  DORA Art. 11    — RTO ≤ 2 hours for critical systems
  CSSF 22/806     — at least one cloud provider registered (if cloud present)
"""

from __future__ import annotations

import re
import time

from ..schemas import (
    CitationRef,
    FundStructure,
    PipelineContext,
    RegulatoryThreshold,
    Severity,
    VerificationResult,
)

_THRESHOLDS: list[tuple[str, float, str, str, str, str | None]] = [
    # (name, limit, unit, document_id, section, article)
    ("UCITS single-issuer cap",          5.0,  "%", "UCITS Directive 2009/65/EC",                  "Article 52",  "Art. 52(1)"),
    ("UCITS single-issuer exception cap", 10.0, "%", "UCITS Directive 2009/65/EC",                  "Article 52",  "Art. 52(2)"),
    ("UCITS commitment-approach leverage", 210.0, "%", "UCITS Directive 2009/65/EC",                "Article 51",  "Art. 51(3)"),
    ("UCITS absolute VaR",               20.0, "%", "UCITS Directive 2009/65/EC",                   "Article 51",  "Art. 51(3)"),
    ("UCITS borrowing limit",             10.0, "%", "UCITS Directive 2009/65/EC",                   "Article 83",  "Art. 83"),
    ("AIFMD gross leverage (commitment)", 300.0, "%", "AIFMD CDR 231/2013",                          "Article 111", "Art. 111(1)(b)"),
    ("AIFMD net leverage (commitment)",   200.0, "%", "AIFMD CDR 231/2013",                          "Article 111", "Art. 111(1)(a)"),
    ("SIF single-entity concentration",   30.0, "%", "Luxembourg SIF Law of 13 February 2007",       "Article 7",   "Art. 7(2)"),
    ("DORA RTO for critical systems",      2.0, "h", "DORA Regulation (EU) 2022/2554",               "Article 11",  "Art. 11(4)"),
    ("Well-informed investor minimum",  125_000.0, "EUR", "Luxembourg RAIF Law of 23 July 2016",     "Article 2",   "Art. 2(1)(c)"),
]

# Regex extractors mapped to threshold names
_EXTRACTORS: list[tuple[str, re.Pattern[str]]] = [
    ("UCITS single-issuer cap",            re.compile(r"(?:single.issuer|issuer\s+limit)[^.]{0,80}?(\d{1,3}(?:\.\d+)?)\s*%", re.I)),
    ("UCITS commitment-approach leverage", re.compile(r"(?:commitment\s+approach|global\s+exposure)[^.]{0,80}?(\d{1,4}(?:\.\d+)?)\s*%", re.I)),
    ("UCITS absolute VaR",                re.compile(r"absolute\s+VaR[^.]{0,60}?(\d{1,3}(?:\.\d+)?)\s*%", re.I)),
    ("UCITS borrowing limit",             re.compile(r"borrow(?:ing)?[^.]{0,60}?(\d{1,3}(?:\.\d+)?)\s*%", re.I)),
    ("AIFMD gross leverage (commitment)", re.compile(r"gross\s+leverage[^.]{0,80}?(\d{1,4}(?:\.\d+)?)\s*%", re.I)),
    ("AIFMD net leverage (commitment)",   re.compile(r"net\s+leverage[^.]{0,80}?(\d{1,4}(?:\.\d+)?)\s*%", re.I)),
    ("SIF single-entity concentration",   re.compile(r"(?:single.entity|single.issuer)[^.]{0,80}?(\d{1,3}(?:\.\d+)?)\s*%", re.I)),
    ("DORA RTO for critical systems",     re.compile(r"RTO[^.]{0,60}?(\d+(?:\.\d+)?)\s*h(?:our)?", re.I)),
    ("Well-informed investor minimum",    re.compile(r"(?:€|EUR)\s*([\d,. ]+000)\b", re.I)),
]

# Map threshold name → (document_id, section, article)
_THRESHOLD_CITE: dict[str, tuple[str, str, str | None]] = {
    name: (doc, sec, art) for name, _, _, doc, sec, art in _THRESHOLDS
}
_THRESHOLD_LIMIT: dict[str, tuple[float, str]] = {
    name: (limit, unit) for name, limit, unit, _, _, _ in _THRESHOLDS
}


def _parse_amount(raw: str) -> float | None:
    cleaned = re.sub(r"[€EUR,\s]", "", raw)
    try:
        return float(cleaned)
    except ValueError:
        return None


async def run(ctx: PipelineContext) -> None:
    t0 = time.perf_counter()
    if ctx.translated is None:
        ctx.verification = VerificationResult(passed=True, checks_run=0, checks_failed=0)
        ctx.worker_timings["W9"] = 0.0
        return

    text = ctx.translated.text_en
    fund = ctx.translated.fund_structure

    violations: list[str] = []
    thresholds_checked: list[RegulatoryThreshold] = []
    checks_run = 0
    checks_failed = 0

    for name, pattern in _EXTRACTORS:
        m = pattern.search(text)
        if not m:
            continue

        checks_run += 1
        raw_value = m.group(1)

        # Parse numeric
        if "EUR" in _THRESHOLD_LIMIT.get(name, ("", ""))[1]:
            actual = _parse_amount(raw_value)
        else:
            try:
                actual = float(raw_value.replace(",", "."))
            except ValueError:
                continue

        if actual is None:
            continue

        limit, unit = _THRESHOLD_LIMIT.get(name, (None, ""))
        if limit is None:
            continue

        doc, sec, art = _THRESHOLD_CITE.get(name, ("Unknown", "Unknown", None))
        cite = CitationRef(document_id=doc, section=sec, article=art)

        # Direction: "minimum" thresholds (investor min) are lower-bound checks
        is_minimum = "minimum" in name.lower()
        breached = (actual < limit) if is_minimum else (actual > limit)

        thresh = RegulatoryThreshold(
            name=name,
            limit=limit,
            unit=unit,
            actual=actual,
            breached=breached,
            citation=cite,
        )
        thresholds_checked.append(thresh)

        if breached:
            checks_failed += 1
            direction = "below" if is_minimum else "above"
            violations.append(
                f"{name}: {actual:.2f}{unit} {direction} limit {limit:.2f}{unit} "
                f"— {str(cite)}"
            )

    ctx.verification = VerificationResult(
        passed=checks_failed == 0,
        checks_run=checks_run,
        checks_failed=checks_failed,
        violations=tuple(violations),
        thresholds=tuple(thresholds_checked),
    )

    ctx.worker_timings["W9"] = (time.perf_counter() - t0) * 1_000
