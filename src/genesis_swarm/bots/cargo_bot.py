"""
CargoBot — AIS vessel anomaly detector.

Data sources
------------
Production  : AISStream.io WebSocket (wss://stream.aisstream.io/v0/stream)
              Requires AISSTREAM_API_KEY env var.
              Falls back to NGA MSI for active navigation warnings.
Development : Deterministic synthetic vessel pool.  Identical scoring logic;
              only the telemetry origin differs.

Live feed behaviour
-------------------
- Persistent WebSocket with full exponential backoff (GENESIS_AIS_BACKOFF_*).
- Token-bucket rate limiter: drops messages above GENESIS_AIS_RATE_LIMIT_MSGS_PER_MIN
  to prevent OOM under high-volume feed bursts.
- Inbound buffer capped at GENESIS_AIS_BUFFER_MAX_SIZE.
- NGA MSI warnings fetched at startup and refreshed every 3600 s with independent
  circuit-breaker so MSI failure does not affect AIS logic.

Environment toggle
------------------
Set GENESIS_ENVIRONMENT=production  OR  GENESIS_LIVE_AIS_ENABLED=true to
activate the live feed.  Development mode uses the synthetic vessel pool with
identical scoring, allowing full protocol testing without an API key.
"""

from __future__ import annotations
import json
from ..shared.config import get_config
from ..shared.circuit_breaker import CircuitBreaker
from ..shared.bot_base import DetectionResult, SwarmBot
import certifi
import aiohttp
from dataclasses import dataclass
from collections import deque
import time
import ssl
import random
import logging

import asyncio


def _fire_task(coro) -> asyncio.Task:
    """Create a tracked background task that logs unhandled exceptions."""
    task = asyncio.create_task(coro)
    task.add_done_callback(_on_task_done)
    return task


def _on_task_done(task: asyncio.Task) -> None:
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        import logging as _lg
        _lg.getLogger(__name__).error(
            "background_task_failed", exc_info=exc, task_name=task.get_name()
        )


log = logging.getLogger(__name__)

# ── AIS endpoint constants ────────────────────────────────────────────────────

AISSTREAM_WS_URL = "wss://stream.aisstream.io/v0/stream"
NGA_MSI_URL = (
    "https://msi.nga.mil/api/publications/query"
    "?type=navigation-warning&status=active&output=json"
)

# Geographic bounding boxes for subscription
_BOUNDING_BOXES = [
    [[-10.0, 35.0], [40.0, 70.0]],  # North Sea / Atlantic / Med
    [[40.0, 20.0], [65.0, 45.0]],   # Black Sea / Caspian
]

HIGH_RISK_FLAGS: frozenset[str] = frozenset({"KP", "IR", "SY", "CU", "VE", "MM"})
SANCTIONED_PORTS: frozenset[str] = frozenset({"Bandar Abbas", "Latakia", "Wonsan", "Tartus"})

# ── Domain types ──────────────────────────────────────────────────────────────


@dataclass
class VesselSignal:
    mmsi: str
    vessel_name: str
    lat: float
    lon: float
    speed: float       # knots
    heading: float     # degrees
    cargo_type: str
    flag_state: str
    dark_hours: float  # hours since last AIS ping
    destination: str = ""
    imo: str = ""
    source: str = "SIM"


# ── Static seed pool (dev / fallback) ────────────────────────────────────────

_SEED_VESSELS: list[VesselSignal] = [
    VesselSignal("235000001", "MV ATLANTIC TRADER", 49.5, -5.2, 12.4, 270, "DRY_BULK", "LU", 0.0),
    VesselSignal("235000002", "MV NORD STAR", 53.1, 3.8, 0.0, 0, "TANKER", "PA", 0.0),
    VesselSignal("235000003", "MV OCEAN PRIDE", 36.5, 28.3, 14.2, 85, "CONTAINER", "MT", 0.0),
    VesselSignal("235000004", "MT GULF RUNNER", 25.2, 56.8, 8.1, 190, "CRUDE_OIL", "MH", 0.0),
    VesselSignal("235000005", "MV ARCTIC WOLF", 68.3, 14.5, 11.0, 45, "REEFER", "NO", 0.0),
    VesselSignal("636020485", "MV LIBERTY SPIRIT", 44.2, 28.1, 9.8, 130, "TANKER", "LR", 0.0),
    VesselSignal("538006785", "MV EAST HARMONY", 35.8, 14.2, 13.5, 95, "CONTAINER", "MH", 0.0),
]


# ── Message parser ────────────────────────────────────────────────────────────


def _parse_aisstream_message(msg: dict) -> VesselSignal | None:
    """Parse one AISStream.io message into a VesselSignal. Returns None on failure."""
    try:
        msg_type = msg.get("MessageType", "")
        meta = msg.get("MetaData", {})
        mmsi = str(meta.get("MMSI", ""))
        if not mmsi:
            return None
        name = (meta.get("ShipName", "") or f"VESSEL-{mmsi[-4:]}").strip()
        lat = float(meta.get("latitude", 0.0))
        lon = float(meta.get("longitude", 0.0))

        payload = msg.get("Message", {})
        if msg_type == "PositionReport":
            pr = payload.get("PositionReport", {})
            speed = float(pr.get("Sog", 0.0))
            heading = float(pr.get("Cog", 0.0))
        elif msg_type == "ShipStaticData":
            ssd = payload.get("ShipStaticData", {})
            speed = 0.0
            heading = 0.0
            name = (ssd.get("Name", name) or name).strip()
        else:
            speed, heading = 0.0, 0.0

        return VesselSignal(
            mmsi=mmsi,
            vessel_name=name[:30],
            lat=lat,
            lon=lon,
            speed=speed,
            heading=heading,
            cargo_type="UNKNOWN",
            flag_state="XX",
            dark_hours=0.0,
            source="AIS_LIVE",
        )
    except (KeyError, ValueError, TypeError):
        return None


# ── Token-bucket rate limiter ─────────────────────────────────────────────────


class _TokenBucket:
    """
    Simple token-bucket rate limiter for the AIS inbound stream.
    Thread-safe via asyncio (single-threaded event loop).
    """

    def __init__(self, rate_per_minute: int) -> None:
        self._tokens = float(rate_per_minute)
        self._capacity = float(rate_per_minute)
        self._rate = rate_per_minute / 60.0  # tokens per second
        self._last_refill = time.monotonic()

    def consume(self) -> bool:
        """Return True if a token is available (message allowed). False → drop."""
        now = time.monotonic()
        elapsed = now - self._last_refill
        self._tokens = min(self._capacity, self._tokens + elapsed * self._rate)
        self._last_refill = now
        if self._tokens >= 1.0:
            self._tokens -= 1.0
            return True
        return False


# ── CargoBot ──────────────────────────────────────────────────────────────────


class CargoBot(SwarmBot):
    """Bot 2 — AIS vessel anomaly detector.

    Uses AISStream.io live WebSocket feed when AISSTREAM_API_KEY is set and
    GENESIS_LIVE_AIS_ENABLED=true (or GENESIS_ENVIRONMENT=production).
    Falls back to deterministic synthetic data otherwise.
    """

    BOT_TYPE = "CARGO_BOT"
    PERSONALITY = "SENTINEL"
    PERSONALITY_LABEL = "Sentinel"

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        cfg = get_config()
        self._live_enabled: bool = cfg.is_production or cfg.live_ais_enabled
        self._api_key: str = cfg.aisstream_api_key
        self._backoff_initial: float = cfg.ais_backoff_initial_s
        self._backoff_max: float = cfg.ais_backoff_max_s
        self._backoff_factor: float = cfg.ais_backoff_factor
        self._rate_limiter = _TokenBucket(cfg.ais_rate_limit_msgs_per_min)
        self._buffer_max: int = cfg.ais_buffer_max_size

        self._vessels: list[VesselSignal] = list(_SEED_VESSELS)
        self._live_buffer: deque[VesselSignal] = deque(maxlen=self._buffer_max)
        self._live: bool = False
        self._ws_task: asyncio.Task | None = None
        self._ais_msgs_received: int = 0
        self._ais_msgs_dropped: int = 0

        # NGA MSI circuit breaker — independent from AIS so MSI failures don't cascade
        self._msi_cb = CircuitBreaker("nga-msi", failure_threshold=3, recovery_timeout=300.0)
        self._msi_warnings: set[str] = set()
        self._msi_live: bool = False
        self._msi_last_fetch: float = 0.0

    async def initialise(self) -> None:
        # Pre-fetch NGA navigation warnings
        await self._msi_cb.call(self._refresh_msi_warnings)

        if self._live_enabled and self._api_key:
            self._ws_task = asyncio.create_task(
                self._ais_listener(), name=f"ais-listener-{self.bot_id}"
            )
            # Give the connection 3 s to establish before the first cycle
            await asyncio.sleep(3.0)
            source = "AISStream LIVE" if self._live else "AISStream (connecting)"
            log.info("[CargoBot] %s — buffer=%d", source, len(self._live_buffer))
        elif self._live_enabled and not self._api_key:
            log.warning(
                "[CargoBot] GENESIS_LIVE_AIS_ENABLED=true but AISSTREAM_API_KEY is not set — "
                "running in simulation mode. Set the API key to enable live feed."
            )
        else:
            log.info("[CargoBot] Simulation mode — %d seed vessels", len(self._vessels))

    async def run_cycle(self) -> DetectionResult | None:
        # Drain live buffer into the vessel list
        while self._live_buffer:
            new_v = self._live_buffer.popleft()
            existing = next((v for v in self._vessels if v.mmsi == new_v.mmsi), None)
            if existing:
                existing.lat = new_v.lat
                existing.lon = new_v.lon
                existing.speed = new_v.speed
                existing.heading = new_v.heading
                existing.dark_hours = 0.0
                existing.source = "AIS_LIVE"
            else:
                self._vessels.append(new_v)
                if len(self._vessels) > 200:
                    self._vessels.pop(0)

        if not self._vessels:
            self._vessels = list(_SEED_VESSELS)

        vessel = random.choice(self._vessels)

        if vessel.source != "AIS_LIVE":
            self._simulate_vessel_tick(vessel)

        # Refresh MSI warnings hourly
        if time.time() - self._msi_last_fetch > 3600.0:
            _fire_task(self._msi_cb.call(self._refresh_msi_warnings))

        score, reasons = self._score_vessel(vessel)
        is_anomaly = score >= self.threshold
        source_tag = ("AIS LIVE" if self._live else "SIM") + ("+MSI" if self._msi_live else "")

        return DetectionResult(
            bot_id=self.bot_id,
            bot_type=self.BOT_TYPE,
            score=score,
            is_anomaly=is_anomaly,
            threshold=self.threshold,
            summary=f"[{source_tag}] Vessel {vessel.vessel_name} risk {score:.1f}/100",
            details={
                "fund_name": "MARITIME-ALPHA-LUX",
                "mmsi": vessel.mmsi,
                "vessel_name": vessel.vessel_name,
                "flag_state": vessel.flag_state,
                "dark_hours": round(vessel.dark_hours, 2),
                "speed_kn": round(vessel.speed, 1),
                "lat": round(vessel.lat, 4),
                "lon": round(vessel.lon, 4),
                "risk_reasons": reasons,
                "score": score,
                "source": source_tag,
                "ais_msgs_received": self._ais_msgs_received,
                "ais_msgs_dropped": self._ais_msgs_dropped,
            },
        )

    # ── AISStream WebSocket listener ───────────────────────────────────────────

    async def _ais_listener(self) -> None:
        """
        Persistent AISStream.io listener with exponential backoff reconnection.

        Backoff schedule:  initial → initial*factor → … → max.
        Resets to initial on any successful message received.
        """
        backoff = self._backoff_initial

        subscribe_payload = json.dumps({
            "APIKey": self._api_key,
            "BoundingBoxes": _BOUNDING_BOXES,
            "FilterMessageTypes": ["PositionReport", "ShipStaticData"],
        })

        while self._running:
            try:
                import websockets

                connect_kwargs: dict = {
                    "ping_interval": get_config().ais_ping_interval_s,
                    "ping_timeout": get_config().ais_ping_timeout_s,
                    "close_timeout": 5.0,
                    "max_size": 64 * 1024,
                }
                async with websockets.connect(AISSTREAM_WS_URL, **connect_kwargs) as ws:
                    await ws.send(subscribe_payload)
                    log.info("[CargoBot] AISStream WebSocket connected")
                    backoff = self._backoff_initial  # reset on successful connection

                    async for raw in ws:
                        if not self._running:
                            return

                        # Rate limiting: drop messages above configured threshold
                        if not self._rate_limiter.consume():
                            self._ais_msgs_dropped += 1
                            continue

                        try:
                            msg = json.loads(raw)
                        except json.JSONDecodeError:
                            continue

                        vessel = _parse_aisstream_message(msg)
                        if vessel:
                            self._live_buffer.append(vessel)
                            self._ais_msgs_received += 1
                            self._live = True

            except ImportError:
                log.warning("[CargoBot] websockets not installed — AIS feed unavailable. "
                            "pip install websockets>=12.0")
                return
            except (OSError, ConnectionResetError, TimeoutError) as exc:
                log.info("[CargoBot] AIS disconnect (%s) — retry in %.0fs", exc, backoff)
            except asyncio.CancelledError:
                return
            except Exception as exc:  # noqa: BLE001
                log.warning("[CargoBot] AIS unexpected error (%s) — retry in %.0fs", exc, backoff)

            self._live = False
            await asyncio.sleep(backoff)
            backoff = min(backoff * self._backoff_factor, self._backoff_max)

    # ── NGA MSI warnings ──────────────────────────────────────────────────────

    async def _refresh_msi_warnings(self) -> None:
        """Fetch active NGA navigation warnings (free, no key required)."""
        try:
            ctx = ssl.create_default_context(cafile=certifi.where())
            connector = aiohttp.TCPConnector(ssl=ctx)
            timeout = aiohttp.ClientTimeout(total=15.0, connect=5.0)
            async with aiohttp.ClientSession(
                connector=connector,
                headers={"User-Agent": "Genesis-Swarm/0.5.0 maritime-risk"},
                timeout=timeout,
            ) as session:
                async with session.get(NGA_MSI_URL) as resp:
                    if resp.status != 200:
                        raise OSError(f"NGA MSI HTTP {resp.status}")
                    data = await resp.json(content_type=None)

            warnings = data if isinstance(data, list) else data.get("publications", [])
            subregions: set[str] = set()
            for w in warnings:
                sr = str(w.get("subregion", "") or w.get("navArea", ""))
                if sr:
                    subregions.add(sr.upper())

            self._msi_warnings = subregions
            self._msi_live = True
            self._msi_last_fetch = time.time()
            log.info("[CargoBot] NGA MSI — %d warnings, %d subregions", len(warnings),
                     len(subregions))

        except (OSError, aiohttp.ClientError, asyncio.TimeoutError) as exc:
            log.info("[CargoBot] NGA MSI fetch failed (%s) — using last known state", exc)
            self._msi_last_fetch = time.time()
            raise  # re-raise so CircuitBreaker can record the failure

    # ── Simulation helpers ────────────────────────────────────────────────────

    @staticmethod
    def _simulate_vessel_tick(vessel: VesselSignal) -> None:
        """Apply synthetic AIS evolution to a non-live vessel."""
        vessel.dark_hours = random.expovariate(1.0 / 2.0)
        vessel.speed = max(0.0, vessel.speed + random.gauss(0, 0.5))
        if random.random() < 0.05:
            vessel.flag_state = random.choice(list(HIGH_RISK_FLAGS))
        if random.random() < 0.02:
            vessel.dark_hours = random.uniform(12.0, 72.0)

    # ── Vessel risk scoring ───────────────────────────────────────────────────

    def _score_vessel(self, v: VesselSignal) -> tuple[float, list[str]]:
        score = 0.0
        reasons: list[str] = []

        if v.flag_state in HIGH_RISK_FLAGS:
            score += 40.0
            reasons.append(f"High-risk flag state: {v.flag_state}")
        if v.dark_hours > 24.0:
            score += 35.0
            reasons.append(f"AIS dark for {v.dark_hours:.1f}h (>24h threshold)")
        elif v.dark_hours > 6.0:
            score += 15.0
            reasons.append(f"AIS gap: {v.dark_hours:.1f}h")
        if v.cargo_type == "CRUDE_OIL" and v.flag_state in HIGH_RISK_FLAGS:
            score += 20.0
            reasons.append("Crude oil + sanctioned flag combination")
        if v.speed == 0.0 and v.dark_hours > 2.0:
            score += 10.0
            reasons.append("Stationary with AIS gap")
        if v.destination in SANCTIONED_PORTS:
            score += 50.0
            reasons.append(f"Destination: {v.destination} (sanctioned port)")

        return min(score, 100.0), reasons

    def stop(self) -> None:
        super().stop()
        if self._ws_task and not self._ws_task.done():
            self._ws_task.cancel()

    def cycle_interval_seconds(self) -> float:
        return 3.0
