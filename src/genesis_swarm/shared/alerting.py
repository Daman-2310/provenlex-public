from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Awaitable, Callable

try:
    import httpx
except ImportError:
    httpx = None  # type: ignore[assignment]

log = logging.getLogger(__name__)

AlertHook = Callable[["SwarmAlert"], Awaitable[None]]


@dataclass
class SwarmAlert:
    bot_id: str
    bot_type: str
    fund_name: str
    anomaly_score: float
    severity: str  # INFO | WARNING | CRITICAL | EMERGENCY
    consensus: str  # CONFIRMED | REJECTED | INCONCLUSIVE
    summary: str
    details: dict
    round_id: str
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict:
        return self.__dict__.copy()

    def to_text(self) -> str:
        lines = [
            "[GENESIS SWARM ALERT]",
            f"Bot       : {self.bot_id} ({self.bot_type})",
            f"Severity  : {self.severity}",
            f"Fund      : {self.fund_name}",
            f"Score     : {self.anomaly_score:.1f}/100",
            f"Consensus : {self.consensus}",
            f"Summary   : {self.summary}",
            f"Round     : {self.round_id}",
            f"Time      : {self.timestamp}",
        ]
        return "\n".join(lines)


class AlertDispatcher:
    def __init__(
        self,
        channels: list[str] | None = None,
        webhook_url: str | None = None,
        min_score_for_emergency: float = 90.0,
    ):
        self.channels = channels or ["log"]
        self.webhook_url = webhook_url
        self.min_score_for_emergency = min_score_for_emergency
        self._sent: list[SwarmAlert] = []
        self._hooks: list[AlertHook] = []

    def add_hook(self, hook: AlertHook) -> None:
        self._hooks.append(hook)

    async def dispatch(self, alert: SwarmAlert) -> None:
        if alert.anomaly_score >= self.min_score_for_emergency:
            alert.severity = "EMERGENCY"

        for channel in self.channels:
            try:
                if channel == "stdout":
                    await self._send_stdout(alert)
                elif channel == "log":
                    await self._send_log(alert)
                elif channel == "webhook":
                    await self._send_webhook(alert)
            except Exception as e:
                log.error("Alert channel '%s' failed: %s", channel, e)

        for hook in self._hooks:
            try:
                await hook(alert)
            except Exception as e:
                log.error("Alert hook failed: %s", e)

        self._sent.append(alert)

    @staticmethod
    async def _send_stdout(alert: SwarmAlert) -> None:
        border = "═" * 60
        print(f"\n{border}\n{alert.to_text()}\n{border}\n")

    @staticmethod
    async def _send_log(alert: SwarmAlert) -> None:
        log.critical(
            "SWARM ALERT | bot=%s score=%.1f consensus=%s severity=%s | %s",
            alert.bot_id,
            alert.anomaly_score,
            alert.consensus,
            alert.severity,
            alert.summary,
        )

    async def _send_webhook(self, alert: SwarmAlert) -> None:
        if not self.webhook_url or httpx is None:
            return
        import asyncio

        async with httpx.AsyncClient(timeout=5.0) as client:
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    resp = await client.post(self.webhook_url, json=alert.to_dict())
                    resp.raise_for_status()
                    log.info("Webhook delivered: HTTP %d", resp.status_code)
                    return
                except Exception as e:
                    if attempt < max_retries - 1:
                        backoff = 2**attempt
                        log.warning(f"Webhook failed, retrying in {backoff}s: {e}")
                        await asyncio.sleep(backoff)
                    else:
                        log.error(f"Webhook failed after {max_retries} attempts: {e}")

    @property
    def sent(self) -> list[SwarmAlert]:
        return list(self._sent)

    @property
    def emergency_count(self) -> int:
        return sum(1 for a in self._sent if a.severity == "EMERGENCY")

    def clear(self) -> None:
        self._sent.clear()
