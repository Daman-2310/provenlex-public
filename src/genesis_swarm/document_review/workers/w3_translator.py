"""
Worker 3 — Multilingual → Unified Semantic Layer

Translates anonymized document text into precise legal English, preserving
all regulatory terminology, article references, and numerical values.

Routing:
  EN → passthrough (zero LLM calls, zero latency cost)
  FR → Grok translation (primary) with Anthropic fallback
  DE → Grok translation (primary) with Anthropic fallback
  LB → classify dominant base language, then translate as FR/DE
  UNK → attempt translation, fall back to original if confidence low

Side effect: also identifies the fund structure from document keywords so
Workers 4-7 can select the correct regulatory ruleset to apply.
"""

from __future__ import annotations

import logging
import re
import time
from typing import TYPE_CHECKING

from ..language import translate_to_english
from ..schemas import (
    AnonymizedDocument,
    DocumentLanguage,
    FundStructure,
    PipelineContext,
    TranslatedDocument,
)

if TYPE_CHECKING:
    from ...swarm.llm import HybridLLMClient

log = logging.getLogger(__name__)

# ── Fund structure detection ──────────────────────────────────────────────────
# Applied to the anonymized (but not yet translated) text so we match
# the original language terms too.

_STRUCTURE_PATTERNS: list[tuple[FundStructure, list[re.Pattern[str]]]] = [
    (FundStructure.UCITS, [
        re.compile(r"\bUCITS\b", re.I),
        re.compile(r"\bundertaking\s+for\s+collective\s+investment\b", re.I),
        re.compile(r"\borganisme\s+de\s+placement\s+collectif\s+en\s+valeurs\s+mobilières\b", re.I),
        re.compile(r"\bOGAW\b", re.I),   # German: Organismen für gemeinsame Anlagen in Wertpapieren
        re.compile(r"\bOPCVM\b", re.I),  # French acronym
    ]),
    (FundStructure.RAIF, [
        re.compile(r"\bRAIF\b", re.I),
        re.compile(r"\breserved\s+alternative\s+investment\s+fund\b", re.I),
        re.compile(r"\bfonds\s+d.investissement\s+alternatif\s+réservé\b", re.I),
        re.compile(r"\bgesetz\s+vom\s+23\.\s*juli\s+2016\b", re.I),
        re.compile(r"\bloi\s+du\s+23\s+juillet\s+2016\b", re.I),
    ]),
    (FundStructure.SIF, [
        re.compile(r"\bSIF\b"),
        re.compile(r"\bspecialised\s+investment\s+fund\b", re.I),
        re.compile(r"\bfonds\s+d.investissement\s+spécialisé\b", re.I),
        re.compile(r"\bspezialfonds\b", re.I),
        re.compile(r"\bloi\s+du\s+13\s+février\s+2007\b", re.I),
    ]),
    (FundStructure.SICAR, [
        re.compile(r"\bSICAR\b"),
        re.compile(r"\bsociété\s+d.investissement\s+en\s+capital\s+à\s+risque\b", re.I),
        re.compile(r"\brisk\s+capital\s+investment\s+company\b", re.I),
        re.compile(r"\bloi\s+du\s+15\s+juin\s+2004\b", re.I),
    ]),
    (FundStructure.AIF, [
        re.compile(r"\bAIFM\b"),
        re.compile(r"\balternative\s+investment\s+fund\b", re.I),
        re.compile(r"\bfonds\s+d.investissement\s+alternatif\b", re.I),
        re.compile(r"\bgestionnaire\s+de\s+fonds\s+d.investissement\s+alternatifs\b", re.I),
        re.compile(r"\bAIFMD\b", re.I),
    ]),
]


def detect_fund_structure(text: str) -> FundStructure:
    """Identify the Luxembourg fund structure from document text (any language)."""
    scores: dict[FundStructure, int] = {}
    for structure, patterns in _STRUCTURE_PATTERNS:
        count = sum(1 for p in patterns if p.search(text))
        if count:
            scores[structure] = count
    if not scores:
        return FundStructure.UNKNOWN
    return max(scores, key=lambda s: scores[s])


async def run(ctx: PipelineContext, llm: "HybridLLMClient") -> None:
    t0 = time.perf_counter()

    if ctx.anonymized is None:
        ctx.add_error("W3_TRANSLATOR", "No anonymized document — W2 must succeed first")
        ctx.worker_timings["W3"] = 0.0
        return

    anon: AnonymizedDocument = ctx.anonymized
    source_lang = ctx.parsed.detected_language if ctx.parsed else DocumentLanguage.UNK

    # Detect fund structure before translation (original language is more reliable)
    fund_structure = detect_fund_structure(anon.text)

    try:
        text_en = await translate_to_english(anon.text, source_lang, llm)
        import os
        _provider = "groq/llama-3.3-70b" if os.getenv("GROQ_API_KEY") else ("grok-3-fast" if os.getenv("XAI_API_KEY") else "claude")
        model_used = _provider if source_lang != DocumentLanguage.EN else "passthrough"
    except Exception as exc:
        log.warning("Translation failed, using original text: %s", exc)
        text_en = anon.text
        model_used = "passthrough"
        ctx.add_error("W3_TRANSLATOR", f"Translation error: {exc}")

    ctx.translated = TranslatedDocument(
        frame_id=anon.frame_id,
        session_id=anon.session_id,
        text_en=text_en,
        source_language=source_lang,
        translation_model=model_used,
        fund_structure=fund_structure,
    )

    ctx.worker_timings["W3"] = (time.perf_counter() - t0) * 1_000
    log.debug(
        "W3 translated %s → EN via %s, fund=%s",
        source_lang.value, model_used, fund_structure.value,
    )
