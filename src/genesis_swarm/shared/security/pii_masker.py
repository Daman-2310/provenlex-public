from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from typing import Any

# ---------------------------------------------------------------------------
# Compiled regex patterns — ordered most-specific first so overlapping
# patterns do not shadow each other (e.g. IBAN before generic numbers).
# ---------------------------------------------------------------------------

_PII_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (
        "IBAN",
        re.compile(
            r"\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}(?:[A-Z0-9]?){0,16}\b",
            re.IGNORECASE,
        ),
    ),
    (
        "BIC",
        re.compile(
            r"\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b",
            re.IGNORECASE,
        ),
    ),
    (
        "EU_VAT",
        re.compile(
            r"\b(?:AT|BE|BG|CY|CZ|DE|DK|EE|EL|ES|FI|FR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK)"
            r"[0-9A-Z]{8,12}\b",
            re.IGNORECASE,
        ),
    ),
    (
        "EMAIL",
        re.compile(
            r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b",
        ),
    ),
    (
        "IP",
        re.compile(r"\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b"),
    ),
    (
        "PHONE",
        re.compile(
            r"(?:\+\d{1,3}[\s\-]?)?(?:\(?\d{1,4}\)?[\s\-]?)(?:\d[\s\-]?){6,14}\d",
        ),
    ),
    (
        "NAME",
        re.compile(
            r"\b[A-Z][a-z]{1,30}\s[A-Z][a-z]{1,30}\b",
        ),
    ),
]


def _sha256_short(value: str, salt: str) -> str:
    """Return first 8 hex chars of SHA-256(salt + value)."""
    digest = hashlib.sha256((salt + value).encode("utf-8")).hexdigest()
    return digest[:8]


def mask_pii(
    data: str | dict,
    salt: str = "genesis-swarm-v1",
) -> str | dict:
    """GDPR-compliant PII masking for strings or dicts.

    Each detected PII token is replaced with ``[TYPE:sha256[:8]]``.
    The function is stateless — no index is maintained here.
    Use :class:`PIIMasker` when you need an index or counters.
    """
    if isinstance(data, dict):
        return {k: mask_pii(v, salt) for k, v in data.items()}
    if not isinstance(data, str):
        return data

    result = data
    for pii_type, pattern in _PII_PATTERNS:

        def _replace(match: re.Match, _type: str = pii_type) -> str:  # noqa: E731
            token = _sha256_short(match.group(0), salt)
            return f"[{_type}:{token}]"

        result = pattern.sub(_replace, result)
    return result


@dataclass
class PIIMasker:
    """Stateful PII masker that tracks applied masks and maintains an index.

    Attributes
    ----------
    salt:
        HMAC-style salt prepended before hashing.
    masks_applied:
        Running count of individual PII tokens replaced.
    unmask_index:
        Maps ``hash_token → original_value`` for authorized replay.
        Stored in memory only — never persisted.
    """

    salt: str = "genesis-swarm-v1"
    masks_applied: int = field(default=0, init=False)
    unmask_index: dict[str, str] = field(default_factory=dict, init=False)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def mask_message(self, msg: dict) -> dict:
        """Deep-traverse *msg* and mask all PII found in string values.

        Returns a new dict — the original is not mutated.
        """
        return self._traverse(msg)  # type: ignore[return-value]

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _mask_string(self, text: str) -> str:
        result = text
        for pii_type, pattern in _PII_PATTERNS:

            def _replace(
                match: re.Match,
                _type: str = pii_type,
            ) -> str:
                original = match.group(0)
                token = _sha256_short(original, self.salt)
                placeholder = f"[{_type}:{token}]"
                self.unmask_index[token] = original
                self.masks_applied += 1
                return placeholder

            result = pattern.sub(_replace, result)
        return result

    def _traverse(self, value: Any) -> Any:
        if isinstance(value, dict):
            return {k: self._traverse(v) for k, v in value.items()}
        if isinstance(value, list):
            return [self._traverse(item) for item in value]
        if isinstance(value, str):
            return self._mask_string(value)
        return value
