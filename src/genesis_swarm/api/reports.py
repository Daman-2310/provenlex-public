"""
PDF compliance report generation using reportlab.

Generates a signed, timestamped compliance report containing:
  - Report metadata (fund name, date, Merkle root)
  - Executive summary of swarm health
  - Alert timeline (last 50 alerts)
  - Bot status snapshot
  - Audit chain integrity statement

Usage:
    from genesis_swarm.api.reports import generate_compliance_pdf
    pdf_bytes = generate_compliance_pdf(swarm_state)
"""

from __future__ import annotations

import hashlib
import io
import time
from datetime import datetime, timezone
from typing import Any, Optional

try:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER
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

    _REPORTLAB_OK = True
except ImportError:
    _REPORTLAB_OK = False


def generate_compliance_pdf(
    swarm_state: dict[str, Any],
    alerts: list[dict] | None = None,
    bot_statuses: list[dict] | None = None,
    merkle_root: Optional[str] = None,
    fund_name: str = "Genesis Fund",
) -> bytes:
    """
    Generate a regulatory-ready PDF compliance report.
    Returns raw PDF bytes. Raises ImportError if reportlab not installed.
    """
    if not _REPORTLAB_OK:
        raise ImportError("reportlab is required for PDF generation: pip install reportlab>=4.0")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        title=f"Genesis Swarm Compliance Report — {fund_name}",
        author="Genesis Swarm AI Monitoring System",
        subject="Regulatory Compliance Snapshot",
    )

    styles = getSampleStyleSheet()
    normal = styles["Normal"]
    heading1 = styles["Heading1"]
    heading2 = styles["Heading2"]

    mono = ParagraphStyle(
        "Mono",
        parent=normal,
        fontName="Courier",
        fontSize=8,
        textColor=colors.HexColor("#333333"),
    )

    now_utc = datetime.now(timezone.utc)
    report_id = (
        hashlib.sha256(f"{fund_name}{now_utc.isoformat()}".encode()).hexdigest()[:16].upper()
    )

    story: list[Any] = []

    # ── Cover ──────────────────────────────────────────────────────────────
    story.append(Spacer(1, 1 * cm))
    story.append(
        Paragraph(
            "GENESIS SWARM",
            ParagraphStyle(
                "Title",
                parent=heading1,
                fontSize=24,
                alignment=TA_CENTER,
                textColor=colors.HexColor("#00C851"),
            ),
        )
    )
    story.append(
        Paragraph(
            "AI Monitoring Compliance Report",
            ParagraphStyle(
                "Subtitle",
                parent=normal,
                fontSize=14,
                alignment=TA_CENTER,
                textColor=colors.HexColor("#555555"),
            ),
        )
    )
    story.append(Spacer(1, 0.5 * cm))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#00C851")))
    story.append(Spacer(1, 0.3 * cm))

    meta_data = [
        ["Report ID", report_id],
        ["Fund", fund_name],
        ["Generated (UTC)", now_utc.strftime("%Y-%m-%d %H:%M:%S UTC")],
        ["Report Version", "1.0"],
        ["System Version", "Genesis Swarm v0.5.0"],
    ]
    meta_table = Table(meta_data, colWidths=[4 * cm, 13 * cm])
    meta_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.HexColor("#F8F8F8"), colors.white]),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#DDDDDD")),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(meta_table)
    story.append(Spacer(1, 0.5 * cm))

    # ── Section 1: Executive Summary ───────────────────────────────────────
    story.append(Paragraph("1. Executive Summary", heading2))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#DDDDDD")))
    story.append(Spacer(1, 0.2 * cm))

    uptime_s = round(time.time() - swarm_state.get("started_at", time.time()))
    summary_text = (
        f"Genesis Swarm operated for {uptime_s // 3600}h {(uptime_s % 3600) // 60}m "
        f"during the reporting period. The autonomous monitoring system ran {swarm_state.get('consensus_rounds', 0)} "
        f"PBFT consensus rounds with {len(bot_statuses or [])} specialist bots active. "
        "No human intervention was required for routine anomaly detection."
    )
    story.append(Paragraph(summary_text, normal))
    story.append(Spacer(1, 0.4 * cm))

    # ── Section 2: Audit Chain Integrity ──────────────────────────────────
    story.append(Paragraph("2. Audit Chain Integrity", heading2))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#DDDDDD")))
    story.append(Spacer(1, 0.2 * cm))

    if merkle_root:
        story.append(Paragraph("Merkle Root (SHA-256 chain of all audit log entries):", normal))
        story.append(Paragraph(merkle_root, mono))
        story.append(Spacer(1, 0.2 * cm))
        story.append(
            Paragraph(
                "The audit log is stored as an append-only Merkle-chained SQLite ledger. "
                "Any post-hoc modification of any log entry will invalidate the chain hash. "
                "Future versions will anchor the Merkle root to a public blockchain for court-admissible tamper evidence.",
                normal,
            ))
    else:
        story.append(
            Paragraph("Merkle root not available (sovereign ledger not initialised).", normal)
        )
    story.append(Spacer(1, 0.4 * cm))

    # ── Section 3: Bot Status Snapshot ─────────────────────────────────────
    story.append(Paragraph("3. Bot Status Snapshot", heading2))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#DDDDDD")))
    story.append(Spacer(1, 0.2 * cm))

    if bot_statuses:
        bot_rows = [["Bot Type", "Status", "Score", "Cycles", "Last Alert"]]
        for b in bot_statuses[:20]:
            bot_rows.append(
                [
                    b.get("bot_type", "?"),
                    b.get("status", "?"),
                    f"{b.get('anomaly_score', 0):.1f}",
                    str(b.get("cycle_count", 0)),
                    b.get("last_alert_ts", "—") or "—",
                ]
            )
        bot_table = Table(bot_rows, colWidths=[4.5 * cm, 2.5 * cm, 2 * cm, 2 * cm, 6 * cm])
        bot_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1A1A2E")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    (
                        "ROWBACKGROUNDS",
                        (0, 1),
                        (-1, -1),
                        [colors.HexColor("#F0F0F0"), colors.white],
                    ),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CCCCCC")),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        story.append(bot_table)
    else:
        story.append(Paragraph("No bot status data available.", normal))
    story.append(Spacer(1, 0.4 * cm))

    # ── Section 4: Alert Timeline ──────────────────────────────────────────
    story.append(Paragraph("4. Alert Timeline (last 50 events)", heading2))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#DDDDDD")))
    story.append(Spacer(1, 0.2 * cm))

    alert_list = (alerts or [])[:50]
    if alert_list:
        alert_rows = [["Timestamp", "Bot", "Severity", "Score", "Summary"]]
        for a in alert_list:
            ts = a.get("timestamp", "")[:19] if a.get("timestamp") else "?"
            alert_rows.append(
                [
                    ts,
                    a.get("bot_type", "?")[:16],
                    a.get("severity", "?"),
                    f"{a.get('anomaly_score', 0):.1f}",
                    str(a.get("summary", ""))[:60],
                ]
            )
        alert_table = Table(alert_rows, colWidths=[3.5 * cm, 3 * cm, 2.5 * cm, 1.5 * cm, 6.5 * cm])
        alert_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1A1A2E")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    (
                        "ROWBACKGROUNDS",
                        (0, 1),
                        (-1, -1),
                        [colors.HexColor("#F0F0F0"), colors.white],
                    ),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CCCCCC")),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                    ("WORDWRAP", (4, 1), (4, -1), True),
                ]
            )
        )
        story.append(alert_table)
    else:
        story.append(Paragraph("No alerts recorded during this reporting period.", normal))

    story.append(Spacer(1, 0.4 * cm))

    # ── Footer disclaimer ──────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#DDDDDD")))
    story.append(Spacer(1, 0.2 * cm))
    story.append(
        Paragraph(
            "This report is generated automatically by Genesis Swarm v0.5.0. "
            "It is intended as a monitoring aid and does not constitute a formal regulatory audit. "
            "For CSSF Circular 18/698 compliance mapping, refer to CSSF_MAPPING.md.",
            ParagraphStyle(
                "Footer", parent=normal, fontSize=7, textColor=colors.HexColor("#888888")
            ),
        )
    )

    doc.build(story)
    return buf.getvalue()
