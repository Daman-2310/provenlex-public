"""
Genesis Swarm — Cloud Entry Point

Runs the full swarm (all bots + FastAPI) as a single process.
Bot initialization runs in a background thread so it never blocks
the ASGI event loop and always completes on HuggingFace Spaces.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time

log = logging.getLogger(__name__)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)

# ── FastAPI app (must come before swarm imports to avoid circular deps) ────────
from .server import app, attach_state  # noqa: E402

# ── Optional Prometheus metrics ────────────────────────────────────────────────
try:
    from ..metrics.prometheus_exporter import METRICS as _METRICS
except Exception:
    _METRICS = None

_swarm_thread: threading.Thread | None = None


@app.on_event("startup")
async def _startup() -> None:
    log.info("[Cloud] Genesis Swarm starting — launching swarm thread …")
    global _swarm_thread
    _swarm_thread = threading.Thread(target=_run_swarm_thread, daemon=True, name="genesis-swarm")
    _swarm_thread.start()


def _run_swarm_thread() -> None:
    """Runs in a daemon thread — creates its own event loop so asyncio works."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(_start_bots_inner())
    except Exception as exc:
        import traceback
        log.error("[Cloud] SWARM STARTUP FAILED: %s\n%s", exc, traceback.format_exc())
        from .state import _state
        _state["startup_error"] = f"{type(exc).__name__}: {exc}"
    finally:
        try:
            loop.run_until_complete(loop.shutdown_asyncgens())
        except Exception:
            pass
        loop.close()


async def _start_bots_inner() -> None:
    from ..shared.self_healing import HealthMonitor
    from ..shared.security.trust_verifier import TrustVerifier
    from ..shared.security.pii_masker import PIIMasker
    from ..shared.security.merkle_tree import MerkleAuditLog
    from ..shared.security.audit_replay import AuditReplayer
    from ..shared.remediation.orchestrator import RemediationOrchestrator
    from ..shared.message_bus import create_message_bus
    from ..shared.memory.rag_engine import RAGEngine
    from ..shared.memory.chromadb_store import InstitutionalMemory
    from ..shared.consensus import ConsensusEngine
    from ..shared.config import SwarmConfig
    from ..shared.audit_logger import AuditLogger
    from ..shared.alerting import AlertDispatcher
    from ..bots.yacht_guardian import YachtGuardian
    from ..bots.succession_bot import SuccessionBot
    from ..bots.sovereign_bot import SovereignBot
    from ..bots.shadow_bot import ShadowBot
    from ..bots.sanctions_bot import SanctionsBot
    from ..bots.orbital_bot import OrbitalBot
    from ..bots.genesis_bot import GenesisBot
    from ..bots.fx_bot import FXBot
    from ..bots.fuel_bot import FuelBot
    from ..bots.compliance_bot import ComplianceBot
    from ..bots.commander_bot import CommanderBot
    from ..bots.chaos_monkey import ChaosMonkeyBot
    from ..bots.cargo_bot import CargoBot

    from .state import _state

    _state["_step"] = "SwarmConfig"
    cfg = SwarmConfig(use_mock_bus=True, alert_channels=["log"])

    _state["_step"] = "MessageBus"
    bus = create_message_bus(use_mock=cfg.use_mock_bus, nats_url=cfg.nats_url)

    _state["_step"] = "ConsensusEngine"
    consensus = ConsensusEngine(
        total_bots=cfg.total_bots,
        quorum=cfg.quorum,
        timeout=cfg.consensus_timeout_seconds,
    )
    monitor = HealthMonitor(timeout_seconds=cfg.heartbeat_timeout_seconds)
    alerter = AlertDispatcher(
        channels=cfg.alert_channels,
        webhook_url=cfg.webhook_url,
        min_score_for_emergency=cfg.min_score_for_emergency,
    )
    auditor = AuditLogger(log_path=cfg.audit_log_path)

    shared = dict(
        bus=bus,
        consensus_engine=consensus,
        health_monitor=monitor,
        alerter=alerter,
        auditor=auditor,
        anomaly_threshold=75.0,
    )

    _state["_step"] = "Bots"
    bots = [
        GenesisBot(bot_id="genesis-001", fund_name="MARITIME-ALPHA-LUX", **shared),
        CargoBot(bot_id="cargo-001", **shared),
        FuelBot(bot_id="fuel-001", **shared),
        SanctionsBot(bot_id="sanctions-001", **shared),
        FXBot(bot_id="fx-001", **shared),
        ComplianceBot(bot_id="compliance-001", **shared),
        SuccessionBot(bot_id="succession-001", **shared),
        SovereignBot(bot_id="sovereign-001", **shared),
        YachtGuardian(bot_id="yacht-001", **shared),
        OrbitalBot(bot_id="orbital-001", **shared),
    ]

    _state["_step"] = "CommanderBot"
    commander = CommanderBot(
        bus=bus,
        consensus=consensus,
        health_monitor=monitor,
        alerter=alerter,
        auditor=auditor,
        heartbeat_timeout=cfg.heartbeat_timeout_seconds,
    )
    commander.register_bots(bots)

    _state["_step"] = "Remediator"
    remediator = RemediationOrchestrator(
        bots=bots,
        bus=bus,
        alerter=alerter,
        auditor=auditor,
    )
    shadow = ShadowBot(bots=bots, bus=bus, alerter=alerter, auditor=auditor)
    commander.register_bots([shadow])

    _state["_step"] = "Security"
    merkle = MerkleAuditLog()
    trust = TrustVerifier()
    pii = PIIMasker()

    _state["_step"] = "Memory"
    try:
        memory = InstitutionalMemory()
        rag = RAGEngine(memory)
    except Exception as exc:
        log.warning("[Cloud] ChromaDB unavailable, using fallback memory: %s", exc)
        memory = None  # type: ignore[assignment]
        rag = None  # type: ignore[assignment]

    _state["_step"] = "ChaosMonkey"
    chaos = ChaosMonkeyBot(bots=bots, bus=bus, alerter=alerter, auditor=auditor)
    replayer = AuditReplayer(merkle_log=merkle, audit_logger=auditor)

    _state["_step"] = "Bus.connect"
    await bus.connect()

    _state["_step"] = "attach_state"
    attach_state(
        commander,
        bots,
        remediator=remediator,
        shadow_bot=shadow,
        memory=memory,
        rag=rag,
        merkle=merkle,
        trust=trust,
        pii_masker=pii,
        chaos_monkey=chaos,
        audit_replayer=replayer,
        metrics=_METRICS,
    )

    _state["_step"] = "starting_tasks"
    tasks = []
    tasks.append(asyncio.create_task(commander.start()))
    await asyncio.sleep(0.1)
    for bot in bots:
        tasks.append(asyncio.create_task(bot.start()))
    tasks.append(asyncio.create_task(remediator.start()))
    tasks.append(asyncio.create_task(shadow.start()))
    tasks.append(asyncio.create_task(chaos.start()))

    _state["_step"] = "running"
    log.info("[Cloud] Genesis Swarm LIVE — %d bots running on real data feeds", len(bots) + 3)

    # Keep the thread alive — await all tasks
    await asyncio.gather(*tasks, return_exceptions=True)
