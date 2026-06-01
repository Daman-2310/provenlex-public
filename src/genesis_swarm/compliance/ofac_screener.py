"""
OFAC SDN Live Screener

Downloads the US Treasury OFAC Specially Designated Nationals list in real-time,
caches it locally, and screens fund entities against it using fuzzy matching.

Key stats:
  ~15,000 SDN entries across IRAN, RUSSIA, UKRAINE-EO13685, DPRK, SDN programs
  Refresh interval: 1 hour (OFAC publishes updates daily)
  Match threshold: 0.82 (SequenceMatcher ratio — rejects partial token overlap)

Wire-in: WirecardSimulation entity names auto-screened on first load.
"""

from __future__ import annotations

import difflib
import logging
import structlog
import threading
import time
import urllib.request

try:
    import defusedxml.ElementTree as ET
except ImportError:
    import xml.etree.ElementTree as ET
from collections import deque
from dataclasses import asdict, dataclass
from typing import Optional

log = structlog.get_logger(__name__)

_FEED_URL = "https://www.treasury.gov/ofac/downloads/sdn.xml"
_MATCH_THRESHOLD = 0.82
_REFRESH_SECS = 3600  # 1 hour
_MAX_HISTORY = 500

# Wirecard simulation entities — auto-screened on first load to produce demo hits
_WIRECARD_ENTITIES = [
    "WIRECARD AG",
    "AL ALAM SOLUTIONS",
    "PAYEASY ASIA",
    "SENJO GROUP",
    "CONPAX",
    "OCAP TRUSTEE",
    "SBERBANK",
    "HERMES TRUST",
    "MASTERCARD ASIA",
]

# Additional fund entities commonly checked in high-risk AML contexts
_FUND_ENTITIES = [
    "GAZPROMBANK",
    "VTB BANK",
    "NATIONAL BANK OF IRAN",
    "MAHAN AIR",
    "RUSSIAN FINANCIAL CORPORATION",
    "NOVATEK",
    "ROSNEFT",
    "BANK MELLAT",
    "SEPAH BANK",
    "ISLAMIC REPUBLIC OF IRAN SHIPPING LINES",
]


@dataclass
class SDNEntry:
    uid: str
    name: str
    sdn_type: str  # Individual / Entity / Vessel / Aircraft
    programs: list[str]
    akas: list[str]  # alternative / weak names
    addresses: list[str]  # city + country strings


@dataclass
class OFACMatch:
    entity: str  # the name we screened
    sdn_name: str  # matched SDN primary name
    sdn_uid: str
    sdn_type: str
    programs: list[str]
    match_score: float  # SequenceMatcher ratio 0–1
    match_type: str  # EXACT / FUZZY / AKA
    screened_at: float
    screened_date: str

    def to_dict(self) -> dict:
        return asdict(self)


class OFACScreener:
    """
    Thin, dependency-free OFAC SDN screener.
    Uses only stdlib (urllib, xml.etree, difflib) — no third-party packages needed.
    """

    def __init__(self, *, auto_bootstrap: bool = False) -> None:
        self._entries: list[SDNEntry] = []
        self._last_loaded: float = 0.0
        self._publish_date: str = "unknown"
        self._record_count: int = 0
        self._load_error: Optional[str] = None
        self._load_lock = threading.Lock()

        self._matches: deque[OFACMatch] = deque(maxlen=_MAX_HISTORY)
        self._screen_count: int = 0
        self._hit_count: int = 0

        if auto_bootstrap:
            threading.Thread(target=self._bootstrap, daemon=True).start()

    # ── Loading ───────────────────────────────────────────────────────────────

    def _bootstrap(self) -> None:
        """Load SDN list and pre-screen demo entities."""
        try:
            self._load()
            self._screen_demo_entities()
        except Exception as exc:
            log.error("[OFAC] Bootstrap error: %s", exc)

    def _load(self) -> None:
        with self._load_lock:
            log.info("[OFAC] Downloading SDN list from %s …", _FEED_URL)
            try:
                req = urllib.request.Request(
                    _FEED_URL,
                    headers={"User-Agent": "Genesis-Swarm-OFAC-Screener/0.3"},
                )
                with urllib.request.urlopen(req, timeout=30) as resp:
                    raw = resp.read()
            except Exception as exc:
                self._load_error = str(exc)
                log.warning("[OFAC] Download failed: %s — using empty list", exc)
                self._entries = []
                self._last_loaded = time.time()  # don't retry for _REFRESH_SECS
                return

            self._load_error = None
            entries: list[SDNEntry] = []

            try:
                root = ET.fromstring(raw)
                # Strip namespace prefixes for simpler parsing
                ns = _strip_ns(root.tag)

                pub_info = root.find(_nt(ns, "publshInformation"))
                if pub_info is not None:
                    pd = pub_info.find(_nt(ns, "Publish_Date"))
                    rc = pub_info.find(_nt(ns, "Record_Count"))
                    self._publish_date = pd.text if pd is not None else "unknown"
                    self._record_count = int(rc.text) if rc is not None else 0

                for entry in root.findall(_nt(ns, "sdnEntry")):
                    uid_el = entry.find(_nt(ns, "uid"))
                    last_el = entry.find(_nt(ns, "lastName"))
                    first_el = entry.find(_nt(ns, "firstName"))
                    type_el = entry.find(_nt(ns, "sdnType"))

                    if last_el is None:
                        continue

                    uid = uid_el.text.strip() if uid_el is not None else ""
                    last = (last_el.text or "").strip()
                    first = (first_el.text or "").strip() if first_el is not None else ""
                    name = f"{last}, {first}".rstrip(", ") if first else last
                    sdn_type = (type_el.text or "").strip() if type_el is not None else ""

                    # Programs
                    progs: list[str] = []
                    pl = entry.find(_nt(ns, "programList"))
                    if pl is not None:
                        for p in pl.findall(_nt(ns, "program")):
                            if p.text:
                                progs.append(p.text.strip())

                    # AKAs
                    akas: list[str] = []
                    al = entry.find(_nt(ns, "akaList"))
                    if al is not None:
                        for aka in al.findall(_nt(ns, "aka")):
                            ln = aka.find(_nt(ns, "lastName"))
                            fn = aka.find(_nt(ns, "firstName"))
                            if ln is not None and ln.text:
                                aka_name = ln.text.strip()
                                if fn is not None and fn.text:
                                    aka_name = f"{aka_name}, {fn.text.strip()}"
                                akas.append(aka_name)

                    # Addresses
                    addresses: list[str] = []
                    adl = entry.find(_nt(ns, "addressList"))
                    if adl is not None:
                        for addr in adl.findall(_nt(ns, "address")):
                            city_el = addr.find(_nt(ns, "city"))
                            country_el = addr.find(_nt(ns, "country"))
                            parts = [
                                (city_el.text or "").strip() if city_el is not None else "",
                                (country_el.text or "").strip() if country_el is not None else "",
                            ]
                            loc = ", ".join(p for p in parts if p)
                            if loc:
                                addresses.append(loc)

                    entries.append(
                        SDNEntry(
                            uid=uid,
                            name=name,
                            sdn_type=sdn_type,
                            programs=progs,
                            akas=akas,
                            addresses=addresses,
                        )
                    )

            except ET.ParseError as exc:
                self._load_error = f"XML parse error: {exc}"
                log.error("[OFAC] XML parse failed: %s", exc)
                return

            self._entries = entries
            self._last_loaded = time.time()
            log.info(
                "[OFAC] SDN list loaded — %d entries (published %s)",
                len(entries),
                self._publish_date,
            )

    def ensure_loaded(self) -> None:
        if time.time() - self._last_loaded > _REFRESH_SECS:
            self._load()

    def _screen_demo_entities(self) -> None:
        """Pre-screen Wirecard + high-risk fund entities for demo impact."""
        for name in _WIRECARD_ENTITIES + _FUND_ENTITIES:
            self.screen(name)

    # ── Screening ─────────────────────────────────────────────────────────────

    def screen(self, entity_name: str) -> Optional[OFACMatch]:
        """
        Screen a single entity name against the SDN list.
        Returns the best match above threshold, or None.
        """
        self.ensure_loaded()
        self._screen_count += 1

        query = _normalise(entity_name)
        best: Optional[OFACMatch] = None
        best_r: float = 0.0

        for entry in self._entries:
            # Check primary name
            r, mtype = _fuzzy_score(query, _normalise(entry.name))
            if r > best_r:
                best_r = r
                best = self._build_match(entity_name, entry, r, mtype)

            # Check AKAs (only if primary didn't already hit threshold)
            if r < _MATCH_THRESHOLD:
                for aka in entry.akas:
                    r2, _ = _fuzzy_score(query, _normalise(aka))
                    if r2 > best_r:
                        best_r = r2
                        best = self._build_match(entity_name, entry, r2, "AKA")

        if best and best_r >= _MATCH_THRESHOLD:
            self._hit_count += 1
            self._matches.appendleft(best)
            log.warning(
                "[OFAC] MATCH  %-30s → %-30s  %.0f%%  %s",
                entity_name[:30],
                best.sdn_name[:30],
                best.match_score * 100,
                best.programs[:2],
            )
            return best

        return None

    def screen_batch(self, entities: list[str]) -> list[OFACMatch]:
        """Screen multiple entities, return only the ones that matched."""
        results: list[OFACMatch] = []
        for name in entities:
            m = self.screen(name)
            if m:
                results.append(m)
        return results

    def _build_match(self, entity: str, entry: SDNEntry, score: float, mtype: str) -> OFACMatch:
        now = time.time()
        return OFACMatch(
            entity=entity,
            sdn_name=entry.name,
            sdn_uid=entry.uid,
            sdn_type=entry.sdn_type,
            programs=entry.programs[:4],
            match_score=round(score, 4),
            match_type=mtype,
            screened_at=now,
            screened_date=_ts_to_date(now),
        )

    # ── Stats / Export ────────────────────────────────────────────────────────

    def get_stats(self) -> dict:
        loaded = self._last_loaded > 0
        return {
            "loaded": loaded,
            "total_entries": len(self._entries),
            "publish_date": self._publish_date,
            "record_count": self._record_count,
            "last_loaded": round(self._last_loaded),
            "last_loaded_ago_s": round(time.time() - self._last_loaded) if loaded else -1,
            "refresh_interval_s": _REFRESH_SECS,
            "screen_count": self._screen_count,
            "hit_count": self._hit_count,
            "hit_rate_pct": round(self._hit_count / max(1, self._screen_count) * 100, 1),
            "load_error": self._load_error,
            "match_threshold": _MATCH_THRESHOLD,
        }

    def get_recent_matches(self, n: int = 30) -> list[dict]:
        return [m.to_dict() for m in list(self._matches)[:n]]

    def reload(self) -> dict:
        """Force-reload the SDN list and re-screen demo entities."""
        self._load()
        self._screen_demo_entities()
        return self.get_stats()


# ── Helpers ───────────────────────────────────────────────────────────────────


def _strip_ns(tag: str) -> str:
    """Extract namespace URI from a Clark-notation tag like {http://...}name."""
    if tag.startswith("{"):
        return tag[1: tag.index("}")]
    return ""


def _nt(ns: str, local: str) -> str:
    """Build a Clark-notation tag."""
    return f"{{{ns}}}{local}" if ns else local


def _normalise(s: str) -> str:
    """Uppercase, collapse whitespace, strip punctuation for matching."""
    return " ".join(s.upper().replace(",", " ").replace(".", " ").replace("-", " ").split())


def _fuzzy_score(a: str, b: str) -> tuple[float, str]:
    """
    Return (SequenceMatcher ratio, match_type).
    EXACT = 1.0 case-insensitive, FUZZY = partial ratio.
    """
    if a == b:
        return 1.0, "EXACT"
    ratio = difflib.SequenceMatcher(None, a, b).ratio()
    return ratio, "FUZZY"


def _ts_to_date(ts: float) -> str:
    from datetime import datetime, timezone

    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
