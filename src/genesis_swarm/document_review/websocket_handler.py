"""
Genesis Swarm — Luxembourg Compliance WSS Handler

WebSocket endpoint: wss://<host>/ws/compliance/review

Authentication (required on upgrade):
  Authorization: Bearer <jwt>   header
  ?token=<jwt>                  query parameter
  ?api_key=<raw-key>            query parameter

Frame protocol:
  Client → Server:  JSON envelope
    {
      "session_id": "<uuid>",           // optional — auto-generated if absent
      "filename":   "prospectus.pdf",   // optional
      "format":     "pdf|text|html",    // optional format hint
      "data":       "<base64>" | "<plain text>"
    }

  Server → Client (during processing, every 10 ms):
    [{"type":"progress","worker_id":3,"worker_name":"...","status":"RUNNING",...}]

  Server → Client (on completion):
    {"type":"report","payload":<ComplianceReport>,"pdf_b64":"<base64 PDF>","audit_seq":<int>}

  Server → Client (on error):
    {"type":"error","message":"...","audit_seq":<int>}

Architecture:
  - JWT verified before ws.accept()
  - Bounded asyncio.Queue(256) drained every 10 ms (backpressure)
  - Every session open/close/error appended to HMAC-chained audit trail
  - PDF generated from final report via reportlab (air-gapped)
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import time
import uuid
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from . import audit_trail
from .auth import extract_token, verify_token
from .pdf_export import generate_pdf
from .pipeline import run_pipeline
from .schemas import DocumentFormat, DocumentFrame, PipelineProgress

log = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["document-review"])

_BATCH_INTERVAL_S = 0.010
_QUEUE_MAXSIZE    = 256


def _get_llm():
    from ..swarm.llm import HybridLLMClient
    return HybridLLMClient.from_env()


def _parse_envelope(raw: str | bytes) -> dict[str, Any]:
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    return json.loads(raw)


def _build_frame(envelope: dict[str, Any]) -> DocumentFrame:
    session_id = envelope.get("session_id") or str(uuid.uuid4())
    filename   = envelope.get("filename")
    fmt_hint   = envelope.get("format", "binary")

    data_field = envelope.get("data", "")
    raw_bytes: bytes | None = None
    raw_text:  str   | None = None

    if isinstance(data_field, bytes):
        raw_bytes = data_field
    else:
        try:
            decoded = base64.b64decode(data_field)
            raw_bytes = decoded
        except Exception:
            raw_text = data_field

    fmt_map: dict[str, DocumentFormat] = {
        "pdf":    DocumentFormat.PDF,
        "text":   DocumentFormat.TEXT,
        "html":   DocumentFormat.HTML,
        "binary": DocumentFormat.BINARY,
    }
    return DocumentFrame(
        session_id=session_id,
        filename=filename,
        raw_bytes=raw_bytes,
        raw_text=raw_text,
        format_hint=fmt_map.get(fmt_hint.lower(), DocumentFormat.BINARY),
    )


async def _batch_sender(
    ws: WebSocket,
    queue: asyncio.Queue[PipelineProgress],
    stop_event: asyncio.Event,
) -> None:
    """Drain the progress queue every 10 ms and send batched events."""
    while not stop_event.is_set() or not queue.empty():
        batch: list[dict[str, Any]] = []
        deadline = time.monotonic() + _BATCH_INTERVAL_S
        while time.monotonic() < deadline:
            try:
                event = queue.get_nowait()
                batch.append({
                    "type":        "progress",
                    "worker_id":   event.worker_id,
                    "worker_name": event.worker_name,
                    "status":      event.status.value,
                    "message":     event.message,
                    "elapsed_ms":  round(event.elapsed_ms, 1),
                })
                queue.task_done()
            except asyncio.QueueEmpty:
                break
        if batch:
            try:
                await ws.send_text(json.dumps(batch))
            except Exception:
                break
        await asyncio.sleep(_BATCH_INTERVAL_S)


@router.websocket("/compliance/review")
async def compliance_review(ws: WebSocket) -> None:
    """
    Accept a document, run the 10-worker compliance pipeline, and stream
    progress + final report (with PDF) back over the WebSocket.

    Connection is rejected with close code 4001 if the bearer token is
    missing or invalid.
    """
    headers      = dict(ws.headers)
    query_params = dict(ws.query_params)
    token        = extract_token(headers, query_params)

    if token is None:
        await ws.close(code=4001, reason="missing_token")
        return

    ok, subject = verify_token(token)
    if not ok:
        await ws.close(code=4001, reason=subject)
        return

    await ws.accept()
    client_addr = str(ws.client)
    log.info("WSS accepted: subject=%s client=%s", subject, client_addr)

    stop_event = asyncio.Event()

    try:
        while True:
            try:
                raw = await ws.receive()
            except WebSocketDisconnect:
                log.info("Client disconnected: subject=%s", subject)
                break

            data = raw.get("text") or raw.get("bytes")
            if data is None:
                continue

            try:
                envelope = _parse_envelope(data)
            except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                await ws.send_text(json.dumps({
                    "type": "error", "message": f"Invalid JSON: {exc}",
                }))
                continue

            try:
                frame = _build_frame(envelope)
            except Exception as exc:
                await ws.send_text(json.dumps({
                    "type": "error", "message": f"Frame parse error: {exc}",
                }))
                continue

            audit_trail.append(
                frame.session_id, "SESSION_OPEN",
                data={"subject": subject, "filename": frame.filename,
                      "client": client_addr},
            )

            progress_queue: asyncio.Queue[PipelineProgress] = asyncio.Queue(
                maxsize=_QUEUE_MAXSIZE
            )
            stop_event.clear()
            sender_task = asyncio.create_task(
                _batch_sender(ws, progress_queue, stop_event)
            )

            try:
                report = await run_pipeline(frame, _get_llm(), progress_queue)
                stop_event.set()
                await sender_task

                pdf_bytes = generate_pdf(report)
                pdf_b64   = base64.b64encode(pdf_bytes).decode("ascii")

                entry = audit_trail.append(
                    frame.session_id, "REPORT_ISSUED",
                    data={
                        "recommendation":    report.recommendation[:60],
                        "critical":          report.critical_count,
                        "high":              report.high_count,
                        "risk_overall":      report.risk_score.overall,
                        "verified":          report.verification.passed,
                        "content_hash":      report.content_hash,
                    },
                )

                await ws.send_text(json.dumps({
                    "type":      "report",
                    "payload":   report.model_dump(mode="json"),
                    "pdf_b64":   pdf_b64,
                    "audit_seq": entry.seq,
                }))

            except Exception as exc:
                stop_event.set()
                sender_task.cancel()
                log.exception("Pipeline error — session=%s", frame.session_id)

                ae = audit_trail.append(
                    frame.session_id, "PIPELINE_ERROR",
                    data={"error": str(exc)},
                )
                await ws.send_text(json.dumps({
                    "type":      "error",
                    "message":   str(exc),
                    "audit_seq": ae.seq,
                }))

    finally:
        stop_event.set()
        log.info("WSS handler exiting: subject=%s", subject)
