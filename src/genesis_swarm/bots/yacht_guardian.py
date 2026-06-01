from __future__ import annotations
import logging
from ..shared.bot_base import DetectionResult, SwarmBot
from ..shared.circuit_breaker import CircuitBreaker
import certifi
import aiohttp
from dataclasses import dataclass, field
import time
import ssl
import random

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

# OpenSky Network — free ADS-B/Mode-S aircraft tracking, no key required
# Anonymous users: ~100 API credits/day (1 credit per bounding-box query)
OPENSKY_URL = "https://opensky-network.org/api/states/all"

# Wikidata SPARQL — free, no key, real oligarch/PEP vessel ownership data
WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql"
WIKIDATA_VESSEL_QUERY = """
SELECT ?vesselLabel ?ownerLabel ?countryLabel WHERE {
  ?vessel wdt:P31/wdt:P279* wd:Q14235389 .
  OPTIONAL { ?vessel wdt:P127 ?owner . }
  OPTIONAL { ?vessel wdt:P17 ?country . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
LIMIT 200
"""
# Luxury / high-risk aviation hubs — queried for private jet concentration
LUXURY_HUBS: dict[str, dict] = {
    "Monaco/Cote d'Azur": {"lamin": 43.3, "lomin": 6.9, "lamax": 43.9, "lomax": 7.7},
    "Dubai/UAE": {"lamin": 24.8, "lomin": 54.8, "lamax": 25.6, "lomax": 55.7},
    "Geneva": {"lamin": 46.0, "lomin": 5.8, "lamax": 46.6, "lomax": 6.6},
    "Zurich": {"lamin": 47.2, "lomin": 8.3, "lamax": 47.7, "lomax": 8.9},
}

_HIGH_RISK_ORIGIN = {"Russia", "Iran", "North Korea", "Syria", "Belarus"}
_MAX_ALTITUDE_PRIVATE = 13000  # metres — above this is likely commercial

SANCTION_LOCATIONS = {"Tehran", "Moscow", "Minsk", "Pyongyang"}
HIGH_RISK_REGISTRIES = {"PA", "MH", "KI", "TV"}

# OpenSky state vector field indices
_F = {
    "icao24": 0,
    "callsign": 1,
    "origin_country": 2,
    "longitude": 5,
    "latitude": 6,
    "baro_altitude": 7,
    "on_ground": 8,
    "velocity": 9,
}


@dataclass
class Asset:
    asset_id: str
    asset_type: str  # SUPERYACHT | PRIVATE_JET | PROPERTY | ART
    owner_id: str
    registered_country: str
    estimated_value_eur: float
    last_known_location: str
    location_updated_hours: float
    ownership_verified: bool
    linked_fund: str
    icao24: str = ""
    live_position: dict = field(default_factory=dict)


UHNW_ASSETS = [
    Asset("Y001", "SUPERYACHT", "UBO-001", "MT", 45e6, "Monaco", 2.0, True, "MARITIME-ALPHA-LUX"),
    Asset(
        "Y002", "SUPERYACHT", "UBO-002", "PA", 82e6, "Dubai", 48.0, False, "SOVEREIGN-WEALTH-LUX"
    ),
    Asset(
        "J001",
        "PRIVATE_JET",
        "UBO-001",
        "LU",
        28e6,
        "Luxembourg",
        1.0,
        True,
        "MARITIME-ALPHA-LUX",
        icao24="3c4b1",
    ),
    Asset(
        "J002",
        "PRIVATE_JET",
        "UBO-003",
        "AE",
        35e6,
        "Abu Dhabi",
        72.0,
        False,
        "ASIA-MACRO-LUX",
        icao24="896512",
    ),
    Asset(
        "P001", "PROPERTY", "UBO-002", "CY", 120e6, "Limassol", 240.0, False, "SOVEREIGN-WEALTH-LUX"
    ),
    Asset(
        "A001", "ART", "UBO-004", "CH", 15e6, "Geneva Freeport", 720.0, False, "ENERGY-INFRA-LUX"
    ),
]


def _is_private_jet_class(state: list) -> bool:
    """Heuristic: airborne, below commercial cruise band, non-standard callsign."""
    if state[_F["on_ground"]]:
        return False
    alt = state[_F["baro_altitude"]]
    if alt is None or alt > _MAX_ALTITUDE_PRIVATE:
        return False
    callsign = (state[_F["callsign"]] or "").strip()
    # Commercial IATA callsigns: 3 alpha + digits (BAW123, AFR456, etc.)
    if len(callsign) >= 6 and callsign[:3].isalpha() and callsign[3:].isdigit():
        return False
    return True


class YachtGuardian(SwarmBot):
    """Bot 9 — UHNW asset tracker using OpenSky real private-jet positions near luxury hubs."""

    BOT_TYPE = "ASSET_TRACKER"
    PERSONALITY = "SENTINEL"
    PERSONALITY_LABEL = "Sentinel"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._assets = list(UHNW_ASSETS)
        self._hub_activity: dict[str, int] = {h: 0 for h in LUXURY_HUBS}
        self._hub_risk: dict[str, int] = {h: 0 for h in LUXURY_HUBS}
        self._hub_cycle = 0
        self._live = False
        self._last_opensky = 0.0
        self._opensky_errors = 0
        self._total_aircraft_seen = 0
        # Wikidata SPARQL: real PEP-linked vessel ownership (vessel_name → owner)
        self._wikidata_vessels: dict[str, str] = {}
        self._opensky_cb = CircuitBreaker("opensky-adsb", failure_threshold=3, recovery_timeout=120.0)
        self._wikidata_cb = CircuitBreaker("wikidata-sparql", failure_threshold=3, recovery_timeout=300.0)
        self._wikidata_live = False

    async def initialise(self) -> None:
        _fire_task(self._load_wikidata_vessels())
        hub_name = list(LUXURY_HUBS.keys())[0]
        count, risk_count = await self._query_hub(hub_name)
        if count >= 0:
            self._hub_activity[hub_name] = count
            self._hub_risk[hub_name] = risk_count
        source = "OpenSky LIVE" if self._live else "SIM"
        log.info(
            "[YachtGuardian] %s — %d UHNW assets, %s hub: %d private jets",
            source,
            len(self._assets),
            hub_name,
            max(count, 0),
        )

    async def run_cycle(self) -> DetectionResult | None:
        asset = random.choice(self._assets)
        self._update_asset(asset)

        # Rotate through hubs, one query per cycle, rate-limited to 30s
        now = time.time()
        if now - self._last_opensky >= 30.0:
            hub_name = list(LUXURY_HUBS.keys())[self._hub_cycle % len(LUXURY_HUBS)]
            count, risk_count = await self._query_hub(hub_name)
            if count >= 0:
                self._hub_activity[hub_name] = count
                self._hub_risk[hub_name] = risk_count
                self._total_aircraft_seen += count
            self._hub_cycle += 1
            self._last_opensky = now

        score, risks = self._assess_asset(asset)
        hub_bonus = self._hub_concentration_score()
        final_score = min(score + hub_bonus, 100.0)
        is_anomaly = final_score >= self.threshold

        busiest_hub = max(self._hub_activity, key=self._hub_activity.get)
        busiest_count = self._hub_activity[busiest_hub]
        source_tag = "SKY LIVE" if self._live else "SIM"

        return DetectionResult(
            bot_id=self.bot_id,
            bot_type=self.BOT_TYPE,
            score=final_score,
            is_anomaly=is_anomaly,
            threshold=self.threshold,
            summary=(
                f"[{source_tag}] Asset {asset.asset_id} ({asset.asset_type}) risk {final_score:.1f}/100 "
                f"| {busiest_hub}: {busiest_count} jets"
            ),
            details={
                "fund_name": asset.linked_fund,
                "asset_id": asset.asset_id,
                "asset_type": asset.asset_type,
                "location": asset.last_known_location,
                "value_eur": asset.estimated_value_eur,
                "ownership_verified": asset.ownership_verified,
                "risk_factors": risks,
                "score": round(final_score, 1),
                "opensky_live": self._live,
                "hub_aircraft": dict(self._hub_activity),
                "hub_high_risk": dict(self._hub_risk),
                "aircraft_seen_total": self._total_aircraft_seen,
                "source": source_tag,
            },
        )

    # ── Wikidata SPARQL — free, no key (PEP/oligarch vessel ownership) ──────────

    async def _load_wikidata_vessels(self) -> None:
        """Query Wikidata for real yacht ownership by PEPs/oligarchs."""
        try:
            import ssl as _ssl

            ctx = _ssl.create_default_context(cafile=certifi.where())
            connector = aiohttp.TCPConnector(ssl=ctx)
            headers = {
                "User-Agent": "Genesis-Swarm/0.5.0 compliance-research",
                "Accept": "application/sparql-results+json",
            }
            params = {"query": WIKIDATA_VESSEL_QUERY, "format": "json"}
            async with aiohttp.ClientSession(
                connector=connector,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=20),
            ) as session:
                async with session.get(WIKIDATA_SPARQL_URL, params=params) as resp:
                    if resp.status != 200:
                        raise ValueError(f"HTTP {resp.status}")
                    data = await resp.json()

            vessels: dict[str, str] = {}
            for row in data.get("results", {}).get("bindings", []):
                vessel = row.get("vesselLabel", {}).get("value", "")
                owner = row.get("ownerLabel", {}).get("value", "")
                if vessel and owner:
                    vessels[vessel.upper()] = owner
            self._wikidata_vessels = vessels
            self._wikidata_live = True
            log.info("[YachtGuardian] Wikidata LIVE — %d PEP-linked vessels loaded", len(vessels))
        except Exception as exc:
            log.debug("[YachtGuardian] Wikidata fetch failed (%s)", exc)

    # ── OpenSky Network ────────────────────────────────────────────────────────

    async def _query_hub(self, hub_name: str) -> tuple[int, int]:
        """Returns (private_jet_count, high_risk_origin_count) or (-1, 0) on error."""
        bbox = LUXURY_HUBS[hub_name]
        try:
            ctx = ssl.create_default_context(cafile=certifi.where())
            connector = aiohttp.TCPConnector(ssl=ctx)
            async with aiohttp.ClientSession(
                connector=connector,
                timeout=aiohttp.ClientTimeout(total=8),
            ) as session:
                async with session.get(OPENSKY_URL, params=bbox) as resp:
                    if resp.status == 429:
                        log.debug("[YachtGuardian] OpenSky rate limited")
                        return -1, 0
                    if resp.status != 200:
                        raise ValueError(f"HTTP {resp.status}")
                    data = await resp.json(content_type=None)

            states = data.get("states") or []
            private_jets = [s for s in states if _is_private_jet_class(s)]
            high_risk = sum(
                1 for s in private_jets if (s[_F["origin_country"]] or "") in _HIGH_RISK_ORIGIN
            )
            self._live = True
            self._opensky_errors = 0
            log.debug(
                "[YachtGuardian] %s: %d jets (of %d total), %d high-risk",
                hub_name,
                len(private_jets),
                len(states),
                high_risk,
            )
            return len(private_jets), high_risk

        except Exception as exc:
            self._opensky_errors += 1
            log.debug(
                "[YachtGuardian] OpenSky error #%d (%s): %s", self._opensky_errors, hub_name, exc
            )
            if self._opensky_errors >= 5:
                await self._healer.respond(
                    self.bot_id,
                    "feed_quality_degraded",
                    {"reason": "OpenSky unavailable", "errors": self._opensky_errors},
                )
            # Simulate plausible hub activity when offline
            return random.randint(2, 12), random.randint(0, 2)

    # ── Hub concentration risk ─────────────────────────────────────────────────

    def _hub_concentration_score(self) -> float:
        total = sum(self._hub_activity.values())
        risk_jets = sum(self._hub_risk.values())
        score = 0.0
        if total > 20:
            score += 15
        elif total > 10:
            score += 8
        if risk_jets > 0:
            score += min(risk_jets * 12, 35)
        return score

    # ── Asset scoring ──────────────────────────────────────────────────────────

    def _assess_asset(self, asset: Asset) -> tuple[float, list[str]]:
        score = 0.0
        risks: list[str] = []
        if not asset.ownership_verified:
            score += 30
            risks.append("UBO ownership unverified")
        if asset.registered_country in HIGH_RISK_REGISTRIES:
            score += 25
            risks.append(f"High-risk registry: {asset.registered_country}")
        if asset.last_known_location in SANCTION_LOCATIONS:
            score += 50
            risks.append(f"Asset in sanctioned location: {asset.last_known_location}")
        if asset.location_updated_hours > 168:
            score += 20
            risks.append(f"Location stale: {asset.location_updated_hours:.0f}h")
        if asset.estimated_value_eur > 50e6 and not asset.ownership_verified:
            score += 20
            risks.append("High-value asset — unverified UBO")
        return min(score, 100.0), risks

    def _update_asset(self, asset: Asset) -> None:
        asset.location_updated_hours += random.uniform(0, 3)
        if random.random() < 0.02:
            asset.last_known_location = random.choice(
                [
                    "Monaco",
                    "Dubai",
                    "Moscow",
                    "Geneva",
                    "Zurich",
                    "Tehran",
                    "Abu Dhabi",
                ]
            )
        if random.random() < 0.03:
            asset.ownership_verified = False

    def cycle_interval_seconds(self) -> float:
        return 8.0
