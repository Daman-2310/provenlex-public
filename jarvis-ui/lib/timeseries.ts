// Time-series — 18 monthly Pre-Crime Index readings per entity.
// Deterministic random walk seeded by prophecy_id, anchored to end at the
// current score. Each point may carry an event marker (vindication / regulator filing).
//
// This is the "the system is alive" layer.

import { sha256Hex } from '@/lib/merkle'

export interface TimePoint {
  date: string                 // YYYY-MM
  pre_crime_index: number
  delta_from_prior: number     // points moved this month
  events: TimeEvent[]
}

export interface TimeEvent {
  kind: 'press' | 'regulator' | 'audit' | 'vindication' | 'governance' | 'market'
  label: string
}

export interface TimeSeries {
  prophecy_id: string
  current_score: number
  points: TimePoint[]
  high: { date: string; value: number }
  low: { date: string; value: number }
  trajectory: 'RISING' | 'FALLING' | 'HOLDING'
}

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

function monthString(yearsBack: number, monthsBack: number, fromYear: number, fromMonth: number): string {
  let y = fromYear
  let m = fromMonth - monthsBack - (yearsBack * 12)
  while (m < 1) { m += 12; y -= 1 }
  while (m > 12) { m -= 12; y += 1 }
  return `${y}-${m.toString().padStart(2, '0')}`
}

const EVENT_LIBRARY: TimeEvent[] = [
  { kind: 'press',      label: 'FT analyst note flags rising concentration risk' },
  { kind: 'press',      label: 'Reuters: quiet board reshuffle reported' },
  { kind: 'press',      label: 'Bloomberg: peer comparison surfaces in sector report' },
  { kind: 'regulator',  label: 'CSSF clarification letter on AIFMD Art.24 reporting' },
  { kind: 'regulator',  label: 'BaFin enforcement action against industry peer' },
  { kind: 'regulator',  label: 'ESMA Q&A update on liquidity stress' },
  { kind: 'regulator',  label: 'FCA Dear-CEO letter on operational resilience' },
  { kind: 'audit',      label: 'Annual audit completed without modification' },
  { kind: 'audit',      label: 'Interim review opinion qualified' },
  { kind: 'governance', label: 'Board independence ratio adjusted' },
  { kind: 'governance', label: 'CRO appointment announced' },
  { kind: 'market',     label: 'Sector volatility crosses 1.5σ baseline' },
  { kind: 'market',     label: 'EUR-base FX divergence flagged by FX Bot' },
]

export async function generateTimeSeries(opts: {
  prophecy_id: string
  current_score: number
  months?: number
}): Promise<TimeSeries> {
  const months = opts.months ?? 18
  const seed = await seedFromId(opts.prophecy_id)
  const rng = mulberry32(seed)

  const now = new Date()
  const points: TimePoint[] = []
  let value = Math.max(15, opts.current_score - 20 + Math.round((rng() - 0.5) * 14))
  let prev = value

  for (let i = months - 1; i >= 0; i--) {
    const date = monthString(0, i, now.getUTCFullYear(), now.getUTCMonth() + 1)
    // Random walk biased toward the current score as we approach now
    const pull = (opts.current_score - value) / Math.max(1, i + 1)
    const noise = (rng() - 0.5) * 14
    const delta = pull + noise
    value = Math.max(5, Math.min(95, Math.round(value + delta)))
    const events: TimeEvent[] = []
    if (rng() < 0.18) events.push(EVENT_LIBRARY[Math.floor(rng() * EVENT_LIBRARY.length)])
    points.push({ date, pre_crime_index: value, delta_from_prior: value - prev, events })
    prev = value
  }

  // Force the last point to match the current score for narrative consistency
  if (points.length > 0) {
    const last = points[points.length - 1]
    last.delta_from_prior = opts.current_score - (points.length > 1 ? points[points.length - 2].pre_crime_index : last.pre_crime_index)
    last.pre_crime_index = opts.current_score
  }

  const high = points.reduce((acc, p) => p.pre_crime_index > acc.value ? { date: p.date, value: p.pre_crime_index } : acc, { date: points[0].date, value: points[0].pre_crime_index })
  const low  = points.reduce((acc, p) => p.pre_crime_index < acc.value ? { date: p.date, value: p.pre_crime_index } : acc, { date: points[0].date, value: points[0].pre_crime_index })

  const first = points[0].pre_crime_index
  const last  = points[points.length - 1].pre_crime_index
  const drift = last - first
  const trajectory: TimeSeries['trajectory'] = drift >= 5 ? 'RISING' : drift <= -5 ? 'FALLING' : 'HOLDING'

  return {
    prophecy_id: opts.prophecy_id,
    current_score: opts.current_score,
    points,
    high,
    low,
    trajectory,
  }
}
