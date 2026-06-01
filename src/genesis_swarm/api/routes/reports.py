from __future__ import annotations

import os
import tempfile
import time
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse, StreamingResponse

from ...compliance.dora_report import DORAReport, DORASummary
from ...shared.bot_base import DetectionResult
from ..state import _state
from .auth import _require_auth

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _recent_detection_results(window_seconds: float = 3600.0) -> list[DetectionResult]:
    """Reconstruct DetectionResult objects from bot_history snapshots."""
    cutoff = time.time() - window_seconds
    results: list[DetectionResult] = []
    for bot_type, hist_deque in _state.get("bot_history", {}).items():
        for snap in list(hist_deque):
            if snap.get("timestamp", 0) < cutoff:
                continue
            results.append(
                DetectionResult(
                    bot_id=snap.get("bot_id", bot_type),
                    bot_type=bot_type,
                    score=float(snap.get("score", 0.0)),
                    is_anomaly=bool(snap.get("is_anomaly", False)),
                    threshold=float(snap.get("threshold", 75.0)),
                    summary=snap.get("summary", ""),
                    details=snap.get("details", {}),
                    timestamp=float(snap.get("timestamp", time.time())),
                )
            )
    return results


def _build_report(results: list[DetectionResult]) -> DORAReport:
    return DORASummary(results=results).build()


@router.get("/dora", summary="Generate DORA ICT incident report (JSON)")
def get_dora_report(_user: str = Depends(_require_auth)) -> dict[str, Any]:
    results = _recent_detection_results()
    report = _build_report(results)
    return report.to_dict()


@router.get("/dora/pd", summary="Generate DORA ICT incident report (PDF)")
def get_dora_pdf(_user: str = Depends(_require_auth)):
    results = _recent_detection_results()
    report = _build_report(results)
    fd, path = tempfile.mkstemp(suffix=".pd", prefix="dora_")
    os.close(fd)
    report.to_pdf(path=path)
    return FileResponse(
        path=path,
        media_type="application/pd",
        filename=f"dora_report_{report.incident_id[:8]}.pd",
        background=None,
    )


@router.get("/dora/xml", summary="Generate DORA ICT incident report (XML)")
def get_dora_xml(_user: str = Depends(_require_auth)):
    results = _recent_detection_results()
    report = _build_report(results)
    xml_bytes = report.to_xml().encode("utf-8")
    return StreamingResponse(
        iter([xml_bytes]),
        media_type="application/xml",
        headers={
            "Content-Disposition": f'attachment; filename="dora_report_{report.incident_id[:8]}.xml"',
            "Content-Length": str(len(xml_bytes)),
        },
    )
