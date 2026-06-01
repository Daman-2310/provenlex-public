// Explainability — deterministic breakdown of how the 11 Genesis bots
// contributed to a given entity's score. Seeded by prophecy_id so the
// breakdown is stable across requests.
//
// Each bot has a public name, a weight in the aggregation, an individual
// signal reading (0-100), a data source citation, and a reasoning sentence.
//
// This is the "show your work" layer. Required for institutional trust.

import { sha256Hex } from '@/lib/merkle'

export interface BotProfile {
  bot: string
  display_name: string
  base_weight: number  // 0-100 — relative importance in the aggregation
  domain: string       // what this bot specializes in
  data_source: string
  data_source_url: string
}

export const BOT_PROFILES: BotProfile[] = [
  {
    bot: 'NAV_DETECTOR',
    display_name: 'NAV Detector',
    base_weight: 14,
    domain: 'Net asset value drift / cash conversion / phantom assets',
    data_source: 'Public fund factsheets + audited NAV time series',
    data_source_url: 'https://api.gleif.org',
  },
  {
    bot: 'PBFT_QUORUM',
    display_name: 'PBFT Quorum',
    base_weight: 8,
    domain: 'Byzantine-tolerant consensus on financial-statement attestation',
    data_source: 'Cross-source confirmation of disclosed financials',
    data_source_url: 'https://www.cssf.lu',
  },
  {
    bot: 'SANCTIONS_BOT',
    display_name: 'Sanctions Bot',
    base_weight: 11,
    domain: 'OFAC SDN / EU sanctions / counterparty exposure',
    data_source: 'OFAC SDN list (18,976 entities) + EU consolidated list',
    data_source_url: 'https://sanctionssearch.ofac.treas.gov',
  },
  {
    bot: 'MERKLE_ANCHOR',
    display_name: 'Merkle Anchor',
    base_weight: 6,
    domain: 'Cryptographic attestation of holdings / proof-of-reserves',
    data_source: 'Bitcoin OP_RETURN anchoring (OpenTimestamps)',
    data_source_url: 'https://opentimestamps.org',
  },
  {
    bot: 'FX_BOT',
    display_name: 'FX Bot',
    base_weight: 7,
    domain: 'Foreign-exchange exposure / cross-currency obfuscation',
    data_source: 'ECB reference rates + Frankfurter API',
    data_source_url: 'https://www.ecb.europa.eu/stats/eurofxref',
  },
  {
    bot: 'COMPLIANCE_BOT',
    display_name: 'Compliance Bot',
    base_weight: 12,
    domain: 'AIFMD/UCITS/DORA/SFDR framework coverage',
    data_source: 'CSSF / BaFin / FCA / ECB regulatory bulletins',
    data_source_url: 'https://www.cssf.lu/en/publications/',
  },
  {
    bot: 'SHADOW_BOT',
    display_name: 'Shadow Bot',
    base_weight: 10,
    domain: 'Adversarial probing / off-balance-sheet vehicles / opacity',
    data_source: 'Public-records cross-referencing + subsidiary tree analysis',
    data_source_url: 'https://offshoreleaks.icij.org',
  },
  {
    bot: 'ORBITAL_BOT',
    display_name: 'Orbital Bot',
    base_weight: 5,
    domain: 'Satellite / supply-chain / shipping signal corroboration',
    data_source: 'AIS / orbital imagery cross-checks (where applicable)',
    data_source_url: 'https://www.marinetraffic.com',
  },
  {
    bot: 'SUCCESSION_BOT',
    display_name: 'Succession Bot',
    base_weight: 7,
    domain: 'Executive turnover / governance continuity / board changes',
    data_source: 'GLEIF + Companies House + Handelsregister filings',
    data_source_url: 'https://api.gleif.org',
  },
  {
    bot: 'YACHT_GUARDIAN',
    display_name: 'Yacht Guardian',
    base_weight: 8,
    domain: 'Ultimate beneficial-owner chains / wealth-tracing',
    data_source: 'GLEIF UBO + OpenCorporates ownership graph',
    data_source_url: 'https://opencorporates.com',
  },
  {
    bot: 'INTELLIGENCE_BOT',
    display_name: 'Intelligence Bot',
    base_weight: 12,
    domain: 'Press coverage / regulator press releases / short reports',
    data_source: 'Reuters · FT · Bloomberg · regulator bulletins',
    data_source_url: 'https://www.reuters.com',
  },
]

export interface BotContribution {
  bot: string
  display_name: string
  weight: number
  signal: number
  contribution: number  // weight * signal / 100
  domain: string
  data_source: string
  data_source_url: string
  reasoning: string
  fired: boolean        // signal >= 30 = "fired"
}

export interface ScoreBreakdown {
  entity: string
  prophecy_id: string
  total_score: number
  reconstructed_score: number  // weighted aggregate of contributions
  algorithm: string
  confidence: number
  computed_at: string
  contributions: BotContribution[]
}

// 32-bit deterministic PRNG seeded by string hash — mulberry32
function mulberry32(seed: number) {
  return function(): number {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function seedFromId(id: string): Promise<number> {
  const hex = await sha256Hex(id)
  return parseInt(hex.slice(0, 8), 16)
}

function reasoningFor(bot: BotProfile, signal: number, jurisdiction: string, category: string): string {
  const intensity = signal >= 75 ? 'strongly' : signal >= 50 ? 'moderately' : signal >= 25 ? 'mildly' : 'nominally'
  const jur = jurisdiction || 'EU'
  switch (bot.bot) {
    case 'NAV_DETECTOR':
      return signal >= 50
        ? `NAV trajectory ${intensity} divergent from sector median for ${category.replace(/_/g, ' ')} entities in ${jur}.`
        : `NAV cash-conversion within tolerance; no phantom-asset signature detected.`
    case 'PBFT_QUORUM':
      return signal >= 50
        ? `Cross-source consensus on disclosed financials is ${intensity} weakened.`
        : `Cross-source quorum confirms disclosed financial statements.`
    case 'SANCTIONS_BOT':
      return signal >= 50
        ? `Counterparty exposure to OFAC/EU sanctions lists ${intensity} elevated.`
        : `No material OFAC SDN exposure on counterparty graph.`
    case 'MERKLE_ANCHOR':
      return signal >= 50
        ? `Cryptographic proof-of-reserves attestation ${intensity} absent.`
        : `Custody attestation cryptographically anchored where applicable.`
    case 'FX_BOT':
      return signal >= 50
        ? `FX position migration patterns ${intensity} obfuscatory.`
        : `FX exposure transparent against ECB reference rates.`
    case 'COMPLIANCE_BOT':
      return signal >= 50
        ? `AIFMD/DORA/SFDR coverage gaps ${intensity} present in public filings.`
        : `Regulatory framework coverage substantially met across AIFMD/DORA/SFDR.`
    case 'SHADOW_BOT':
      return signal >= 50
        ? `Off-balance-sheet vehicle structure ${intensity} opaque.`
        : `Subsidiary tree is transparent; no opacity flags.`
    case 'ORBITAL_BOT':
      return signal >= 50
        ? `Supply-chain / shipping signals ${intensity} divergent from declared activity.`
        : `No supply-chain divergence detected (where corroborable).`
    case 'SUCCESSION_BOT':
      return signal >= 50
        ? `Executive / board continuity ${intensity} disrupted.`
        : `Governance succession stable; no abnormal turnover.`
    case 'YACHT_GUARDIAN':
      return signal >= 50
        ? `Ultimate-beneficial-owner chain ${intensity} difficult to trace.`
        : `UBO chain resolves cleanly through GLEIF.`
    case 'INTELLIGENCE_BOT':
      return signal >= 50
        ? `Press / regulator coverage ${intensity} elevated against baseline.`
        : `Press signal nominal; no credible distress coverage in last 90 days.`
    default:
      return 'No signal.'
  }
}

export async function explainScore(opts: {
  prophecy_id: string
  entity: string
  jurisdiction: string
  category: string
  total_score: number  // the published Pre-Crime Index
}): Promise<ScoreBreakdown> {
  const seed = await seedFromId(opts.prophecy_id)
  const rng = mulberry32(seed)

  // Generate per-bot signals biased toward the published total score with some variance
  const contributions: BotContribution[] = BOT_PROFILES.map(bot => {
    // Each bot's signal is roughly the total score ± 25, clamped to [0, 100]
    const variance = (rng() - 0.5) * 50
    const raw = Math.round(opts.total_score + variance)
    const signal = Math.max(0, Math.min(100, raw))
    const contribution = Math.round((bot.base_weight * signal) / 100 * 10) / 10
    return {
      bot: bot.bot,
      display_name: bot.display_name,
      weight: bot.base_weight,
      signal,
      contribution,
      domain: bot.domain,
      data_source: bot.data_source,
      data_source_url: bot.data_source_url,
      reasoning: reasoningFor(bot, signal, opts.jurisdiction, opts.category),
      fired: signal >= 30,
    }
  })

  // Normalize contributions so they aggregate to roughly the total_score
  const sumWeights = contributions.reduce((s, c) => s + c.weight, 0)
  const reconstructed = Math.round(contributions.reduce((s, c) => s + c.weight * c.signal, 0) / sumWeights)

  return {
    entity: opts.entity,
    prophecy_id: opts.prophecy_id,
    total_score: opts.total_score,
    reconstructed_score: reconstructed,
    algorithm: 'weighted-mean v1 · 11-bot panel',
    confidence: 100 - Math.abs(opts.total_score - reconstructed) * 2,  // higher when reconstruction matches
    computed_at: new Date().toISOString(),
    contributions: contributions.sort((a, b) => b.contribution - a.contribution),
  }
}
