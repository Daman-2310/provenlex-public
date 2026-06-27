import { describe, it, expect } from 'vitest'
import {
  extractDocument, scanCompliance, sealVerdict, SAMPLE_PROSPECTUS, STATUTORY,
  RULESET, rulesetHash, fromManualEntry, type ScanResult,
} from '@/lib/scan-engine'

describe('scan-engine extraction', () => {
  const doc = extractDocument(SAMPLE_PROSPECTUS)

  it('detects open-ended structure', () => {
    expect(doc.structure).toBe('open_ended')
  })
  it('extracts the declared leverage cap (200%)', () => {
    expect(doc.declaredLeverageCapPct).toBe(200)
  })
  it('extracts the declared retention (3%)', () => {
    expect(doc.declaredRetentionPct).toBe(3)
  })
  it('extracts the declared concentration cap (15%)', () => {
    expect(doc.declaredConcentrationCapPct).toBe(15)
  })
  it('extracts holdings with weights', () => {
    expect(doc.holdings.length).toBeGreaterThanOrEqual(5)
    const helios = doc.holdings.find(h => /Helios/.test(h.name))
    expect(helios?.weightPct).toBe(24)
  })
})

describe('scan-engine extraction — real-world formats', () => {
  it('reads leverage expressed as a multiple ("2x NAV")', () => {
    const d = extractDocument('Open-ended loan-originating Fund\nThe Fund may employ leverage up to 2x NAV.')
    expect(d.declaredLeverageCapPct).toBe(200)
  })
  it('reads leverage written as "1.75 times"', () => {
    const d = extractDocument('A SICAV Fund\nMaximum leverage of 1.75 times net asset value.')
    expect(d.declaredLeverageCapPct).toBe(175)
  })
  it('reads retention written as "5 per cent."', () => {
    const d = extractDocument('Fund\nThe AIFM will retain 5 per cent. of each originated loan.')
    expect(d.declaredRetentionPct).toBe(5)
  })
  it('reads concentration written as "20 percent"', () => {
    const d = extractDocument('Fund\nNo more than 20 percent of NAV may be exposed to any single issuer.')
    expect(d.declaredConcentrationCapPct).toBe(20)
  })
  it('still reads the standard %% format (regression)', () => {
    const d = extractDocument('Fund\nleverage up to 300% ; retain 8% of each loan')
    expect(d.declaredLeverageCapPct).toBe(300)
    expect(d.declaredRetentionPct).toBe(8)
  })
})

describe('scan-engine compliance', () => {
  const doc = extractDocument(SAMPLE_PROSPECTUS)
  const res = scanCompliance(doc)

  it('flags prospectus leverage exceeding the statutory cap', () => {
    const f = res.findings.find(x => x.code === 'PROSPECTUS_LEVERAGE_EXCEEDS_STATUTE')
    expect(f?.severity).toBe('critical')
    expect(f?.limit).toBe(STATUTORY.LEVERAGE_CAP_OPEN_PCT) // 175
    expect(f?.observed).toBe(200)
  })
  it('flags retention below the statutory minimum', () => {
    const f = res.findings.find(x => x.code === 'RETENTION_BELOW_STATUTORY_MINIMUM')
    expect(f?.severity).toBe('critical')
  })
  it('flags an own-prospectus concentration breach (Helios 24% > 15%)', () => {
    const f = res.findings.find(x => x.code === 'OWN_CONCENTRATION_BREACH' && /Helios/.test(x.title))
    expect(f?.severity).toBe('critical')
  })
  it('flags a statutory concentration breach (>20%)', () => {
    const f = res.findings.find(x => x.code === 'STATUTORY_CONCENTRATION_BREACH')
    expect(f?.severity).toBe('critical')
  })
  it('overall verdict is non-compliant', () => {
    expect(res.compliant).toBe(false)
    expect(res.criticalCount).toBeGreaterThanOrEqual(4)
  })
})

describe('scan-engine sealing', () => {
  it('produces a stable 64-hex SHA-256 verdict and changes if the result changes', async () => {
    const doc = extractDocument(SAMPLE_PROSPECTUS)
    const res: ScanResult = { doc, ...scanCompliance(doc) }
    const h1 = await sealVerdict(res)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
    const tampered: ScanResult = { ...res, compliant: true }
    const h2 = await sealVerdict(tampered)
    expect(h2).not.toBe(h1)
  })

  it('stamps every verdict with the ruleset version + effective date', () => {
    const doc = extractDocument(SAMPLE_PROSPECTUS)
    const res = scanCompliance(doc)
    expect(res.rulesetVersion).toBe(RULESET.version)
    expect(res.rulesetEffective).toBe(RULESET.effective)
  })

  it('binds the ruleset version into the seal — a rule change yields a different hash', async () => {
    const doc = extractDocument(SAMPLE_PROSPECTUS)
    const res: ScanResult = { doc, ...scanCompliance(doc) }
    const h1 = await sealVerdict(res)
    const underNewRuleset: ScanResult = { ...res, rulesetVersion: '9999.9' }
    const h2 = await sealVerdict(underNewRuleset)
    expect(h2).not.toBe(h1)
  })

  it('rulesetHash is a stable 64-hex digest of the rule definitions', async () => {
    const a = await rulesetHash()
    const b = await rulesetHash()
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).toBe(b)
  })
})

describe('scan-engine — applicability gating (NO false positives)', () => {
  it('detects the sample as a loan-originating AIF', () => {
    expect(extractDocument(SAMPLE_PROSPECTUS).loanOriginating).toBe(true)
  })

  it('does NOT flag high leverage on a non-loan-originating fund', () => {
    // A general AIF / hedge fund can legitimately run 400% leverage — no breach.
    const d = extractDocument('Acme Global Equity Fund SICAV\nAn open-ended alternative investment fund.\nThe Fund may employ leverage up to 400% of net asset value.')
    expect(d.loanOriginating).toBeFalsy()
    const res = scanCompliance(d)
    expect(res.findings.find(f => f.code === 'PROSPECTUS_LEVERAGE_EXCEEDS_STATUTE')).toBeUndefined()
    expect(res.findings.find(f => f.code === 'LEVERAGE_DISCLOSED_NO_STATUTORY_CAP')?.severity).toBe('ok')
    // The real guarantee here is NO false-positive breach. (A one-line doc with only a
    // leverage figure is intentionally too thin to read as a full clean bill — the
    // honesty gate flags INSUFFICIENT_DATA rather than asserting "compliant".)
    expect(res.criticalCount).toBe(0)
  })

  it('does NOT read as a clean bill when extraction is too thin (no false CLEAN)', () => {
    // Mirrors what real prospectus PDFs do: one stray value extracted, holdings in
    // tables the text layer drops. Must NOT return compliant.
    const d = extractDocument('Some Global SICAV\nNo more than 20% in any single issuer.')
    const res = scanCompliance(d)
    expect(res.criticalCount).toBe(0)
    expect(res.compliant).toBe(false)
    expect(res.findings.some(f => f.code === 'INSUFFICIENT_DATA')).toBe(true)
  })

  it('manual entry flows through the same engine (loan-orig + 200% leverage → breach, provenance tagged)', () => {
    const doc = fromManualEntry({ structure: 'open_ended', isUCITS: false, loanOriginating: true, declaredLeverageCapPct: 200, holdings: [] })
    const res = scanCompliance(doc)
    expect(res.findings.some(f => f.code === 'PROSPECTUS_LEVERAGE_EXCEEDS_STATUTE')).toBe(true)
    expect(res.compliant).toBe(false)
    expect(doc.provenance.some(p => p.includes('entered by user'))).toBe(true)
  })

  it('does NOT flag a concentrated position on a non-loan-originating PE fund', () => {
    const d = extractDocument('Apex Buyout Fund SICAV-RAIF\nA closed-ended private equity fund.\nPortfolio:\nTargetCo SA — 28%\nBetaCo — 19%')
    expect(d.loanOriginating).toBeFalsy()
    const res = scanCompliance(d)
    expect(res.findings.find(f => f.code === 'STATUTORY_CONCENTRATION_BREACH')).toBeUndefined()
  })

  it('STILL flags a breach of the fund’s OWN declared cap, regardless of fund type', () => {
    const d = extractDocument('Apex Fund SICAV\nNo more than 20% in any single issuer.\nHoldings:\nBigCo — 30%')
    const res = scanCompliance(d)
    expect(res.findings.find(f => f.code === 'OWN_CONCENTRATION_BREACH')?.severity).toBe('critical')
  })

  it('keeps the loan-originating sample non-compliant (regression)', () => {
    expect(scanCompliance(extractDocument(SAMPLE_PROSPECTUS)).compliant).toBe(false)
  })

  // Regression for the false-positive catastrophe found stress-testing real
  // prospectuses: once table extraction improved, fee/allocation table rows were
  // being read as portfolio holdings and flagged as single-issuer breaches.
  // A prospectus has no holdings section, so it must yield zero holdings.
  it('does NOT read a prospectus fee/allocation table as holdings (no phantom breaches)', () => {
    const d = extractDocument([
      'Global Equity Fund SICAV — a UCITS',
      'No more than 10% of net assets in any single issuer.',
      'Maximum Annual Fees',
      'Class   Management   Distribution   Performance',
      'A       1.50%        0.75%          15%',
      'E       1.05%        —              15%',
      'Geographic allocation',
      'United States   45%',
      'Japan           12%',
      'Technology      22%',
    ].join('\n'))
    expect(d.holdings.length).toBe(0)
    const res = scanCompliance(d)
    expect(res.findings.some(f => f.code === 'UCITS_SINGLE_ISSUER_BREACH')).toBe(false)
  })
})

describe('scan-engine — real-world legalese extraction', () => {
  it('reads leverage "shall not exceed 175%"', () => {
    expect(extractDocument('Loan-originating Fund\nLeverage shall not exceed 175% of NAV.').declaredLeverageCapPct).toBe(175)
  })
  it('reads leverage stated via the commitment method', () => {
    expect(extractDocument('Loan Fund\nThe maximum level of leverage calculated pursuant to the commitment method is 300%.').declaredLeverageCapPct).toBe(300)
  })
  it('reads retention as a "net economic interest of at least 5%"', () => {
    expect(extractDocument('Loan-originating Fund\nThe AIFM retains a material net economic interest of at least 5%.').declaredRetentionPct).toBe(5)
  })
  it('reads concentration as "limitation of 30% ... in any single investment"', () => {
    expect(extractDocument('RAIF Fund\nA limitation of 30% of gross assets in any single investment applies.').declaredConcentrationCapPct).toBe(30)
  })
  it('does NOT mistake a loss-risk sentence for a leverage cap', () => {
    expect(extractDocument('Fund\nLeverage risk: in adverse markets the NAV may fall by up to 50%.').declaredLeverageCapPct).toBeNull()
  })
})

describe('scan-engine — honesty on unparseable documents', () => {
  it('surfaces INSUFFICIENT_DATA instead of implying compliance', () => {
    const res = scanCompliance(extractDocument('Some Fund SICAV\nLimits are set out in the relevant Sub-Fund Particulars.'))
    expect(res.findings.find(f => f.code === 'INSUFFICIENT_DATA')?.severity).toBe('warning')
  })
})
