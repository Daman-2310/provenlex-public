from __future__ import annotations

import asyncio
import time

import click

from ._common import SwarmConfig, _build_swarm, _setup_logging


@click.command()
@click.option("--verbose", is_flag=True)
def demo(verbose: bool):
    """Run a 60-second demo showing all bots and the Commander dashboard."""
    _setup_logging(verbose)
    cfg = SwarmConfig(use_mock_bus=True, alert_channels=["log"])

    try:
        from rich import box
        from rich.console import Console
        from rich.live import Live
        from rich.panel import Panel
        from rich.table import Table

        console = Console()
    except ImportError:
        click.echo("pip install rich  to run the demo dashboard")
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
                    "summary": alert.summary[:55],
                    "time": time.strftime("%H:%M:%S"),
                }
            )

        alerter.add_hook(capture_alert)

        cmd_task = asyncio.create_task(commander.start())
        await asyncio.sleep(0.1)
        bot_tasks = [asyncio.create_task(bot.start()) for bot in bots]
        bot_tasks.append(asyncio.create_task(remediator.start()))
        bot_tasks.append(asyncio.create_task(shadow.start()))

        def _make_table() -> Panel:
            t = Table(box=box.SIMPLE, show_header=True, header_style="bold cyan")
            t.add_column("Bot ID", width=20)
            t.add_column("Type", width=18)
            t.add_column("Status", width=10)
            t.add_column("Score", width=8, justify="right")
            t.add_column("Last Signal", width=40)

            statuses = commander.get_bot_statuses()
            for bot in bots:
                info = statuses.get(bot.bot_id, {})
                score = info.get("last_score", 0.0)
                status = info.get("status", "STARTING")
                color = (
                    "green" if status == "HEALTHY" else "yellow" if status == "WARNING" else "red"
                )
                t.add_row(
                    bot.bot_id,
                    bot.BOT_TYPE,
                    f"[{color}]{status}[/{color}]",
                    f"{score:.0f}",
                    info.get("last_summary", "Initialising...")[:40],
                )
            return Panel(t, title="[bold]GENESIS SWARM DASHBOARD[/bold]", border_style="blue")

        def _alert_table() -> Panel:
            t = Table(box=box.SIMPLE, show_header=True, header_style="bold yellow")
            t.add_column("Time", width=10)
            t.add_column("Bot", width=18)
            t.add_column("Score", width=7, justify="right")
            t.add_column("Severity", width=12)
            t.add_column("Summary", width=55)
            for a in alerts_seen[-6:]:
                color = (
                    "red"
                    if a["severity"] == "EMERGENCY"
                    else "yellow" if a["severity"] == "CRITICAL" else "white"
                )
                t.add_row(
                    a.get("time", ""),
                    a["bot"],
                    f"{a['score']:.0f}",
                    f"[{color}]{a['severity']}[/{color}]",
                    a["summary"],
                )
            if not alerts_seen:
                t.add_row("--", "--", "--", "[green]CLEAR[/green]", "No alerts yet — swarm nominal")
            return Panel(t, title="[bold red]RECENT ALERTS[/bold red]", border_style="red")

        end_time = time.time() + 60

        from rich.layout import Layout

        with Live(console=console, refresh_per_second=1, screen=True) as live:
            while time.time() < end_time:
                layout = Layout()
                layout.split_column(
                    Layout(_make_table(), name="bots", ratio=2),
                    Layout(_alert_table(), name="alerts", ratio=1),
                )
                live.update(layout)
                await asyncio.sleep(1.0)

        for bot in bots:
            bot.stop()
        commander.stop()
        for t in bot_tasks:
            t.cancel()
        cmd_task.cancel()
        await asyncio.gather(*bot_tasks, cmd_task, return_exceptions=True)
        auditor.flush()
        await bus.disconnect()
        console.print("\n[green]Demo complete.[/green] All bots stopped.")

    asyncio.run(_main())
