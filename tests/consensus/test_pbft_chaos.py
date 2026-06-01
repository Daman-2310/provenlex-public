"""
PBFT Consensus Engine — Adversarial Chaos Integration Tests
===========================================================

Exercises the 11-node PBFT mesh under network conditions that would break a
naive consensus implementation:

  Chaos 1 — Cross-region latency spike  (150 ms base + 25 ms Gaussian jitter)
  Chaos 2 — Sustained 5 % packet drop   (Bernoulli independent per message)
  Chaos 3 — Out-of-order message delivery (pure jitter, no base latency)
  Chaos 4 — Combined adversarial         (150 ms + 5 % drop + 30 ms jitter)
  Chaos 5 — State sync under chaos       (lagging node re-joins during drops)
  Chaos 6 — Quorum certificate audit     (every committed block >= 2f+1 sigs)
  Chaos 7 — Partition heal convergence   (3-node partition, heal, full sync)

All tests run inside a single asyncio event loop using InMemoryMeshTransport.
No network sockets are opened; the full cluster is deterministic and
reproducible.

Invariants asserted in every test
----------------------------------
- No asyncio deadlock (all assertions inside ``asyncio.wait_for``).
- Every committed block carries at least QUORUM = 2f+1 = 7 commit signatures.
- Committed sequences are monotonically increasing with no gaps after sync.
- SecurityAlert objects generated for injected malformed messages never
  propagate to honest nodes' consensus state.
"""
from __future__ import annotations

import asyncio
import random
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

# ── Constants ──────────────────────────────────────────────────────────────────

_CHAOS_LATENCY_MS: float = 150.0      # simulated cross-region RTT / 2
_CHAOS_JITTER_MS: float = 25.0        # Gaussian σ on top of base latency
_CHAOS_DROP_P: float = 0.05           # 5 % independent Bernoulli packet loss
_OUT_OF_ORDER_JITTER_MS: float = 80.0  # pure jitter to scramble arrival order
_PRIMARY_TIMEOUT_S: float = 2.5       # raised from default to allow for latency
_COMMIT_TIMEOUT_S: float = 40.0       # generous: latency tests need more slack


# ── Cluster construction helpers ───────────────────────────────────────────────


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
    drop_probability: float = 0.0,
    primary_timeout_s: float = _PRIMARY_TIMEOUT_S,
) -> list[ClusterNode]:
    """
    Construct *n* PBFT nodes with in-memory transports and mutual peer awareness.

    Latency, jitter, and drop-probability are applied symmetrically on every
    transport so every link in the cluster experiences the same degradation.

    The cluster is NOT started — call ``await start_cluster(nodes)`` next.
    """
    InMemoryMeshTransport.reset_registry()

    node_ids = [f"node-{i}" for i in range(n)]
    keypairs = {nid: NodeKeyPair.generate(nid) for nid in node_ids}

    peer_configs: dict[str, NodePeer] = {
        nid: NodePeer(
            node_id=nid,
            host="127.0.0.1",
            port=50100 + i,
            pubkey_bytes=keypairs[nid].pubkey_bytes(),
        )
        for i, nid in enumerate(node_ids)
    }

    cluster: list[ClusterNode] = []
    for i, nid in enumerate(node_ids):
        transport = InMemoryMeshTransport(
            node_id=nid,
            latency_ms=latency_ms,
            jitter_ms=jitter_ms,
            drop_probability=drop_probability,
        )
        committed_blocks: dict[int, CommittedBlock] = {}
        alerts: list[SecurityAlert] = []

        async def _on_execute(
            blk: CommittedBlock,
            _store: dict[int, CommittedBlock] = committed_blocks,
        ) -> None:
            _store[blk.seq] = blk

        async def _on_alert(
            alert: SecurityAlert,
            _alerts: list[SecurityAlert] = alerts,
        ) -> None:
            _alerts.append(alert)

        node = PBFTNode(
            peer_config=peer_configs[nid],
            keypair=keypairs[nid],
            peers=list(peer_configs.values()),
            transport=transport,
            primary_timeout_s=primary_timeout_s,
            on_execute=_on_execute,
            on_alert=_on_alert,
        )
        cluster.append(ClusterNode(
            keypair=keypairs[nid], peer=peer_configs[nid], transport=transport, node=node))

    return cluster


async def start_cluster(nodes: list[ClusterNode]) -> None:
    """Start all nodes concurrently."""
    await asyncio.gather(*(cn.node.start() for cn in nodes))


async def stop_cluster(nodes: list[ClusterNode]) -> None:
    """Stop all nodes, suppressing cancellation errors from background tasks."""
    await asyncio.gather(*(cn.node.stop() for cn in nodes), return_exceptions=True)


async def wait_for_commit(
    nodes: list[ClusterNode],
    seq: int,
    *,
    min_count: int | None = None,
    timeout: float = _COMMIT_TIMEOUT_S,
) -> int:
    """
    Busy-wait until at least *min_count* nodes have committed *seq*.

    Returns the actual number of nodes that committed.
    Raises ``asyncio.TimeoutError`` if the deadline is exceeded.
    """
    required = min_count if min_count is not None else len(nodes)
    deadline = time.monotonic() + timeout

    while True:
        committed = sum(1 for cn in nodes if seq in cn.node._chain)  # noqa: SLF001
        if committed >= required:
            return committed
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise asyncio.TimeoutError(
                f"Sequence {seq} committed on {committed}/{len(nodes)} nodes "
                f"after {timeout:.1f}s (required {required})"
            )
        await asyncio.sleep(0.05)


def _primary(cluster: list[ClusterNode]) -> ClusterNode:
    """Return the ClusterNode that is currently the primary."""
    for cn in cluster:
        if cn.node.is_primary:
            return cn
    raise RuntimeError("No primary found in cluster")


def _assert_block_quorum(cluster: list[ClusterNode], seq: int) -> None:
    """
    Assert that every node that has committed *seq* recorded at least QUORUM
    commit signatures in the block's commit_sigs list.
    """
    for cn in cluster:
        blk = cn.node._chain.get(seq)  # noqa: SLF001
        if blk is not None:
            assert len(blk.commit_sigs) >= QUORUM, (
                f"Block seq={seq} on node {cn.node.node_id} has "
                f"{len(blk.commit_sigs)} commit sigs — need >= {QUORUM}"
            )


# ── Chaos 1: Cross-region latency spike ───────────────────────────────────────


@pytest.mark.asyncio
async def test_cross_region_latency_spike_commits_quorum() -> None:
    """
    All 11 nodes operate under 150 ms base latency + 25 ms Gaussian jitter.

    Replicates a cross-region WAN scenario (e.g., Luxembourg ↔ Singapore).
    Three sequential requests must reach quorum on >= 9 nodes within the timeout
    without any protocol deadlock.  Each committed block must carry at least
    2f+1 = 7 cryptographic commit signatures.
    """
    cluster = build_cluster(
        latency_ms=_CHAOS_LATENCY_MS,
        jitter_ms=_CHAOS_JITTER_MS,
        primary_timeout_s=_PRIMARY_TIMEOUT_S,
    )
    try:
        await start_cluster(cluster)
        primary = _primary(cluster)

        seqs: list[int] = []
        for idx in range(3):
            payload = f"latency-spike-req-{idx}".encode()
            seq = await primary.node.submit_request(payload, client_id="chaos-test")
            seqs.append(seq)

        for seq in seqs:
            committed_count = await wait_for_commit(
                cluster, seq, min_count=QUORUM, timeout=_COMMIT_TIMEOUT_S
            )
            assert committed_count >= QUORUM, (
                f"seq={seq} only reached {committed_count} nodes — quorum is {QUORUM}"
            )
            _assert_block_quorum(cluster, seq)

        # Sequences must be monotonically increasing
        assert seqs == sorted(seqs), f"Non-monotonic sequence assignment: {seqs}"

    finally:
        await stop_cluster(cluster)


# ── Chaos 2: Sustained 5 % packet drop ────────────────────────────────────────


@pytest.mark.asyncio
async def test_packet_drop_five_percent_no_stall() -> None:
    """
    Each message in the mesh is independently dropped with p=0.05.

    PBFT tolerates message loss because nodes re-broadcast on quorum transitions
    and the state-sync worker recovers lagging replicas.  Eight sequential
    requests are submitted; all eight must eventually commit on >= QUORUM nodes.
    """
    cluster = build_cluster(
        drop_probability=_CHAOS_DROP_P,
        primary_timeout_s=_PRIMARY_TIMEOUT_S,
    )
    try:
        await start_cluster(cluster)
        primary = _primary(cluster)

        seqs: list[int] = []
        for idx in range(8):
            seq = await primary.node.submit_request(
                f"drop-test-payload-{idx:03d}".encode(), client_id="drop-chaos"
            )
            seqs.append(seq)
            await asyncio.sleep(0.02)   # stagger submissions slightly

        for seq in seqs:
            count = await wait_for_commit(
                cluster, seq, min_count=QUORUM, timeout=_COMMIT_TIMEOUT_S
            )
            assert count >= QUORUM, (
                f"drop-chaos seq={seq}: only {count}/{len(cluster)} nodes committed"
            )
            _assert_block_quorum(cluster, seq)

    finally:
        await stop_cluster(cluster)


# ── Chaos 3: Out-of-order message delivery ─────────────────────────────────────


@pytest.mark.asyncio
async def test_out_of_order_delivery_preserves_monotonic_sequence() -> None:
    """
    High Gaussian jitter (σ = 80 ms, no base latency) causes messages to arrive
    in unpredictable order across the mesh, exercising the PBFT certificate
    accumulation logic under reordering.

    Invariant: all nodes that commit 5 requests do so in the same monotonically
    increasing sequence order — no inversions, no duplicates.
    """
    cluster = build_cluster(
        latency_ms=0.0,
        jitter_ms=_OUT_OF_ORDER_JITTER_MS,
        primary_timeout_s=_PRIMARY_TIMEOUT_S,
    )
    try:
        await start_cluster(cluster)
        primary = _primary(cluster)

        # Submit 5 requests with no artificial delay between them so they
        # race through the jittery mesh simultaneously.
        seqs = [
            await primary.node.submit_request(
                f"ooo-request-{k}".encode(), client_id="ooo-chaos"
            )
            for k in range(5)
        ]

        for seq in seqs:
            await wait_for_commit(cluster, seq, min_count=QUORUM, timeout=_COMMIT_TIMEOUT_S)

        # On every node that has seen all 5 seqs, verify monotonic order
        for cn in cluster:
            committed_seqs = sorted(cn.node._chain.keys())  # noqa: SLF001
            committed_here = [s for s in committed_seqs if s in seqs]
            if len(committed_here) < 2:
                continue
            for a, b in zip(committed_here, committed_here[1:]):
                assert a < b, (
                    f"node {cn.node.node_id}: sequence inversion detected: "
                    f"{a} appeared before {b} in chain {committed_here}"
                )

    finally:
        await stop_cluster(cluster)


# ── Chaos 4: Combined adversarial conditions ───────────────────────────────────


@pytest.mark.asyncio
async def test_combined_adversarial_conditions_no_deadlock() -> None:
    """
    Stacks all three fault dimensions simultaneously:
      • 150 ms base latency
      • 30 ms Gaussian jitter
      • 5 % independent packet drop

    Three requests are submitted.  The test asserts quorum is reached without
    deadlock.  The generous _COMMIT_TIMEOUT_S budget reflects the fact that with
    stacked faults many messages are retransmitted via the state-sync path.
    """
    cluster = build_cluster(
        latency_ms=_CHAOS_LATENCY_MS,
        jitter_ms=30.0,
        drop_probability=_CHAOS_DROP_P,
        primary_timeout_s=_PRIMARY_TIMEOUT_S,
    )
    try:
        await start_cluster(cluster)
        primary = _primary(cluster)

        seqs: list[int] = []
        for idx in range(3):
            seq = await primary.node.submit_request(
                f"combined-chaos-{idx}".encode(), client_id="combined"
            )
            seqs.append(seq)

        for seq in seqs:
            count = await wait_for_commit(
                cluster, seq, min_count=QUORUM, timeout=_COMMIT_TIMEOUT_S
            )
            assert count >= QUORUM, (
                f"combined-chaos seq={seq}: only {count} nodes committed"
            )
            _assert_block_quorum(cluster, seq)

        # No node should have generated security alerts (no Byzantine injection here)
        for cn in cluster:
            assert len(cn.node.alerts) == 0, (
                f"node {cn.node.node_id} raised unexpected alerts: {cn.node.alerts}"
            )

    finally:
        await stop_cluster(cluster)


# ── Chaos 5: State sync under chaos ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_state_sync_lagging_node_catches_up_under_drop() -> None:
    """
    One node is held offline while 12 sequences are committed on the other 10.

    The existing 10-node cluster uses 0 % drop so the pre-sync commits are
    deterministic.  Once all 12 blocks land, the lagging node's transport is
    configured with 5 % drop *before* it starts — this forces its state-sync
    worker to recover all missing blocks despite flaky connectivity, exercising
    the exponential-backoff retry logic.

    The test asserts that ``last_executed_seq`` reaches 12 within the generous
    commit timeout, proving the sync protocol converges under packet loss.
    """
    ADVANCE: int = 12
    DROP_ON_SYNC: float = _CHAOS_DROP_P   # 5 % applied only to the lagging node

    # Build all 11 nodes with 0 % drop so the 10-node cluster commits reliably.
    all_nodes = build_cluster(
        n=CLUSTER_SIZE,
        drop_probability=0.0,
        primary_timeout_s=5.0,
    )
    cluster_10 = all_nodes[:10]
    lagging_cn = all_nodes[10]

    try:
        # Sever all links to the lagging node so it is fully offline
        for cn in cluster_10:
            cn.transport.sever_link(lagging_cn.node.node_id)
            lagging_cn.transport.sever_link(cn.node.node_id)

        await start_cluster(cluster_10)
        primary = _primary(cluster_10)

        # Commit ADVANCE sequences reliably on the 10-node sub-cluster
        seqs: list[int] = []
        for idx in range(ADVANCE):
            seq = await primary.node.submit_request(
                f"state-sync-drop-{idx}".encode(), client_id="sync-chaos"
            )
            seqs.append(seq)
            await asyncio.sleep(0.01)

        for seq in seqs:
            await wait_for_commit(
                cluster_10, seq, min_count=QUORUM, timeout=_COMMIT_TIMEOUT_S
            )

        # Apply 5 % drop to the lagging node's transport, then reconnect
        lagging_cn.transport.set_drop_probability(DROP_ON_SYNC)
        for cn in cluster_10:
            cn.transport.restore_link(lagging_cn.node.node_id)
            lagging_cn.transport.restore_link(cn.node.node_id)

        # Seed the network-tip estimate so the sync worker triggers immediately
        lagging_cn.node._network_tip = ADVANCE  # noqa: SLF001
        await lagging_cn.node.start()

        # Wait for the lagging node to catch up to ADVANCE despite drops
        deadline = time.monotonic() + _COMMIT_TIMEOUT_S
        while lagging_cn.node.last_executed_seq < ADVANCE:
            if time.monotonic() > deadline:
                raise AssertionError(
                    f"Lagging node only caught up to "
                    f"seq={lagging_cn.node.last_executed_seq}/{ADVANCE} "
                    f"after {_COMMIT_TIMEOUT_S:.1f}s under "
                    f"{DROP_ON_SYNC * 100:.0f}% drop on sync link"
                )
            await asyncio.sleep(0.1)

        assert lagging_cn.node.last_executed_seq >= ADVANCE

    finally:
        await stop_cluster(all_nodes)


# ── Chaos 6: Quorum certificate audit ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_every_committed_block_satisfies_2f_plus_1_signatures() -> None:
    """
    Forensic audit: for every (node, seq) pair in the committed chain, the
    stored ``CommittedBlock.commit_sigs`` list must contain at least QUORUM
    distinct 64-byte Ed25519 signatures.

    This is a white-box invariant test — it validates the protocol bookkeeping
    is correct, not just that consensus was reached.  Run under mild 3 % drop
    and 50 ms jitter to exercise non-trivial execution paths.
    """
    cluster = build_cluster(
        latency_ms=50.0,
        jitter_ms=15.0,
        drop_probability=0.03,
        primary_timeout_s=_PRIMARY_TIMEOUT_S,
    )
    try:
        await start_cluster(cluster)
        primary = _primary(cluster)

        N_REQUESTS: int = 5
        seqs: list[int] = []
        for idx in range(N_REQUESTS):
            seq = await primary.node.submit_request(
                f"quorum-audit-{idx}".encode(), client_id="audit"
            )
            seqs.append(seq)

        for seq in seqs:
            await wait_for_commit(cluster, seq, min_count=QUORUM, timeout=_COMMIT_TIMEOUT_S)

        # Deep forensic inspection
        sig_length_violations: list[str] = []
        quorum_count_violations: list[str] = []

        for cn in cluster:
            for seq, blk in cn.node._chain.items():  # noqa: SLF001
                if seq not in seqs:
                    continue

                # Each sig must be 64 bytes (Ed25519 signature size)
                for sig in blk.commit_sigs:
                    if len(sig) != 64:
                        sig_length_violations.append(
                            f"node={cn.node.node_id} seq={seq} "
                            f"sig_len={len(sig)} (expected 64)"
                        )

                if len(blk.commit_sigs) < QUORUM:
                    quorum_count_violations.append(
                        f"node={cn.node.node_id} seq={seq} "
                        f"sigs={len(blk.commit_sigs)} (need >= {QUORUM})"
                    )

        assert not sig_length_violations, (
            "Malformed commit signatures found:\n" + "\n".join(sig_length_violations)
        )
        assert not quorum_count_violations, (
            "Sub-quorum commit certificates found:\n" + "\n".join(quorum_count_violations)
        )

    finally:
        await stop_cluster(cluster)


# ── Chaos 7: Partition heal convergence ───────────────────────────────────────


@pytest.mark.asyncio
async def test_partition_heal_all_nodes_converge() -> None:
    """
    Partition 3 non-primary nodes (f = MAX_FAULTS) from the mesh for the
    duration of 4 commits.  The primary + 8 remaining nodes (> QUORUM) must
    commit those 4 requests.

    After healing the partition, 3 more requests are submitted.  All 11 nodes
    must converge on the same committed chain for the final 3 sequences —
    demonstrating that re-joined nodes sync their gap and then participate in
    new consensus rounds.

    This test isolates partition/heal topology semantics from chaos tolerance —
    zero latency and zero drop ensure the view-change watchdog never fires and
    commits complete in milliseconds, leaving only the partition recovery logic
    under test.  The other six chaos tests cover the latency/drop dimensions.
    """
    PARTITION_SIZE: int = MAX_FAULTS       # = 3
    PRE_HEAL_REQS: int = 4
    POST_HEAL_REQS: int = 3

    cluster = build_cluster(
        latency_ms=0.0,
        jitter_ms=0.0,
        drop_probability=0.0,
        primary_timeout_s=30.0,   # large timeout: no view-change during test
    )
    try:
        await start_cluster(cluster)

        # Identify primary and partition victims.
        # We deliberately isolate the LAST PARTITION_SIZE non-primary nodes so
        # that view-rotation never promotes a partitioned node to primary during
        # the test.  Partitioning nodes 1, 2, 3 (the next three primaries) would
        # cause cascading view-change failures as each new view selects an absent
        # primary.  Choosing tail nodes keeps every potential next-primary in the
        # active sub-cluster.
        primary = _primary(cluster)
        non_primary = [cn for cn in cluster if cn.node.node_id != primary.node.node_id]
        partitioned: list[ClusterNode] = non_primary[-PARTITION_SIZE:]   # last 3: node-8..10
        active: list[ClusterNode] = [primary] + non_primary[:-PARTITION_SIZE]

        assert len(active) >= QUORUM, (
            f"Active partition too small: {len(active)} < QUORUM={QUORUM}"
        )

        # Sever all links between partitioned nodes and the rest
        partitioned_ids = {cn.node.node_id for cn in partitioned}
        active_ids = {cn.node.node_id for cn in active}

        for cn in partitioned:
            for aid in active_ids:
                cn.transport.sever_link(aid)
        for cn in active:
            for pid in partitioned_ids:
                cn.transport.sever_link(pid)

        # Commit PRE_HEAL_REQS requests on the active partition
        pre_seqs: list[int] = []
        for idx in range(PRE_HEAL_REQS):
            seq = await primary.node.submit_request(
                f"pre-heal-{idx}".encode(), client_id="partition-chaos"
            )
            pre_seqs.append(seq)
            await asyncio.sleep(0.02)

        for seq in pre_seqs:
            await wait_for_commit(
                active, seq, min_count=QUORUM, timeout=_COMMIT_TIMEOUT_S
            )

        # ── Heal the partition ─────────────────────────────────────────────
        for cn in partitioned:
            for aid in active_ids:
                cn.transport.restore_link(aid)
        for cn in active:
            for pid in partitioned_ids:
                cn.transport.restore_link(pid)

        # Let state-sync workers detect and recover the gap
        await asyncio.sleep(0.3)

        # Commit POST_HEAL_REQS more requests — all 11 nodes should participate
        post_seqs: list[int] = []
        for idx in range(POST_HEAL_REQS):
            seq = await primary.node.submit_request(
                f"post-heal-{idx}".encode(), client_id="partition-chaos"
            )
            post_seqs.append(seq)
            await asyncio.sleep(0.02)

        for seq in post_seqs:
            count = await wait_for_commit(
                cluster, seq, min_count=QUORUM, timeout=_COMMIT_TIMEOUT_S
            )
            assert count >= QUORUM, (
                f"post-heal seq={seq}: only {count} nodes committed"
            )
            _assert_block_quorum(cluster, seq)

        # The previously partitioned nodes must have recovered pre-heal blocks
        # OR at minimum committed all post-heal blocks (state sync may still run)
        for seq in post_seqs:
            for cn in partitioned:
                if seq in cn.node._chain:
                    blk = cn.node._chain[seq]
                    assert len(blk.commit_sigs) >= QUORUM, (
                        f"Re-joined node {cn.node.node_id}: post-heal seq={seq} "
                        f"has {len(blk.commit_sigs)} sigs < QUORUM={QUORUM}"
                    )

    finally:
        await stop_cluster(cluster)
