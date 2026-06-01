"""
RegulatoryParser — Semantic Weighting Law-Bot

Reads regulatory text (DORA, AMLR, CSSF circulars, MiCA) and adjusts
agent sensitivity scores in real time. When a new regulation lands,
this module extracts keyword → agent taxonomy mappings and raises or
lowers detection thresholds accordingly.

Design:
  KEYWORD_TAXONOMY  — maps regulatory terms to the bots they trigger
  SEVERITY_WEIGHTS  — maps regulatory severity markers to score deltas
  parse_text()      — extracts rules from raw regulatory text
  apply_weights()   — returns per-bot sensitivity adjustment [-1.0, +1.0]
  get_active_rules() — returns currently loaded regulatory rules
"""

from __future__ import annotations

import re
import time
from dataclasses import asdict, dataclass, field

# ── Keyword → Bot taxonomy ────────────────────────────────────────────────────
# Maps regulatory keyword patterns to the bots that should be sensitised.

KEYWORD_TAXONOMY: dict[str, list[str]] = {
    # AML / CFT
    "money laundering": ["SANCTIONS_BOT", "COMPLIANCE_BOT", "ADVERSARIAL_TESTER"],
    "terrorist financing": ["SANCTIONS_BOT", "SOVEREIGN_BOT"],
    "proliferation financing": ["SANCTIONS_BOT", "SATELLITE_ANALYTICS"],
    "structuring": ["NAV_DETECTOR", "COMPLIANCE_BOT", "COMMODITY_MONITOR"],
    "smurfing": ["NAV_DETECTOR", "COMPLIANCE_BOT"],
    "layering": ["ADVERSARIAL_TESTER", "COMPLIANCE_BOT", "SATELLITE_ANALYTICS"],
    "placement": ["COMPLIANCE_BOT", "CARGO_BOT"],
    "round.?trip": ["ADVERSARIAL_TESTER", "COMPLIANCE_BOT"],
    "beneficial owner": ["COMPLIANCE_BOT", "SOVEREIGN_BOT", "SUCCESSION_BOT"],
    "ultimate beneficial": ["SUCCESSION_BOT", "SOVEREIGN_BOT"],
    "shell compan": ["SOVEREIGN_BOT", "SATELLITE_ANALYTICS", "ADVERSARIAL_TESTER"],
    "nominee": ["SOVEREIGN_BOT", "SUCCESSION_BOT"],
    "straw man": ["SOVEREIGN_BOT", "SUCCESSION_BOT"],
    # Sanctions
    "sanction": ["SANCTIONS_BOT"],
    "embargo": ["SANCTIONS_BOT", "SOVEREIGN_BOT"],
    "ofac": ["SANCTIONS_BOT"],
    "eu asset freeze": ["SANCTIONS_BOT", "COMPLIANCE_BOT"],
    "designated person": ["SANCTIONS_BOT"],
    "politically exposed": ["SANCTIONS_BOT", "COMPLIANCE_BOT"],
    # Fund-specific (CSSF / AIFMD / UCITS)
    "nav manipulation": ["NAV_DETECTOR"],
    "side.?pocket": ["NAV_DETECTOR", "CARGO_BOT"],
    "redemption gate": ["NAV_DETECTOR", "COMMODITY_MONITOR"],
    "swing pricing": ["NAV_DETECTOR", "FX_BOT"],
    "late trading": ["NAV_DETECTOR"],
    "market timing": ["NAV_DETECTOR", "FX_BOT"],
    "front.?running": ["FX_BOT", "NAV_DETECTOR"],
    "insider": ["FX_BOT", "COMPLIANCE_BOT"],
    "material non.?public": ["FX_BOT", "COMPLIANCE_BOT"],
    # DORA / Cyber / Operational
    "operational resilience": ["SATELLITE_ANALYTICS", "SOVEREIGN_BOT"],
    "critical ict": ["SATELLITE_ANALYTICS"],
    "incident report": ["SATELLITE_ANALYTICS", "COMPLIANCE_BOT"],
    "third.?party risk": ["SATELLITE_ANALYTICS", "CARGO_BOT"],
    "concentration risk": ["SATELLITE_ANALYTICS", "CARGO_BOT"],
    # Luxury / Maritime / Alternative assets
    "yacht": ["ASSET_TRACKER"],
    "vessel": ["ASSET_TRACKER", "CARGO_BOT"],
    "aircraft": ["ASSET_TRACKER"],
    "art": ["ASSET_TRACKER", "SUCCESSION_BOT"],
    "crypto": ["ADVERSARIAL_TESTER", "COMPLIANCE_BOT"],
    "virtual asset": ["ADVERSARIAL_TESTER", "COMPLIANCE_BOT"],
    "nft": ["ADVERSARIAL_TESTER"],
    "real estate": ["CARGO_BOT", "SUCCESSION_BOT"],
    "trade finance": ["CARGO_BOT", "COMMODITY_MONITOR"],
    # FX / Treasury
    "fx swap": ["FX_BOT"],
    "currency manipulation": ["FX_BOT", "SOVEREIGN_BOT"],
    "hawala": ["FX_BOT", "SANCTIONS_BOT"],
    "correspondent bank": ["FX_BOT", "COMPLIANCE_BOT"],
    # Succession / Trust
    "trust": ["SUCCESSION_BOT", "SOVEREIGN_BOT"],
    "estate": ["SUCCESSION_BOT"],
    "inheritance": ["SUCCESSION_BOT"],
    "foundation": ["SUCCESSION_BOT", "SOVEREIGN_BOT"],
}

# ── Severity markers → score delta ───────────────────────────────────────────
# Positive delta = increase agent sensitivity (lower threshold = flag more)
# Negative delta = relax sensitivity

SEVERITY_WEIGHTS: dict[str, float] = {
    # Strong mandates
    "immediately": +0.30,
    "mandatory": +0.25,
    "must": +0.20,
    "shall": +0.18,
    "prohibited": +0.22,
    "zero tolerance": +0.35,
    "automatic": +0.15,
    "unconditional": +0.20,
    # Moderate mandates
    "should": +0.10,
    "recommended": +0.08,
    "enhanced": +0.12,
    "increased": +0.10,
    "heightened": +0.12,
    "stricter": +0.14,
    # Relaxation language
    "may": -0.05,
    "proportionate": -0.08,
    "risk-based": -0.06,
    "simplified": -0.12,
    "de minimis": -0.15,
    "exempt": -0.18,
    "waiver": -0.20,
}

# ── Data models ───────────────────────────────────────────────────────────────


@dataclass
class RegulatoryRule:
    rule_id: str
    source: str  # e.g. "DORA Art.52", "CSSF 22/811"
    raw_excerpt: str  # the original text fragment
    affected_bots: list[str]
    delta: float  # net sensitivity adjustment for affected bots
    keywords_found: list[str]
    severity_terms: list[str]
    ts: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class SensitivityMap:
    """Per-bot sensitivity deltas aggregated across all active rules."""

    adjustments: dict[str, float]  # bot_type → cumulative delta
    active_rules: int
    last_updated: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "adjustments": self.adjustments,
            "active_rules": self.active_rules,
            "last_updated": self.last_updated,
        }


# ── Parser ────────────────────────────────────────────────────────────────────


class RegulatoryParser:
    """
    Semantic weighting engine for regulatory text.

    Usage:
        parser = RegulatoryParser()
        parser.ingest("CSSF 22/811", text)
        sensitivity = parser.get_sensitivity_map()
        # sensitivity.adjustments["SANCTIONS_BOT"] → +0.42 (raise alert threshold)
    """

    # Pre-loaded Luxembourg / EU baseline regulations
    _BASELINE_RULES = [
        (
            "AMLR 2024",
            "AML/CFT obligations shall apply immediately to all fund structures. "
            "Structuring, layering, and placement must be automatically flagged. "
            "Beneficial owner verification is mandatory for any transaction above €10,000.",
        ),
        (
            "CSSF 22/811",
            "Enhanced due diligence is required for politically exposed persons. "
            "Sanctions screening must be applied unconditionally. "
            "Real estate and yacht transactions require heightened scrutiny.",
        ),
        (
            "DORA Art.52",
            "Critical ICT third-party risk concentration must trigger mandatory "
            "incident reporting. Operational resilience testing shall be increased "
            "for all systemically relevant entities.",
        ),
        (
            "MiCA 2024",
            "Virtual asset and crypto transfers should be monitored with enhanced "
            "controls. NFT transactions may apply simplified procedures for amounts "
            "below €1,000.",
        ),
        (
            "UCITS V",
            "NAV manipulation, late trading, and market timing are prohibited. "
            "Swing pricing must be applied immediately when redemption gates activate.",
        ),
    ]

    def __init__(self) -> None:
        self._rules: list[RegulatoryRule] = []
        self._rule_counter = 0
        # Load baseline on init
        for source, text in self._BASELINE_RULES:
            self.ingest(source, text, is_baseline=True)

    # ── Parsing engine ────────────────────────────────────────────────────────

    def ingest(self, source: str, text: str, is_baseline: bool = False) -> RegulatoryRule:
        """
        Parse a regulatory text fragment and extract a RegulatoryRule.
        Returns the rule and stores it internally.
        """
        text_lower = text.lower()
        self._rule_counter += 1
        rule_id = f"REG-{self._rule_counter:04d}"

        # Find matching keywords
        matched_keywords: list[str] = []
        affected_bots: set[str] = set()
        for pattern, bots in KEYWORD_TAXONOMY.items():
            if re.search(pattern, text_lower):
                matched_keywords.append(pattern)
                affected_bots.update(bots)

        # Find severity terms
        matched_severity: list[str] = []
        for term in SEVERITY_WEIGHTS:
            if re.search(r"\b" + re.escape(term) + r"\b", text_lower):
                matched_severity.append(term)

        # Net delta = sum of severity weights, clamped
        raw_delta = sum(SEVERITY_WEIGHTS[t] for t in matched_severity)
        # Scale by keyword coverage (more keywords = more relevant)
        coverage = min(1.0, len(matched_keywords) / 5)
        net_delta = max(-1.0, min(1.0, raw_delta * (0.5 + 0.5 * coverage)))

        rule = RegulatoryRule(
            rule_id=rule_id,
            source=source,
            raw_excerpt=text[:300],
            affected_bots=sorted(affected_bots),
            delta=round(net_delta, 4),
            keywords_found=matched_keywords,
            severity_terms=matched_severity,
        )
        self._rules.append(rule)
        return rule

    # ── Sensitivity computation ────────────────────────────────────────────────

    def get_sensitivity_map(self) -> SensitivityMap:
        """
        Aggregate all rules into per-bot sensitivity deltas.
        A positive delta means the bot should be MORE aggressive (flag more).
        """
        adjustments: dict[str, float] = {bot: 0.0 for bot in _all_bots()}
        for rule in self._rules:
            for bot in rule.affected_bots:
                adjustments[bot] = round(
                    max(-1.0, min(1.0, adjustments.get(bot, 0.0) + rule.delta)),
                    4,
                )
        return SensitivityMap(
            adjustments=adjustments,
            active_rules=len(self._rules),
        )

    def get_active_rules(self, limit: int = 20) -> list[dict]:
        return [r.to_dict() for r in self._rules[-limit:]]

    def get_stats(self) -> dict:
        sm = self.get_sensitivity_map()
        most_sensitive = max(sm.adjustments, key=sm.adjustments.get, default="N/A")
        return {
            "total_rules": len(self._rules),
            "total_keywords": len(KEYWORD_TAXONOMY),
            "most_sensitive_bot": most_sensitive,
            "peak_delta": max(sm.adjustments.values(), default=0.0),
            "sensitivity_map": sm.adjustments,
        }


def _all_bots() -> list[str]:
    return [
        "NAV_DETECTOR",
        "CARGO_BOT",
        "COMMODITY_MONITOR",
        "SANCTIONS_BOT",
        "FX_BOT",
        "COMPLIANCE_BOT",
        "SUCCESSION_BOT",
        "SOVEREIGN_BOT",
        "ASSET_TRACKER",
        "SATELLITE_ANALYTICS",
        "ADVERSARIAL_TESTER",
    ]
