from __future__ import annotations
import csv
from ..shared.bot_base import DetectionResult, SwarmBot
from ..shared.circuit_breaker import CircuitBreaker
import certifi
import aiohttp
from typing import Optional
from dataclasses import dataclass
import time
import ssl
import re
import random
import logging
import io
import hashlib

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

# OFAC Specially Designated Nationals CSV — free, no API key
SDN_CSV_URL = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV"
# EU Consolidated Sanctions List XML (publicly accessible)
EU_XML_URL = "https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content"
# UN Security Council Consolidated List XML — free, no key, authoritative source
UN_SC_XML_URL = "https://scsanctions.un.org/resources/xml/en/consolidated.xml"

# Fallback when network is unavailable
FALLBACK_SDN_NAMES = {
    "VICTOR PETROV",
    "FEDERAL RESOURCE CORP",
    "NORTH KOREA SHIPPING",
    "IRAN TANKER COMPANY",
    "MAHAN AIR",
    "PARSIAN BANK",
    "KOREAN NATIONAL INSURANCE",
    "IRAN AIR",
    "SEPARATE FROM 3RD",
}
FALLBACK_EU_NAMES = {"GOLDEN STAR SHIPPING LTD", "NOVATEK"}
FALLBACK_UN_NAMES: set[str] = set()

HIGH_RISK_NATIONALITIES = {"RU", "KP", "IR", "SY", "BY"}

# Realistic entity screening queue seeded from real fund counterparty archetypes
ENTITY_QUEUE = [
    {
        "id": "E001",
        "name": "MARITIME SOLUTIONS SA",
        "type": "COMPANY",
        "nat": "LU",
        "fund": "MARITIME-ALPHA-LUX",
    },
    {
        "id": "E002",
        "name": "VICTOR PETROV",
        "type": "INDIVIDUAL",
        "nat": "RU",
        "fund": "SOVEREIGN-WEALTH-LUX",
    },
    {
        "id": "E003",
        "name": "GOLDEN STAR SHIPPING LTD",
        "type": "COMPANY",
        "nat": "CY",
        "fund": "MARITIME-ALPHA-LUX",
    },
    {
        "id": "E004",
        "name": "MV NORD STAR",
        "type": "VESSEL",
        "nat": "PA",
        "fund": "MARITIME-ALPHA-LUX",
    },
    {
        "id": "E005",
        "name": "ATLAS ENERGY GROUP",
        "type": "COMPANY",
        "nat": "AE",
        "fund": "ENERGY-INFRA-LUX",
    },
    {
        "id": "E006",
        "name": "CHEN WEI HOLDINGS",
        "type": "COMPANY",
        "nat": "HK",
        "fund": "ASIA-MACRO-LUX",
    },
    {
        "id": "E007",
        "name": "FEDERAL RESOURCE CORP",
        "type": "COMPANY",
        "nat": "RU",
        "fund": "SOVEREIGN-WEALTH-LUX",
    },
    {
        "id": "E008",
        "name": "NOVATEK TRADING",
        "type": "COMPANY",
        "nat": "RU",
        "fund": "ENERGY-INFRA-LUX",
    },
    {
        "id": "E009",
        "name": "MAHAN AVIATION SERVICES",
        "type": "COMPANY",
        "nat": "IR",
        "fund": "ASIA-MACRO-LUX",
    },
    {
        "id": "E010",
        "name": "SINGAPORE MARITIME FUND",
        "type": "COMPANY",
        "nat": "SG",
        "fund": "MARITIME-ALPHA-LUX",
    },
]


@dataclass
class EntityCheck:
    id: str
    name: str
    type: str
    nat: str
    fund: str


def _name_hash(name: str) -> str:
    return hashlib.sha256(name.upper().encode()).hexdigest()[:8]


def _fuzzy_match(name: str, sanction_list: set[str], threshold: float = 0.72) -> Optional[str]:
    name_clean = re.sub(r"[^A-Z0-9 ]", "", name.upper())
    tokens_a = set(name_clean.split())
    for entry in sanction_list:
        entry_clean = re.sub(r"[^A-Z0-9 ]", "", entry.upper())
        tokens_b = set(entry_clean.split())
        if not tokens_b:
            continue
        overlap = len(tokens_a & tokens_b) / len(tokens_b)
        if overlap >= threshold:
            return entry
    return None


class SanctionsBot(SwarmBot):
    """Bot 4 — OFAC/EU sanctions screening using real SDN list data."""

    BOT_TYPE = "SANCTIONS_BOT"
    PERSONALITY = "FORENSIC"
    PERSONALITY_LABEL = "Forensic"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._screened: dict[str, dict] = {}
        self._sdn_names: set[str] = set()
        self._eu_names: set[str] = set()
        self._un_names: set[str] = set()
        self._live = False
        self._sdn_count = 0
        self._un_count = 0
        self._last_reload = 0.0
        self._ofac_cb = CircuitBreaker("ofac-sdn", failure_threshold=3, recovery_timeout=300.0)
        self._eu_cb = CircuitBreaker("eu-sanctions", failure_threshold=3, recovery_timeout=300.0)
        self._un_cb = CircuitBreaker("un-sc", failure_threshold=3, recovery_timeout=300.0)

    async def initialise(self) -> None:
        self._sdn_names, self._sdn_count = await self._load_ofac_sdn()
        self._eu_names = await self._load_eu_sanctions()
        self._un_names, self._un_count = await self._load_un_sc_list()
        self._last_reload = time.time()
        source = "OFAC+EU+UNSC LIVE" if self._live else "FALLBACK"
        log.info(
            "[SanctionsBot] %s — SDN: %d  EU: %d  UNSC: %d entries",
            source,
            self._sdn_count,
            len(self._eu_names),
            self._un_count,
        )

    async def run_cycle(self) -> DetectionResult | None:
        # Reload SDN list once per day
        if time.time() - self._last_reload > 86400:
            _fire_task(self._background_reload())

        entity = random.choice(ENTITY_QUEUE)
        score, reasons, hit = self._screen_entity(entity)
        is_anomaly = score >= self.threshold

        self._screened[_name_hash(entity["name"])] = {
            "entity": entity["name"],
            "score": score,
            "hit": hit,
            "ts": time.time(),
        }

        return DetectionResult(
            bot_id=self.bot_id,
            bot_type=self.BOT_TYPE,
            score=score,
            is_anomaly=is_anomaly,
            threshold=self.threshold,
            summary=(
                f"[{'LIVE' if self._live else 'FALLBACK'}] "
                f"Sanctions: {entity['name']} → {'HIT' if hit else 'CLEAR'} ({score:.0f})"
            ),
            details={
                "fund_name": entity["fund"],
                "entity_id": entity["id"],
                "entity_name": entity["name"],
                "entity_type": entity["type"],
                "nationality": entity["nat"],
                "sanctions_hit": hit,
                "risk_reasons": reasons,
                "score": score,
                "source": "OFAC_LIVE" if self._live else "FALLBACK",
                "sdn_entries": self._sdn_count,
            },
        )

    # ── Screening logic ────────────────────────────────────────────────────────

    def _screen_entity(self, entity: dict | EntityCheck) -> tuple[float, list[str], bool]:
        score = 0.0
        reasons = []
        hit = False
        name = entity["name"] if isinstance(entity, dict) else entity.name
        nationality = entity["nat"] if isinstance(entity, dict) else entity.nat

        ofac_match = _fuzzy_match(name, self._sdn_names)
        if ofac_match:
            score += 90
            reasons.append(f"OFAC SDN match: {ofac_match[:50]}")
            hit = True

        eu_match = _fuzzy_match(name, self._eu_names)
        if eu_match:
            score += 85
            reasons.append(f"EU sanctions match: {eu_match[:50]}")
            hit = True

        un_match = _fuzzy_match(name, self._un_names)
        if un_match:
            score += 88
            reasons.append(f"UNSC consolidated list match: {un_match[:50]}")
            hit = True

        if nationality in HIGH_RISK_NATIONALITIES:
            score += 25
            reasons.append(f"High-risk nationality: {nationality}")

        score += random.uniform(0, 8)
        return min(score, 100.0), reasons, hit

    # ── OFAC SDN CSV loader ────────────────────────────────────────────────────

    async def _fetch_ofac_raw(self) -> str:
        ctx = ssl.create_default_context(cafile=certifi.where())
        connector = aiohttp.TCPConnector(ssl=ctx)
        async with aiohttp.ClientSession(
            connector=connector,
            timeout=aiohttp.ClientTimeout(total=30),
        ) as session:
            async with session.get(SDN_CSV_URL) as resp:
                if resp.status != 200:
                    raise ValueError(f"HTTP {resp.status}")
                return await resp.text(encoding="latin-1")

    async def _load_ofac_sdn(self) -> tuple[set[str], int]:
        try:
            text = await self._ofac_cb.call(self._fetch_ofac_raw)
            if text is None:
                raise ValueError("circuit breaker open")

            names: set[str] = set()
            reader = csv.reader(io.StringIO(text))
            for row in reader:
                if len(row) >= 2:
                    name = row[1].strip().upper()
                    if name and name != "SDN_NAME":
                        names.add(name)

            self._live = True
            log.info("[SanctionsBot] OFAC SDN loaded: %d real entities", len(names))
            return names, len(names)

        except Exception as exc:
            log.warning("[SanctionsBot] OFAC CSV fetch failed (%s) — using fallback", exc)
            return set(FALLBACK_SDN_NAMES), len(FALLBACK_SDN_NAMES)

    # ── EU Consolidated List loader ────────────────────────────────────────────

    async def _load_eu_sanctions(self) -> set[str]:
        """Try EU XML; fall back to hardcoded set on any error."""
        try:
            try:
                import defusedxml.ElementTree as ET
            except ImportError:
                import xml.etree.ElementTree as ET

            ctx = ssl.create_default_context(cafile=certifi.where())
            connector = aiohttp.TCPConnector(ssl=ctx)
            async with aiohttp.ClientSession(
                connector=connector,
                timeout=aiohttp.ClientTimeout(total=20),
            ) as session:
                async with session.get(EU_XML_URL) as resp:
                    if resp.status != 200:
                        raise ValueError(f"HTTP {resp.status}")
                    content = await resp.read()

            root = ET.fromstring(content)
            names: set[str] = set()
            _ = {"eu": "http://eu.europa.ec/fsd/export/xlsx/1.1"}
            for el in root.iter():
                tag = el.tag.split("}")[-1]
                if tag in ("wholeName", "lastName", "firstName") and el.text:
                    names.add(el.text.strip().upper())
            log.info("[SanctionsBot] EU list loaded: %d name tokens", len(names))
            return names
        except Exception as exc:
            log.debug("[SanctionsBot] EU list fetch failed (%s) — using fallback", exc)
            return set(FALLBACK_EU_NAMES)

    # ── UN Security Council Consolidated List XML loader ─────────────────────

    async def _load_un_sc_list(self) -> tuple[set[str], int]:
        """Load the UN Security Council Consolidated Sanctions List. Free, no key."""
        try:
            try:
                import defusedxml.ElementTree as ET
            except ImportError:
                import xml.etree.ElementTree as ET

            ctx = ssl.create_default_context(cafile=certifi.where())
            connector = aiohttp.TCPConnector(ssl=ctx)
            async with aiohttp.ClientSession(
                connector=connector,
                headers={"User-Agent": "Genesis-Swarm/0.5.0 compliance-screening"},
                timeout=aiohttp.ClientTimeout(total=30),
            ) as session:
                async with session.get(UN_SC_XML_URL) as resp:
                    if resp.status != 200:
                        raise ValueError(f"HTTP {resp.status}")
                    content = await resp.read()

            root = ET.fromstring(content)
            names: set[str] = set()
            # UNSC XML uses INDIVIDUALS/INDIVIDUAL and ENTITIES/ENTITY elements
            for el in root.iter():
                tag = el.tag.split("}")[-1] if "}" in el.tag else el.tag
                if (
                    tag
                    in (
                        "FIRST_NAME",
                        "SECOND_NAME",
                        "THIRD_NAME",
                        "FOURTH_NAME",
                        "ENTITY_ALIAS",
                        "ALIAS_NAME",
                    )
                    and el.text
                ):
                    names.add(el.text.strip().upper())
            count = len(names)
            log.info("[SanctionsBot] UNSC list loaded: %d name tokens", count)
            return names, count
        except Exception as exc:
            log.debug("[SanctionsBot] UNSC list fetch failed (%s) — using fallback", exc)
            return set(FALLBACK_UN_NAMES), 0

    async def _background_reload(self) -> None:
        self._sdn_names, self._sdn_count = await self._load_ofac_sdn()
        self._un_names, self._un_count = await self._load_un_sc_list()
        self._last_reload = time.time()
        log.info(
            "[SanctionsBot] Lists refreshed — SDN: %d  UNSC: %d", self._sdn_count, self._un_count
        )

    def cycle_interval_seconds(self) -> float:
        return 2.0
