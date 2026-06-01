"""
Genesis Swarm — Luxembourg Document Compliance Schemas

All Pydantic v2 models that flow through the 10-worker pipeline.
Designed to round-trip cleanly as JSON for WebSocket dispatch and
to mirror the serde structs in the Rust engine (snake_case fields,
no optional-without-default, no bare dict).
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ── Enumerations ───────────────────────────────────────────────────────────────


class DocumentLanguage(str, Enum):
    EN = "en"   # English
    FR = "fr"   # French
    DE = "de"   # German
    LB = "lb"   # Luxembourgish (Lëtzebuergesch)
    UNK = "unk" # Unknown / mixed


class DocumentFormat(str, Enum):
    PDF   = "pdf"
    TEXT  = "text"
    HTML  = "html"
    BINARY = "binary"


class FundStructure(str, Enum):
    UCITS  = "UCITS"
    RAIF   = "RAIF"
    SIF    = "SIF"
    SICAR  = "SICAR"
    AIF    = "AIF"
    UNKNOWN = "UNKNOWN"


class Severity(str, Enum):
    CRITICAL = "CRITICAL"   # Must block sign-off
    HIGH     = "HIGH"       # Requires immediate remediation
    MEDIUM   = "MEDIUM"     # Must be addressed pre-launch
    LOW      = "LOW"        # Advisory
    INFO     = "INFO"       # Informational


class WorkerStatus(str, Enum):
    PENDING   = "PENDING"
    RUNNING   = "RUNNING"
    DONE      = "DONE"
    FAILED    = "FAILED"
    SKIPPED   = "SKIPPED"


class PIIType(str, Enum):
    CLIENT_ID        = "CLIENT_ID"
    ACCOUNT_NUMBER   = "ACCOUNT_NUMBER"
    NATIONAL_ID      = "NATIONAL_ID"
    PASSPORT         = "PASSPORT"
    EMAIL            = "EMAIL"
    PHONE            = "PHONE"
    ADDRESS          = "ADDRESS"
    DATE_OF_BIRTH    = "DATE_OF_BIRTH"
    IBAN             = "IBAN"
    LEI              = "LEI"          # Legal Entity Identifier (not PII but anonymised)


# ── Core value objects ─────────────────────────────────────────────────────────


class CitationRef(BaseModel):
    """Absolute, human-verifiable citation for every compliance finding."""
    model_config = ConfigDict(frozen=True)

    document_id: str    # e.g. "CSSF_22/806" | "UCITS_Directive_2009/65/EC"
    section:     str    # e.g. "Chapter 3, Article 12" | "Section 5.2"
    page:        int | None = None
    article:     str | None = None  # e.g. "Art. 17(1)(b)"
    url:         str | None = None  # canonical regulatory URL

    def __str__(self) -> str:
        parts = [f"Citation: {self.document_id}, {self.section}"]
        if self.page is not None:
            parts.append(f"Page {self.page}")
        if self.article:
            parts.append(self.article)
        return ", ".join(parts)


class PIIMatch(BaseModel):
    model_config = ConfigDict(frozen=True)

    pii_type:  PIIType
    token:     str    # replacement token, e.g. "[CLIENT_ID_001]"
    offset:    int    # char offset in original text
    length:    int
    hmac_ref:  str    # HMAC-SHA256 of original value (audit trail without raw PII)


class RegulatoryThreshold(BaseModel):
    model_config = ConfigDict(frozen=True)

    name:      str
    limit:     float
    unit:      str          # "%" | "bp" | "EUR" | "days"
    actual:    float | None = None
    breached:  bool = False
    citation:  CitationRef


# ── Worker I/O frames ──────────────────────────────────────────────────────────


class DocumentFrame(BaseModel):
    """Incoming WSS frame — may arrive as bytes or text."""
    model_config = ConfigDict(frozen=True)

    frame_id:    str  = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id:  str
    raw_bytes:   bytes | None = None
    raw_text:    str   | None = None
    filename:    str   | None = None
    format_hint: DocumentFormat = DocumentFormat.BINARY
    received_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @field_validator("raw_bytes", "raw_text", mode="before")
    @classmethod
    def at_least_one_content(cls, v: Any, info: Any) -> Any:
        return v

    def content_hash(self) -> str:
        payload = self.raw_bytes or (self.raw_text or "").encode()
        return hashlib.sha256(payload).hexdigest()[:16]


class ParsedDocument(BaseModel):
    """Output of Worker 1 — structured text extracted from the frame."""
    model_config = ConfigDict(frozen=True)

    frame_id:    str
    session_id:  str
    text:        str
    page_count:  int
    format:      DocumentFormat
    detected_language: DocumentLanguage
    metadata:    dict[str, str] = Field(default_factory=dict)


class AnonymizedDocument(BaseModel):
    """Output of Worker 2 — PII stripped, tokens injected."""
    model_config = ConfigDict(frozen=True)

    frame_id:     str
    session_id:   str
    text:         str           # PII-replaced text
    pii_matches:  tuple[PIIMatch, ...] = ()
    pii_count:    int = 0
    gdpr_clean:   bool = True


class TranslatedDocument(BaseModel):
    """Output of Worker 3 — unified English semantic layer."""
    model_config = ConfigDict(frozen=True)

    frame_id:          str
    session_id:        str
    text_en:           str
    source_language:   DocumentLanguage
    translation_model: str = "passthrough"  # "grok-3-fast" | "passthrough"
    fund_structure:    FundStructure = FundStructure.UNKNOWN


# ── Compliance findings ────────────────────────────────────────────────────────


class ComplianceFlag(BaseModel):
    """A single compliance finding from any regulatory auditor."""
    model_config = ConfigDict(frozen=True)

    flag_id:     str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    worker:      str                  # "W4_CSSF" | "W5_UCITS" | ...
    severity:    Severity
    title:       str
    description: str
    citation:    CitationRef
    threshold:   RegulatoryThreshold | None = None
    remediation: str                  # actionable fix for the compliance officer
    raw_excerpt: str = ""             # source text that triggered the flag


class RiskScore(BaseModel):
    model_config = ConfigDict(frozen=True)

    overall:     float = Field(ge=0.0, le=100.0)   # 0 = clean, 100 = critical
    leverage:    float = Field(ge=0.0, le=100.0, default=0.0)
    liquidity:   float = Field(ge=0.0, le=100.0, default=0.0)
    governance:  float = Field(ge=0.0, le=100.0, default=0.0)
    ict:         float = Field(ge=0.0, le=100.0, default=0.0)
    esg:         float = Field(ge=0.0, le=100.0, default=0.0)


class VerificationResult(BaseModel):
    """Output of Worker 9 — deterministic mathematical checks."""
    model_config = ConfigDict(frozen=True)

    passed:       bool
    checks_run:   int
    checks_failed: int
    violations:   tuple[str, ...] = ()
    thresholds:   tuple[RegulatoryThreshold, ...] = ()


# ── Pipeline progress events (streamed over WSS every 10 ms) ──────────────────


class PipelineProgress(BaseModel):
    """Streamed to the frontend every 10 ms during processing."""
    model_config = ConfigDict(frozen=True)

    session_id:   str
    frame_id:     str
    worker_id:    int
    worker_name:  str
    status:       WorkerStatus
    message:      str = ""
    elapsed_ms:   float = 0.0
    timestamp:    datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ── Final compliance report ────────────────────────────────────────────────────


class ComplianceReport(BaseModel):
    """
    Schema-validated final output — serde-compatible, WSS-safe JSON.

    This is the HITL sign-off payload.  No binary decisions are made;
    every flag is evidence-backed with a precise citation so the
    compliance officer can verify the source in seconds.
    """
    model_config = ConfigDict(frozen=True)

    report_id:       str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id:      str
    frame_id:        str
    generated_at:    datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Document metadata
    filename:        str | None
    format:          DocumentFormat
    source_language: DocumentLanguage
    page_count:      int
    fund_structure:  FundStructure

    # PII summary
    pii_count:       int
    gdpr_clean:      bool

    # Regulatory findings
    flags:           tuple[ComplianceFlag, ...] = ()
    critical_count:  int = 0
    high_count:      int = 0
    medium_count:    int = 0
    low_count:       int = 0

    # Risk
    risk_score:      RiskScore

    # Verification
    verification:    VerificationResult

    # HITL gate
    sign_off_required: bool = True
    recommendation:    str = "Refer to compliance officer for final sign-off."

    # Audit trail
    pipeline_version: str = "1.0.0"
    content_hash:     str = ""

    def flag_summary(self) -> str:
        return (
            f"{self.critical_count} CRITICAL | {self.high_count} HIGH | "
            f"{self.medium_count} MEDIUM | {self.low_count} LOW"
        )


# ── Pipeline context (mutable, not a Pydantic model) ─────────────────────────


class PipelineContext:
    """
    Mutable carrier threaded through all 10 workers.

    Not a Pydantic model — workers mutate it in place.
    Frozen Pydantic models are only used for I/O boundaries.
    """

    __slots__ = (
        "frame", "parsed", "anonymized", "translated",
        "flags", "risk_score", "verification",
        "worker_timings", "errors",
    )

    def __init__(self, frame: DocumentFrame) -> None:
        self.frame:        DocumentFrame               = frame
        self.parsed:       ParsedDocument  | None      = None
        self.anonymized:   AnonymizedDocument | None   = None
        self.translated:   TranslatedDocument | None   = None
        self.flags:        list[ComplianceFlag]        = []
        self.risk_score:   RiskScore | None            = None
        self.verification: VerificationResult | None   = None
        self.worker_timings: dict[str, float]          = {}
        self.errors:       list[str]                   = []

    def add_flag(self, flag: ComplianceFlag) -> None:
        self.flags.append(flag)

    def add_error(self, worker: str, msg: str) -> None:
        self.errors.append(f"[{worker}] {msg}")
