// EVAL CORPUS — the engine's accuracy & regression harness.
//
// Each fixture is a realistic prospectus paired with the verdict the engine MUST
// produce. This is the moat made testable: it proves the deterministic engine is
// correct across fund types AND never regresses as the ruleset evolves. The
// expectations encode CORRECT AIFMD II / UCITS behaviour — if one ever diverges,
// fix the engine, never the expectation (unless the expectation itself is wrong in
// law). The single most important property here is the *no-false-positive* guarantee:
// the AIFMD II caps bind ONLY loan-originating AIFs, so a general PE/hedge fund must
// not be flagged for high leverage or concentrated positions.

import { describe, it, expect } from 'vitest'
import { extractDocument, scanCompliance, type ScanResult } from '@/lib/scan-engine'

function run(text: string): ScanResult {
  const doc = extractDocument(text)
  return { doc, ...scanCompliance(doc) }
}
const codes = (r: ScanResult) => r.findings.map(f => f.code)

describe('eval corpus — AIFMD II loan-originating AIFs', () => {
  it('open-ended loan-orig breaching every limit → NON-COMPLIANT (all four findings)', () => {
    const r = run(`HELIOS DIRECT LENDING FUND — SICAV-RAIF
Domicile: Luxembourg
Structure: open-ended loan-originating alternative investment fund

Investment policy and limits:
- The Fund may employ leverage up to 220% of net asset value (commitment method).
- The AIFM will retain 2% of the notional value of each originated loan.
- No more than 15% of NAV may be exposed to any single issuer.

Indicative portfolio (% of NAV):
Atlas Manufacturing — 26%
Borealis Telecom — 17%
Crescent Retail — 21%
Cash and equivalents — 10%`)
    expect(r.doc.loanOriginating).toBe(true)
    expect(r.compliant).toBe(false)
    expect(codes(r)).toContain('PROSPECTUS_LEVERAGE_EXCEEDS_STATUTE') // 220 > 175
    expect(codes(r)).toContain('RETENTION_BELOW_STATUTORY_MINIMUM')   // 2 < 5
    expect(codes(r)).toContain('OWN_CONCENTRATION_BREACH')            // 26/17/21 > 15
    expect(codes(r)).toContain('STATUTORY_CONCENTRATION_REVIEW')      // 26/21 > 20, but ordinary corporates → confirm-type review, not a definitive breach
  })

  it('open-ended loan-orig within all limits → COMPLIANT', () => {
    const r = run(`NORTHWIND PRIVATE CREDIT FUND — SICAV-RAIF
Domicile: Luxembourg
Structure: open-ended loan-originating alternative investment fund

Investment policy and limits:
- The Fund may employ leverage up to 150% of net asset value (commitment method).
- The AIFM will retain 7% of the notional value of each originated loan.
- No more than 20% of NAV may be exposed to any single issuer.

Indicative portfolio (% of NAV):
Vanguard Logistics — 18%
Pioneer Energy — 15%
Summit Healthcare — 12%`)
    expect(r.doc.loanOriginating).toBe(true)
    expect(r.compliant).toBe(true)
    expect(r.criticalCount).toBe(0)
  })

  it('closed-ended loan-orig at 250% is WITHIN the 300% cap → COMPLIANT', () => {
    const r = run(`MERIDIAN CREDIT FUND — SICAV-RAIF
Structure: closed-ended loan-originating alternative investment fund
- Maximum leverage of 250% of net asset value (commitment method).
- The AIFM will retain 6% of the notional value of each originated loan.
- No more than 20% of NAV may be exposed to any single issuer.

Delta Infrastructure — 19%
Echo Pharma — 16%`)
    expect(r.doc.structure).toBe('closed_ended')
    expect(r.compliant).toBe(true)
  })

  it('closed-ended loan-orig at 350% BREACHES the 300% cap → NON-COMPLIANT', () => {
    const r = run(`SENTINEL CREDIT FUND — SICAV-RAIF
Structure: closed-ended loan-originating alternative investment fund
- Maximum leverage of 350% of net asset value (commitment method).
- The AIFM will retain 6% of the notional value of each originated loan.`)
    expect(r.compliant).toBe(false)
    expect(codes(r)).toContain('PROSPECTUS_LEVERAGE_EXCEEDS_STATUTE') // 350 > 300
  })
})

describe('eval corpus — NO FALSE POSITIVES (the core correctness property)', () => {
  it('a general (non-loan-orig) PE fund at 400% leverage is NOT a breach', () => {
    const r = run(`SUMMIT BUYOUT FUND — SICAV-RAIF
Domicile: Luxembourg
Structure: closed-ended private equity buyout fund

Investment policy:
- The Fund may employ leverage up to 400% of net asset value (commitment method).

Indicative portfolio (% of NAV):
Project Atlas — 30%
Project Borealis — 28%
Project Crescent — 22%`)
    expect(r.doc.loanOriginating).toBe(false)
    expect(r.compliant).toBe(true)
    expect(r.criticalCount).toBe(0)
    expect(codes(r)).toContain('LEVERAGE_DISCLOSED_NO_STATUTORY_CAP')
    // The loan-origination caps must NOT be asserted against a general AIF:
    expect(codes(r)).not.toContain('PROSPECTUS_LEVERAGE_EXCEEDS_STATUTE')
    expect(codes(r)).not.toContain('STATUTORY_CONCENTRATION_BREACH')
  })
})

describe('eval corpus — loan-origination detection precision (NOTE-02 fix)', () => {
  it('a single incidental "private credit" mention in a general fund does NOT flag loan-originating', () => {
    const r = run(`GLOBAL OPPORTUNITIES FUND — SICAV
Domicile: Luxembourg
Structure: closed-ended multi-asset alternative investment fund

Investment policy:
- A diversified, multi-asset strategy across global equities and fixed income.
- The Fund may allocate up to 10% of net asset value to private credit instruments.
- The Fund may employ leverage up to 300% of net asset value (commitment method).

Indicative portfolio (% of NAV):
Project Atlas — 18%
Project Borealis — 15%`)
    expect(r.doc.loanOriginating).toBe(false)
    expect(r.compliant).toBe(true)
    // the loan-orig 175/300 cap must NOT be asserted against a general AIF:
    expect(codes(r)).not.toContain('PROSPECTUS_LEVERAGE_EXCEEDS_STATUTE')
    expect(codes(r)).toContain('LEVERAGE_DISCLOSED_NO_STATUTORY_CAP')
  })

  it('the definitional term "loan-originating" flags on a single clear match', () => {
    const r = run(`HARBOUR LENDING FUND — SICAV-RAIF
Structure: open-ended loan-originating alternative investment fund
- The Fund may employ leverage up to 150% of net asset value (commitment method).
- The AIFM will retain 6% of the notional value of each originated loan.`)
    expect(r.doc.loanOriginating).toBe(true)
  })

  it('two lending-strategy descriptors (no term of art) flag as loan-originating', () => {
    const r = run(`BLACKWOOD ALTERNATIVE FUND — SICAV-RAIF
Structure: closed-ended alternative investment fund
The Fund pursues a direct lending strategy and invests in private credit
across European mid-market companies.`)
    expect(r.doc.loanOriginating).toBe(true)
  })
})

describe('eval corpus — retention extraction precision', () => {
  it('"retain X% of the management fee" is not mistaken for risk retention', () => {
    const r = run(`VANTAGE GROWTH FUND — SICAV
Structure: closed-ended private equity fund
The Manager will retain 25% of the management fee charged to the Fund.
The Fund may employ leverage up to 180% of net asset value (commitment method).`)
    expect(r.doc.declaredRetentionPct).toBeNull()
  })

  it('a genuine 5% retention of loan notional is still captured', () => {
    const r = run(`KESTREL CREDIT FUND — SICAV-RAIF
Structure: open-ended loan-originating alternative investment fund
The AIFM will retain 5% of the notional value of each originated loan.`)
    expect(r.doc.declaredRetentionPct).toBe(5)
  })
})

describe('eval corpus — UCITS 5/10/40 diversification', () => {
  it('single issuer above 10% → NON-COMPLIANT (single-issuer breach)', () => {
    const r = run(`ALPHA UCITS EQUITY FUND — SICAV
Structure: open-ended UCITS fund

Indicative portfolio (% of NAV):
Acme Industries — 12%
Beacon Foods — 8%
Crystal Materials — 7%
Dunes Media — 6%`)
    expect(r.doc.isUCITS).toBe(true)
    expect(r.compliant).toBe(false)
    expect(codes(r)).toContain('UCITS_SINGLE_ISSUER_BREACH')          // 12 > 10
    expect(codes(r)).not.toContain('UCITS_5_10_40_BUCKET_BREACH')     // 12+8+7+6 = 33 ≤ 40
  })

  it('the >5% bucket above 40% → NON-COMPLIANT (bucket breach, not single)', () => {
    const r = run(`BETA UCITS BALANCED FUND — SICAV
Structure: open-ended UCITS fund

Indicative portfolio (% of NAV):
Position One — 9%
Position Two — 9%
Position Three — 9%
Position Four — 9%
Position Five — 9%`)
    expect(r.doc.isUCITS).toBe(true)
    expect(r.compliant).toBe(false)
    expect(codes(r)).toContain('UCITS_5_10_40_BUCKET_BREACH')         // 5×9 = 45 > 40
    expect(codes(r)).not.toContain('UCITS_SINGLE_ISSUER_BREACH')      // each 9 ≤ 10
  })

  it('a diversified UCITS within both limits → COMPLIANT', () => {
    const r = run(`GAMMA UCITS DIVERSIFIED FUND — SICAV
Structure: open-ended UCITS fund

Indicative portfolio (% of NAV):
Holding Alpha — 8%
Holding Beta — 7%
Holding Gamma — 6%
Holding Delta — 4%`)
    expect(r.doc.isUCITS).toBe(true)
    expect(r.compliant).toBe(true)
    expect(r.criticalCount).toBe(0)
  })
})

describe('eval corpus — insufficient data is NOT a clean pass', () => {
  it('a document deferring all limits is flagged, not waved through', () => {
    const r = run(`OMEGA OPPORTUNITIES FUND — SICAV
Domicile: Luxembourg

This prospectus defers all investment limits and portfolio composition to the
relevant sub-fund particulars and supplements.`)
    expect(codes(r)).toContain('INSUFFICIENT_DATA')
    expect(r.warningCount).toBeGreaterThanOrEqual(1)
  })
})
