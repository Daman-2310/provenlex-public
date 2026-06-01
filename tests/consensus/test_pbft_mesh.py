"""
Deterministic Fault-Tolerance Integration Tests for the PBFT Consensus Mesh.
=============================================================================

All tests use InMemoryMeshTransport so the full 11-node cluster runs inside
a single event loop with no network sockets.  Each scenario exercises a
distinct class of failure or adversarial condition:

  Test 1 — Happy path            : 11 nodes, primary submits 1 request;
                                   all 11 commit within 5 s.

  Test 2 — f=3 failures          : 3 non-primary nodes disconnected before
                                   the request; the remaining 8 active nodes
                                   still form a quorum of 7 and commit.

  Test 3 — Network latency       : 150 ms base latency + 20 ms Gaussian
                                   jitter; 3 sequential requests committed
                                   without deadlock.

  Test 4 — Malicious signature   : A ConsensusEnvelope carrying a corrupted
                                   64-byte zero signature is injected directly
                                   into the target node's handle_envelope().
                                   Exactly one SecurityAlert is raised and
                                   consensus on a legitimate request proceeds
                                   without interruption.

  Test 5 — Primary failure / view change:
                                   The primary's transport is stopped after
                                   0.1 s.  All 10 remaining nodes detect the
                                   timeout and initiate a view-change; a new
                                   primary emerges and a subsequent request
                                   commits successfully.

  Test 6 — State synchronisation : One node is held back while 12 sequences
                                   are committed on the other 10 nodes.  The
                                   lagging node is then started; the state-sync
                                   worker detects the gap and requests the
                                   missing blocks; the node catches up to
                                   sequence 12.

  Test 7 — Concurrent requests   : The primary submits 5 requests in rapid
                                   succession.  All 5 are committed in
                                   monotonically increasing sequence order
                                   (no ordering inversion, no duplicates).

Cluster helpers
---------------
``build_cluster(n, latency_ms, jitter_ms)``
    Create n NodeKeyPairs, n NodePeer configs, n InMemoryMeshTransports,
    and n PBFTNodes wired together.  Call ``await start_cluster(nodes)``
    to start all nodes and ``await stop_cluster(nodes)`` to tear down.

``await wait_for_commit(nodes, seq, min_count, timeout)``
    Async busy-wait until ``min_count`` nodes have committed sequence ``seq``.
"""
from __future__ import annotations

import asyncio
import time
from collections import defaultdict
from typing import NamedTuple

import pytest

from genesis_swarm.consensus.crypto import NodeKeyPair, canonical_signing_bytes, compute_digest
from genesis_swarm.consensus.grpc_transport import InMemoryMeshTransport
from genesis_swarm.consensus.pbft_node import (
    CLUSTER_SIZE,
    MAX_FAULTS,
    QUORUM,
    CommittedBlock,
    ConsensusEnvelope,
    MessagePhase,
    NodePeer,
    PBFTNode,
    SecurityAlert,
)

# ── Cluster helpers ────────────────────────────────────────────────────────────

NODE_IDS: list[str] = [f"node-{i}" for i in range(CLUSTER_SIZE)]


class ClusterNode(NamedTuple):
    keypair: NodeKeyPair
    peer: NodePeer
    transport: InMemoryMeshTransport
    node: PBFTNode


def build_cluster(
    n: int = CLUSTER_SIZE,
    *,
    latency_ms: float = 0.0,
    jitter_ms: float = 0.0,
    primary_timeout_s: float = 1.0,
) -> list[ClusterNode]:
    """
    Construct n PBFT nodes with in-memory transports.

    All transports are configured with identical latency parameters.
    The cluster is NOT started — call ``await start_cluster(nodes)`` next.
    """
    node_ids = [f"node-{i}" for i in range(n)]

    # Generate key pairs
    keypairs = {nid: NodeKeyPair.generate(nid) for nid in node_ids}

    # Build NodePeer configs (host/port are unused by InMemoryMeshTransport)
    peer_configs = {
        nid: NodePeer(
            node_id=nid,
            host="127.0.0.1",
            port=50000 + i,
            pubkey_bytes=keypairs[nid].pubkey_bytes(),
        )
        for i, nid in enumerate(node_ids)
    }

    cluster: list[ClusterNode] = []
    for nid in node_ids:
        transport = InMemoryMeshTransport(
            nid, latency_ms=latency_ms, jitter_ms=jitter_ms
        )
        peers = [peer_configs[pid] for pid in node_ids if pid != nid]
        pbft_node = PBFTNode(
            peer_config=peer_configs[nid],
            keypair=keypairs[nid],
            peers=peers,
            transport=transport,
            primary_timeout_s=primary_timeout_s,
        )
        cluster.append(ClusterNode(keypairs[nid], peer_configs[nid], transport, pbft_node))

    return cluster


async def start_cluster(nodes: list[ClusterNode]) -> None:
    """Start all nodes concurrently."""
    await asyncio.gather(*(cn.node.start() for cn in nodes))


async def stop_cluster(nodes: list[ClusterNode]) -> None:
    """Stop all nodes and reset the in-memory registry."""
    await asyncio.gather(*(cn.node.stop() for cn in nodes), return_exceptions=True)
    InMemoryMeshTransport.reset_registry()


def primary_node(nodes: list[ClusterNode]) -> ClusterNode:
    """Return the ClusterNode whose PBFT engine is currently the primary."""
    return next(cn for cn in nodes if cn.node.is_primary)


async def wait_for_commit(
    nodes: list[ClusterNode],
    seq: int,
    *,
    min_count: int | None = None,
    timeout: float = 8.0,
) -> int:
    """
    Busy-wait until at least ``min_count`` nodes have committed sequence ``seq``.

    Returns the actual number of nodes that committed within the timeout.
    Raises AssertionError if the minimum is not reached.
    """
    required = min_count if min_count is not None else len(nodes)
    deadline = asyncio.get_event_loop().time() + timeout

    while True:
        count = sum(1 for cn in nodes if seq in cn.node._chain)
        if count >= required:
            return count
        if asyncio.get_event_loop().time() >= deadline:
            committed_per_node = {cn.node.node_id: seq in cn.node._chain for cn in nodes}
            raise AssertionError(
                f"Only {count}/{required} nodes committed seq={seq} "
                f"within {timeout}s.  Per-node: {committed_per_node}"
            )
        await asyncio.sleep(0.02)


# ── Test 1: Happy-path consensus ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_11node_happy_path_consensus() -> None:
    """
    All 11 nodes are online.  The primary submits one request.
    Every node must commit it, forming a Merkle-chained block,
    within the timeout.

    Invariants verified:
      • All 11 nodes committed seq=1.
      • All committed blocks carry identical digest.
      • All committed blocks carry >= QUORUM (7) distinct commit signatures.
      • Merkle root is a non-trivial 64-char hex string.
    """
    cluster = build_cluster()
    await start_cluster(cluster)
    try:
        primary = primary_node(cluster)
        seq = await primary.node.submit_request(b"nav-anomaly-tx-001", "client-0")
        assert seq == 1

        await wait_for_commit(cluster, seq=1, min_count=CLUSTER_SIZE)

        # Verify block uniformity across all nodes
        digests = {cn.node._chain[1].digest for cn in cluster}
        assert len(digests) == 1, f"Digest divergence: {digests}"

        for cn in cluster:
            block = cn.node._chain[1]
            assert len(block.commit_sigs) >= QUORUM, (
                f"Node {cn.node.node_id} block has only "
                f"{len(block.commit_sigs)} commit sigs (need >= {QUORUM})"
            )
            assert len(block.merkle_root) == 128
            assert block.merkle_root != "0" * 128
    finally:
        await stop_cluster(cluster)


# ── Test 2: f=3 node failures ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_f_failures_consensus_survives() -> None:
    """
    Disconnect exactly f=3 non-primary nodes before the request is submitted.

    With N=11 and 3 nodes offline, 8 active nodes remain.
    8 > 2f+1 = 7  →  quorum is still achievable.

    Invariants verified:
      • At least QUORUM=7 active nodes commit seq=1.
      • The 3 disconnected nodes never receive the request (their _chain is empty).
    """
    cluster = build_cluster()
    await start_cluster(cluster)
    try:
        primary = primary_node(cluster)
        # Choose 3 non-primary nodes as "failed"
        victims = [cn for cn in cluster if cn.node.node_id != primary.node.node_id][:MAX_FAULTS]
        active = [cn for cn in cluster if cn not in victims]

        # Sever all links to/from the victim nodes
        for victim in victims:
            await victim.node.stop()

        seq = await primary.node.submit_request(b"sanction-check-tx-002", "client-0")

        # Active nodes (8) must reach quorum=7
        await wait_for_commit(active, seq=1, min_count=QUORUM, timeout=8.0)

        # Disconnected nodes must NOT have committed
        for victim in victims:
            assert 1 not in victim.node._chain, (
                f"Victim {victim.node.node_id} committed despite being disconnected"
            )
    finally:
        await stop_cluster(cluster)


# ── Test 3: 150 ms latency + jitter — no deadlock ─────────────────────────────


@pytest.mark.asyncio
async def test_network_latency_no_deadlock() -> None:
    """
    All links carry 150 ms base latency with 20 ms Gaussian jitter to simulate
    cross-region network conditions.

    Three sequential requests are submitted.  The test asserts:
      • All three complete without the state machine deadlocking.
      • All 11 nodes commit all three sequences.
      • Total elapsed wall time is under 15 s (3 × ~1.5 s round-trip budget).
    """
    cluster = build_cluster(latency_ms=150.0, jitter_ms=20.0, primary_timeout_s=3.0)
    await start_cluster(cluster)
    try:
        primary = primary_node(cluster)
        t0 = time.perf_counter()

        for i in range(1, 4):
            seq = await primary.node.submit_request(
                f"fx-check-tx-{i:03d}".encode(), "client-latency"
            )
            await wait_for_commit(cluster, seq=seq, min_count=CLUSTER_SIZE, timeout=12.0)

        elapsed = time.perf_counter() - t0
        assert elapsed < 15.0, (
            f"Latency test took {elapsed:.2f}s — state machine may be deadlocking"
        )
        # All 3 sequences committed across all nodes
        for seq in range(1, 4):
            committed = sum(1 for cn in cluster if seq in cn.node._chain)
            assert committed == CLUSTER_SIZE, (
                f"seq={seq} committed on {committed}/{CLUSTER_SIZE} nodes"
            )
    finally:
        await stop_cluster(cluster)


# ── Test 4: Malicious / corrupted signature payload ───────────────────────────


@pytest.mark.asyncio
async def test_malicious_signature_dropped_and_alert_raised() -> None:
    """
    A ConsensusEnvelope with a syntactically valid structure but a corrupted
    64-byte all-zero signature is injected directly into node-0's
    handle_envelope().

    The node must:
      1. Reject the envelope immediately (no cert update).
      2. Append exactly one SecurityAlert with severity="CRITICAL".

    Consensus on a legitimate subsequent request must proceed normally —
    the attack does not corrupt the state machine.
    """
    cluster = build_cluster()
    await start_cluster(cluster)
    try:
        target = cluster[0]  # node-0 is the victim of the injection

        # Craft a malicious envelope using node-1's identity but a zeroed signature
        attacker = cluster[1]
        ts = time.time_ns()
        bad_sig = b"\x00" * 64

        malicious_env = ConsensusEnvelope(
            phase=MessagePhase.PREPARE,
            view=0,
            seq=999,
            digest="a" * 64,
            sender_id=attacker.node.node_id,
            ed25519_pubkey=attacker.keypair.pubkey_bytes(),
            signature=bad_sig,                    # ← corrupted
            payload=b"",
            timestamp_ns=ts,
            merkle_root="0" * 128,
        )

        alerts_before = len(target.node.alerts)
        certs_before = len(target.node._certs)

        await target.node.handle_envelope(malicious_env)

        # Alert must have been raised
        assert len(target.node.alerts) == alerts_before + 1, (
            "Expected exactly one new SecurityAlert for the malicious envelope"
        )
        alert = target.node.alerts[-1]
        assert alert.severity == "CRITICAL"
        assert "signature" in alert.reason.lower() or "invalid" in alert.reason.lower()

        # No certificate must have been created for the malicious seq
        assert len(target.node._certs) == certs_before, (
            "Malicious envelope must NOT create a certificate entry"
        )

        # Consensus on a legitimate request must still work
        primary = primary_node(cluster)
        seq = await primary.node.submit_request(b"post-attack-tx", "client-0")
        await wait_for_commit(cluster, seq=seq, min_count=CLUSTER_SIZE, timeout=8.0)
    finally:
        await stop_cluster(cluster)


# ── Test 5: Primary failure triggers view-change ──────────────────────────────


@pytest.mark.asyncio
async def test_primary_failure_triggers_view_change_and_consensus_resumes() -> None:
    """
    Stop the current primary's transport immediately after cluster start.
    All 10 remaining nodes must:
      1. Detect primary silence (view-change watchdog fires after timeout).
      2. Broadcast VIEW_CHANGE and collect 2f+1=7 votes.
      3. Install a new view with a new primary.
      4. Successfully commit a request submitted to the NEW primary.

    The test uses a short primary_timeout_s=0.5 s to keep wall-clock runtime
    reasonable.
    """
    cluster = build_cluster(primary_timeout_s=0.5)
    await start_cluster(cluster)
    try:
        original_primary = primary_node(cluster)
        survivors = [cn for cn in cluster if cn.node.node_id != original_primary.node.node_id]

        # Kill the primary's transport — it can no longer receive or send
        await original_primary.node.stop()

        # Wait for view-change to propagate (watchdog fires at 0.5 s, then quorum)
        deadline = asyncio.get_event_loop().time() + 6.0
        while True:
            new_views = [cn.node.current_view for cn in survivors]
            if max(new_views) >= 1 and new_views.count(max(new_views)) >= QUORUM:
                break
            if asyncio.get_event_loop().time() >= deadline:
                raise AssertionError(
                    f"View-change did not complete within 6s. "
                    f"Views: {dict(zip([cn.node.node_id for cn in survivors], new_views))}"
                )
            await asyncio.sleep(0.05)

        # Identify the new primary among survivors
        new_primary = next(
            cn for cn in survivors if cn.node.is_primary
        )
        assert new_primary.node.node_id != original_primary.node.node_id, (
            "New primary must be different from the failed primary"
        )

        # Consensus must resume with the new primary
        seq = await new_primary.node.submit_request(b"post-failover-tx", "client-0")
        await wait_for_commit(survivors, seq=seq, min_count=QUORUM, timeout=8.0)
    finally:
        await stop_cluster(cluster)


# ── Test 6: State synchronisation — lagging node catches up ──────────────────


@pytest.mark.asyncio
async def test_state_sync_lagging_node_catches_up() -> None:
    """
    Simulate a node that is offline during 12 committed sequences and then
    reconnects.

    Procedure:
      1. Build a full 11-node cluster so ALL nodes know each other's pubkeys.
      2. Start only nodes 0-9; hold node-10 offline (transport not registered).
      3. Commit 12 requests on the 10-node active cluster.
      4. Start node-10; set _network_tip=12 so the sync worker fires immediately.
      5. Assert node-10 receives all 12 blocks within the timeout.

    The sync worker uses MAX_SEQUENCE_GAP=10 and exponential backoff; a gap
    of 12 > 10 must trigger a STATE_SYNC_REQ to the primary within
    STATE_SYNC_INTERVAL_S seconds.
    """
    # Build all 11 nodes with full mutual peer registries from the start
    all_nodes = build_cluster(n=CLUSTER_SIZE, primary_timeout_s=1.0)
    cluster_10 = all_nodes[:10]   # active nodes
    lagging_cn = all_nodes[10]    # will be held offline initially

    # Start only the first 10 nodes
    await start_cluster(cluster_10)

    try:
        primary = primary_node(cluster_10)

        # Commit 12 sequences on the 10-node mesh
        for i in range(1, 13):
            seq = await primary.node.submit_request(
                f"block-{i:03d}".encode(), "batch-client"
            )
            await wait_for_commit(cluster_10, seq=seq, min_count=10, timeout=8.0)

        assert primary.node.last_executed_seq == 12

        # Advance network_tip on the lagging node so sync triggers immediately
        lagging_cn.node._network_tip = 12

        # Now bring the lagging node online — its transport registers in the
        # class-level registry so existing nodes can respond to it
        await lagging_cn.node.start()

        # Wait for state-sync to deliver all 12 blocks
        deadline = asyncio.get_event_loop().time() + 12.0
        while True:
            if lagging_cn.node.last_executed_seq >= 12:
                break
            if asyncio.get_event_loop().time() >= deadline:
                raise AssertionError(
                    f"Lagging node only caught up to "
                    f"seq={lagging_cn.node.last_executed_seq}/12"
                )
            await asyncio.sleep(0.1)

        assert lagging_cn.node.last_executed_seq == 12
        assert set(lagging_cn.node._chain.keys()) == set(range(1, 13)), (
            f"Missing blocks: {set(range(1, 13)) - set(lagging_cn.node._chain.keys())}"
        )

    finally:
        await stop_cluster(all_nodes)


# ── Test 7: 5 concurrent requests preserve ordering ──────────────────────────


@pytest.mark.asyncio
async def test_concurrent_requests_committed_in_sequence_order() -> None:
    """
    Submit 5 requests back-to-back without awaiting each individually.

    Invariants:
      • All 5 are committed on all 11 nodes.
      • The committed sequences are exactly {1, 2, 3, 4, 5} — no gaps, no
        duplicates, and no ordering inversion (seq N always precedes seq N+1
        in the _chain_digests list).
      • Each block's data matches the corresponding submitted payload.
    """
    payloads: list[bytes] = [f"concurrent-tx-{i:03d}".encode() for i in range(1, 6)]

    cluster = build_cluster()
    await start_cluster(cluster)
    try:
        primary = primary_node(cluster)

        # Submit all 5 requests before any has completed
        seqs = [
            await primary.node.submit_request(p, "batch-client")
            for p in payloads
        ]

        assert seqs == list(range(1, 6)), f"Unexpected sequence numbers: {seqs}"

        # Wait for all 5 to commit across all 11 nodes
        for seq in seqs:
            await wait_for_commit(cluster, seq=seq, min_count=CLUSTER_SIZE, timeout=10.0)

        # Verify ordering invariant: _chain_digests must be in seq order
        for cn in cluster:
            assert cn.node._chain_digests == [
                cn.node._chain[s].digest for s in sorted(cn.node._chain)
            ], f"Merkle chain digest list out of order on {cn.node.node_id}"

        # Verify payload round-trip
        for i, payload in enumerate(payloads, start=1):
            expected_digest = compute_digest(payload)
            for cn in cluster:
                actual_digest = cn.node._chain[i].digest
                assert actual_digest == expected_digest, (
                    f"seq={i} digest mismatch on {cn.node.node_id}: "
                    f"expected={expected_digest[:8]} got={actual_digest[:8]}"
                )
    finally:
        await stop_cluster(cluster)
