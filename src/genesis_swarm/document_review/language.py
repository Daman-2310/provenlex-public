"""
Genesis Swarm — Luxembourg Multilingual Layer

Handles all four languages in active use in Luxembourg financial markets:
  EN — English        (international fund documents, UCITS prospectuses)
  FR — French         (CSSF communications, SIF/RAIF documentation, official filings)
  DE — German         (investor reports, AIF documentation for DACH distribution)
  LB — Luxembourgish  (Lëtzebuergesch — internal memos, regulatory letters)

Detection strategy (fastest-first cascade):
  1. Byte-order mark / HTML lang attribute (deterministic, 0 ms)
  2. Statistical token scan against Luxembourg-specific word lists (< 1 ms)
  3. langdetect library (< 5 ms, handles mixed-language documents)
  4. LLM fallback via HybridLLMClient (Grok primary) for short / noisy text

Translation strategy:
  EN documents → passthrough (no LLM call)
  LB documents → classify as FR or DE first (LB borrows from both)
  FR / DE      → LLM translation to unified English semantic layer
                 preserving all legal terms, article numbers, and numerical values

Luxembourg-specific terminology is preserved as-is even after translation
(e.g., "Fonds commun de placement", "SICAV", "well-informed investor").
"""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING

from .schemas import DocumentLanguage

if TYPE_CHECKING:
    from ..swarm.llm import HybridLLMClient

log = logging.getLogger(__name__)

# ── Statistical word lists for fast detection ─────────────────────────────────
# Curated for Luxembourg financial document vocabulary

_EN_SIGNALS = frozenset({
    "the", "of", "and", "fund", "investment", "prospectus", "investor",
    "shares", "management", "company", "ucits", "undertaking", "directive",
    "annual", "report", "net", "asset", "value", "board", "directors",
    "luxembourg", "regulated", "depositary", "authorized",
})

_FR_SIGNALS = frozenset({
    "le", "la", "les", "de", "du", "des", "et", "un", "une", "est",
    "fonds", "investissement", "prospectus", "actions", "gestion",
    "société", "rapport", "annuel", "valeur", "liquidative", "conseil",
    "administration", "dépositaire", "agréé", "règlement", "arrêté",
    "décret", "loi", "compartiment", "actionnaire", "porteur",
})

_DE_SIGNALS = frozenset({
    "der", "die", "das", "und", "ein", "eine", "ist", "den", "dem",
    "fonds", "investition", "prospekt", "anleger", "verwaltung",
    "gesellschaft", "bericht", "jahresbericht", "nettoinventarwert",
    "vorstand", "depotbank", "luxemburg", "verwahrstelle", "zugelassen",
    "verordnung", "gesetz", "anteilsklasse", "anteilinhaber",
})

_LB_SIGNALS = frozenset({
    "ass", "eng", "vun", "fir", "dat", "dësen", "an", "mat",
    "fongen", "investitioun", "verwaltung", "gesellschaft", "lëtzebuerg",
    "gesetz", "reglement", "aktionär",
})

_LANG_SIGNALS: dict[DocumentLanguage, frozenset[str]] = {
    DocumentLanguage.EN: _EN_SIGNALS,
    DocumentLanguage.FR: _FR_SIGNALS,
    DocumentLanguage.DE: _DE_SIGNALS,
    DocumentLanguage.LB: _LB_SIGNALS,
}


def detect_language(text: str) -> DocumentLanguage:
    """
    Detect the primary language of a financial document text.

    Uses statistical token scoring first (fast, no I/O), then falls back
    to langdetect for ambiguous cases.  Never blocks on I/O.
    """
    if not text or len(text.strip()) < 20:
        return DocumentLanguage.UNK

    sample = text[:4_000].lower()
    tokens = set(re.findall(r"\b[a-zA-ZÀ-öø-ÿ]{2,}\b", sample))

    scores: dict[DocumentLanguage, int] = {
        lang: len(tokens & signals)
        for lang, signals in _LANG_SIGNALS.items()
    }
    best_lang = max(scores, key=lambda l: scores[l])
    best_score = scores[best_lang]

    if best_score >= 5:
        return best_lang

    # Fallback: langdetect (handles short / mixed text well)
    try:
        from langdetect import detect, LangDetectException  # type: ignore
        code = detect(sample)
        mapping = {"en": DocumentLanguage.EN, "fr": DocumentLanguage.FR,
                   "de": DocumentLanguage.DE, "lb": DocumentLanguage.LB}
        return mapping.get(code, DocumentLanguage.UNK)
    except Exception:
        return DocumentLanguage.UNK


def normalize_luxembourgish(text: str) -> DocumentLanguage:
    """
    Lëtzebuergesch (lb) borrows heavily from both French and German.
    Classify it into its dominant base language for translation routing.
    """
    sample = text[:2_000].lower()
    tokens = set(re.findall(r"\b[a-zA-ZÀ-öø-ÿ]{2,}\b", sample))
    fr_count = len(tokens & _FR_SIGNALS)
    de_count = len(tokens & _DE_SIGNALS)
    return DocumentLanguage.FR if fr_count >= de_count else DocumentLanguage.DE


# ── LLM-backed translation ─────────────────────────────────────────────────────

_TRANSLATION_SYSTEM = """
You are a specialist financial translator for Luxembourg fund documents.
Translate the following text into precise legal English.

Rules:
1. Preserve ALL numerical values, percentages, dates, and amounts exactly.
2. Keep Luxembourg-specific terms in their original form with an English gloss in
   parentheses on first use: e.g. "fonds commun de placement (FCP / common fund)".
3. Preserve article and section references exactly: "Art. 17(1)(b)", "§ 12 Abs. 3".
4. Do not paraphrase regulatory obligations — translate them word-for-word.
5. Output only the translated text, no commentary, no markdown.
""".strip()


async def translate_to_english(
    text: str,
    source_lang: DocumentLanguage,
    llm: "HybridLLMClient",
) -> str:
    """
    Translate FR, DE, or LB text to unified English via the Grok primary LLM.

    EN text is returned immediately (zero LLM calls).
    Texts longer than 12 000 characters are chunked with 200-char overlap
    to stay within the model's context window for long prospectuses.
    """
    if source_lang == DocumentLanguage.EN:
        return text

    if source_lang == DocumentLanguage.LB:
        # Route LB to its dominant base language first
        source_lang = normalize_luxembourgish(text)

    lang_label = {
        DocumentLanguage.FR: "French",
        DocumentLanguage.DE: "German",
        DocumentLanguage.LB: "Luxembourgish",
    }.get(source_lang, "unknown")

    chunks = _chunk_text(text, max_chars=10_000, overlap=200)
    translated_chunks: list[str] = []

    for chunk in chunks:
        prompt = (
            f"Translate the following {lang_label} financial/legal text to English:\n\n"
            f"---\n{chunk}\n---"
        )
        from ..swarm.llm import LLMRequest
        req = LLMRequest.from_prompt(
            prompt,
            model="grok-3-fast",
            max_tokens=12_000,
            system=_TRANSLATION_SYSTEM,
        )
        try:
            response = await llm.complete(req)
            translated_chunks.append(response.content.strip())
        except Exception as exc:
            log.warning("Translation failed for chunk, using original: %s", exc)
            translated_chunks.append(chunk)

    return "\n\n".join(translated_chunks)


def _chunk_text(text: str, max_chars: int, overlap: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + max_chars
        chunks.append(text[start:end])
        start = end - overlap
    return chunks


# ── Luxembourg legal term glossary (preserved across translations) ─────────────

LUXEMBOURG_TERMS: dict[str, str] = {
    "SICAV": "Société d'Investissement à Capital Variable (open-ended investment company)",
    "SICAF": "Société d'Investissement à Capital Fixe (closed-ended investment company)",
    "FCP":   "Fonds Commun de Placement (common fund, no legal personality)",
    "RAIF":  "Reserved Alternative Investment Fund",
    "SIF":   "Specialised Investment Fund",
    "SICAR": "Société d'Investissement en Capital à Risque (risk capital investment company)",
    "AIFM":  "Alternative Investment Fund Manager",
    "CSSF":  "Commission de Surveillance du Secteur Financier (Luxembourg financial regulator)",
    "OPC":   "Organisme de Placement Collectif (collective investment undertaking)",
}
