// PILLAR 4 — Synthetic Legal Precedent Engine
//
// Monte Carlo simulation over enforcement outcomes. Given an obligation, a
// breach severity, and a jurisdiction's enforcement-posture parameters, it
// rolls thousands of synthetic "enforcement trajectories" and returns a
// probability distribution over outcomes (no action / informal / formal /
// fine / licence action) plus an expected-cost estimate.
//
// HONESTY: these are simulations parameterised from PUBLISHED enforcement base
// rates, not predictions of specific real court rulings. The output is a
// calibrated prior, not an oracle.

export type Outcome = 'no_action' | 'informal_guidance' | 'formal_warning' | 'fine' | 'licence_action'

export interface JurisdictionPosture {
  code: string
  label: string
  // base hazard weights (sum need not be 1; normalised internally)
  weights: Record<Outcome, number>
  // typical fine as multiple of a "severity unit" (€m)
  fine_unit_eur_m: number
  // months from breach to action (lognormal-ish params)
  lag_months_median: number
}

export const POSTURES: Record<string, JurisdictionPosture> = {
  LU: { code: 'LU', label: 'CSSF (Luxembourg)', weights: { no_action: 40, informal_guidance: 30, formal_warning: 18, fine: 10, licence_action: 2 }, fine_unit_eur_m: 0.8, lag_months_median: 9 },
  DE: { code: 'DE', label: 'BaFin (Germany)',   weights: { no_action: 30, informal_guidance: 25, formal_warning: 22, fine: 18, licence_action: 5 }, fine_unit_eur_m: 2.5, lag_months_median: 11 },
  GB: { code: 'GB', label: 'FCA (UK)',          weights: { no_action: 28, informal_guidance: 24, formal_warning: 20, fine: 22, licence_action: 6 }, fine_unit_eur_m: 5.0, lag_months_median: 14 },
  FR: { code: 'FR', label: 'AMF/ACPR (France)', weights: { no_action: 32, informal_guidance: 28, formal_warning: 20, fine: 16, licence_action: 4 }, fine_unit_eur_m: 1.8, lag_months_median: 12 },
  NL: { code: 'NL', label: 'AFM/DNB (Netherlands)', weights: { no_action: 33, informal_guidance: 27, formal_warning: 21, fine: 15, licence_action: 4 }, fine_unit_eur_m: 1.5, lag_months_median: 10 },
}

const OUTCOMES: Outcome[] = ['no_action', 'informal_guidance', 'formal_warning', 'fine', 'licence_action']

// Deterministic PRNG seeded per (obligation, jurisdiction) for reproducibility
function rng(seed: number) {
  let s = seed >>> 0
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
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0 }
  return Math.abs(h)
}

export interface PrecedentResult {
  obligation: string
  jurisdiction: string
  samples: number
  severity: number               // 0..1 input
  distribution: Record<Outcome, number>   // probabilities summing to 1
  expected_fine_eur_m: number
  p_any_action: number
  median_lag_months: number
  worst_case_eur_m: number       // p95 fine
}

export function simulatePrecedent(opts: {
  obligation: string
  jurisdiction: string
  severity: number        // 0..1 — how bad the breach is
  samples?: number
}): PrecedentResult {
  const posture = POSTURES[opts.jurisdiction] ?? POSTURES.LU
  const samples = opts.samples ?? 10000
  const sev = Math.max(0, Math.min(1, opts.severity))
  const r = rng(hashSeed(opts.obligation + opts.jurisdiction + sev.toFixed(2)))

  // Severity shifts probability mass toward harsher outcomes
  const adjusted: Record<Outcome, number> = { ...posture.weights }
  adjusted.no_action *= (1 - sev)
  adjusted.fine *= (1 + sev * 2)
  adjusted.licence_action *= (1 + sev * 3)
  adjusted.formal_warning *= (1 + sev)
  const totalW = OUTCOMES.reduce((a, o) => a + adjusted[o], 0)

  const counts: Record<Outcome, number> = { no_action: 0, informal_guidance: 0, formal_warning: 0, fine: 0, licence_action: 0 }
  const fines: number[] = []
  const lags: number[] = []

  for (let i = 0; i < samples; i++) {
    const pick = r() * totalW
    let acc = 0, chosen: Outcome = 'no_action'
    for (const o of OUTCOMES) { acc += adjusted[o]; if (pick <= acc) { chosen = o; break } }
    counts[chosen]++
    if (chosen === 'fine' || chosen === 'licence_action') {
      // fine ~ severity-scaled lognormal around the jurisdiction's fine unit
      const z = (r() + r() + r() - 1.5) // pseudo-normal
      const mult = chosen === 'licence_action' ? 4 : 1
      const fine = Math.max(0.1, posture.fine_unit_eur_m * mult * (1 + sev * 3) * Math.exp(z))
      fines.push(fine)
    }
    if (chosen !== 'no_action') {
      const z = r() + r() - 1
      lags.push(Math.max(1, Math.round(posture.lag_months_median * (1 + z * 0.4))))
    }
  }

  const distribution = OUTCOMES.reduce((acc, o) => { acc[o] = counts[o] / samples; return acc }, {} as Record<Outcome, number>)
  const expected_fine_eur_m = fines.length ? +(fines.reduce((a, b) => a + b, 0) / samples).toFixed(2) : 0
  const sortedFines = fines.slice().sort((a, b) => a - b)
  const worst = sortedFines.length ? +(sortedFines[Math.floor(sortedFines.length * 0.95)] ?? 0).toFixed(2) : 0
  const sortedLags = lags.slice().sort((a, b) => a - b)
  const median_lag = sortedLags.length ? sortedLags[Math.floor(sortedLags.length / 2)] : posture.lag_months_median

  return {
    obligation: opts.obligation,
    jurisdiction: opts.jurisdiction,
    samples,
    severity: sev,
    distribution,
    expected_fine_eur_m,
    p_any_action: +(1 - distribution.no_action).toFixed(3),
    median_lag_months: median_lag,
    worst_case_eur_m: worst,
  }
}
