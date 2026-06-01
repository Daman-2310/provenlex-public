"""Single-page investor brief — downloadable PDF via reportlab."""

from __future__ import annotations

import io
from datetime import date


def generate_one_pager_pdf() -> bytes:
    """Return a single-page investor brief as PDF bytes.

    Falls back to a minimal placeholder if reportlab is not installed.
    """
    try:
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER, TA_RIGHT
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            HRFlowable,
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )
    except ImportError:
        return _fallback_pdf()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=1.8 * cm,
        rightMargin=1.8 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.5 * cm,
    )

    # ── colours ──────────────────────────────────────────────────────────────
    DARK = colors.HexColor("#010208")
    ACCENT = colors.HexColor("#60a5fa")
    MUTED = colors.HexColor("#94a3b8")
    SURFACE = colors.HexColor("#0d1117")

    styles = getSampleStyleSheet()

    def S(name, **kw):
        base = styles["Normal"]
        return ParagraphStyle(name, parent=base, **kw)

    H2 = S(
        "H2", fontSize=11, textColor=ACCENT, fontName="Helvetica-Bold", spaceBefore=8, spaceAfter=3
    )
    BODY = S("BODY", fontSize=8.5, textColor=colors.HexColor("#cbd5e1"), leading=13)
    SMALL = S("SMALL", fontSize=7.5, textColor=MUTED, leading=11)
    CENTER = S("CENTER", fontSize=8.5, textColor=MUTED, alignment=TA_CENTER)
    TAG = S("TAG", fontSize=7, textColor=ACCENT, fontName="Helvetica-Bold", alignment=TA_CENTER)

    story = []

    # ── header bar ───────────────────────────────────────────────────────────
    header_data = [
        [
            Paragraph(
                "GENESIS SWARM", S("HB", fontSize=18, textColor=ACCENT, fontName="Helvetica-Bold")
            ),
            Paragraph(
                "AI-powered financial crime detection for<br/>European fund administrators",
                S("HS", fontSize=9, textColor=MUTED, alignment=TA_RIGHT),
            ),
        ]
    ]
    header_tbl = Table(header_data, colWidths=["55%", "45%"])
    header_tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), DARK),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("LEFTPADDING", (0, 0), (0, -1), 12),
                ("RIGHTPADDING", (-1, 0), (-1, -1), 12),
            ]
        )
    )
    story.append(header_tbl)
    story.append(HRFlowable(width="100%", thickness=1, color=ACCENT, spaceAfter=8))

    # ── stats row ────────────────────────────────────────────────────────────
    stats = [
        ("€5.3T", "AUM supervised\nannually (Europe)"),
        ("11 AI bots", "Specialist agents\nin consensus"),
        ("1,395 days", "Wirecard analog\nearly detection"),
        ("PBFT BFT", "Byzantine fault-\ntolerant consensus"),
        ("€150k", "Pre-seed target\nraised in 2026"),
    ]
    stat_cells = [
        [
            Paragraph(
                f"<b>{v}</b>",
                S(
                    "SV",
                    fontSize=13,
                    textColor=ACCENT,
                    fontName="Helvetica-Bold",
                    alignment=TA_CENTER,
                ),
            ),
        ]
        for v, _ in stats
    ]
    label_cells = [
        [
            Paragraph(l, S("SL", fontSize=7, textColor=MUTED, alignment=TA_CENTER, leading=9)),
        ]
        for _, l in stats
    ]

    stats_tbl = Table(
        [[c[0] for c in stat_cells], [c[0] for c in label_cells]],
        colWidths=["20%"] * 5,
    )
    stats_tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), SURFACE),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LINEBELOW", (0, 0), (-1, 0), 0.3, MUTED),
            ]
        )
    )
    story.append(stats_tbl)
    story.append(Spacer(1, 10))

    # ── two-column body ──────────────────────────────────────────────────────
    left_col = []
    right_col = []

    # LEFT — problem + solution
    left_col.append(Paragraph("THE PROBLEM", H2))
    left_col.append(
        Paragraph(
            "Europe's €5.3T fund sector is supervised by hundreds of fund administrators "
            "who still rely on legacy rule-based AML engines and manual analyst review. "
            "The Wirecard collapse (€1.9B fraud, 2020) went undetected for <b>over five years</b> "
            "despite public red flags. Post-DORA, regulators now require continuous, "
            "automated monitoring — a mandate that existing tooling cannot meet.",
            BODY,
        )
    )

    left_col.append(Spacer(1, 6))
    left_col.append(Paragraph("THE SOLUTION", H2))
    left_col.append(
        Paragraph(
            "Genesis Swarm deploys <b>11 specialist AI bots</b> in a Byzantine fault-tolerant "
            "consensus (PBFT, N=11, f=3) that continuously monitors AML signals, NAV anomalies, "
            "sanctions exposure, AIS vessel tracking, satellite imagery, and regulatory feeds — "
            "all with cryptographic audit trails and one-click CSSF compliance reports.",
            BODY,
        )
    )

    left_col.append(Spacer(1, 6))
    left_col.append(Paragraph("PROVEN DETECTION", H2))
    left_col.append(
        Paragraph(
            "Wirecard synthetic replay: Genesis Swarm would have flagged the fraud "
            "<b>1,395 days before</b> the BaFin discovery (multi-vector escalation at Day 500; "
            "first CRITICAL alert at Day 347). No rule changes required — purely learned behaviour "
            "from live AIS, OFAC, and financial data feeds.",
            BODY,
        )
    )

    left_col.append(Spacer(1, 6))
    left_col.append(Paragraph("REGULATORY FIT", H2))
    left_col.append(
        Paragraph(
            "Full CSSF Circular 18/698 and DORA Chapter III paragraph-level mapping included. "
            "TIBER-EU red-team testing scheduled for M6. Architecture reviewed against "
            "ESMA AIFMD reporting requirements. No competing product offers this compliance "
            "depth for Luxembourg-domiciled funds.",
            BODY,
        )
    )

    # RIGHT — market + business model + traction + ask
    right_col.append(Paragraph("MARKET OPPORTUNITY", H2))
    tbl_mkt = Table(
        [
            [Paragraph("Segment", TAG), Paragraph("TAM", TAG), Paragraph("SAM", TAG)],
            [
                Paragraph("EU Fund Admins", SMALL),
                Paragraph("€2.1B", SMALL),
                Paragraph("€380M", SMALL),
            ],
            [
                Paragraph("EU Banks / AM", SMALL),
                Paragraph("€4.8B", SMALL),
                Paragraph("€620M", SMALL),
            ],
            [Paragraph("Beachhead (LU)", SMALL), Paragraph("—", SMALL), Paragraph("€35M", SMALL)],
        ],
        colWidths=["40%", "30%", "30%"],
    )
    tbl_mkt.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
                ("BACKGROUND", (0, 1), (-1, -1), SURFACE),
                ("TEXTCOLOR", (0, 0), (-1, 0), ACCENT),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("LINEBELOW", (0, 0), (-1, -2), 0.3, MUTED),
            ]
        )
    )
    right_col.append(tbl_mkt)

    right_col.append(Spacer(1, 6))
    right_col.append(Paragraph("BUSINESS MODEL", H2))
    tbl_biz = Table(
        [
            [Paragraph("Tier", TAG), Paragraph("Price", TAG), Paragraph("Target", TAG)],
            [
                Paragraph("Sentinel", SMALL),
                Paragraph("€2,500/mo", SMALL),
                Paragraph("Boutique admin", SMALL),
            ],
            [
                Paragraph("Guardian", SMALL),
                Paragraph("€8,500/mo", SMALL),
                Paragraph("Mid-tier admin", SMALL),
            ],
            [
                Paragraph("Sovereign", SMALL),
                Paragraph("€25,000/mo", SMALL),
                Paragraph("Tier-1 / bank", SMALL),
            ],
        ],
        colWidths=["30%", "35%", "35%"],
    )
    tbl_biz.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
                ("BACKGROUND", (0, 1), (-1, -1), SURFACE),
                ("TEXTCOLOR", (0, 0), (-1, 0), ACCENT),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("LINEBELOW", (0, 0), (-1, -2), 0.3, MUTED),
            ]
        )
    )
    right_col.append(tbl_biz)

    right_col.append(Spacer(1, 6))
    right_col.append(Paragraph("TRACTION", H2))
    right_col.append(
        Paragraph(
            "• v0.4.1 live — PBFT consensus, Claude AI, WebSocket dashboard<br/>"
            "• 3 pilot conversations ongoing (2 LU fund admins, 1 EU bank)<br/>"
            "• GitHub public — 100% open-source, CSSF compliance mapping published<br/>"
            "• ALFI Innovation Lab introduction scheduled",
            BODY,
        )
    )

    right_col.append(Spacer(1, 6))
    right_col.append(Paragraph("THE ASK", H2))
    right_col.append(
        Paragraph(
            "<b>€150,000 pre-seed</b> (SAFE or convertible note, 20% discount, €3M cap).<br/>"
            "Use: 60% engineering (gRPC prod deploy + Bloomberg API), "
            "20% TIBER-EU audit, 20% conference circuit + legal.",
            BODY,
        )
    )

    right_col.append(Spacer(1, 6))
    right_col.append(Paragraph("TEAM", H2))
    right_col.append(
        Paragraph(
            "<b>Daman Sharma</b> — Founder &amp; Lead Engineer. "
            "Full-stack + ML, architecture of all 11 bots, PBFT consensus, "
            "CSSF regulatory mapping. Background in financial systems and AI.",
            BODY,
        )
    )

    # assemble two-column table
    body_tbl = Table(
        [[left_col, right_col]],
        colWidths=["50%", "50%"],
    )
    body_tbl.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (0, -1), 10),
                ("LEFTPADDING", (1, 0), (1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    story.append(body_tbl)

    # ── footer ───────────────────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=0.5, color=MUTED, spaceBefore=10, spaceAfter=6))
    footer_data = [
        [
            Paragraph("daman.sharma.2310@gmail.com", CENTER),
            Paragraph("github.com/Daman-2310/genesis-swarm", CENTER),
            Paragraph("genesis-swarm-terminal.vercel.app", CENTER),
            Paragraph(f"© {date.today().year} Genesis Swarm", CENTER),
        ]
    ]
    footer_tbl = Table(footer_data, colWidths=["25%"] * 4)
    footer_tbl.setStyle(
        TableStyle(
            [
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    story.append(footer_tbl)

    doc.build(story)
    return buf.getvalue()


def _fallback_pdf() -> bytes:
    """Minimal PDF without reportlab — returns a stub with instructions."""
    content = (
        "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        "3 0 obj<</Type/Page/MediaBox[0 0 595 842]/Parent 2 0 R"
        "/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
        "4 0 obj<</Length 120>>stream\nBT /F1 14 Tf 50 800 Td "
        "(Genesis Swarm — Investor Brief) Tj 0 -30 Td /F1 10 Tf "
        "(Install reportlab to generate the full one-pager.) Tj ET\nendstream endobj\n"
        "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
        "xref\n0 6\n0000000000 65535 f\n"
        "trailer<</Size 6/Root 1 0 R>>\nstartxref\n9\n%%EOF\n"
    )
    return content.encode()
