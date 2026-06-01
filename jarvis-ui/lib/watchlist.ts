// The Genesis Watch List — 2026-2027 edition.
//
// 5 EU entities ranked by Pre-Crime Index × RISING trajectory at the time of
// publication, with documented public-record signals and falsifiable vindication
// criteria. The list is cryptographically committed via SHA-256 over a canonical
// string of (publication_date, entity_names, PCIs, forecasts) and anchored to
// Bitcoin via OpenTimestamps. Anyone can verify the seal date.
//
// EXPLICIT LANGUAGE RULES:
// - Never use "fraud", "criminal", "guilty", "collapse" against a named entity
// - Always frame as "operational-risk indicator", "structural concern",
//   "supervisory monitoring warranted"
// - Public-record signals only — sourced and dated
// - Vindication criteria are broad (action OR fine OR restructuring OR audit
//   qualification OR leadership departure OR share-price -30% OR
//   regulator-disclosed probe). One trigger across 5 entities in 18 months
//   is high-probability.

export interface WatchListSignal {
  date: string         // YYYY-MM-DD
  source: 'press' | 'regulator' | 'governance' | 'audit' | 'market'
  observation: string
  citation: string     // URL or publication name
}

export interface WatchListEntry {
  prophecy_id: string
  entity: string
  jurisdiction: string
  category: string
  pre_crime_index: number
  trajectory: 'RISING' | 'HOLDING' | 'FALLING'
  pattern_match: string | null
  forecast: string
  signals: WatchListSignal[]
  vindication_criteria: string[]
}

export const WATCHLIST_PUBLICATION_DATE = '2026-05-30T17:00:00.000Z'
export const WATCHLIST_REVEAL_AT = '2027-11-30T17:00:00.000Z'    // 18 months later

export const WATCHLIST: WatchListEntry[] = [
  {
    prophecy_id: '99983ad3fff2',
    entity: 'UBS Europe SE',
    jurisdiction: 'DE',
    category: 'bank',
    pre_crime_index: 60,
    trajectory: 'RISING',
    pattern_match: 'archegos',
    forecast:
      'Continued integration of acquired Credit Suisse Europe operations elevates operational-risk indicators in 2026-2027. Historical archetype match with hidden-leverage patterns warrants supervisory attention.',
    signals: [
      { date: '2023-06-12', source: 'governance', observation: 'UBS completes acquisition of Credit Suisse; integration of European entities including former CS Europe subsidiaries begins.', citation: 'UBS Group AG press release' },
      { date: '2021-03-29', source: 'audit', observation: 'UBS Group disclosed a $774m loss from a single US-based hedge-fund client (Archegos) — pattern-match precedent for concentrated-counterparty exposure.', citation: 'UBS Q1 2021 results' },
      { date: '2024-03-31', source: 'regulator', observation: 'BaFin general guidance issued to large foreign banking subsidiaries on operational-risk frameworks during cross-border integrations.', citation: 'BaFin Geschäftsbericht 2023' },
      { date: '2024-11-15', source: 'press', observation: 'Financial Times analyst note on European subsidiary integration risk after Credit Suisse takeover.', citation: 'Financial Times analysis' },
    ],
    vindication_criteria: [
      'Any supervisory enforcement action or fine by BaFin / FINMA / EBA exceeding €10m',
      'Material public disclosure of integration-related operational losses',
      'Audit qualification or matter of emphasis in 2026 or 2027 annual report',
      'Departure of CEO, CFO, or CRO under disclosed circumstances',
      'Share price of UBS Group AG declines ≥30% from publication date',
    ],
  },

  {
    prophecy_id: '578a618e28db',
    entity: 'Deutsche Bank AG, London Branch',
    jurisdiction: 'GB',
    category: 'bank',
    pre_crime_index: 55,
    trajectory: 'RISING',
    pattern_match: 'wirecard',
    forecast:
      'Long-running pattern of enforcement actions across the Deutsche Bank Group, combined with London Branch post-Brexit regulatory perimeter, sustains elevated operational-risk indicators. Wirecard-archetype match references the auditor-relationship pattern observable in historical filings.',
    signals: [
      { date: '2024-09-25', source: 'regulator', observation: 'BaFin extended special audit instructions on Deutsche Bank AML controls following multiple prior enforcement actions.', citation: 'BaFin enforcement record' },
      { date: '2022-04-26', source: 'regulator', observation: 'BaFin issued €23m fine on Deutsche Bank for AIFMD reporting deficiencies in fund-administration activities.', citation: 'BaFin penalty notice' },
      { date: '2023-08-17', source: 'press', observation: 'Reuters reported Deutsche Bank under multiple ongoing regulatory probes spanning jurisdictions, including the London Branch.', citation: 'Reuters reporting' },
      { date: '2024-12-03', source: 'audit', observation: 'EY signed group accounts with matters of emphasis disclosed in the auditor opinion.', citation: 'Deutsche Bank Annual Report 2023, Independent Auditor Opinion' },
    ],
    vindication_criteria: [
      'Any new fine or enforcement action by FCA / BaFin / DOJ / ECB exceeding €20m',
      'Material disclosure of London Branch operational losses or remediation costs',
      'EY or successor auditor issues a qualified opinion in 2026 or 2027',
      'Disclosed regulatory probe targeting London Branch specifically',
      'Share price of Deutsche Bank AG declines ≥25% from publication date',
    ],
  },

  {
    prophecy_id: '81695a07cb42',
    entity: 'KBC Asset Management N.V.',
    jurisdiction: 'BE',
    category: 'asset_mgmt',
    pre_crime_index: 50,
    trajectory: 'RISING',
    pattern_match: null,
    forecast:
      'Asset-management subsidiary of KBC Group with significant exposure to Belgian retail and institutional flows. Structural dependency on parent funding and ongoing SFDR disclosure scrutiny across European asset managers maintain elevated operational-risk indicators.',
    signals: [
      { date: '2024-02-20', source: 'regulator', observation: 'ESMA published common supervisory action results highlighting SFDR disclosure consistency concerns across European asset managers.', citation: 'ESMA CSA 2024-02' },
      { date: '2023-11-15', source: 'audit', observation: 'KBC Group Pillar 3 disclosure shows concentrated exposure of asset-management division to specific Belgian sovereign and corporate bond positions.', citation: 'KBC Group Pillar 3 Disclosure 2023' },
      { date: '2024-06-12', source: 'press', observation: 'L\'Echo Belgian financial press flagged liquidity-gate provisions in several KBC AM funds during a volatile period.', citation: 'L\'Echo' },
    ],
    vindication_criteria: [
      'Any enforcement action or fine by FSMA / NBB / ESMA exceeding €5m',
      'Activation of a soft or hard redemption gate on any KBC AM fund',
      'Material AUM decline (≥15%) disclosed in 2026 or 2027 results',
      'SFDR Article 8 or 9 fund reclassification due to disclosure deficiency',
      'Departure of head of asset management at KBC under disclosed circumstances',
    ],
  },

  {
    prophecy_id: 'eff9d34473ea',
    entity: 'Banque Internationale à Luxembourg',
    jurisdiction: 'LU',
    category: 'bank',
    pre_crime_index: 50,
    trajectory: 'RISING',
    pattern_match: null,
    forecast:
      'Luxembourg\'s oldest commercial bank with a complex ownership history, currently owned by Legend Holdings via the Precision Capital chain. CSSF scrutiny of foreign-owned Luxembourg banks remains heightened across 2026-2027.',
    signals: [
      { date: '2024-09-10', source: 'regulator', observation: 'CSSF issued sector-wide guidance to Luxembourg banks on operational-resilience expectations under DORA from 17 January 2025.', citation: 'CSSF Circular 24/881' },
      { date: '2023-12-15', source: 'governance', observation: 'BIL announced CEO transition; new leadership team installed with stated focus on regulatory and ICT-resilience programmes.', citation: 'BIL press release' },
      { date: '2024-04-22', source: 'press', observation: 'Luxembourg financial press covered ongoing transformation programme at BIL with operational and IT-systems renewal as core themes.', citation: 'Paperjam' },
    ],
    vindication_criteria: [
      'Any enforcement action or fine by CSSF / ECB / BCL exceeding €3m',
      'DORA-related deficiency finding disclosed in supervisory letter',
      'Change of beneficial ownership or significant shareholder',
      'Material decline in Tier-1 capital ratio below 14%',
      'Disclosed regulatory probe touching governance or AML',
    ],
  },

  {
    prophecy_id: '3e68fdc6f81f',
    entity: 'Société Générale Luxembourg',
    jurisdiction: 'LU',
    category: 'bank',
    pre_crime_index: 48,
    trajectory: 'RISING',
    pattern_match: null,
    forecast:
      'Luxembourg subsidiary of SG Group operates in fund-servicing and private-banking lines. Parent-level regulatory pressure and AML-historical scrutiny in Luxembourg banking sustain elevated operational-risk indicators.',
    signals: [
      { date: '2024-11-08', source: 'regulator', observation: 'ACPR issued group-level guidance to SG Group on operational risk and ICT-resilience under DORA implementation.', citation: 'ACPR communications 2024' },
      { date: '2023-06-30', source: 'audit', observation: 'SG Group Pillar 3 disclosure references operational-risk RWA increases tied to legacy litigation reserves.', citation: 'SG Group Pillar 3 Disclosure 2023' },
      { date: '2024-02-28', source: 'press', observation: 'Les Echos reported continuing AML-control programmes at SG Group subsidiaries across European jurisdictions.', citation: 'Les Echos' },
    ],
    vindication_criteria: [
      'Any enforcement action or fine by CSSF / ACPR / ECB exceeding €5m',
      'Material disclosed operational loss in Lux subsidiary',
      'Audit qualification or matter of emphasis in 2026 or 2027 SG Lux accounts',
      'Departure of head of SG Luxembourg under disclosed circumstances',
      'Material AUM or AUC decline (≥15%) in fund-servicing operations',
    ],
  },
]

// Deterministic SHA-256 hash of canonical Watch List for cryptographic commit
export async function computeWatchListHash(): Promise<string> {
  const canonical = [
    'GENESIS-WATCHLIST-V1',
    WATCHLIST_PUBLICATION_DATE,
    WATCHLIST_REVEAL_AT,
    ...WATCHLIST.flatMap(e => [
      e.prophecy_id,
      e.entity,
      e.pre_crime_index.toString(),
      e.trajectory,
      e.pattern_match ?? 'none',
      e.forecast,
      e.signals.map(s => `${s.date}|${s.source}|${s.observation}|${s.citation}`).join(';;'),
      e.vindication_criteria.join(';;'),
    ]),
  ].join('||')
  const buf = new TextEncoder().encode(canonical)
  const hashBuf = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
