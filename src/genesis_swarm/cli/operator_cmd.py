from __future__ import annotations

import click


@click.command("operator-stop")
@click.option("--port", default=8765, help="Dashboard port")
@click.option(
    "--key",
    envvar="SWARM_OPERATOR_KEY",
    prompt="Operator key",
    hide_input=True,
    help="Operator key (or set SWARM_OPERATOR_KEY env var)",
)
def operator_stop(port: int, key: str):
    """OPERATOR: Shut down the entire swarm immediately."""
    try:
        import httpx
    except ImportError:
        click.echo("pip install httpx")
        return

    click.echo("\n  ⚡ Genesis Swarm — Operator Authority")
    click.echo(f"  Sending shutdown command to http://localhost:{port} ...\n")

    try:
        r = httpx.post(f"http://localhost:{port}/operator/shutdown", json={"key": key}, timeout=5.0)
        data = r.json()
        if data.get("accepted"):
            click.echo(f"  ✓ {data['result']}")
            click.echo("\n  All bots stopped by operator authority.\n")
        else:
            click.echo("  ✗ REJECTED — invalid operator key\n")
    except Exception:
        click.echo(f"  ✗ Cannot reach swarm at port {port} — is the dashboard running?\n")


@click.command("operator-quarantine")
@click.argument("bot_id")
@click.option("--port", default=8765, help="Dashboard port")
@click.option(
    "--key",
    envvar="SWARM_OPERATOR_KEY",
    prompt="Operator key",
    hide_input=True,
    help="Operator key (or set SWARM_OPERATOR_KEY env var)",
)
def operator_quarantine(bot_id: str, port: int, key: str):
    """OPERATOR: Quarantine a specific bot immediately. BOT_ID e.g. cargo-001"""
    try:
        import httpx
    except ImportError:
        click.echo("pip install httpx")
        return

    click.echo("\n  ⚡ Genesis Swarm — Operator Authority")
    click.echo(f"  Quarantining {bot_id} ...\n")

    try:
        r = httpx.post(
            f"http://localhost:{port}/operator/quarantine/{bot_id}", json={"key": key}, timeout=5.0
        )
        data = r.json()
        if data.get("accepted"):
            click.echo(f"  ✓ {data['result']}\n")
        else:
            click.echo(f"  ✗ REJECTED — {data.get('result', 'invalid key')}\n")
    except Exception:
        click.echo(f"  ✗ Cannot reach swarm at port {port} — is the dashboard running?\n")
