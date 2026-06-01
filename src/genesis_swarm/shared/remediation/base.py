from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Optional


class WorkflowStage:
    DETECTING = "DETECTING"
    CONFIRMING = "CONFIRMING"
    REMEDIATING = "REMEDIATING"
    VERIFYING = "VERIFYING"
    COMPLETE = "COMPLETE"
    FAILED = "FAILED"
    ESCALATED = "ESCALATED"


@dataclass
class RemediationTrigger:
    trigger_type: str  # MEMORY_SPIKE | FEED_FAILURE | FEED_RESTORE | BOT_CRASH | CPU_SPIKE
    affected_bot: str
    severity: str  # LOW | MEDIUM | HIGH | CRITICAL
    metric_value: float
    threshold: float
    details: dict = field(default_factory=dict)


@dataclass
class RemediationWorkflow:
    workflow_id: str = field(default_factory=lambda: f"WF-{uuid.uuid4().hex[:8].upper()}")
    trigger_type: str = ""
    affected_bot: str = ""
    severity: str = "MEDIUM"
    stage: str = WorkflowStage.DETECTING
    actions: list = field(default_factory=list)
    started_at: float = field(default_factory=time.time)
    completed_at: Optional[float] = None
    success: Optional[bool] = None
    summary: str = ""

    def add_action(self, action: str, result: str, details: str = "") -> None:
        self.actions.append(
            {
                "timestamp": round(time.time(), 2),
                "action": action,
                "result": result,  # SUCCESS | FAILED | TRIGGERED | PENDING
                "details": details,
            }
        )

    def complete(self, success: bool, summary: str) -> None:
        self.success = success
        self.summary = summary
        self.completed_at = time.time()
        self.stage = WorkflowStage.COMPLETE if success else WorkflowStage.FAILED

    def escalate(self, reason: str) -> None:
        self.stage = WorkflowStage.ESCALATED
        self.success = False
        self.summary = reason
        self.completed_at = time.time()
        self.add_action("ESCALATE_TO_HUMAN", "TRIGGERED", reason)

    def duration_ms(self) -> float:
        end = self.completed_at or time.time()
        return round((end - self.started_at) * 1000, 1)

    def to_dict(self) -> dict:
        return {
            "workflow_id": self.workflow_id,
            "trigger_type": self.trigger_type,
            "affected_bot": self.affected_bot,
            "severity": self.severity,
            "stage": self.stage,
            "actions": self.actions,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "success": self.success,
            "summary": self.summary,
            "duration_ms": self.duration_ms(),
        }
