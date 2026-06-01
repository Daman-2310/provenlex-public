from __future__ import annotations

import asyncio
import shutil
import signal
import subprocess
from pathlib import Path

import click

from ..metrics.prometheus_exporter import METRICS
from ..shared.memory.chromadb_store import InstitutionalMemory
from ..shared.memory.rag_engine import RAGEngine
from ..shared.security.audit_replay import AuditReplayer
from ..shared.security.merkle_tree import MerkleAuditLog
from ..shared.security.pii_masker import PIIMasker
from ..shared.security.trust_verifier import TrustVerifier
from ._common import ChaosMonkeyBot, SwarmConfig, _build_swarm, _setup_logging


@click.command()
@click.option("--port", default=8000, help="Port for the Python API backend")
@click.option("--ui-port", default=3000, help="Port for the Next.js Bloomberg UI")
@click.option("--no-ui", is_flag=True, help="Skip the Next.js UI, API only")
@click.option("--verbose", is_flag=True)
def dashboard(port: int, ui_port: int, no_ui: bool, verbose: bool):
    """Start all 11 bots + Bloomberg UI in one command. No second terminal needed."""
    _setup_logging(verbose)
    cfg = SwarmConfig(use_mock_bus=True, alert_channels=["log"])

    ui_dir = Path(__file__).resolve().parents[3] / "jarvis-ui"

    def _start_ui() -> "subprocess.Popen | None":
        if no_ui:
            return None
        npm = shutil.which("npm")
        if not npm:
            for candidate in [
                Path.home() / "local/node/bin/npm",
                Path("/usr/local/bin/npm"),
                Path("/opt/homebrew/bin/npm"),
            ]:
                if candidate.exists():
                    npm = str(candidate)
                    break
        if not npm:
            click.echo("  [UI] npm not found — skipping Next.js UI (API only)")
            click.echo("  [UI] Install Node.js to enable the Bloomberg terminal.\n")
            return None
        if not (ui_dir / "node_modules").exists():
            click.echo("  [UI] Running npm install (first time, ~30s)…")
            subprocess.run(
                [npm, "install"],
                cwd=ui_dir,
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        env = {
            **__import__("os").environ,
            "NEXT_PUBLIC_API_URL": f"http://localhost:{port}",
            "PORT": str(ui_port),
        }
        proc = subprocess.Popen(
            [npm, "run", "dev"],
            cwd=ui_dir,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return proc

    async def _main():
        import webbrowser

        try:
            import uvicorn
        except ImportError:
            click.echo("pip3 install uvicorn  to run the dashboard")
            return

        from ..api.server import app, attach_state

        ui_proc = await asyncio.get_event_loop().run_in_executor(None, _start_ui)

        bus, bots, commander, alerter, auditor, remediator, shadow = _build_swarm(cfg)
        await bus.connect()

        stop_event = asyncio.Event()

        merkle = MerkleAuditLog()
        trust = TrustVerifier()
        pii = PIIMasker()
        memory = InstitutionalMemory()
        rag = RAGEngine(memory)
        chaos = ChaosMonkeyBot(bots=bots, bus=bus, alerter=alerter, auditor=auditor)
        replayer = AuditReplayer(merkle_log=merkle, audit_logger=auditor)

        METRICS.start_http_server(9091)

        attach_state(
            commander,
            bots,
            remediator=remediator,
            shadow_bot=shadow,
            stop_event=stop_event,
            memory=memory,
            rag=rag,
            merkle=merkle,
            trust=trust,
            pii_masker=pii,
            chaos_monkey=chaos,
            audit_replayer=replayer,
            metrics=METRICS,
        )

        ui_url = f"http://localhost:{ui_port}" if ui_proc else f"http://localhost:{port}"
        click.echo(f"\n  ● Bloomberg UI  — {ui_url}")
        click.echo(f"  ● API backend   — http://localhost:{port}")
        click.echo("  ● Prometheus    — http://localhost:9091/metrics")
        click.echo("  ● Modules       — Merkle ✓  Trust ✓  PII ✓  RAG ✓  Chaos ✓")
        if ui_proc:
            click.echo("  ● Next.js       — starting, ready in ~5s…")
        click.echo()

        server_config = uvicorn.Config(app, host="0.0.0.0", port=port, log_level="error")
        server = uvicorn.Server(server_config)

        cmd_task = asyncio.create_task(commander.start())
        await asyncio.sleep(0.1)
        bot_tasks = [asyncio.create_task(bot.start()) for bot in bots]
        bot_tasks.append(cmd_task)
        bot_tasks.append(asyncio.create_task(remediator.start()))
        bot_tasks.append(asyncio.create_task(shadow.start()))
        bot_tasks.append(asyncio.create_task(chaos.start()))
        server_task = asyncio.create_task(server.serve())

        loop = asyncio.get_running_loop()

        def _signal_handler():
            click.echo("\n[Swarm] Shutting down…")
            for bot in bots:
                bot.stop()
            commander.stop()
            remediator.stop()
            shadow.stop()
            server.should_exit = True
            stop_event.set()
            if ui_proc and ui_proc.poll() is None:
                ui_proc.terminate()

        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, _signal_handler)
            except NotImplementedError:
                pass

        if ui_proc:
            await asyncio.sleep(6)
        else:
            await asyncio.sleep(1.2)
        webbrowser.open(ui_url)

        await stop_event.wait()
        for t in bot_tasks + [server_task]:
            t.cancel()
        await asyncio.gather(*bot_tasks, server_task, return_exceptions=True)
        if ui_proc and ui_proc.poll() is None:
            ui_proc.terminate()
        auditor.flush()
        await bus.disconnect()
        click.echo("[Swarm] All bots stopped. Audit log flushed.")

    asyncio.run(_main())
