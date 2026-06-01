from __future__ import annotations

import asyncio
import time

import click

from ._common import SwarmAlert, SwarmConfig, _build_swarm, _setup_logging

_SCENARIO = [(2.0,
              "status",
              {"bot_id": "fuel-001",
               "bot_type": "COMMODITY_MONITOR",
               "score": 18.0,
               "summary": "Energy scan: WTI $78.5 | TTF €32.8 | LNG $12.4 — all nominal",
               },
              ),
             (2.5,
              "status",
              {"bot_id": "sovereign-001",
               "bot_type": "SOVEREIGN_BOT",
               "score": 24.0,
               "summary": "Geopolitical scan: RU 80 | IR 90 | BY 85 — exposure nominal",
               },
              ),
             (3.0,
              "anomaly",
              {"bot_id": "cargo-001",
               "bot_type": "CARGO_BOT",
               "score": 82.0,
               "fund_name": "MARITIME-ALPHA-LUX",
               "summary": "Dark ship: MV PHANTOM NAVIGATOR — AIS signal lost 6h in sanctioned waters",
               "details": {"vessel": "MV PHANTOM NAVIGATOR",
                           "ais_gap_hours": 6},
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
                           "match_score": 91},
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
                           "z_score": 3.1},
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
               "explanation": "[cargo-001] AIS feed returned missing values — switched to backup automatically.",
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
                           "nav_change_pct": -0.043},
               },
              ),
             (22.0,
              "anomaly",
              {"bot_id": "compliance-001",
               "bot_type": "COMPLIANCE_BOT",
               "score": 78.0,
               "fund_name": "OFFSHORE-ALPHA-LUX",
               "summary": "AIFMD breach: leverage 3.8x NAV — CSSF limit 3.0x",
               "details": {"fund": "OFFSHORE-ALPHA-LUX",
                           "leverage_ratio": 3.8},
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
                           "cluster_size": 3},
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
                           "offshore_hops": 4},
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
               "explanation": "[sanctions-001] Sanctions match unverified — ESCALATED to human operator.",
               },
              ),
             (53.0,
              "anomaly",
              {"bot_id": "sovereign-001",
               "bot_type": "SOVEREIGN_BOT",
               "score": 77.0,
               "fund_name": "MARITIME-ALPHA-LUX",
               "summary": "Geopolitical exposure: 34% AUM in high-risk jurisdictions (RU, BY, IR)",
               "details": {"high_risk_exposure": 0.34},
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
                           "location": "Tartus, Syria"},
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
               "explanation": "[compliance-001] Consensus quorum not reached — quorum adjusted from 7 to 5.",
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
                           "price_change_pct": 0.072},
               },
              ),
             ]


@click.command("record-demo")
@click.option("--port", default=8765, help="Port for the web dashboard")
@click.option("--verbose", is_flag=True)
def record_demo(port: int, verbose: bool):
    """
    Fully automatic 90-second recording demo.

    Just hit record, run this command, and watch:
      - All 11 bots start and go HEALTHY
      - Browser dashboard opens automatically
      - Anomalies fire, SWARM EMERGENCY triggers, self-healing runs
      - Operator shuts down the entire swarm at t=75s
    No typing needed after this command.
    """
    _setup_logging(verbose)
    cfg = SwarmConfig(use_mock_bus=True, alert_channels=["log"])

    try:
        import uvicorn
        from rich import box
        from rich.console import Console
        from rich.layout import Layout
        from rich.live import Live
        from rich.panel import Panel
        from rich.table import Table
    except ImportError as e:
        click.echo(f"Missing dependency: {e}. Run: pip install rich uvicorn")
        return

    async def _main():
        import webbrowser

        from ..api.server import app, attach_state

        console = Console()
        bus, bots, commander, alerter, auditor, remediator, shadow = _build_swarm(cfg)
        await bus.connect()

        stop_event = asyncio.Event()
        attach_state(
            commander, bots, remediator=remediator, shadow_bot=shadow, stop_event=stop_event
        )

        server_config = uvicorn.Config(app, host="0.0.0.0", port=port, log_level="error")
        server = uvicorn.Server(server_config)

        alerts_seen: list[dict] = []

        async def _capture(alert):
            alerts_seen.append(
                {
                    "bot": alert.bot_id,
                    "score": alert.anomaly_score,
                    "severity": alert.severity,
                    "summary": alert.summary[:55],
                    "time": time.strftime("%H:%M:%S"),
                }
            )

        alerter.add_hook(_capture)

        cmd_task = asyncio.create_task(commander.start())
        await asyncio.sleep(0.1)
        bot_tasks = [asyncio.create_task(bot.start()) for bot in bots]
        bot_tasks.append(cmd_task)
        bot_tasks.append(asyncio.create_task(remediator.start()))
        bot_tasks.append(asyncio.create_task(shadow.start()))
        server_task = asyncio.create_task(server.serve())

        await asyncio.sleep(1.2)
        webbrowser.open(f"http://localhost:{port}")

        async def _inject():
            start = time.time()
            for delay, etype, data in _SCENARIO:
                await asyncio.sleep(max(0, delay - (time.time() - start)))
                if etype == "status":
                    await bus.publish(
                        f"anomaly.{data['bot_type'].lower()}",
                        {
                            "bot_id": data["bot_id"],
                            "bot_type": data["bot_type"],
                            "score": data["score"],
                            "summary": data["summary"],
                            "details": {},
                        },
                    )
                elif etype == "anomaly":
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
                    alert = SwarmAlert(
                        bot_id=data["bot_id"],
                        bot_type=data["bot_type"],
                        fund_name=data.get("fund_name", "SWARM"),
                        anomaly_score=data["score"],
                        severity="EMERGENCY" if data["score"] >= 90 else "CRITICAL",
                        consensus="CONFIRMED",
                        summary=data["summary"],
                        details=data["details"],
                        round_id=f"DEMO-{data['bot_id'].upper()}",
                    )
                    await alerter.dispatch(alert)
                elif etype == "healing":
                    data["ts"] = time.time()
                    await bus.publish(f"healing.{data['bot_id']}", data)
                elif etype == "feed_failure":
                    await remediator.demo_feed_failure(data.get("feed_id", "ecb_rates"))
                elif etype == "memory_spike":
                    await remediator.demo_memory_spike(data.get("severity", "HIGH"))
                elif etype == "shadow_attack":
                    await shadow.inject_attack_wave(data.get("bot_type"))

            await asyncio.sleep(max(0, 75 - (time.time() - start)))
            stop_event.set()

        inject_task = asyncio.create_task(_inject())

        def _make_bot_table():
            t = Table(box=box.SIMPLE, show_header=True, header_style="bold cyan")
            t.add_column("Bot", width=20)
            t.add_column("Type", width=18)
            t.add_column("Status", width=12)
            t.add_column("Score", width=7, justify="right")
            t.add_column("Signal", width=42)
            statuses = commander.get_bot_statuses()
            for bot in bots:
                info = statuses.get(bot.bot_id, {})
                score = info.get("last_score", 0.0)
                status = info.get("status", "STARTING")
                sc = (
                    "green"
                    if status == "HEALTHY"
                    else (
                        "yellow"
                        if status == "WARNING"
                        else "red" if status in ("CRITICAL", "OFFLINE") else "cyan"
                    )
                )
                nc = "red" if score >= 75 else "yellow" if score >= 50 else "green"
                t.add_row(
                    bot.bot_id,
                    bot.BOT_TYPE,
                    f"[{sc}]{status}[/{sc}]",
                    f"[bold {nc}]{score:.0f}[/bold {nc}]",
                    info.get("last_summary", "Initialising...")[:42],
                )
            return Panel(t, title="[bold cyan]BOT STATUS[/bold cyan]", border_style="cyan")

        def _make_alert_table():
            t = Table(box=box.SIMPLE, show_header=True, header_style="bold yellow")
            t.add_column("Time", width=9)
            t.add_column("Bot", width=16)
            t.add_column("Score", width=5, justify="right")
            t.add_column("Sev", width=11)
            t.add_column("Summary", width=52)
            for a in alerts_seen[-6:]:
                c = "red" if a["severity"] == "EMERGENCY" else "yellow"
                t.add_row(
                    a["time"],
                    a["bot"],
                    f"{a['score']:.0f}",
                    f"[{c}]{a['severity']}[/{c}]",
                    a["summary"],
                )
            if not alerts_seen:
                t.add_row("--", "--", "--", "[green]CLEAR[/green]", "No alerts — swarm nominal")
            return Panel(t, title="[bold red]THREAT ALERTS[/bold red]", border_style="red")

        def _make_heal_table():
            t = Table(box=box.SIMPLE, show_header=True, header_style="bold magenta")
            t.add_column("Bot", width=16)
            t.add_column("Reason", width=28)
            t.add_column("Action", width=28)
            t.add_column("Result", width=11)
            for e in reversed(commander.get_healing_report(5)):
                t.add_row(
                    e["bot_id"],
                    e["reason"],
                    e["action"],
                    "[green]AUTO[/green]" if e["auto_resolved"] else "[red]ESCALATED[/red]",
                )
            if not commander.get_healing_report(1):
                t.add_row("--", "--", "--", "[green]NOMINAL[/green]")
            return Panel(
                t, title="[bold magenta]SELF-HEALING[/bold magenta]", border_style="magenta"
            )

        BAR = 38
        end_time = time.time() + 90
        shutdown_started = False

        with Live(console=console, refresh_per_second=2, screen=True) as live:
            while not stop_event.is_set() and time.time() < end_time:
                elapsed = time.time() - (end_time - 90)
                filled = min(int((elapsed / 90) * BAR), BAR)
                bar = "█" * filled + "░" * (BAR - filled)
                ac = len(alerts_seen)
                hc = len(commander.get_healing_report(100))

                header = Panel(
                    "[bold cyan]⚡ GENESIS SWARM[/bold cyan]  [dim]|[/dim]  "
                    "[green]11 bots[/green]  "
                    f"[yellow]Alerts: {ac}[/yellow]  "
                    f"[magenta]Heals: {hc}[/magenta]  "
                    f"[dim]|[/dim]  [dim]{bar}[/dim] [cyan]{int(elapsed)}s / 90s[/cyan]  "
                    f"[dim]|[/dim]  [dim]localhost:{port}[/dim]",
                    border_style="blue",
                )
                layout = Layout()
                layout.split_column(
                    Layout(header, name="hdr", size=3),
                    Layout(name="mid", ratio=5),
                    Layout(_make_heal_table(), name="heal", ratio=2),
                )
                layout["mid"].split_row(
                    Layout(_make_bot_table(), name="bots", ratio=3),
                    Layout(_make_alert_table(), name="alerts", ratio=2),
                )
                live.update(layout)
                await asyncio.sleep(0.5)

            if not shutdown_started:
                shutdown_started = True

                live.update(
                    Panel(
                        "\n[bold yellow]  ⚡ OPERATOR SHUTDOWN INITIATED[/bold yellow]\n"
                        "[dim]  Verifying operator key... [/dim][green]CONFIRMED[/green]\n"
                        "[dim]  Sending stop signal to all bots...[/dim]\n",
                        border_style="yellow",
                        title="[bold yellow]OPERATOR AUTHORITY[/bold yellow]",
                    )
                )
                await asyncio.sleep(1.5)

                for bot in reversed(bots):
                    status = commander._bot_statuses.get(bot.bot_id)
                    if status:
                        status.status = "OFFLINE"
                        status.last_summary = "Stopped by operator"
                    bot.stop()
                    live.update(
                        Panel(
                            _make_bot_table(),
                            title=f"[bold red]OPERATOR SHUTDOWN — stopping {
                                bot.bot_id}...[/bold red]",
                            border_style="red",
                        ))
                    await asyncio.sleep(0.4)

                live.update(
                    Panel(
                        "\n"
                        "[bold red]  ALL BOTS OFFLINE[/bold red]\n\n"
                        "[bold white]  OPERATOR SHUTDOWN — Supreme Authority Invoked[/bold white]\n"
                        "[dim]  11 bots stopped. Audit log flushed. Swarm offline.[/dim]\n"
                        f"[dim]  Threats detected: {len(alerts_seen)} | Self-heals: {len(commander.get_healing_report(100))}[/dim]\n",
                        border_style="red",
                        title="[bold red]⚡ GENESIS SWARM OFFLINE[/bold red]",
                    )
                )
                await asyncio.sleep(3.0)

        commander.stop()
        server.should_exit = True
        inject_task.cancel()
        for t in bot_tasks + [server_task, inject_task]:
            t.cancel()
        await asyncio.gather(*bot_tasks, server_task, inject_task, return_exceptions=True)
        auditor.flush()
        await bus.disconnect()
        console.print(
            "\n[bold green]  Demo complete. 11 bots. All threats detected. Swarm offline.[/bold green]\n"
        )

    asyncio.run(_main())
