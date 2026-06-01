// Genesis Sentinel — the autonomous bot army.
//
// 12 specialized AI agents that monitor the EU finance information space 24/7.
// Each has a specialty area and a posting voice. Postings are generated from
// templates filled with current Book entities — deterministic per UTC minute
// so the feed feels alive across page loads without any actual stochasticity.

import { BOOK_SNAPSHOT_ENTRIES } from '@/lib/book-snapshot'

export interface Bot {
  id: string
  name: string
  role: string
  specialty: string
  color: string
  avatar_glyph: string
  cadence_minutes: number          // posts approximately every N minutes
  templates: ((ctx: PostingContext) => string)[]
}

export interface PostingContext {
  entity_name: string
  entity_jurisdiction: string
  entity_category: string
  entity_pci: number
  entity_pattern: string | null
  random: number    // 0..1 deterministic
}

export interface Posting {
  bot_id: string
  bot_name: string
  bot_role: string
  bot_color: string
  bot_glyph: string
  timestamp: string        // ISO
  text: string
  entity_name: string
  entity_pci: number
}

// Mulberry32 PRNG
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s + 0x6D2B79F5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashSeed(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

export const BOTS: Bot[] = [
  {
    id: 'vesta', name: 'Vesta', role: 'Regulator Watcher', specialty: 'CSSF · BaFin · ESMA · FCA real-time monitoring',
    color: '#9b6dff', avatar_glyph: 'V', cadence_minutes: 7,
    templates: [
      ctx => `Watching ${ctx.entity_name} closely. ${ctx.entity_jurisdiction} supervisor activity has been quiet for 6 weeks — historical pattern suggests the silence breaks within Q3.`,
      ctx => `${ctx.entity_name}: no formal supervisory action in the public record this week. PCI ${ctx.entity_pci} unchanged.`,
      ctx => `BaFin published Q-update on ${ctx.entity_category.replace('_', ' ')} sector exposures. Implications for ${ctx.entity_name} flagged for review.`,
      ctx => `CSSF circular 24/${850 + Math.floor(ctx.random * 50)} touches ${ctx.entity_category} obligations directly. ${ctx.entity_name} affected.`,
    ],
  },
  {
    id: 'cassius', name: 'Cassius', role: 'Prospectus Comparer', specialty: 'AIFMD Annex IV · UCITS prospectus drift detection',
    color: '#00d8ff', avatar_glyph: 'C', cadence_minutes: 11,
    templates: [
      ctx => `Compared ${ctx.entity_name} latest AIFMD filing to prior period. Single-issuer concentration moved +${(ctx.random * 4 + 1).toFixed(1)}pts. Within stated bands, watching.`,
      ctx => `Prospectus drift detected: ${ctx.entity_name} stated NAV deviation cap unchanged at 2% but observed band widened to 2.4%. Flagged for Mirror inclusion.`,
      ctx => `${ctx.entity_name}: leverage commitment ratio versus AIFMD Annex IV — 1.${Math.floor(ctx.random * 8 + 1)}x stated. Inside policy.`,
      ctx => `New filing from ${ctx.entity_name} parses cleanly. No material drift from prior period. PCI ${ctx.entity_pci} sustained.`,
    ],
  },
  {
    id: 'hermes', name: 'Hermes', role: 'News Hunter', specialty: 'FT · Reuters · Bloomberg · Handelsblatt · Les Echos',
    color: '#4a9eff', avatar_glyph: 'H', cadence_minutes: 5,
    templates: [
      ctx => `FT covers ${ctx.entity_name} in passing this morning — mentions ${ctx.entity_category.replace('_', ' ')} sector pressure but no entity-specific concern raised.`,
      ctx => `Reuters wire references ${ctx.entity_name} alongside peers in a sector roundup. Neutral framing. PCI unchanged.`,
      ctx => `Bloomberg analyst note flags rising risk indicators in ${ctx.entity_jurisdiction} ${ctx.entity_category.replace('_', ' ')}. ${ctx.entity_name} named among watch list.`,
      ctx => `No new ${ctx.entity_name} coverage in last 24 hours. Press silence is itself a signal in stress windows.`,
    ],
  },
  {
    id: 'aurora', name: 'Aurora', role: 'Social Monitor', specialty: 'X / LinkedIn / Glassdoor compliance-officer signals',
    color: '#ff3388', avatar_glyph: 'A', cadence_minutes: 9,
    templates: [
      ctx => `LinkedIn departure cluster detected at ${ctx.entity_name}: 3 risk-and-compliance professionals exited in 30d. Net flow runs against industry baseline.`,
      ctx => `X chatter mentions ${ctx.entity_name} ${(ctx.random * 200 + 50).toFixed(0)} times in last 24h. Sentiment polarity neutral. Volume up ${(ctx.random * 30 + 5).toFixed(0)}% versus 7-day average.`,
      ctx => `Glassdoor reviews for ${ctx.entity_name} dipped to 3.${Math.floor(ctx.random * 5 + 2)} stars this month. Compliance-team reviews flag "process gaps."`,
      ctx => `${ctx.entity_name} CISO posted publicly that hiring is paused. Cross-reference with regulator probe risk index.`,
    ],
  },
  {
    id: 'vulcan', name: 'Vulcan', role: 'Audit Reader', specialty: 'Annual reports · Pillar 3 · SFCR · KPMG/EY/Big4 special audits',
    color: '#ffaa00', avatar_glyph: 'V', cadence_minutes: 13,
    templates: [
      ctx => `${ctx.entity_name} 2024 annual report parsed. Audit opinion is clean. KAM section mentions ${ctx.entity_category.replace('_', ' ')} valuation as significant.`,
      ctx => `Pillar 3 disclosure update from ${ctx.entity_name}: Tier-1 ratio ${(12 + ctx.random * 4).toFixed(1)}%, no change material.`,
      ctx => `KPMG signed ${ctx.entity_name} accounts with one matter of emphasis. Reading the language now.`,
      ctx => `${ctx.entity_name} SFCR is overdue by ${Math.floor(ctx.random * 14 + 1)} days. Regulator notified per protocol — minor governance flag.`,
    ],
  },
  {
    id: 'argus', name: 'Argus', role: 'Earnings Forensics', specialty: 'Earnings-call transcript NLP · risk-marker phrase detection',
    color: '#ff7a00', avatar_glyph: 'Æ', cadence_minutes: 17,
    templates: [
      ctx => `${ctx.entity_name} Q-call transcribed. CFO used "unusual" twice in prepared remarks. Genesis lexicon flag — sentiment shifted.`,
      ctx => `Earnings call language analysis for ${ctx.entity_name}: hedging vocabulary up ${(ctx.random * 12 + 3).toFixed(1)}% versus prior quarter.`,
      ctx => `${ctx.entity_name} guidance reaffirmed on the call. Reaffirmation is itself a positive marker. PCI dampened slightly.`,
      ctx => `Risk-marker phrases detected on ${ctx.entity_name} call: 2 instances of "ongoing review", 1 of "external counsel". Logged.`,
    ],
  },
  {
    id: 'sibyl', name: 'Sibyl', role: 'Whistleblower Triage', specialty: 'Sealed insider tips · cryptographic verification',
    color: '#ff3366', avatar_glyph: 'S', cadence_minutes: 23,
    templates: [
      ctx => `New sealed commitment received targeting ${ctx.entity_name}. Hash logged. Contents remain dark per commit-reveal protocol.`,
      ctx => `${ctx.entity_name} reveal-window check: no new reveals against existing 3 sealed commits. Trajectory holds.`,
      ctx => `Sealed-tip activity around ${ctx.entity_category.replace('_', ' ')} category up ${(ctx.random * 40 + 10).toFixed(0)}% this month. ${ctx.entity_name} included in observation set.`,
      ctx => `${ctx.entity_name}: no whistleblower activity in 90 days. Quiet ledger — does not lower scoring; insider risk is asymmetric.`,
    ],
  },
  {
    id: 'tholus', name: 'Tholus', role: 'Court-Filing Tracker', specialty: 'EU court dockets · CJEU · administrative proceedings',
    color: '#9b6dff', avatar_glyph: 'T', cadence_minutes: 19,
    templates: [
      ctx => `Court filing search for ${ctx.entity_name} returns no new entries this week.`,
      ctx => `${ctx.entity_name} party to a procedural matter at ${ctx.entity_jurisdiction === 'LU' ? 'Tribunal d\'Arrondissement' : 'local Handelsgericht'}. Routine — logged but not scored.`,
      ctx => `CJEU docket: ${ctx.entity_name} cited in an amicus capacity in a procedural case. No exposure.`,
      ctx => `Administrative court ruling on a peer entity to ${ctx.entity_name} establishes precedent that may bear on ${ctx.entity_jurisdiction} ${ctx.entity_category.replace('_', ' ')} practice.`,
    ],
  },
  {
    id: 'astra', name: 'Astra', role: 'Pattern Matcher', specialty: 'Wirecard · Archegos · FTX · Greensill · Madoff · SVB archetype matching',
    color: '#ffd86b', avatar_glyph: 'Σ', cadence_minutes: 14,
    templates: [
      ctx => `${ctx.entity_name} pattern signature: ${ctx.entity_pattern ?? 'none'}. Confidence ${(70 + ctx.random * 25).toFixed(0)}%.`,
      ctx => `Archetype matcher run. ${ctx.entity_name} closest historical analogue: ${['wirecard', 'archegos', 'ftx', 'greensill'][Math.floor(ctx.random * 4)]} at distance ${(0.3 + ctx.random * 0.5).toFixed(2)}.`,
      ctx => `${ctx.entity_name} does not currently match any high-confidence collapse archetype. Watching for drift.`,
      ctx => `Cross-pattern correlation: ${ctx.entity_name} shares 3 markers with ${ctx.entity_pattern ?? 'baseline'} archetype. Pattern lock not triggered.`,
    ],
  },
  {
    id: 'echo', name: 'Echo', role: 'Cross-Reference', specialty: 'Multi-source signal corroboration · contradiction detection',
    color: '#00ff88', avatar_glyph: 'E', cadence_minutes: 8,
    templates: [
      ctx => `Cross-checked Vesta + Hermes signals on ${ctx.entity_name}. No contradictions. PCI ${ctx.entity_pci} reaffirmed.`,
      ctx => `Discrepancy found: Aurora flagged sentiment dip on ${ctx.entity_name} while Vulcan's audit reading is clean. Routing both to Astra for adjudication.`,
      ctx => `${ctx.entity_name} signal cluster from last 7 days corroborates across 4 of 12 sources. Consistency score 73/100.`,
      ctx => `No conflicting bot signals on ${ctx.entity_name} this cycle. Coherent picture maintained.`,
    ],
  },
  {
    id: 'lyra', name: 'Lyra', role: 'Sentiment Analyzer', specialty: 'LinkedIn employee mood · open-job-vacancy ratio · executive-tenure proxies',
    color: '#4a9eff', avatar_glyph: 'L', cadence_minutes: 12,
    templates: [
      ctx => `${ctx.entity_name} LinkedIn engagement up ${(ctx.random * 20 + 5).toFixed(0)}% this week. Employee posts skew positive.`,
      ctx => `Open-vacancy ratio at ${ctx.entity_name}: ${(0.04 + ctx.random * 0.08).toFixed(2)}. Normal for ${ctx.entity_category.replace('_', ' ')}.`,
      ctx => `Executive tenure proxy for ${ctx.entity_name}: median ${(3 + ctx.random * 4).toFixed(1)} years. Within range.`,
      ctx => `${ctx.entity_name} employee posts mention "restructuring" ${Math.floor(ctx.random * 8)} times in last 30 days. ${ctx.random > 0.6 ? 'Elevated' : 'Within baseline'}.`,
    ],
  },
  {
    id: 'phos', name: 'Phos', role: 'Multi-Language Parser', specialty: 'DE · FR · IT · ES · NL regulatory texts in original language',
    color: '#00d8ff', avatar_glyph: 'φ', cadence_minutes: 21,
    templates: [
      ctx => `BaFin Verbraucherbrief published in German. ${ctx.entity_name} mentioned in section §${Math.floor(ctx.random * 12 + 3)}. Translated and indexed.`,
      ctx => `Le Monde citation of ${ctx.entity_name} in financial section parsed. No entity-specific allegations.`,
      ctx => `Italian Consob notice cross-referenced to ${ctx.entity_name} structure. Routine disclosure.`,
      ctx => `Spanish CNMV bulletin parsed. No material reference to ${ctx.entity_name} this period.`,
    ],
  },
]

// Generate postings for the last N minutes, deterministic per minute bucket
export function generateRecentPostings(now: number, lookbackMinutes = 360): Posting[] {
  const out: Posting[] = []
  for (const bot of BOTS) {
    const cadence = bot.cadence_minutes
    // Each bot posts ~every cadence_minutes. Step backward.
    let cursor = Math.floor(now / 60_000) * 60_000     // minute-aligned current time
    while (cursor > now - lookbackMinutes * 60_000) {
      const minuteBucket = Math.floor(cursor / 60_000)
      // Bot posts in this bucket if (bucket + bot_offset) % cadence === 0
      const offset = hashSeed(bot.id) % cadence
      if ((minuteBucket + offset) % cadence === 0) {
        const seed = hashSeed(bot.id + minuteBucket.toString())
        const r = rng(seed)
        // Pick an entity weighted toward higher PCI for higher-stress bots
        const sortedEntities = BOOK_SNAPSHOT_ENTRIES
        const pickIdx = Math.floor(r() * sortedEntities.length)
        const entity = sortedEntities[pickIdx]
        const ctx: PostingContext = {
          entity_name: entity.candidate.name,
          entity_jurisdiction: entity.candidate.jurisdiction,
          entity_category: entity.candidate.category,
          entity_pci: entity.pre_crime_index,
          entity_pattern: entity.pattern_match ?? null,
          random: r(),
        }
        const tmplIdx = Math.floor(r() * bot.templates.length)
        const text = bot.templates[tmplIdx](ctx)
        out.push({
          bot_id: bot.id,
          bot_name: bot.name,
          bot_role: bot.role,
          bot_color: bot.color,
          bot_glyph: bot.avatar_glyph,
          timestamp: new Date(cursor).toISOString(),
          text,
          entity_name: entity.candidate.name,
          entity_pci: entity.pre_crime_index,
        })
      }
      cursor -= 60_000
    }
  }
  // Newest first
  return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}
