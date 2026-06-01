"""Tests for PBFTConsensus engine and MerkleAuditLog."""
from __future__ import annotations

import pytest
from genesis_swarm.consensus.pbft_consensus import PBFTConsensus, BotStatus
from genesis_swarm.shared.security.merkle_tree import MerkleAuditLog

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_BOT_STATUSES: dict[str, BotStatus] = {
    "NAV_DETECTOR": {"last_score": 85.0, "threshold": 70.0},
    "SANCTIONS_BOT": {"last_score": 60.0, "threshold": 75.0},
    "CARGO_BOT":     {"last_score": 50.0, "threshold": 70.0},
}


# ---------------------------------------------------------------------------
# PBFTConsensus
# ---------------------------------------------------------------------------


class TestPBFTConsensus:
    def setup_method(self):
        self.pbft = PBFTConsensus()

    # ── initial state ───────────────────────────────────────────────────────

    def test_initial_stats_zero(self):
        stats = self.pbft.get_stats()
        assert stats["total_rounds"] == 0
        assert stats["quorum_rate"] == 0.0

    def test_initial_no_latest_round(self):
        assert self.pbft.get_latest_round() is None

    def test_initial_recent_rounds_empty(self):
        assert self.pbft.get_recent_rounds(10) == []

    def test_protocol_and_nodes_present(self):
        stats = self.pbft.get_stats()
        assert stats["protocol"] == "PBFT"
        assert int(stats["total_nodes"]) > 0
        assert stats["primary"] is not None

    # ── single round ────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_run_round_returns_consensus_round(self):
        result = await self.pbft.run_round(
            transaction_id="test-001",
            threat_type="NAV_ANOMALY",
            initiator_bot="NAV_DETECTOR",
            initiator_score=85.0,
            bot_statuses=_BOT_STATUSES,
        )
        assert result is not None
        assert hasattr(result, "quorum_reached")
        assert hasattr(result, "final_verdict")
        assert hasattr(result, "round_id")
        assert result.transaction_id == "test-001"
        assert result.threat_type == "NAV_ANOMALY"

    @pytest.mark.asyncio
    async def test_run_round_increments_stats(self):
        await self.pbft.run_round(
            transaction_id="tx-stats",
            threat_type="SANCTION",
            initiator_bot="SANCTIONS_BOT",
            initiator_score=90.0,
            bot_statuses=_BOT_STATUSES,
        )
        stats = self.pbft.get_stats()
        assert stats["total_rounds"] == 1

    @pytest.mark.asyncio
    async def test_run_round_appears_in_recent_rounds(self):
        await self.pbft.run_round(
            transaction_id="tx-recent",
            threat_type="CARGO_DARK",
            initiator_bot="CARGO_BOT",
            initiator_score=78.0,
            bot_statuses=_BOT_STATUSES,
        )
        rounds = self.pbft.get_recent_rounds(10)
        assert len(rounds) == 1
        assert rounds[0]["transaction_id"] == "tx-recent"

    @pytest.mark.asyncio
    async def test_run_round_result_score_range(self):
        result = await self.pbft.run_round(
            transaction_id="tx-score",
            threat_type="FX_ANOMALY",
            initiator_bot="FX_BOT",
            initiator_score=65.0,
            bot_statuses={"FX_BOT": {"last_score": 65.0, "threshold": 70.0}},
        )
        assert 0.0 <= result.weighted_score <= 100.0
        assert result.commit_latency_ms >= 0

    # ── multiple rounds ─────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_multiple_rounds_accumulate(self):
        for i in range(3):
            await self.pbft.run_round(
                transaction_id=f"tx-multi-{i}",
                threat_type="NAV_ANOMALY",
                initiator_bot="NAV_DETECTOR",
                initiator_score=float(70 + i * 5),
                bot_statuses=_BOT_STATUSES,
            )
        stats = self.pbft.get_stats()
        assert stats["total_rounds"] == 3
        rounds = self.pbft.get_recent_rounds(10)
        assert len(rounds) == 3

    @pytest.mark.asyncio
    async def test_recent_rounds_newest_first(self):
        for i in range(3):
            await self.pbft.run_round(
                transaction_id=f"tx-order-{i}",
                threat_type="SANCTION",
                initiator_bot="SANCTIONS_BOT",
                initiator_score=80.0,
                bot_statuses=_BOT_STATUSES,
            )
        rounds = self.pbft.get_recent_rounds(10)
        ids = [r["transaction_id"] for r in rounds]
        assert ids[0] == "tx-order-2"  # most recent first

    @pytest.mark.asyncio
    async def test_get_recent_rounds_limit(self):
        for i in range(5):
            await self.pbft.run_round(
                transaction_id=f"tx-limit-{i}",
                threat_type="CARGO_DARK",
                initiator_bot="CARGO_BOT",
                initiator_score=75.0,
                bot_statuses=_BOT_STATUSES,
            )
        rounds = self.pbft.get_recent_rounds(3)
        assert len(rounds) == 3

    # ── round serialisation ─────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_round_to_dict_keys(self):
        result = await self.pbft.run_round(
            transaction_id="tx-dict",
            threat_type="FX_ANOMALY",
            initiator_bot="FX_BOT",
            initiator_score=72.0,
            bot_statuses=_BOT_STATUSES,
        )
        d = result.to_dict()
        for key in ("round_id", "transaction_id", "threat_type", "quorum_reached",
                    "final_verdict", "weighted_score", "merkle_root", "ts"):
            assert key in d, f"missing key: {key}"

    @pytest.mark.asyncio
    async def test_merkle_root_is_64_char_hex(self):
        result = await self.pbft.run_round(
            transaction_id="tx-merkle",
            threat_type="ORBITAL",
            initiator_bot="SATELLITE_ANALYTICS",
            initiator_score=88.0,
            bot_statuses=_BOT_STATUSES,
        )
        assert len(result.merkle_root) == 128
        int(result.merkle_root, 16)  # raises ValueError if not hex

    # ── get_latest_round ────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_get_latest_round_after_run(self):
        assert self.pbft.get_latest_round() is None
        await self.pbft.run_round(
            transaction_id="tx-latest",
            threat_type="SANCTIONS_HIT",
            initiator_bot="SANCTIONS_BOT",
            initiator_score=92.0,
            bot_statuses=_BOT_STATUSES,
        )
        latest = self.pbft.get_latest_round()
        assert latest is not None
        assert latest.transaction_id == "tx-latest"

    # ── stats shape ─────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_stats_quorum_rate_in_range(self):
        for i in range(4):
            await self.pbft.run_round(
                transaction_id=f"tx-qr-{i}",
                threat_type="NAV_ANOMALY",
                initiator_bot="NAV_DETECTOR",
                initiator_score=80.0,
                bot_statuses=_BOT_STATUSES,
            )
        stats = self.pbft.get_stats()
        assert 0.0 <= float(stats["quorum_rate"]) <= 1.0
        assert float(stats["avg_latency_ms"]) >= 0


# ---------------------------------------------------------------------------
# MerkleAuditLog
# ---------------------------------------------------------------------------


class TestMerkleAuditLog:
    def setup_method(self):
        self.merkle = MerkleAuditLog()

    def test_empty_root_is_none(self):
        assert self.merkle.root is None

    def test_empty_depth_is_zero(self):
        assert self.merkle.depth == 0

    def test_append_returns_leaf_hash(self):
        leaf = self.merkle.append({"event": "test"})
        assert isinstance(leaf, str)
        assert len(leaf) == 128
        int(leaf, 16)  # raises if not hex

    def test_append_sets_root(self):
        self.merkle.append({"event": "test", "score": 85.0})
        assert self.merkle.root is not None
        assert len(self.merkle.root) == 128

    def test_root_changes_on_second_append(self):
        self.merkle.append({"event": "a"})
        root1 = self.merkle.root
        self.merkle.append({"event": "b"})
        root2 = self.merkle.root
        assert root1 != root2

    def test_identical_records_produce_same_leaf_hash(self):
        h1 = self.merkle.append({"event": "dup", "score": 1.0})
        m2 = MerkleAuditLog()
        h2 = m2.append({"event": "dup", "score": 1.0})
        assert h1 == h2

    def test_root_is_deterministic(self):
        records = [{"i": i} for i in range(5)]
        m1 = MerkleAuditLog()
        m2 = MerkleAuditLog()
        for r in records:
            m1.append(r)
            m2.append(r)
        assert m1.root == m2.root

    def test_depth_after_four_appends(self):
        for i in range(4):
            self.merkle.append({"i": i})
        assert self.merkle.depth >= 2

    def test_depth_grows_with_leaves(self):
        d0 = self.merkle.depth
        self.merkle.append({"n": 1})
        d1 = self.merkle.depth
        for i in range(7):
            self.merkle.append({"n": i + 2})
        d8 = self.merkle.depth
        assert d8 > d1 > d0

    def test_verify_leaf_round_trips(self):
        record = {"event": "audit", "score": 77.5, "bot": "NAV_DETECTOR"}
        leaf_hash = self.merkle.append(record)
        assert self.merkle.verify_leaf(record, leaf_hash) is True

    def test_verify_leaf_rejects_tampered_record(self):
        record = {"event": "audit", "score": 77.5}
        leaf_hash = self.merkle.append(record)
        tampered = {"event": "audit", "score": 99.9}
        assert self.merkle.verify_leaf(tampered, leaf_hash) is False

    def test_single_leaf_depth_is_one(self):
        self.merkle.append({"only": "leaf"})
        assert self.merkle.depth == 1
