"""Unit tests for bot base and detection results."""
from __future__ import annotations

import pytest
from genesis_swarm.shared.bot_base import DetectionResult


class TestDetectionResult:
    def test_valid_result(self):
        r = DetectionResult(
            bot_id="test-001",
            bot_type="NAV_DETECTOR",
            score=75.0,
            is_anomaly=True,
            threshold=70.0,
            summary="Test anomaly detected",
            details={"reason": "test"},
        )
        assert r.score == 75.0
        assert r.is_anomaly is True

    def test_score_bounds(self):
        r = DetectionResult(
            bot_id="test-002",
            bot_type="FX_BOT",
            score=0.0,
            is_anomaly=False,
            threshold=70.0,
            summary="Normal",
            details={},
        )
        assert 0.0 <= r.score <= 100.0


class TestBlockchainAnchor:
    def test_simulated_anchor(self):
        from genesis_swarm.shared.security.blockchain_anchor import BlockchainAnchor
        anchor = BlockchainAnchor()
        result = anchor.anchor("abc123def456")
        assert result.simulated is True
        assert result.tx_hash.startswith("0x")
        assert result.network == "sepolia-simulated"

    def test_anchor_history(self):
        from genesis_swarm.shared.security.blockchain_anchor import BlockchainAnchor
        anchor = BlockchainAnchor()
        anchor.anchor("hash1")
        anchor.anchor("hash2")
        history = anchor.get_anchors()
        assert len(history) == 2

    def test_verify_by_root(self):
        from genesis_swarm.shared.security.blockchain_anchor import BlockchainAnchor
        anchor = BlockchainAnchor()
        root = "deadbeef1234"
        anchor.anchor(root)
        result = anchor.verify(root)
        assert result is not None
        assert result.root_hash == root
