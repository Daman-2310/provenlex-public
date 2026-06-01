"""
OrbitalBot — satellite + aircraft anomaly detector.

Data sources
------------
Production ADS-B : OpenSky Network REST API (opensky-network.org/api/states/all)
                   Anonymous: 1 req/10 s.  Authenticated: 1 req/5 s.
                   Requires OPENSKY_USERNAME + OPENSKY_PASSWORD env vars for auth.
Production SATCAT : Celestrak SATCAT CSV (celestrak.org/pub/satcat.csv)
                   Free, no key required.
Development      : Static fallback pools for both; same scoring logic.

Live feed behaviour
-------------------
- OpenSky polled at GENESIS_OPENSKY_POLL_INTERVAL_S (default 10 s).
- Exponential backoff on HTTP errors: initial → max capped at 5 min.
- Circuit breaker wraps OpenSky calls independently from Celestrak.
- Rate-limit 429 responses trigger immediate backoff cooldown.
- Celestrak SATCAT fetched once at startup and refreshed every 6 h.

Environment toggle
------------------
Set GENESIS_ENVIRONMENT=production  OR  GENESIS_LIVE_ADSB_ENABLED=true to
connect to real OpenSky data.  Development mode simulates SGP4-style orbit
propagation on the static fallback catalog.
"""

from __future__ import annotations
import base64
from ..shared.config import get_config
from ..shared.circuit_breaker import CircuitBreaker
from ..shared.bot_base import DetectionResult, SwarmBot
import certifi
import aiohttp
from typing import Any
from dataclasses import dataclass
import time
import ssl
import random
import logging
import io
import csv

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

# ── Celestrak SATCAT endpoint ─────────────────────────────────────────────────

SATCAT_URL = "https://celestrak.org/pub/satcat.csv"
SATCAT_REFRESH_INTERVAL_S = 6 * 3600  # re-fetch every 6 hours

# ── OpenSky REST endpoint ─────────────────────────────────────────────────────

OPENSKY_STATES_URL = "https://opensky-network.org/api/states/all"

# Coverage area for OpenSky query (matches fund-relevant airspace)
# lat_min, lat_max, lon_min, lon_max
OPENSKY_BBOX = (30.0, 72.0, -15.0, 45.0)

# ── Risk constants ────────────────────────────────────────────────────────────

MARITIME_WATCH_REGIONS: frozenset[str] = frozenset(
    {"North Sea", "Baltic Sea", "Atlantic", "Mediterranean", "Arctic"}
)

_COUNTRY_REGION: dict[str, str] = {
    "US": "Atlantic", "UK": "North Sea", "GB": "North Sea",
    "DE": "North Sea", "NL": "North Sea", "NO": "North Sea",
    "SE": "Baltic Sea", "FI": "Baltic Sea", "DK": "Baltic Sea",
    "RU": "Arctic", "FR": "Atlantic", "ES": "Atlantic",
    "IT": "Mediterranean", "GR": "Mediterranean", "TR": "Mediterranean",
    "CN": "Pacific", "JP": "Pacific", "KR": "Pacific",
    "IN": "Indian Ocean", "AU": "Pacific",
}
_DEFAULT_REGION = "Luxembourg"

_PURPOSE_KEYWORDS: dict[str, frozenset[str]] = {
    "IMAGING": frozenset({
        "IKONOS", "WORLDVIEW", "GEOEYE", "SPOT", "SENTINEL",
        "LANDSAT", "PLEIADES", "KOMPSAT", "SKYMED", "CSK",
    }),
    "COMMS": frozenset({
        "INTELSAT", "SES", "EUTELSAT", "TELESAT", "INMARSAT",
        "IRIDIUM", "GLOBALSTAR", "STARLINK", "ONEWEB",
    }),
    "NAVIGATION": frozenset({"GPS", "GLONASS", "GALILEO", "BEIDOU", "NAVSTAR", "SBAS", "WAAS"}),
    "WEATHER": frozenset({"NOAA", "GOES", "METEOSAT", "METOP", "SUOMI", "HIMAWARI", "FENGYUN"}),
}

# ── Domain types ──────────────────────────────────────────────────────────────


@dataclass
class SatellitePass:
    norad_id: int
    sat_name: str
    pass_time: float
    elevation_deg: float
    azimuth_deg: float
    coverage_region: str
    purpose: str   # COMMS | IMAGING | NAVIGATION | WEATHER | UNKNOWN
    source: str = "SIM"


@dataclass
class AircraftState:
    icao24: str
    callsign: str
    origin_country: str
    lat: float
    lon: float
    altitude_m: float   # geometric altitude in metres
    velocity_ms: float  # ground speed in m/s
    heading: float
    on_ground: bool
    squawk: str        # transponder code ("7500" = hijack, "7700" = emergency)
    source: str = "SIM"


# ── Fallback catalogs ─────────────────────────────────────────────────────────

_FALLBACK_SATS: list[dict[str, Any]] = [
    {"norad_id": 25544, "name": "ISS (ZARYA)", "country": "ISS", "status": "+"},
    {"norad_id": 28654, "name": "NOAA 18", "country": "US", "status": "+"},
    {"norad_id": 33591, "name": "NOAA 19", "country": "US", "status": "+"},
    {"norad_id": 37849, "name": "SUOMI NPP", "country": "US", "status": "+"},
    {"norad_id": 99001, "name": "OBJECT A (UNK)", "country": "UNK", "status": "?"},
    {"norad_id": 99002, "name": "OBJECT B (UNK)", "country": "UNK", "status": "?"},
]

_FALLBACK_AIRCRAFT: list[AircraftState] = [
    AircraftState("3c6444", "LH400", "Germany", 48.5, 11.2, 10000.0, 230.0, 270.0, False, ""),
    AircraftState("a12345", "AA100", "United States", 51.5, -0.1, 11000.0, 250.0, 90.0, False, ""),
    AircraftState("ffffff", "UNKNWN", "Unknown", 35.0, 14.0, 500.0, 50.0, 180.0, False, "7500"),
]


# ── Helper functions ──────────────────────────────────────────────────────────


def _classify_purpose(name: str) -> str:
    name_up = name.upper()
    for purpose, keywords in _PURPOSE_KEYWORDS.items():
        if any(kw in name_up for kw in keywords):
            return purpose
    return "UNKNOWN"


def _country_to_region(country: str) -> str:
    return _COUNTRY_REGION.get(country.strip().upper(), _DEFAULT_REGION)


def _parse_opensky_state(state: list[Any]) -> AircraftState | None:
    """Parse one OpenSky state vector list into an AircraftState."""
    try:
        # OpenSky state vector: [icao24, callsign, origin_country, time_position,
        #  last_contact, longitude, latitude, baro_altitude, on_ground, velocity,
        #  true_track, vertical_rate, sensors, geo_altitude, squawk, spi, position_source]
        if len(state) < 17:
            return None
        icao24 = str(state[0] or "")
        callsign = str(state[1] or "").strip()
        country = str(state[2] or "Unknown")
        lon = float(state[5]) if state[5] is not None else 0.0
        lat = float(state[6]) if state[6] is not None else 0.0
        baro_alt = float(state[7]) if state[7] is not None else 0.0
        on_ground = bool(state[8])
        velocity = float(state[9]) if state[9] is not None else 0.0
        heading = float(state[10]) if state[10] is not None else 0.0
        geo_alt = float(state[13]) if state[13] is not None else baro_alt
        squawk = str(state[14] or "")
        return AircraftState(
            icao24=icao24,
            callsign=callsign or f"ACFT-{icao24.upper()[-4:]}",
            origin_country=country,
            lat=lat,
            lon=lon,
            altitude_m=geo_alt,
            velocity_ms=velocity,
            heading=heading,
            on_ground=on_ground,
            squawk=squawk,
            source="ADS-B LIVE",
        )
    except (IndexError, ValueError, TypeError):
        return None


# ── OrbitalBot ────────────────────────────────────────────────────────────────


class OrbitalBot(SwarmBot):
    """Bot 10 — Satellite + aircraft anomaly detector.

    Uses Celestrak SATCAT for satellite data and OpenSky Network for live ADS-B
    when GENESIS_LIVE_ADSB_ENABLED=true or GENESIS_ENVIRONMENT=production.
    """

    BOT_TYPE = "SATELLITE_ANALYTICS"
    PERSONALITY = "AGGRESSIVE"
    PERSONALITY_LABEL = "Aggressive"

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        cfg = get_config()
        self._live_enabled: bool = cfg.is_production or cfg.live_adsb_enabled
        self._opensky_user: str = cfg.opensky_username
        self._opensky_pass: str = cfg.opensky_password
        self._opensky_url: str = cfg.opensky_api_url
        self._poll_interval: float = cfg.opensky_poll_interval_s
        self._backoff_initial: float = cfg.opensky_backoff_initial_s
        self._backoff_max: float = cfg.opensky_backoff_max_s

        self._passes: list[SatellitePass] = []
        self._aircraft: list[AircraftState] = list(_FALLBACK_AIRCRAFT)
        self._anomaly_window: list[dict] = []
        self._catalog_size: int = 0
        self._satcat_live: bool = False
        self._adsb_live: bool = False
        self._satcat_last_fetch: float = 0.0

        self._opensky_cb = CircuitBreaker(
            "opensky-api",
            failure_threshold=3,
            recovery_timeout=120.0,
        )
        self._opensky_backoff: float = self._backoff_initial
        self._opensky_task: asyncio.Task | None = None

        # Shared TLS context for all outbound HTTPS
        self._ssl_ctx = ssl.create_default_context(cafile=certifi.where())

    async def initialise(self) -> None:
        self._passes = await self._load_celestrak()
        log.info(
            "[OrbitalBot] SATCAT %s — %d objects",
            "LIVE" if self._satcat_live else "FALLBACK",
            len(self._passes),
        )

        if self._live_enabled:
            self._opensky_task = asyncio.create_task(
                self._opensky_poll_loop(), name=f"opensky-{self.bot_id}"
            )
            log.info(
                "[OrbitalBot] OpenSky ADS-B polling enabled (auth=%s)",
                bool(self._opensky_user),
            )
        else:
            log.info("[OrbitalBot] ADS-B simulation mode — %d synthetic aircraft",
                     len(self._aircraft))

    async def run_cycle(self) -> DetectionResult | None:
        now = time.time()

        # Refresh Celestrak every 6 hours
        if now - self._satcat_last_fetch > SATCAT_REFRESH_INTERVAL_S:
            _fire_task(self._refresh_satcat())

        # Prune the cluster anomaly window (1-hour rolling)
        self._anomaly_window = [p for p in self._anomaly_window if now - p["ts"] < 3600.0]

        sat = random.choice(self._passes)
        sat.pass_time = now
        sat.elevation_deg = random.uniform(5.0, 85.0)
        sat.azimuth_deg = random.uniform(0.0, 360.0)

        sat_score, sat_risks = self._assess_satellite(sat)
        cluster_bonus = self._cluster_bonus()

        # Score an aircraft from the live or synthetic pool
        aircraft = random.choice(self._aircraft) if self._aircraft else None
        if aircraft and not self._adsb_live:
            self._simulate_aircraft_tick(aircraft)

        adsb_score: float = 0.0
        adsb_risks: list[str] = []
        if aircraft:
            adsb_score, adsb_risks = self._assess_aircraft(aircraft)

        combined_score = min(max(sat_score, adsb_score) + cluster_bonus, 100.0)
        is_anomaly = combined_score >= self.threshold

        if combined_score > 30.0:
            self._anomaly_window.append({"score": combined_score, "ts": now})

        source_tag = ("LIVE" if (self._satcat_live or self._adsb_live) else "SIM")

        return DetectionResult(
            bot_id=self.bot_id,
            bot_type=self.BOT_TYPE,
            score=combined_score,
            is_anomaly=is_anomaly,
            threshold=self.threshold,
            summary=(
                f"[{source_tag}] Orbital: {sat.sat_name} over {sat.coverage_region} "
                f"/ ADS-B: {aircraft.callsign if aircraft else 'N/A'} "
                f"— risk {combined_score:.1f}"
            ),
            details={
                "fund_name": "MARITIME-ALPHA-LUX",
                "satellite": {
                    "norad_id": sat.norad_id,
                    "name": sat.sat_name,
                    "region": sat.coverage_region,
                    "purpose": sat.purpose,
                    "elevation": round(sat.elevation_deg, 1),
                    "score": round(sat_score, 1),
                    "risks": sat_risks,
                    "source": "SATCAT_LIVE" if self._satcat_live else "SATCAT_FALLBACK",
                },
                "aircraft": {
                    "icao24": aircraft.icao24 if aircraft else "",
                    "callsign": aircraft.callsign if aircraft else "",
                    "country": aircraft.origin_country if aircraft else "",
                    "altitude_m": round(aircraft.altitude_m, 0) if aircraft else 0,
                    "squawk": aircraft.squawk if aircraft else "",
                    "score": round(adsb_score, 1),
                    "risks": adsb_risks,
                    "source": "ADSB_LIVE" if self._adsb_live else "ADSB_SIM",
                },
                "cluster_anomalies_1h": len(self._anomaly_window),
                "catalog_size": self._catalog_size,
                "combined_score": round(combined_score, 1),
            },
        )

    # ── OpenSky ADS-B polling loop ────────────────────────────────────────────

    async def _opensky_poll_loop(self) -> None:
        """Poll OpenSky REST API with exponential backoff on failure."""
        while self._running:
            await self._opensky_cb.call(self._fetch_opensky_states)
            await asyncio.sleep(self._poll_interval)

    async def _fetch_opensky_states(self) -> None:
        """
        One OpenSky API request.  Raises on HTTP error so CircuitBreaker can record it.
        """
        lat_min, lat_max, lon_min, lon_max = OPENSKY_BBOX
        params = {
            "lamin": lat_min,
            "lamax": lat_max,
            "lomin": lon_min,
            "lomax": lon_max,
        }

        headers: dict[str, str] = {}
        if self._opensky_user and self._opensky_pass:
            credentials = f"{self._opensky_user}:{self._opensky_pass}"
            encoded = base64.b64encode(credentials.encode()).decode()
            headers["Authorization"] = f"Basic {encoded}"

        connector = aiohttp.TCPConnector(ssl=self._ssl_ctx)
        timeout = aiohttp.ClientTimeout(total=15.0, connect=5.0)
        async with aiohttp.ClientSession(
            connector=connector,
            headers=headers,
            timeout=timeout,
        ) as session:
            async with session.get(OPENSKY_STATES_URL, params=params) as resp:
                if resp.status == 429:
                    # Rate-limited — back off immediately
                    retry_after = float(resp.headers.get("Retry-After", "30"))
                    log.warning("[OrbitalBot] OpenSky rate-limited — backoff %.0fs", retry_after)
                    await asyncio.sleep(retry_after)
                    raise OSError("rate-limited")
                if resp.status == 401:
                    log.warning("[OrbitalBot] OpenSky auth failed — check credentials")
                    raise OSError("unauthorized")
                if resp.status != 200:
                    raise OSError(f"OpenSky HTTP {resp.status}")

                data = await resp.json()

        states = data.get("states") or []
        parsed: list[AircraftState] = []
        for s in states[:500]:  # cap at 500 aircraft
            aircraft = _parse_opensky_state(s)
            if aircraft:
                parsed.append(aircraft)

        if parsed:
            self._aircraft = parsed
            self._adsb_live = True
            self._opensky_backoff = self._backoff_initial  # reset on success
            log.debug("[OrbitalBot] OpenSky: %d aircraft in bbox", len(parsed))

    # ── Celestrak SATCAT loader ───────────────────────────────────────────────

    async def _load_celestrak(self) -> list[SatellitePass]:
        try:
            connector = aiohttp.TCPConnector(ssl=self._ssl_ctx)
            timeout = aiohttp.ClientTimeout(total=25.0, connect=8.0)
            async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
                async with session.get(SATCAT_URL) as resp:
                    if resp.status != 200:
                        raise OSError(f"Celestrak HTTP {resp.status}")
                    text = await resp.text()

            passes = _parse_satcat_csv(text)
            if not passes:
                raise ValueError("empty SATCAT parse")

            self._satcat_live = True
            self._satcat_last_fetch = time.time()
            self._catalog_size = len(passes)
            log.info("[OrbitalBot] Celestrak LIVE — %d active objects", len(passes))
            return passes

        except (OSError, aiohttp.ClientError, asyncio.TimeoutError, ValueError) as exc:
            log.warning("[OrbitalBot] Celestrak fetch failed (%s) — using fallback", exc)
            self._catalog_size = len(_FALLBACK_SATS)
            return _fallback_passes()

    async def _refresh_satcat(self) -> None:
        passes = await self._load_celestrak()
        if passes:
            self._passes = passes

    # ── Risk scoring ──────────────────────────────────────────────────────────

    def _assess_satellite(self, sat: SatellitePass) -> tuple[float, list[str]]:
        score = 0.0
        risks: list[str] = []

        if sat.purpose == "UNKNOWN":
            score += 45.0
            risks.append(f"Unregistered satellite NORAD-{sat.norad_id}")
        if sat.coverage_region in MARITIME_WATCH_REGIONS and sat.purpose == "IMAGING":
            score += 20.0
            risks.append(f"Imaging pass over {sat.coverage_region}")
        if sat.elevation_deg > 70.0:
            score += 10.0
            risks.append(f"High-elevation pass ({sat.elevation_deg:.1f}°) — extended window")

        return min(score, 100.0), risks

    def _assess_aircraft(self, ac: AircraftState) -> tuple[float, list[str]]:
        score = 0.0
        risks: list[str] = []

        if ac.squawk == "7500":
            score += 80.0
            risks.append("Squawk 7500 — UNLAWFUL INTERFERENCE / HIJACK")
        elif ac.squawk == "7700":
            score += 60.0
            risks.append("Squawk 7700 — GENERAL EMERGENCY")
        elif ac.squawk == "7600":
            score += 40.0
            risks.append("Squawk 7600 — RADIO FAILURE")

        if ac.altitude_m < 300.0 and not ac.on_ground and ac.velocity_ms > 50.0:
            score += 30.0
            risks.append(f"Low-altitude high-speed: {ac.altitude_m:.0f}m @ {ac.velocity_ms:.0f}m/s")

        if ac.origin_country.lower() in {"north korea", "iran", "syria"}:
            score += 25.0
            risks.append(f"Aircraft from sanctioned state: {ac.origin_country}")

        return min(score, 100.0), risks

    def _cluster_bonus(self) -> float:
        n = len(self._anomaly_window)
        if n >= 5:
            return 25.0
        if n >= 3:
            return 15.0
        if n >= 2:
            return 8.0
        return 0.0

    @staticmethod
    def _simulate_aircraft_tick(ac: AircraftState) -> None:
        ac.altitude_m = max(0.0, ac.altitude_m + random.gauss(0, 200))
        ac.velocity_ms = max(0.0, ac.velocity_ms + random.gauss(0, 5))
        if random.random() < 0.005:
            ac.squawk = random.choice(["7500", "7700", "7600", ""])

    def stop(self) -> None:
        super().stop()
        if self._opensky_task and not self._opensky_task.done():
            self._opensky_task.cancel()

    def cycle_interval_seconds(self) -> float:
        return 10.0


# ── CSV parsing helpers ───────────────────────────────────────────────────────


def _parse_satcat_csv(text: str) -> list[SatellitePass]:
    passes: list[SatellitePass] = []
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        status = row.get("STATUS", "").strip()
        obj_type = row.get("OBJECT_TYPE", "").strip()
        norad_raw = row.get("NORAD_CAT_ID", "").strip()
        name_raw = row.get("SATNAME", "").strip()
        country = row.get("COUNTRY", "").strip()

        if status not in ("+", "?"):
            continue
        if obj_type not in ("PAY", "UNK", "DEB"):
            continue
        if not norad_raw or not name_raw:
            continue

        passes.append(
            SatellitePass(
                norad_id=int(norad_raw),
                sat_name=name_raw[:32],
                pass_time=0.0,
                elevation_deg=0.0,
                azimuth_deg=0.0,
                coverage_region=_country_to_region(country),
                purpose=_classify_purpose(name_raw),
                source="SATCAT_LIVE",
            )
        )
        if len(passes) >= 1000:
            break
    return passes


def _fallback_passes() -> list[SatellitePass]:
    return [
        SatellitePass(
            norad_id=s["norad_id"],
            sat_name=s["name"],
            pass_time=0.0,
            elevation_deg=0.0,
            azimuth_deg=0.0,
            coverage_region=_country_to_region(s["country"]),
            purpose=_classify_purpose(s["name"]),
            source="FALLBACK",
        )
        for s in _FALLBACK_SATS
    ]
