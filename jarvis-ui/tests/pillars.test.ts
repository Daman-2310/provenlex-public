import { describe, it, expect } from 'vitest'
import { compileRulebook, EXAMPLE_RULEBOOK } from '@/lib/pillars/code-to-law'
import { redTeam } from '@/lib/pillars/redteam'
import { proveCompliance, verifyBundle } from '@/lib/pillars/zk-vault'
import { simulatePrecedent } from '@/lib/pillars/precedent'
import { analyzeTopology } from '@/lib/pillars/topology'
import { readTwin } from '@/lib/pillars/regulatory-twin'

const COMPLIANT = { capital: { tier1_ratio: 15, leverage_ratio: 5 }, liquidity: { lcr: 120 }, risk: { single_issuer_pct: 6 }, screening: { ofac_match: 'false' } }
const BREACHING = { capital: { tier1_ratio: 10, leverage_ratio: 2 }, liquidity: { lcr: 90 }, risk: { single_issuer_pct: 15 }, screening: { ofac_match: 'true' } }

describe('Pillar 3 — Code-to-Law', () => {
  it('passes a compliant state', async () => {
    const v = await compileRulebook(EXAMPLE_RULEBOOK)(COMPLIANT)
    expect(v.compliant).toBe(true)
    expect(v.failed).toBe(0)
  })
  it('fails a breaching state with critical flags', async () => {
    const v = await compileRulebook(EXAMPLE_RULEBOOK)(BREACHING)
    expect(v.compliant).toBe(false)
    expect(v.critical_failures).toBeGreaterThan(0)
  })
  it('is deterministic — same state, same hash', async () => {
    const v1 = await compileRulebook(EXAMPLE_RULEBOOK)(COMPLIANT)
    const v2 = await compileRulebook(EXAMPLE_RULEBOOK)(COMPLIANT)
    expect(v1.state_hash).toBe(v2.state_hash)
    expect(v1.compliant).toBe(v2.compliant)
  })
})

describe('Pillar 2 — Red-team', () => {
  it('finds breach vectors near thresholds on a compliant state', async () => {
    const r = await redTeam(EXAMPLE_RULEBOOK, COMPLIANT, { steps: 60 })
    expect(r.baseline_compliant).toBe(true)
    expect(r.breaches_found).toBeGreaterThan(0)   // every threshold rule is breakable below its limit
    expect(r.margin_score).toBeGreaterThanOrEqual(0)
    expect(r.margin_score).toBeLessThanOrEqual(100)
  })
})

describe('Pillar 1 — ZK vault', () => {
  it('produces a bundle that verifies and hides values', async () => {
    const bundle = await proveCompliance(
      { tier1_ratio: 11.2, lcr: 104 },
      [{ field: 'tier1_ratio', op: '>=', threshold: 12 }, { field: 'lcr', op: '>=', threshold: 100 }],
    )
    const v = await verifyBundle(bundle)
    expect(v.valid).toBe(true)
    expect(v.root_ok).toBe(true)
    // booleans correct: 11.2 >= 12 false, 104 >= 100 true
    const t1 = v.checks.find(c => c.predicate.includes('tier1'))
    const lcr = v.checks.find(c => c.predicate.includes('lcr'))
    expect(t1?.result).toBe(false)
    expect(lcr?.result).toBe(true)
    // commitments must NOT contain the raw values
    expect(JSON.stringify(bundle.commitments)).not.toContain('11.2')
  })
  it('detects a tampered bundle', async () => {
    const bundle = await proveCompliance({ x: 5 }, [{ field: 'x', op: '>=', threshold: 3 }])
    bundle.proofs[0].result = false  // tamper
    const v = await verifyBundle(bundle)
    expect(v.valid).toBe(false)
  })
})

describe('Pillar 4 — Precedent', () => {
  it('higher severity yields higher action probability', () => {
    const low = simulatePrecedent({ obligation: 'x', jurisdiction: 'DE', severity: 0.1, samples: 4000 })
    const high = simulatePrecedent({ obligation: 'x', jurisdiction: 'DE', severity: 0.9, samples: 4000 })
    expect(high.p_any_action).toBeGreaterThan(low.p_any_action)
    const dist = Object.values(high.distribution).reduce((a, b) => a + b, 0)
    expect(dist).toBeCloseTo(1, 1)
  })
})

describe('Pillar 5 — Topology', () => {
  it('computes components, bridges, betti_1', () => {
    const nodes = [
      { id: 'a', label: 'A', cluster: 'x' }, { id: 'b', label: 'B', cluster: 'x' },
      { id: 'c', label: 'C', cluster: 'y' }, { id: 'd', label: 'D', cluster: 'y' },
    ]
    const edges = [
      { source: 'a', target: 'b', kind: 'shared_field' as const, weight: 1 },
      { source: 'b', target: 'c', kind: 'cross_reference' as const, weight: 1 }, // bridge
      { source: 'c', target: 'd', kind: 'shared_field' as const, weight: 1 },
    ]
    const r = analyzeTopology(nodes, edges)
    expect(r.components).toBe(1)
    expect(r.bridges.length).toBeGreaterThan(0)   // b-c is a bridge between clusters
    expect(typeof r.betti_1).toBe('number')
  })
})

describe('Pillar 6 — Regulatory twin', () => {
  it('returns higher risk when breach hits a supervisory priority', () => {
    const onTheme = readTwin('BaFin', { theme: 'governance', severity: 0.8, public_signal: 0.5 })
    const offTheme = readTwin('BaFin', { theme: 'obscure_thing', severity: 0.8, public_signal: 0.5 })
    expect(onTheme.enforcement_risk).toBeGreaterThanOrEqual(offTheme.enforcement_risk)
    expect(onTheme.supervisor).toContain('BaFin')
  })
})
