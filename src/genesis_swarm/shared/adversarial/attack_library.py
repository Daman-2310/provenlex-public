from __future__ import annotations

import random
from dataclasses import dataclass


@dataclass
class AttackResult:
    vector_id: str
    target_bot_type: str
    technique: str
    category: str
    severity: str
    bypassed: bool
    natural_score: float
    evaded_score: float
    threshold: float
    payload_summary: str
    explanation: str


class AttackVector:
    """Base class for all adversarial attack vectors."""

    def __init__(
        self,
        vector_id: str,
        target_bot_type: str,
        technique: str,
        category: str,
        severity: str,
        description: str,
        base_natural_score: float,
        base_evasion_factor: float,
        payload_summary: str,
        explanation: str,
        patch_description: str,
    ):
        self.vector_id = vector_id
        self.target_bot_type = target_bot_type
        self.technique = technique
        self.category = category
        self.severity = severity
        self.description = description
        self.base_natural_score = base_natural_score
        self.base_evasion_factor = base_evasion_factor
        self.payload_summary = payload_summary
        self.explanation = explanation
        self.patch_description = patch_description

    def execute(self, current_threshold: float) -> AttackResult:
        noise = random.gauss(0, 0.07)
        evasion = max(0.10, min(0.92, self.base_evasion_factor + noise))
        evaded = round(self.base_natural_score * (1.0 - evasion), 1)
        evaded = max(5.0, evaded)
        return AttackResult(
            vector_id=self.vector_id,
            target_bot_type=self.target_bot_type,
            technique=self.technique,
            category=self.category,
            severity=self.severity,
            bypassed=evaded < current_threshold,
            natural_score=self.base_natural_score,
            evaded_score=evaded,
            threshold=current_threshold,
            payload_summary=self.payload_summary,
            explanation=self.explanation,
        )


# ── SANCTIONS_BOT Attack Vectors ───────────────────────────────────────────────
#
# Real detection logic: token overlap = |tokens_A ∩ tokens_B| / |tokens_B|
# Alert threshold: 0.75 (75% token overlap) mapped to score 75+
# Attack goal: reduce token overlap below 75%

ATTACK_VECTORS: list[AttackVector] = [
    AttackVector(
        vector_id="SANC-001",
        target_bot_type="SANCTIONS_BOT",
        technique="token_removal",
        category="obfuscation",
        severity="HIGH",
        description="Drop middle token from SDN entity name to reduce overlap below 0.75 threshold",
        base_natural_score=91.0,
        base_evasion_factor=0.32,
        payload_summary='"FEDERAL CORP" (token stripped: RESOURCE removed — overlap 2/3 = 67%)',
        explanation="Token overlap drops from 3/3=100% to 2/3=67%. Below 0.75 match threshold.",
        patch_description="SANCTIONS: Match threshold lowered 0.75→0.60 — partial-name entities now flagged",
    ),
    AttackVector(
        vector_id="SANC-002",
        target_bot_type="SANCTIONS_BOT",
        technique="abbreviation_swap",
        category="obfuscation",
        severity="MEDIUM",
        description='Replace full words with abbreviations — "FEDERAL"→"FED" changes token set',
        base_natural_score=91.0,
        base_evasion_factor=0.30,
        payload_summary='"FED RESOURCE CORP" (abbreviated: FEDERAL→FED — "FED"≠"FEDERAL" after tokenize)',
        explanation='"FED" is not in SDN token set {FEDERAL, RESOURCE, CORP}. Overlap = 2/3 = 67%.',
        patch_description="SANCTIONS: Stemming added to tokenizer — FED/FEDERAL/FEDERALE treated as same token",
    ),
    AttackVector(
        vector_id="SANC-003",
        target_bot_type="SANCTIONS_BOT",
        technique="synonym_substitution",
        category="obfuscation",
        severity="MEDIUM",
        description="Replace key identifier token with a near-synonym to drop below match threshold",
        base_natural_score=91.0,
        base_evasion_factor=0.28,
        payload_summary='"NATIONAL RESOURCE CORP" (synonym: FEDERAL→NATIONAL — different token)',
        explanation='"NATIONAL" not in SDN token set. Intersection = {RESOURCE, CORP} = 2/3 = 67%.',
        patch_description="SANCTIONS: Semantic similarity layer added — synonym tokens mapped to SDN canonical forms",
    ),
    AttackVector(
        vector_id="SANC-004",
        target_bot_type="SANCTIONS_BOT",
        technique="entity_type_pivot",
        category="evasion",
        severity="CRITICAL",
        description="Reclassify sanctioned company as a VESSEL — screened against different list path",
        base_natural_score=91.0,
        base_evasion_factor=0.55,
        payload_summary='"FEDERAL RESOURCE CORP" submitted as type=VESSEL — vessel SDN path misses company entries',
        explanation="Entity type VESSEL routes to AIS/IMO checks, not OFAC company list. Type confusion bypasses OFAC path.",
        patch_description="SANCTIONS: Cross-type screening added — VESSEL entities also checked against company SDN list",
    ),
    # ── CARGO_BOT Attack Vectors ────────────────────────────────────────────────
    #
    # Real scoring: dark_hours>24h=35pts, dark_hours>6h=15pts, high_risk_flag=40pts
    # "crude+sanctioned flag"=20pts, "stationary+dark>2h"=10pts. Alert at 75pts.
    AttackVector(
        vector_id="CARG-001",
        target_bot_type="CARGO_BOT",
        technique="ais_gap_fragmentation",
        category="timing",
        severity="HIGH",
        description="Fragment a 12h AIS dark window into two 5.8h gaps with a brief forged ping",
        base_natural_score=88.0,
        base_evasion_factor=0.35,
        payload_summary="MV PHANTOM [5.8h dark] → fake ping @ 03:40Z → [5.8h dark] (total 11.6h, each gap <6h)",
        explanation="Each 5.8h gap scores 0 dark pts (threshold >6h). Continuous 11.6h gap would score 35pts.",
        patch_description="CARGO: Cumulative dark-time window added — >10h total dark in any 12h period triggers",
    ),
    AttackVector(
        vector_id="CARG-002",
        target_bot_type="CARGO_BOT",
        technique="flag_state_laundering",
        category="spoofing",
        severity="CRITICAL",
        description="Temporarily re-register vessel under neutral flag before detection cycle runs",
        base_natural_score=88.0,
        base_evasion_factor=0.48,
        payload_summary="MV NORD STAR: flag_state changed IR→MT (Malta, non-sanctioned) 4h before detection tick",
        explanation="High-risk flag (IR) contributes 40pts. Malta flag = 0pts. Total drops from 88 to 48, below threshold.",
        patch_description="CARGO: Flag history tracking added — flag changes within 48h flagged as laundering attempt",
    ),
    AttackVector(
        vector_id="CARG-003",
        target_bot_type="CARGO_BOT",
        technique="speed_spoofing",
        category="spoofing",
        severity="LOW",
        description='Broadcast minimal non-zero speed (0.3 kn) to avoid the "stationary+dark" compound rule',
        base_natural_score=82.0,
        base_evasion_factor=0.15,
        payload_summary="MT GULF RUNNER: speed spoofed to 0.3 knots while actually anchored — AIS speed=0 check bypassed",
        explanation='"Stationary + dark>2h" rule requires speed==0. Setting 0.3kn removes 10pt trigger.',
        patch_description="CARGO: Speed threshold broadened — speed<1 knot now treated as stationary for dark-ship scoring",
    ),
    AttackVector(
        vector_id="CARG-004",
        target_bot_type="CARGO_BOT",
        technique="cargo_type_substitution",
        category="obfuscation",
        severity="MEDIUM",
        description="Falsify cargo manifest — declare CRUDE_OIL as DRY_BULK to avoid compound risk trigger",
        base_natural_score=82.0,
        base_evasion_factor=0.25,
        payload_summary="MT GULF RUNNER: cargo_type changed CRUDE_OIL→DRY_BULK on manifest. High-risk flag retained.",
        explanation='"Crude oil + sanctioned flag" compound = 20pts. Cargo reclassification removes this bonus.',
        patch_description="CARGO: Cargo-type history cross-referenced against port records — sudden cargo changes flagged",
    ),
    # ── FX_BOT Attack Vectors ───────────────────────────────────────────────────
    #
    # Shadow model: abs_change>2%=50pts, abs_change>1%=25pts, volatility_dev>0.08=35pts
    # High-risk currency multiplier ×1.25 (RUB, CNY, IRR). Alert at 75pts.
    AttackVector(
        vector_id="FXBT-001",
        target_bot_type="FX_BOT",
        technique="rate_smoothing",
        category="timing",
        severity="HIGH",
        description="Spread a single anomalous 2.5% tick across three ticks to stay below per-tick trigger",
        base_natural_score=90.0,
        base_evasion_factor=0.42,
        payload_summary="RUB/EUR: 3 ticks of +0.83% each (total 2.5%) instead of single +2.5% spike",
        explanation="Single 2.5% tick → 50pts. Three 0.83% ticks → 0pts each (<1% threshold). Dev also diluted.",
        patch_description="FX: 3-tick rolling accumulator added — cumulative change >1.5% in 3 ticks now triggers",
    ),
    AttackVector(
        vector_id="FXBT-002",
        target_bot_type="FX_BOT",
        technique="threshold_proximity",
        category="structuring",
        severity="MEDIUM",
        description="Craft FX move at exactly 1.99% — just below the 2.0% high-severity trigger",
        base_natural_score=90.0,
        base_evasion_factor=0.25,
        payload_summary="USD/EUR: engineered move of +1.99% — avoids >2.0% (50pt) tier, scores only 25pts",
        explanation="1.99% misses the >2.0% threshold (50pts). Only >1.0% tier (25pts) fires. Total drops from 90 to ~65.",
        patch_description="FX: Tier-1 boundary tightened to 1.85% — structuring near 2.0% limit now caught",
    ),
    AttackVector(
        vector_id="FXBT-003",
        target_bot_type="FX_BOT",
        technique="currency_rotation",
        category="layering",
        severity="CRITICAL",
        description="Route RUB→CNY→EUR in two legs — each leg appears as a low-risk neutral-currency move",
        base_natural_score=90.0,
        base_evasion_factor=0.60,
        payload_summary="RUB→CNY leg (normal CNY pair) + CNY→EUR leg (normal EUR pair). No direct RUB/EUR exposure visible.",
        explanation="Direct RUB/EUR gets ×1.25 high-risk multiplier. Two-hop routing shows as CNY trades — multiplier avoided.",
        patch_description="FX: Cross-currency flow analysis added — RUB→CNY→EUR chain within 60s flagged as layering",
    ),
    AttackVector(
        vector_id="FXBT-004",
        target_bot_type="FX_BOT",
        technique="noise_normalization",
        category="obfuscation",
        severity="MEDIUM",
        description="Inject micro-fluctuations (±0.05%) around the trend to reduce statistical significance",
        base_natural_score=87.0,
        base_evasion_factor=0.30,
        payload_summary="RUB/EUR trend injected with ±0.05% noise per tick — z-score reduced from 3.1σ to 1.8σ",
        explanation="Adding noise lowers z-score of the trend. Vol-deviation check misses the obscured directional move.",
        patch_description="FX: Kalman filter applied before z-score calc — noise injection no longer masks underlying trend",
    ),
    # ── COMPLIANCE_BOT Attack Vectors ───────────────────────────────────────────
    #
    # AIFMD rules: leverage>3.0=35pts, liquidity<0.10=30pts, concentration>0.40=20pts
    # redemption_queue>0.15=25pts, reporting_delay>30d=15pts. Alert at 75pts.
    AttackVector(
        vector_id="COMP-001",
        target_bot_type="COMPLIANCE_BOT",
        technique="leverage_structuring",
        category="structuring",
        severity="HIGH",
        description="Maintain leverage at 2.999× — just under AIFMD 3.0× limit, avoids 35pt trigger",
        base_natural_score=88.0,
        base_evasion_factor=0.40,
        payload_summary="FX-MACRO-LUX: leverage_ratio=2.999 (limit: >3.0). Structuring keeps all metrics near-threshold.",
        explanation="leverage_ratio > 3.0 check: 2.999 < 3.0 → 0pts. Plus liquidity near 0.10 → borderline 0pts. Total < 75.",
        patch_description="COMPLIANCE: Buffer zone added — leverage alert fires at 2.90× (10% buffer before AIFMD limit)",
    ),
    AttackVector(
        vector_id="COMP-002",
        target_bot_type="COMPLIANCE_BOT",
        technique="window_dressing",
        category="timing",
        severity="HIGH",
        description="Temporarily boost liquidity ratio to 10.1% immediately before the detection cycle",
        base_natural_score=86.0,
        base_evasion_factor=0.38,
        payload_summary="ASIA-MACRO-LUX: liquidity_ratio spiked 0.079→0.101 via overnight repo 2h before CSSF check",
        explanation="liquidity_ratio < 0.10 check: 0.101 > 0.10 → 0pts (instead of 30pts). Repo unwinds after check.",
        patch_description="COMPLIANCE: 5-day rolling average liquidity check added — window dressing no longer effective",
    ),
    AttackVector(
        vector_id="COMP-003",
        target_bot_type="COMPLIANCE_BOT",
        technique="concentration_fragmentation",
        category="structuring",
        severity="MEDIUM",
        description="Split top-5 position across 6 entities — each falls below 40% concentration limit",
        base_natural_score=85.0,
        base_evasion_factor=0.26,
        payload_summary="MARITIME-ALPHA-LUX: 42% position split into 6 nominee entities at 38%, 39%, 37%… each < 40% limit",
        explanation="concentration_top5 > 0.40 check sees max 39% per entity. True beneficial exposure = 42% — concealed.",
        patch_description="COMPLIANCE: UBO concentration aggregation added — related-party positions consolidated before check",
    ),
    AttackVector(
        vector_id="COMP-004",
        target_bot_type="COMPLIANCE_BOT",
        technique="reporting_timestamp_forgery",
        category="obfuscation",
        severity="LOW",
        description="Submit a null CSSF report to reset reporting_delay_days counter without filing real data",
        base_natural_score=79.0,
        base_evasion_factor=0.20,
        payload_summary="ENERGY-INFRA-LUX: empty CSSF XML stub submitted — reporting_delay_days reset to 0 (was 42 days)",
        explanation="reporting_delay_days > 30 check: reset to 0 removes 15pts. Stub contains no actual fund data.",
        patch_description="COMPLIANCE: Report completeness score added — stub submissions flagged, delay clock not reset",
    ),
    # ── SATELLITE_ANALYTICS Attack Vectors ───────────────────────────────────────
    #
    # Shadow model: cluster_size≥3=40pts, pass_count>3 in 24h=35pts, unknown_origin=20pts.
    # Correlation with market anomaly = ×1.2. Alert at 75pts.
    AttackVector(
        vector_id="ORBT-001",
        target_bot_type="SATELLITE_ANALYTICS",
        technique="temporal_spreading",
        category="timing",
        severity="MEDIUM",
        description="Spread 4 satellite passes over 48h window — drops to 2 passes per 24h, below daily threshold",
        base_natural_score=83.0,
        base_evasion_factor=0.42,
        payload_summary="UNKNOWN-2024-089A cluster: 4 passes across 48h (Mon+Tue) → 2/day. 24h check sees only 2 passes.",
        explanation="pass_count > 3 in 24h check sees max 2. Total drops from 35pts to 0pts. Cluster still detectable but score < 75.",
        patch_description="ORBITAL: Rolling 48h pass-count window added — 4 passes in any 48h period now triggers",
    ),
    AttackVector(
        vector_id="ORBT-002",
        target_bot_type="SATELLITE_ANALYTICS",
        technique="cluster_dilution",
        category="evasion",
        severity="MEDIUM",
        description="Reduce visible cluster size from 3 to 2 objects — drops below cluster-size threshold",
        base_natural_score=83.0,
        base_evasion_factor=0.48,
        payload_summary="UNKNOWN-2024-089A: cluster_size reduced 3→2 (third object masked via orbital manoeuvre)",
        explanation="cluster_size ≥ 3 check: 2 < 3 → 0pts (instead of 40pts). Score drops from 83 to ~43.",
        patch_description="ORBITAL: Cluster threshold lowered to 2 objects — pairs of unknowns now trigger correlated-pass check",
    ),
    # ── SUCCESSION_BOT Attack Vectors (bonus) ──────────────────────────────────
    AttackVector(
        vector_id="SUCC-001",
        target_bot_type="SUCCESSION_BOT",
        technique="ubo_layering",
        category="layering",
        severity="CRITICAL",
        description="Insert 5-layer offshore holding chain — PEP beneficial owner buried below 4-hop visibility limit",
        base_natural_score=86.0,
        base_evasion_factor=0.52,
        payload_summary="ALPHA MARITIME → Cayman SPV → BVI Trust → Luxembourg SARL → PEP (layer 5, beyond 4-hop UBO scan)",
        explanation="UBO scanner depth=4 hops. PEP at layer 5 is invisible. Score drops from 86 to ~41.",
        patch_description="SUCCESSION: UBO scan depth extended to 6 hops — 5-layer offshore chains now fully resolved",
    ),
    AttackVector(
        vector_id="SUCC-002",
        target_bot_type="SUCCESSION_BOT",
        technique="nominee_director_substitution",
        category="obfuscation",
        severity="HIGH",
        description="Replace PEP beneficial owner with clean nominee director on public register",
        base_natural_score=86.0,
        base_evasion_factor=0.38,
        payload_summary="CHEN WEI HOLDINGS: registered director changed from PEP to nominee John Davies (UK, clean record)",
        explanation="Public register shows clean nominee. PEP retains economic interest via undisclosed shareholder agreement.",
        patch_description="SUCCESSION: Shareholder agreement cross-check added — nominee/PEP beneficial interest divergence flagged",
    ),
]

# Index by vector_id for fast lookup
VECTOR_INDEX: dict[str, AttackVector] = {v.vector_id: v for v in ATTACK_VECTORS}
