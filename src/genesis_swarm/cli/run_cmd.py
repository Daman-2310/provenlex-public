from __future__ import annotations

import asyncio
import signal

import click

from ._common import SwarmConfig, _build_swarm, _setup_logging


@click.command()
@click.option("--verbose", is_flag=True, help="Enable debug logging")
@click.option("--alert-stdout", is_flag=True, default=True, help="Print alerts to terminal")
@click.option("--mock-bus", is_flag=True, default=True, help="Use in-process mock message bus")
def run(verbose: bool, alert_stdout: bool, mock_bus: bool):
    """Start all 11 bots simultaneously."""
    _setup_logging(verbose)
    cfg = SwarmConfig(
        use_mock_bus=mock_bus,
        alert_channels=["stdout", "log"] if alert_stdout else ["log"],
    )

    async def _main():
        bus, bots, commander, alerter, auditor, remediator, shadow = _build_swarm(cfg)

        click.echo("\n" + "═" * 60)
        click.echo("  GENESIS SWARM — Starting 11 bots + Remediation Engine")
        click.echo("═" * 60)
        for bot in bots:
            click.echo(f"  ✓ {bot.bot_id:20s} [{bot.BOT_TYPE}]")
        click.echo(f"  ✓ {'commander-001':20s} [COMMANDER_BOT]")
        click.echo(f"  ✓ {'remediation':20s} [MEMORY_GUARDIAN + FEED_SENTINEL]")
        click.echo(f"  ✓ {'shadow-001':20s} [ADVERSARIAL_TESTER / ADVERSARIAL_RL]")
        click.echo("═" * 60 + "\n")

        await bus.connect()

        cmd_task = asyncio.create_task(commander.start())
        await asyncio.sleep(0.1)
        tasks = [asyncio.create_task(bot.start()) for bot in bots]
        tasks.append(cmd_task)
        tasks.append(asyncio.create_task(remediator.start()))
        tasks.append(asyncio.create_task(shadow.start()))

        loop = asyncio.get_running_loop()
        stop_event = asyncio.Event()

        def _signal_handler():
            click.echo("\n[Swarm] Shutdown signal received — stopping all bots...")
            for bot in bots:
                bot.stop()
            commander.stop()
            remediator.stop()
            shadow.stop()
            stop_event.set()

        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, _signal_handler)
            except NotImplementedError:
                pass

        try:
            await stop_event.wait()
        finally:
            for t in tasks:
                t.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            auditor.flush()
            await bus.disconnect()
            click.echo("[Swarm] All bots stopped. Audit log flushed.")

    asyncio.run(_main())
