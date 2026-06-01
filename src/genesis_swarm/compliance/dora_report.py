from __future__ import annotations

import os
import tempfile
import time
import uuid
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from ..shared.bot_base import DetectionResult

# ── Bot-type → affected DORA function mapping ────────────────────────────────
_BOT_FUNCTION_MAP: dict[str, list[str]] = {
    "COMPLIANCE_BOT": ["reporting", "compliance"],
    "SANCTIONS_BOT": ["compliance", "screening"],
    "FX_BOT": ["trading", "settlement"],
    "SATELLITE_ANALYTICS": ["trading", "risk-management"],
    "SOVEREIGN_BOT": ["settlement", "custody"],
    "CARGO_BOT": ["trading", "operations"],
    "COMMODITY_MONITOR": ["liquidity", "operations"],
    "SUCCESSION_BOT": ["governance", "operations"],
    "GENESIS_BOT": ["reporting", "operations"],
    "ASSET_TRACKER": ["compliance", "operations"],
    "COMMANDER_BOT": ["operations", "governance"],
}


@dataclass
class DORAReport:
    report_type: str  # "INITIAL" | "INTERMEDIATE" | "FINAL"
    incident_id: str
    reporting_entity: str
    competent_authority: str
    detection_datetime: datetime
    classification: str  # "HIGH" | "MEDIUM" | "LOW"
    incident_title: str
    affected_functions: list[str]
    root_cause_category: str
    impact_description: str
    clients_affected: int
    transactions_affected: int
    recovery_time_hours: Optional[float]
    measures_taken: str
    cross_border: bool = False

    def to_dict(self) -> dict:
        return {
            "report_type": self.report_type,
            "incident_id": self.incident_id,
            "reporting_entity": self.reporting_entity,
            "competent_authority": self.competent_authority,
            "detection_datetime": self.detection_datetime.isoformat(),
            "classification": self.classification,
            "incident_title": self.incident_title,
            "affected_functions": self.affected_functions,
            "root_cause_category": self.root_cause_category,
            "impact_description": self.impact_description,
            "clients_affected": self.clients_affected,
            "transactions_affected": self.transactions_affected,
            "recovery_time_hours": self.recovery_time_hours,
            "measures_taken": self.measures_taken,
            "cross_border": self.cross_border,
        }

    def to_xml(self) -> str:
        root = ET.Element(
            "ICTIncidentReport",
            attrib={
                "xmlns": "urn:esma:dora:ict-incident:2024",
                "schemaVersion": "1.0",
                "regulatoryBasis": "Commission Implementing Regulation (EU) 2024/2956",
            },
        )

        def _sub(parent: ET.Element, tag: str, text: str) -> ET.Element:
            el = ET.SubElement(parent, tag)
            el.text = text
            return el

        _sub(root, "ReportType", self.report_type)
        _sub(root, "IncidentID", self.incident_id)
        _sub(root, "ReportingEntity", self.reporting_entity)
        _sub(root, "CompetentAuthority", self.competent_authority)
        _sub(root, "DetectionDatetime", self.detection_datetime.isoformat())
        _sub(root, "Classification", self.classification)
        _sub(root, "IncidentTitle", self.incident_title)

        funcs = ET.SubElement(root, "AffectedFunctions")
        for fn in self.affected_functions:
            _sub(funcs, "Function", fn)

        _sub(root, "RootCauseCategory", self.root_cause_category)
        _sub(root, "ImpactDescription", self.impact_description)
        _sub(root, "ClientsAffected", str(self.clients_affected))
        _sub(root, "TransactionsAffected", str(self.transactions_affected))
        if self.recovery_time_hours is not None:
            _sub(root, "RecoveryTimeHours", str(self.recovery_time_hours))
        _sub(root, "MeasuresTaken", self.measures_taken)
        _sub(root, "CrossBorder", "true" if self.cross_border else "false")

        ET.indent(root, space="  ")
        return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="unicode")

    def to_pdf(self, path: str | None = None) -> str:
        from reportlab.lib import colors
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

        if path is None:
            fd, path = tempfile.mkstemp(suffix=".pd", prefix="dora_report_")
            os.close(fd)

        doc = SimpleDocTemplate(
            path,
            pagesize=A4,
            leftMargin=2 * cm,
            rightMargin=2 * cm,
            topMargin=2.5 * cm,
            bottomMargin=2.5 * cm,
        )

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            "DoraTitle",
            parent=styles["Title"],
            fontSize=16,
            textColor=colors.HexColor("#1a2e5a"),
            spaceAfter=6,
        )
        subtitle_style = ParagraphStyle(
            "DoraSubtitle",
            parent=styles["Normal"],
            fontSize=9,
            textColor=colors.HexColor("#555555"),
            spaceAfter=12,
        )
        section_style = ParagraphStyle(
            "DoraSection",
            parent=styles["Heading2"],
            fontSize=11,
            textColor=colors.HexColor("#1a2e5a"),
            spaceBefore=14,
            spaceAfter=4,
        )
        body_style = ParagraphStyle(
            "DoraBody",
            parent=styles["Normal"],
            fontSize=9,
            leading=13,
        )

        clf_colors = {
            "HIGH": colors.HexColor("#c0392b"),
            "MEDIUM": colors.HexColor("#e67e22"),
            "LOW": colors.HexColor("#27ae60"),
        }
        clf_color = clf_colors.get(self.classification, colors.black)

        elements = []

        elements.append(Paragraph("DORA ICT Incident Report", title_style))
        elements.append(
            Paragraph(
                "Commission Implementing Regulation (EU) 2024/2956 — ESMA Template",
                subtitle_style,
            )
        )
        elements.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#1a2e5a")))
        elements.append(Spacer(1, 0.4 * cm))

        # ── Header metadata table ────────────────────────────────────────────
        header_data = [
            ["Report Type", self.report_type, "Incident ID", self.incident_id],
            [
                "Reporting Entity",
                self.reporting_entity,
                "Competent Authority",
                self.competent_authority,
            ],
            [
                "Detection Time",
                self.detection_datetime.strftime("%Y-%m-%d %H:%M UTC"),
                "Cross-Border",
                "Yes" if self.cross_border else "No",
            ],
        ]
        _ = Paragraph(
            f'<font color="{
                clf_color.hexval() if hasattr(
                    clf_color,
                    "hexval") else "#000000"}"><b>{
                self.classification}</b></font>',
            body_style,
        )
        header_data.append(["Classification", self.classification, "Report Version", "1.0"])

        tbl = Table(header_data, colWidths=[3.8 * cm, 6.2 * cm, 3.8 * cm, 3.2 * cm])
        tbl.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eaf0fb")),
                    ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#eaf0fb")),
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#c0c8d8")),
                    (
                        "ROWBACKGROUNDS",
                        (0, 0),
                        (-1, -1),
                        [colors.white, colors.HexColor("#f7f9fc")],
                    ),
                    ("PADDING", (0, 0), (-1, -1), 5),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ]
            )
        )
        elements.append(tbl)
        elements.append(Spacer(1, 0.3 * cm))

        # ── Sections ─────────────────────────────────────────────────────────
        def _section(title: str, content: str) -> None:
            elements.append(Paragraph(title, section_style))
            elements.append(Paragraph(content, body_style))

        _section("Incident Title", self.incident_title)

        elements.append(Paragraph("Affected Functions", section_style))
        for fn in self.affected_functions:
            elements.append(Paragraph(f"• {fn}", body_style))

        _section("Root Cause Category", self.root_cause_category)
        _section("Impact Description", self.impact_description)

        impact_data = [
            [
                "Clients Affected",
                str(self.clients_affected),
                "Transactions Affected",
                str(self.transactions_affected),
            ],
        ]
        if self.recovery_time_hours is not None:
            impact_data.append(["Recovery Time (hours)", f"{self.recovery_time_hours:.1f}", "", ""])
        impact_tbl = Table(impact_data, colWidths=[4.5 * cm, 3.5 * cm, 4.5 * cm, 4.5 * cm])
        impact_tbl.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eaf0fb")),
                    ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#eaf0fb")),
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#c0c8d8")),
                    ("PADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        elements.append(impact_tbl)

        _section("Measures Taken", self.measures_taken)

        elements.append(Spacer(1, 0.5 * cm))
        elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#c0c8d8")))
        generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        elements.append(
            Paragraph(
                f"Generated by Genesis Swarm v0.5.0 — {generated_at} | "
                "Regulatory basis: Commission Implementing Regulation (EU) 2024/2956",
                ParagraphStyle(
                    "Footer",
                    parent=styles["Normal"],
                    fontSize=7,
                    textColor=colors.HexColor("#888888"),
                    spaceBefore=4,
                ),
            )
        )

        doc.build(elements)
        return path


class DORASummary:
    """Build a DORAReport automatically from a list of DetectionResult objects."""

    def __init__(
        self,
        results: list[DetectionResult],
        reporting_entity: str = "Genesis Capital Fund SICAV",
        competent_authority: str = "CSSF",
        report_type: str = "INITIAL",
        root_cause_category: str = "anomaly-detection",
        measures_taken: str = "Automated swarm detection triggered; incident logged for review.",
        clients_affected: int = 0,
        transactions_affected: int = 0,
        recovery_time_hours: Optional[float] = None,
        cross_border: bool = False,
    ):
        self._results = results
        self.reporting_entity = reporting_entity
        self.competent_authority = competent_authority
        self.report_type = report_type
        self.root_cause_category = root_cause_category
        self.measures_taken = measures_taken
        self.clients_affected = clients_affected
        self.transactions_affected = transactions_affected
        self.recovery_time_hours = recovery_time_hours
        self.cross_border = cross_border

    def _classify(self, max_score: float) -> str:
        if max_score >= 80:
            return "HIGH"
        if max_score >= 50:
            return "MEDIUM"
        return "LOW"

    def _affected_functions(self) -> list[str]:
        funcs: list[str] = []
        seen: set[str] = set()
        for r in self._results:
            for fn in _BOT_FUNCTION_MAP.get(r.bot_type.upper(), ["operations"]):
                if fn not in seen:
                    funcs.append(fn)
                    seen.add(fn)
        return funcs or ["operations"]

    def _top_summary(self) -> str:
        if not self._results:
            return "ICT anomaly detected by Genesis Swarm"
        top = max(self._results, key=lambda r: r.score)
        return top.summary or f"ICT anomaly detected by {top.bot_type}"

    def _impact_description(self) -> str:
        if not self._results:
            return "No details available."
        anomalies = [r for r in self._results if r.is_anomaly]
        max_score = max((r.score for r in self._results), default=0.0)
        return (
            f"{len(anomalies)} of {len(self._results)} swarm bots reported anomalies. "
            f"Peak risk score: {max_score:.1f}/100. "
            f"Affected bot types: {', '.join(sorted({r.bot_type for r in anomalies})) or 'none'}."
        )

    def build(self) -> DORAReport:
        max_score = max((r.score for r in self._results), default=0.0)
        detection_ts = min((r.timestamp for r in self._results), default=time.time())
        detection_dt = datetime.fromtimestamp(detection_ts, tz=timezone.utc)

        return DORAReport(
            report_type=self.report_type,
            incident_id=str(uuid.uuid4()),
            reporting_entity=self.reporting_entity,
            competent_authority=self.competent_authority,
            detection_datetime=detection_dt,
            classification=self._classify(max_score),
            incident_title=self._top_summary(),
            affected_functions=self._affected_functions(),
            root_cause_category=self.root_cause_category,
            impact_description=self._impact_description(),
            clients_affected=self.clients_affected,
            transactions_affected=self.transactions_affected,
            recovery_time_hours=self.recovery_time_hours,
            measures_taken=self.measures_taken,
            cross_border=self.cross_border,
        )
