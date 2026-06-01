"""
Post-Quantum Cryptography Engine — ML-DSA-65 (CRYSTALS-Dilithium) pure Python.

Implements NIST FIPS 204 ML-DSA-65 (security category 3).  All arithmetic is
schoolbook (O(N²) polynomial multiplication) — correct but slower than an NTT
implementation.  For production throughput, replace with a compiled binding.

Parameter set: ML-DSA-65
  k=6, l=5, η=4, τ=49, β=196, γ₁=2¹⁹, γ₂=(q−1)/32, ω=55, λ=192
  Public key:  1952 bytes raw  (+5 header = 1957 bytes on wire)
  Private key: 4032 bytes raw  (+5 header = 4037 bytes on wire)
  Signature:   3309 bytes

References
----------
FIPS 204 (2024): https://doi.org/10.6028/NIST.FIPS.204
CRYSTALS-Dilithium v3.1 specification (2021)
"""
from __future__ import annotations

import hashlib
import os
from typing import Final

__all__ = [
    "PQCError",
    "PQCKeyError",
    "PQCSignatureError",
    "pqc_generate_keypair",
    "pqc_sign",
    "pqc_verify",
    "pqc_public_key_fingerprint",
    "PQCPublicKey",
    "PQCPrivateKey",
]

# ── ML-DSA-65 parameters ──────────────────────────────────────────────────────

_Q: Final[int] = 8_380_417           # prime modulus
_N: Final[int] = 256                  # polynomial degree
_K: Final[int] = 6                    # matrix rows
_L: Final[int] = 5                    # matrix columns
_ETA: Final[int] = 4                  # secret key coefficient bound
_TAU: Final[int] = 49                 # challenge polynomial weight
_BETA: Final[int] = 196              # = τ·η
_GAMMA1: Final[int] = 1 << 19        # 524288  (2^19)
_GAMMA2: Final[int] = (_Q - 1) // 32
_D: Final[int] = 13                   # dropped low bits from t
_OMEGA: Final[int] = 55              # max hint bits

_LAMBDA: Final[int] = 192            # security parameter (bits)
_C_TILDE_BYTES: Final[int] = _LAMBDA // 4   # 48 bytes (2λ bits = 384 bits = 48 bytes)

_RHO_BYTES: Final[int] = 32
_RHO_PRIME_BYTES: Final[int] = 64
_KEY_BYTES: Final[int] = 32
_TR_BYTES: Final[int] = 64
_SEED_BYTES: Final[int] = 32

# Packed sizes per polynomial
_T1_PACKED: Final[int] = 320         # 10 bits × 256 / 8 = 320 B
_ETA_PACKED: Final[int] = 128        # 4 bits × 256 / 8 = 128 B  (η=4)
_T0_PACKED: Final[int] = 416         # 13 bits × 256 / 8 = 416 B
_Z_PACKED: Final[int] = 640          # 20 bits × 256 / 8 = 640 B  (γ1=2^19)

_PK_RAW_BYTES: Final[int] = _RHO_BYTES + _T1_PACKED * _K          # 1952
_SK_RAW_BYTES: Final[int] = (
    _RHO_BYTES + _KEY_BYTES + _TR_BYTES
    + _ETA_PACKED * _L
    + _ETA_PACKED * _K
    + _T0_PACKED * _K
)   # 32+32+64+640+768+2496 = 4032
_SIG_BYTES: Final[int] = _C_TILDE_BYTES + _Z_PACKED * _L + _OMEGA + _K  # 48+3200+61 = 3309

_MAGIC: Final[bytes] = b"PQCS"
_PARAM_TAG: Final[int] = 0x65
_HEADER: Final[int] = 5              # len(_MAGIC) + 1


# ── Exceptions ────────────────────────────────────────────────────────────────

class PQCError(RuntimeError):
    """Base PQC exception."""


class PQCKeyError(PQCError):
    """Malformed or incompatible key material."""


class PQCSignatureError(PQCError):
    """Signature verification failure."""


# ── Typed key wrappers ────────────────────────────────────────────────────────

class PQCPublicKey:
    __slots__ = ("_raw",)

    def __init__(self, raw: bytes) -> None:
        _check_header(raw, _PK_RAW_BYTES)
        self._raw = raw

    @property
    def raw(self) -> bytes:
        return self._raw

    def __eq__(self, other: object) -> bool:
        return isinstance(other, PQCPublicKey) and self._raw == other._raw

    def __hash__(self) -> int:
        return hash(self._raw)


class PQCPrivateKey:
    __slots__ = ("_raw",)

    def __init__(self, raw: bytes) -> None:
        _check_header(raw, _SK_RAW_BYTES)
        self._raw = raw

    @property
    def raw(self) -> bytes:
        return self._raw


# ── Header helpers ────────────────────────────────────────────────────────────

def _make_header() -> bytes:
    return _MAGIC + bytes([_PARAM_TAG])


def _check_header(raw: bytes, expected_inner: int) -> None:
    if len(raw) < _HEADER:
        raise PQCKeyError("Key too short for header")
    if raw[:4] != _MAGIC:
        raise PQCKeyError(f"Invalid magic: {raw[:4]!r}")
    if raw[4] != _PARAM_TAG:
        raise PQCKeyError(f"Wrong parameter tag 0x{raw[4]:02X}")
    inner = len(raw) - _HEADER
    if inner != expected_inner:
        raise PQCKeyError(f"Key inner length {inner} ≠ {expected_inner}")


# ── Hash / XOF primitives ─────────────────────────────────────────────────────

def _shake256(data: bytes, n: int) -> bytes:
    return hashlib.shake_256(data).digest(n)


def _shake128(data: bytes, n: int) -> bytes:
    return hashlib.shake_128(data).digest(n)


# ── Polynomial ring Z_q[X]/(X^N+1) — schoolbook ─────────────────────────────

def _poly_add(a: list[int], b: list[int]) -> list[int]:
    return [(a[i] + b[i]) % _Q for i in range(_N)]


def _poly_sub(a: list[int], b: list[int]) -> list[int]:
    return [(a[i] - b[i]) % _Q for i in range(_N)]


def _poly_mul(a: list[int], b: list[int]) -> list[int]:
    """Schoolbook multiplication in Z_q[X]/(X^N+1)."""
    c = [0] * _N
    for i in range(_N):
        ai = a[i]
        if ai == 0:
            continue
        for j in range(_N):
            k = i + j
            if k < _N:
                c[k] = (c[k] + ai * b[j]) % _Q
            else:
                c[k - _N] = (c[k - _N] - ai * b[j]) % _Q
    return c


def _poly_scale(a: list[int], s: int) -> list[int]:
    return [(x * s) % _Q for x in a]


def _mat_vec_mul(
    mat: list[list[list[int]]],
    vec: list[list[int]],
) -> list[list[int]]:
    """Compute mat·vec where mat is k×l and vec is length l."""
    out: list[list[int]] = []
    for i in range(_K):
        acc = [0] * _N
        for j in range(_L):
            acc = _poly_add(acc, _poly_mul(mat[i][j], vec[j]))
        out.append(acc)
    return out


# ── ExpandA: uniform sampling of matrix A ────────────────────────────────────

def _expand_a(rho: bytes) -> list[list[list[int]]]:
    """ExpandA — rejection-sample A ∈ Z_q^{k×l} from ρ (Algorithm 32 FIPS 204)."""
    a: list[list[list[int]]] = []
    for i in range(_K):
        row: list[list[int]] = []
        for j in range(_L):
            seed = rho + bytes([j, i])
            buf = _shake128(seed, _N * 3)
            poly: list[int] = []
            idx = 0
            extra = 0
            while len(poly) < _N:
                if idx + 3 > len(buf):
                    extra += 1
                    buf = _shake128(seed + extra.to_bytes(2, "little"), _N * 3)
                    idx = 0
                d0 = buf[idx] | ((buf[idx + 1] & 0x7F) << 8)
                d1 = (buf[idx + 1] >> 7) | (buf[idx + 2] << 1)
                idx += 3
                if d0 < _Q:
                    poly.append(d0)
                if d1 < _Q and len(poly) < _N:
                    poly.append(d1)
            row.append(poly[:_N])
        a.append(row)
    return a


# ── ExpandS: secret polynomial sampling ──────────────────────────────────────

def _sample_eta(seed: bytes, nonce: int) -> list[int]:
    """Sample one polynomial with coefficients in [-η, η] via SHAKE-256."""
    buf = _shake256(seed + nonce.to_bytes(2, "little"), _N * 2)
    poly: list[int] = []
    bi = 0
    extra = 0
    while len(poly) < _N:
        if bi >= len(buf):
            extra += 1
            buf = _shake256(seed + nonce.to_bytes(2, "little") +
                            extra.to_bytes(2, "little"), _N * 2)
            bi = 0
        b = buf[bi]
        bi += 1
        a0 = b & 0xF
        a1 = b >> 4
        if a0 < 2 * _ETA + 1:
            poly.append(_ETA - a0)
        if a1 < 2 * _ETA + 1 and len(poly) < _N:
            poly.append(_ETA - a1)
    return poly[:_N]


def _expand_s(rho_prime: bytes) -> tuple[list[list[int]], list[list[int]]]:
    """ExpandS — produce s1 (l polys) and s2 (k polys)."""
    s1 = [_sample_eta(rho_prime, i) for i in range(_L)]
    s2 = [_sample_eta(rho_prime, _L + i) for i in range(_K)]
    return s1, s2


# ── ExpandMask: y sampling (Algorithm 5) ─────────────────────────────────────

def _expand_mask(rho_prime: bytes, kappa: int) -> list[list[int]]:
    """ExpandMask — sample y with ‖y‖∞ < γ1 (20-bit coefficients for γ1=2^19)."""
    y: list[list[int]] = []
    for i in range(_L):
        seed = rho_prime + (kappa + i).to_bytes(2, "little")
        buf = _shake256(seed, _Z_PACKED)   # 640 bytes = 256 × 20 bits exactly
        poly: list[int] = []
        for k in range(0, _N, 2):
            j = k * 5 // 2
            b0, b1, b2, b3, b4 = buf[j], buf[j + 1], buf[j + 2], buf[j + 3], buf[j + 4]
            z0 = b0 | (b1 << 8) | ((b2 & 0xF) << 16)    # 20 bits
            z1 = (b2 >> 4) | (b3 << 4) | (b4 << 12)     # 20 bits
            poly.append(_GAMMA1 - z0)
            poly.append(_GAMMA1 - z1)
        y.append(poly)
    return y


# ── SampleInBall: challenge polynomial ───────────────────────────────────────

def _sample_in_ball(c_tilde: bytes) -> list[int]:
    """SampleInBall (Algorithm 30 FIPS 204) — τ non-zero ±1 coefficients."""
    buf = _shake256(c_tilde, 8 + _N)
    signs = int.from_bytes(buf[:8], "little")
    c = [0] * _N
    p = 8
    for i in range(_N - _TAU, _N):
        j = buf[p] % (i + 1)
        p += 1
        c[i] = c[j]
        c[j] = 1 - 2 * ((signs >> (i - (_N - _TAU))) & 1)
    return c


# ── Decompose / High-Low bits ─────────────────────────────────────────────────

def _decompose(r: int) -> tuple[int, int]:
    """Decompose r mod q = r1·(2γ2) + r0 with r0 ∈ (-γ2, γ2]."""
    r_mod = r % _Q
    r0 = r_mod % (2 * _GAMMA2)
    if r0 > _GAMMA2:
        r0 -= 2 * _GAMMA2
    r1 = (r_mod - r0) // (2 * _GAMMA2)
    if r_mod - r0 == _Q - 1:
        r1 = 0
        r0 -= 1
    return r1, r0


def _high_bits(r: int) -> int:
    r1, _ = _decompose(r)
    return r1


def _low_bits(r: int) -> int:
    _, r0 = _decompose(r)
    return r0


def _make_hint(z: int, r: int) -> int:
    return int(_high_bits(r + z) != _high_bits(r))


def _use_hint(h: int, r: int) -> int:
    m = (_Q - 1) // (2 * _GAMMA2)
    r1, r0 = _decompose(r)
    if h == 1 and r0 > 0:
        return (r1 + 1) % m
    if h == 1 and r0 <= 0:
        return (r1 - 1) % m
    return r1


def _power2round(r: int) -> tuple[int, int]:
    r_mod = r % _Q
    r0 = r_mod % (1 << _D)
    if r0 > (1 << (_D - 1)):
        r0 -= 1 << _D
    r1 = (r_mod - r0) >> _D
    return r1, r0


def _inf_norm(poly: list[int]) -> int:
    half = _Q // 2
    return max(abs(c if c <= half else c - _Q) for c in poly)


# ── Bit-packing ───────────────────────────────────────────────────────────────

def _pack_t1(poly: list[int]) -> bytes:
    """10-bit packing: 4 coefficients → 5 bytes."""
    out = bytearray(_T1_PACKED)
    j = 0
    for i in range(0, _N, 4):
        v = (poly[i] & 0x3FF) | ((poly[i + 1] & 0x3FF) << 10) | \
            ((poly[i + 2] & 0x3FF) << 20) | ((poly[i + 3] & 0x3FF) << 30)
        out[j] = v & 0xFF
        out[j + 1] = (v >> 8) & 0xFF
        out[j + 2] = (v >> 16) & 0xFF
        out[j + 3] = (v >> 24) & 0xFF
        out[j + 4] = (v >> 32) & 0xFF
        j += 5
    return bytes(out)


def _unpack_t1(data: bytes) -> list[int]:
    poly = [0] * _N
    j = 0
    for i in range(0, _N, 4):
        v = data[j] | (data[j + 1] << 8) | (data[j + 2] << 16) | \
            (data[j + 3] << 24) | (data[j + 4] << 32)
        poly[i] = v & 0x3FF
        poly[i + 1] = (v >> 10) & 0x3FF
        poly[i + 2] = (v >> 20) & 0x3FF
        poly[i + 3] = (v >> 30) & 0x3FF
        j += 5
    return poly


def _pack_eta(poly: list[int]) -> bytes:
    """4-bit packing for η=4 coefficients in [-4, 4]."""
    out = bytearray(_ETA_PACKED)
    for i in range(0, _N, 2):
        out[i // 2] = ((_ETA - poly[i]) & 0xF) | (((_ETA - poly[i + 1]) & 0xF) << 4)
    return bytes(out)


def _unpack_eta(data: bytes) -> list[int]:
    poly = [0] * _N
    for i in range(0, _N, 2):
        b = data[i // 2]
        poly[i] = _ETA - (b & 0xF)
        poly[i + 1] = _ETA - (b >> 4)
    return poly


def _pack_t0(poly: list[int]) -> bytes:
    """13-bit packing for t0 coefficients (stored as 2^12 - coef)."""
    out = bytearray(_T0_PACKED)
    j = 0
    for i in range(0, _N, 8):
        vals = [(1 << 12) - poly[i + k] for k in range(8)]
        v = 0
        for k, val in enumerate(vals):
            v |= (val & 0x1FFF) << (13 * k)
        for k in range(13):
            out[j + k] = (v >> (8 * k)) & 0xFF
        j += 13
    return bytes(out)


def _unpack_t0(data: bytes) -> list[int]:
    poly = [0] * _N
    j = 0
    for i in range(0, _N, 8):
        v = 0
        for k in range(13):
            v |= data[j + k] << (8 * k)
        for k in range(8):
            poly[i + k] = (1 << 12) - ((v >> (13 * k)) & 0x1FFF)
        j += 13
    return poly


def _center_q(x: int) -> int:
    """Convert x ∈ [0, Q) to the symmetric representative in (-Q/2, Q/2]."""
    return x - _Q if x > _Q >> 1 else x


def _pack_z(poly: list[int]) -> bytes:
    """20-bit packing for z: 2 coefficients → 5 bytes (γ1=2^19).

    Input coefficients may be in [0, Q) (mod-Q-reduced); they are centred
    before packing so that (γ1 − coef) is always in [0, 2γ1].
    """
    out = bytearray(_Z_PACKED)
    j = 0
    for i in range(0, _N, 2):
        z0 = (_GAMMA1 - _center_q(poly[i])) & 0xFFFFF
        z1 = (_GAMMA1 - _center_q(poly[i + 1])) & 0xFFFFF
        out[j] = z0 & 0xFF
        out[j + 1] = (z0 >> 8) & 0xFF
        out[j + 2] = (z0 >> 16) | ((z1 & 0xF) << 4)
        out[j + 3] = (z1 >> 4) & 0xFF
        out[j + 4] = (z1 >> 12) & 0xFF
        j += 5
    return bytes(out)


def _unpack_z(data: bytes) -> list[int]:
    poly = [0] * _N
    j = 0
    for i in range(0, _N, 2):
        b0, b1, b2, b3, b4 = data[j], data[j + 1], data[j + 2], data[j + 3], data[j + 4]
        z0 = b0 | (b1 << 8) | ((b2 & 0xF) << 16)
        z1 = (b2 >> 4) | (b3 << 4) | (b4 << 12)
        poly[i] = _GAMMA1 - z0
        poly[i + 1] = _GAMMA1 - z1
        j += 5
    return poly


def _encode_hint(h: list[list[int]]) -> bytes:
    """
    Sparse hint encoding: ω + k bytes.
    First k bytes: cumulative count of 1-bits per polynomial.
    Remaining ω bytes: sorted indices of 1-bits.
    """
    positions: list[int] = []
    offsets: list[int] = []
    for poly in h:
        for idx, bit in enumerate(poly):
            if bit:
                positions.append(idx)
        offsets.append(len(positions))
    # pad positions to ω
    while len(positions) < _OMEGA:
        positions.append(0)
    out = bytearray(_OMEGA + _K)
    for i, off in enumerate(offsets):
        out[i] = off
    for i, pos in enumerate(positions[:_OMEGA]):
        out[_K + i] = pos
    return bytes(out)


def _decode_hint(data: bytes) -> list[list[int]]:
    """Decode hint encoding back to list of k polynomials."""
    offsets = [data[i] for i in range(_K)]
    h: list[list[int]] = []
    prev = 0
    for ki in range(_K):
        poly = [0] * _N
        end = offsets[ki]
        for p in range(prev, min(end, _OMEGA)):
            idx = data[_K + p]
            if idx < _N:
                poly[idx] = 1
        h.append(poly)
        prev = end
    return h


# ── Key generation ────────────────────────────────────────────────────────────

def _keygen_raw(xi: bytes) -> tuple[bytes, bytes]:
    """ML-DSA.KeyGen_internal from 32-byte seed ξ."""
    expanded = _shake256(xi, _RHO_BYTES + _RHO_PRIME_BYTES + _KEY_BYTES)
    rho = expanded[:32]
    rho_p = expanded[32:96]
    K = expanded[96:128]

    A = _expand_a(rho)
    s1, s2 = _expand_s(rho_p)

    # t = A·s1 + s2
    As1 = _mat_vec_mul(A, s1)
    t = [_poly_add(As1[i], s2[i]) for i in range(_K)]

    # Power2Round each coefficient
    t1_polys, t0_polys = [], []
    for poly in t:
        t1c, t0c = [], []
        for c in poly:
            r1, r0 = _power2round(c)
            t1c.append(r1)
            t0c.append(r0)
        t1_polys.append(t1c)
        t0_polys.append(t0c)

    pk_raw = rho + b"".join(_pack_t1(p) for p in t1_polys)
    tr = _shake256(pk_raw, _TR_BYTES)
    sk_raw = (
        rho + K + tr
        + b"".join(_pack_eta(p) for p in s1)
        + b"".join(_pack_eta(p) for p in s2)
        + b"".join(_pack_t0(p) for p in t0_polys)
    )
    return pk_raw, sk_raw


# ── Signing ───────────────────────────────────────────────────────────────────

def _sign_raw(sk_raw: bytes, message: bytes) -> bytes:
    """ML-DSA.Sign_internal (deterministic)."""
    rho = sk_raw[:32]
    K = sk_raw[32:64]
    tr = sk_raw[64:128]

    o = 128
    s1 = [_unpack_eta(sk_raw[o + _ETA_PACKED * i: o + _ETA_PACKED * (i + 1)]) for i in range(_L)]
    o += _ETA_PACKED * _L
    s2 = [_unpack_eta(sk_raw[o + _ETA_PACKED * i: o + _ETA_PACKED * (i + 1)]) for i in range(_K)]
    o += _ETA_PACKED * _K
    t0 = [_unpack_t0(sk_raw[o + _T0_PACKED * i: o + _T0_PACKED * (i + 1)]) for i in range(_K)]

    A = _expand_a(rho)
    mu = _shake256(tr + message, 64)
    rho_pp = _shake256(K + mu, 64)  # deterministic nonce

    kappa = 0
    while True:
        y = _expand_mask(rho_pp, kappa)
        kappa += _L
        Ay = _mat_vec_mul(A, y)
        w1 = [[_high_bits(c) for c in poly] for poly in Ay]
        w1_enc = b"".join(bytes(poly) for poly in w1)
        c_tilde = _shake256(mu + w1_enc, _C_TILDE_BYTES)
        c = _sample_in_ball(c_tilde)

        cs1 = [_poly_mul(c, s1[j]) for j in range(_L)]
        z = [_poly_add(y[j], cs1[j]) for j in range(_L)]

        if any(_inf_norm(p) >= _GAMMA1 - _BETA for p in z):
            continue

        cs2 = [_poly_mul(c, s2[i]) for i in range(_K)]
        r = [_poly_sub(Ay[i], cs2[i]) for i in range(_K)]
        r0 = [[_low_bits(coef) for coef in poly] for poly in r]

        if any(_inf_norm(p) >= _GAMMA2 - _BETA for p in r0):
            continue

        ct0 = [_poly_mul(c, t0[i]) for i in range(_K)]
        if any(_inf_norm(p) >= _GAMMA2 for p in ct0):   # FIPS 204 step 26
            continue
        h: list[list[int]] = []
        hint_total = 0
        for i in range(_K):
            hi: list[int] = []
            for coef_idx in range(_N):
                bit = _make_hint(
                    ct0[i][coef_idx],
                    Ay[i][coef_idx] - cs2[i][coef_idx],
                )
                hi.append(bit)
                hint_total += bit
            h.append(hi)

        if hint_total > _OMEGA:
            continue

        return c_tilde + b"".join(_pack_z(p) for p in z) + _encode_hint(h)


# ── Verification ──────────────────────────────────────────────────────────────

def _verify_raw(pk_raw: bytes, message: bytes, sig: bytes) -> bool:
    """ML-DSA.Verify_internal. Returns True iff signature is valid."""
    try:
        if len(sig) != _SIG_BYTES:
            return False

        c_tilde = sig[:_C_TILDE_BYTES]
        p = _C_TILDE_BYTES
        z = [_unpack_z(sig[p + _Z_PACKED * i: p + _Z_PACKED * (i + 1)]) for i in range(_L)]
        p += _Z_PACKED * _L
        h = _decode_hint(sig[p:])

        if any(_inf_norm(poly) >= _GAMMA1 - _BETA for poly in z):
            return False
        if sum(sum(poly) for poly in h) > _OMEGA:
            return False

        rho = pk_raw[:_RHO_BYTES]
        t1 = [_unpack_t1(pk_raw[_RHO_BYTES + _T1_PACKED * i: _RHO_BYTES + _T1_PACKED * (i + 1)])
              for i in range(_K)]

        tr = _shake256(pk_raw, _TR_BYTES)
        mu = _shake256(tr + message, 64)
        c = _sample_in_ball(c_tilde)
        A = _expand_a(rho)

        # Az (in coefficient domain)
        Az = _mat_vec_mul(A, z)

        # c·t1·2^d
        t1_scaled = [_poly_scale(p, 1 << _D) for p in t1]
        ct1s = [_poly_mul(c, t1_scaled[i]) for i in range(_K)]

        # w' = Az − c·t1·2^d
        w_prime = [_poly_sub(Az[i], ct1s[i]) for i in range(_K)]

        # UseHint
        w1_prime = [
            [_use_hint(h[i][j], w_prime[i][j]) for j in range(_N)]
            for i in range(_K)
        ]

        w1_enc_p = b"".join(bytes(poly) for poly in w1_prime)
        c_tilde_p = _shake256(mu + w1_enc_p, _C_TILDE_BYTES)
        return c_tilde == c_tilde_p

    except Exception:  # noqa: BLE001
        return False


# ── Public API ────────────────────────────────────────────────────────────────

def pqc_generate_keypair() -> tuple[bytes, bytes]:
    """
    Generate an ML-DSA-65 key pair.

    Returns:
        (private_key_bytes, public_key_bytes)  — both include the 5-byte wire header.
    """
    xi = os.urandom(_SEED_BYTES)
    pk_raw, sk_raw = _keygen_raw(xi)
    hdr = _make_header()
    return hdr + sk_raw, hdr + pk_raw


def pqc_sign(message: bytes, private_key: bytes) -> bytes:
    """
    Sign *message* with an ML-DSA-65 private key.

    Returns a {_SIG_BYTES}-byte signature.

    Raises:
        PQCKeyError: on invalid key header or length.
    """
    _check_header(private_key, _SK_RAW_BYTES)
    return _sign_raw(private_key[_HEADER:], message)


def pqc_verify(message: bytes, signature: bytes, public_key: bytes) -> bool:
    """
    Verify an ML-DSA-65 *signature* over *message*.

    Returns True if valid, False otherwise.  Never raises for bad signatures.

    Raises:
        PQCKeyError: on malformed public key header.
    """
    _check_header(public_key, _PK_RAW_BYTES)
    return _verify_raw(public_key[_HEADER:], message, signature)


def pqc_public_key_fingerprint(public_key: bytes) -> str:
    """Return a 16-hex-char SHA-256 fingerprint of the public key."""
    return hashlib.sha256(public_key).hexdigest()[:16]
