// Whistleblower submission — accepts a cryptographic commitment to a tip.
//
// The client computes hash = SHA-256(entity || tip || timestamp || salt) and
// sends ONLY the hash + entity + timestamp here. The tip itself never leaves
// the submitter's browser. This means:
//   1. We literally cannot read the tip (no plaintext on our servers).
//   2. We cannot be subpoenaed for its contents.
//   3. The submitter holds the salt — only they can later "open" the commit
//      by submitting (entity, tip, salt) to /api/whistleblower/reveal,
//      at which point the hash equation proves the tip is what was sealed.

import { NextRequest } from 'next/server'
import { kv } from '@/lib/kv'

export const runtime = 'edge'

const HASH_RE = /^[a-f0-9]{64}$/i
const MAX_ENTITY_LEN = 200

interface TipRecord {
  hash: string
  entity: string
  timestamp: string  // ISO when sealed
  status: 'sealed' | 'revealed'
  revealed_at: string | null
  tip?: string       // populated only on reveal
  salt?: string      // populated only on reveal
}

export async function POST(req: NextRequest) {
  let body: { hash?: string; entity?: string; timestamp?: string }
  try { body = await req.json() } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }) }

  const hash = (body.hash ?? '').toLowerCase().trim()
  const entity = (body.entity ?? '').trim()
  const timestamp = (body.timestamp ?? '').trim()

  if (!HASH_RE.test(hash)) {
    return Response.json({ error: 'invalid_hash', detail: 'Expected 64 hex chars (SHA-256).' }, { status: 400 })
  }
  if (!entity || entity.length > MAX_ENTITY_LEN) {
    return Response.json({ error: 'invalid_entity' }, { status: 400 })
  }
  // Validate timestamp is roughly within last 60s — prevents pre-computing old commits
  const tsMs = Date.parse(timestamp)
  if (!isFinite(tsMs)) return Response.json({ error: 'invalid_timestamp' }, { status: 400 })
  const drift = Math.abs(Date.now() - tsMs)
  if (drift > 60_000) {
    return Response.json({ error: 'timestamp_drift', detail: 'Client timestamp must be within 60s of server time.' }, { status: 400 })
  }

  // Reject duplicates (same hash already sealed)
  const existing = await kv.get<TipRecord>(`whistleblower:tip:${hash}`)
  if (existing) {
    return Response.json({ error: 'already_sealed', record: existing }, { status: 409 })
  }

  const record: TipRecord = {
    hash,
    entity,
    timestamp: new Date(tsMs).toISOString(),
    status: 'sealed',
    revealed_at: null,
  }

  // Persist
  await kv.set(`whistleblower:tip:${hash}`, record, { ex: 60 * 60 * 24 * 365 * 10 }) // 10y
  await kv.lpush('whistleblower:ledger', hash)

  return Response.json({
    ok: true,
    record,
    explainer: 'Save your tip text + salt locally. To reveal later, POST (hash, entity, tip, salt) to /api/whistleblower/reveal.',
  })
}
