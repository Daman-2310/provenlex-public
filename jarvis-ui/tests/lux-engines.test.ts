import { describe, it, expect } from 'vitest'
import {
  verifyInLuxembourg, reconcile, simulateTrade, preflightValidate, scoreDelegate,
  appendChain, verifyChain, type ChainLink,
} from '@/lib/lux-engines'

describe('Lux Engine 1 — geofence + hash chain', () => {
  it('accepts Luxembourg City, rejects Paris and Frankfurt', () => {
    expect(verifyInLuxembourg(49.61, 6.13).inside).toBe(true)
    expect(verifyInLuxembourg(48.86, 2.35).inside).toBe(false)
    expect(verifyInLuxembourg(50.11, 8.68).inside).toBe(false)
  })
  it('hash chain detects tampering', async () => {
    const chain: ChainLink[] = []
    await appendChain(chain, { d: 'A', action: 'vote' })
    await appendChain(chain, { d: 'B', action: 'sign' })
    expect((await verifyChain(chain)).intact).toBe(true)
    chain[0].payload.action = 'TAMPERED'
    const after = await verifyChain(chain)
    expect(after.intact).toBe(false)
    expect(after.brokenAt).toBe(0)
  })
})

describe('Lux Engine 2 — reconciliation', () => {
  it('flags a stressed fund and passes a clean one', () => {
    const stressed = reconcile({ reportedNavEur: 1_000_000, assets: [{ id: 'X', valueEur: 600_000 }, { id: 'Y', valueEur: 350_000 }], liquidityBufferEur: 50_000, var95Eur: 80_000, redemptionObligationsEur: 120_000, weights: [{ id: 'X', weight: 0.6, prospectusMax: 0.5 }, { id: 'Y', weight: 0.35, prospectusMax: 0.4 }] })
    expect(stressed.clean).toBe(false)
    expect(stressed.discrepancies.map(d => d.code)).toContain('PROSPECTUS_WEIGHT_BREACH')
    const clean = reconcile({ reportedNavEur: 1_000_000, assets: [{ id: 'X', valueEur: 500_000 }, { id: 'Y', valueEur: 500_000 }], liquidityBufferEur: 200_000, var95Eur: 80_000, redemptionObligationsEur: 150_000, weights: [{ id: 'X', weight: 0.5, prospectusMax: 0.6 }, { id: 'Y', weight: 0.5, prospectusMax: 0.6 }] })
    expect(clean.clean).toBe(true)
  })
})

describe('Lux Engine 3 — AIFMD II', () => {
  it('blocks sub-5% retention and 24% FI concentration; allows compliant trade', () => {
    const bad = simulateTrade({ structure: 'open_ended', navEur: 10_000_000, grossExposureEur: 16_000_000, priorBorrowerExposureEur: 1_500_000, borrowerIsFI: true, loanNominalEur: 1_000_000, retainedEur: 40_000, addedExposureEur: 900_000 })
    expect(bad.allowed).toBe(false)
    expect(bad.checks.find(c => c.rule === 'LOAN_RETENTION_5PCT')!.passed).toBe(false)
    expect(bad.checks.find(c => c.rule === 'SINGLE_FI_CONCENTRATION_20PCT')!.passed).toBe(false)
    const good = simulateTrade({ structure: 'closed_ended', navEur: 10_000_000, grossExposureEur: 5_000_000, priorBorrowerExposureEur: 0, borrowerIsFI: false, loanNominalEur: 1_000_000, retainedEur: 100_000, addedExposureEur: 500_000 })
    expect(good.allowed).toBe(true)
  })
})

describe('Lux Engine 4 — e-ID preflight', () => {
  it('rejects an incomplete package, passes a complete one', () => {
    const bad = preflightValidate({ legalName: 'F', managementCompany: '', depositary: 'D', documentTitle: 'T', documentSha256: 'nope', eidasSignature: 'short', lei: 'BADLEI' })
    expect(bad.valid).toBe(false)
    const good = preflightValidate({ legalName: 'Genesis Fund', managementCompany: 'ManCo', depositary: 'BNP', documentTitle: 'OD', documentSha256: 'a'.repeat(64), eidasSignature: 'b'.repeat(80), lei: '529900VBK42Y5HHRMD23' })
    expect(good.valid).toBe(true)
  })
})

describe('Lux Engine 5 — delegation scoring', () => {
  it('escalates an unhealthy critical vendor', () => {
    const r = scoreDelegate({ name: 'AdminCo', isCritical: true, slaUptimePct: 97.5, compliancePassRate: 0.8, securityIncidents90d: 2, openFindings: 3, daysSinceLastReview: 200 })
    expect(r.healthy).toBe(false)
    expect(r.floor).toBe(70)
    expect(['enhanced_monitoring', 'escalate_to_board']).toContain(r.action)
  })
  it('passes a healthy vendor', () => {
    const r = scoreDelegate({ name: 'GoodCo', isCritical: false, slaUptimePct: 99.95, compliancePassRate: 1, securityIncidents90d: 0, openFindings: 0, daysSinceLastReview: 30 })
    expect(r.healthy).toBe(true)
    expect(r.score).toBeGreaterThanOrEqual(95)
  })
})
