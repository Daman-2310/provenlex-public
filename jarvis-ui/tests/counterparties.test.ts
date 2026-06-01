import { describe, it, expect } from 'vitest'
import { COUNTERPARTY_EDGES, buildAdjacency, computeContagionRisk, EDGE_KIND_COLOR, EDGE_KIND_LABEL } from '@/lib/counterparties'

describe('Counterparty graph', () => {
  it('has > 100 edges', () => {
    expect(COUNTERPARTY_EDGES.length).toBeGreaterThan(100)
  })

  it('every edge has a valid kind', () => {
    const validKinds = new Set(Object.keys(EDGE_KIND_LABEL))
    for (const e of COUNTERPARTY_EDGES) {
      expect(validKinds.has(e.kind)).toBe(true)
    }
  })

  it('every edge has source != target', () => {
    for (const e of COUNTERPARTY_EDGES) {
      expect(e.source).not.toBe(e.target)
    }
  })

  it('every edge weight is in [0, 1]', () => {
    for (const e of COUNTERPARTY_EDGES) {
      expect(e.weight).toBeGreaterThanOrEqual(0)
      expect(e.weight).toBeLessThanOrEqual(1)
    }
  })

  it('adjacency is symmetric', () => {
    const adj = buildAdjacency()
    for (const e of COUNTERPARTY_EDGES) {
      const fromS = adj.get(e.source) ?? []
      const fromT = adj.get(e.target) ?? []
      expect(fromS.some(n => n.neighbor === e.target)).toBe(true)
      expect(fromT.some(n => n.neighbor === e.source)).toBe(true)
    }
  })

  it('contagion risk is finite for every entity', () => {
    const pci = new Map<string, number>()
    for (const e of COUNTERPARTY_EDGES) {
      pci.set(e.source, 50)
      pci.set(e.target, 50)
    }
    const r = computeContagionRisk(pci)
    for (const [, v] of r) {
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
    }
  })

  it('every edge_kind has a colour and a label', () => {
    for (const e of COUNTERPARTY_EDGES) {
      expect(EDGE_KIND_COLOR[e.kind]).toMatch(/^#[0-9a-f]{6}$/i)
      expect(EDGE_KIND_LABEL[e.kind]).toBeTruthy()
    }
  })
})
