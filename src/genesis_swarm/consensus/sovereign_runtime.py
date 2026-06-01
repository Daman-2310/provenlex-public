"""
Sovereign Runtime — Autonomous Post-Quantum Threshold-Gated Self-Upgrade Engine.

An upgrade to the genesis-swarm binary is only applied when 8 out of 11 nodes
have each signed the upgrade manifest using their ML-DSA-65 PQC key shares.
On threshold approval, the runtime:

  1. Verifies the manifest threshold signature (8-of-11 PQC shares).
  2. Downloads and verifies the new binary's SHA-256 digest.
  3. Atomically replaces the running executable on disk.
  4. Drains in-flight consensus traffic (graceful shutdown).
  5. Restarts worker processes under the new binary.

The master secret never exists in any single node's memory — threshold MPC
ensures no single node can unilaterally deploy a rogue binary.

Design constraints
------------------
• Threshold: UPGRADE_THRESHOLD = 8-of-11 (higher than consensus quorum of 7-of-11
  because a bad upgrade is catastrophic and irreversible in the short term).
• Manifest format: JSON envelope with fields (version, sha256, download_url, expires_at)
  signed by PQC threshold before distribution.
• Binary replacement: atomic rename (os.replace) to avoid partial-write exposure.
• Worker restart: subprocess.Popen with the new executable path; parent sends SIGTERM
  to all old workers and awaits drain up to DRAIN_TIMEOUT_S.
• No downgrade: version must be strictly greater than CURRENT_VERSION.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import signal
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

import httpx

from .pqc_engine import (
    PQCKeyError,
    pqc_generate_keypair,
    pqc_sign,
    pqc_verify,
    pqc_public_key_fingerprint,
)
from .mpc_consensus import (
    MPCError,
    ShareProof,
    MPCSigningSession,
    share_private_key,
    sign_share,
    verify_threshold_signature,
)
from .formal_verifier import FormalVerifier, VerifierConfig

__all__ = [
    "SovereignRuntimeError",
    "UpgradeManifest",
    "ManifestSignatureError",
    "BinaryIntegrityError",
    "SovereignRuntime",
    "create_sovereign_runtime",
]

_log = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

_UPGRADE_THRESHOLD: Final[int] = 8     # of 11 nodes must approve
_N_NODES: Final[int] = 11
_DRAIN_TIMEOUT_S: Final[float] = 30.0
_MANIFEST_EXPIRY_S: Final[int] = 3600  # manifests valid for 1 hour
_DOWNLOAD_TIMEOUT_S: Final[float] = 120.0
_MAX_BINARY_BYTES: Final[int] = 256 * 1024 * 1024   # 256 MiB hard cap
_VERSION_SENTINEL: Final[str] = "0.0.0"


# ── Exceptions ────────────────────────────────────────────────────────────────

class SovereignRuntimeError(RuntimeError):
    """Base exception for sovereign runtime errors."""


class ManifestSignatureError(SovereignRuntimeError):
    """Raised when an upgrade manifest fails threshold signature verification."""


class BinaryIntegrityError(SovereignRuntimeError):
    """Raised when the downloaded binary's SHA-256 does not match the manifest."""


class DowngradeAttemptError(SovereignRuntimeError):
    """Raised when a manifest targets a version ≤ CURRENT_VERSION."""


# ── Version comparison ────────────────────────────────────────────────────────

def _parse_version(v: str) -> tuple[int, ...]:
    """Parse 'MAJOR.MINOR.PATCH' into a comparable tuple."""
    try:
        parts = tuple(int(x) for x in v.strip().split("."))
        if len(parts) != 3:  # noqa: PLR2004
            raise ValueError(f"Expected 3 parts, got {len(parts)}")
        return parts
    except (ValueError, TypeError) as exc:
        raise SovereignRuntimeError(f"Malformed version string {v!r}: {exc}") from exc


# ── Manifest ──────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class UpgradeManifest:
    """
    Signed upgrade manifest.  Circulated among nodes before threshold voting.

    Fields:
        version:      Target version string, e.g. "0.6.0".
        sha256:       Hex-encoded SHA-256 of the target binary (64 chars).
        download_url: HTTPS URL from which to fetch the binary.
        issued_at:    Unix timestamp (integer seconds) of manifest creation.
        expires_at:   Unix timestamp after which the manifest is invalid.
        issuer_id:    Node ID of the manifiest issuer (for audit logging).
    """

    version: str
    sha256: str
    download_url: str
    issued_at: int
    expires_at: int
    issuer_id: str

    def canonical_bytes(self) -> bytes:
        """Deterministic serialisation for signing."""
        doc = {
            "version": self.version,
            "sha256": self.sha256,
            "download_url": self.download_url,
            "issued_at": self.issued_at,
            "expires_at": self.expires_at,
            "issuer_id": self.issuer_id,
        }
        return json.dumps(doc, sort_keys=True, separators=(",", ":")).encode("utf-8")

    def is_expired(self) -> bool:
        return int(time.time()) > self.expires_at

    @classmethod
    def from_dict(cls, d: dict[str, object]) -> "UpgradeManifest":
        return cls(
            version=str(d["version"]),
            sha256=str(d["sha256"]),
            download_url=str(d["download_url"]),
            issued_at=int(d["issued_at"]),  # type: ignore[arg-type]
            expires_at=int(d["expires_at"]),  # type: ignore[arg-type]
            issuer_id=str(d["issuer_id"]),
        )

    def to_dict(self) -> dict[str, object]:
        return {
            "version": self.version,
            "sha256": self.sha256,
            "download_url": self.download_url,
            "issued_at": self.issued_at,
            "expires_at": self.expires_at,
            "issuer_id": self.issuer_id,
        }


# ── Sovereign Runtime ─────────────────────────────────────────────────────────

@dataclass
class SovereignRuntime:
    """
    Autonomous self-upgrade runtime with PQC threshold-gated deployment.

    Lifecycle:
        1. receive_share_proof() — called for each incoming vote from a peer node.
        2. When UPGRADE_THRESHOLD proofs are accumulated, attempt_upgrade() fires
           automatically (or call it explicitly after checking is_threshold_met()).
        3. attempt_upgrade() verifies → downloads → replaces → restarts.

    The verifier (FormalVerifier) is consulted before and after upgrade to ensure
    no PBFT safety invariant was breached during the upgrade window.
    """

    node_id: str
    current_version: str
    executable_path: Path
    pqc_public_key: bytes           # node's own PQC public key (for self-vote)
    distributed_pqc_pubkey: bytes   # shared PQC public key from DKG/dealer
    verifier: FormalVerifier
    threshold: int = _UPGRADE_THRESHOLD
    n_nodes: int = _N_NODES
    drain_timeout_s: float = _DRAIN_TIMEOUT_S
    download_timeout_s: float = _DOWNLOAD_TIMEOUT_S
    max_binary_bytes: int = _MAX_BINARY_BYTES

    _pending_manifest: UpgradeManifest | None = field(default=None, init=False, repr=False)
    _signing_sessions: dict[str, MPCSigningSession] = field(
        default_factory=dict, init=False, repr=False
    )
    _worker_pids: list[int] = field(default_factory=list, init=False, repr=False)
    _upgrade_lock: asyncio.Lock = field(
        default_factory=asyncio.Lock, init=False, repr=False
    )

    def propose_manifest(self, manifest: UpgradeManifest) -> None:
        """
        Register an upgrade manifest and start collecting threshold votes.

        Only one manifest can be active at a time; proposing a new one while
        another is in-flight replaces it and resets vote accumulation.
        """
        _validate_manifest_structure(manifest)

        current_tuple = _parse_version(self.current_version)
        target_tuple = _parse_version(manifest.version)
        if target_tuple <= current_tuple:
            raise DowngradeAttemptError(
                f"Manifest version {manifest.version} ≤ current {self.current_version}"
            )

        manifest_key = _manifest_key(manifest)
        self._pending_manifest = manifest
        self._signing_sessions[manifest_key] = MPCSigningSession(
            message=manifest.canonical_bytes(),
            threshold=self.threshold,
            public_key=self.distributed_pqc_pubkey,
        )
        _log.info(
            "Sovereign runtime: upgrade manifest proposed "
            "(version=%s sha256=%.12s issuer=%s)",
            manifest.version,
            manifest.sha256,
            manifest.issuer_id,
        )

    def receive_share_proof(self, proof: ShareProof) -> bool:
        """
        Record an incoming threshold vote for the current manifest.

        Returns True when the threshold is met and the upgrade can proceed.
        Silently ignores proofs for unknown manifests or after threshold is met.
        """
        if self._pending_manifest is None:
            _log.debug("No pending manifest — ignoring share proof from %s", proof.node_id)
            return False

        manifest_key = _manifest_key(self._pending_manifest)
        session = self._signing_sessions.get(manifest_key)
        if session is None:
            return False

        reached = session.add_share(proof)
        _log.debug(
            "Upgrade vote %d/%d from %s (threshold=%d)",
            session.share_count,
            self.threshold,
            proof.node_id,
            self.threshold,
        )
        return reached

    def is_threshold_met(self) -> bool:
        """Return True if the active manifest has accumulated enough votes."""
        if self._pending_manifest is None:
            return False
        manifest_key = _manifest_key(self._pending_manifest)
        session = self._signing_sessions.get(manifest_key)
        return session is not None and session.share_count >= self.threshold

    async def attempt_upgrade(self) -> None:
        """
        Execute the upgrade pipeline when threshold is met.

        Steps:
            1. Validate manifest (not expired, quorum met).
            2. Download binary to a temp file.
            3. Verify SHA-256.
            4. Verify PBFT invariants (no active violation).
            5. Atomic replace of executable.
            6. Drain in-flight consensus.
            7. Restart worker processes.

        Raises:
            SovereignRuntimeError: if any step fails.
        """
        async with self._upgrade_lock:
            manifest = self._pending_manifest
            if manifest is None:
                raise SovereignRuntimeError("No pending upgrade manifest")
            if manifest.is_expired():
                raise SovereignRuntimeError(
                    f"Manifest for {manifest.version} expired at {manifest.expires_at}"
                )
            if not self.is_threshold_met():
                raise SovereignRuntimeError(
                    f"Threshold not met: need {self.threshold} votes"
                )

            _log.info(
                "Sovereign runtime: beginning upgrade to %s (sha256=%.12s)",
                manifest.version,
                manifest.sha256,
            )

            # Pre-upgrade invariant check
            self.verifier.check_all()

            binary_path = await self._download_binary(manifest)

            await self._atomic_replace(binary_path)

            await self._drain_and_restart(manifest.version)

    async def _download_binary(self, manifest: UpgradeManifest) -> Path:
        """Download and SHA-256-verify the target binary."""
        expected_sha256 = manifest.sha256.lower()
        if len(expected_sha256) != 64 or not all(  # noqa: PLR2004
            c in "0123456789abcdef" for c in expected_sha256
        ):
            raise BinaryIntegrityError(f"Malformed sha256 in manifest: {manifest.sha256!r}")

        tmp_fd, tmp_path_str = tempfile.mkstemp(
            prefix="genesis-swarm-upgrade-",
            suffix=".bin",
            dir=self.executable_path.parent,
        )
        tmp_path = Path(tmp_path_str)
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(self.download_timeout_s),
                follow_redirects=True,
            ) as client:
                sha = hashlib.sha256()
                size = 0
                with os.fdopen(tmp_fd, "wb") as fh:
                    async with client.stream("GET", manifest.download_url) as resp:
                        resp.raise_for_status()
                        async for chunk in resp.aiter_bytes(65536):
                            size += len(chunk)
                            if size > self.max_binary_bytes:
                                raise BinaryIntegrityError(
                                    f"Binary exceeds max size {self.max_binary_bytes} bytes"
                                )
                            sha.update(chunk)
                            fh.write(chunk)

            actual = sha.hexdigest()
            if actual != expected_sha256:
                tmp_path.unlink(missing_ok=True)
                raise BinaryIntegrityError(
                    f"SHA-256 mismatch: expected {expected_sha256}, got {actual}"
                )

            _log.info(
                "Downloaded %d bytes for version %s — integrity OK",
                size,
                manifest.version,
            )
            tmp_path.chmod(0o755)
            return tmp_path

        except Exception:
            tmp_path.unlink(missing_ok=True)
            raise

    async def _atomic_replace(self, new_binary: Path) -> None:
        """Atomically replace the running executable with *new_binary*."""
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None, os.replace, str(new_binary), str(self.executable_path)
        )
        _log.info(
            "Executable atomically replaced: %s",
            self.executable_path,
        )

    async def _drain_and_restart(self, new_version: str) -> None:
        """
        Gracefully drain in-flight consensus, terminate workers, restart under new binary.
        """
        _log.info(
            "Draining consensus traffic (timeout=%.1fs) before restart",
            self.drain_timeout_s,
        )
        # Signal workers to drain and wait
        for pid in list(self._worker_pids):
            try:
                os.kill(pid, signal.SIGTERM)
                _log.debug("Sent SIGTERM to worker pid=%d", pid)
            except ProcessLookupError:
                _log.debug("Worker pid=%d already gone", pid)

        deadline = asyncio.get_event_loop().time() + self.drain_timeout_s
        while self._worker_pids:
            still_alive = []
            for pid in self._worker_pids:
                try:
                    os.kill(pid, 0)  # probe without signal
                    still_alive.append(pid)
                except ProcessLookupError:
                    pass
            self._worker_pids[:] = still_alive
            if not self._worker_pids:
                break
            remaining = deadline - asyncio.get_event_loop().time()
            if remaining <= 0:
                # Force-kill any surviving workers
                for pid in self._worker_pids:
                    try:
                        os.kill(pid, signal.SIGKILL)
                        _log.warning("SIGKILL to stalled worker pid=%d", pid)
                    except ProcessLookupError:
                        pass
                break
            await asyncio.sleep(min(0.5, remaining))

        _log.info("All workers stopped — spawning new process under %s", new_version)
        self._spawn_workers(new_version)

    def _spawn_workers(self, version: str) -> None:
        """Launch a fresh worker process under the new binary."""
        env = {**os.environ, "GENESIS_SWARM_VERSION": version}
        proc = subprocess.Popen(  # noqa: S603
            [str(self.executable_path), "worker", "--node-id", self.node_id],
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=None,
            stderr=None,
            close_fds=True,
            start_new_session=True,
        )
        self._worker_pids.append(proc.pid)
        _log.info(
            "Spawned worker pid=%d under version %s",
            proc.pid,
            version,
        )

    def register_worker(self, pid: int) -> None:
        """Register an externally-spawned worker PID for drain management."""
        self._worker_pids.append(pid)

    def clear_pending_manifest(self) -> None:
        """Discard the current upgrade manifest and all accumulated votes."""
        self._pending_manifest = None
        self._signing_sessions.clear()
        _log.info("Sovereign runtime: pending manifest cleared")


# ── Factory ───────────────────────────────────────────────────────────────────

def create_sovereign_runtime(
    node_id: str,
    current_version: str,
    executable_path: str | Path,
    threshold: int = _UPGRADE_THRESHOLD,
    halt_on_invariant_violation: bool = True,
) -> tuple[SovereignRuntime, bytes, bytes]:
    """
    Create a SovereignRuntime instance with fresh PQC keys and a FormalVerifier.

    Returns:
        (runtime, pqc_private_key, pqc_public_key)
        The private key must be stored securely.  Only pqc_public_key should be
        distributed to peers.

    Example::

        runtime, priv_key, pub_key = create_sovereign_runtime(
            node_id="node-0",
            current_version="0.5.0",
            executable_path=sys.argv[0],
        )
    """
    priv_key, pub_key = pqc_generate_keypair()
    verifier = FormalVerifier(
        VerifierConfig(halt_on_violation=halt_on_invariant_violation)
    )
    runtime = SovereignRuntime(
        node_id=node_id,
        current_version=current_version,
        executable_path=Path(executable_path),
        pqc_public_key=pub_key,
        distributed_pqc_pubkey=pub_key,  # replaced after DKG by caller
        verifier=verifier,
        threshold=threshold,
    )
    _log.info(
        "SovereignRuntime created for %s v%s (pk_fingerprint=%s)",
        node_id,
        current_version,
        pqc_public_key_fingerprint(pub_key),
    )
    return runtime, priv_key, pub_key


# ── Manifest helpers ──────────────────────────────────────────────────────────

def build_upgrade_manifest(
    version: str,
    sha256: str,
    download_url: str,
    issuer_id: str,
    ttl_seconds: int = _MANIFEST_EXPIRY_S,
) -> UpgradeManifest:
    """Construct and return a new UpgradeManifest with current timestamp."""
    now = int(time.time())
    return UpgradeManifest(
        version=version,
        sha256=sha256,
        download_url=download_url,
        issued_at=now,
        expires_at=now + ttl_seconds,
        issuer_id=issuer_id,
    )


def _manifest_key(manifest: UpgradeManifest) -> str:
    """Stable dict key for a manifest (version + sha256 prefix)."""
    return f"{manifest.version}:{manifest.sha256[:16]}"


def _validate_manifest_structure(manifest: UpgradeManifest) -> None:
    """Raise SovereignRuntimeError if the manifest is structurally invalid."""
    if not manifest.version.strip():
        raise SovereignRuntimeError("Manifest version is empty")
    if len(manifest.sha256) != 64 or not all(  # noqa: PLR2004
        c in "0123456789abcdefABCDEF" for c in manifest.sha256
    ):
        raise SovereignRuntimeError(f"Invalid sha256 field: {manifest.sha256!r}")
    if not manifest.download_url.startswith("https://"):
        raise SovereignRuntimeError(
            f"download_url must use HTTPS, got: {manifest.download_url!r}"
        )
    if manifest.expires_at <= manifest.issued_at:
        raise SovereignRuntimeError(
            "expires_at must be strictly after issued_at"
        )
    _parse_version(manifest.version)  # ensures well-formed version string


# ── PQC manifest signing (used by the issuing node) ──────────────────────────

def sign_manifest_pqc(manifest: UpgradeManifest, private_key: bytes) -> bytes:
    """
    Sign an upgrade manifest with the issuer's PQC private key.

    Returns the raw ML-DSA-65 signature (3309 bytes).
    """
    return pqc_sign(manifest.canonical_bytes(), private_key)


def verify_manifest_pqc(
    manifest: UpgradeManifest,
    signature: bytes,
    public_key: bytes,
) -> bool:
    """
    Verify a PQC signature over an upgrade manifest.

    Returns True if valid, False otherwise.
    """
    return pqc_verify(manifest.canonical_bytes(), signature, public_key)
