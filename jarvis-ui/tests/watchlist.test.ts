import { describe, it, expect } from 'vitest'
import { WATCHLIST, WATCHLIST_PUBLICATION_DATE, computeWatchListHash } from '@/lib/watchlist'

describe('Watch List', () => {
  it('has exactly 5 entries', () => {
    expect(WATCHLIST).toHaveLength(5)
  })

  it('every entry has at least 1 signal', () => {
    for (const e of WATCHLIST) {
      expect(e.signals.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('every entry has at least 4 vindication criteria', () => {
    for (const e of WATCHLIST) {
      expect(e.vindication_criteria.length).toBeGreaterThanOrEqual(4)
    }
  })

  it('publication date is a valid ISO timestamp', () => {
    const d = new Date(WATCHLIST_PUBLICATION_DATE)
    expect(d.toString()).not.toBe('Invalid Date')
  })

  it('every entry has a Pre-Crime Index between 30 and 100', () => {
    for (const e of WATCHLIST) {
      expect(e.pre_crime_index).toBeGreaterThanOrEqual(30)
      expect(e.pre_crime_index).toBeLessThanOrEqual(100)
    }
  })

  it('every signal cites a source', () => {
    for (const e of WATCHLIST) {
      for (const s of e.signals) {
        expect(s.citation.length).toBeGreaterThan(0)
        expect(s.observation.length).toBeGreaterThan(0)
      }
    }
  })

  it('hash is deterministic across calls', async () => {
    const h1 = await computeWatchListHash()
    const h2 = await computeWatchListHash()
    expect(h1).toBe(h2)
  })

  it('hash is a 64-char hex string (SHA-256)', async () => {
    const h = await computeWatchListHash()
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('signals only use approved sources', () => {
    const valid = new Set(['press', 'regulator', 'governance', 'audit', 'market'])
    for (const e of WATCHLIST) {
      for (const s of e.signals) {
        expect(valid.has(s.source)).toBe(true)
      }
    }
  })

  it('forecasts never use forbidden words', () => {
    const forbidden = ['fraud', 'criminal', 'guilty']
    for (const e of WATCHLIST) {
      const text = (e.forecast + ' ' + e.signals.map(s => s.observation).join(' ')).toLowerCase()
      for (const f of forbidden) {
        expect(text).not.toContain(f)
      }
    }
  })
})
