"""Unit tests for the ZK worker client — framed Unix socket protocol."""
from __future__ import annotations

import json
import os
import socket
import struct
import tempfile
import threading
import time
import unittest

from genesis_swarm.shared.zk_client import (
    ZkWorkerClient,
    ZkProofResult,
    zk_worker_available,
    prove_compliance,
)


def _fake_proof() -> bytes:
    return bytes(range(128))


def _recv_exact(sock: socket.socket, n: int) -> bytes:
    buf = bytearray()
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("closed")
        buf.extend(chunk)
    return bytes(buf)


def _mock_server(sock_path: str, responses: list, ready: threading.Event, stop: threading.Event) -> None:
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(sock_path)
    server.listen(5)
    server.settimeout(0.5)
    ready.set()
    resp_iter = iter(responses)
    while not stop.is_set():
        try:
            conn, _ = server.accept()
        except socket.timeout:
            continue
        with conn:
            for resp in resp_iter:
                try:
                    lb = _recv_exact(conn, 4)
                    rlen = struct.unpack("<I", lb)[0]
                    _recv_exact(conn, rlen)
                    if resp is None:
                        conn.sendall(b"\x00\x00\x00\x00")
                    else:
                        pl = json.dumps(resp).encode()
                        conn.sendall(struct.pack("<I", len(pl)) + pl)
                except (OSError, ConnectionError):
                    pass
                break
    server.close()


def _start_server(responses: list) -> tuple[str, threading.Event]:
    path = tempfile.mktemp(suffix=".sock")
    stop = threading.Event()
    ready = threading.Event()
    t = threading.Thread(target=_mock_server, args=(path, responses, ready, stop), daemon=True)
    t.start()
    ready.wait(timeout=1.0)
    return path, stop


class TestZkWorkerClient(unittest.TestCase):

    def _cleanup(self, path: str, stop: threading.Event) -> None:
        stop.set()
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass

    def test_successful_prove(self):
        proof = _fake_proof()
        path, stop = _start_server([{"sequence": 1, "proof_hex": proof.hex(), "latency_ms": 312}])
        try:
            client = ZkWorkerClient(socket_path=path, timeout=2.0)
            r = client.prove(14500, 9000, 1800)
            self.assertIsNotNone(r)
            self.assertIsInstance(r, ZkProofResult)
            self.assertEqual(r.proof_bytes, proof)
            self.assertEqual(r.latency_ms, 312)
            self.assertTrue(r.via_real_prover)
        finally:
            self._cleanup(path, stop)

    def test_error_response_returns_none(self):
        path, stop = _start_server([None])
        try:
            client = ZkWorkerClient(socket_path=path, timeout=2.0)
            self.assertIsNone(client.prove(35000, 25000, 2500))
        finally:
            self._cleanup(path, stop)

    def test_missing_socket_returns_none(self):
        client = ZkWorkerClient(socket_path="/tmp/__no_genesis_sock_xyz.sock")
        self.assertFalse(client.available())
        self.assertIsNone(client.prove(14000, 9000, 1800))

    def test_short_proof_rejected(self):
        path, stop = _start_server([{"sequence": 1, "proof_hex": "deadbeef", "latency_ms": 1}])
        try:
            client = ZkWorkerClient(socket_path=path, timeout=2.0)
            self.assertIsNone(client.prove(14000, 9000, 1800))
        finally:
            self._cleanup(path, stop)

    def test_proof_result_is_frozen(self):
        r = ZkProofResult(sequence=1, proof_hex="aa" * 128, proof_bytes=bytes(128), latency_ms=100)
        with self.assertRaises((AttributeError, TypeError)):
            r.sequence = 999  # type: ignore[misc]

    def test_module_api_returns_none_without_worker(self):
        self.assertIsNone(prove_compliance(14000, 9000, 1800))

    def test_zk_worker_available_is_bool(self):
        self.assertIsInstance(zk_worker_available(), bool)

    def test_retry_after_error(self):
        client = ZkWorkerClient(socket_path="/tmp/__no_genesis_sock_xyz2.sock")
        client._available = True
        client._last_error_ts = time.monotonic() - 100  # force retry window
        # Should still return False since file doesn't exist
        self.assertFalse(client.available())

    def test_close_idempotent(self):
        client = ZkWorkerClient(socket_path="/tmp/__no_genesis_sock_xyz3.sock")
        client.close()
        client.close()  # second close must not raise


class TestNativeComplianceZkBridge(unittest.TestCase):

    def test_prove_aifmd_compliance_importable(self):
        from genesis_swarm.shared.native_compliance import prove_aifmd_compliance, zk_prover_available
        result = prove_aifmd_compliance(14000, 9000, 1800)
        self.assertIsNone(result)  # no worker running in unit tests
        self.assertIsInstance(zk_prover_available(), bool)


if __name__ == "__main__":
    unittest.main()
