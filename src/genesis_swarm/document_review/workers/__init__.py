"""10-worker Luxembourg document compliance pipeline workers."""

from . import (
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

__all__ = [
    "w1_ingestion", "w2_anonymizer", "w3_translator",
    "w4_cssf_auditor", "w5_ucits_auditor", "w6_raif_sif_auditor",
    "w7_dora_auditor", "w8_risk_detector", "w9_verifier", "w10_reporter",
]
