import { describe, it, expect } from 'vitest'
import { buildMirror, getAllMirrors } from '@/lib/prospectus'
import { BOOK_SNAPSHOT_ENTRIES } from '@/lib/book-snapshot'

describe('Mirror prospectus engine', () => {
  it('produces a mirror for every Book entry', () => {
    const all = getAllMirrors()
    expect(all.length).toBe(BOOK_SNAPSHOT_ENTRIES.length)
  })

  it('every mirror has at least one claim', () => {
    const all = getAllMirrors()
    for (const m of all) {
      expect(m.claims.length).toBeGreaterThan(0)
    }
  })

  it('drift_score equals breach×3 + watch×1', () => {
    const all = getAllMirrors()
    for (const m of all) {
      expect(m.drift_score).toBe(m.breach_count * 3 + m.watch_count * 1)
    }
  })

  it('high PCI entities tend to have more breaches than low PCI', () => {
    const all = getAllMirrors()
    const high = all.filter(m => m.pre_crime_index >= 50)
    const low  = all.filter(m => m.pre_crime_index < 30)
    if (high.length === 0 || low.length === 0) return
    const avgHigh = high.reduce((s, m) => s + m.breach_count, 0) / high.length
    const avgLow  = low.reduce((s, m) => s + m.breach_count, 0) / low.length
    expect(avgHigh).toBeGreaterThan(avgLow)
  })

  it('claim severity matches actual breach status', () => {
    const m = buildMirror(BOOK_SNAPSHOT_ENTRIES[0])
    for (const c of m.claims) {
      const isMax = c.direction === 'max'
      const violated = isMax ? c.observed > c.promised : c.observed < c.promised
      if (c.severity === 'breach') {
        expect(violated).toBe(true)
      }
    }
  })

  it('counts add up to total claims', () => {
    const all = getAllMirrors()
    for (const m of all) {
      expect(m.breach_count + m.watch_count + m.ok_count).toBe(m.claims.length)
    }
  })
})
