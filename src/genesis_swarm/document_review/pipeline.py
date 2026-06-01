"""
Genesis Swarm — Luxembourg Compliance Pipeline Coordinator

Orchestrates the 10-worker sequential pipeline with:
  - Per-worker progress events emitted via asyncio.Queue (consumed by WSS handler)
  - Graceful error isolation: a failed worker emits an error flag but does not
    abort the pipeline — downstream workers receive whatever partial context exists
  - Worker timing captured in ctx.worker_timings for observability
  - Total pipeline latency logged at INFO level

Worker execution order is strictly sequential (each worker depends on prior output).
Workers 4-7 (regulatory auditors) are independent of each other and could run
concurrently, but are kept sequential for deterministic flag ordering in the report.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import AsyncIterator, TYPE_CHECKING

from .schemas import (
    ComplianceReport,
    DocumentFrame,
    PipelineContext,
    PipelineProgress,
    WorkerStatus,
)
from .workers import (
    w1_ingestion,
    w2_anonymizer,
    w3_translator,
    w4_cssf_auditor,
    w5_ucits_auditor,
    w6_raif_sif_auditor,
    w7_dora_auditor,
    w8_risk_detector,
    w9_verifier,
    w10_reporter,
)

if TYPE_CHECKING:
    from ..swarm.llm import HybridLLMClient

log = logging.getLogger(__name__)

_WORKER_NAMES = {
    1: "Ingestion",
    2: "GDPR Anonymizer",
    3: "Multilingual Translator",
    4: "CSSF Auditor",
    5: "UCITS Auditor",
    6: "RAIF/SIF/SICAR Auditor",
    7: "DORA ICT Auditor",
    8: "Risk Detector",
    9: "Deterministic Verifier",
    10: "Report Compiler",
}


async def run_pipeline(
    frame: DocumentFrame,
    llm: "HybridLLMClient",
    progress_queue: asyncio.Queue[PipelineProgress],
) -> ComplianceReport:
    """
    Execute the full 10-worker pipeline for a single DocumentFrame.

    Emits PipelineProgress events to progress_queue after each worker
    (consumed by the WSS handler for 10ms-batched streaming to the frontend).

    Returns the final ComplianceReport regardless of individual worker failures.
    """
    ctx = PipelineContext(frame)
    t_total = time.perf_counter()

    async def _emit(worker_id: int, status: WorkerStatus, message: str = "") -> None:
        await progress_queue.put(PipelineProgress(
            session_id=frame.session_id,
            frame_id=frame.frame_id,
            worker_id=worker_id,
            worker_name=_WORKER_NAMES[worker_id],
            status=status,
            message=message,
            elapsed_ms=(time.perf_counter() - t_total) * 1_000,
        ))

    async def _run_worker(worker_id: int, coro: object) -> None:
        await _emit(worker_id, WorkerStatus.RUNNING)
        try:
            await coro  # type: ignore[misc]
            await _emit(worker_id, WorkerStatus.DONE)
        except Exception as exc:
            log.exception("Worker %d failed", worker_id)
            ctx.add_error(f"W{worker_id}", str(exc))
            await _emit(worker_id, WorkerStatus.FAILED, str(exc))

    # Workers 1–2: no external dependencies
    await _run_worker(1, w1_ingestion.run(ctx))
    await _run_worker(2, w2_anonymizer.run(ctx))

    # Worker 3: needs LLM for translation
    await _run_worker(3, w3_translator.run(ctx, llm))

    # Workers 4–7: regulatory auditors (sequential for deterministic order)
    await _run_worker(4, w4_cssf_auditor.run(ctx))
    await _run_worker(5, w5_ucits_auditor.run(ctx))
    await _run_worker(6, w6_raif_sif_auditor.run(ctx))
    await _run_worker(7, w7_dora_auditor.run(ctx))

    # Workers 8–9: risk and verification (depend on flags from 4–7)
    await _run_worker(8, w8_risk_detector.run(ctx))
    await _run_worker(9, w9_verifier.run(ctx))

    # Worker 10: compile report
    await _emit(10, WorkerStatus.RUNNING)
    report = await w10_reporter.run(ctx)
    await _emit(10, WorkerStatus.DONE, f"Report {report.report_id} ready — {report.flag_summary()}")

    total_ms = (time.perf_counter() - t_total) * 1_000
    log.info(
        "Pipeline complete: session=%s frame=%s fund=%s flags=%d risk=%.1f latency=%.0fms",
        frame.session_id, frame.frame_id,
        report.fund_structure.value, len(report.flags),
        report.risk_score.overall, total_ms,
    )

    return report
