"""
COMPONENT 4 — CSSF e-Identification Pipeline
============================================

Packages, structurally validates, and submits fund offering documents into the
CSSF e-ID system.

Stages
------
1. Mapping       — transform internal fund metadata into the CSSF structured
                   payload (JSON layout mirroring the e-file submission schema).
2. Pre-flight    — strict validation: file SHA-256 integrity, eIDAS-compliant
                   signature presence/shape, and mandatory-field completion.
3. Submission    — async mock client with bearer-token auth, status polling,
                   and CSSF-specific transmission response-code handling.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from enum import Enum
import hashlib
import random
import re
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/eid", tags=["cssf-e-identification"])


# ── Internal → CSSF mapping ──────────────────────────────────────────────────────

class FundType(str, Enum):
    UCITS = "UCITS"
    RAIF = "RAIF"
    SIF = "SIF"
    SICAR = "SICAR"
    PART_II = "PART_II_UCI"


class InternalFundMetadata(BaseModel):
    internal_id: str
    legal_name: str = Field(..., min_length=2)
    fund_type: FundType
    lei: str | None = Field(None, min_length=20, max_length=20)
    domicile_iso: str = Field("LU", min_length=2, max_length=2)
    management_company: str
    depositary: str
    document_title: str
    document_bytes_b64: str | None = None
    document_sha256: str = Field(..., min_length=64, max_length=64)
    eidas_signature: str | None = Field(None, description="Base64 PAdES/XAdES signature blob")
    submission_reason: str = "INITIAL_OFFERING"


class CSSFPayload(BaseModel):
    """Structured layout expected by the CSSF e-file gateway."""
    schemaVersion: str = "CSSF-EFILE-2.1"
    submissionType: str
    entity: dict
    document: dict
    signature: dict
    generatedAt: str


def map_to_cssf(meta: InternalFundMetadata) -> CSSFPayload:
    return CSSFPayload(
        submissionType=meta.submission_reason,
        entity={
            "legalName": meta.legal_name,
            "fundType": meta.fund_type.value,
            "lei": meta.lei,
            "domicile": meta.domicile_iso.upper(),
            "managementCompany": meta.management_company,
            "depositary": meta.depositary,
        },
        document={
            "title": meta.document_title,
            "sha256": meta.document_sha256.lower(),
            "hasPayload": meta.document_bytes_b64 is not None,
        },
        signature={
            "present": meta.eidas_signature is not None,
            "format": "PAdES" if meta.eidas_signature else None,
        },
        generatedAt=datetime.now(UTC).isoformat(),
    )


# ── Pre-flight validation ─────────────────────────────────────────────────────────

_SHA256_RE = re.compile(r"^[a-fA-F0-9]{64}$")
_LEI_RE = re.compile(r"^[A-Z0-9]{18}[0-9]{2}$")


class PreflightFinding(BaseModel):
    field: str
    ok: bool
    message: str


class PreflightResult(BaseModel):
    valid: bool
    findings: list[PreflightFinding]


def preflight_validate(meta: InternalFundMetadata) -> PreflightResult:
    findings: list[PreflightFinding] = []

    # 1) Mandatory fields
    for field_name, value in (
        ("legal_name", meta.legal_name),
        ("management_company", meta.management_company),
        ("depositary", meta.depositary),
        ("document_title", meta.document_title),
    ):
        findings.append(PreflightFinding(
            field=field_name, ok=bool(value and value.strip()),
            message="present" if value and value.strip() else "MANDATORY field empty",
        ))

    # 2) SHA-256 hash shape + (if payload supplied) integrity match
    hash_shape_ok = bool(_SHA256_RE.match(meta.document_sha256))
    findings.append(PreflightFinding(
        field="document_sha256", ok=hash_shape_ok,
        message="valid 64-hex digest" if hash_shape_ok else "not a 64-char hex SHA-256",
    ))
    if meta.document_bytes_b64 is not None and hash_shape_ok:
        import base64
        try:
            raw = base64.b64decode(meta.document_bytes_b64, validate=True)
            actual = hashlib.sha256(raw).hexdigest()
            integrity_ok = actual == meta.document_sha256.lower()
            findings.append(PreflightFinding(
                field="document_integrity", ok=integrity_ok,
                message="hash matches payload" if integrity_ok
                else f"HASH MISMATCH: declared {meta.document_sha256[:12]}…, actual {actual[:12]}…",
            ))
        except Exception:
            findings.append(PreflightFinding(
                field="document_integrity", ok=False, message="payload is not valid base64",
            ))

    # 3) eIDAS signature presence + shape
    sig_ok = meta.eidas_signature is not None and len(meta.eidas_signature) >= 64
    findings.append(PreflightFinding(
        field="eidas_signature", ok=sig_ok,
        message="eIDAS signature present" if sig_ok else "MISSING or too-short eIDAS signature",
    ))

    # 4) LEI shape (optional but validated when present)
    if meta.lei is not None:
        lei_ok = bool(_LEI_RE.match(meta.lei))
        findings.append(PreflightFinding(
            field="lei", ok=lei_ok,
            message="valid ISO 17442 LEI" if lei_ok else "malformed LEI (expect 20-char ISO 17442)",
        ))

    return PreflightResult(valid=all(f.ok for f in findings), findings=findings)


# ── Mock CSSF submission client ────────────────────────────────────────────────────

class SubmissionStatus(str, Enum):
    QUEUED = "QUEUED"
    TRANSMITTING = "TRANSMITTING"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    ERROR = "ERROR"


# CSSF-specific transmission response codes (representative).
_CSSF_RESPONSE_CODES = {
    "E000": "Accepted for processing",
    "E101": "Authentication token expired",
    "E204": "Schema validation failed",
    "E301": "Duplicate submission reference",
    "E500": "CSSF gateway temporary error",
}


class SubmissionRecord(BaseModel):
    submission_id: str
    status: SubmissionStatus
    cssf_code: str | None = None
    cssf_message: str | None = None
    created_at: str
    updated_at: str


_SUBMISSIONS: dict[str, SubmissionRecord] = {}
_VALID_TOKEN_PREFIX = "cssf_"


async def _transmit(submission_id: str, payload: CSSFPayload) -> None:
    """Background task: simulate async transmission + CSSF response."""
    rec = _SUBMISSIONS[submission_id]
    rec.status = SubmissionStatus.TRANSMITTING
    rec.updated_at = datetime.now(UTC).isoformat()
    await asyncio.sleep(0.2)  # network/gateway latency

    # Deterministic-ish outcome: reject if signature absent, else mostly accept.
    if not payload.signature.get("present"):
        code = "E204"
    else:
        code = random.choices(["E000", "E500", "E301"], weights=[0.9, 0.07, 0.03])[0]

    rec.cssf_code = code
    rec.cssf_message = _CSSF_RESPONSE_CODES[code]
    rec.status = SubmissionStatus.ACCEPTED if code == "E000" else (
        SubmissionStatus.ERROR if code == "E500" else SubmissionStatus.REJECTED
    )
    rec.updated_at = datetime.now(UTC).isoformat()


class SubmitRequest(BaseModel):
    metadata: InternalFundMetadata
    auth_token: str = Field(..., description="Bearer token for the CSSF gateway")


class SubmitResponse(BaseModel):
    submission_id: str
    status: SubmissionStatus
    preflight: PreflightResult
    payload: CSSFPayload


@router.post("/submit", response_model=SubmitResponse, summary="Validate + submit a fund document to CSSF e-ID")
async def submit(req: SubmitRequest) -> SubmitResponse:
    # Token auth
    if not req.auth_token.startswith(_VALID_TOKEN_PREFIX):
        raise HTTPException(status_code=401, detail="Invalid CSSF gateway token (expected 'cssf_' prefix).")

    preflight = preflight_validate(req.metadata)
    payload = map_to_cssf(req.metadata)

    if not preflight.valid:
        # Do not transmit an invalid package; surface the findings.
        sid = str(uuid.uuid4())
        now = datetime.now(UTC).isoformat()
        _SUBMISSIONS[sid] = SubmissionRecord(
            submission_id=sid, status=SubmissionStatus.REJECTED,
            cssf_code="E204", cssf_message=_CSSF_RESPONSE_CODES["E204"],
            created_at=now, updated_at=now,
        )
        return SubmitResponse(submission_id=sid, status=SubmissionStatus.REJECTED, preflight=preflight, payload=payload)

    sid = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()
    _SUBMISSIONS[sid] = SubmissionRecord(
        submission_id=sid, status=SubmissionStatus.QUEUED, created_at=now, updated_at=now,
    )
    # Fire-and-forget async transmission (status polled via /status).
    asyncio.create_task(_transmit(sid, payload))
    return SubmitResponse(submission_id=sid, status=SubmissionStatus.QUEUED, preflight=preflight, payload=payload)


@router.get("/status/{submission_id}", response_model=SubmissionRecord, summary="Poll CSSF submission status")
def submission_status(submission_id: str) -> SubmissionRecord:
    rec = _SUBMISSIONS.get(submission_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Unknown submission_id.")
    return rec


@router.post("/preflight", response_model=PreflightResult, summary="Dry-run validation only")
def preflight_only(meta: InternalFundMetadata) -> PreflightResult:
    return preflight_validate(meta)
