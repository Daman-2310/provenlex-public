import { describe, it, expect } from 'vitest'
import {
  extractDocument, scanCompliance, sealVerdict, SAMPLE_PROSPECTUS, STATUTORY,
  type ScanResult,
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
})
