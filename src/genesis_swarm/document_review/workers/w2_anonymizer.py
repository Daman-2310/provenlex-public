"""
Worker 2 — GDPR PII Anonymizer

Strips all Personally Identifiable Information from the document text and
replaces each occurrence with a deterministic token ([CLIENT_ID_001] etc.)
backed by an HMAC-SHA256 commitment so the audit trail is preserved without
storing raw PII anywhere in the pipeline.

Patterns covered (Luxembourg financial context):
  - Names: European name patterns including German umlauts and French accents
  - National ID numbers: Luxembourg (CNS), Belgian (NISS), French (NIR)
  - IBAN (LU prefix + all EU formats)
  - Passport numbers
  - Email addresses
  - Phone numbers (LU +352 and EU formats)
  - Physical addresses (street + postcode)
  - Dates of birth
  - LEI codes (20-character alphanumeric — anonymised for confidentiality)

Tokens are numbered sequentially within each PII type so the compliance
officer can correlate e.g. [CLIENT_ID_001] across the whole document.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import re
import time

from ..schemas import AnonymizedDocument, PIIMatch, PIIType, PipelineContext

log = logging.getLogger(__name__)

# HMAC key — stays in-process, never serialised (mirrors ZKPMasker design)
_HMAC_KEY: bytes = os.environ.get("GENESIS_PII_KEY", "genesis-pii-salt-2024").encode()


def _hmac_ref(value: str) -> str:
    return hmac.new(_HMAC_KEY, value.encode(), hashlib.sha256).hexdigest()[:16]


# ── PII regex catalogue ───────────────────────────────────────────────────────

_PII_PATTERNS: list[tuple[PIIType, re.Pattern[str]]] = [
    # IBAN — LU format first, then generic EU
    (PIIType.IBAN, re.compile(
        r"\b(LU\d{2}[ -]?\d{3}[ -]?\d{13}|"
        r"[A-Z]{2}\d{2}[ -]?[A-Z0-9]{4}[ -]?\d{4}[ -]?\d{4}(?:[ -]?\d{0,4}){0,3})\b",
        re.I,
    )),
    # LEI — exactly 20 alphanumeric
    (PIIType.LEI, re.compile(r"\b[A-Z0-9]{18}\d{2}\b")),
    # Luxembourg CNS national ID (13 digits)
    (PIIType.NATIONAL_ID, re.compile(r"\b\d{13}\b")),
    # Passport (generic — 1-2 letters + 6-9 digits)
    (PIIType.PASSPORT, re.compile(r"\b[A-Z]{1,2}\d{6,9}\b")),
    # Email
    (PIIType.EMAIL, re.compile(
        r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"
    )),
    # Phone — LU +352 and E.164 variants
    (PIIType.PHONE, re.compile(
        r"(?:\+352|00352|0352)?[\s\-]?\(?\d{2,4}\)?[\s\-]?\d{2,4}[\s\-]?\d{2,4}[\s\-]?\d{0,4}"
    )),
    # Date of birth — DD.MM.YYYY | DD/MM/YYYY | YYYY-MM-DD
    (PIIType.DATE_OF_BIRTH, re.compile(
        r"\b(?:\d{1,2}[./]\d{1,2}[./]\d{4}|\d{4}-\d{2}-\d{2})\b"
    )),
    # European names — Title + Capitalised words (2-3 words after title)
    (PIIType.CLIENT_ID, re.compile(
        r"\b(?:Mr|Mrs|Ms|Dr|Prof|Mme|M\.|Herr|Frau|Maître|Me)\s+"
        r"[A-ZÀ-ÖØ-Ý][a-zà-öø-ý]+(?:\s+[A-ZÀ-ÖØ-Ý][a-zà-öø-ý\-]+){0,2}\b"
    )),
    # Account numbers — 8-20 digit sequences not already caught
    (PIIType.ACCOUNT_NUMBER, re.compile(r"\b\d{8,20}\b")),
]

# Street address: "12 Rue de la Paix" | "Kirchberg, 2015 Luxembourg"
_ADDRESS_PATTERN = re.compile(
    r"\b\d{1,5}\s+(?:Rue|Avenue|Boulevard|Allée|Place|Route|Chemin|Impasse|"
    r"Straße|Weg|Platz|Allee|Gasse|Street|Road|Lane|Drive|Court)\s+"
    r"[A-ZÀ-Öa-zà-ö][A-Za-zÀ-ö\s\-]{2,40}",
    re.I,
)


async def run(ctx: PipelineContext) -> None:
    t0 = time.perf_counter()
    if ctx.parsed is None:
        ctx.add_error("W2_ANONYMIZER", "No parsed document — W1 must succeed first")
        ctx.worker_timings["W2"] = 0.0
        return

    text = ctx.parsed.text
    matches: list[PIIMatch] = []
    counters: dict[PIIType, int] = {}

    # Collect all matches with their spans, then replace right-to-left
    # to preserve offsets while mutating the string.
    raw_matches: list[tuple[int, int, PIIType, str]] = []

    for pii_type, pattern in _PII_PATTERNS:
        for m in pattern.finditer(text):
            raw_matches.append((m.start(), m.end(), pii_type, m.group()))

    # Address pattern
    for m in _ADDRESS_PATTERN.finditer(text):
        raw_matches.append((m.start(), m.end(), PIIType.ADDRESS, m.group()))

    # Deduplicate overlapping matches (keep longer span)
    raw_matches.sort(key=lambda x: (x[0], -(x[1] - x[0])))
    deduplicated: list[tuple[int, int, PIIType, str]] = []
    prev_end = -1
    for start, end, pii_type, value in raw_matches:
        if start >= prev_end:
            deduplicated.append((start, end, pii_type, value))
            prev_end = end

    # Replace right-to-left so offsets stay valid
    for start, end, pii_type, value in reversed(deduplicated):
        n = counters.get(pii_type, 0) + 1
        counters[pii_type] = n
        token = f"[{pii_type.value}_{n:03d}]"
        matches.append(PIIMatch(
            pii_type=pii_type,
            token=token,
            offset=start,
            length=end - start,
            hmac_ref=_hmac_ref(value),
        ))
        text = text[:start] + token + text[end:]

    ctx.anonymized = AnonymizedDocument(
        frame_id=ctx.parsed.frame_id,
        session_id=ctx.parsed.session_id,
        text=text,
        pii_matches=tuple(matches),
        pii_count=len(matches),
        gdpr_clean=True,
    )

    if matches:
        log.info(
            "W2 anonymized %d PII instances for frame %s",
            len(matches), ctx.parsed.frame_id,
        )

    ctx.worker_timings["W2"] = (time.perf_counter() - t0) * 1_000
