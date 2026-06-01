"""
Genesis Swarm — Professional PDF Compliance Report (reportlab)

Generates a 4-section, A4 audit-ready PDF from a ComplianceReport:

  Page 1  — Cover: document metadata, date, session ID, verdict banner
  Page 2  — Executive Summary: risk score dashboard, flag count table
  Page 3+ — Compliance Findings: one row per flag, colour-coded by severity
  Final   — Mathematical Verification + HITL disclaimer

Usage:
    from genesis_swarm.document_review.pdf_export import generate_pdf
    pdf_bytes: bytes = generate_pdf(report)
"""

from __future__ import annotations

import io
from datetime import UTC, datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from .schemas import ComplianceReport, Severity

# ── Brand colours ─────────────────────────────────────────────────────────────
_NAVY    = colors.HexColor("#1a2e5a")
_SILVER  = colors.HexColor("#f0f4f8")
_GOLD    = colors.HexColor("#c9a84c")

_SEV_COLOUR = {
    Severity.CRITICAL: colors.HexColor("#dc2626"),
    Severity.HIGH:     colors.HexColor("#ea580c"),
    Severity.MEDIUM:   colors.HexColor("#ca8a04"),
    Severity.LOW:      colors.HexColor("#2563eb"),
    Severity.INFO:     colors.HexColor("#6b7280"),
}

_VERDICT_COLOUR = {
    "⛔": colors.HexColor("#fee2e2"),
    "⚠": colors.HexColor("#fff7ed"),
    "ℹ": colors.HexColor("#eff6ff"),
    "✅": colors.HexColor("#f0fdf4"),
}


# ── Style sheet ───────────────────────────────────────────────────────────────

def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "cover_title": ParagraphStyle(
            "cover_title",
            fontSize=26, leading=32, textColor=_NAVY,
            fontName="Helvetica-Bold", alignment=TA_CENTER,
        ),
        "cover_sub": ParagraphStyle(
            "cover_sub",
            fontSize=11, leading=14, textColor=colors.HexColor("#4b5563"),
            fontName="Helvetica", alignment=TA_CENTER,
        ),
        "brand": ParagraphStyle(
            "brand",
            fontSize=14, leading=18, textColor=_GOLD,
            fontName="Helvetica-Bold", alignment=TA_CENTER,
        ),
        "section_header": ParagraphStyle(
            "section_header",
            fontSize=13, leading=16, textColor=_NAVY,
            fontName="Helvetica-Bold",
        ),
        "body": ParagraphStyle(
            "body",
            fontSize=9, leading=12,
            fontName="Helvetica",
        ),
        "body_small": ParagraphStyle(
            "body_small",
            fontSize=8, leading=10,
            fontName="Helvetica",
        ),
        "disclaimer": ParagraphStyle(
            "disclaimer",
            fontSize=8, leading=11, textColor=colors.HexColor("#374151"),
            fontName="Helvetica-Oblique", alignment=TA_CENTER,
        ),
        "verdict": ParagraphStyle(
            "verdict",
            fontSize=10, leading=13,
            fontName="Helvetica-Bold", alignment=TA_CENTER,
        ),
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _hr() -> HRFlowable:
    return HRFlowable(width="100%", thickness=0.5, color=_NAVY, spaceAfter=4)


def _sp(h: float = 4) -> Spacer:
    return Spacer(1, h * mm)


def _meta_table(rows: list[tuple[str, str]], styles_map: dict) -> Table:
    data = [[Paragraph(k, styles_map["body_small"]),
             Paragraph(v, styles_map["body_small"])] for k, v in rows]
    t = Table(data, colWidths=[55 * mm, 110 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), _SILVER),
        ("TEXTCOLOR",  (0, 0), (0, -1), _NAVY),
        ("FONTNAME",   (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE",   (0, 0), (-1, -1), 8),
        ("GRID",       (0, 0), (-1, -1), 0.3, colors.lightgrey),
        ("VALIGN",     (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING",  (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


# ── Section builders ──────────────────────────────────────────────────────────

def _cover(report: ComplianceReport, s: dict) -> list:
    verdict_char = report.recommendation[:2].strip()
    bg = _VERDICT_COLOUR.get(verdict_char, _SILVER)

    verdict_row = Table(
        [[Paragraph(report.recommendation, s["verdict"])]],
        colWidths=[165 * mm],
    )
    verdict_row.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("ROUNDEDCORNERS", [4]),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
    ]))

    generated_at = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")

    return [
        _sp(20),
        Paragraph("GENESIS SWARM", s["brand"]),
        _sp(2),
        Paragraph("Sovereign Compliance Engine", s["cover_sub"]),
        _sp(12),
        _hr(),
        _sp(8),
        Paragraph("COMPLIANCE REVIEW REPORT", s["cover_title"]),
        _sp(6),
        Paragraph(
            report.filename or "Untitled Document",
            s["cover_sub"],
        ),
        _sp(10),
        verdict_row,
        _sp(12),
        _meta_table([
            ("Session ID",      report.session_id),
            ("Generated",       generated_at),
            ("Fund Structure",  report.fund_structure.value),
            ("Source Language", report.source_language.value),
            ("Pages Analysed",  str(report.page_count)),
            ("PII Tokens",      str(report.pii_count)),
            ("GDPR Clean",      "YES" if report.gdpr_clean else "NO — review required"),
            ("Content Hash",    report.content_hash[:32] + "…"),
        ], s),
        _sp(6),
        Paragraph(
            "HUMAN-IN-THE-LOOP — This report is produced by an automated system for "
            "the exclusive use of a certified compliance officer.  It does not constitute "
            "a final compliance determination.  Professional sign-off is mandatory before "
            "any regulatory submission.",
            s["disclaimer"],
        ),
        PageBreak(),
    ]


def _executive_summary(report: ComplianceReport, s: dict) -> list:
    risk = report.risk_score

    risk_data = [
        [Paragraph("Dimension", s["body_small"]),
         Paragraph("Score /100", s["body_small"]),
         Paragraph("Band", s["body_small"])],
    ]
    for label, score in [
        ("Leverage",   risk.leverage),
        ("Governance", risk.governance),
        ("Liquidity",  risk.liquidity),
        ("ICT / DORA", risk.ict),
        ("ESG",        risk.esg),
        ("OVERALL",    risk.overall),
    ]:
        band = "HIGH" if score >= 60 else ("MEDIUM" if score >= 30 else "LOW")
        band_colour = (
            colors.HexColor("#fee2e2") if score >= 60
            else colors.HexColor("#fff7ed") if score >= 30
            else colors.HexColor("#f0fdf4")
        )
        risk_data.append([
            Paragraph(label, s["body_small"]),
            Paragraph(f"{score:.1f}", s["body_small"]),
            Paragraph(band, s["body_small"]),
        ])

    risk_table = Table(risk_data, colWidths=[70 * mm, 50 * mm, 45 * mm])
    risk_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), _NAVY),
        ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
        ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",   (0, 0), (-1, -1), 8),
        ("GRID",       (0, 0), (-1, -1), 0.3, colors.lightgrey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, _SILVER]),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#e0e7ff")),
        ("FONTNAME",   (0, -1), (-1, -1), "Helvetica-Bold"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING",  (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))

    flag_data = [
        [Paragraph(sev, s["body_small"]) for sev in
         ["Severity", "Count", "Action Required"]],
        [Paragraph("CRITICAL", s["body_small"]),
         Paragraph(str(report.critical_count), s["body_small"]),
         Paragraph("Immediate — block approval", s["body_small"])],
        [Paragraph("HIGH", s["body_small"]),
         Paragraph(str(report.high_count), s["body_small"]),
         Paragraph("Remediate before launch", s["body_small"])],
        [Paragraph("MEDIUM", s["body_small"]),
         Paragraph(str(report.medium_count), s["body_small"]),
         Paragraph("Address before next review", s["body_small"])],
        [Paragraph("LOW", s["body_small"]),
         Paragraph(str(report.low_count), s["body_small"]),
         Paragraph("Monitor and document", s["body_small"])],
    ]
    flag_table = Table(flag_data, colWidths=[55 * mm, 30 * mm, 80 * mm])
    flag_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), _NAVY),
        ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
        ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",   (0, 0), (-1, -1), 8),
        ("GRID",       (0, 0), (-1, -1), 0.3, colors.lightgrey),
        ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#fee2e2")),
        ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#fff0e6")),
        ("BACKGROUND", (0, 3), (-1, 3), colors.HexColor("#fefce8")),
        ("BACKGROUND", (0, 4), (-1, 4), colors.HexColor("#eff6ff")),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING",  (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))

    return [
        Paragraph("Executive Summary", s["section_header"]),
        _hr(),
        _sp(3),
        Paragraph("Risk Score Dashboard", s["body"]),
        _sp(2),
        risk_table,
        _sp(6),
        Paragraph("Flag Summary", s["body"]),
        _sp(2),
        flag_table,
        PageBreak(),
    ]


def _findings(report: ComplianceReport, s: dict) -> list:
    if not report.flags:
        return [
            Paragraph("Compliance Findings", s["section_header"]),
            _hr(),
            _sp(4),
            Paragraph("No compliance flags were raised.", s["body"]),
            PageBreak(),
        ]

    severity_order = {
        Severity.CRITICAL: 0, Severity.HIGH: 1,
        Severity.MEDIUM: 2,   Severity.LOW: 3, Severity.INFO: 4,
    }
    sorted_flags = sorted(report.flags, key=lambda f: severity_order.get(f.severity, 9))

    header = [
        Paragraph("Sev.", s["body_small"]),
        Paragraph("Worker", s["body_small"]),
        Paragraph("Title / Citation", s["body_small"]),
        Paragraph("Remediation", s["body_small"]),
    ]
    rows = [header]
    row_colours: list[tuple] = []

    for i, flag in enumerate(sorted_flags, start=1):
        sev_col = _SEV_COLOUR.get(flag.severity, colors.grey)
        citation = str(flag.citation) if flag.citation else ""
        title_para = Paragraph(
            f"<b>{flag.title}</b><br/><font size='7' color='#6b7280'>{citation}</font>",
            s["body_small"],
        )
        rows.append([
            Paragraph(flag.severity.value, s["body_small"]),
            Paragraph(flag.worker, s["body_small"]),
            title_para,
            Paragraph(flag.remediation or "—", s["body_small"]),
        ])
        bg = colors.Color(
            sev_col.red, sev_col.green, sev_col.blue, alpha=0.08
        )
        row_colours.append(("BACKGROUND", (0, i), (-1, i), bg))

    table = Table(
        rows,
        colWidths=[18 * mm, 22 * mm, 75 * mm, 50 * mm],
        repeatRows=1,
    )
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), _NAVY),
        ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
        ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",   (0, 0), (-1, -1), 7),
        ("GRID",       (0, 0), (-1, -1), 0.3, colors.lightgrey),
        ("VALIGN",     (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ] + row_colours
    table.setStyle(TableStyle(style_cmds))

    return [
        Paragraph("Compliance Findings", s["section_header"]),
        _hr(),
        _sp(3),
        table,
        PageBreak(),
    ]


def _verification(report: ComplianceReport, s: dict) -> list:
    vr = report.verification
    status_text = "PASSED" if vr.passed else f"FAILED — {vr.checks_failed} violation(s)"
    status_colour = colors.HexColor("#f0fdf4") if vr.passed else colors.HexColor("#fee2e2")

    verdict_box = Table(
        [[Paragraph(f"Mathematical Verification: {status_text}", s["verdict"])]],
        colWidths=[165 * mm],
    )
    verdict_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), status_colour),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    violation_rows = []
    if vr.violations:
        violation_rows = [
            _sp(4),
            Paragraph("Threshold Violations:", s["body"]),
            _sp(2),
        ]
        vdata = [
            [Paragraph("Violation", s["body_small"]), Paragraph("Detail", s["body_small"])],
        ]
        for v in vr.violations:
            # violations are plain strings — split on first colon if present
            text = str(v)
            parts = text.split(":", 1) if ":" in text else [text, ""]
            vdata.append([
                Paragraph(parts[0].strip(), s["body_small"]),
                Paragraph(parts[1].strip() if len(parts) > 1 else "", s["body_small"]),
            ])
        vt = Table(vdata, colWidths=[75 * mm, 90 * mm])
        vt.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), _NAVY),
            ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
            ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",   (0, 0), (-1, -1), 7),
            ("GRID",       (0, 0), (-1, -1), 0.3, colors.lightgrey),
            ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#fee2e2")),
            ("LEFTPADDING",   (0, 0), (-1, -1), 4),
            ("TOPPADDING",    (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        violation_rows.append(vt)

    return [
        Paragraph("Mathematical Verification", s["section_header"]),
        _hr(),
        _sp(3),
        verdict_box,
        *violation_rows,
        _sp(8),
        _hr(),
        _sp(4),
        Paragraph(
            "DISCLAIMER — FOR HUMAN-IN-THE-LOOP REVIEW ONLY",
            ParagraphStyle(
                "disc_title", fontSize=9, leading=11,
                fontName="Helvetica-Bold", alignment=TA_CENTER, textColor=_NAVY,
            ),
        ),
        _sp(3),
        Paragraph(
            "This report has been generated by Genesis Swarm Sovereign Compliance Engine, "
            "an automated multi-agent analysis system.  It is provided exclusively as an "
            "advisory tool to support — not replace — the professional judgment of a "
            "certified compliance officer.\n\n"
            "The findings, risk scores, and regulatory citations contained herein are "
            "derived from algorithmic pattern-matching and probabilistic retrieval.  They "
            "do not constitute legal advice and must not be relied upon as a definitive "
            "compliance determination without independent verification by qualified "
            "legal and compliance professionals.\n\n"
            "Unauthorised reproduction or distribution of this report is prohibited.  "
            "All client data has been anonymised prior to processing in accordance with "
            "GDPR Article 4(5) and CSSF data protection guidelines.",
            s["disclaimer"],
        ),
        _sp(4),
        Paragraph(
            f"Report ID: {report.session_id}  |  "
            f"Content Hash: {report.content_hash[:16]}…  |  "
            f"Generated: {datetime.now(UTC).strftime('%Y-%m-%d %H:%M UTC')}",
            ParagraphStyle(
                "footer", fontSize=7, leading=9,
                fontName="Helvetica", alignment=TA_CENTER,
                textColor=colors.HexColor("#9ca3af"),
            ),
        ),
    ]


# ── Public API ────────────────────────────────────────────────────────────────

def generate_pdf(report: ComplianceReport) -> bytes:
    """
    Render a ComplianceReport as a professional A4 PDF.

    Returns the PDF as raw bytes ready for base64 encoding or disk write.
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=18 * mm,  bottomMargin=18 * mm,
        title=f"Compliance Report — {report.filename or report.session_id}",
        author="Genesis Swarm Sovereign Compliance Engine",
        subject="Luxembourg Fund Compliance Review",
        creator="Genesis Swarm v0.6",
    )

    s = _styles()
    story = (
        _cover(report, s)
        + _executive_summary(report, s)
        + _findings(report, s)
        + _verification(report, s)
    )

    doc.build(story)
    return buf.getvalue()
