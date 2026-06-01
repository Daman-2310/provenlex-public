"""
Worker 1 — Document Ingestion

Accepts raw binary or text WSS frames and produces a clean ParsedDocument:
  - PDF → text via pypdf (preserves page boundaries)
  - HTML → text via regex tag stripping
  - Plain text → normalised whitespace
  - Binary → sniff magic bytes, attempt decode

Language is detected here and stamped onto the ParsedDocument so every
downstream worker knows the source locale without re-detecting.
"""

from __future__ import annotations

import io
import logging
import re
import time
import unicodedata

from ..schemas import (
    DocumentFormat,
    DocumentFrame,
    DocumentLanguage,
    ParsedDocument,
    PipelineContext,
)
from ..language import detect_language

log = logging.getLogger(__name__)

# Magic byte signatures
_PDF_MAGIC  = b"%PDF"
_HTML_MAGIC = (b"<!DOCTYPE", b"<html", b"<HTML")


def _sniff_format(frame: DocumentFrame) -> DocumentFormat:
    if frame.format_hint not in (DocumentFormat.BINARY, None):
        return frame.format_hint
    if frame.raw_bytes:
        header = frame.raw_bytes[:8].lstrip()
        if header.startswith(_PDF_MAGIC):
            return DocumentFormat.PDF
        if any(header.lower().startswith(m.lower()) for m in _HTML_MAGIC):
            return DocumentFormat.HTML
        # Try UTF-8 decode — if it succeeds, treat as text
        try:
            frame.raw_bytes.decode("utf-8")
            return DocumentFormat.TEXT
        except UnicodeDecodeError:
            return DocumentFormat.BINARY
    if frame.raw_text is not None:
        lower = (frame.raw_text[:100]).lstrip().lower()
        if lower.startswith("<!doctype") or lower.startswith("<html"):
            return DocumentFormat.HTML
        return DocumentFormat.TEXT
    return DocumentFormat.BINARY


def _extract_pdf(data: bytes) -> tuple[str, int]:
    from pypdf import PdfReader  # type: ignore
    reader = PdfReader(io.BytesIO(data))
    pages: list[str] = []
    for page in reader.pages:
        text = page.extract_text() or ""
        pages.append(text)
    return "\n\n".join(pages), len(pages)


def _strip_html(html: str) -> str:
    # Remove script/style blocks first
    html = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html, flags=re.S | re.I)
    # Strip remaining tags
    text = re.sub(r"<[^>]+>", " ", html)
    # Decode common HTML entities
    replacements = {"&amp;": "&", "&lt;": "<", "&gt;": ">",
                    "&nbsp;": " ", "&quot;": '"', "&euro;": "€"}
    for ent, char in replacements.items():
        text = text.replace(ent, char)
    return text


def _normalise(text: str) -> str:
    # NFC normalisation — unifies composed/decomposed Unicode forms
    text = unicodedata.normalize("NFC", text)
    # Collapse runs of whitespace, preserve paragraph breaks
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


async def run(ctx: PipelineContext) -> None:
    t0 = time.perf_counter()
    frame = ctx.frame

    fmt = _sniff_format(frame)
    text = ""
    page_count = 1

    try:
        if fmt == DocumentFormat.PDF and frame.raw_bytes:
            text, page_count = _extract_pdf(frame.raw_bytes)
        elif fmt == DocumentFormat.HTML:
            raw = frame.raw_text or (frame.raw_bytes or b"").decode("utf-8", errors="replace")
            text = _strip_html(raw)
        elif fmt == DocumentFormat.TEXT:
            text = frame.raw_text or (frame.raw_bytes or b"").decode("utf-8", errors="replace")
        else:
            # Last resort — attempt lossy UTF-8 decode
            text = (frame.raw_bytes or b"").decode("utf-8", errors="replace")

        text = _normalise(text)
        if not text:
            ctx.add_error("W1_INGESTION", "No extractable text found in document")
            return

        lang = detect_language(text)
        filename = frame.filename or "unknown"

        ctx.parsed = ParsedDocument(
            frame_id=frame.frame_id,
            session_id=frame.session_id,
            text=text,
            page_count=page_count,
            format=fmt,
            detected_language=lang,
            metadata={"filename": filename, "format": fmt.value},
        )

    except Exception as exc:
        ctx.add_error("W1_INGESTION", f"Extraction failed: {exc}")
        log.exception("W1 ingestion error for frame %s", frame.frame_id)

    ctx.worker_timings["W1"] = (time.perf_counter() - t0) * 1_000
