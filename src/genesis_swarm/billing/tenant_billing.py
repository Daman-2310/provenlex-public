"""
Enterprise multi-tenancy billing layer.

Tracks per-tenant API usage in Redis, enforces tier-based quotas, and
provides helpers consumed by TenantGateMiddleware on every request.

Billing tiers
-------------
free         1 000 API calls/day   10 req/min    no live feeds   no SLA
starter     10 000 API calls/day   60 req/min    AIS feed        8 h SLA
professional 100 000 API calls/day  300 req/min   all feeds       1 h SLA
enterprise  unlimited              unlimited     all feeds       15 min SLA

Redis key schema (all keys namespaced to avoid collision)
---------------------------------------------------------
genesis:tenant:{id}:daily:{YYYYMMDD}   INCR  TTL=25h  daily API call counter
genesis:tenant:{id}:rpm:{minute}       INCR  TTL=90s  per-minute burst counter
genesis:tenant:{id}:billing            JSON  no TTL   BillingState document
genesis:tenant:{id}:active             "1"   no TTL   tenant exists flag
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timezone
from enum import Enum
from typing import Optional

import redis.asyncio as aioredis
from pydantic import BaseModel, Field

log = logging.getLogger(__name__)

# ── Tier definitions ──────────────────────────────────────────────────────────


class BillingTier(str, Enum):
    FREE = "free"
    STARTER = "starter"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"


@dataclass(frozen=True)
class TierLimits:
    daily_api_calls: int    # -1 = unlimited
    rpm: int                # requests-per-minute burst cap; -1 = unlimited
    live_ais_enabled: bool
    live_adsb_enabled: bool
    max_users: int          # users per tenant; -1 = unlimited
    pbft_replicas: int      # maximum PBFT cluster size for this tier
    sla_minutes: int        # recovery SLA guarantee; 0 = none


TIER_LIMITS: dict[BillingTier, TierLimits] = {
    BillingTier.FREE: TierLimits(
        daily_api_calls=1_000,
        rpm=10,
        live_ais_enabled=False,
        live_adsb_enabled=False,
        max_users=1,
        pbft_replicas=3,
        sla_minutes=0,
    ),
    BillingTier.STARTER: TierLimits(
        daily_api_calls=10_000,
        rpm=60,
        live_ais_enabled=True,
        live_adsb_enabled=False,
        max_users=5,
        pbft_replicas=7,
        sla_minutes=480,
    ),
    BillingTier.PROFESSIONAL: TierLimits(
        daily_api_calls=100_000,
        rpm=300,
        live_ais_enabled=True,
        live_adsb_enabled=True,
        max_users=25,
        pbft_replicas=11,
        sla_minutes=60,
    ),
    BillingTier.ENTERPRISE: TierLimits(
        daily_api_calls=-1,
        rpm=-1,
        live_ais_enabled=True,
        live_adsb_enabled=True,
        max_users=-1,
        pbft_replicas=11,
        sla_minutes=15,
    ),
}

# ── Redis key helpers ─────────────────────────────────────────────────────────

_KEY_DAILY = "genesis:tenant:{tid}:daily:{day}"
_KEY_RPM = "genesis:tenant:{tid}:rpm:{bucket}"
_KEY_BILLING = "genesis:tenant:{tid}:billing"
_KEY_ACTIVE = "genesis:tenant:{tid}:active"

_DAILY_TTL_S = 25 * 3600   # 25 h — covers UTC midnight edge cases
_RPM_TTL_S = 90            # 1.5× a 60-second window for safe expiry


def _daily_key(tid: str) -> str:
    day = date.today().strftime("%Y%m%d")
    return _KEY_DAILY.format(tid=tid, day=day)


def _rpm_key(tid: str) -> str:
    bucket = int(datetime.now(tz=timezone.utc).timestamp()) // 60
    return _KEY_RPM.format(tid=tid, bucket=bucket)


def _billing_key(tid: str) -> str:
    return _KEY_BILLING.format(tid=tid)


def _active_key(tid: str) -> str:
    return _KEY_ACTIVE.format(tid=tid)


# ── Billing state model ───────────────────────────────────────────────────────


class BillingState(BaseModel):
    tenant_id: str
    tier: BillingTier = BillingTier.FREE
    stripe_customer_id: str = ""
    stripe_subscription_id: str = ""
    payment_failed: bool = False
    created_at: float = Field(
        default_factory=lambda: datetime.now(tz=timezone.utc).timestamp()
    )
    updated_at: float = Field(
        default_factory=lambda: datetime.now(tz=timezone.utc).timestamp()
    )

    def limits(self) -> TierLimits:
        return TIER_LIMITS[self.tier]

    def effective_tier(self) -> BillingTier:
        """Downgrade to FREE if the most recent payment has failed."""
        if self.payment_failed and self.tier != BillingTier.FREE:
            return BillingTier.FREE
        return self.tier

    def effective_limits(self) -> TierLimits:
        return TIER_LIMITS[self.effective_tier()]


# ── Redis-backed billing registry ─────────────────────────────────────────────


class TenantBillingRegistry:
    """
    Redis-backed store for per-tenant billing state and API usage counters.

    All mutations are async and pipeline-batched where possible to keep
    per-request overhead under 1 ms at typical Redis latencies.

    Parameters
    ----------
    redis_client:
        An already-connected ``redis.asyncio.Redis`` instance.
    """

    def __init__(self, redis_client: aioredis.Redis) -> None:
        self._r = redis_client

    # ── State management ──────────────────────────────────────────────────────

    async def get_state(self, tenant_id: str) -> BillingState:
        """Load billing state from Redis; auto-create FREE tier on first access."""
        raw = await self._r.get(_billing_key(tenant_id))
        if raw:
            return BillingState.model_validate_json(raw)
        state = BillingState(tenant_id=tenant_id, tier=BillingTier.FREE)
        await self.save_state(state)
        return state

    async def save_state(self, state: BillingState) -> None:
        state.updated_at = datetime.now(tz=timezone.utc).timestamp()
        await self._r.set(_billing_key(state.tenant_id), state.model_dump_json())
        await self._r.set(_active_key(state.tenant_id), "1")
        log.info(
            "[Billing] saved tenant=%s tier=%s payment_failed=%s",
            state.tenant_id,
            state.tier,
            state.payment_failed,
        )

    async def upgrade_tier(
        self, tenant_id: str, new_tier: BillingTier
    ) -> BillingState:
        state = await self.get_state(tenant_id)
        old_tier = state.tier
        state.tier = new_tier
        state.payment_failed = False
        await self.save_state(state)
        log.info(
            "[Billing] tenant=%s upgraded %s → %s",
            tenant_id,
            old_tier,
            new_tier,
        )
        return state

    async def mark_payment_failed(self, tenant_id: str) -> BillingState:
        state = await self.get_state(tenant_id)
        state.payment_failed = True
        await self.save_state(state)
        log.warning("[Billing] tenant=%s payment FAILED — enforcing FREE limits", tenant_id)
        return state

    async def clear_payment_failed(self, tenant_id: str) -> BillingState:
        state = await self.get_state(tenant_id)
        state.payment_failed = False
        await self.save_state(state)
        log.info("[Billing] tenant=%s payment recovered — tier limits restored", tenant_id)
        return state

    # ── Usage tracking ────────────────────────────────────────────────────────

    async def record_api_call(self, tenant_id: str) -> tuple[int, int]:
        """
        Atomically increment daily and per-minute counters in a single pipeline.

        Returns
        -------
        (daily_count, rpm_count)
        """
        dk = _daily_key(tenant_id)
        rk = _rpm_key(tenant_id)
        async with self._r.pipeline(transaction=False) as pipe:
            pipe.incr(dk)
            pipe.expire(dk, _DAILY_TTL_S)
            pipe.incr(rk)
            pipe.expire(rk, _RPM_TTL_S)
            results = await pipe.execute()
        return int(results[0]), int(results[2])

    async def get_usage(self, tenant_id: str) -> dict:
        dk = _daily_key(tenant_id)
        rk = _rpm_key(tenant_id)
        raw_daily, raw_rpm = await self._r.mget(dk, rk)
        return {
            "tenant_id": tenant_id,
            "daily_calls": int(raw_daily or 0),
            "rpm": int(raw_rpm or 0),
            "date": date.today().isoformat(),
        }

    # ── Quota enforcement ─────────────────────────────────────────────────────

    async def check_quota(
        self,
        tenant_id: str,
        state: Optional[BillingState] = None,
    ) -> tuple[bool, str]:
        """
        Check whether the tenant has quota remaining **without** incrementing.

        Returns
        -------
        (allowed, reason)
            allowed=False means the request must be rejected with HTTP 429.
        """
        if state is None:
            state = await self.get_state(tenant_id)

        limits = state.effective_limits()
        raw_daily, raw_rpm = await self._r.mget(
            _daily_key(tenant_id), _rpm_key(tenant_id)
        )
        daily = int(raw_daily or 0)
        rpm = int(raw_rpm or 0)

        if limits.daily_api_calls != -1 and daily >= limits.daily_api_calls:
            return False, (
                f"Daily quota exceeded ({daily}/{limits.daily_api_calls} calls). "
                f"Upgrade to {BillingTier.PROFESSIONAL.value} for higher limits."
            )

        if limits.rpm != -1 and rpm >= limits.rpm:
            return False, (
                f"Rate limit exceeded ({rpm} req/min, limit {limits.rpm}). "
                "Retry-After: 60 seconds."
            )

        return True, "ok"

    async def list_tenants(self, pattern: str = "genesis:tenant:*:active") -> list[str]:
        """Return all known tenant IDs from Redis key scan."""
        keys: list[str] = []
        async for key in self._r.scan_iter(pattern, count=100):
            # key format: genesis:tenant:{id}:active
            parts = key.decode("utf-8").split(":")
            if len(parts) >= 4:
                keys.append(parts[2])
        return sorted(set(keys))
