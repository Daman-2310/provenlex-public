"""
Defensive hardened binary parser for Genesis Swarm wire frames.

Provides drop-in replacements for :func:`pack_transaction`,
:func:`unpack_transaction`, :func:`pack_envelope`, and
:func:`unpack_envelope` from :mod:`genesis_swarm.shared.binary_serializer`
with three additional defensive layers not present in the base module.

**Layer 1 — Multi-Stage Buffer Length Validation**
    Buffer length is verified at every structural boundary before any
    ``struct.unpack`` call or slice operation.  Each decode passes through
    four explicit guard points:

    1. Minimum frame size check (before the first ``struct.unpack``).
    2. Magic-bytes and version fast-path checks.
    3. Variable-field length extraction followed immediately by a slice
       bounds check (``offset + field_len ≤ len(raw_bytes)``).
    4. Exact total-frame size check — trailing bytes beyond the declared
       frame boundary are rejected as potential injection padding.

**Layer 2 — IEEE 754 Bitmask Sanitization**
    Floating-point balance fields are inspected at the raw bit level both
    on *pack* (caller input) and on *unpack* (received bytes from the wire)
    to prevent poisoning arithmetic pipelines with special values.

    The check extracts the 64-bit integer representation via
    ``struct.pack("!d", v)`` and tests the 11-bit exponent field
    (bits 62–52) for the all-ones pattern that signals NaN or Infinity:

    * Quiet NaN    — exponent = ``0x7FF``, mantissa ≠ 0
    * Signaling NaN — exponent = ``0x7FF``, mantissa ≠ 0 (high bit clear)
    * +∞ / −∞     — exponent = ``0x7FF``, mantissa = 0

    The bitmask ``0x7FF0_0000_0000_0000`` covers all these cases in a
    single comparison.

**Layer 3 — Structured BufferBoundsError**
    Every violation raises :class:`BufferBoundsError` (a subclass of
    :class:`~binary_serializer.BinaryParserError`) carrying:

    * ``reason``         — human-readable description of the violation.
    * ``offset``         — byte position in the raw buffer.
    * ``expected_bytes`` — what the parser expected to find at that offset.
    * ``actual_bytes``   — what was actually available.
    * ``context``        — ``dict[str, str]`` structured metadata for log
                           pipelines (field name, bit pattern, frame type).

Usage::

    from genesis_swarm.shared.safe_binary_parser import (
        safe_pack_transaction,
        safe_unpack_transaction,
        safe_pack_envelope,
        safe_unpack_envelope,
        BufferBoundsError,
    )
"""
from __future__ import annotations

import struct as _struct
from typing import Any, Final

from genesis_swarm.shared.binary_serializer import (
    BinaryParserError,
    EnvelopeFrame,
    TransactionFrame,
    TX_HEADER_SIZE,
    ENV_HEADER_SIZE,
    pack_transaction,
    pack_envelope,
    _CRC_FMT,
    _CRC_SIZE,
    _ENV_HEADER_FMT,
    _ENV_MAGIC,
    _ENV_PRE_CRC_SIZE,
    _ENV_VERSION,
    _PAYLOAD_MAX_LEN,
    _SENDER_MAX_LEN,
    _SIG_MAX_LEN,
    _TX_HEADER_FMT,
    _TX_MAGIC,
    _TX_VERSION,
    _crc32,
)

__all__ = [
    "BufferBoundsError",
    "safe_pack_transaction",
    "safe_unpack_transaction",
    "safe_pack_envelope",
    "safe_unpack_envelope",
]

# ── IEEE 754 double-precision bitmask constants ────────────────────────────

# Bits 62–52: exponent field.  All-ones (0x7FF) indicates NaN or Infinity.
_IEEE754_DBL_EXP_MASK: Final[int] = 0x7FF0_0000_0000_0000
# Bits 51–0: mantissa field.  Non-zero mantissa with all-ones exponent = NaN.
_IEEE754_DBL_MANT_MASK: Final[int] = 0x000F_FFFF_FFFF_FFFF
# Sign bit (bit 63) — used for descriptive error messages only.
_IEEE754_DBL_SIGN_MASK: Final[int] = 0x8000_0000_0000_0000


# ── Exception ────────────────────────────────────────────────────────────────

class BufferBoundsError(BinaryParserError):
    """Structured exception for buffer boundary and IEEE 754 violations.

    Inherits from :class:`~binary_serializer.BinaryParserError` so callers
    catching the base class still intercept all parser failures.

    Attributes:
        reason: Human-readable description of the violation.
        offset: Byte offset in the raw buffer where the violation occurred,
            or ``None`` if not applicable.
        expected_bytes: Number of bytes the parser expected to be available
            at *offset*, or ``None`` if not a size check.
        actual_bytes: Number of bytes actually available at *offset*, or
            ``None`` if not applicable.
        context: Structured key-value metadata for log pipeline sinks
            (e.g. ``{"field": "balance_delta", "bit_pattern": "0x7ff8…"}``).
    """

    def __init__(
        self,
        reason: str,
        *,
        offset: int | None = None,
        expected_bytes: int | None = None,
        actual_bytes: int | None = None,
        context: dict[str, Any] | None = None,
    ) -> None:
        self.reason = reason
        self.offset = offset
        self.expected_bytes = expected_bytes
        self.actual_bytes = actual_bytes
        self.context: dict[str, Any] = context or {}

        parts: list[str] = [f"BufferBoundsError: {reason}"]
        if offset is not None:
            parts.append(f"offset={offset}")
        if expected_bytes is not None and actual_bytes is not None:
            parts.append(f"expected={expected_bytes}B actual={actual_bytes}B")
        super(BinaryParserError, self).__init__(" | ".join(parts))


# ── IEEE 754 helpers ──────────────────────────────────────────────────────────

def _float_bits(value: float) -> int:
    """Extract the raw uint64 bit pattern of an IEEE 754 float64.

    Args:
        value: Any Python ``float`` value (including NaN and Infinity).

    Returns:
        Unsigned 64-bit integer whose bit pattern is the IEEE 754 double
        representation of *value*.
    """
    (bits,) = _struct.unpack("!Q", _struct.pack("!d", value))
    return bits


def _is_ieee754_special(bits: int) -> bool:
    """Return ``True`` if *bits* represents a NaN or an Infinity.

    Checks the 11-bit exponent field (bits 62–52) for the all-ones pattern
    ``0x7FF`` that IEEE 754 reserves exclusively for these special values.

    Args:
        bits: Raw uint64 bit pattern from :func:`_float_bits`.

    Returns:
        ``True`` for NaN (quiet or signaling) and for ±Infinity.
    """
    return (bits & _IEEE754_DBL_EXP_MASK) == _IEEE754_DBL_EXP_MASK


def _classify_special(bits: int) -> str:
    """Return a human-readable label for a known-special IEEE 754 bit pattern.

    Args:
        bits: Raw uint64 bit pattern confirmed to be special by
            :func:`_is_ieee754_special`.

    Returns:
        One of ``"quiet NaN"``, ``"signaling NaN"``, ``"+Infinity"``,
        or ``"-Infinity"``.
    """
    mantissa = bits & _IEEE754_DBL_MANT_MASK
    sign = (bits & _IEEE754_DBL_SIGN_MASK) != 0
    if mantissa == 0:
        return "-Infinity" if sign else "+Infinity"
    # High bit of mantissa distinguishes quiet (1) from signaling (0) NaN
    quiet = (mantissa >> 51) & 1
    return "quiet NaN" if quiet else "signaling NaN"


def _sanitize_balance_delta(
    value: float, *, field_name: str, byte_offset: int
) -> float:
    """Validate that *value* is a finite IEEE 754 double, not NaN or Infinity.

    The check is performed via explicit bitmask of the 64-bit representation
    rather than relying solely on ``math.isnan`` / ``math.isinf``, making
    the intention explicit in source and providing the raw bit pattern in
    the exception context for forensic logging.

    Args:
        value: Float value to validate (from caller input or ``struct.unpack``).
        field_name: Name of the field being checked (used in the error message
            and structured context dict).
        byte_offset: Byte offset of the field within the raw frame (used for
            precise error reporting).

    Returns:
        *value* unchanged if finite.

    Raises:
        BufferBoundsError: If *value* is NaN or Infinity of any kind.
    """
    bits = _float_bits(value)
    if _is_ieee754_special(bits):
        label = _classify_special(bits)
        raise BufferBoundsError(
            f"IEEE 754 special value ({label}) rejected in field {field_name!r} — "
            f"bit_pattern={bits:#018x}",
            offset=byte_offset,
            expected_bytes=8,
            actual_bytes=8,
            context={
                "field": field_name,
                "bit_pattern": f"{bits:#018x}",
                "ieee754_kind": label,
                "frame_type": "TX",
            },
        )
    return value


# ── Buffer length guard helpers ───────────────────────────────────────────────

def _check_min_length(
    buf: bytes,
    minimum: int,
    *,
    frame_type: str,
    stage: str,
) -> None:
    """Assert ``len(buf) >= minimum`` before any ``struct.unpack`` call.

    Args:
        buf: Raw byte buffer to validate.
        minimum: Minimum number of bytes required at this parse stage.
        frame_type: Short label for the frame type (e.g. ``"TX"``), used
            in the error message.
        stage: Descriptive stage name (e.g. ``"header"``), used in the
            error message.

    Raises:
        BufferBoundsError: If ``len(buf) < minimum``.
    """
    actual = len(buf)
    if actual < minimum:
        raise BufferBoundsError(
            f"{frame_type} {stage} underrun: need ≥ {minimum} bytes, got {actual}",
            offset=actual,
            expected_bytes=minimum,
            actual_bytes=actual,
            context={"frame_type": frame_type, "stage": stage},
        )


def _check_exact_length(
    buf: bytes,
    expected: int,
    *,
    frame_type: str,
) -> None:
    """Assert ``len(buf) == expected``, rejecting trailing injection padding.

    Args:
        buf: Raw byte buffer to validate.
        expected: Exact number of bytes the complete frame must occupy.
        frame_type: Short label for the frame type, used in the error message.

    Raises:
        BufferBoundsError: If ``len(buf) != expected``.
    """
    actual = len(buf)
    if actual != expected:
        kind = "overrun" if actual > expected else "truncated"
        raise BufferBoundsError(
            f"{frame_type} frame {kind}: expected exactly {expected} bytes, got {actual}",
            offset=min(actual, expected),
            expected_bytes=expected,
            actual_bytes=actual,
            context={"frame_type": frame_type, "violation": kind},
        )


def _check_field_slice(
    buf: bytes,
    offset: int,
    length: int,
    *,
    field_name: str,
    frame_type: str,
) -> None:
    """Assert that ``buf[offset : offset + length]`` lies within *buf*.

    Args:
        buf: Raw byte buffer.
        offset: Start offset of the slice.
        length: Number of bytes to read from *offset*.
        field_name: Name of the field being sliced (for error context).
        frame_type: Short frame type label (for error context).

    Raises:
        BufferBoundsError: If ``offset + length > len(buf)``.
    """
    end = offset + length
    available = len(buf)
    if end > available:
        raise BufferBoundsError(
            f"{frame_type} field {field_name!r} slice overrun: "
            f"bytes [{offset}:{end}] requested but buffer ends at {available}",
            offset=offset,
            expected_bytes=end,
            actual_bytes=available,
            context={"frame_type": frame_type, "field": field_name},
        )


def _safe_verify_crc(
    data: bytes,
    expected: int,
    *,
    offset: int,
    frame_type: str,
    crc_label: str,
) -> None:
    """Verify CRC-32 of *data* and raise :class:`BufferBoundsError` on mismatch.

    Args:
        data: Bytes whose CRC-32 is being verified.
        expected: Expected CRC-32 value read from the frame.
        offset: Byte offset of the CRC word within the frame (for error context).
        frame_type: Short frame type label.
        crc_label: Distinguishes ``"header_crc32"`` from ``"frame_crc32"``.

    Raises:
        BufferBoundsError: On CRC mismatch.
    """
    actual = _crc32(data)
    if actual != expected:
        raise BufferBoundsError(
            f"{frame_type} {crc_label} mismatch: "
            f"expected {expected:#010x}, computed {actual:#010x}",
            offset=offset,
            expected_bytes=4,
            actual_bytes=4,
            context={
                "frame_type": frame_type,
                "crc_field": crc_label,
                "expected": f"{expected:#010x}",
                "computed": f"{actual:#010x}",
            },
        )


# ── Transaction frame ─────────────────────────────────────────────────────────

def safe_pack_transaction(
    tenant_id: int,
    sequence_id: int,
    balance_delta: float,
    signature: bytes,
) -> bytes:
    """Sanitize inputs then serialise a financial transaction into a TX frame.

    Applies :ref:`Layer 2 <ieee754>` IEEE 754 bitmask sanitization on
    *balance_delta* before delegating to
    :func:`~binary_serializer.pack_transaction`.

    Args:
        tenant_id: Unsigned 64-bit tenant identifier.
        sequence_id: Monotonically increasing per-tenant sequence counter.
        balance_delta: Signed balance delta.  NaN and ±Infinity are
            rejected with :class:`BufferBoundsError`.
        signature: Raw Ed25519 signature bytes (length 1–64).

    Returns:
        Packed binary TX frame of ``TX_HEADER_SIZE + len(signature)`` bytes.

    Raises:
        BufferBoundsError: If *balance_delta* is NaN or Infinity.
        BinaryParserError: If any other argument fails boundary validation
            (propagated from :func:`~binary_serializer.pack_transaction`).
    """
    _sanitize_balance_delta(balance_delta, field_name="balance_delta", byte_offset=24)
    return pack_transaction(tenant_id, sequence_id, balance_delta, signature)


def safe_unpack_transaction(raw_bytes: bytes) -> TransactionFrame:
    """Multi-stage hardened decoder for binary TX frames.

    Validation stages (in order):

    1. Minimum header size check — rejects any buffer shorter than
       ``TX_HEADER_SIZE`` (36 bytes) before touching ``struct.unpack``.
    2. Magic-bytes check — rejects any frame without the ``b"GSTX"`` sentinel.
    3. Version check — rejects unsupported wire protocol versions.
    4. ``sig_len`` range check — rejects values outside ``[1, 64]``.
    5. Slice bounds check — confirms ``TX_HEADER_SIZE + sig_len ≤ len(raw_bytes)``
       before accessing the signature bytes.
    6. Exact total-length check — rejects frames with trailing bytes
       (buffer-overrun injection padding).
    7. Header CRC-32 verification — detects bit-flip corruption of the
       fixed header fields.
    8. IEEE 754 bitmask sanitization — rejects NaN and ±Infinity in
       ``balance_delta`` even when the CRC passes (bit-exact NaN injection).

    Args:
        raw_bytes: Raw bytes received from the wire.

    Returns:
        Fully validated :class:`~binary_serializer.TransactionFrame`.

    Raises:
        BufferBoundsError: On any length, boundary, CRC, or IEEE 754
            violation detected by this module's defensive layers.
        BinaryParserError: On struct unpack failures propagated from the
            base parser.
    """
    # Stage 1 — pre-unpack minimum length
    _check_min_length(raw_bytes, TX_HEADER_SIZE, frame_type="TX", stage="header")

    # Stage 2 — fast-path magic and version check before full unpack
    if raw_bytes[:4] != _TX_MAGIC:
        raise BufferBoundsError(
            f"TX magic mismatch: expected {_TX_MAGIC!r}, got {raw_bytes[:4]!r}",
            offset=0,
            expected_bytes=4,
            actual_bytes=4,
            context={"frame_type": "TX", "field": "magic"},
        )
    version_byte = raw_bytes[4]
    if version_byte != _TX_VERSION:
        raise BufferBoundsError(
            f"TX version unsupported: {version_byte:#04x} (want {_TX_VERSION:#04x})",
            offset=4,
            expected_bytes=1,
            actual_bytes=1,
            context={"frame_type": "TX", "field": "version"},
        )

    # Full header unpack (safe — minimum length already verified)
    try:
        magic, version, _reserved, sig_len, tenant_id, sequence_id, balance_delta, header_crc = \
            _struct.unpack_from(_TX_HEADER_FMT, raw_bytes)
    except _struct.error as exc:
        raise BufferBoundsError(
            f"TX header struct unpack failed: {exc}",
            offset=0,
            expected_bytes=TX_HEADER_SIZE,
            actual_bytes=len(raw_bytes),
            context={"frame_type": "TX"},
        ) from exc

    # Stage 3 — sig_len range check before any slice
    if sig_len == 0 or sig_len > _SIG_MAX_LEN:
        raise BufferBoundsError(
            f"TX sig_len {sig_len} outside valid range [1, {_SIG_MAX_LEN}]",
            offset=6,
            expected_bytes=_SIG_MAX_LEN,
            actual_bytes=sig_len,
            context={"frame_type": "TX", "field": "sig_len"},
        )

    # Stage 4 — slice bounds check (signature region)
    _check_field_slice(
        raw_bytes, TX_HEADER_SIZE, sig_len,
        field_name="signature", frame_type="TX",
    )

    # Stage 5 — exact total length (no trailing bytes)
    _check_exact_length(raw_bytes, TX_HEADER_SIZE + sig_len, frame_type="TX")

    # Stage 6 — header CRC (covers bytes [0:32], excluding the CRC word itself)
    _safe_verify_crc(
        raw_bytes[:32], header_crc,
        offset=32, frame_type="TX", crc_label="header_crc32",
    )

    # Stage 7 — IEEE 754 bitmask sanitization of balance_delta
    _sanitize_balance_delta(balance_delta, field_name="balance_delta", byte_offset=24)

    return TransactionFrame(
        tenant_id=tenant_id,
        sequence_id=sequence_id,
        balance_delta=balance_delta,
        signature=bytes(raw_bytes[TX_HEADER_SIZE: TX_HEADER_SIZE + sig_len]),
    )


# ── Envelope frame ────────────────────────────────────────────────────────────

def safe_pack_envelope(
    phase: int,
    view: int,
    seq: int,
    timestamp_ns: int,
    digest: bytes,
    merkle_root: bytes,
    ed25519_pubkey: bytes,
    ed25519_sig: bytes,
    sender_id: str,
    payload: bytes,
) -> bytes:
    """Validate inputs then serialise a PBFT ConsensusEnvelope into a binary ENV frame.

    Performs no additional validation beyond
    :func:`~binary_serializer.pack_envelope` for non-float fields; the ENV
    frame carries no floating-point values, so IEEE 754 sanitization is not
    applicable here.  All boundary checks are delegated to the base packer.

    Args:
        phase: :class:`~pbft_node.MessagePhase` integer value (0–8).
        view: PBFT view number (uint32).
        seq: PBFT sequence number (uint64).
        timestamp_ns: Sender wall-clock timestamp in nanoseconds (uint64).
        digest: Exactly 64 ASCII-hex bytes — SHA-256 of the request payload.
        merkle_root: Exactly 64 ASCII-hex bytes — current Merkle chain root.
        ed25519_pubkey: Raw 32-byte Ed25519 public key.
        ed25519_sig: Raw 64-byte Ed25519 signature.
        sender_id: Node identifier string (max 255 bytes UTF-8 encoded).
        payload: Phase-specific opaque bytes (max 65 536 bytes).

    Returns:
        Binary ENV frame.

    Raises:
        BinaryParserError: If any argument fails boundary validation
            (propagated from :func:`~binary_serializer.pack_envelope`).
    """
    return pack_envelope(
        phase, view, seq, timestamp_ns,
        digest, merkle_root, ed25519_pubkey, ed25519_sig,
        sender_id, payload,
    )


def safe_unpack_envelope(raw_bytes: bytes) -> EnvelopeFrame:
    """Multi-stage hardened decoder for binary ENV frames.

    Validation stages (in order):

    1. Minimum header size check — rejects any buffer shorter than
       ``ENV_HEADER_SIZE`` (262 bytes) before ``struct.unpack``.
    2. Magic-bytes check — ``b"GENV"`` sentinel.
    3. Version check — rejects unsupported wire versions.
    4. Phase range check — rejects values outside ``[0, 8]``.
    5. ``sender_len`` range check — ``[1, 255]``.
    6. ``payload_len`` upper-bound check — ``≤ 65 536``.
    7. Header CRC-32 verification — covers bytes ``[0:258]``.
    8. Slice bounds check — ``ENV_HEADER_SIZE + sender_len + payload_len``
       against ``len(raw_bytes)`` before any variable-field access.
    9. Exact total-length check — ``ENV_HEADER_SIZE + sender_len +
       payload_len + 4`` must equal ``len(raw_bytes)`` exactly.
    10. Frame CRC-32 verification — covers everything except the trailing
        4-byte CRC word.
    11. UTF-8 decode of ``sender_id`` with explicit ``UnicodeDecodeError``
        conversion.

    Args:
        raw_bytes: Raw bytes received from the wire.

    Returns:
        Fully validated :class:`~binary_serializer.EnvelopeFrame`.

    Raises:
        BufferBoundsError: On any length, boundary, magic, version, phase,
            CRC, or encoding violation.
        BinaryParserError: On ``struct`` unpack failures.
    """
    # Stage 1 — pre-unpack minimum length
    _check_min_length(raw_bytes, ENV_HEADER_SIZE, frame_type="ENV", stage="header")

    # Stage 2 — fast-path magic check
    if raw_bytes[:4] != _ENV_MAGIC:
        raise BufferBoundsError(
            f"ENV magic mismatch: expected {_ENV_MAGIC!r}, got {raw_bytes[:4]!r}",
            offset=0,
            expected_bytes=4,
            actual_bytes=4,
            context={"frame_type": "ENV", "field": "magic"},
        )
    version_byte = raw_bytes[4]
    if version_byte != _ENV_VERSION:
        raise BufferBoundsError(
            f"ENV version unsupported: {version_byte:#04x} (want {_ENV_VERSION:#04x})",
            offset=4,
            expected_bytes=1,
            actual_bytes=1,
            context={"frame_type": "ENV", "field": "version"},
        )

    # Full header unpack (safe — minimum length already verified)
    try:
        (
            magic, version, phase, _reserved,
            view, seq, timestamp_ns,
            digest, merkle_root, ed25519_pubkey, ed25519_sig,
            sender_len, payload_len, header_crc,
        ) = _struct.unpack_from(_ENV_HEADER_FMT, raw_bytes)
    except _struct.error as exc:
        raise BufferBoundsError(
            f"ENV header struct unpack failed: {exc}",
            offset=0,
            expected_bytes=ENV_HEADER_SIZE,
            actual_bytes=len(raw_bytes),
            context={"frame_type": "ENV"},
        ) from exc

    # Stage 3 — phase range
    if not (0 <= phase <= 8):
        raise BufferBoundsError(
            f"ENV phase {phase} outside valid range [0, 8]",
            offset=5,
            expected_bytes=1,
            actual_bytes=1,
            context={"frame_type": "ENV", "field": "phase", "value": str(phase)},
        )

    # Stage 4 — sender_len range
    if sender_len == 0 or sender_len > _SENDER_MAX_LEN:
        raise BufferBoundsError(
            f"ENV sender_len {sender_len} outside valid range [1, {_SENDER_MAX_LEN}]",
            offset=252,
            expected_bytes=_SENDER_MAX_LEN,
            actual_bytes=sender_len,
            context={"frame_type": "ENV", "field": "sender_len"},
        )

    # Stage 5 — payload_len upper bound
    if payload_len > _PAYLOAD_MAX_LEN:
        raise BufferBoundsError(
            f"ENV payload_len {payload_len} exceeds maximum {_PAYLOAD_MAX_LEN}",
            offset=254,
            expected_bytes=_PAYLOAD_MAX_LEN,
            actual_bytes=payload_len,
            context={"frame_type": "ENV", "field": "payload_len"},
        )

    # Stage 6 — header CRC (covers bytes [0:258])
    _safe_verify_crc(
        raw_bytes[:_ENV_PRE_CRC_SIZE], header_crc,
        offset=_ENV_PRE_CRC_SIZE, frame_type="ENV", crc_label="header_crc32",
    )

    # Stage 7 — slice bounds for variable fields
    _check_field_slice(
        raw_bytes, ENV_HEADER_SIZE, sender_len,
        field_name="sender_id", frame_type="ENV",
    )
    _check_field_slice(
        raw_bytes, ENV_HEADER_SIZE + sender_len, payload_len,
        field_name="payload", frame_type="ENV",
    )
    _check_field_slice(
        raw_bytes, ENV_HEADER_SIZE + sender_len + payload_len, _CRC_SIZE,
        field_name="frame_crc32", frame_type="ENV",
    )

    # Stage 8 — exact total length
    expected_total = ENV_HEADER_SIZE + sender_len + payload_len + _CRC_SIZE
    _check_exact_length(raw_bytes, expected_total, frame_type="ENV")

    # Stage 9 — frame CRC
    frame_crc_offset = ENV_HEADER_SIZE + sender_len + payload_len
    (frame_crc,) = _struct.unpack_from(_CRC_FMT, raw_bytes, frame_crc_offset)
    _safe_verify_crc(
        raw_bytes[:frame_crc_offset], frame_crc,
        offset=frame_crc_offset, frame_type="ENV", crc_label="frame_crc32",
    )

    # Stage 10 — extract and decode variable fields
    cursor = ENV_HEADER_SIZE
    sender_bytes = raw_bytes[cursor: cursor + sender_len]
    cursor += sender_len
    payload = bytes(raw_bytes[cursor: cursor + payload_len])

    try:
        sender_id = sender_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise BufferBoundsError(
            f"ENV sender_id is not valid UTF-8: {exc}",
            offset=ENV_HEADER_SIZE,
            expected_bytes=sender_len,
            actual_bytes=sender_len,
            context={"frame_type": "ENV", "field": "sender_id"},
        ) from exc

    return EnvelopeFrame(
        phase=phase,
        view=view,
        seq=seq,
        timestamp_ns=timestamp_ns,
        digest=bytes(digest),
        merkle_root=bytes(merkle_root),
        ed25519_pubkey=bytes(ed25519_pubkey),
        ed25519_sig=bytes(ed25519_sig),
        sender_id=sender_id,
        payload=payload,
    )
