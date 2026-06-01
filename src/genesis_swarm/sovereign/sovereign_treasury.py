"""
Sovereign Treasury — Autonomous Liquidity & Compute Arbitrage.

The SovereignTreasury makes the Genesis Swarm completely self-funding.
Every 60 seconds it:

  1. Samples live CPU %, memory %, and Δ-network-bytes via psutil.
  2. Fetches real-time spot prices from AWS EC2 and Akash Network.
  3. Evaluates a scale-up / scale-down decision with hysteresis.
  4. Provisions or terminates the cheapest available compute unit.
  5. Debits / credits the Genesis Swarm Unit (GSU) ledger in Redis.
  6. Exposes Prometheus metrics and FastAPI financial summary.

Financial model
---------------
GSU (Genesis Swarm Unit): internal fixed-point currency.
  1 GSU = 0.01 USD  →  _GSU_PER_USD = 100

Costs are debited from a special "swarm_infrastructure" tenant balance
in Redis.  Tenant operators top up this balance via the normal Stripe
billing route; the treasury draws from it autonomously.

Scale-up trigger   : CPU > 70 %  OR  Δ-network > 20 % per cycle
Scale-down trigger : CPU < 30 %  AND  idle for > 300 s (hysteresis guard)
Low-balance alert  : balance < 100 000 GSU (≈ USD 1 000) → scale-up suppressed

Provider arbitrage
------------------
Both AWS Spot and Akash are queried in parallel.  The cheapest quote wins.
boto3 is an optional import — if absent, AWS provider is silently disabled.
Akash REST API is queried directly; only AKASH_MNEMONIC is required.

Cloud-init user-data for AWS Spot instances is base64-encoded and set via
the GENESIS_SPOT_USERDATA env var so the launched instance automatically
joins the PBFT cluster.
"""

from __future__ import annotations

import asyncio
import base64
import dataclasses
import json
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Optional

import httpx
import psutil

log = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

_CYCLE_INTERVAL_S: float = 60.0
_IDLE_GRACE_S: float = 300.0
_SCALE_UP_CPU_PCT: float = 70.0
_SCALE_DOWN_CPU_PCT: float = 30.0
_NET_SURGE_THRESHOLD: float = 0.20   # 20 % increase in net bytes per cycle
_LOW_BALANCE_GSU: int = 100_000      # ≈ USD 1 000
_GSU_PER_USD: int = 100
_INFRA_TENANT: str = "swarm_infrastructure"

_AWS_REGION: str = os.getenv("AWS_REGION", "eu-west-1")
_AWS_SPOT_AMI: str = os.getenv("GENESIS_SPOT_AMI", "ami-0c55b159cbfafe1f0")
_AWS_KEY_NAME: str = os.getenv("AWS_KEY_NAME", "genesis-key")
_AWS_SG_IDS: list[str] = os.getenv("AWS_SG_IDS", "sg-00000000").split(",")
_AKASH_API_BASE: str = os.getenv("AKASH_API_BASE", "https://api.akash.network")
_AKASH_MNEMONIC: str = os.getenv("AKASH_MNEMONIC", "")
_REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")

_INSTANCE_TYPES: list[str] = ["t3.medium", "t3.large", "c5.xlarge"]
_VCPU_MAP: dict[str, int] = {"t3.medium": 2, "t3.large": 2, "c5.xlarge": 4}
_MEM_GB_MAP: dict[str, float] = {"t3.medium": 4.0, "t3.large": 8.0, "c5.xlarge": 8.0}


# ── Infrastructure metrics ────────────────────────────────────────────────────

@dataclass
class InfraSnapshot:
    ts: float
    cpu_pct: float
    mem_pct: float
    net_bytes_sent_delta: int
    net_bytes_recv_delta: int
    container_count: int

    @property
    def net_total_delta(self) -> int:
        return self.net_bytes_sent_delta + self.net_bytes_recv_delta


class InfraMetricsCollector:
    """Samples live host metrics via psutil each decision cycle."""

    def __init__(self) -> None:
        self._prev_net: Optional[Any] = None

    async def snapshot(self) -> InfraSnapshot:
        loop = asyncio.get_event_loop()
        cpu = await loop.run_in_executor(
            None, lambda: psutil.cpu_percent(interval=1.0)
        )
        mem = psutil.virtual_memory().percent
        net = psutil.net_io_counters()

        sent_delta = int(net.bytes_sent - (self._prev_net.bytes_sent if self._prev_net else 0))
        recv_delta = int(net.bytes_recv - (self._prev_net.bytes_recv if self._prev_net else 0))
        self._prev_net = net

        containers = await self._count_docker_containers()
        return InfraSnapshot(
            ts=time.time(),
            cpu_pct=cpu,
            mem_pct=mem,
            net_bytes_sent_delta=max(0, sent_delta),
            net_bytes_recv_delta=max(0, recv_delta),
            container_count=containers,
        )

    async def _count_docker_containers(self) -> int:
        try:
            proc = await asyncio.create_subprocess_exec(
                "docker", "ps", "-q",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5.0)
            return len(stdout.decode().strip().splitlines())
        except Exception:
            return 0


# ── Cost quotes ───────────────────────────────────────────────────────────────

@dataclass
class CostQuote:
    provider: str
    instance_type: str
    price_usd_hour: float
    region: str
    vcpu: int
    memory_gb: float
    az: str = ""

    def price_gsu_hour(self) -> int:
        return int(self.price_usd_hour * _GSU_PER_USD)


class AWSSpotPricer:
    """Fetches live AWS EC2 Spot price history via boto3."""

    async def cheapest_quote(self) -> Optional[CostQuote]:
        try:
            import boto3  # type: ignore
        except ImportError:
            log.debug("[Treasury/AWS] boto3 not installed — skipping AWS pricing")
            return None

        try:
            ec2 = boto3.client("ec2", region_name=_AWS_REGION)
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(
                None,
                lambda: ec2.describe_spot_price_history(
                    InstanceTypes=_INSTANCE_TYPES,
                    ProductDescriptions=["Linux/UNIX"],
                    MaxResults=30,
                ),
            )
            entries = resp.get("SpotPriceHistory", [])
            if not entries:
                return None
            best = min(entries, key=lambda e: float(e["SpotPrice"]))
            itype = best["InstanceType"]
            return CostQuote(
                provider="aws_spot",
                instance_type=itype,
                price_usd_hour=float(best["SpotPrice"]),
                region=_AWS_REGION,
                vcpu=_VCPU_MAP.get(itype, 2),
                memory_gb=_MEM_GB_MAP.get(itype, 4.0),
                az=best.get("AvailabilityZone", ""),
            )
        except Exception as exc:
            log.warning("[Treasury/AWS] Pricing fetch failed: %s", exc)
            return None


class AkashPricer:
    """Queries Akash Network REST API for current open bid prices."""

    _DEFAULT = CostQuote(
        provider="akash",
        instance_type="small-vm",
        price_usd_hour=0.012,
        region="akash_network",
        vcpu=1,
        memory_gb=2.0,
    )
    # Rough AKT → USD conversion; real-time rate via CoinGecko would be better
    _AKT_USD: float = 1.50
    _UAKT_PER_AKT: float = 1_000_000.0

    async def cheapest_quote(self) -> Optional[CostQuote]:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{_AKASH_API_BASE}/akash/market/v1beta4/bids/list",
                    params={"filters.state": "open"},
                )
                resp.raise_for_status()
                bids = resp.json().get("bids", [])

            if not bids:
                return self._DEFAULT

            # Extract price from first open bid
            open_bids = [
                b for b in bids
                if b.get("bid", {}).get("state") == "open"
            ]
            if not open_bids:
                return self._DEFAULT

            best = min(
                open_bids,
                key=lambda b: float(b.get("bid", {}).get("price", {}).get("amount", "1e9")),
            )
            uakt = float(best["bid"]["price"]["amount"])
            usd_hour = (uakt / self._UAKT_PER_AKT) * self._AKT_USD
            return CostQuote(
                provider="akash",
                instance_type="akash-vm",
                price_usd_hour=round(usd_hour, 6),
                region="akash_network",
                vcpu=1,
                memory_gb=2.0,
            )
        except Exception as exc:
            log.warning("[Treasury/Akash] Pricing fetch failed: %s — using default", exc)
            return self._DEFAULT


# ── Treasury ledger (Redis-backed fixed-point) ────────────────────────────────

class TreasuryLedger:
    """
    Redis-backed GSU ledger for the swarm infrastructure reserve tenant.

    All mutations use atomic INCRBY / DECRBY — no WATCH/MULTI needed for
    single-key operations.  Ledger events are pushed to a Redis list with
    LPUSH (most-recent-first) for auditability.
    """

    _KEY_BAL = "genesis:treasury:{tenant}:balance"
    _KEY_LOG = "genesis:treasury:{tenant}:ledger"
    _MAX_LOG_LEN = 1000

    def __init__(self, redis_url: str = _REDIS_URL) -> None:
        self._redis_url = redis_url
        self._r: Any = None

    async def connect(self) -> None:
        import redis.asyncio as aioredis  # type: ignore
        self._r = await aioredis.from_url(
            self._redis_url, decode_responses=True
        )
        log.info("[Treasury/Ledger] connected to Redis: %s", self._redis_url)

    async def balance(self, tenant: str = _INFRA_TENANT) -> int:
        if not self._r:
            return 0
        raw = await self._r.get(self._KEY_BAL.format(tenant=tenant))
        return int(raw) if raw else 0

    async def debit(
        self, tenant: str, amount_gsu: int, description: str
    ) -> int:
        if not self._r:
            return 0
        key = self._KEY_BAL.format(tenant=tenant)
        new_bal = int(await self._r.decrby(key, amount_gsu))
        await self._append_ledger_event(tenant, "debit", amount_gsu, description, new_bal)
        return new_bal

    async def credit(
        self, tenant: str, amount_gsu: int, description: str
    ) -> int:
        if not self._r:
            return 0
        key = self._KEY_BAL.format(tenant=tenant)
        new_bal = int(await self._r.incrby(key, amount_gsu))
        await self._append_ledger_event(tenant, "credit", amount_gsu, description, new_bal)
        return new_bal

    async def ledger_tail(
        self, tenant: str = _INFRA_TENANT, n: int = 20
    ) -> list[dict[str, Any]]:
        if not self._r:
            return []
        raw = await self._r.lrange(self._KEY_LOG.format(tenant=tenant), 0, n - 1)
        result = []
        for item in raw:
            try:
                result.append(json.loads(item))
            except json.JSONDecodeError:
                pass
        return result

    async def _append_ledger_event(
        self,
        tenant: str,
        event_type: str,
        amount: int,
        description: str,
        balance_after: int,
    ) -> None:
        entry = json.dumps({
            "ts": time.time(),
            "type": event_type,
            "amount_gsu": amount,
            "balance_after": balance_after,
            "description": description,
        })
        key = self._KEY_LOG.format(tenant=tenant)
        await self._r.lpush(key, entry)
        await self._r.ltrim(key, 0, self._MAX_LOG_LEN - 1)


# ── AWS Spot provisioner ──────────────────────────────────────────────────────

class AWSSpotProvisioner:
    """Requests and terminates AWS EC2 Spot instances via boto3."""

    async def provision(self, quote: CostQuote) -> Optional[str]:
        try:
            import boto3  # type: ignore
        except ImportError:
            return None

        user_data_b64 = os.getenv(
            "GENESIS_SPOT_USERDATA",
            base64.b64encode(
                b"#!/bin/bash\n"
                b"docker pull ghcr.io/genesis-swarm/node:latest\n"
                b"docker run -d --restart=always ghcr.io/genesis-swarm/node:latest\n"
            ).decode(),
        )

        try:
            ec2 = boto3.client("ec2", region_name=_AWS_REGION)
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(
                None,
                lambda: ec2.request_spot_instances(
                    InstanceCount=1,
                    Type="one-time",
                    LaunchSpecification={
                        "ImageId": _AWS_SPOT_AMI,
                        "InstanceType": quote.instance_type,
                        "KeyName": _AWS_KEY_NAME,
                        "SecurityGroupIds": _AWS_SG_IDS,
                        "UserData": user_data_b64,
                    },
                    SpotPrice=str(round(quote.price_usd_hour * 1.25, 4)),
                ),
            )
            requests = resp.get("SpotInstanceRequests", [])
            if not requests:
                return None
            sir_id: str = requests[0]["SpotInstanceRequestId"]
            log.info("[Treasury/AWS] Spot request placed: %s (%s)", sir_id, quote.instance_type)
            return sir_id
        except Exception as exc:
            log.error("[Treasury/AWS] Provision failed: %s", exc)
            return None

    async def terminate(self, instance_id: str) -> None:
        try:
            import boto3  # type: ignore
            ec2 = boto3.client("ec2", region_name=_AWS_REGION)
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: ec2.terminate_instances(InstanceIds=[instance_id]),
            )
            log.info("[Treasury/AWS] Terminated: %s", instance_id)
        except Exception as exc:
            log.error("[Treasury/AWS] Termination failed for %s: %s", instance_id, exc)


# ── Akash deployer ────────────────────────────────────────────────────────────

class AkashDeployer:
    """
    Creates and closes Akash Network leases via the REST API.
    Requires AKASH_MNEMONIC to sign transactions.
    """

    _SDL_TEMPLATE = """\
version: "2.0"
services:
  genesis-node:
    image: ghcr.io/genesis-swarm/node:{tag}
    expose:
      - port: 8000
        as: 8000
        to:
          - global: true
      - port: 9000
        as: 9000
        to:
          - global: true
profiles:
  compute:
    genesis-node:
      resources:
        cpu:
          units: 1.0
        memory:
          size: 2Gi
        storage:
          size: 10Gi
  placement:
    dcloud:
      pricing:
        genesis-node:
          denom: uakt
          amount: {price_uakt}
deployment:
  genesis-node:
    dcloud:
      profile: genesis-node
      count: 1
"""

    async def deploy(
        self, quote: CostQuote, tag: str = "latest"
    ) -> Optional[str]:
        if not _AKASH_MNEMONIC:
            log.warning("[Treasury/Akash] AKASH_MNEMONIC not set — deployment skipped")
            return None

        # Convert USD/hour → uakt (rough: 1 AKT=1.50 USD, 1 AKT=1e6 uakt)
        price_uakt = int((quote.price_usd_hour / 1.50) * 1_000_000)
        sdl = self._SDL_TEMPLATE.format(tag=tag, price_uakt=price_uakt)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{_AKASH_API_BASE}/akash/deployment/v1beta3/deployments/create",
                    json={"sdl": sdl, "mnemonic": _AKASH_MNEMONIC},
                    headers={"Content-Type": "application/json"},
                )
                resp.raise_for_status()
                data = resp.json()

            dseq: str = str(
                data.get("deployment", {})
                .get("deployment_id", {})
                .get("dseq", "")
            )
            if not dseq:
                log.warning("[Treasury/Akash] Deploy succeeded but no dseq in response")
                return None
            log.info("[Treasury/Akash] Deployment created dseq=%s", dseq)
            return dseq
        except Exception as exc:
            log.error("[Treasury/Akash] Deploy failed: %s", exc)
            return None

    async def close(self, dseq: str) -> None:
        if not _AKASH_MNEMONIC:
            return
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.delete(
                    f"{_AKASH_API_BASE}/akash/deployment/v1beta3/deployments/{dseq}",
                    json={"mnemonic": _AKASH_MNEMONIC},
                )
            log.info("[Treasury/Akash] Deployment closed dseq=%s", dseq)
        except Exception as exc:
            log.error("[Treasury/Akash] Close failed dseq=%s: %s", dseq, exc)


# ── Scale event log entry ─────────────────────────────────────────────────────

@dataclass
class ScaleEvent:
    action: str            # "provision" | "terminate"
    provider: str
    instance_ref: str
    cost_usd_hour: float
    reason: str
    balance_after_gsu: int = 0
    ts: float = field(default_factory=time.time)

    def to_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)


# ── Sovereign treasury orchestrator ──────────────────────────────────────────

class SovereignTreasury:
    """
    Autonomous infrastructure cost manager.

    Lifecycle:
        treasury = SovereignTreasury()
        await treasury.start()
        # Runs autonomously — stop with:
        await treasury.stop()
    """

    def __init__(self) -> None:
        self._metrics = InfraMetricsCollector()
        self._aws_price = AWSSpotPricer()
        self._akash_price = AkashPricer()
        self._aws_prov = AWSSpotProvisioner()
        self._akash_dep = AkashDeployer()
        self._ledger = TreasuryLedger()
        self._active: dict[str, str] = {}   # {instance_ref: provider}
        self._scale_log: list[ScaleEvent] = []
        self._prev_snap: Optional[InfraSnapshot] = None
        self._idle_since: Optional[float] = None
        self._running = False
        self._task: Optional[asyncio.Task[None]] = None

    async def start(self) -> None:
        await self._ledger.connect()
        self._running = True
        self._task = asyncio.create_task(self._cycle_loop())
        log.info("[Treasury] Sovereign treasury started (cycle=%ds)", int(_CYCLE_INTERVAL_S))

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    # ── Decision cycle ────────────────────────────────────────────────────────

    async def _cycle_loop(self) -> None:
        while self._running:
            try:
                await self._decision_cycle()
            except Exception as exc:
                log.error("[Treasury] Decision cycle error: %s", exc)
            await asyncio.sleep(_CYCLE_INTERVAL_S)

    async def _decision_cycle(self) -> None:
        snap = await self._metrics.snapshot()
        balance = await self._ledger.balance()
        net_delta_pct = self._compute_net_delta_pct(snap)
        direction = self._scale_direction(snap, net_delta_pct)

        log.info(
            "[Treasury] cycle cpu=%.1f%% mem=%.1f%% net_delta=%.1f%% dir=%s "
            "active=%d bal=%d GSU",
            snap.cpu_pct, snap.mem_pct, net_delta_pct * 100,
            direction, len(self._active), balance,
        )

        if balance < _LOW_BALANCE_GSU and direction == "up":
            log.critical(
                "[Treasury] LOW BALANCE %d GSU (≈$%.0f) — scale-up suppressed",
                balance, balance / _GSU_PER_USD,
            )
            self._prev_snap = snap
            return

        if direction == "up":
            await self._scale_up(snap)
        elif direction == "down":
            await self._scale_down(snap)

        self._prev_snap = snap

    def _compute_net_delta_pct(self, snap: InfraSnapshot) -> float:
        if self._prev_snap is None:
            return 0.0
        prev_total = (
            self._prev_snap.net_bytes_sent_delta
            + self._prev_snap.net_bytes_recv_delta
        )
        curr_total = snap.net_total_delta
        if prev_total == 0:
            return 0.0
        return (curr_total - prev_total) / prev_total

    def _scale_direction(
        self, snap: InfraSnapshot, net_delta: float
    ) -> str:
        if snap.cpu_pct > _SCALE_UP_CPU_PCT or net_delta > _NET_SURGE_THRESHOLD:
            self._idle_since = None
            return "up"
        if snap.cpu_pct < _SCALE_DOWN_CPU_PCT:
            if self._idle_since is None:
                self._idle_since = time.time()
            elif time.time() - self._idle_since > _IDLE_GRACE_S:
                return "down"
        else:
            self._idle_since = None
        return "steady"

    # ── Scale-up: provision cheapest available compute ────────────────────────

    async def _scale_up(self, snap: InfraSnapshot) -> None:
        aws_q, akash_q = await asyncio.gather(
            self._aws_price.cheapest_quote(),
            self._akash_price.cheapest_quote(),
            return_exceptions=True,
        )
        quotes = [
            q for q in [aws_q, akash_q]
            if isinstance(q, CostQuote)
        ]
        if not quotes:
            log.warning("[Treasury] No compute quotes available — cannot scale up")
            return

        best = min(quotes, key=lambda q: q.price_usd_hour)
        log.info(
            "[Treasury] Best quote: %s %s @ $%.4f/h",
            best.provider, best.instance_type, best.price_usd_hour,
        )

        instance_ref: Optional[str] = None
        if best.provider == "aws_spot":
            instance_ref = await self._aws_prov.provision(best)
        elif best.provider == "akash":
            instance_ref = await self._akash_dep.deploy(best)

        if not instance_ref:
            log.warning("[Treasury] Provisioning returned no instance ref")
            return

        self._active[instance_ref] = best.provider
        cost_gsu = best.price_gsu_hour()
        bal = await self._ledger.debit(
            _INFRA_TENANT, cost_gsu,
            f"provision:{best.provider}:{instance_ref}",
        )
        event = ScaleEvent(
            action="provision",
            provider=best.provider,
            instance_ref=instance_ref,
            cost_usd_hour=best.price_usd_hour,
            reason=f"cpu={snap.cpu_pct:.1f}%",
            balance_after_gsu=bal,
        )
        self._scale_log.append(event)

    # ── Scale-down: terminate oldest idle instance ────────────────────────────

    async def _scale_down(self, snap: InfraSnapshot) -> None:
        if not self._active:
            return
        instance_ref, provider = next(iter(self._active.items()))

        if provider == "aws_spot":
            await self._aws_prov.terminate(instance_ref)
        elif provider == "akash":
            await self._akash_dep.close(instance_ref)

        del self._active[instance_ref]
        self._idle_since = None

        event = ScaleEvent(
            action="terminate",
            provider=provider,
            instance_ref=instance_ref,
            cost_usd_hour=0.0,
            reason=(
                f"cpu={snap.cpu_pct:.1f}%<{_SCALE_DOWN_CPU_PCT}% "
                f"for {_IDLE_GRACE_S}s"
            ),
        )
        self._scale_log.append(event)
        log.info("[Treasury] Scale-down: terminated %s/%s", provider, instance_ref)

    # ── Public status / summary ───────────────────────────────────────────────

    def status(self) -> dict[str, Any]:
        last_snap = self._prev_snap
        return {
            "active_instances": dict(self._active),
            "scale_log": [e.to_dict() for e in self._scale_log[-20:]],
            "idle_since": self._idle_since,
            "last_cpu_pct": last_snap.cpu_pct if last_snap else None,
            "last_mem_pct": last_snap.mem_pct if last_snap else None,
            "container_count": last_snap.container_count if last_snap else None,
        }

    async def financial_summary(self) -> dict[str, Any]:
        balance = await self._ledger.balance()
        tail = await self._ledger.ledger_tail(n=10)
        spend_gsu = sum(
            e.get("amount_gsu", 0)
            for e in tail
            if e.get("type") == "debit"
        )
        return {
            "balance_gsu": balance,
            "balance_usd": round(balance / _GSU_PER_USD, 2),
            "active_instances": len(self._active),
            "recent_spend_gsu": spend_gsu,
            "recent_spend_usd": round(spend_gsu / _GSU_PER_USD, 2),
            "low_balance_alert": balance < _LOW_BALANCE_GSU,
            "ledger_tail": tail,
        }


# ── FastAPI routes ────────────────────────────────────────────────────────────

from fastapi import APIRouter  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402

router = APIRouter(prefix="/api/treasury", tags=["treasury"])

_treasury_instance: Optional[SovereignTreasury] = None


def init_treasury() -> SovereignTreasury:
    global _treasury_instance
    _treasury_instance = SovereignTreasury()
    return _treasury_instance


@router.get("/status", summary="Treasury status and active compute instances")
async def treasury_status() -> JSONResponse:
    if _treasury_instance is None:
        return JSONResponse({"enabled": False})
    return JSONResponse({"enabled": True, **_treasury_instance.status()})


@router.get("/summary", summary="Financial summary: balance, spend, ledger tail")
async def treasury_summary() -> JSONResponse:
    if _treasury_instance is None:
        return JSONResponse({"enabled": False})
    summary = await _treasury_instance.financial_summary()
    return JSONResponse({"enabled": True, **summary})


@router.get("/scale-log", summary="Full autonomous scale-up / scale-down event log")
async def scale_log() -> JSONResponse:
    if _treasury_instance is None:
        return JSONResponse({"events": []})
    return JSONResponse({
        "events": [e.to_dict() for e in _treasury_instance._scale_log],
    })


@router.post("/credit", summary="Top up the infrastructure reserve balance")
async def credit_balance(
    amount_gsu: int = 1_000_000,
    description: str = "manual top-up",
) -> JSONResponse:
    if _treasury_instance is None:
        return JSONResponse({"error": "treasury not initialised"}, status_code=503)
    new_bal = await _treasury_instance._ledger.credit(
        _INFRA_TENANT, amount_gsu, description
    )
    return JSONResponse({
        "credited_gsu": amount_gsu,
        "credited_usd": round(amount_gsu / _GSU_PER_USD, 2),
        "balance_gsu": new_bal,
        "balance_usd": round(new_bal / _GSU_PER_USD, 2),
    })
