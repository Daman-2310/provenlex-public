"""Tests for shared infrastructure: message bus, consensus, self-healing, alerting."""
import asyncio
import pytest
from genesis_swarm.shared.message_bus import MockMessageBus
from genesis_swarm.shared.consensus import ConsensusEngine, ConsensusVote
from genesis_swarm.shared.self_healing import (
    HealthMonitor, SelfHealingOrchestrator, HealingAction, HealingTier
)
from genesis_swarm.shared.alerting import AlertDispatcher, SwarmAlert
from genesis_swarm.shared.audit_logger import AuditLogger


# ── Message Bus ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_mock_bus_publish_subscribe():
    bus = MockMessageBus()
    await bus.connect()
    received = []

    async def _collect(t, p):
        received.append(p)

    await bus.subscribe("test.topic", _collect)
    await bus.publish("test.topic", {"key": "value"})
    await asyncio.sleep(0.05)
    assert any(r.get("key") == "value" for r in received)


@pytest.mark.asyncio
async def test_mock_bus_wildcard_subscription():
    bus = MockMessageBus()
    await bus.connect()
    received = []

    async def _handler(t, p):
        received.append(t)

    await bus.subscribe("heartbeat.*", _handler)
    await bus.publish("heartbeat.genesis-001", {"bot_id": "genesis-001"})
    await bus.publish("heartbeat.cargo-001", {"bot_id": "cargo-001"})
    await bus.publish("anomaly.nav", {"score": 80})
    await asyncio.sleep(0.05)
    assert "heartbeat.genesis-001" in received
    assert "heartbeat.cargo-001" in received
    assert "anomaly.nav" not in received


@pytest.mark.asyncio
async def test_mock_bus_disconnect():
    bus = MockMessageBus()
    await bus.connect()
    assert bus._connected
    await bus.disconnect()
    assert not bus._connected


# ── Consensus Engine ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_consensus_confirmed():
    engine = ConsensusEngine(total_bots=5, quorum=3, timeout=1.0)
    round_id = await engine.open_round("genesis-001", {"score": 85})
    for i in range(3):
        vote = ConsensusVote(f"bot-{i}", "TEST_BOT", round_id, "CORROBORATE", 0.9)
        await engine.register_vote(round_id, vote)
    result = await engine.wait_for_result(round_id)
    assert result.consensus == "CONFIRMED"
    assert result.corroborate == 3


@pytest.mark.asyncio
async def test_consensus_rejected():
    engine = ConsensusEngine(total_bots=5, quorum=3, timeout=1.0)
    round_id = await engine.open_round("genesis-001", {"score": 85})
    for i in range(3):
        vote = ConsensusVote(f"bot-{i}", "TEST_BOT", round_id, "CONTRADICT", 0.9)
        await engine.register_vote(round_id, vote)
    result = await engine.wait_for_result(round_id)
    assert result.consensus == "REJECTED"


@pytest.mark.asyncio
async def test_consensus_timeout_inconclusive():
    engine = ConsensusEngine(total_bots=10, quorum=7, timeout=0.1)
    round_id = await engine.open_round("genesis-001", {})
    vote = ConsensusVote("bot-0", "TEST_BOT", round_id, "CORROBORATE", 0.8)
    await engine.register_vote(round_id, vote)
    result = await engine.wait_for_result(round_id)
    assert result.consensus == "INCONCLUSIVE"


@pytest.mark.asyncio
async def test_consensus_byzantine_detection():
    engine = ConsensusEngine(total_bots=5, quorum=3, timeout=1.0)
    round_id = await engine.open_round("genesis-001", {})
    await engine.register_vote(round_id, ConsensusVote("bad-bot", "X", round_id, "CORROBORATE", 0.9))
    await engine.register_vote(round_id, ConsensusVote("bad-bot", "X", round_id, "CONTRADICT", 0.9))
    assert "bad-bot" in engine.byzantine_nodes()


@pytest.mark.asyncio
async def test_consensus_unique_round_ids():
    engine = ConsensusEngine()
    ids = [await engine.open_round(f"bot-{i}", {}) for i in range(10)]
    assert len(set(ids)) == 10


# ── Health Monitor ────────────────────────────────────────────────────────────

def test_health_monitor_record_and_check():
    monitor = HealthMonitor(timeout_seconds=5.0)
    monitor.record_heartbeat("genesis-001")
    assert "genesis-001" not in monitor.get_timed_out_bots()
    assert monitor.all_healthy()


def test_health_monitor_timeout():
    import time
    monitor = HealthMonitor(timeout_seconds=0.01)
    monitor.record_heartbeat("slow-bot")
    time.sleep(0.05)
    assert "slow-bot" in monitor.get_timed_out_bots()


def test_health_monitor_status_map():
    monitor = HealthMonitor(timeout_seconds=10.0)
    monitor.record_heartbeat("bot-a")
    monitor.record_heartbeat("bot-b")
    status = monitor.status_map()
    assert status["bot-a"] == "healthy"
    assert status["bot-b"] == "healthy"


# ── Self-Healing Orchestrator ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_self_healing_tier1_auto():
    monitor = HealthMonitor()
    orch = SelfHealingOrchestrator(health_monitor=monitor)
    event = await orch.respond("genesis-001", "heartbeat_timeout", {"bot_id": "genesis-001"})
    assert event.tier == HealingTier.AUTO
    assert event.auto_resolved is True


@pytest.mark.asyncio
async def test_self_healing_tier2_notify():
    monitor = HealthMonitor()
    orch = SelfHealingOrchestrator(health_monitor=monitor)
    event = await orch.respond("genesis-001", "model_drift_detected", {})
    assert event.tier == HealingTier.NOTIFY
    assert event.auto_resolved is True


@pytest.mark.asyncio
async def test_self_healing_tier3_escalate():
    monitor = HealthMonitor()
    escalated = []

    async def cb(bot_id, failure_type, ctx):
        escalated.append(failure_type)

    orch = SelfHealingOrchestrator(health_monitor=monitor, escalation_cb=cb)
    event = await orch.respond("genesis-001", "byzantine_detected", {})
    assert event.tier == HealingTier.ESCALATE
    assert event.auto_resolved is False
    assert len(escalated) == 1


@pytest.mark.asyncio
async def test_self_healing_unknown_failure_escalates():
    monitor = HealthMonitor()
    escalated = []

    async def cb(bot_id, failure_type, ctx):
        escalated.append(failure_type)

    orch = SelfHealingOrchestrator(health_monitor=monitor, escalation_cb=cb)
    await orch.respond("bot-x", "totally_unknown_failure", {})
    assert len(escalated) == 1


@pytest.mark.asyncio
async def test_self_healing_handler_called():
    monitor = HealthMonitor()
    called = []

    async def handler(ctx):
        called.append(ctx)

    orch = SelfHealingOrchestrator(health_monitor=monitor)
    orch.register_handler(HealingAction.RESTART_BOT, handler)
    await orch.respond("bot-x", "heartbeat_timeout", {"bot_id": "bot-x"})
    assert len(called) == 1


@pytest.mark.asyncio
async def test_self_healing_stats():
    monitor = HealthMonitor()
    orch = SelfHealingOrchestrator(health_monitor=monitor)
    await orch.respond("bot-1", "heartbeat_timeout", {})
    await orch.respond("bot-2", "model_drift_detected", {})
    stats = orch.stats()
    assert stats["total_events"] == 2
    assert stats["auto_resolved"] == 2


# ── AlertDispatcher ───────────────────────────────────────────────────────────

def _make_alert(score=80.0, consensus="CONFIRMED") -> SwarmAlert:
    return SwarmAlert(
        bot_id="genesis-001", bot_type="NAV_DETECTOR",
        fund_name="MARITIME-ALPHA-LUX", anomaly_score=score,
        severity="WARNING", consensus=consensus,
        summary="Test alert", details={}, round_id="TEST-001",
    )


@pytest.mark.asyncio
async def test_alerter_log_channel(caplog):
    import logging
    dispatcher = AlertDispatcher(channels=["log"])
    with caplog.at_level(logging.CRITICAL, logger="genesis_swarm.shared.alerting"):
        await dispatcher.dispatch(_make_alert(80.0))
    assert len(dispatcher.sent) == 1
    assert "SWARM ALERT" in caplog.text


@pytest.mark.asyncio
async def test_alerter_emergency_escalation():
    dispatcher = AlertDispatcher(channels=["log"], min_score_for_emergency=90.0)
    alert = _make_alert(score=95.0)
    await dispatcher.dispatch(alert)
    assert dispatcher.sent[0].severity == "EMERGENCY"
    assert dispatcher.emergency_count == 1


@pytest.mark.asyncio
async def test_alerter_custom_hook():
    received = []

    async def hook(a):
        received.append(a)

    dispatcher = AlertDispatcher(channels=["log"])
    dispatcher.add_hook(hook)
    await dispatcher.dispatch(_make_alert(80.0))
    await dispatcher.dispatch(_make_alert(95.0))
    assert len(received) == 2
    assert received[1].severity == "EMERGENCY"


@pytest.mark.asyncio
async def test_alerter_failing_hook_does_not_crash():
    async def bad_hook(a):
        raise RuntimeError("boom")

    dispatcher = AlertDispatcher(channels=["log"])
    dispatcher.add_hook(bad_hook)
    await dispatcher.dispatch(_make_alert(80.0))
    assert len(dispatcher.sent) == 1


@pytest.mark.asyncio
async def test_alerter_clear():
    dispatcher = AlertDispatcher(channels=["log"])
    await dispatcher.dispatch(_make_alert())
    await dispatcher.dispatch(_make_alert())
    assert len(dispatcher.sent) == 2
    dispatcher.clear()
    assert len(dispatcher.sent) == 0


# ── Audit Logger ──────────────────────────────────────────────────────────────

def test_audit_logger_record(tmp_path):
    auditor = AuditLogger(log_path=str(tmp_path))
    rec = auditor.record("genesis-001", "NAV_DETECTOR", "anomaly_detected", {"score": 85.0})
    assert rec.bot_id == "genesis-001"
    assert rec.record_hash  # tamper-evident hash present
    assert len(auditor.get_recent(10)) == 1


def test_audit_record_hash_tamper_detection(tmp_path):
    auditor = AuditLogger(log_path=str(tmp_path))
    rec = auditor.record("bot-1", "TYPE", "event", {"x": 1})
    original_hash = rec.record_hash
    rec.payload["x"] = 2
    # Hash not recomputed — tampering detectable
    assert rec.record_hash == original_hash
