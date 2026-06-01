from __future__ import annotations

import asyncio
import time

import click

from ._common import SwarmAlert, SwarmConfig, _build_swarm, _setup_logging

_SCENARIO = [(3.0,
              "anomaly",
              {"bot_id": "cargo-001",
               "bot_type": "CARGO_BOT",
               "score": 82.0,
               "fund_name": "MARITIME-ALPHA-LUX",
               "summary": "Dark ship: MV PHANTOM NAVIGATOR — AIS signal lost 6h in sanctioned waters",
               "details": {"vessel": "MV PHANTOM NAVIGATOR",
                            "ais_gap_hours": 6,
                            "last_port": "Tartus, Syria",
                           },
               },
              ),
             (5.5,
              "anomaly",
              {"bot_id": "sanctions-001",
               "bot_type": "SANCTIONS_BOT",
               "score": 88.5,
               "fund_name": "MARITIME-ALPHA-LUX",
               "summary": "OFAC SDN match: FEDERAL RESOURCE CORP — 91% token overlap",
               "details": {"entity": "FEDERAL RESOURCE CORP",
                           "match_score": 91,
                           "list": "OFAC SDN"},
               },
              ),
             (8.0,
              "anomaly",
              {"bot_id": "fx-001",
               "bot_type": "FX_BOT",
               "score": 85.0,
               "fund_name": "MARITIME-ALPHA-LUX",
               "summary": "RUB/EUR anomaly: 3.1σ spike — possible sanctions evasion via FX routing",
               "details": {"pair": "RUB",
                           "z_score": 3.1,
                           "geopolitical_multiplier": 1.25},
               },
              ),
             (14.0,
              "healing",
              {"bot_id": "cargo-001",
               "bot_type": "CARGO_BOT",
               "action": "switch_to_backup_feed",
               "reason": "feed_quality_degraded",
               "tier": 1,
               "auto_resolved": True,
               "explanation": "[cargo-001] AIS feed returned missing values — switched to backup source automatically.",
               "ts": 0,
               },
              ),
             (16.0,
              "feed_failure",
              {"feed_id": "ecb_rates"}),
             (17.0,
              "anomaly",
              {"bot_id": "genesis-001",
               "bot_type": "NAV_DETECTOR",
               "score": 92.0,
               "fund_name": "MARITIME-ALPHA-LUX",
               "summary": "NAV flash crash: -4.3% in 60s — 2.8σ below 90-day baseline",
               "details": {"fund": "MARITIME-ALPHA-LUX",
                           "nav_change_pct": -0.043,
                           "z_score": -2.8},
               },
              ),
             (22.0,
              "anomaly",
              {"bot_id": "compliance-001",
               "bot_type": "COMPLIANCE_BOT",
               "score": 78.0,
               "fund_name": "OFFSHORE-ALPHA-LUX",
               "summary": "AIFMD breach: leverage 3.8x NAV — CSSF limit 3.0x (circular 18/698)",
               "details": {"fund": "OFFSHORE-ALPHA-LUX",
                           "leverage_ratio": 3.8,
                           "limit": 3.0},
               },
              ),
             (28.0,
              "anomaly",
              {"bot_id": "orbital-001",
               "bot_type": "SATELLITE_ANALYTICS",
               "score": 80.0,
               "fund_name": "SWARM",
               "summary": "Unknown satellite imaging cluster over Luxembourg financial district",
               "details": {"object_id": "UNKNOWN-2024-089A",
                           "cluster_size": 3,
                           "pass_count_24h": 4},
               },
              ),
             (35.0,
              "healing",
              {"bot_id": "fx-001",
               "bot_type": "FX_BOT",
               "action": "reconnect_message_bus",
               "reason": "bus_disconnect",
               "tier": 1,
               "auto_resolved": True,
               "explanation": "[fx-001] Lost connection to message bus — reconnected automatically.",
               "ts": 0,
               },
              ),
             (38.0,
              "memory_spike",
              {"severity": "HIGH"}),
             (39.0,
              "shadow_attack",
              {"bot_type": "SANCTIONS_BOT"}),
             (40.0,
              "anomaly",
              {"bot_id": "succession-001",
               "bot_type": "SUCCESSION_BOT",
               "score": 83.0,
               "fund_name": "MARITIME-ALPHA-LUX",
               "summary": "Hidden UBO chain: 4-layer offshore structure via Cayman — PEP at layer 3",
               "details": {"entity": "ALPHA MARITIME HOLDINGS",
                           "offshore_hops": 4,
                           "pep_detected": True,
                           },
               },
              ),
             (47.0,
              "healing",
              {"bot_id": "sanctions-001",
               "bot_type": "SANCTIONS_BOT",
               "action": "escalate_to_human",
               "reason": "sanctions_hit_unverified",
               "tier": 3,
               "auto_resolved": False,
               "explanation": "[sanctions-001] Sanctions match could not be auto-verified — ESCALATED to human operator.",
               "ts": 0,
               },
              ),
             (53.0,
              "anomaly",
              {"bot_id": "sovereign-001",
               "bot_type": "SOVEREIGN_BOT",
               "score": 77.0,
               "fund_name": "MARITIME-ALPHA-LUX",
               "summary": "Geopolitical exposure: 34% AUM in high-risk jurisdictions (RU, BY, IR)",
               "details": {"high_risk_exposure": 0.34,
                           "top_countries": ["RU",
                                             "BY",
                                             "IR"]},
               },
              ),
             (60.0,
              "anomaly",
              {"bot_id": "yacht-001",
               "bot_type": "ASSET_TRACKER",
               "score": 86.0,
               "fund_name": "MARITIME-ALPHA-LUX",
               "summary": "Superyacht M/Y SOVEREIGN WIND docked: Tartus, Syria — sanctioned port",
               "details": {"asset": "M/Y SOVEREIGN WIND",
                           "location": "Tartus, Syria",
                           "sanctioned": True,
                           },
               },
              ),
             (67.0,
              "healing",
              {"bot_id": "compliance-001",
               "bot_type": "COMPLIANCE_BOT",
               "action": "adjust_quorum",
               "reason": "consensus_failure",
               "tier": 2,
               "auto_resolved": True,
               "explanation": "[compliance-001] Consensus quorum not reached — quorum threshold adjusted from 7 to 5.",
               "ts": 0,
               },
              ),
             (69.0,
              "shadow_attack",
              {"bot_type": "COMPLIANCE_BOT"}),
             (72.0,
              "anomaly",
              {"bot_id": "fuel-001",
               "bot_type": "COMMODITY_MONITOR",
               "score": 81.0,
               "fund_name": "MARITIME-ALPHA-LUX",
               "summary": "Brent crude +7.2% in 4h — correlated with AIS dark events in Persian Gul",
               "details": {"product": "Brent Crude",
                           "price_change_pct": 0.072,
                           "z_score": 2.9},
               },
              ),
             ]


@click.command()
@click.option("--verbose", is_flag=True)
def showcase(verbose: bool):
    """90-second live showcase: forced anomalies, alerts and self-healing events."""
    _setup_logging(verbose)
    cfg = SwarmConfig(use_mock_bus=True, alert_channels=["log"])

    try:
        from rich import box
        from rich.console import Console
        from rich.layout import Layout
        from rich.live import Live
        from rich.panel import Panel
        from rich.table import Table

        console = Console()
    except ImportError:
        click.echo("pip install rich  to run the showcase")
        return

    async def _main():
        bus, bots, commander, alerter, auditor, remediator, shadow = _build_swarm(cfg)
        await bus.connect()

        alerts_seen: list[dict] = []

        async def capture_alert(alert):
            alerts_seen.append(
                {
                    "bot": alert.bot_id,
                    "score": alert.anomaly_score,
                    "severity": alert.severity,
                    "summary": alert.summary[:60],
                    "time": time.strftime("%H:%M:%S"),
                }
            )

        alerter.add_hook(capture_alert)

        cmd_task = asyncio.create_task(commander.start())
        await asyncio.sleep(0.1)
        bot_tasks = [asyncio.create_task(bot.start()) for bot in bots]
        bot_tasks.append(asyncio.create_task(remediator.start()))
        bot_tasks.append(asyncio.create_task(shadow.start()))

        async def _inject_scenario():
            start = time.time()
            for delay, event_type, data in _SCENARIO:
                await asyncio.sleep(max(0, delay - (time.time() - start)))
                if event_type == "anomaly":
                    await bus.publish(
                        f"anomaly.{data['bot_type'].lower()}",
                        {
                            "bot_id": data["bot_id"],
                            "bot_type": data["bot_type"],
                            "score": data["score"],
                            "summary": data["summary"],
                            "details": data["details"],
                        },
                    )
                    severity = "EMERGENCY" if data["score"] >= 90 else "CRITICAL"
                    alert = SwarmAlert(
                        bot_id=data["bot_id"],
                        bot_type=data["bot_type"],
                        fund_name=data.get("fund_name", "SWARM"),
                        anomaly_score=data["score"],
                        severity=severity,
                        consensus="CONFIRMED",
                        summary=data["summary"],
                        details=data["details"],
                        round_id=f"SHOWCASE-{data['bot_id'].upper()}",
                    )
                    await alerter.dispatch(alert)
                elif event_type == "healing":
                    data["ts"] = time.time()
                    await bus.publish(f"healing.{data['bot_id']}", data)
                elif event_type == "feed_failure":
                    await remediator.demo_feed_failure(data.get("feed_id", "ecb_rates"))
                elif event_type == "memory_spike":
                    await remediator.demo_memory_spike(data.get("severity", "HIGH"))
                elif event_type == "shadow_attack":
                    await shadow.inject_attack_wave(data.get("bot_type"))

        inject_task = asyncio.create_task(_inject_scenario())

        def _make_table() -> Panel:
            t = Table(box=box.SIMPLE, show_header=True, header_style="bold cyan")
            t.add_column("Bot ID", width=20)
            t.add_column("Type", width=18)
            t.add_column("Status", width=12)
            t.add_column("Score", width=8, justify="right")
            t.add_column("Last Signal", width=42)
            statuses = commander.get_bot_statuses()
            for bot in bots:
                info = statuses.get(bot.bot_id, {})
                score = info.get("last_score", 0.0)
                status = info.get("status", "STARTING")
                color = (
                    "green"
                    if status == "HEALTHY"
                    else (
                        "yellow"
                        if status == "WARNING"
                        else "red" if status in ("CRITICAL", "OFFLINE") else "cyan"
                    )
                )
                t.add_row(
                    bot.bot_id,
                    bot.BOT_TYPE,
                    f"[{color}]{status}[/{color}]",
                    f"[bold {'red' if score >= 75 else 'yellow' if score >= 50 else 'green'}]{score:.0f}[/bold {'red' if score >= 75 else 'yellow' if score >= 50 else 'green'}]",
                    info.get("last_summary", "Initialising...")[:42],
                )
            return Panel(
                t, title="[bold cyan]GENESIS SWARM — BOT STATUS[/bold cyan]", border_style="cyan"
            )

        def _alert_table() -> Panel:
            t = Table(box=box.SIMPLE, show_header=True, header_style="bold yellow")
            t.add_column("Time", width=10)
            t.add_column("Bot", width=16)
            t.add_column("Score", width=6, justify="right")
            t.add_column("Severity", width=12)
            t.add_column("Summary", width=58)
            for a in alerts_seen[-7:]:
                color = "red" if a["severity"] == "EMERGENCY" else "yellow"
                t.add_row(
                    a.get("time", ""),
                    a["bot"],
                    f"{a['score']:.0f}",
                    f"[{color}]{a['severity']}[/{color}]",
                    a["summary"],
                )
            if not alerts_seen:
                t.add_row("--", "--", "--", "[green]CLEAR[/green]", "No alerts — swarm nominal")
            return Panel(t, title="[bold red]THREAT ALERTS[/bold red]", border_style="red")

        def _healing_table() -> Panel:
            t = Table(box=box.SIMPLE, show_header=True, header_style="bold magenta")
            t.add_column("Bot", width=16)
            t.add_column("Reason", width=28)
            t.add_column("Action", width=26)
            t.add_column("Tier", width=5, justify="center")
            t.add_column("Result", width=12)
            events = commander.get_healing_report(6)
            for e in reversed(events):
                resolved = e["auto_resolved"]
                t.add_row(
                    e["bot_id"],
                    e["reason"],
                    e["action"],
                    str(e["tier"]),
                    "[green]AUTO[/green]" if resolved else "[red]ESCALATED[/red]",
                )
            if not events:
                t.add_row("--", "--", "--", "--", "[green]NOMINAL[/green]")
            return Panel(
                t, title="[bold magenta]SELF-HEALING EVENTS[/bold magenta]", border_style="magenta"
            )

        elapsed_bar_width = 40
        end_time = time.time() + 90

        with Live(console=console, refresh_per_second=2, screen=True) as live:
            while time.time() < end_time:
                elapsed = 90 - (end_time - time.time())
                filled = int((elapsed / 90) * elapsed_bar_width)
                bar = "█" * filled + "░" * (elapsed_bar_width - filled)
                heal_count = len(commander.get_healing_report(100))
                alert_count = len(alerts_seen)

                header = Panel(
                    "[bold cyan]⚡ GENESIS SWARM SHOWCASE[/bold cyan]  "
                    "[white]|[/white]  "
                    "[green]Bots: 11[/green]  "
                    f"[yellow]Alerts: {alert_count}[/yellow]  "
                    f"[magenta]Self-Heals: {heal_count}[/magenta]  "
                    "[white]|[/white]  "
                    f"[dim]{bar}[/dim] [cyan]{int(elapsed)}s[/cyan]",
                    border_style="blue",
                )

                layout = Layout()
                layout.split_column(
                    Layout(header, name="header", size=3),
                    Layout(name="middle", ratio=5),
                    Layout(_healing_table(), name="healing", ratio=2),
                )
                layout["middle"].split_row(
                    Layout(_make_table(), name="bots", ratio=3),
                    Layout(_alert_table(), name="alerts", ratio=2),
                )
                live.update(layout)
                await asyncio.sleep(0.5)

        inject_task.cancel()
        for bot in bots:
            bot.stop()
        commander.stop()
        for t in bot_tasks:
            t.cancel()
        cmd_task.cancel()
        await asyncio.gather(*bot_tasks, cmd_task, inject_task, return_exceptions=True)
        auditor.flush()
        await bus.disconnect()
        console.print(
            "\n[bold green]Showcase complete.[/bold green] 90 seconds. 11 bots. All threats detected.\n"
        )

    asyncio.run(_main())
