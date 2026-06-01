"""
Signed webhook delivery for Genesis Swarm.

Design follows the pattern used by Stripe, GitHub, and Twilio:
  - Each registered webhook has its own secret (or uses the global GENESIS_WEBHOOK_SECRET)
  - Payload is signed with HMAC-SHA256: X-Genesis-Signature: sha256=<hex>
  - Timestamp header (X-Genesis-Timestamp) lets receivers reject replayed payloads
  - Delivery is retried up to 3 times with exponential back-off via ARQ

Webhook registration is persisted in Redis (hash key genesis:webhooks).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any

import aiohttp

_WEBHOOK_SECRET = os.getenv("GENESIS_WEBHOOK_SECRET", "")
_REDIS_KEY = "genesis:webhooks"
_DELIVERY_TIMEOUT = aiohttp.ClientTimeout(total=10)

# Supported event types — extend as new subsystems emit events
WEBHOOK_EVENTS = frozenset([
    "alert.triggered",
    "case.created",
    "case.updated",
    "case.deleted",
    "consensus.quorum_lost",
    "consensus.quorum_restored",
    "bot.quarantined",
    "bot.healthy",
])


@dataclass
class WebhookRegistration:
    id: str
    url: str
    events: list[str]          # ["*"] means subscribe to all
    description: str
    created_at: float = field(default_factory=time.time)
    active: bool = True
    # Per-webhook secret overrides the global one; leave empty to use global
    secret: str = ""

    def matches(self, event_type: str) -> bool:
        return self.active and ("*" in self.events or event_type in self.events)

    def signing_secret(self) -> str:
        return self.secret or _WEBHOOK_SECRET

    def to_dict(self) -> dict:
        d = asdict(self)
        d.pop("secret", None)   # never expose the per-webhook secret over the API
        return d


# ── Registry (Redis-backed) ────────────────────────────────────────────────────

def _get_redis():
    """Lazy import to avoid circular dependency with auth module."""
    try:
        from ..api.routes.auth import _get_redis as _auth_redis
        return _auth_redis()
    except Exception:
        return None


def register_webhook(url: str, events: list[str], description: str = "", secret: str = "") -> WebhookRegistration:
    """Persist a new webhook registration to Redis.  Returns the created object."""
    unknown = [e for e in events if e != "*" and e not in WEBHOOK_EVENTS]
    if unknown:
        raise ValueError(f"Unknown event type(s): {unknown}.  Valid: {sorted(WEBHOOK_EVENTS)}")

    wh = WebhookRegistration(
        id=str(uuid.uuid4()),
        url=url,
        events=events,
        description=description,
        secret=secret,
    )
    r = _get_redis()
    if r:
        r.hset(_REDIS_KEY, wh.id, json.dumps(asdict(wh)))
    return wh


def list_webhooks() -> list[WebhookRegistration]:
    r = _get_redis()
    if not r:
        return []
    raw = r.hgetall(_REDIS_KEY)
    results = []
    for v in raw.values():
        try:
            results.append(WebhookRegistration(**json.loads(v)))
        except Exception:
            pass
    return sorted(results, key=lambda w: w.created_at, reverse=True)


def get_webhook(webhook_id: str) -> WebhookRegistration | None:
    r = _get_redis()
    if not r:
        return None
    raw = r.hget(_REDIS_KEY, webhook_id)
    if not raw:
        return None
    try:
        return WebhookRegistration(**json.loads(raw))
    except Exception:
        return None


def delete_webhook(webhook_id: str) -> bool:
    r = _get_redis()
    if not r:
        return False
    return bool(r.hdel(_REDIS_KEY, webhook_id))


def deactivate_webhook(webhook_id: str) -> bool:
    wh = get_webhook(webhook_id)
    if not wh:
        return False
    wh.active = False
    r = _get_redis()
    if r:
        r.hset(_REDIS_KEY, webhook_id, json.dumps(asdict(wh)))
    return True


# ── Signing ────────────────────────────────────────────────────────────────────

def _sign_payload(secret: str, timestamp: int, body: bytes) -> str:
    """
    Produce the HMAC-SHA256 signature string.

    Signature input: f"v0:{timestamp}:{body_utf8}"
    This scheme (borrowed from Slack's signing pattern) ties the signature to
    the timestamp, making replayed payloads with a stale X-Genesis-Timestamp
    detectable by the receiver.
    """
    if not secret:
        return ""
    msg = f"v0:{timestamp}:{body.decode('utf-8', errors='replace')}".encode()
    return "sha256=" + hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


def verify_signature(secret: str, timestamp: int, body: bytes, signature: str,
                     max_age_seconds: int = 300) -> bool:
    """
    Receiver-side helper: verify an inbound webhook payload.

    Usage in your consumer:
        from genesis_swarm.shared.webhooks import verify_signature
        ok = verify_signature(
            secret=os.getenv("GENESIS_WEBHOOK_SECRET"),
            timestamp=int(request.headers["X-Genesis-Timestamp"]),
            body=await request.body(),
            signature=request.headers["X-Genesis-Signature"],
        )
    """
    if abs(time.time() - timestamp) > max_age_seconds:
        return False   # replay attack guard
    expected = _sign_payload(secret, timestamp, body)
    if not expected:
        return False
    return hmac.compare_digest(expected, signature)


# ── Delivery ──────────────────────────────────────────────────────────────────

async def deliver_event(event_type: str, data: dict[str, Any]) -> list[str]:
    """
    Deliver an event to all matching registered webhooks.

    Returns list of webhook IDs that were successfully delivered.
    Failures are logged and retried by the ARQ worker (see workers/tasks.py).
    """
    webhooks = [w for w in list_webhooks() if w.matches(event_type)]
    if not webhooks:
        return []

    payload = json.dumps({
        "id": str(uuid.uuid4()),
        "event": event_type,
        "created_at": time.time(),
        "data": data,
    }, default=str).encode()

    delivered = []
    async with aiohttp.ClientSession(timeout=_DELIVERY_TIMEOUT) as session:
        for wh in webhooks:
            success = await _attempt_delivery(session, wh, event_type, payload)
            if success:
                delivered.append(wh.id)
    return delivered


async def _attempt_delivery(
    session: aiohttp.ClientSession,
    wh: WebhookRegistration,
    event_type: str,
    payload: bytes,
    *,
    max_attempts: int = 3,
) -> bool:
    """Deliver to a single endpoint with exponential back-off."""
    import asyncio

    timestamp = int(time.time())
    signature = _sign_payload(wh.signing_secret(), timestamp, payload)

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Genesis-Swarm-Webhook/0.5.0",
        "X-Genesis-Event": event_type,
        "X-Genesis-Delivery": str(uuid.uuid4()),
        "X-Genesis-Timestamp": str(timestamp),
    }
    if signature:
        headers["X-Genesis-Signature"] = signature

    for attempt in range(max_attempts):
        try:
            async with session.post(wh.url, data=payload, headers=headers) as resp:
                if resp.status < 300:
                    return True
                # 4xx responses are not retried (receiver rejected the payload)
                if 400 <= resp.status < 500:
                    return False
        except Exception:
            pass
        if attempt < max_attempts - 1:
            await asyncio.sleep(2 ** attempt)   # 0s, 1s, 2s

    # Mark webhook as potentially unreachable — caller may choose to deactivate
    return False
