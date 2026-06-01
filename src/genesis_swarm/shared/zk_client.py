"""
ZK Worker Client — Python ↔ Rust Groth16 Prover Bridge

Connects to the zk-worker sidecar (sovereign-engine/src/zk_worker.rs) via a
Unix domain socket and requests BN254 Groth16 compliance proofs.

Protocol (framed, little-endian length prefix):
    Request : [4-byte LE len][JSON: ProveRequest]
    Response: [4-byte LE len][JSON: ProveResponse] or [0,0,0,0] on error

Build the prover:
    cd sovereign-engine
    cargo build --release --bin zk-worker --features real-zk-proofs

Run the prover:
    GENESIS_ZK_SOCKET=/tmp/genesis_zk.sock ./target/release/zk-worker

Environment variables:
    GENESIS_ZK_SOCKET   Unix socket path (default /tmp/genesis_zk.sock)
    GENESIS_ZK_TIMEOUT  Connection + read timeout in seconds (default 10.0)
"""

from __future__ import annotations

import json
import logging
import os
import socket
import struct
import threading
import time
from dataclasses import dataclass
from typing import Optional

log = logging.getLogger(__name__)

_SOCKET_PATH: str = os.environ.get("GENESIS_ZK_SOCKET", "/tmp/genesis_zk.sock")
_TIMEOUT_S: float = float(os.environ.get("GENESIS_ZK_TIMEOUT", "10.0"))
_MAX_RESPONSE_BYTES: int = 65_536


@dataclass(frozen=True)
class ZkProofResult:
    sequence: int
    proof_hex: str        # 256 hex chars = 128-byte BN254 Groth16 proof
    proof_bytes: bytes    # raw 128 bytes
    latency_ms: int
    via_real_prover: bool = True


@dataclass(frozen=True)
class ZkProveRequest:
    sequence: int
    actual_gross_bp: int
    actual_net_bp: int
    actual_concentration_bp: int


class ZkWorkerClient:
    """
    Thread-safe client for the genesis zk-worker sidecar.

    Maintains a persistent Unix socket connection.  On failure, marks the
    worker unavailable and attempts reconnection on the next call.
    """

    def __init__(
        self,
        socket_path: str = _SOCKET_PATH,
        timeout: float = _TIMEOUT_S,
    ) -> None:
        self._socket_path = socket_path
        self._timeout = timeout
        self._lock = threading.Lock()
        self._sock: Optional[socket.socket] = None
        self._sequence: int = 0
        self._available: bool = True
        self._last_error_ts: float = 0.0
        self._retry_interval: float = 5.0

    # ── Public API ────────────────────────────────────────────────────────────

    def available(self) -> bool:
        """Return True if the zk-worker socket is reachable."""
        if not self._available:
            if time.monotonic() - self._last_error_ts > self._retry_interval:
                self._available = True  # allow one retry
        return self._available and os.path.exists(self._socket_path)

    def prove(
        self,
        gross_bp: int,
        net_bp: int,
        concentration_bp: int,
    ) -> Optional[ZkProofResult]:
        """
        Request a BN254 Groth16 compliance proof from the sidecar.

        Returns None if the worker is unavailable or returns an error.
        Latency: ~250–400 ms for a real Groth16 proof on commodity hardware.
        """
        if not self.available():
            return None

        with self._lock:
            self._sequence += 1
            seq = self._sequence
            req = ZkProveRequest(
                sequence=seq,
                actual_gross_bp=gross_bp,
                actual_net_bp=net_bp,
                actual_concentration_bp=concentration_bp,
            )
            return self._send_receive(req)

    def close(self) -> None:
        with self._lock:
            self._disconnect()

    # ── Internal ──────────────────────────────────────────────────────────────

    def _connect(self) -> None:
        if self._sock is not None:
            return
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(self._timeout)
        sock.connect(self._socket_path)
        self._sock = sock
        log.info("[zk_client] Connected to zk-worker at %s", self._socket_path)

    def _disconnect(self) -> None:
        if self._sock is not None:
            try:
                self._sock.close()
            except OSError:
                pass
            self._sock = None

    def _send_receive(self, req: ZkProveRequest) -> Optional[ZkProofResult]:
        payload = json.dumps({
            "sequence": req.sequence,
            "actual_gross_bp": req.actual_gross_bp,
            "actual_net_bp": req.actual_net_bp,
            "actual_concentration_bp": req.actual_concentration_bp,
        }).encode()

        try:
            self._connect()
            assert self._sock is not None

            # Send framed request: [4-byte LE len][JSON]
            self._sock.sendall(struct.pack("<I", len(payload)))
            self._sock.sendall(payload)

            # Read framed response: [4-byte LE len][JSON]
            len_bytes = self._recv_exact(4)
            resp_len = struct.unpack("<I", len_bytes)[0]
            if resp_len == 0:
                log.warning("[zk_client] zk-worker returned error for seq=%d", req.sequence)
                return None
            if resp_len > _MAX_RESPONSE_BYTES:
                raise ValueError(f"Response length {resp_len} exceeds maximum")

            resp_bytes = self._recv_exact(resp_len)
            resp = json.loads(resp_bytes)

            proof_hex: str = resp["proof_hex"]
            proof_bytes = bytes.fromhex(proof_hex)
            if len(proof_bytes) != 128:
                raise ValueError(f"Expected 128-byte proof, got {len(proof_bytes)}")

            result = ZkProofResult(
                sequence=resp["sequence"],
                proof_hex=proof_hex,
                proof_bytes=proof_bytes,
                latency_ms=resp.get("latency_ms", 0),
                via_real_prover=True,
            )
            log.debug(
                "[zk_client] Proof received seq=%d latency=%dms",
                result.sequence,
                result.latency_ms,
            )
            return result

        except (OSError, ConnectionRefusedError, FileNotFoundError) as exc:
            log.warning("[zk_client] Connection error: %s — marking worker unavailable", exc)
            self._disconnect()
            self._available = False
            self._last_error_ts = time.monotonic()
            return None
        except (ValueError, KeyError, json.JSONDecodeError) as exc:
            log.error("[zk_client] Protocol error: %s", exc)
            self._disconnect()
            return None

    def _recv_exact(self, n: int) -> bytes:
        assert self._sock is not None
        buf = bytearray()
        while len(buf) < n:
            chunk = self._sock.recv(n - len(buf))
            if not chunk:
                raise ConnectionError("Socket closed mid-read")
            buf.extend(chunk)
        return bytes(buf)


# ── Module-level singleton ────────────────────────────────────────────────────

_client: Optional[ZkWorkerClient] = None
_client_lock = threading.Lock()


def _get_client() -> ZkWorkerClient:
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                _client = ZkWorkerClient()
    return _client


def zk_worker_available() -> bool:
    """Return True if the zk-worker sidecar is reachable on its socket."""
    return _get_client().available()


def prove_compliance(
    gross_bp: int,
    net_bp: int,
    concentration_bp: int,
) -> Optional[ZkProofResult]:
    """
    Request a real BN254 Groth16 compliance proof.

    Returns None if the worker is not running (fallback to stub path).
    ~250–400 ms when live; call from a background thread for non-blocking use.
    """
    return _get_client().prove(gross_bp, net_bp, concentration_bp)
