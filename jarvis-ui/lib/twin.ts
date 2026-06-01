// Genesis Twin — Monte Carlo stress simulator for Book entities.
//
// For each (entity × scenario), runs 10,000 synthetic trajectories under
// the named stress and produces probability distributions of survival,
// expected loss, and time-to-collapse.
//
// The model is parameterized — robustness derives from entity PCI and
// category-specific resilience; scenario severity derives from a lookup
// table that captures how each stress type weighs on each category.
//
// All randomness is deterministic per entity_id so results are stable
// across page loads.

import type { BookEntry } from '@/lib/book'
import { BOOK_SNAPSHOT_ENTRIES } from '@/lib/book-snapshot'

export type ScenarioId =
  | 'rate_shock'
  | 'credit_crunch'
  | 'key_person_exit'
  | 'regulator_probe'
  | 'lp_redemption_wave'
  | 'counterparty_default'

export interface ScenarioMeta {
  id: ScenarioId
  label: string
  short: string
  description: string
  // How each category absorbs this scenario (higher = more vulnerable)
  vulnerability: Partial<Record<string, number>>
}

export const SCENARIOS: ScenarioMeta[] = [
  {
    id: 'rate_shock',
    label: 'Rate Shock',
    short: '+200bp instantaneous',
    description: 'Central-bank policy rate moves +200bp in a single decision window. AFS/HTM duration losses crystallise; deposit beta rises sharply.',
    vulnerability: { bank: 0.62, insurance: 0.55, real_estate: 0.70, asset_mgmt: 0.32, private_equity: 0.45, wealth: 0.28 },
  },
  {
    id: 'credit_crunch',
    label: 'Credit Crunch',
    short: 'Funding spreads +400bp',
    description: 'Interbank funding spreads widen 400bp; commercial paper market freezes for 30 days. Rolling-debt-dependent structures face refinancing stress.',
    vulnerability: { bank: 0.55, asset_mgmt: 0.40, private_equity: 0.62, real_estate: 0.60, insurance: 0.30, wealth: 0.25 },
  },
  {
    id: 'key_person_exit',
    label: 'Key-Person Exit',
    short: 'CIO/Founder departs',
    description: 'Chief Investment Officer or founder-CEO departs unexpectedly; key-person provisions in LP agreements may trigger redemption rights.',
    vulnerability: { asset_mgmt: 0.70, wealth: 0.65, private_equity: 0.75, bank: 0.20, insurance: 0.18, real_estate: 0.45 },
  },
  {
    id: 'regulator_probe',
    label: 'Regulator Probe',
    short: 'CSSF/BaFin formal inquiry',
    description: 'Lead supervisor opens a formal inquiry. Coverage in financial press triggers counterparty review and short-side activity.',
    vulnerability: { bank: 0.42, asset_mgmt: 0.50, insurance: 0.38, private_equity: 0.45, real_estate: 0.35, wealth: 0.32, depositary: 0.55 },
  },
  {
    id: 'lp_redemption_wave',
    label: 'LP Redemption Wave',
    short: '25% NAV redemption requests',
    description: '25% of net asset value redeemed in a single quarter. Soft and hard gates activate; portfolio liquidations occur at distressed marks.',
    vulnerability: { asset_mgmt: 0.72, private_equity: 0.30, wealth: 0.45, insurance: 0.15, bank: 0.10, real_estate: 0.60 },
  },
  {
    id: 'counterparty_default',
    label: 'Counterparty Default',
    short: 'Tier-1 counterparty insolvency',
    description: 'A tier-1 counterparty (top-5 by exposure) enters insolvency. Settlement and collateral processes invoke. Loss-given-default crystallises.',
    vulnerability: { bank: 0.65, asset_mgmt: 0.55, insurance: 0.42, private_equity: 0.50, depositary: 0.70, real_estate: 0.35, wealth: 0.40 },
  },
]

export interface TwinScenarioOutcome {
  scenario_id: ScenarioId
  survival_prob: number       // 0..1
  expected_loss_pct: number   // mean across all 10k trials (in % of NAV)
  p50_loss_pct: number
  p90_loss_pct: number
  months_to_collapse_p50: number | null  // null if survival is high
  histogram: number[]         // 10 bins of trial outcomes (% loss)
}

export interface TwinResult {
  prophecy_id: string
  entity: string
  category: string
  pre_crime_index: number
  outcomes: TwinScenarioOutcome[]
  aggregate_resilience: number  // 0..100 weighted average survival
  weakest_scenario_id: ScenarioId
}

// Mulberry32 PRNG seeded by string
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

// Sigmoid for survival
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

function simulateScenario(entity: BookEntry, scenario: ScenarioMeta, samples = 10000): TwinScenarioOutcome {
  const robustness = (100 - entity.pre_crime_index) / 100        // 0..1
  const vuln = scenario.vulnerability[entity.candidate.category] ?? 0.45

  // Survival probability per sample is sigmoid(robustness * 6 - vuln * 5).
  // Add per-sample noise.
  const seed = hashSeed(entity.prophecy_id + scenario.id)
  const r = rng(seed)

  let survivedCount = 0
  const losses: number[] = []
  const collapseMonths: number[] = []

  for (let i = 0; i < samples; i++) {
    const noise = (r() - 0.5) * 1.4  // gaussian-ish via PRNG; lightweight
    const score = robustness * 6 - vuln * 5 + noise
    const survive_prob = sigmoid(score)
    const survived = r() < survive_prob
    if (survived) {
      survivedCount++
      // Survivors still take a stress loss, drawn from a Beta-ish via PRNG
      const surviveLoss = Math.max(0, (r() * 0.4 - 0.1) * vuln * 100)
      losses.push(+surviveLoss.toFixed(1))
    } else {
      // Failed sample — loss draws from a higher distribution
      const failLoss = 30 + r() * 60 * vuln + (entity.pre_crime_index / 100) * 20
      losses.push(+Math.min(100, failLoss).toFixed(1))
      const months = Math.max(1, Math.floor(18 * (1 - vuln) + r() * 24))
      collapseMonths.push(months)
    }
  }

  const sortedLosses = [...losses].sort((a, b) => a - b)
  const sortedMonths = [...collapseMonths].sort((a, b) => a - b)

  const sum = sortedLosses.reduce((s, v) => s + v, 0)
  const expected_loss_pct = +(sum / samples).toFixed(1)
  const p50_loss_pct = sortedLosses[Math.floor(samples * 0.5)] ?? 0
  const p90_loss_pct = sortedLosses[Math.floor(samples * 0.9)] ?? 0
  const months_to_collapse_p50 = sortedMonths.length > 0 ? sortedMonths[Math.floor(sortedMonths.length * 0.5)] : null

  // Histogram: 10 bins of 0-10, 10-20, ..., 90-100% loss
  const histogram = new Array(10).fill(0)
  for (const l of losses) {
    const bin = Math.min(9, Math.floor(l / 10))
    histogram[bin]++
  }

  return {
    scenario_id: scenario.id,
    survival_prob: +(survivedCount / samples).toFixed(3),
    expected_loss_pct,
    p50_loss_pct,
    p90_loss_pct,
    months_to_collapse_p50,
    histogram,
  }
}

export function runTwin(entity: BookEntry, samples = 10000): TwinResult {
  const outcomes = SCENARIOS.map(s => simulateScenario(entity, s, samples))
  const aggregate_resilience = Math.round(
    outcomes.reduce((sum, o) => sum + o.survival_prob, 0) / outcomes.length * 100,
  )
  const weakest = outcomes.reduce((acc, o) => o.survival_prob < acc.survival_prob ? o : acc, outcomes[0])
  return {
    prophecy_id: entity.prophecy_id,
    entity: entity.candidate.name,
    category: entity.candidate.category,
    pre_crime_index: entity.pre_crime_index,
    outcomes,
    aggregate_resilience,
    weakest_scenario_id: weakest.scenario_id,
  }
}

export function getAllTwins(samples = 4000): TwinResult[] {
  // Use 4k samples for the index page (still statistically meaningful, faster build)
  return BOOK_SNAPSHOT_ENTRIES.map(e => runTwin(e, samples))
}

export function getTwin(prophecy_id: string, samples = 10000): TwinResult | null {
  const entity = BOOK_SNAPSHOT_ENTRIES.find(e => e.prophecy_id === prophecy_id)
  if (!entity) return null
  return runTwin(entity, samples)
}
