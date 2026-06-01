import { describe, it, expect } from 'vitest'
import { explainScore, BOT_PROFILES } from '@/lib/explainability'

describe('explainScore', () => {
  it('returns one contribution per bot profile', async () => {
    const r = await explainScore({
      prophecy_id: '578a618e28db',
      entity: 'Deutsche Bank AG, London Branch',
      jurisdiction: 'GB',
      category: 'bank',
      total_score: 55,
    })
    expect(r.contributions).toHaveLength(BOT_PROFILES.length)
  })

  it('is deterministic for the same prophecy_id', async () => {
    const args = {
      prophecy_id: '578a618e28db',
      entity: 'Deutsche Bank AG, London Branch',
      jurisdiction: 'GB',
      category: 'bank',
      total_score: 55,
    }
    const r1 = await explainScore(args)
    const r2 = await explainScore(args)
    expect(r1.reconstructed_score).toBe(r2.reconstructed_score)
    expect(r1.contributions.map(b => b.signal)).toEqual(r2.contributions.map(b => b.signal))
  })

  it('produces different breakdowns for different prophecy_ids', async () => {
    const r1 = await explainScore({
      prophecy_id: 'aaaaaaaaaaaa',
      entity: 'A',
      jurisdiction: 'DE',
      category: 'bank',
      total_score: 50,
    })
    const r2 = await explainScore({
      prophecy_id: 'bbbbbbbbbbbb',
      entity: 'B',
      jurisdiction: 'DE',
      category: 'bank',
      total_score: 50,
    })
    expect(r1.contributions.map(b => b.signal)).not.toEqual(r2.contributions.map(b => b.signal))
  })

  it('reconstructed score is plausibly close to total_score', async () => {
    const r = await explainScore({
      prophecy_id: '578a618e28db',
      entity: 'Deutsche Bank AG, London Branch',
      jurisdiction: 'GB',
      category: 'bank',
      total_score: 55,
    })
    expect(Math.abs(r.reconstructed_score - 55)).toBeLessThan(30)
  })

  it('bot base_weights sum to 100 (canonical Genesis weighting)', () => {
    const total = BOT_PROFILES.reduce((s, b) => s + b.base_weight, 0)
    expect(total).toBe(100)
  })

  it('every contribution has a valid signal (0-100)', async () => {
    const r = await explainScore({
      prophecy_id: '578a618e28db',
      entity: 'Deutsche Bank AG, London Branch',
      jurisdiction: 'GB',
      category: 'bank',
      total_score: 55,
    })
    for (const c of r.contributions) {
      expect(c.signal).toBeGreaterThanOrEqual(0)
      expect(c.signal).toBeLessThanOrEqual(100)
    }
  })
})
