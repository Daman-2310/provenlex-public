// PILLAR 2 — Autonomous Red-Teaming Simulation
//
// Continuous offensive search for state vectors that FALSIFY a compliance
// rulebook while staying "plausible" (within bounded perturbations of a known-
// good baseline). It's a bounded adversarial optimiser: mutate the state along
// each rule's threshold boundary and report the minimal perturbation that flips
// the verdict — i.e. how close the company is to a breach, and via which field.
//
// This auto-discovers the brittle edges of a rulebook the same way fuzzing
// finds crashes. Output: ranked "attack vectors" + suggested rule hardening.

import { compileRulebook, type Rule, type Verdict, type AtomicRule } from './code-to-law'

export interface AttackVector {
  field: string
  baseline_value: number
  breaking_value: number
  delta: number
  delta_pct: number
  rule_id: string
  severity: string
  technique: string
  patch_suggestion: string
}

export interface RedTeamReport {
  baseline_compliant: boolean
  attacks_attempted: number
  breaches_found: number
  vectors: AttackVector[]
  margin_score: number   // 0-100; higher = more robust (further from any breach)
}

function collectAtomic(rules: Rule[]): AtomicRule[] {
  const out: AtomicRule[] = []
  for (const r of rules) {
    if ('combinator' in r) out.push(...collectAtomic(r.rules))
    else out.push(r)
  }
  return out
}

function getPath(state: Record<string, unknown>, path: string): number | undefined {
  const v = path.split('.').reduce<unknown>((a, k) => (a && typeof a === 'object' ? (a as Record<string, unknown>)[k] : undefined), state)
  return typeof v === 'number' ? v : undefined
}
function setPath(state: Record<string, unknown>, path: string, value: number): Record<string, unknown> {
  const clone = structuredClone(state)
  const keys = path.split('.')
  let cur: Record<string, unknown> = clone
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] = (cur[keys[i]] && typeof cur[keys[i]] === 'object') ? { ...(cur[keys[i]] as object) } : {}
    cur = cur[keys[i]] as Record<string, unknown>
  }
  cur[keys[keys.length - 1]] = value
  return clone
}

export async function redTeam(rulebook: Rule[], baseline: Record<string, unknown>, opts?: { steps?: number }): Promise<RedTeamReport> {
  const evaluate = compileRulebook(rulebook)
  const base: Verdict = await evaluate(baseline)
  const atomics = collectAtomic(rulebook).filter(a => typeof a.value === 'number' && ['>=', '<=', '>', '<'].includes(a.op))
  const steps = opts?.steps ?? 200
  const vectors: AttackVector[] = []
  let attempts = 0

  for (const rule of atomics) {
    const baseVal = getPath(baseline, rule.field)
    if (baseVal === undefined) continue
    const threshold = rule.value as number

    // Binary-search the minimal perturbation toward the threshold that flips the verdict.
    // Direction: for '>=' / '>' we push DOWN toward threshold; for '<=' / '<' push UP.
    const pushDown = rule.op === '>=' || rule.op === '>'
    let lo = baseVal
    let hi = pushDown ? threshold - Math.abs(threshold) - 1 : threshold + Math.abs(threshold) + 1
    let breaking: number | null = null

    for (let i = 0; i < steps; i++) {
      attempts++
      const mid = (lo + hi) / 2
      const mutated = setPath(baseline, rule.field, mid)
      const v = await evaluate(mutated)
      if (!v.compliant) {
        breaking = mid
        lo = mid   // tighten toward baseline to find MINIMAL break
      } else {
        hi = mid
      }
      if (Math.abs(hi - lo) < 1e-4) break
    }

    if (breaking !== null) {
      const delta = breaking - baseVal
      vectors.push({
        field: rule.field,
        baseline_value: baseVal,
        breaking_value: +breaking.toFixed(4),
        delta: +delta.toFixed(4),
        delta_pct: +((delta / (baseVal || 1)) * 100).toFixed(2),
        rule_id: rule.id,
        severity: rule.severity ?? 'minor',
        technique: pushDown ? 'threshold_erosion_down' : 'threshold_erosion_up',
        patch_suggestion: `Add a buffer band: alert at ${pushDown ? (threshold * 1.05).toFixed(2) : (threshold * 0.95).toFixed(2)}${rule.unit ?? ''} (5% inside the ${threshold}${rule.unit ?? ''} limit) so '${rule.field}' is flagged before it breaches.`,
      })
    }
  }

  // margin score: smaller minimal break distances → lower robustness
  const margins = vectors.map(v => Math.abs(v.delta_pct))
  const avgMargin = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : 100
  const margin_score = Math.max(0, Math.min(100, Math.round(avgMargin)))

  return {
    baseline_compliant: base.compliant,
    attacks_attempted: attempts,
    breaches_found: vectors.length,
    vectors: vectors.sort((a, b) => Math.abs(a.delta_pct) - Math.abs(b.delta_pct)),
    margin_score,
  }
}
