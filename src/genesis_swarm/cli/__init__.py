from __future__ import annotations

import click

from .dashboard_cmd import dashboard
from .demo_cmd import demo
from .operator_cmd import operator_quarantine, operator_stop
from .record_cmd import record_demo
from .run_cmd import run
from .showcase_cmd import showcase
from .status_cmd import status


@click.group()
def cli():
    """Genesis Swarm — 10-bot autonomous RegTech swarm + adversarial sidecar for Luxembourg hedge funds."""


cli.add_command(run)
cli.add_command(demo)
cli.add_command(dashboard)
cli.add_command(showcase)
cli.add_command(record_demo)
cli.add_command(operator_stop)
cli.add_command(operator_quarantine)
cli.add_command(status)
