"""
Zero-copy binary serialization engine for Genesis Swarm inter-node exchange.

Replaces JSON/hex-text wire format with compact fixed-header binary frames
validated by CRC-32 integrity checks at both header and whole-frame level.
All multi-byte integers use big-endian (network byte order, ``!``).

Transaction (TX) frame layout — fixed 36-byte header + variable signature
──────────────────────────────────────────────────────────────────────────
 Offset  Size  Type     Field
 ──────  ────  ───────  ──────────────────────────────────────────────────
  0       4    bytes    magic          b'GSTX'
  4       1    uint8    version        0x01
  5       1    uint8    reserved       0x00
  6       2    uint16   sig_len        ≤ 64 (Ed25519 signature length)
  8       8    uint64   tenant_id
 16       8    uint64   sequence_id
 24       8    float64  balance_delta  IEEE 754 double
 32       4    uint32   header_crc32   CRC-32 of bytes [0:32]
 36   sig_len  bytes    signature      raw Ed25519 bytes
 ──────  ────  ───────  ──────────────────────────────────────────────────
 Total: 36 + sig_len  (max 100 bytes)

Envelope (ENV) frame layout — fixed 262-byte header + variable body + CRC-32
─────────────────────────────────────────────────────────────────────────────
 Offset  Size  Type     Field
 ──────  ────  ───────  ──────────────────────────────────────────────────
  0       4    bytes    magic           b'GENV'
  4       1    uint8    version         0x02
  5       1    uint8    phase           MessagePhase value (0–8)
  6       2    uint16   reserved        0x0000
  8       4    uint32   view            PBFT view number
 12       8    uint64   seq             PBFT sequence number
 20       8    uint64   timestamp_ns    wall-clock nanoseconds
 28      64    bytes    digest          ASCII-hex SHA-256 (fixed 64 bytes)
 92      64    bytes    merkle_root     ASCII-hex SHA-256 (fixed 64 bytes)
156      32    bytes    ed25519_pubkey  raw 32-byte Ed25519 public key
188      64    bytes    ed25519_sig     raw 64-byte Ed25519 signature
252       2    uint16   sender_len      ≤ 255 (UTF-8 encoded byte length)
254       4    uint32   payload_len     ≤ 65 536 bytes
258       4    uint32   header_crc32    CRC-32 of bytes [0:258]
  --  variable  --
262  sender_len  bytes  sender_id       UTF-8 encoded node identifier
  +  payload_len bytes  payload         phase-specific opaque bytes
  +     4        uint32 frame_crc32     CRC-32 of entire frame except this field
 ──────  ────  ───────  ──────────────────────────────────────────────────
"""
from __future__ import annotations

import binascii
import struct
from dataclasses import dataclass
from typing import Final

__all__ = [
    "BinaryParserError",
    "TransactionFrame",
    "EnvelopeFrame",
    "pack_transaction",
    "unpack_transaction",
    "pack_envelope",
    "unpack_envelope",
    "TX_HEADER_SIZE",
    "ENV_HEADER_SIZE",
]

# ── Frame sentinels ──────────────────────────────────────────────────────────

_TX_MAGIC: Final[bytes] = b"GSTX"
_ENV_MAGIC: Final[bytes] = b"GENV"
_TX_VERSION: Final[int] = 0x01
_ENV_VERSION: Final[int] = 0x02

_SIG_MAX_LEN: Final[int] = 64        # Ed25519 signature = exactly 64 bytes
_SENDER_MAX_LEN: Final[int] = 255     # max UTF-8 byte length for a node ID
_PAYLOAD_MAX_LEN: Final[int] = 65_536  # 64 KiB hard cap on phase payload

# ── Struct format strings (``!`` = network / big-endian, zero padding) ───────

# TX: magic(4s) version(B) reserved(B) sig_len(H) tenant_id(Q)
#     sequence_id(Q) balance_delta(d) header_crc32(I)
_TX_HEADER_FMT: Final[str] = "!4sBBHQQdI"
TX_HEADER_SIZE: Final[int] = struct.calcsize(_TX_HEADER_FMT)   # 36 bytes

# ENV: magic(4s) version(B) phase(B) reserved(H) view(I) seq(Q) ts_ns(Q)
#      digest(64s) merkle_root(64s) pubkey(32s) sig(64s)
#      sender_len(H) payload_len(I) header_crc32(I)
_ENV_HEADER_FMT: Final[str] = "!4sBBHIQQ64s64s32s64sHII"
ENV_HEADER_SIZE: Final[int] = struct.calcsize(_ENV_HEADER_FMT)  # 262 bytes

# Pre-CRC header (omits the trailing CRC word); used to compute header_crc32
_ENV_PRE_CRC_FMT: Final[str] = "!4sBBHIQQ64s64s32s64sHI"
_ENV_PRE_CRC_SIZE: Final[int] = struct.calcsize(_ENV_PRE_CRC_FMT)  # 258 bytes

_CRC_FMT: Final[str] = "!I"
_CRC_SIZE: Final[int] = struct.calcsize(_CRC_FMT)  # 4 bytes


# ── Exception ────────────────────────────────────────────────────────────────

class BinaryParserError(Exception):
    """Raised on any malformed, truncated, or integrity-failed binary frame.

    Args:
        reason: Human-readable description of the violation.
        offset: Byte offset into the raw buffer where the violation was detected,
            or ``None`` if not applicable.
    """

    def __init__(self, reason: str, *, offset: int | None = None) -> None:
        self.reason = reason
        self.offset = offset
        loc = f" (at offset {offset})" if offset is not None else ""
        super().__init__(f"BinaryParserError: {reason}{loc}")


# ── Data containers ───────────────────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class TransactionFrame:
    """Decoded, validated content of a binary TX frame.

    Attributes:
        tenant_id: Unsigned 64-bit tenant identifier.
        sequence_id: Monotonically increasing per-tenant sequence counter.
        balance_delta: Signed balance delta (IEEE 754 float64).
        signature: Raw Ed25519 signature bytes (1–64 bytes).
    """

    tenant_id: int
    sequence_id: int
    balance_delta: float
    signature: bytes


@dataclass(frozen=True, slots=True)
class EnvelopeFrame:
    """Decoded, validated content of a binary ENV frame.

    Attributes:
        phase: :class:`~genesis_swarm.consensus.pbft_node.MessagePhase` int value.
        view: PBFT view number.
        seq: PBFT sequence number.
        timestamp_ns: Sender wall-clock in nanoseconds.
        digest: 64-byte ASCII-hex SHA-256 of the request payload.
        merkle_root: 64-byte ASCII-hex Merkle chain root.
        ed25519_pubkey: Raw 32-byte Ed25519 public key.
        ed25519_sig: Raw 64-byte Ed25519 signature.
        sender_id: UTF-8 decoded node identifier string.
        payload: Phase-specific opaque payload bytes.
    """

    phase: int
    view: int
    seq: int
    timestamp_ns: int
    digest: bytes        # 64 ASCII-hex bytes
    merkle_root: bytes   # 64 ASCII-hex bytes
    ed25519_pubkey: bytes
    ed25519_sig: bytes
    sender_id: str
    payload: bytes


# ── CRC-32 helpers ────────────────────────────────────────────────────────────

def _crc32(data: bytes | memoryview) -> int:
    """Return the unsigned CRC-32 of *data*."""
    return binascii.crc32(data) & 0xFFFF_FFFF


def _verify_crc(data: bytes | memoryview, expected: int, *, offset: int) -> None:
    """Raise :class:`BinaryParserError` if CRC-32 of *data* differs from *expected*.

    Args:
        data: Bytes to checksum.
        expected: Expected CRC-32 word read from the frame.
        offset: Frame byte offset of the CRC word (used in the error message).

    Raises:
        BinaryParserError: On CRC mismatch.
    """
    actual = _crc32(data)
    if actual != expected:
        raise BinaryParserError(
            f"CRC-32 mismatch: expected {expected:#010x}, got {actual:#010x}",
            offset=offset,
        )


# ── Transaction serialization ─────────────────────────────────────────────────

def pack_transaction(
    tenant_id: int,
    sequence_id: int,
    balance_delta: float,
    signature: bytes,
) -> bytes:
    """Serialise a financial transaction into a compact binary TX frame.

    The header CRC-32 covers bytes [0:32] (fixed fields preceding the CRC
    word), protecting fixed fields against bit-flip corruption.  Signature
    integrity is guaranteed separately by Ed25519.

    Args:
        tenant_id: Unsigned 64-bit tenant identifier.
        sequence_id: Monotonically increasing per-tenant sequence counter.
        balance_delta: Signed delta applied to the tenant balance.  Stored
            as IEEE 754 float64; callers should pre-validate precision.
        signature: Raw Ed25519 signature bytes.  Length must be ≤ 64.

    Returns:
        Packed binary frame: ``TX_HEADER_SIZE + len(signature)`` bytes.

    Raises:
        BinaryParserError: If any argument fails boundary validation.
    """
    if not isinstance(tenant_id, int) or not (0 <= tenant_id <= 0xFFFF_FFFF_FFFF_FFFF):
        raise BinaryParserError(
            f"tenant_id out of uint64 range: {tenant_id!r}"
        )
    if not isinstance(sequence_id, int) or not (0 <= sequence_id <= 0xFFFF_FFFF_FFFF_FFFF):
        raise BinaryParserError(
            f"sequence_id out of uint64 range: {sequence_id!r}"
        )
    if not isinstance(balance_delta, (int, float)):
        raise BinaryParserError(
            f"balance_delta must be numeric, got {type(balance_delta).__name__!r}"
        )
    sig_len = len(signature)
    if sig_len == 0 or sig_len > _SIG_MAX_LEN:
        raise BinaryParserError(
            f"signature length {sig_len} is outside valid range [1, {_SIG_MAX_LEN}]"
        )

    # Pack fixed fields (without CRC) then compute and append CRC
    pre_crc: bytes = struct.pack(
        "!4sBBHQQd",
        _TX_MAGIC,
        _TX_VERSION,
        0x00,           # reserved
        sig_len,
        tenant_id,
        sequence_id,
        float(balance_delta),
    )
    header: bytes = pre_crc + struct.pack(_CRC_FMT, _crc32(pre_crc))
    return header + signature


def unpack_transaction(raw_bytes: bytes) -> TransactionFrame:
    """Deserialise a binary TX frame into a :class:`TransactionFrame`.

    Args:
        raw_bytes: Raw bytes received from the wire.

    Returns:
        Fully validated :class:`TransactionFrame`.

    Raises:
        BinaryParserError: On truncation, magic mismatch, unsupported version,
            CRC failure, or any boundary violation.
    """
    if len(raw_bytes) < TX_HEADER_SIZE:
        raise BinaryParserError(
            f"TX frame too short: {len(raw_bytes)} < {TX_HEADER_SIZE} bytes",
            offset=0,
        )

    try:
        magic, version, _reserved, sig_len, tenant_id, sequence_id, balance_delta, crc = \
            struct.unpack_from(_TX_HEADER_FMT, raw_bytes)
    except struct.error as exc:
        raise BinaryParserError(f"TX header unpack failed: {exc}", offset=0) from exc

    if magic != _TX_MAGIC:
        raise BinaryParserError(
            f"TX magic mismatch: expected {_TX_MAGIC!r}, got {magic!r}",
            offset=0,
        )
    if version != _TX_VERSION:
        raise BinaryParserError(
            f"TX version unsupported: {version:#04x} (want {_TX_VERSION:#04x})",
            offset=4,
        )
    if sig_len == 0 or sig_len > _SIG_MAX_LEN:
        raise BinaryParserError(
            f"sig_len {sig_len} outside valid range [1, {_SIG_MAX_LEN}]",
            offset=6,
        )

    expected_total = TX_HEADER_SIZE + sig_len
    if len(raw_bytes) < expected_total:
        raise BinaryParserError(
            f"TX frame truncated: need {expected_total} bytes, have {len(raw_bytes)}",
            offset=TX_HEADER_SIZE,
        )

    # CRC covers bytes [0:32] — header minus the 4-byte CRC word
    _verify_crc(raw_bytes[:32], crc, offset=32)

    signature = bytes(raw_bytes[TX_HEADER_SIZE: TX_HEADER_SIZE + sig_len])
    return TransactionFrame(
        tenant_id=tenant_id,
        sequence_id=sequence_id,
        balance_delta=balance_delta,
        signature=signature,
    )


# ── Envelope serialization ────────────────────────────────────────────────────

def pack_envelope(
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
    """Serialise a PBFT ConsensusEnvelope into a compact binary ENV frame.

    Two CRC-32 integrity fields guard the frame:

    * ``header_crc32`` — covers the 258-byte fixed header (bytes [0:258]),
      allowing fast header validation without reading the variable body.
    * ``frame_crc32`` — covers the entire frame preceding the trailing CRC
      word, detecting any corruption in the variable-length body.

    Args:
        phase: :class:`~genesis_swarm.consensus.pbft_node.MessagePhase` integer
            value, 0–8.
        view: PBFT view number (uint32, 0 – 2³²-1).
        seq: PBFT sequence number (uint64).
        timestamp_ns: Sender wall-clock timestamp in nanoseconds (uint64).
        digest: Exactly 64 ASCII-hex bytes — SHA-256 of the request payload.
        merkle_root: Exactly 64 ASCII-hex bytes — current Merkle chain root.
        ed25519_pubkey: Raw 32-byte Ed25519 public key of the sender.
        ed25519_sig: Raw 64-byte Ed25519 signature over canonical signing bytes.
        sender_id: Node identifier string (max 255 bytes when UTF-8 encoded).
        payload: Phase-specific opaque bytes (max 65 536 bytes).

    Returns:
        Binary ENV frame of ``ENV_HEADER_SIZE + len(sender_id_utf8) +
        len(payload) + 4`` bytes.

    Raises:
        BinaryParserError: If any argument fails boundary or type validation.
    """
    if not (0 <= phase <= 0xFF):
        raise BinaryParserError(f"phase {phase!r} out of uint8 range [0, 255]")
    if not isinstance(view, int) or not (0 <= view <= 0xFFFF_FFFF):
        raise BinaryParserError(f"view {view!r} out of uint32 range")
    if not isinstance(seq, int) or not (0 <= seq <= 0xFFFF_FFFF_FFFF_FFFF):
        raise BinaryParserError(f"seq {seq!r} out of uint64 range")
    if not isinstance(timestamp_ns, int) or not (0 <= timestamp_ns <= 0xFFFF_FFFF_FFFF_FFFF):
        raise BinaryParserError(f"timestamp_ns {timestamp_ns!r} out of uint64 range")
    if len(digest) != 64:
        raise BinaryParserError(
            f"digest must be exactly 64 bytes, got {len(digest)}", offset=28
        )
    if len(merkle_root) != 64:
        raise BinaryParserError(
            f"merkle_root must be exactly 64 bytes, got {len(merkle_root)}", offset=92
        )
    if len(ed25519_pubkey) != 32:
        raise BinaryParserError(
            f"ed25519_pubkey must be exactly 32 bytes, got {len(ed25519_pubkey)}",
            offset=156,
        )
    if len(ed25519_sig) != 64:
        raise BinaryParserError(
            f"ed25519_sig must be exactly 64 bytes, got {len(ed25519_sig)}", offset=188
        )

    sender_bytes: bytes = sender_id.encode("utf-8")
    sender_len = len(sender_bytes)
    if sender_len == 0 or sender_len > _SENDER_MAX_LEN:
        raise BinaryParserError(
            f"sender_id UTF-8 length {sender_len} outside valid range [1, {_SENDER_MAX_LEN}]",
            offset=252,
        )
    payload_len = len(payload)
    if payload_len > _PAYLOAD_MAX_LEN:
        raise BinaryParserError(
            f"payload length {payload_len} exceeds maximum {_PAYLOAD_MAX_LEN}",
            offset=254,
        )

    # Build fixed header (without header_crc32), compute and append CRC
    pre_header_crc: bytes = struct.pack(
        _ENV_PRE_CRC_FMT,
        _ENV_MAGIC,
        _ENV_VERSION,
        phase,
        0x0000,        # reserved
        view,
        seq,
        timestamp_ns,
        digest,
        merkle_root,
        ed25519_pubkey,
        ed25519_sig,
        sender_len,
        payload_len,
    )
    header: bytes = pre_header_crc + struct.pack(_CRC_FMT, _crc32(pre_header_crc))

    # Append variable body, compute and append frame CRC
    frame_body: bytes = sender_bytes + payload
    frame_without_crc: bytes = header + frame_body
    return frame_without_crc + struct.pack(_CRC_FMT, _crc32(frame_without_crc))


def unpack_envelope(raw_bytes: bytes) -> EnvelopeFrame:
    """Deserialise a binary ENV frame into an :class:`EnvelopeFrame`.

    Both CRC fields (header and frame) are verified before any variable-length
    data is accessed, so a truncated or corrupted frame is always detected
    before Python objects are allocated.

    Args:
        raw_bytes: Raw bytes received from the wire.

    Returns:
        Fully validated :class:`EnvelopeFrame`.

    Raises:
        BinaryParserError: On truncation, magic mismatch, unsupported version,
            header CRC failure, frame CRC failure, field boundary violation, or
            non-UTF-8 sender_id.
    """
    if len(raw_bytes) < ENV_HEADER_SIZE:
        raise BinaryParserError(
            f"ENV frame too short: {len(raw_bytes)} < {ENV_HEADER_SIZE} bytes",
            offset=0,
        )

    try:
        (
            magic, version, phase, _reserved,
            view, seq, timestamp_ns,
            digest, merkle_root, ed25519_pubkey, ed25519_sig,
            sender_len, payload_len, header_crc,
        ) = struct.unpack_from(_ENV_HEADER_FMT, raw_bytes)
    except struct.error as exc:
        raise BinaryParserError(f"ENV header unpack failed: {exc}", offset=0) from exc

    if magic != _ENV_MAGIC:
        raise BinaryParserError(
            f"ENV magic mismatch: expected {_ENV_MAGIC!r}, got {magic!r}",
            offset=0,
        )
    if version != _ENV_VERSION:
        raise BinaryParserError(
            f"ENV version unsupported: {version:#04x} (want {_ENV_VERSION:#04x})",
            offset=4,
        )
    if sender_len == 0 or sender_len > _SENDER_MAX_LEN:
        raise BinaryParserError(
            f"sender_len {sender_len} outside valid range [1, {_SENDER_MAX_LEN}]",
            offset=252,
        )
    if payload_len > _PAYLOAD_MAX_LEN:
        raise BinaryParserError(
            f"payload_len {payload_len} exceeds maximum {_PAYLOAD_MAX_LEN}",
            offset=254,
        )

    # Verify header CRC (covers bytes [0:258])
    _verify_crc(raw_bytes[:_ENV_PRE_CRC_SIZE], header_crc, offset=_ENV_PRE_CRC_SIZE)

    # Verify total frame length
    expected_total = ENV_HEADER_SIZE + sender_len + payload_len + _CRC_SIZE
    if len(raw_bytes) < expected_total:
        raise BinaryParserError(
            f"ENV frame truncated: need {expected_total}, have {len(raw_bytes)}",
            offset=ENV_HEADER_SIZE,
        )

    # Verify frame CRC (covers everything except the trailing 4-byte CRC word)
    frame_crc_offset = ENV_HEADER_SIZE + sender_len + payload_len
    (frame_crc,) = struct.unpack_from(_CRC_FMT, raw_bytes, frame_crc_offset)
    _verify_crc(raw_bytes[:frame_crc_offset], frame_crc, offset=frame_crc_offset)

    # Extract variable-length fields
    cursor = ENV_HEADER_SIZE
    sender_bytes = raw_bytes[cursor: cursor + sender_len]
    cursor += sender_len
    payload = bytes(raw_bytes[cursor: cursor + payload_len])

    try:
        sender_id = sender_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise BinaryParserError(
            f"sender_id is not valid UTF-8: {exc}",
            offset=ENV_HEADER_SIZE,
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
