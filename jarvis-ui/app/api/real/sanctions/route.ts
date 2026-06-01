import { NextRequest } from 'next/server'

export const runtime = 'edge'

// Real OFAC SDN screening. Snapshot is fetched once from the static asset
// served by the same origin (CDN-cached) and held in module memory for the
// life of this edge instance.
interface OFACEntity {
  id: string
  name: string
  type: string
  program: string
  remarks: string
}
interface OFACSnapshot {
  source: string
  url: string
  fetched: string
  count: number
  entities: OFACEntity[]
}

let CACHE: { lc: string[]; entities: OFACEntity[]; meta: Omit<OFACSnapshot, 'entities'> } | null = null

async function loadSnapshot(origin: string) {
  if (CACHE) return CACHE
  const res = await fetch(`${origin}/data/ofac-sdn.json`, {
    next: { revalidate: 86400 }, // CDN cache 24h
  })
  if (!res.ok) throw new Error(`snapshot fetch failed: ${res.status}`)
  const snap = (await res.json()) as OFACSnapshot
  CACHE = {
    entities: snap.entities,
    lc: snap.entities.map(e => e.name.toLowerCase()),
    meta: { source: snap.source, url: snap.url, fetched: snap.fetched, count: snap.count },
  }
  return CACHE
}

function similarity(needle: string, hay: string): number {
  if (hay === needle) return 100
  if (hay.startsWith(needle)) return 95
  if (hay.includes(needle)) return 85
  // Token overlap
  const nTokens = needle.split(/\s+/).filter(t => t.length > 2)
  const hTokens = new Set(hay.split(/\s+/))
  if (nTokens.length === 0) return 0
  const hits = nTokens.filter(t => hTokens.has(t)).length
  return Math.round((hits / nTokens.length) * 70)
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '8'), 25)

  if (!q) {
    // No query — return snapshot stats so the dashboard can show "18,976 entities loaded"
    try {
      const snap = await loadSnapshot(url.origin)
      return Response.json({
        ok: true,
        loaded: true,
        ...snap.meta,
        timestamp: new Date().toISOString(),
      })
    } catch (e) {
      return Response.json({ ok: false, error: String(e) }, { status: 500 })
    }
  }

  try {
    const snap = await loadSnapshot(url.origin)
    const needle = q.toLowerCase()
    const hits: Array<{ entity: OFACEntity; score: number }> = []
    for (let i = 0; i < snap.entities.length; i++) {
      const score = similarity(needle, snap.lc[i])
      if (score >= 60) hits.push({ entity: snap.entities[i], score })
    }
    hits.sort((a, b) => b.score - a.score)
    return Response.json({
      query: q,
      total: hits.length,
      results: hits.slice(0, limit).map(h => ({
        id: h.entity.id,
        name: h.entity.name,
        type: h.entity.type,
        program: h.entity.program,
        remarks: h.entity.remarks,
        score: h.score,
        matchLevel: h.score >= 95 ? 'EXACT' : h.score >= 85 ? 'STRONG' : h.score >= 70 ? 'PARTIAL' : 'WEAK',
      })),
      source: snap.meta.source,
      snapshotDate: snap.meta.fetched,
      indexed: snap.meta.count,
      timestamp: new Date().toISOString(),
    })
  } catch (e) {
    return Response.json({ error: 'search failed', detail: String(e) }, { status: 500 })
  }
}
