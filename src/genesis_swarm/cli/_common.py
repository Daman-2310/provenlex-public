from __future__ import annotations

import logging
import os
from pathlib import Path

from ..bots.cargo_bot import CargoBot
from ..bots.chaos_monkey import ChaosMonkeyBot
from ..bots.commander_bot import CommanderBot
from ..bots.compliance_bot import ComplianceBot
from ..bots.fuel_bot import FuelBot
from ..bots.fx_bot import FXBot
from ..bots.genesis_bot import GenesisBot
from ..bots.orbital_bot import OrbitalBot
from ..bots.sanctions_bot import SanctionsBot
from ..bots.shadow_bot import ShadowBot
from ..bots.sovereign_bot import SovereignBot
from ..bots.succession_bot import SuccessionBot
from ..bots.yacht_guardian import YachtGuardian
from ..shared.alerting import AlertDispatcher, SwarmAlert
from ..shared.audit_logger import AuditLogger
from ..shared.config import SwarmConfig
from ..shared.consensus import ConsensusEngine
from ..shared.message_bus import create_message_bus
from ..shared.remediation.orchestrator import RemediationOrchestrator
from ..shared.self_healing import HealthMonitor

# Re-export so command modules can import from one place
__all__ = [
    "CargoBot",
    "ChaosMonkeyBot",
    "CommanderBot",
    "ComplianceBot",
    "FuelBot",
    "FXBot",
    "GenesisBot",
    "OrbitalBot",
    "SanctionsBot",
    "ShadowBot",
    "SovereignBot",
    "SuccessionBot",
    "YachtGuardian",
    "AlertDispatcher",
    "SwarmAlert",
    "AuditLogger",
    "SwarmConfig",
    "ConsensusEngine",
    "create_message_bus",
    "RemediationOrchestrator",
    "HealthMonitor",
    "_setup_logging",
    "_build_swarm",
]

# Load .env for SMTP credentials
_env_path = Path(__file__).parents[3] / ".env"
if _env_path.exists():
    for _line in _env_path.read_text().splitlines():
        if _line.strip() and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            _val = _v.strip().replace(" ", "") if "PASS" in _k else _v.strip()
            os.environ.setdefault(_k.strip(), _val)


def _setup_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )


def _build_swarm(cfg: SwarmConfig):
    """Construct all shared infrastructure and the 10 detection bots + ShadowBot sidecar."""
    bus = create_message_bus(use_mock=cfg.use_mock_bus, nats_url=cfg.nats_url)
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

    commander = CommanderBot(
        bus=bus,
        consensus=consensus,
        health_monitor=monitor,
        alerter=alerter,
        auditor=auditor,
        heartbeat_timeout=cfg.heartbeat_timeout_seconds,
    )
    commander.register_bots(bots)

    remediator = RemediationOrchestrator(bots=bots, bus=bus, alerter=alerter, auditor=auditor)
    shadow = ShadowBot(bots=bots, bus=bus, alerter=alerter, auditor=auditor)
    commander.register_bots([shadow])

    return bus, bots, commander, alerter, auditor, remediator, shadow
