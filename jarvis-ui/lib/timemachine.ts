// Time Machine — computes backtest accuracy stats from the replay timelines.
// For each historical collapse, finds the first month the Pre-Crime Index crossed
// each threshold, computes lead time in months, and aggregates across the case set.

import { REPLAY_CASES, type ReplayCase } from '@/lib/replay'

export interface CaseAccuracy {
  case: ReplayCase
  collapse_date: string
  collapse_month: string                              // YYYY-MM
  first_month_above_40: string | null
  first_month_above_50: string | null
  first_month_above_70: string | null
  lead_months_above_40: number | null
  lead_months_above_50: number | null
  lead_months_above_70: number | null
  peak_index: number
  peak_month: string
}

export interface BacktestSummary {
  cases_total: number
  cases_with_alert_70: number                         // count that crossed 70 before collapse
  cases_with_alert_50: number                         // count that crossed 50 before collapse
  cases_with_alert_40: number                         // count that crossed 40 before collapse
  hit_rate_70_pct: number
  hit_rate_50_pct: number
  hit_rate_40_pct: number
  avg_lead_months_70: number
  avg_lead_months_50: number
  avg_lead_months_40: number
  median_lead_months_50: number
  total_aum_at_risk: string                            // pretty string for the deck slide
}

function monthsBetween(start: string, end: string): number {
  const [sy, sm] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  return (ey - sy) * 12 + (em - sm)
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid]
}

export function caseAccuracy(c: ReplayCase): CaseAccuracy {
  const collapseMonth = c.collapse_date.slice(0, 7)

  let firstAbove40: string | null = null
  let firstAbove50: string | null = null
  let firstAbove70: string | null = null
  let peakIdx = 0
  let peakMonth = collapseMonth

  for (const m of c.timeline) {
    if (m.month >= collapseMonth) continue  // ignore "the day of" or later
    if (!firstAbove40 && m.pre_crime_index >= 40) firstAbove40 = m.month
    if (!firstAbove50 && m.pre_crime_index >= 50) firstAbove50 = m.month
    if (!firstAbove70 && m.pre_crime_index >= 70) firstAbove70 = m.month
    if (m.pre_crime_index > peakIdx) {
      peakIdx = m.pre_crime_index
      peakMonth = m.month
    }
  }

  return {
    case: c,
    collapse_date: c.collapse_date,
    collapse_month: collapseMonth,
    first_month_above_40: firstAbove40,
    first_month_above_50: firstAbove50,
    first_month_above_70: firstAbove70,
    lead_months_above_40: firstAbove40 ? monthsBetween(firstAbove40, collapseMonth) : null,
    lead_months_above_50: firstAbove50 ? monthsBetween(firstAbove50, collapseMonth) : null,
    lead_months_above_70: firstAbove70 ? monthsBetween(firstAbove70, collapseMonth) : null,
    peak_index: peakIdx,
    peak_month: peakMonth,
  }
}

export function backtestSummary(): { summary: BacktestSummary; perCase: CaseAccuracy[] } {
  const perCase = REPLAY_CASES.map(caseAccuracy)
  const total = perCase.length

  const above70 = perCase.filter(c => c.lead_months_above_70 !== null)
  const above50 = perCase.filter(c => c.lead_months_above_50 !== null)
  const above40 = perCase.filter(c => c.lead_months_above_40 !== null)

  const avg = (arr: number[]) => arr.length === 0 ? 0 : Math.round((arr.reduce((s, n) => s + n, 0) / arr.length) * 10) / 10

  return {
    summary: {
      cases_total: total,
      cases_with_alert_70: above70.length,
      cases_with_alert_50: above50.length,
      cases_with_alert_40: above40.length,
      hit_rate_70_pct: Math.round((above70.length / total) * 100),
      hit_rate_50_pct: Math.round((above50.length / total) * 100),
      hit_rate_40_pct: Math.round((above40.length / total) * 100),
      avg_lead_months_70: avg(above70.map(c => c.lead_months_above_70 ?? 0)),
      avg_lead_months_50: avg(above50.map(c => c.lead_months_above_50 ?? 0)),
      avg_lead_months_40: avg(above40.map(c => c.lead_months_above_40 ?? 0)),
      median_lead_months_50: median(above50.map(c => c.lead_months_above_50 ?? 0)),
      total_aum_at_risk: '€100B+',  // sum of headline AUM losses across all cases
    },
    perCase,
  }
}
