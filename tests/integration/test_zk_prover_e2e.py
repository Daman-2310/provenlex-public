"""
ZK Prover End-to-End Integration Test

Starts the real zk-worker Rust binary, submits compliance telemetry, and
asserts that the returned proof is a valid 128-byte BN254 Groth16 proof.

Requires: sovereign-engine/target/release/zk-worker (built with --features real-zk-proofs)

Run:
    pytest tests/integration/test_zk_prover_e2e.py -v -s
    pytest tests/integration/test_zk_prover_e2e.py -v -m "not slow"  # skip
"""

from __future__ import annotations

import os
import subprocess
import time
import uuid

import pytest

BINARY = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "../../sovereign-engine/target/release/zk-worker")
)

EXPECTED_PROOF_BYTES = 128
WORKER_STARTUP_TIMEOUT_S = 90


def _binary_available() -> bool:
    return os.path.isfile(BINARY) and os.access(BINARY, os.X_OK)


requires_zk_binary = pytest.mark.skipif(
    not _binary_available(),
    reason=(
        f"zk-worker binary not found at {BINARY} — run: "
        "cd sovereign-engine && cargo build --release --bin zk-worker --features real-zk-proofs"
    ),
)


@pytest.fixture(scope="module")
def zk_worker_socket():
    """
    Start the zk-worker sidecar and yield the socket path; terminate on teardown.

    Uses /tmp directly with a short random name to stay under macOS SUN_LEN (104 bytes).
    """
    # Keep path short: /tmp/gzk_<8hex>.sock  ≈ 22 chars, well under 104
    socket_path = f"/tmp/gzk_{uuid.uuid4().hex[:8]}.sock"

    env = {**os.environ, "GENESIS_ZK_SOCKET": socket_path, "GENESIS_ZK_WORKERS": "1"}
    proc = subprocess.Popen(
        [BINARY],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    deadline = time.monotonic() + WORKER_STARTUP_TIMEOUT_S
    while not os.path.exists(socket_path):
        if time.monotonic() > deadline:
            proc.terminate()
            _, stderr = proc.communicate(timeout=5)
            pytest.fail(
                f"zk-worker did not create socket within {WORKER_STARTUP_TIMEOUT_S}s.\n"
                f"stderr:\n{stderr.decode(errors='replace')[-2000:]}"
            )
        rc = proc.poll()
        if rc is not None:
            _, stderr = proc.communicate()
            pytest.fail(
                f"zk-worker exited early (rc={rc}).\n"
                f"stderr:\n{stderr.decode(errors='replace')[-2000:]}"
            )
        time.sleep(0.5)

    yield socket_path

    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
    try:
        os.unlink(socket_path)
    except OSError:
        pass


@requires_zk_binary
@pytest.mark.slow
class TestZkProverE2E:
    """Real Groth16 proof generation via the zk-worker sidecar."""

    def test_proof_is_128_bytes(self, zk_worker_socket):
        """Happy path: compliant portfolio returns a 128-byte BN254 Groth16 proof."""
        from genesis_swarm.shared.zk_client import ZkWorkerClient

        client = ZkWorkerClient(socket_path=zk_worker_socket, timeout=60.0)
        try:
            result = client.prove(
                gross_bp=14_500,
                net_bp=9_000,
                concentration_bp=1_800,
            )
            assert result is not None, "ZkWorkerClient.prove() returned None — worker error"
            assert result.via_real_prover is True
            assert len(result.proof_bytes) == EXPECTED_PROOF_BYTES, (
                f"Expected {EXPECTED_PROOF_BYTES} bytes, got {len(result.proof_bytes)}"
            )
            assert len(result.proof_hex) == EXPECTED_PROOF_BYTES * 2
            assert result.latency_ms >= 0
            assert result.sequence == 1
        finally:
            client.close()

    def test_proof_hex_matches_bytes(self, zk_worker_socket):
        """proof_hex is the canonical hex encoding of proof_bytes."""
        from genesis_swarm.shared.zk_client import ZkWorkerClient

        client = ZkWorkerClient(socket_path=zk_worker_socket, timeout=60.0)
        try:
            result = client.prove(gross_bp=10_000, net_bp=7_000, concentration_bp=1_200)
            assert result is not None
            assert bytes.fromhex(result.proof_hex) == result.proof_bytes
        finally:
            client.close()

    def test_multiple_sequential_proofs(self, zk_worker_socket):
        """Worker handles multiple sequential requests on one persistent connection."""
        from genesis_swarm.shared.zk_client import ZkWorkerClient

        client = ZkWorkerClient(socket_path=zk_worker_socket, timeout=60.0)
        try:
            sequences = []
            for i in range(3):
                result = client.prove(
                    gross_bp=10_000 + i * 1_000,
                    net_bp=6_000 + i * 500,
                    concentration_bp=1_000 + i * 100,
                )
                assert result is not None, f"Proof {i} returned None"
                assert len(result.proof_bytes) == EXPECTED_PROOF_BYTES
                sequences.append(result.sequence)

            assert sequences == sorted(sequences)
            assert len(set(sequences)) == 3
        finally:
            client.close()

    def test_module_level_prove_compliance(self, zk_worker_socket):
        """Module-level prove_compliance() routes via the singleton client."""
        import genesis_swarm.shared.zk_client as zk_module

        old_client = zk_module._client
        zk_module._client = zk_module.ZkWorkerClient(
            socket_path=zk_worker_socket, timeout=60.0
        )
        try:
            result = zk_module.prove_compliance(
                gross_bp=15_000, net_bp=10_000, concentration_bp=1_500
            )
            assert result is not None
            assert len(result.proof_bytes) == EXPECTED_PROOF_BYTES
        finally:
            zk_module._client.close()
            zk_module._client = old_client

    def test_native_compliance_bridge(self, zk_worker_socket):
        """native_compliance.prove_aifmd_compliance() delegates to zk_client."""
        import genesis_swarm.shared.zk_client as zk_module
        from genesis_swarm.shared.native_compliance import prove_aifmd_compliance

        old_client = zk_module._client
        zk_module._client = zk_module.ZkWorkerClient(
            socket_path=zk_worker_socket, timeout=60.0
        )
        try:
            result = prove_aifmd_compliance(
                gross_bp=12_000, net_bp=8_000, concentration_bp=1_600
            )
            assert result is not None
            assert len(result.proof_bytes) == EXPECTED_PROOF_BYTES
        finally:
            zk_module._client.close()
            zk_module._client = old_client
