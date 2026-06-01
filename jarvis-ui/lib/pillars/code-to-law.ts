// PILLAR 3 — Direct Code-to-Law Synthesis
//
// A real, deterministic mini-compiler that translates a small obligation DSL
// into evaluable predicate functions over a company state vector. This is the
// genuine kernel of "law as software": each regulatory obligation becomes a
// pure boolean function compiled from a typed rule, and the whole rulebook
// evaluates to a verdict with a machine-checkable trace.
//
// No LLM in the hot path. Same (rule, state) → same verdict, always.

export type Op = '>=' | '<=' | '>' | '<' | '==' | '!=' | 'in' | 'not_in'
export type Combinator = 'all' | 'any' | 'none'

export interface AtomicRule {
  id: string
  field: string            // dot-path into state, e.g. 'capital.tier1_ratio'
  op: Op
  value: number | string | Array<number | string>
  unit?: string
  citation?: string        // legal source
  severity?: 'critical' | 'major' | 'minor'
}

export interface CompositeRule {
  id: string
  combinator: Combinator
  rules: Array<AtomicRule | CompositeRule>
  citation?: string
}

export type Rule = AtomicRule | CompositeRule

export interface EvalTrace {
  rule_id: string
  passed: boolean
  detail: string
  citation?: string
  severity?: string
  children?: EvalTrace[]
}

export interface FailedObligation {
  rule_id: string
  detail: string
  citation?: string
  severity: string
  // the atomic descendant most responsible for the failure (for remediation)
  trigger_field?: string
}

export interface Verdict {
  compliant: boolean
  total: number            // top-level obligations
  passed: number
  failed: number
  critical_failures: number
  failed_obligations: FailedObligation[]
  trace: EvalTrace[]
  state_hash: string
  rulebook_hash: string
}

function isComposite(r: Rule): r is CompositeRule {
  return (r as CompositeRule).combinator !== undefined
}

function resolve(state: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => {
    if (acc && typeof acc === 'object' && k in (acc as object)) {
      return (acc as Record<string, unknown>)[k]
    }
    return undefined
  }, state)
}

function compare(actual: unknown, op: Op, expected: AtomicRule['value']): boolean {
  const a = actual as number
  const e = expected as number
  switch (op) {
    case '>=': return typeof a === 'number' && a >= e
    case '<=': return typeof a === 'number' && a <= e
    case '>':  return typeof a === 'number' && a > e
    case '<':  return typeof a === 'number' && a < e
    case '==': return actual === expected
    case '!=': return actual !== expected
    case 'in': return Array.isArray(expected) && expected.includes(actual as never)
    case 'not_in': return Array.isArray(expected) && !expected.includes(actual as never)
  }
}

function evalRule(rule: Rule, state: Record<string, unknown>): EvalTrace {
  if (isComposite(rule)) {
    const children = rule.rules.map(r => evalRule(r, state))
    let passed: boolean
    if (rule.combinator === 'all') passed = children.every(c => c.passed)
    else if (rule.combinator === 'any') passed = children.some(c => c.passed)
    else passed = !children.some(c => c.passed) // none
    return {
      rule_id: rule.id,
      passed,
      detail: `${rule.combinator.toUpperCase()} of ${children.length} sub-rules → ${passed}`,
      citation: rule.citation,
      children,
    }
  }
  const actual = resolve(state, rule.field)
  const passed = compare(actual, rule.op, rule.value)
  return {
    rule_id: rule.id,
    passed,
    detail: `${rule.field} (${actual ?? 'undefined'}) ${rule.op} ${JSON.stringify(rule.value)}${rule.unit ?? ''} → ${passed}`,
    citation: rule.citation,
    severity: rule.severity,
  }
}

function flatten(t: EvalTrace): EvalTrace[] {
  return t.children ? [t, ...t.children.flatMap(flatten)] : [t]
}

async function hashOf(obj: unknown): Promise<string> {
  const buf = new TextEncoder().encode(JSON.stringify(obj))
  const h = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Find the atomic descendant most responsible for an obligation's outcome,
// and whether any critical-severity atom sits under it.
function diagnose(t: EvalTrace): { trigger_field?: string; severity: string } {
  const leaves = flatten(t).filter(x => x.children === undefined)
  const crit = leaves.find(l => l.severity === 'critical')
  const firstFail = leaves.find(l => !l.passed) ?? leaves[0]
  // detail looks like "field (x) op y → bool"; pull the field token
  const field = firstFail?.detail?.split(' ')?.[0]
  return { trigger_field: field, severity: crit ? 'critical' : (firstFail?.severity ?? 'minor') }
}

// Compile a rulebook into a reusable, pure evaluator.
// Counts are over TOP-LEVEL obligations (the meaningful unit) so that
// inverting combinators like `none` don't mis-count a correctly-non-matching
// child as a failure.
export function compileRulebook(rulebook: Rule[]) {
  return async function evaluate(state: Record<string, unknown>): Promise<Verdict> {
    const trace = rulebook.map(r => evalRule(r, state))
    const total = trace.length
    const passed = trace.filter(t => t.passed).length
    const failed = total - passed

    const failed_obligations: FailedObligation[] = trace
      .filter(t => !t.passed)
      .map(t => {
        const d = diagnose(t)
        return { rule_id: t.rule_id, detail: t.detail, citation: t.citation, severity: d.severity, trigger_field: d.trigger_field }
      })

    const critical_failures = failed_obligations.filter(o => o.severity === 'critical').length

    return {
      compliant: failed === 0,
      total,
      passed,
      failed,
      critical_failures,
      failed_obligations,
      trace,
      state_hash: await hashOf(state),
      rulebook_hash: await hashOf(rulebook),
    }
  }
}

// A worked example rulebook: AIFMD/CRR-style obligations as compiled law.
export const EXAMPLE_RULEBOOK: Rule[] = [
  {
    id: 'CRR-tier1',
    combinator: 'all',
    citation: 'CRR Art. 92',
    rules: [
      { id: 'tier1-min', field: 'capital.tier1_ratio', op: '>=', value: 12, unit: '%', citation: 'CRR Art. 92(1)(a)', severity: 'critical' },
      { id: 'leverage-max', field: 'capital.leverage_ratio', op: '>=', value: 3, unit: '%', citation: 'CRR Art. 429', severity: 'critical' },
    ],
  },
  {
    id: 'AIFMD-liquidity',
    combinator: 'all',
    citation: 'AIFMD Art. 16',
    rules: [
      { id: 'lcr', field: 'liquidity.lcr', op: '>=', value: 100, unit: '%', citation: 'CRR Art. 412', severity: 'major' },
      { id: 'concentration', field: 'risk.single_issuer_pct', op: '<=', value: 10, unit: '%', citation: 'UCITS Art. 52', severity: 'major' },
    ],
  },
  {
    id: 'sanctions-clear',
    combinator: 'none',
    citation: 'EU 2580/2001',
    rules: [
      { id: 'ofac-hit', field: 'screening.ofac_match', op: '==', value: 'true', severity: 'critical' },
    ],
  },
]
