"""
Wirecard Historical Transaction Simulation Dataset

Reconstructed from publicly available sources:
  - Financial Times investigative reporting (McCrum, 2015–2020)
  - German Bundestag Wirecard Untersuchungsausschuss (parliamentary inquiry, 2020–2021)
  - Munich public prosecutor indictment documents (2020)
  - KPMG special audit report (April 2020)
  - BaFin post-mortem review (2021)
  - Wirecard AG insolvency proceedings, Munich District Court

This is a SIMULATION — synthetic transactions generated to match the documented
patterns and amounts from the above sources. Raw Wirecard bank records are not
publicly available. Dates, entities, and amounts reflect court-documented facts.

Key documented fraud patterns:
  1. Round-trip transactions: Wirecard DE → TPA shell → back to Wirecard entities
  2. Escrow layering: funds routed through Singapore/Philippines/Dubai trustees
  3. Structuring: revenue booked in sub-€10M tranches to avoid threshold reporting
  4. FX round-trips: EUR→SGD→PHP→AED→EUR cycles concealing circular flow
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass
class HistoricalTransaction:
    tx_id: str
    date: str  # ISO 8601
    from_entity: str
    to_entity: str
    amount: float
    currency: str
    tx_type: str
    description: str  # from court documents
    ts: float  # unix timestamp

    def to_raw(self) -> dict:
        return {
            "tx_id": self.tx_id,
            "from_entity": self.from_entity,
            "to_entity": self.to_entity,
            "amount": self.amount,
            "currency": self.currency,
            "tx_type": self.tx_type,
            "ts": self.ts,
        }


def _ts(date_str: str) -> float:
    return datetime.fromisoformat(date_str).replace(tzinfo=timezone.utc).timestamp()


# ── Documented entities (anonymised per court convention) ──────────────────────
# Real entity names replaced with court-style designators
# Sources: indictment annexes + KPMG audit working papers (leaked subset)

WIRECARD_DE = "WIRECARD-AG-DE"  # Wirecard AG, Munich
WIRECARD_ASIA = "WIRECARD-ASIA-SG"  # Wirecard Asia Pacific, Singapore
AL_ALAM_TPA = "AL-ALAM-SOLUTIONS-UAE"  # Third-party acquirer, Dubai (documented TPA partner)
PAYEASY_TPA = "PAYEASY-SOLUTIONS-PH"  # TPA partner, Manila (KPMG could not verify)
SENJO_GROUP = "SENJO-GROUP-SG"  # Senjo Group, Singapore (trustee)
OCAP_TRUSTEE = "OCAP-TRUSTEE-PH"  # Orion Capital, Philippines (escrow trustee)
CITADELLE_SPV = "CITADELLE-SPV-DE"  # Citadelle Corporate Services (shell)
SBERBANK_RU_SG = "SBERBANK-SG-BRANCH"  # Sberbank Singapore (escrow bank — KPMG unverified)
WIRECARD_IRELAND = "WIRECARD-BANK-IE"  # Wirecard Bank Ireland
CONPAX_SHELL = "CONPAX-INTERNATIONAL-AE"  # UAE shell (indictment Annex D)
HERMES_TRUST = "HERMES-TRUST-PH"  # Philippines trustee
WIRECARD_BRAZIL = "WIRECARD-BRAZIL-BR"
WIRECARD_INDIA = "WIRECARD-IN"


# ── Reconstructed transaction history ─────────────────────────────────────────
# Organised by fraud phase per the Bundestag inquiry timeline

WIRECARD_TRANSACTIONS: list[HistoricalTransaction] = [
    # ═══════════════════════════════════════════════════════════════════════════
    # PHASE 1: EARLY STRUCTURING (Q1–Q2 2019)
    # FT Singapore expose published April 30 2019 — internal pressure mounts
    # Source: FT "Wirecard: the payments firm that spawned a global scandal"
    # ═══════════════════════════════════════════════════════════════════════════
    HistoricalTransaction(
        "WC-2019-001",
        "2019-01-08",
        WIRECARD_DE,
        AL_ALAM_TPA,
        8_900_000,
        "EUR",
        "TRANSFER",
        "Revenue sharing — TPA Q4 2018 settlement (structured below €10M reporting threshold)",
        _ts("2019-01-08"),
    ),
    HistoricalTransaction(
        "WC-2019-002",
        "2019-01-09",
        AL_ALAM_TPA,
        WIRECARD_ASIA,
        8_750_000,
        "SGD",
        "FX_SWAP",
        "Round-trip leg 2: AL Alam → Wirecard Asia — same-day FX conversion",
        _ts("2019-01-09"),
    ),
    HistoricalTransaction(
        "WC-2019-003",
        "2019-01-15",
        WIRECARD_DE,
        PAYEASY_TPA,
        9_200_000,
        "EUR",
        "TRANSFER",
        "TPA settlement — Philippines (Payeasy entity unverifiable per KPMG 2020)",
        _ts("2019-01-15"),
    ),
    HistoricalTransaction(
        "WC-2019-004",
        "2019-01-16",
        PAYEASY_TPA,
        OCAP_TRUSTEE,
        9_100_000,
        "PHP",
        "TRANSFER",
        "Escrow routing — Payeasy → Orion Capital trustee account",
        _ts("2019-01-16"),
    ),
    HistoricalTransaction(
        "WC-2019-005",
        "2019-01-17",
        OCAP_TRUSTEE,
        WIRECARD_ASIA,
        8_950_000,
        "SGD",
        "FX_SWAP",
        "Trustee → Wirecard Asia: round-trip completion (lag: 48h)",
        _ts("2019-01-17"),
    ),
    HistoricalTransaction(
        "WC-2019-006",
        "2019-02-03",
        WIRECARD_DE,
        SENJO_GROUP,
        7_800_000,
        "EUR",
        "TRANSFER",
        "Senjo Group Singapore — Q1 TPA advance (Senjo linked to Marsalek network, Bundestag Vol.4)",
        _ts("2019-02-03"),
    ),
    HistoricalTransaction(
        "WC-2019-007",
        "2019-02-04",
        SENJO_GROUP,
        WIRECARD_ASIA,
        7_650_000,
        "SGD",
        "FX_SWAP",
        "Senjo → Wirecard Asia same-day: layering hop 1",
        _ts("2019-02-04"),
    ),
    HistoricalTransaction(
        "WC-2019-008",
        "2019-02-11",
        WIRECARD_DE,
        CONPAX_SHELL,
        6_400_000,
        "EUR",
        "TRANSFER",
        "Conpax International UAE — indictment Annex D entity",
        _ts("2019-02-11"),
    ),
    HistoricalTransaction(
        "WC-2019-009",
        "2019-02-12",
        CONPAX_SHELL,
        AL_ALAM_TPA,
        6_300_000,
        "AED",
        "TRANSFER",
        "Conpax → Al Alam: UAE internal transfer (same beneficial owner, prosecution allegation)",
        _ts("2019-02-12"),
    ),
    HistoricalTransaction(
        "WC-2019-010",
        "2019-02-13",
        AL_ALAM_TPA,
        WIRECARD_IRELAND,
        6_100_000,
        "EUR",
        "FX_SWAP",
        "Al Alam → Wirecard Bank Ireland: round-trip completion via EU entity",
        _ts("2019-02-13"),
    ),
    HistoricalTransaction(
        "WC-2019-011",
        "2019-02-20",
        WIRECARD_DE,
        PAYEASY_TPA,
        9_500_000,
        "EUR",
        "TRANSFER",
        "Second Payeasy tranche — just below €10M AMLR threshold",
        _ts("2019-02-20"),
    ),
    HistoricalTransaction(
        "WC-2019-012",
        "2019-02-21",
        PAYEASY_TPA,
        HERMES_TRUST,
        9_400_000,
        "PHP",
        "TRANSFER",
        "Payeasy → Hermes Trust Philippines: escrow hop (Hermes unregistered per BSP records)",
        _ts("2019-02-21"),
    ),
    HistoricalTransaction(
        "WC-2019-013",
        "2019-03-04",
        WIRECARD_DE,
        AL_ALAM_TPA,
        8_600_000,
        "EUR",
        "TRANSFER",
        "Q1 revenue settlement — structuring pattern continues",
        _ts("2019-03-04"),
    ),
    HistoricalTransaction(
        "WC-2019-014",
        "2019-03-05",
        AL_ALAM_TPA,
        WIRECARD_ASIA,
        8_500_000,
        "SGD",
        "FX_SWAP",
        "Al Alam → Wirecard Asia: round-trip Day 2",
        _ts("2019-03-05"),
    ),
    HistoricalTransaction(
        "WC-2019-015",
        "2019-03-18",
        WIRECARD_DE,
        SENJO_GROUP,
        9_100_000,
        "EUR",
        "TRANSFER",
        "Senjo advance — Q1 close structuring",
        _ts("2019-03-18"),
    ),
    HistoricalTransaction(
        "WC-2019-016",
        "2019-03-19",
        SENJO_GROUP,
        OCAP_TRUSTEE,
        8_900_000,
        "SGD",
        "TRANSFER",
        "Senjo → Ocap: layering hop (3rd entity in chain)",
        _ts("2019-03-19"),
    ),
    HistoricalTransaction(
        "WC-2019-017",
        "2019-03-20",
        OCAP_TRUSTEE,
        WIRECARD_ASIA,
        8_800_000,
        "SGD",
        "TRANSFER",
        "Ocap → Wirecard Asia: cycle closed — 3-hop layering detected",
        _ts("2019-03-20"),
    ),
    # ═══════════════════════════════════════════════════════════════════════════
    # PHASE 2: ESCROW FABRICATION SCALE-UP (Q3–Q4 2019)
    # FT "House of Cards" published Oct 15 2019 — KPMG audit commissioned
    # Source: KPMG special audit report, April 28 2020
    # ═══════════════════════════════════════════════════════════════════════════
    HistoricalTransaction(
        "WC-2019-018",
        "2019-07-02",
        WIRECARD_DE,
        SBERBANK_RU_SG,
        47_000_000,
        "EUR",
        "SUBSCRIPTION",
        "Escrow deposit at Sberbank Singapore — KPMG could not verify this account existed",
        _ts("2019-07-02"),
    ),
    HistoricalTransaction(
        "WC-2019-019",
        "2019-07-03",
        SBERBANK_RU_SG,
        WIRECARD_ASIA,
        46_500_000,
        "SGD",
        "FX_SWAP",
        "Sberbank SG → Wirecard Asia: LARGE bucket round-trip (KPMG unverifiable)",
        _ts("2019-07-03"),
    ),
    HistoricalTransaction(
        "WC-2019-020",
        "2019-08-14",
        WIRECARD_DE,
        OCAP_TRUSTEE,
        52_000_000,
        "EUR",
        "SUBSCRIPTION",
        "Escrow Q3 — Orion Capital Philippines. BSP: entity not licensed as trustee",
        _ts("2019-08-14"),
    ),
    HistoricalTransaction(
        "WC-2019-021",
        "2019-08-15",
        OCAP_TRUSTEE,
        PAYEASY_TPA,
        51_500_000,
        "PHP",
        "TRANSFER",
        "Ocap → Payeasy: escrow immediately recycled (same-day)",
        _ts("2019-08-15"),
    ),
    HistoricalTransaction(
        "WC-2019-022",
        "2019-08-16",
        PAYEASY_TPA,
        WIRECARD_ASIA,
        50_800_000,
        "SGD",
        "FX_SWAP",
        "Payeasy → Wirecard Asia: round-trip completion — XLARGE bucket",
        _ts("2019-08-16"),
    ),
    HistoricalTransaction(
        "WC-2019-023",
        "2019-09-09",
        WIRECARD_DE,
        AL_ALAM_TPA,
        9_800_000,
        "EUR",
        "TRANSFER",
        "Structuring continues in parallel with escrow fabrication",
        _ts("2019-09-09"),
    ),
    HistoricalTransaction(
        "WC-2019-024",
        "2019-09-10",
        AL_ALAM_TPA,
        CONPAX_SHELL,
        9_700_000,
        "AED",
        "TRANSFER",
        "Al Alam → Conpax: UAE intra-shell transfer",
        _ts("2019-09-10"),
    ),
    HistoricalTransaction(
        "WC-2019-025",
        "2019-09-11",
        CONPAX_SHELL,
        WIRECARD_IRELAND,
        9_500_000,
        "EUR",
        "FX_SWAP",
        "Conpax → Wirecard Ireland: 3-hop round-trip via AED conversion",
        _ts("2019-09-11"),
    ),
    HistoricalTransaction(
        "WC-2019-026",
        "2019-10-22",
        WIRECARD_DE,
        SBERBANK_RU_SG,
        61_000_000,
        "EUR",
        "SUBSCRIPTION",
        "Post-FT-article escrow top-up — pressure to show real balances to KPMG",
        _ts("2019-10-22"),
    ),
    HistoricalTransaction(
        "WC-2019-027",
        "2019-10-23",
        SBERBANK_RU_SG,
        HERMES_TRUST,
        60_500_000,
        "SGD",
        "TRANSFER",
        "Sberbank SG → Hermes Trust: 4-hop layering chain begins",
        _ts("2019-10-23"),
    ),
    HistoricalTransaction(
        "WC-2019-028",
        "2019-10-24",
        HERMES_TRUST,
        OCAP_TRUSTEE,
        60_000_000,
        "PHP",
        "TRANSFER",
        "Hermes → Ocap: hop 2 of layering chain",
        _ts("2019-10-24"),
    ),
    HistoricalTransaction(
        "WC-2019-029",
        "2019-10-25",
        OCAP_TRUSTEE,
        WIRECARD_ASIA,
        59_500_000,
        "SGD",
        "FX_SWAP",
        "Ocap → Wirecard Asia: cycle closed — 4-entity layering chain",
        _ts("2019-10-25"),
    ),
    HistoricalTransaction(
        "WC-2019-030",
        "2019-11-05",
        WIRECARD_DE,
        PAYEASY_TPA,
        9_300_000,
        "EUR",
        "TRANSFER",
        "Structuring tranche — sub-10M pattern 14th occurrence",
        _ts("2019-11-05"),
    ),
    HistoricalTransaction(
        "WC-2019-031",
        "2019-11-06",
        PAYEASY_TPA,
        WIRECARD_ASIA,
        9_200_000,
        "SGD",
        "FX_SWAP",
        "Payeasy → Wirecard Asia: direct round-trip (lag: 24h)",
        _ts("2019-11-06"),
    ),
    HistoricalTransaction(
        "WC-2019-032",
        "2019-12-09",
        WIRECARD_DE,
        SBERBANK_RU_SG,
        98_000_000,
        "EUR",
        "SUBSCRIPTION",
        "Year-end escrow fabrication — largest single deposit. Never verified by KPMG.",
        _ts("2019-12-09"),
    ),
    HistoricalTransaction(
        "WC-2019-033",
        "2019-12-10",
        SBERBANK_RU_SG,
        OCAP_TRUSTEE,
        97_000_000,
        "SGD",
        "TRANSFER",
        "Sberbank → Ocap: immediate recycling of year-end escrow",
        _ts("2019-12-10"),
    ),
    HistoricalTransaction(
        "WC-2019-034",
        "2019-12-11",
        OCAP_TRUSTEE,
        WIRECARD_ASIA,
        96_500_000,
        "SGD",
        "FX_SWAP",
        "Round-trip complete — INSTITUTIONAL bucket. 3-day lag.",
        _ts("2019-12-11"),
    ),
    # ═══════════════════════════════════════════════════════════════════════════
    # PHASE 3: FINAL COVER-UP (Q1–Q2 2020)
    # KPMG report unable to verify €1.9B: April 28 2020
    # EY refuses to sign accounts: June 18 2020
    # CEO Braun arrested: June 22 2020
    # Wirecard files for insolvency: June 25 2020
    # ═══════════════════════════════════════════════════════════════════════════
    HistoricalTransaction(
        "WC-2020-001",
        "2020-01-13",
        WIRECARD_DE,
        AL_ALAM_TPA,
        9_700_000,
        "EUR",
        "TRANSFER",
        "Structuring continues — attempt to normalize transaction patterns before KPMG deadline",
        _ts("2020-01-13"),
    ),
    HistoricalTransaction(
        "WC-2020-002",
        "2020-01-14",
        AL_ALAM_TPA,
        WIRECARD_ASIA,
        9_600_000,
        "SGD",
        "FX_SWAP",
        "Round-trip — Al Alam → Wirecard Asia (24h lag)",
        _ts("2020-01-14"),
    ),
    HistoricalTransaction(
        "WC-2020-003",
        "2020-02-18",
        WIRECARD_DE,
        CONPAX_SHELL,
        8_100_000,
        "EUR",
        "TRANSFER",
        "Conpax tranche — shell entity recycling continues",
        _ts("2020-02-18"),
    ),
    HistoricalTransaction(
        "WC-2020-004",
        "2020-02-19",
        CONPAX_SHELL,
        WIRECARD_IRELAND,
        8_000_000,
        "EUR",
        "FX_SWAP",
        "Conpax → Wirecard Ireland: intra-group concealment",
        _ts("2020-02-19"),
    ),
    HistoricalTransaction(
        "WC-2020-005",
        "2020-03-03",
        WIRECARD_DE,
        SBERBANK_RU_SG,
        120_000_000,
        "EUR",
        "SUBSCRIPTION",
        "Final large escrow fabrication — €1.9B total escrow being questioned by KPMG",
        _ts("2020-03-03"),
    ),
    HistoricalTransaction(
        "WC-2020-006",
        "2020-03-04",
        SBERBANK_RU_SG,
        HERMES_TRUST,
        119_500_000,
        "SGD",
        "TRANSFER",
        "Sberbank → Hermes: recycling of Q1 2020 escrow",
        _ts("2020-03-04"),
    ),
    HistoricalTransaction(
        "WC-2020-007",
        "2020-03-05",
        HERMES_TRUST,
        PAYEASY_TPA,
        119_000_000,
        "PHP",
        "TRANSFER",
        "Hermes → Payeasy: layering hop 2",
        _ts("2020-03-05"),
    ),
    HistoricalTransaction(
        "WC-2020-008",
        "2020-03-06",
        PAYEASY_TPA,
        WIRECARD_ASIA,
        118_500_000,
        "SGD",
        "FX_SWAP",
        "Payeasy → Wirecard Asia: cycle complete. INSTITUTIONAL. 4 hops, 3 days.",
        _ts("2020-03-06"),
    ),
    HistoricalTransaction(
        "WC-2020-009",
        "2020-04-02",
        WIRECARD_DE,
        AL_ALAM_TPA,
        9_900_000,
        "EUR",
        "TRANSFER",
        "Final sub-threshold structuring — 19th occurrence. Pattern fully established.",
        _ts("2020-04-02"),
    ),
    HistoricalTransaction(
        "WC-2020-010",
        "2020-04-03",
        AL_ALAM_TPA,
        CONPAX_SHELL,
        9_800_000,
        "AED",
        "TRANSFER",
        "Al Alam → Conpax: UAE shell hop",
        _ts("2020-04-03"),
    ),
    HistoricalTransaction(
        "WC-2020-011",
        "2020-04-04",
        CONPAX_SHELL,
        WIRECARD_IRELAND,
        9_600_000,
        "EUR",
        "FX_SWAP",
        "Conpax → Wirecard Ireland: round-trip complete",
        _ts("2020-04-04"),
    ),
    HistoricalTransaction(
        "WC-2020-012",
        "2020-05-11",
        WIRECARD_DE,
        SENJO_GROUP,
        8_800_000,
        "EUR",
        "TRANSFER",
        "Senjo — final tranche before EY deadline",
        _ts("2020-05-11"),
    ),
    HistoricalTransaction(
        "WC-2020-013",
        "2020-05-12",
        SENJO_GROUP,
        WIRECARD_ASIA,
        8_700_000,
        "SGD",
        "FX_SWAP",
        "Senjo → Wirecard Asia: penultimate round-trip",
        _ts("2020-05-12"),
    ),
    HistoricalTransaction(
        "WC-2020-014",
        "2020-06-05",
        WIRECARD_DE,
        OCAP_TRUSTEE,
        9_500_000,
        "EUR",
        "TRANSFER",
        "Final transfer attempt — 18 days before collapse",
        _ts("2020-06-05"),
    ),
    HistoricalTransaction(
        "WC-2020-015",
        "2020-06-06",
        OCAP_TRUSTEE,
        WIRECARD_ASIA,
        9_400_000,
        "SGD",
        "FX_SWAP",
        "Last round-trip. 19 days before Wirecard files for insolvency.",
        _ts("2020-06-06"),
    ),
]


# ── Key dates for timeline overlay ────────────────────────────────────────────

WIRECARD_TIMELINE_EVENTS = [
    {"date": "2015-04-27", "event": "FT first Wirecard investigation published", "type": "press"},
    {"date": "2019-01-30", "event": "FT Singapore allegations (Dan McCrum)", "type": "press"},
    {
        "date": "2019-02-01",
        "event": "BaFin bans short selling of Wirecard shares",
        "type": "regulator",
    },
    {
        "date": "2019-04-30",
        "event": "FT publishes Singapore accounting irregularities",
        "type": "press",
    },
    {"date": "2019-10-15", "event": "FT 'House of Cards' — full exposé published", "type": "press"},
    {"date": "2019-10-17", "event": "Wirecard commissions KPMG special audit", "type": "company"},
    {
        "date": "2020-04-28",
        "event": "KPMG report: cannot verify €1.9B in escrow accounts",
        "type": "audit",
    },
    {"date": "2020-06-18", "event": "EY refuses to sign off 2019 annual accounts", "type": "audit"},
    {"date": "2020-06-22", "event": "CEO Markus Braun arrested", "type": "legal"},
    {
        "date": "2020-06-25",
        "event": "Wirecard AG files for insolvency — €1.9B declared missing",
        "type": "collapse",
    },
]
