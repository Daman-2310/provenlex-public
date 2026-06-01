from __future__ import annotations

import click

from ._common import SwarmConfig


@click.command()
def status():
    """Print swarm configuration and bot list."""
    cfg = SwarmConfig()
    click.echo("\nGenesis Swarm Configuration")
    click.echo("═" * 40)
    click.echo(f"  Bus         : {'Mock (in-process)' if cfg.use_mock_bus else cfg.nats_url}")
    click.echo(f"  Total bots  : {cfg.total_bots}")
    click.echo(f"  Quorum      : {cfg.quorum}")
    click.echo(f"  Threshold   : {cfg.min_score_for_emergency}")
    click.echo(f"  Data home   : {cfg.data_residency}")
    click.echo("\nBot Roster:")
    bots_info = [
        ("genesis-001", "NAV_DETECTOR", "NAV anomaly detection (Isolation Forest + LSTM)"),
        ("cargo-001", "CARGO_BOT", "AIS vessel anomaly & dark ship detection"),
        ("fuel-001", "COMMODITY_MONITOR", "Energy price manipulation (EIA/TTF data)"),
        ("sanctions-001", "SANCTIONS_BOT", "OFAC/EU sanctions screening"),
        ("fx-001", "FX_BOT", "Currency manipulation detection (ECB rates)"),
        ("compliance-001", "COMPLIANCE_BOT", "AIFMD/UCITS rule breach detection"),
        ("succession-001", "SUCCESSION_BOT", "UBO/ownership structure anomalies"),
        ("sovereign-001", "SOVEREIGN_BOT", "Country risk scoring"),
        ("yacht-001", "ASSET_TRACKER", "UHNW asset movement tracking"),
        ("orbital-001", "SATELLITE_ANALYTICS", "Satellite pass anomaly correlation"),
        (
            "commander-001",
            "COMMANDER_BOT",
            "Swarm manager — monitors all bots, reports to operator",
        ),
    ]
    for bid, btype, desc in bots_info:
        click.echo(f"  {bid:20s} [{btype:18s}] {desc}")
    click.echo()
