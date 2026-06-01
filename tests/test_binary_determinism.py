"""
Bit-deterministic cross-platform system tests for Genesis Swarm binary serialization.

Validates :mod:`genesis_swarm.shared.binary_serializer` and
:mod:`genesis_swarm.shared.safe_binary_parser` across:

* **Byte-order determinism** — every packed frame must use big-endian (network
  byte order) regardless of ``sys.byteorder`` on the executing host.
* **Floating-point edge-case precision** — round-trip fidelity at IEEE 754
  extremes (max, min normal, epsilon, subnormal, ±0.0).
* **IEEE 754 NaN / Infinity injection** — maliciously crafted bit patterns
  must be intercepted by :class:`BufferBoundsError` before reaching any
  arithmetic pipeline.
* **Buffer bounds protection** — every possible truncation point in a TX or
  ENV frame must produce a clean exception, never a crash or silent data
  corruption.
* **Malicious clipping attacks** — frames where ``sig_len``, ``sender_len``,
  or ``payload_len`` claim more bytes than the buffer contains must be caught
  before any slice operation.
* **Cross-architecture determinism** — packed bytes for known inputs must
  match independently-computed reference values, proving the library does not
  use platform-native byte order at any point.
"""
from __future__ import annotations

import binascii
import math
import random
import struct
import sys

import pytest

from genesis_swarm.shared.binary_serializer import (
    BinaryParserError,
    ENV_HEADER_SIZE,
    TX_HEADER_SIZE,
    pack_envelope,
    pack_transaction,
    unpack_transaction,
)
from genesis_swarm.shared.safe_binary_parser import (
    BufferBoundsError,
    safe_pack_transaction,
    safe_unpack_envelope,
    safe_unpack_transaction,
)

# ── Shared test fixtures ──────────────────────────────────────────────────────

_KNOWN_DIGEST = b"a" * 64          # 64 ASCII-hex bytes (stand-in for real SHA-256)
_KNOWN_MERKLE = b"b" * 64
_KNOWN_PUBKEY = b"\x01" * 32
_KNOWN_SIG = b"\x02" * 64
_KNOWN_SENDER = "node-01"          # 7 bytes UTF-8
_KNOWN_PAYLOAD = b'{"score":99}'   # 12 bytes


def _make_valid_tx(
    tenant_id: int = 1,
    seq: int = 1,
    delta: float = 1.0,
    sig: bytes = b"\x01",
) -> bytes:
    """Return a valid packed TX frame for the given parameters."""
    return pack_transaction(tenant_id, seq, delta, sig)


def _make_valid_env(
    phase: int = 2,
    view: int = 0,
    seq: int = 1,
    sender: str = _KNOWN_SENDER,
    payload: bytes = _KNOWN_PAYLOAD,
) -> bytes:
    """Return a valid packed ENV frame for the given parameters."""
    return pack_envelope(
        phase=phase, view=view, seq=seq, timestamp_ns=1_000_000_000,
        digest=_KNOWN_DIGEST, merkle_root=_KNOWN_MERKLE,
        ed25519_pubkey=_KNOWN_PUBKEY, ed25519_sig=_KNOWN_SIG,
        sender_id=sender, payload=payload,
    )


def _craft_tx_with_balance_bits(balance_bits: int) -> bytes:
    """Construct a syntactically valid TX frame with arbitrary float64 bit pattern.

    Bypasses the safe packer to inject adversarial IEEE 754 bit patterns
    directly into the wire frame with a correct CRC.

    Args:
        balance_bits: Raw uint64 bit pattern to write into the balance_delta field.

    Returns:
        Bytes of a TX frame with the injected balance pattern and valid CRC.
    """
    pre = struct.pack("!4sBBHQQ", b"GSTX", 0x01, 0x00, 1, 0, 0)
    pre += struct.pack("!Q", balance_bits)   # write arbitrary bits as float64 field
    crc = binascii.crc32(pre) & 0xFFFF_FFFF
    return pre + struct.pack("!I", crc) + b"\xAB"  # 1-byte sig


# ── Class 1: Byte-order determinism ──────────────────────────────────────────

class TestByteOrderDeterminism:
    """Verify all packed frames use big-endian (network byte order) unconditionally."""

    def test_tx_magic_bytes_are_ascii_gstx(self) -> None:
        """TX frame must open with the ASCII bytes G S T X at offset 0."""
        raw = _make_valid_tx()
        assert raw[0:4] == b"GSTX", f"got {raw[0:4]!r}"

    def test_tx_version_byte_is_one(self) -> None:
        """TX version byte at offset 4 must be 0x01."""
        raw = _make_valid_tx()
        assert raw[4] == 0x01

    def test_tx_sig_len_field_is_big_endian(self) -> None:
        """sig_len=33 at offset 6-7 must be 0x0021, not little-endian 0x2100."""
        raw = pack_transaction(0, 0, 0.0, b"\xCC" * 33)
        assert raw[6] == 0x00, f"high byte={raw[6]:#04x} (expected 0x00)"
        assert raw[7] == 0x21, f"low byte={raw[7]:#04x} (expected 0x21)"
        assert raw[6:8] != bytes([0x21, 0x00]), "sig_len appears to be little-endian"

    def test_tx_tenant_id_is_big_endian(self) -> None:
        """tenant_id at offset 8-15 must be big-endian regardless of sys.byteorder."""
        tenant_id = 0x0102030405060708
        raw = _make_valid_tx(tenant_id=tenant_id)
        expected = bytes([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08])
        assert raw[8:16] == expected, (
            f"expected big-endian {expected.hex()}, got {raw[8:16].hex()}\n"
            f"(platform byte order: {sys.byteorder})"
        )
        if sys.byteorder == "little":
            little_endian = bytes([0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01])
            assert raw[8:16] != little_endian, "bytes are in native little-endian order"

    def test_tx_balance_one_point_zero_is_big_endian_ieee754(self) -> None:
        """1.0 in IEEE 754 big-endian is 3FF0000000000000 at offset 24-31."""
        raw = _make_valid_tx(delta=1.0)
        assert raw[24:32] == bytes.fromhex("3ff0000000000000"), (
            f"got {raw[24:32].hex()!r}"
        )

    def test_env_magic_bytes_are_ascii_genv(self) -> None:
        """ENV frame must open with the ASCII bytes G E N V at offset 0."""
        raw = _make_valid_env()
        assert raw[0:4] == b"GENV"

    def test_env_view_uint32_is_big_endian(self) -> None:
        """view=0x01020304 at offset 8-11 must be 01 02 03 04."""
        raw = _make_valid_env(view=0x01020304)
        assert raw[8:12] == bytes([0x01, 0x02, 0x03, 0x04]), (
            f"got {raw[8:12].hex()}"
        )

    def test_tx_round_trip_is_byte_for_byte_identical_on_re_pack(self) -> None:
        """Two calls with the same arguments must produce identical byte sequences."""
        args = (9_999, 42, -3.14159, b"\xDE\xAD\xBE\xEF")
        assert pack_transaction(*args) == pack_transaction(*args)

    def test_env_round_trip_is_byte_for_byte_identical_on_re_pack(self) -> None:
        """Two ENV pack calls with identical arguments must produce identical bytes."""
        raw1 = _make_valid_env(phase=3, view=7, seq=100)
        raw2 = _make_valid_env(phase=3, view=7, seq=100)
        assert raw1 == raw2


# ── Class 2: Cross-architecture bit-determinism ───────────────────────────────

class TestCrossArchBitDeterminism:
    """Verify packed bytes match independently-computed reference values.

    The references are computed using ``struct.pack("!", ...)`` with explicit
    network byte order, independent of the library's implementation.  If the
    library used platform-native byte order on a little-endian host, these
    tests would fail.
    """

    # Pre-computed reference TX for tenant_id=1, seq=1, delta=1.0, sig=b'\x01'
    # Computed with: struct.pack("!4sBBHQQd", b"GSTX", 1, 0, 1, 1, 1, 1.0) → CRC → + b'\x01'
    _REF_TX_HEX: str = "4753545801000001000000000000000100000000000000013ff0000000000000edcf893d01"

    def test_tx_frame_matches_precomputed_reference_hex(self) -> None:
        """Packed TX must match the reference hex computed independently."""
        actual = pack_transaction(1, 1, 1.0, b"\x01")
        assert actual.hex() == self._REF_TX_HEX, (
            f"Cross-arch determinism failure:\n"
            f"  expected: {self._REF_TX_HEX}\n"
            f"  got:      {actual.hex()}"
        )

    def test_tx_reference_can_be_unpacked_correctly(self) -> None:
        """The pre-computed reference hex must unpack to the correct field values."""
        raw = bytes.fromhex(self._REF_TX_HEX)
        frame = unpack_transaction(raw)
        assert frame.tenant_id == 1
        assert frame.sequence_id == 1
        assert frame.balance_delta == 1.0
        assert frame.signature == b"\x01"

    def test_tx_matches_independently_computed_struct_pack(self) -> None:
        """Library output must be byte-for-byte equal to a manual ``struct.pack``."""
        tenant_id = 0xDEAD_BEEF_CAFE_BABE
        seq_id = 42
        delta = -2.718281828
        sig = b"\xAB\xCD\xEF" * 4   # 12-byte signature

        # Independent reference (no library code)
        pre = struct.pack("!4sBBHQQd", b"GSTX", 0x01, 0x00, len(sig),
                          tenant_id, seq_id, delta)
        crc = binascii.crc32(pre) & 0xFFFF_FFFF
        reference = pre + struct.pack("!I", crc) + sig

        actual = pack_transaction(tenant_id, seq_id, delta, sig)
        assert actual == reference, (
            f"Library output diverges from independent struct.pack reference:\n"
            f"  reference: {reference.hex()}\n"
            f"  actual:    {actual.hex()}"
        )

    def test_env_matches_independently_computed_struct_pack(self) -> None:
        """Library ENV output must match a manually assembled ENV reference."""
        phase, view, seq, ts_ns = 3, 7, 100, 1_234_567_890
        sender_bytes = _KNOWN_SENDER.encode("utf-8")
        payload = _KNOWN_PAYLOAD

        # Independent reference
        pre = struct.pack(
            "!4sBBHIQQ64s64s32s64sHI",
            b"GENV", 0x02, phase, 0x0000, view, seq, ts_ns,
            _KNOWN_DIGEST, _KNOWN_MERKLE, _KNOWN_PUBKEY, _KNOWN_SIG,
            len(sender_bytes), len(payload),
        )
        h_crc = binascii.crc32(pre) & 0xFFFF_FFFF
        header = pre + struct.pack("!I", h_crc)
        body = sender_bytes + payload
        f_crc = binascii.crc32(header + body) & 0xFFFF_FFFF
        reference = header + body + struct.pack("!I", f_crc)

        actual = pack_envelope(
            phase=phase, view=view, seq=seq, timestamp_ns=ts_ns,
            digest=_KNOWN_DIGEST, merkle_root=_KNOWN_MERKLE,
            ed25519_pubkey=_KNOWN_PUBKEY, ed25519_sig=_KNOWN_SIG,
            sender_id=_KNOWN_SENDER, payload=payload,
        )
        assert actual == reference

    def test_specific_balance_delta_bytes_match_ieee754_spec(self) -> None:
        """Known IEEE 754 values must appear at the exact expected byte positions."""
        cases: list[tuple[float, str]] = [
            (1.0, "3ff0000000000000"),
            (-1.0, "bff0000000000000"),
            (0.0, "0000000000000000"),
            (-0.0, "8000000000000000"),
            (2.0, "4000000000000000"),
            (0.5, "3fe0000000000000"),
        ]
        for value, expected_hex in cases:
            raw = pack_transaction(0, 0, value, b"\x00")
            actual_hex = raw[24:32].hex()
            assert actual_hex == expected_hex, (
                f"balance_delta={value}: expected bytes {expected_hex}, got {actual_hex}"
            )


# ── Class 3: Floating-point edge-case precision ───────────────────────────────

class TestFloatPrecisionRoundTrip:
    """Verify that IEEE 754 float64 values survive pack→unpack without any truncation."""

    @pytest.mark.parametrize("value", [
        sys.float_info.max,          # ≈ 1.797 693 × 10^308
        sys.float_info.min,          # ≈ 2.225 073 × 10^-308 (smallest normal)
        sys.float_info.epsilon,      # ≈ 2.220 446 × 10^-16
        5e-324,                      # smallest positive subnormal (denormalized)
        1e-300,                      # deep subnormal range
        -sys.float_info.max,         # largest negative finite
        0.0,                         # positive zero
        -0.0,                        # negative zero (distinct bit pattern)
        1.23456789012345678901234,    # high-precision decimal
        -9876543210.987654321,        # large negative with fractional part
        1.0,
        -1.0,
        math.pi,
        math.e,
    ])
    def test_float_round_trips_without_truncation(self, value: float) -> None:
        """pack_transaction → unpack_transaction must recover the exact float64 bit pattern.

        Args:
            value: Float value to round-trip through the binary frame.
        """
        raw = pack_transaction(1, 1, value, b"\x01")
        frame = unpack_transaction(raw)
        if math.isnan(value):
            assert math.isnan(frame.balance_delta), "NaN should survive round-trip in base parser"
        elif value == 0.0:
            # +0.0 and -0.0 differ in their bit pattern; verify bit equality
            expected_bits, = struct.unpack("!Q", struct.pack("!d", value))
            actual_bits, = struct.unpack("!Q", struct.pack("!d", frame.balance_delta))
            assert actual_bits == expected_bits, (
                f"Zero sign bit lost: expected {expected_bits:#018x}, got {actual_bits:#018x}"
            )
        else:
            assert frame.balance_delta == value, (
                f"Precision truncation: input {value!r} → output {frame.balance_delta!r}"
            )

    def test_negative_zero_bit_pattern_is_preserved(self) -> None:
        """-0.0 and +0.0 produce distinct bit patterns in the packed frame."""
        raw_pos = pack_transaction(0, 0, 0.0, b"\x00")
        raw_neg = pack_transaction(0, 0, -0.0, b"\x00")
        assert raw_pos[24:32] != raw_neg[24:32], (
            "Positive and negative zero have the same bit pattern — sign bit lost"
        )

    def test_subnormal_float_byte_pattern_is_nonzero(self) -> None:
        """The smallest positive subnormal (5e-324) must produce non-zero bytes."""
        raw = pack_transaction(0, 0, 5e-324, b"\x00")
        assert any(b != 0 for b in raw[24:32]), "Subnormal value collapsed to zero bytes"


# ── Class 4: IEEE 754 NaN and Infinity injection prevention ───────────────────

class TestIEEE754Rejection:
    """Verify the safe parser intercepts NaN and Infinity at both pack and unpack."""

    @pytest.mark.parametrize("special_value", [
        float("nan"),
        float("inf"),
        float("-inf"),
    ])
    def test_safe_pack_rejects_special_float(self, special_value: float) -> None:
        """safe_pack_transaction must raise BufferBoundsError for NaN and ±Infinity.

        Args:
            special_value: IEEE 754 special float to test.
        """
        with pytest.raises(BufferBoundsError) as exc_info:
            safe_pack_transaction(1, 1, special_value, b"\x01")
        assert "IEEE 754" in str(exc_info.value)
        assert exc_info.value.context.get("field") == "balance_delta"

    @pytest.mark.parametrize("nan_bits", [
        0x7FF8_0000_0000_0000,  # quiet NaN (most common)
        0x7FF0_0000_0000_0001,  # signaling NaN
        0x7FFF_FFFF_FFFF_FFFF,  # quiet NaN with all mantissa bits set
        0xFFF8_0000_0000_0000,  # negative quiet NaN
        0x7FF0_0000_0000_0000,  # positive infinity
        0xFFF0_0000_0000_0000,  # negative infinity
    ])
    def test_crafted_nan_bit_pattern_rejected_on_safe_unpack(self, nan_bits: int) -> None:
        """Bit-exact NaN/Inf injections with valid CRC must be rejected on unpack.

        Constructs a well-formed TX frame with the adversarial bit pattern in
        the balance_delta field and a correctly computed CRC, then verifies
        that ``safe_unpack_transaction`` catches the injection.

        Args:
            nan_bits: Raw uint64 IEEE 754 bit pattern to inject.
        """
        crafted = _craft_tx_with_balance_bits(nan_bits)
        with pytest.raises(BufferBoundsError) as exc_info:
            safe_unpack_transaction(crafted)
        assert "IEEE 754" in str(exc_info.value)
        ctx = exc_info.value.context
        assert ctx.get("field") == "balance_delta"
        assert "bit_pattern" in ctx

    def test_finite_value_near_infinity_is_accepted(self) -> None:
        """sys.float_info.max is finite and must not be mistaken for Infinity."""
        frame = safe_unpack_transaction(
            safe_pack_transaction(1, 1, sys.float_info.max, b"\x01")
        )
        assert frame.balance_delta == sys.float_info.max

    def test_base_parser_passes_nan_while_safe_parser_catches_it(self) -> None:
        """Confirm the behavioral difference: base parser allows NaN, safe rejects it."""
        nan_frame = _craft_tx_with_balance_bits(0x7FF8_0000_0000_0000)

        # Base parser: NaN survives (by design — safe layer is optional)
        base_result = unpack_transaction(nan_frame)
        assert math.isnan(base_result.balance_delta), "Base parser should pass NaN through"

        # Safe parser: NaN is caught
        with pytest.raises(BufferBoundsError):
            safe_unpack_transaction(nan_frame)

    def test_exception_carries_bit_pattern_in_context(self) -> None:
        """BufferBoundsError context must include the exact bit pattern for forensics."""
        inf_bits = 0x7FF0_0000_0000_0000
        crafted = _craft_tx_with_balance_bits(inf_bits)
        with pytest.raises(BufferBoundsError) as exc_info:
            safe_unpack_transaction(crafted)
        ctx = exc_info.value.context
        assert ctx.get("bit_pattern") == f"{inf_bits:#018x}"
        assert ctx.get("ieee754_kind") in ("+Infinity", "-Infinity", "quiet NaN", "signaling NaN")


# ── Class 5: Systematic truncation — every byte position ─────────────────────

class TestSystematicTruncation:
    """Every possible truncation of a valid frame must raise a clean exception."""

    @pytest.fixture(scope="class")
    def valid_tx(self) -> bytes:
        """A valid 64-signature TX frame."""
        return pack_transaction(12345, 67890, 3.14, b"\xCC" * 64)

    @pytest.fixture(scope="class")
    def valid_env(self) -> bytes:
        """A valid ENV frame with known sender and payload."""
        return _make_valid_env()

    @pytest.mark.parametrize("clip_at", list(range(TX_HEADER_SIZE)))
    def test_tx_truncated_at_header_byte_position(
        self, clip_at: int, valid_tx: bytes
    ) -> None:
        """TX frame clipped at every position within the 36-byte header must be rejected.

        Args:
            clip_at: Number of bytes to retain (0 to TX_HEADER_SIZE - 1).
            valid_tx: The fixture-provided valid TX frame.
        """
        clipped = valid_tx[:clip_at]
        with pytest.raises((BufferBoundsError, BinaryParserError)):
            safe_unpack_transaction(clipped)

    @pytest.mark.parametrize("clip_at", list(range(ENV_HEADER_SIZE)))
    def test_env_truncated_at_header_byte_position(
        self, clip_at: int, valid_env: bytes
    ) -> None:
        """ENV frame clipped at every position within the 262-byte header must be rejected.

        Args:
            clip_at: Number of bytes to retain (0 to ENV_HEADER_SIZE - 1).
            valid_env: The fixture-provided valid ENV frame.
        """
        clipped = valid_env[:clip_at]
        with pytest.raises((BufferBoundsError, BinaryParserError)):
            safe_unpack_envelope(clipped)

    def test_tx_clip_in_signature_region_raises(self, valid_tx: bytes) -> None:
        """TX frame truncated within the 64-byte signature region must be rejected."""
        # valid_tx has 64-byte sig → total 100 bytes; clip at 37 (1 sig byte)
        for cut in range(TX_HEADER_SIZE + 1, len(valid_tx)):
            clipped = valid_tx[:cut]
            with pytest.raises((BufferBoundsError, BinaryParserError)):
                safe_unpack_transaction(clipped)

    def test_env_clip_in_body_raises(self, valid_env: bytes) -> None:
        """ENV frame truncated anywhere in the variable body must be rejected."""
        for cut in range(ENV_HEADER_SIZE + 1, len(valid_env)):
            clipped = valid_env[:cut]
            with pytest.raises((BufferBoundsError, BinaryParserError)):
                safe_unpack_envelope(clipped)


# ── Class 6: Buffer overrun (trailing injection bytes) ────────────────────────

class TestTrailingByteInjection:
    """Frames with extra trailing bytes beyond their declared size must be rejected."""

    @pytest.mark.parametrize("extra", [1, 2, 4, 8, 16, 64, 256])
    def test_tx_trailing_bytes_are_rejected(self, extra: int) -> None:
        """TX frame with ``extra`` appended bytes must raise BufferBoundsError.

        Args:
            extra: Number of padding bytes appended after the valid frame.
        """
        valid = pack_transaction(1, 1, 1.0, b"\x01")
        with pytest.raises(BufferBoundsError) as exc_info:
            safe_unpack_transaction(valid + b"\x00" * extra)
        assert "overrun" in str(exc_info.value).lower()

    @pytest.mark.parametrize("extra", [1, 2, 4, 8, 16])
    def test_env_trailing_bytes_are_rejected(self, extra: int) -> None:
        """ENV frame with ``extra`` appended bytes must raise BufferBoundsError.

        Args:
            extra: Number of padding bytes appended after the valid frame.
        """
        valid = _make_valid_env()
        with pytest.raises(BufferBoundsError) as exc_info:
            safe_unpack_envelope(valid + b"\x00" * extra)
        assert "overrun" in str(exc_info.value).lower()


# ── Class 7: Malicious clipping attacks ──────────────────────────────────────

class TestMaliciousClipping:
    """Variable-length fields claiming more bytes than the buffer contains."""

    def _build_tx_with_sig_len(self, declared_sig_len: int, actual_sig_bytes: int) -> bytes:
        """Build a TX frame with a mismatched declared and actual signature length.

        Args:
            declared_sig_len: sig_len value to write into the header.
            actual_sig_bytes: Number of signature bytes actually appended.

        Returns:
            Bytes of the crafted TX frame with correct header CRC.
        """
        pre = struct.pack("!4sBBHQQd",
                          b"GSTX", 0x01, 0x00, declared_sig_len, 0, 0, 0.0)
        crc = binascii.crc32(pre) & 0xFFFF_FFFF
        return pre + struct.pack("!I", crc) + b"\xAA" * actual_sig_bytes

    def test_sig_len_claims_64_but_only_1_byte_present(self) -> None:
        """Declared sig_len=64 with only 1 sig byte must be rejected before slice."""
        crafted = self._build_tx_with_sig_len(64, 1)
        with pytest.raises((BufferBoundsError, BinaryParserError)):
            safe_unpack_transaction(crafted)

    def test_sig_len_zero_is_rejected(self) -> None:
        """sig_len=0 violates the [1, 64] range and must be rejected immediately."""
        crafted = self._build_tx_with_sig_len(0, 0)
        with pytest.raises((BufferBoundsError, BinaryParserError)):
            safe_unpack_transaction(crafted)

    def test_sig_len_above_max_is_rejected(self) -> None:
        """sig_len=65 (> 64) violates the ceiling and must be rejected."""
        crafted = self._build_tx_with_sig_len(65, 65)
        with pytest.raises((BufferBoundsError, BinaryParserError)):
            safe_unpack_transaction(crafted)

    def _build_env_with_lengths(
        self,
        declared_sender_len: int,
        declared_payload_len: int,
        actual_body: bytes,
    ) -> bytes:
        """Build an ENV frame with declared lengths that may exceed actual body bytes.

        Args:
            declared_sender_len: sender_len value to write into the header.
            declared_payload_len: payload_len value to write into the header.
            actual_body: Actual bytes appended after the header (may be shorter
                than declared_sender_len + declared_payload_len).

        Returns:
            Bytes of the crafted ENV frame with correct header CRC.
        """
        pre = struct.pack(
            "!4sBBHIQQ64s64s32s64sHI",
            b"GENV", 0x02, 2, 0, 0, 1, 0,
            _KNOWN_DIGEST, _KNOWN_MERKLE, _KNOWN_PUBKEY, _KNOWN_SIG,
            declared_sender_len, declared_payload_len,
        )
        h_crc = binascii.crc32(pre) & 0xFFFF_FFFF
        header = pre + struct.pack("!I", h_crc)
        frame_crc_val = binascii.crc32(header + actual_body) & 0xFFFF_FFFF
        return header + actual_body + struct.pack("!I", frame_crc_val)

    def test_env_sender_len_claims_255_but_only_7_bytes_present(self) -> None:
        """ENV sender_len=255 with only 7 sender bytes must be rejected before slice."""
        crafted = self._build_env_with_lengths(255, 0, b"x" * 7)
        with pytest.raises((BufferBoundsError, BinaryParserError)):
            safe_unpack_envelope(crafted)

    def test_env_payload_len_claims_1000_but_buffer_ends_at_header(self) -> None:
        """ENV payload_len=1000 with no body bytes must be caught before slice."""
        crafted = self._build_env_with_lengths(7, 1000, b"node-01")
        with pytest.raises((BufferBoundsError, BinaryParserError)):
            safe_unpack_envelope(crafted)

    def test_env_sender_len_zero_is_rejected(self) -> None:
        """sender_len=0 violates the [1, 255] range and must be caught immediately."""
        crafted = self._build_env_with_lengths(0, 0, b"")
        with pytest.raises((BufferBoundsError, BinaryParserError)):
            safe_unpack_envelope(crafted)


# ── Class 8: Magic and version attacks ───────────────────────────────────────

class TestMagicAndVersionViolations:
    """Frames with wrong magic bytes or unknown versions must be rejected immediately."""

    @pytest.mark.parametrize("corrupt_magic", [
        b"\x00\x00\x00\x00",
        b"GENV",      # TX magic replaced with ENV magic
        b"gstx",      # lowercase (not a valid sentinel)
        b"GSTX"[::-1],  # reversed
        b"\xFF\xFF\xFF\xFF",
    ])
    def test_tx_wrong_magic_raises_buffer_bounds_error(self, corrupt_magic: bytes) -> None:
        """Any TX frame with non-GSTX magic must be rejected.

        Args:
            corrupt_magic: 4-byte replacement for the magic field.
        """
        valid = _make_valid_tx()
        tampered = corrupt_magic + valid[4:]
        with pytest.raises((BufferBoundsError, BinaryParserError)):
            safe_unpack_transaction(tampered)

    @pytest.mark.parametrize("corrupt_magic", [
        b"\x00\x00\x00\x00",
        b"GSTX",      # ENV magic replaced with TX magic
        b"genv",
        b"\xFF\xFF\xFF\xFF",
    ])
    def test_env_wrong_magic_raises_buffer_bounds_error(self, corrupt_magic: bytes) -> None:
        """Any ENV frame with non-GENV magic must be rejected.

        Args:
            corrupt_magic: 4-byte replacement for the magic field.
        """
        valid = _make_valid_env()
        tampered = corrupt_magic + valid[4:]
        with pytest.raises((BufferBoundsError, BinaryParserError)):
            safe_unpack_envelope(tampered)

    @pytest.mark.parametrize("bad_version", [0x00, 0x02, 0x7F, 0xFF])
    def test_tx_wrong_version_raises(self, bad_version: int) -> None:
        """TX frame with version ≠ 0x01 must be rejected.

        Args:
            bad_version: Replacement version byte.
        """
        valid = _make_valid_tx()
        tampered = valid[:4] + bytes([bad_version]) + valid[5:]
        with pytest.raises((BufferBoundsError, BinaryParserError)):
            safe_unpack_transaction(tampered)

    def test_empty_buffer_raises_buffer_bounds_error_for_tx(self) -> None:
        """An empty TX buffer must raise BufferBoundsError with 'underrun' in the message."""
        with pytest.raises(BufferBoundsError) as exc_info:
            safe_unpack_transaction(b"")
        assert "underrun" in str(exc_info.value).lower()

    def test_empty_buffer_raises_buffer_bounds_error_for_env(self) -> None:
        """An empty ENV buffer must raise BufferBoundsError with 'underrun' in the message."""
        with pytest.raises(BufferBoundsError) as exc_info:
            safe_unpack_envelope(b"")
        assert "underrun" in str(exc_info.value).lower()


# ── Class 9: CRC integrity — single-bit flip detection ───────────────────────

class TestCRCIntegrity:
    """A single-bit flip anywhere in the protected region must be detected."""

    @pytest.fixture(scope="class")
    def valid_tx_64sig(self) -> bytes:
        """Valid TX frame with a 64-byte signature."""
        return pack_transaction(9999, 1, 2.71828, b"\xAA" * 64)

    @pytest.fixture(scope="class")
    def valid_env_12payload(self) -> bytes:
        """Valid ENV frame."""
        return _make_valid_env()

    @pytest.mark.parametrize("flip_byte", list(range(32)))
    def test_tx_single_bit_flip_in_crc_covered_region_detected(
        self, flip_byte: int, valid_tx_64sig: bytes
    ) -> None:
        """Flipping any bit in TX bytes [0:32] (header CRC region) must be caught.

        Args:
            flip_byte: Byte index to flip (0–31).
            valid_tx_64sig: Fixture-provided valid TX frame.
        """
        tampered = bytearray(valid_tx_64sig)
        tampered[flip_byte] ^= 0x01
        with pytest.raises((BufferBoundsError, BinaryParserError)):
            safe_unpack_transaction(bytes(tampered))

    @pytest.mark.parametrize("flip_byte", list(range(258)))
    def test_env_single_bit_flip_in_header_crc_region_detected(
        self, flip_byte: int, valid_env_12payload: bytes
    ) -> None:
        """Flipping any bit in ENV bytes [0:258] (header CRC region) must be caught.

        Args:
            flip_byte: Byte index to flip (0–257).
            valid_env_12payload: Fixture-provided valid ENV frame.
        """
        tampered = bytearray(valid_env_12payload)
        tampered[flip_byte] ^= 0x01
        with pytest.raises((BufferBoundsError, BinaryParserError)):
            safe_unpack_envelope(bytes(tampered))


# ── Class 10: Fuzz — random malformed payloads ────────────────────────────────

class TestFuzzRandomPayloads:
    """Random garbage and seeded pseudo-random clipped payloads must never crash."""

    _FUZZ_SEED: int = 0xDEAD_C0DE
    _NUM_FUZZ_CASES: int = 200

    @pytest.fixture(scope="class")
    def random_payloads(self) -> list[bytes]:
        """Generate a deterministic set of pseudo-random byte sequences.

        Uses a fixed seed so the fuzz inputs are reproducible across runs
        and platforms.
        """
        rng = random.Random(self._FUZZ_SEED)
        cases: list[bytes] = []
        # Lengths chosen to hit sub-header, at-header, and above-header sizes
        for _ in range(self._NUM_FUZZ_CASES):
            length = rng.choice([
                0, 1, 4, 10, 35, 36, 37, 50, 100,
                TX_HEADER_SIZE, TX_HEADER_SIZE + 1,
                ENV_HEADER_SIZE - 1, ENV_HEADER_SIZE, ENV_HEADER_SIZE + 1,
                200, 512, 1024,
            ])
            cases.append(bytes(rng.getrandbits(8) for _ in range(length)))
        return cases

    def test_random_payloads_never_crash_tx_parser(
        self, random_payloads: list[bytes]
    ) -> None:
        """safe_unpack_transaction must never raise an unhandled exception on random input.

        Args:
            random_payloads: Fixture-provided list of random byte sequences.
        """
        for i, payload in enumerate(random_payloads):
            try:
                safe_unpack_transaction(payload)
            except (BufferBoundsError, BinaryParserError):
                pass  # expected: clean structured rejection
            except Exception as exc:  # noqa: BLE001
                pytest.fail(
                    f"safe_unpack_transaction raised unexpected {type(exc).__name__} "
                    f"on fuzz input #{i} (len={len(payload)}): {exc}"
                )

    def test_random_payloads_never_crash_env_parser(
        self, random_payloads: list[bytes]
    ) -> None:
        """safe_unpack_envelope must never raise an unhandled exception on random input.

        Args:
            random_payloads: Fixture-provided list of random byte sequences.
        """
        for i, payload in enumerate(random_payloads):
            try:
                safe_unpack_envelope(payload)
            except (BufferBoundsError, BinaryParserError):
                pass  # expected
            except Exception as exc:  # noqa: BLE001
                pytest.fail(
                    f"safe_unpack_envelope raised unexpected {type(exc).__name__} "
                    f"on fuzz input #{i} (len={len(payload)}): {exc}"
                )

    def test_all_zero_buffer_is_rejected_cleanly(self) -> None:
        """An all-zero buffer of any size must produce a structured error, not a crash."""
        for length in [0, 1, 35, 36, 100, 262, 300]:
            buf = bytes(length)
            for parser in (safe_unpack_transaction, safe_unpack_envelope):
                try:
                    parser(buf)
                except (BufferBoundsError, BinaryParserError):
                    pass
                except Exception as exc:  # noqa: BLE001
                    pytest.fail(
                        f"{parser.__name__} raised unexpected {type(exc).__name__} "
                        f"on all-zero buffer of length {length}: {exc}"
                    )

    def test_all_ff_buffer_is_rejected_cleanly(self) -> None:
        """An all-0xFF buffer of any size must produce a structured error, not a crash."""
        for length in [0, 1, 36, 100, 262, 300]:
            buf = bytes([0xFF] * length)
            for parser in (safe_unpack_transaction, safe_unpack_envelope):
                try:
                    parser(buf)
                except (BufferBoundsError, BinaryParserError):
                    pass
                except Exception as exc:  # noqa: BLE001
                    pytest.fail(
                        f"{parser.__name__} raised unexpected {type(exc).__name__} "
                        f"on all-0xFF buffer of length {length}: {exc}"
                    )
