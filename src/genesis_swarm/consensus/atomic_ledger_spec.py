"""
Crystalline Atomic Lattice Ledger Interface — Diamond NV-Center Quantum Memory.

Physical substrate
------------------
This module simulates a ledger backed by nitrogen-vacancy (NV) centers in a
synthetic diamond crystal.  NV centers are point defects consisting of a
nitrogen atom substituting a carbon site adjacent to a lattice vacancy.  They
are real quantum memory technology: room-temperature spin coherence times of
milliseconds have been demonstrated (Balasubramanian et al., 2009).

Diamond crystal structure
-------------------------
Diamond has a face-centred cubic (FCC) Bravais lattice with a 2-atom basis:
    Atom A: (0, 0, 0)
    Atom B: (a₀/4, a₀/4, a₀/4)
Lattice constant: a₀ = 3.567 × 10⁻¹⁰ m = 3.567 Å
Nearest-neighbour C–C distance: a₀√3/4 ≈ 1.545 Å (the covalent bond length)

An NV center occupies one A-site (the nitrogen N) and the adjacent B-site
becomes the vacancy V.  The ground electronic state has spin S = 1 (triplet)
with three eigenstates:
    |ms = 0⟩   — zero-field ground state
    |ms = +1⟩  — upper spin state, optically distinguishable
    |ms = −1⟩  — upper spin state, opposite polarization

Encoding scheme
---------------
Each NV center stores one trit (log₂3 ≈ 1.585 bits):
    SpinState.ZERO      → ms = 0   → logical symbol 0
    SpinState.PLUS_ONE  → ms = +1  → logical symbol 1
    SpinState.MINUS_ONE → ms = −1  → logical symbol 2  (used as parity check)

For a 256-bit SHA-256 digest we use 256 NV centers with binary encoding
(ZERO = bit-0, PLUS_ONE = bit-1).  Additional MINUS_ONE centers are written
at every 8th position as a parity sentinel, yielding:
    32 bytes = 256 payload bits + 32 parity tritrits = 288 total NV centers

The full ledger entry layout (per transaction):
    288 NV centers  — payload + parity
      8 NV centers  — ledger_index in binary (8-bit unsigned)
     64 NV centers  — timestamp_ns (64-bit big-endian binary)
    360 total NV centers per transaction entry

NV centers are addressed by 3D integer unit-cell coordinates (i, j, k) plus
a basis index b ∈ {0, 1}.  Physical position in metres:
    r = i·a₁ + j·a₂ + k·a₃ + basis_offset(b)
where a₁ = (a₀/2)(ŷ+ẑ),  a₂ = (a₀/2)(x̂+ẑ),  a₃ = (a₀/2)(x̂+ŷ)

Non-destructive read
--------------------
Real NV-center readout uses spin-selective photoluminescence: optical pumping
with 532 nm laser causes ms=0 to emit ~10⁶ photons/s while ms=±1 emits ~30 %
less — no spin flip required.  This module simulates that non-destructive
character: read_atomic_lattice() never alters spin states.

Write / align
-------------
align_spin_state() writes spin orientations in the local lattice region
corresponding to the next transaction slot, advancing the write pointer.
The operation is append-only: once written, a spin orientation cannot be
changed without a detectable parity-check failure.

Dependencies
------------
    numpy >= 1.26  (3D vector arithmetic)
"""
from __future__ import annotations

import hashlib
import struct
import time
from dataclasses import dataclass, field
from enum import IntEnum
from typing import Any, Final

import numpy as np

__all__ = [
    "A0",
    "NV_CENTERS_PER_ENTRY",
    "SpinState",
    "LatticeCoordinate",
    "NVCenter",
    "LedgerEntry",
    "AtomicCrystallineLedger",
    "LatticeIntegrityError",
]

# ── Physical constants ─────────────────────────────────────────────────────────

A0: Final[float] = 3.567e-10          # m  — diamond lattice constant
NN_DISTANCE: Final[float] = A0 * (3 ** 0.5) / 4   # m  — nearest-neighbour C–C bond ≈ 1.545 Å
NV_ZFS_HZ: Final[float] = 2.87e9     # Hz — zero-field splitting between ms=0 and ms=±1
NV_T1_S: Final[float] = 1e-3         # s  — longitudinal spin relaxation time at 300 K
NV_T2_S: Final[float] = 1e-6         # s  — transverse coherence time at 300 K

# Primitive lattice vectors (metres, Cartesian xyz)
_A1: Final[np.ndarray] = (A0 / 2) * np.array([0.0, 1.0, 1.0])
_A2: Final[np.ndarray] = (A0 / 2) * np.array([1.0, 0.0, 1.0])
_A3: Final[np.ndarray] = (A0 / 2) * np.array([1.0, 1.0, 0.0])
_BASIS_OFFSET: Final[np.ndarray] = (A0 / 4) * np.array([1.0, 1.0, 1.0])

# ── Layout constants ──────────────────────────────────────────────────────────

PAYLOAD_BITS: Final[int] = 256   # SHA-256 hash bits
PARITY_CENTERS: Final[int] = 32    # one parity trit per 8 payload bits
INDEX_BITS: Final[int] = 64    # ledger index (uint64)
TIMESTAMP_BITS: Final[int] = 64    # timestamp_ns (uint64)
NV_CENTERS_PER_ENTRY: Final[int] = PAYLOAD_BITS + PARITY_CENTERS + INDEX_BITS + TIMESTAMP_BITS
# = 256 + 32 + 64 + 64 = 416 NV centers per ledger entry

_MAX_LEDGER_ENTRIES: Final[int] = 2 ** 20   # 1 M transactions per crystal shard


# ── Spin-state enumeration ────────────────────────────────────────────────────


class SpinState(IntEnum):
    """NV-center ground-state spin projections."""
    MINUS_ONE = -1   # ms = −1 — parity sentinel
    ZERO = 0   # ms =  0 — logical bit-0 / symbol-0
    PLUS_ONE = 1   # ms = +1 — logical bit-1 / symbol-1


# ── Lattice address types ─────────────────────────────────────────────────────


@dataclass(frozen=True)
class LatticeCoordinate:
    """
    Integer unit-cell address within the diamond cubic lattice.

    Physical position in metres:
        r = i·a₁ + j·a₂ + k·a₃ + (basis == 1) * basis_offset
    """
    i: int    # index along a₁ direction (ŷ+ẑ)
    j: int    # index along a₂ direction (x̂+ẑ)
    k: int    # index along a₃ direction (x̂+ŷ)
    b: int    # basis index: 0 = corner atom (A site), 1 = tetrahedral atom (B site)

    def __post_init__(self) -> None:
        if self.b not in (0, 1):
            raise ValueError(f"Basis index must be 0 or 1, got {self.b}")

    def physical_position_m(self) -> np.ndarray:
        """Return the Cartesian (x, y, z) position in metres."""
        pos = self.i * _A1 + self.j * _A2 + self.k * _A3
        if self.b == 1:
            pos = pos + _BASIS_OFFSET
        return pos

    def nearest_neighbour(self) -> LatticeCoordinate:
        """
        Return the nearest-neighbour site (the vacancy site of this NV center).

        In the diamond lattice the nearest neighbour of an A-site (b=0) is the
        B-site in the same unit cell.  The nearest neighbour of a B-site (b=1)
        is the A-site at (i+1, j+1, k+1).
        """
        if self.b == 0:
            return LatticeCoordinate(self.i, self.j, self.k, 1)
        return LatticeCoordinate(self.i + 1, self.j + 1, self.k + 1, 0)


@dataclass(frozen=True)
class NVCenter:
    """A single nitrogen-vacancy center at a specific diamond lattice site."""
    nitrogen_site: LatticeCoordinate   # N atom occupies this A-site
    vacancy_site: LatticeCoordinate   # adjacent vacancy (nearest neighbour)
    spin: SpinState

    @classmethod
    def create_at(cls, coord: LatticeCoordinate, spin: SpinState) -> NVCenter:
        """Construct an NV center with nitrogen at *coord* and vacancy at the NN site."""
        return cls(
            nitrogen_site=coord,
            vacancy_site=coord.nearest_neighbour(),
            spin=spin,
        )

    def physical_separation_m(self) -> float:
        """Return the physical N–V distance in metres (should equal NN_DISTANCE)."""
        delta = (
            self.nitrogen_site.physical_position_m()
            - self.vacancy_site.physical_position_m()
        )
        return float(np.linalg.norm(delta))


# ── Ledger entry ──────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class LedgerEntry:
    """
    One immutable transaction record encoded into NV-center spin orientations.

    Fields
    ------
    ledger_index  : sequential entry number (uint64)
    payload_sha256: SHA-256 digest of the transaction payload (hex string, 64 chars)
    timestamp_ns  : Unix timestamp in nanoseconds when the entry was written
    prev_root_sha256: SHA-256 of the previous entry's payload (chain link)
    centers       : all NV_CENTERS_PER_ENTRY NV centers encoding this record
    """
    ledger_index: int
    payload_sha256: str
    timestamp_ns: int
    prev_root_sha256: str
    centers: tuple[NVCenter, ...]

    def __post_init__(self) -> None:
        if len(self.centers) != NV_CENTERS_PER_ENTRY:
            raise ValueError(
                f"Expected {NV_CENTERS_PER_ENTRY} NV centers, got {len(self.centers)}"
            )
        if len(self.payload_sha256) != 64:
            raise ValueError("payload_sha256 must be a 64-character hex string")

    def chain_digest(self) -> str:
        """
        Compute the cryptographic chain link for this entry.

        SHA-256(ledger_index || payload_sha256 || prev_root_sha256 || timestamp_ns)
        """
        raw = struct.pack(">Q", self.ledger_index)
        raw += self.payload_sha256.encode("ascii")
        raw += self.prev_root_sha256.encode("ascii")
        raw += struct.pack(">Q", self.timestamp_ns)
        return hashlib.sha256(raw).hexdigest()


# ── Encoding / decoding helpers ───────────────────────────────────────────────


def _int_to_spin_array(value: int, n_bits: int) -> list[SpinState]:
    """Encode *value* as big-endian binary into a list of SpinState (ZERO=0, PLUS_ONE=1)."""
    spins: list[SpinState] = []
    for shift in range(n_bits - 1, -1, -1):
        bit = (value >> shift) & 1
        spins.append(SpinState.PLUS_ONE if bit else SpinState.ZERO)
    return spins


def _spin_array_to_int(spins: list[SpinState]) -> int:
    """Decode a binary spin array (ZERO=0, PLUS_ONE=1) into an integer."""
    result = 0
    for spin in spins:
        bit = 1 if spin == SpinState.PLUS_ONE else 0
        result = (result << 1) | bit
    return result


def _compute_parity(payload_spins: list[SpinState]) -> list[SpinState]:
    """
    Compute 32 parity tritrits for 256 payload spins.

    One MINUS_ONE parity center is inserted after every 8 payload spins.
    The parity rule: if the preceding 8 spins have an odd number of PLUS_ONE,
    write SpinState.MINUS_ONE; otherwise write SpinState.ZERO.

    This allows single-spin-flip detection per byte during reads.
    """
    parity: list[SpinState] = []
    for block in range(32):
        chunk = payload_spins[block * 8:(block + 1) * 8]
        n_ones = sum(1 for s in chunk if s == SpinState.PLUS_ONE)
        parity.append(SpinState.MINUS_ONE if n_ones % 2 == 1 else SpinState.ZERO)
    return parity


def _verify_parity(payload_spins: list[SpinState], parity_spins: list[SpinState]) -> bool:
    """Return True if all 32 parity checks pass (no single-spin corruption detected)."""
    expected = _compute_parity(payload_spins)
    return expected == parity_spins


def _encode_entry_to_spins(
    payload_sha256: str, ledger_index: int, timestamp_ns: int
) -> list[SpinState]:
    """
    Encode a ledger entry into a flat list of NV_CENTERS_PER_ENTRY spin states.

    Layout:
        [0:256]   payload spins (256 bits of SHA-256 hash)
        [256:288] parity tritrits (32 parity centers)
        [288:352] ledger_index spins (64 bits)
        [352:416] timestamp_ns spins (64 bits)
    """
    digest_int = int(payload_sha256, 16)
    payload_spins = _int_to_spin_array(digest_int, PAYLOAD_BITS)
    parity_spins = _compute_parity(payload_spins)
    index_spins = _int_to_spin_array(ledger_index, INDEX_BITS)
    ts_spins = _int_to_spin_array(timestamp_ns, TIMESTAMP_BITS)
    return payload_spins + parity_spins + index_spins + ts_spins


def _decode_entry_spins(spins: list[SpinState]) -> tuple[str, int, int, bool]:
    """
    Decode a flat spin list back into (payload_sha256, ledger_index, timestamp_ns, parity_ok).

    Raises ValueError if the spin list has unexpected length.
    """
    if len(spins) != NV_CENTERS_PER_ENTRY:
        raise ValueError(
            f"Expected {NV_CENTERS_PER_ENTRY} spins, got {len(spins)}"
        )
    payload_spins = spins[:PAYLOAD_BITS]
    parity_spins = spins[PAYLOAD_BITS:PAYLOAD_BITS + PARITY_CENTERS]
    index_spins = spins[PAYLOAD_BITS + PARITY_CENTERS:
                        PAYLOAD_BITS + PARITY_CENTERS + INDEX_BITS]
    ts_spins = spins[PAYLOAD_BITS + PARITY_CENTERS + INDEX_BITS:]

    digest_int = _spin_array_to_int(list(payload_spins))
    payload_sha256 = format(digest_int, "064x")
    ledger_index = _spin_array_to_int(list(index_spins))
    timestamp_ns = _spin_array_to_int(list(ts_spins))
    parity_ok = _verify_parity(list(payload_spins), list(parity_spins))
    return payload_sha256, ledger_index, timestamp_ns, parity_ok


# ── Atomic crystalline ledger ─────────────────────────────────────────────────


class LatticeIntegrityError(RuntimeError):
    """Raised when a parity check detects spin corruption in the lattice."""


@dataclass
class AtomicCrystallineLedger:
    """
    Append-only ledger backed by a simulated diamond NV-center crystalline lattice.

    Physical addressing
    -------------------
    Entries are laid out along the k-axis (a₃ direction) of the diamond lattice.
    Entry n occupies NV centers at unit cells:
        (0, 0, n * NV_CENTERS_PER_ENTRY + c, 0)   for c in range(NV_CENTERS_PER_ENTRY)

    This linear arrangement is physically realistic for a long thin diamond
    whisker grown along the [110] crystallographic direction.

    Immutability guarantee
    ----------------------
    Once written, a spin state is stored in _lattice (dict[LatticeCoordinate, SpinState]).
    Attempts to overwrite an existing coordinate raise LatticeIntegrityError.
    The chain digest links each entry to its predecessor, making retroactive
    alteration detectable via chain_digest() recomputation.

    Non-destructive reads
    ---------------------
    read_atomic_lattice() reconstructs the entry entirely from stored spin states
    without altering any spin values (simulating NV photoluminescence readout).
    """

    genesis_payload_sha256: str

    _lattice: dict[LatticeCoordinate, SpinState] = field(default_factory=dict, init=False)
    _entries: list[LedgerEntry] = field(default_factory=list, init=False)
    _write_ptr: int = field(default=0, init=False)

    def __post_init__(self) -> None:
        if len(self.genesis_payload_sha256) != 64:
            raise ValueError("genesis_payload_sha256 must be 64 hex characters")
        genesis_ts = time.time_ns()
        genesis_entry = self._build_entry(
            ledger_index=0,
            payload_sha256=self.genesis_payload_sha256,
            timestamp_ns=genesis_ts,
            prev_root_sha256="0" * 64,
        )
        self._commit_entry(genesis_entry)

    # ── Public interface ──────────────────────────────────────────────────────

    def align_spin_state(
        self,
        payload: bytes,
        metadata: dict[str, Any] | None = None,
    ) -> LedgerEntry:
        """
        Append a transaction by aligning NV-center spin states in the crystal.

        Computes SHA-256(payload || metadata_canonical), encodes into
        NV_CENTERS_PER_ENTRY spin states, and writes them to the next
        available lattice positions.  The previous chain root links the new
        entry to its predecessor.

        Returns:
            The newly created and committed LedgerEntry.

        Raises:
            LatticeIntegrityError: if any target coordinate is already occupied.
        """
        if self._write_ptr >= _MAX_LEDGER_ENTRIES:
            raise LatticeIntegrityError(
                f"Crystal shard exhausted: maximum {_MAX_LEDGER_ENTRIES} entries reached"
            )
        meta_bytes = (
            str(sorted(metadata.items())).encode("utf-8") if metadata else b""
        )
        digest_raw = hashlib.sha256(payload + meta_bytes).digest()
        payload_hex = digest_raw.hex()
        timestamp_ns = time.time_ns()
        ledger_index = len(self._entries)
        prev_root = self._entries[-1].chain_digest() if self._entries else "0" * 64

        entry = self._build_entry(
            ledger_index=ledger_index,
            payload_sha256=payload_hex,
            timestamp_ns=timestamp_ns,
            prev_root_sha256=prev_root,
        )
        self._commit_entry(entry)
        return entry

    def read_atomic_lattice(self, ledger_index: int) -> bytes:
        """
        Non-destructive read of ledger entry *ledger_index*.

        Reconstructs the transaction payload hash from NV-center spin states
        stored in the lattice, verifies parity, and returns the 32-byte
        SHA-256 digest bytes.

        Raises:
            IndexError:              if ledger_index is out of range.
            LatticeIntegrityError:   if parity check fails (spin corruption detected).
        """
        if ledger_index >= len(self._entries):
            raise IndexError(
                f"Ledger index {ledger_index} out of range (total: {len(self._entries)})"
            )
        entry = self._entries[ledger_index]
        coords = self._entry_coordinates(ledger_index)
        spin_values = [self._lattice[c] for c in coords]

        payload_sha256, read_index, _ts, parity_ok = _decode_entry_spins(spin_values)

        if not parity_ok:
            raise LatticeIntegrityError(
                f"Parity check failed for ledger entry {ledger_index}: "
                "single or multiple spin-flip detected in diamond lattice"
            )
        if read_index != ledger_index:
            raise LatticeIntegrityError(
                f"Index mismatch: lattice encodes {read_index}, expected {ledger_index}"
            )
        if payload_sha256 != entry.payload_sha256:
            raise LatticeIntegrityError(
                f"Payload hash mismatch for entry {ledger_index}: "
                f"lattice={payload_sha256[:16]}… stored={entry.payload_sha256[:16]}…"
            )
        return bytes.fromhex(payload_sha256)

    def verify_chain_integrity(self) -> bool:
        """
        Verify the full chain of ledger entries by recomputing all chain digests.

        Returns True if every entry's prev_root_sha256 matches the predecessor's
        chain_digest(), proving that no entry has been retroactively altered.
        """
        if not self._entries:
            return True
        if self._entries[0].prev_root_sha256 != "0" * 64:
            return False
        for i in range(1, len(self._entries)):
            expected_prev = self._entries[i - 1].chain_digest()
            if self._entries[i].prev_root_sha256 != expected_prev:
                return False
        return True

    def verify_lattice_parity(self) -> list[int]:
        """
        Run parity checks on every stored entry.

        Returns a list of ledger indices where parity fails.  An empty list
        means the crystalline lattice is fully intact.
        """
        corrupted: list[int] = []
        for idx in range(len(self._entries)):
            coords = self._entry_coordinates(idx)
            spin_vals = [self._lattice[c] for c in coords]
            *_, parity = _decode_entry_spins(spin_vals)
            if not parity:
                corrupted.append(idx)
        return corrupted

    def lattice_occupancy(self) -> int:
        """Return the number of NV centers currently carrying spin data."""
        return len(self._lattice)

    def physical_volume_m3(self) -> float:
        """
        Estimate the physical crystal volume occupied by written entries.

        Approximates the lattice region as a rectangular prism of unit cells:
            width ≈ a₀  (single-cell width in x and y)
            length ≈ n_entries * NV_CENTERS_PER_ENTRY * a₀  (along k-axis)
        Volume = width² × length.
        """
        n_cells = len(self._entries) * NV_CENTERS_PER_ENTRY
        return float(A0 ** 2 * n_cells * A0)

    @property
    def entry_count(self) -> int:
        return len(self._entries)

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _entry_coordinates(self, ledger_index: int) -> list[LatticeCoordinate]:
        """Generate the ordered list of LatticeCoordinates for entry *ledger_index*."""
        base_k = ledger_index * NV_CENTERS_PER_ENTRY
        return [
            LatticeCoordinate(0, 0, base_k + c, 0)
            for c in range(NV_CENTERS_PER_ENTRY)
        ]

    def _build_entry(
        self,
        ledger_index: int,
        payload_sha256: str,
        timestamp_ns: int,
        prev_root_sha256: str,
    ) -> LedgerEntry:
        """Construct a LedgerEntry by encoding fields into NV-center spin states."""
        spin_list = _encode_entry_to_spins(payload_sha256, ledger_index, timestamp_ns)
        coords = self._entry_coordinates(ledger_index)
        nv_centers = tuple(
            NVCenter.create_at(coord, spin)
            for coord, spin in zip(coords, spin_list)
        )
        return LedgerEntry(
            ledger_index=ledger_index,
            payload_sha256=payload_sha256,
            timestamp_ns=timestamp_ns,
            prev_root_sha256=prev_root_sha256,
            centers=nv_centers,
        )

    def _commit_entry(self, entry: LedgerEntry) -> None:
        """Write NV-center spin states to the lattice dict and append the entry record."""
        for nv in entry.centers:
            coord = nv.nitrogen_site
            if coord in self._lattice:
                raise LatticeIntegrityError(
                    f"Attempted overwrite of already-occupied lattice site {coord}"
                )
            self._lattice[coord] = nv.spin
        self._entries.append(entry)
        self._write_ptr = len(self._entries)
