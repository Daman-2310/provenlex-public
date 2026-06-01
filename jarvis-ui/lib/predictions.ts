// Pre-registered live predictions.
//
// Curated forecasts that pull from the Book of Genesis snapshot — these are
// the 10 *highest-Pre-Crime-Index* entities at sealing time. Each is presented
// as a specific, dated, falsifiable prediction.
//
// The list is generated from BOOK_SNAPSHOT so it stays consistent with what
// is publicly displayed on /book. The Bitcoin anchor (Merkle root) lives at
// the Book level, not per-prediction — anyone can verify by recomputing the
// Book Merkle root from the snapshot.

import { BOOK_SNAPSHOT_MANIFEST, BOOK_SNAPSHOT_ENTRIES } from '@/lib/book-snapshot'
import type { BookEntry } from '@/lib/book'

export interface LivePrediction {
  id: string                       // shortId(prophecy)
  rank: number
  entity: string
  lei?: string
  jurisdiction: string
  category: string
  pre_crime_index: number
  trajectory: string
  claim: string
  reasoning: string
  sealed_at: string                // ISO
  reveal_window_end: string        // ISO (sealed_at + 18 months)
  bitcoin_anchor_status: string
  book_merkle_root: string
  status: 'PENDING' | 'VINDICATED' | 'MISSED'
}

function plus18Months(iso: string): string {
  const d = new Date(iso)
  d.setUTCMonth(d.getUTCMonth() + 18)
  return d.toISOString()
}

function buildClaim(e: BookEntry): string {
  const pct = e.pre_crime_index
  if (pct >= 80) return `Material operational distress event (regulator action, restatement, or insolvency) is expected within 12 months.`
  if (pct >= 65) return `Elevated likelihood of regulatory enforcement, restated financials, or governance shock within 18 months.`
  if (pct >= 50) return `Structural risk indicators elevated; supervisory monitoring or executive disclosure likely within 18 months.`
  return `Operational-risk indicators present but moderate; watchlist status with no specific near-term action forecast.`
}

function buildReasoning(e: BookEntry): string {
  const pattern = e.pattern_match ? `Pattern match against historical archetype: ${e.pattern_match}. ` : ''
  return `${pattern}${e.forecast}`
}

export function listPredictions(): LivePrediction[] {
  if (!BOOK_SNAPSHOT_MANIFEST) return []
  // Top 10 by Pre-Crime Index from the sealed Book
  const sorted = [...BOOK_SNAPSHOT_ENTRIES].sort((a, b) => b.pre_crime_index - a.pre_crime_index).slice(0, 10)
  const sealedAt = BOOK_SNAPSHOT_MANIFEST.sealed_at
  const reveal = plus18Months(sealedAt)

  return sorted.map(e => ({
    id: e.prophecy_id,
    rank: e.rank,
    entity: e.candidate.name,
    lei: e.candidate.lei,
    jurisdiction: e.candidate.jurisdiction,
    category: e.candidate.category,
    pre_crime_index: e.pre_crime_index,
    trajectory: e.trajectory,
    claim: buildClaim(e),
    reasoning: buildReasoning(e),
    sealed_at: sealedAt,
    reveal_window_end: reveal,
    bitcoin_anchor_status: BOOK_SNAPSHOT_MANIFEST.ots_status,
    book_merkle_root: BOOK_SNAPSHOT_MANIFEST.merkle_root,
    status: 'PENDING',
  }))
}

export function getPrediction(id: string): LivePrediction | null {
  return listPredictions().find(p => p.id === id) ?? null
}
