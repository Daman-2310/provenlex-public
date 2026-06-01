"""
ARQ background task definitions for Genesis Swarm.

ARQ uses Redis as its queue backend — the same instance already in the stack.
Tasks here are the async counterparts of the in-process alert/email/slack
functions in server.py, plus the webhook delivery retry path.

Registering a task with ARQ:
    from arq.connections import create_pool, RedisSettings
    pool = await create_pool(RedisSettings.from_dsn(os.getenv("GENESIS_REDIS_URL")))
    await pool.enqueue_job("send_alert_email", bot_type, score, summary)

The worker picks it up, executes it, and persists the result in Redis.
"""
from __future__ import annotations

import json
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

_log = logging.getLogger(__name__)

_AUM_EXPOSURE = {
    "NAV_DETECTOR": 450, "CARGO_BOT": 380, "COMMODITY_MONITOR": 290,
    "SANCTIONS_BOT": 510, "FX_BOT": 670, "COMPLIANCE_BOT": 320,
    "SUCCESSION_BOT": 180, "SOVEREIGN_BOT": 240, "ASSET_TRACKER": 410,
    "SATELLITE_ANALYTICS": 150, "ADVERSARIAL_TESTER": 200,
}


async def send_alert_email(ctx: dict, bot_type: str, score: float, summary: str) -> bool:
    """Send an anomaly alert email.  Runs in the ARQ worker process."""
    import asyncio
    from ..api.server import _send_alert_email
    try:
        return await asyncio.to_thread(_send_alert_email, bot_type, score, summary)
    except Exception as exc:
        _log.error("send_alert_email_failed", bot_type=bot_type, error=str(exc))
        return False


async def send_slack_alert(ctx: dict, bot_type: str, score: float, summary: str) -> bool:
    """Send an anomaly Slack alert.  Runs in the ARQ worker process."""
    import asyncio
    from ..api.server import _send_slack_alert
    try:
        return await asyncio.to_thread(_send_slack_alert, bot_type, score, summary)
    except Exception as exc:
        _log.error("send_slack_alert_failed", bot_type=bot_type, error=str(exc))
        return False


async def deliver_webhook_event(ctx: dict, event_type: str, data: dict[str, Any]) -> list[str]:
    """
    Retry path for webhook delivery.

    Enqueued by the main process when in-process delivery fails or when
    defer_to_worker=True is passed.  The ARQ retry policy will re-run this
    task up to max_tries times with exponential back-off.
    """
    from ..shared.webhooks import deliver_event
    try:
        return await deliver_event(event_type, data)
    except Exception as exc:
        _log.error("deliver_webhook_failed", event=event_type, error=str(exc))
        return []


async def reload_ofac_sdn(ctx: dict) -> dict:
    """Refresh the OFAC SDN list in the background.  Safe to run on a schedule."""
    try:
        from ..compliance.ofac_screener import OFACScreener
        screener = OFACScreener()
        await screener.load_sdn_async()
        _log.info("ofac_reload_complete", entries=len(screener._sdn_entries))
        return {"status": "ok", "entries": len(screener._sdn_entries)}
    except Exception as exc:
        _log.error("ofac_reload_failed", error=str(exc))
        return {"status": "error", "error": str(exc)}
