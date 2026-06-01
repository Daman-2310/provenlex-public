from __future__ import annotations
import logging
from ..shared.bot_base import DetectionResult, SwarmBot
import certifi
import aiohttp
from dataclasses import dataclass, field
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

# OpenCorporates API — world's largest open company database, free without key
# Covers LU (Luxembourg), KY (Cayman), PA (Panama), CH (Switzerland), etc.
OC_SEARCH_URL = "https://api.opencorporates.com/v0.4/companies/search"

# Map our jurisdiction codes to OpenCorporates jurisdiction_code
_OC_JURISDICTION: dict[str, str] = {
    "LU": "lu",
    "CH": "ch",
    "KY": "ky",
    "PA": "pa",
    "FR": "fr",
    "DE": "de",
    "GB": "gb",
    "RU": "ru",
}


@dataclass
class OwnershipNode:
    entity_id: str
    name: str
    entity_type: str  # INDIVIDUAL | COMPANY | TRUST | FOUNDATION
    jurisdiction: str
    ownership_pct: float
    ubo_disclosed: bool
    pep_status: bool
    last_verified_days: int
    oc_verified: bool = False
    oc_status: str = "UNKNOWN"  # Active | Dissolved | NOT_FOUND | UNKNOWN
    oc_company_number: str = ""
    children: list["OwnershipNode"] = field(default_factory=list)


def _build_base_structure() -> OwnershipNode:
    root = OwnershipNode("F001", "MARITIME-ALPHA-LUX FUND", "COMPANY", "LU", 100.0, True, False, 10)
    root.children = [
        OwnershipNode(
            "H001",
            "ATLAS HOLDING SA",
            "COMPANY",
            "LU",
            45.0,
            True,
            False,
            15,
            children=[
                OwnershipNode("I001", "PIERRE DUMONT", "INDIVIDUAL", "FR", 100.0, True, False, 20),
            ],
        ),
        OwnershipNode(
            "H002",
            "NORDIC TRUST FOUNDATION",
            "FOUNDATION",
            "CH",
            30.0,
            False,
            False,
            90,
            children=[
                OwnershipNode(
                    "I002", "TRUST BENEFICIARY A", "INDIVIDUAL", "AE", 50.0, False, True, 180
                ),
                OwnershipNode(
                    "I003", "TRUST BENEFICIARY B", "INDIVIDUAL", "RU", 50.0, False, True, 180
                ),
            ],
        ),
        OwnershipNode("H003", "CAYMAN VEHICLE LTD", "COMPANY", "KY", 25.0, False, False, 365),
    ]
    return root


class SuccessionBot(SwarmBot):
    """Bot 7 — UBO/ownership structure analyser with OpenCorporates real-time verification."""

    BOT_TYPE = "SUCCESSION_BOT"
    PERSONALITY = "FORENSIC"
    PERSONALITY_LABEL = "Forensic"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._structures: list[OwnershipNode] = []
        self._live = False
        self._verifications = 0
        self._verification_cache: dict[str, dict] = {}
        self._verify_queue: list[OwnershipNode] = []

    async def initialise(self) -> None:
        self._structures = [_build_base_structure()]
        self._collect_companies(self._structures[0], self._verify_queue)
        await self._verify_batch(self._verify_queue[:3])
        source = "OpenCorporates LIVE" if self._live else "BASELINE"
        log.info(
            "[SuccessionBot] %s — %d company nodes, %d verified",
            source,
            len(self._verify_queue),
            self._verifications,
        )

    async def run_cycle(self) -> DetectionResult | None:
        structure = random.choice(self._structures)
        self._simulate_changes(structure)

        unverified = [n for n in self._verify_queue if not n.oc_verified]
        if unverified:
            _fire_task(self._verify_batch([random.choice(unverified)]))

        score, risks = self._analyse_structure(structure)

        all_nodes: list[OwnershipNode] = []
        self._walk(structure, all_nodes)
        live_verified = sum(1 for n in all_nodes if n.oc_verified)
        dissolved = [n for n in all_nodes if n.oc_status == "Dissolved"]
        not_found = [n for n in all_nodes if n.oc_status == "NOT_FOUND"]

        for node in dissolved:
            score = min(score + 40, 100.0)
            risks.append(f"DISSOLVED entity: {node.name} ({node.jurisdiction})")
        for node in not_found:
            score = min(score + 25, 100.0)
            risks.append(f"Registry gap — not found: {node.name} ({node.jurisdiction})")

        is_anomaly = score >= self.threshold
        source_tag = "OC LIVE" if self._live else "BASELINE"

        return DetectionResult(
            bot_id=self.bot_id,
            bot_type=self.BOT_TYPE,
            score=score,
            is_anomaly=is_anomaly,
            threshold=self.threshold,
            summary=(
                f"[{source_tag}] UBO risk {score:.1f}/100 — "
                f"{live_verified}/{len(all_nodes)} nodes verified"
            ),
            details={
                "fund_name": structure.name,
                "entity_id": structure.entity_id,
                "risk_factors": risks,
                "ubo_gap": not structure.ubo_disclosed,
                "score": round(score, 1),
                "oc_verified": live_verified,
                "total_nodes": len(all_nodes),
                "dissolved_found": len(dissolved),
                "not_found": len(not_found),
                "source": source_tag,
            },
        )

    # ── OpenCorporates verification ────────────────────────────────────────────

    async def _verify_batch(self, nodes: list[OwnershipNode]) -> None:
        ctx = ssl.create_default_context(cafile=certifi.where())
        connector = aiohttp.TCPConnector(ssl=ctx)
        async with aiohttp.ClientSession(
            connector=connector,
            timeout=aiohttp.ClientTimeout(total=10),
        ) as session:
            for node in nodes:
                if node.entity_type == "INDIVIDUAL":
                    continue
                await self._verify_node(session, node)
                await asyncio.sleep(0.5)  # gentle rate limiting

    async def _verify_node(self, session: aiohttp.ClientSession, node: OwnershipNode) -> None:
        cache_key = f"{node.name}:{node.jurisdiction}"
        if cache_key in self._verification_cache:
            cached = self._verification_cache[cache_key]
            node.oc_verified = True
            node.oc_status = cached.get("status", "UNKNOWN")
            node.oc_company_number = cached.get("company_number", "")
            return

        jur = _OC_JURISDICTION.get(node.jurisdiction)
        if not jur:
            return

        try:
            params = {"q": node.name, "jurisdiction_code": jur, "inactive": "false", "per_page": 3}
            async with session.get(OC_SEARCH_URL, params=params) as resp:
                if resp.status == 429:
                    log.debug("[SuccessionBot] OpenCorporates rate limited")
                    return
                if resp.status != 200:
                    return
                data = await resp.json(content_type=None)

            companies = data.get("results", {}).get("companies", [])
            if not companies:
                self._cache_and_update(node, cache_key, "NOT_FOUND", "")
                log.info(
                    "[SuccessionBot] %s (%s): NOT FOUND in registry", node.name, node.jurisdiction
                )
                return

            company = companies[0].get("company", {})
            status = company.get("current_status") or "Active"
            company_number = company.get("company_number", "")
            matched_name = company.get("name", "")
            self._cache_and_update(node, cache_key, status, company_number)
            log.info(
                "[SuccessionBot] %s (%s): status=%s reg=%s match='%s'",
                node.name,
                node.jurisdiction,
                status,
                company_number,
                matched_name[:40],
            )

        except Exception as exc:
            log.debug("[SuccessionBot] OC verify error for %s: %s", node.name, exc)

    def _cache_and_update(self, node: OwnershipNode, key: str, status: str, number: str) -> None:
        self._verification_cache[key] = {"status": status, "company_number": number}
        node.oc_verified = True
        node.oc_status = status
        node.oc_company_number = number
        self._live = True
        self._verifications += 1

    # ── Structure analysis ─────────────────────────────────────────────────────

    def _analyse_structure(self, node: OwnershipNode) -> tuple[float, list[str]]:
        score = 0.0
        risks: list[str] = []

        def _walk_score(n: OwnershipNode, d: int) -> None:
            nonlocal score
            if not n.ubo_disclosed:
                score += 25
                risks.append(f"UBO not disclosed: {n.name} ({n.jurisdiction})")
            if n.pep_status:
                score += 30
                risks.append(f"PEP identified: {n.name}")
            if n.jurisdiction in {"KY", "VG", "BZ", "PA"}:
                score += 20
                risks.append(f"Offshore: {n.jurisdiction} — {n.name}")
            if n.last_verified_days > 180:
                score += 15
                risks.append(f"Stale KYC ({n.last_verified_days}d): {n.name}")
            if d > 4:
                score += 20
                risks.append(f"Chain depth {d} — obfuscation risk")
            for child in n.children:
                _walk_score(child, d + 1)

        _walk_score(node, 0)
        return min(score, 100.0), risks

    def _walk(self, node: OwnershipNode, out: list[OwnershipNode]) -> None:
        out.append(node)
        for child in node.children:
            self._walk(child, out)

    def _collect_companies(self, node: OwnershipNode, out: list[OwnershipNode]) -> None:
        if node.entity_type in ("COMPANY", "TRUST", "FOUNDATION"):
            out.append(node)
        for child in node.children:
            self._collect_companies(child, out)

    def _simulate_changes(self, node: OwnershipNode) -> None:
        if random.random() < 0.05:
            node.ubo_disclosed = False
        if random.random() < 0.02:
            node.pep_status = True
        node.last_verified_days += random.choice([0, 0, 1])
        for child in node.children:
            self._simulate_changes(child)

    def cycle_interval_seconds(self) -> float:
        return 6.0
