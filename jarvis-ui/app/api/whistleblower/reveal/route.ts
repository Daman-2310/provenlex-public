// Whistleblower reveal — submitter opens their cryptographic commitment.
//
// The commitment was hash = SHA-256(entity || tip || timestamp || salt).
// To reveal, the submitter sends (hash, entity, tip, salt). We recompute,
// verify it matches the sealed hash, and publish the contents.
//
// The cryptographic guarantee: the contents are what was sealed at submission
// time. We could not have read or modified them; we only ever stored the hash.

import { NextRequest } from 'next/server'
import { kv } from '@/lib/kv'

export const runtime = 'edge'

const HASH_RE = /^[a-f0-9]{64}$/i

interface TipRecord {
  hash: string
  entity: string
  timestamp: string
  status: 'sealed' | 'revealed'
  revealed_at: string | null
  tip?: string
  salt?: string
}

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s)
  const hashBuf = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function POST(req: NextRequest) {
  let body: { hash?: string; entity?: string; tip?: string; salt?: string; timestamp?: string }
  try { body = await req.json() } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }) }

  const hash = (body.hash ?? '').toLowerCase().trim()
  const entity = (body.entity ?? '').trim()
  const tip = (body.tip ?? '').trim()
  const salt = (body.salt ?? '').trim()
  const timestamp = (body.timestamp ?? '').trim()

  if (!HASH_RE.test(hash) || !entity || !tip || !salt || !timestamp) {
    return Response.json({ error: 'missing_fields', required: ['hash', 'entity', 'tip', 'salt', 'timestamp'] }, { status: 400 })
  }

  const record = await kv.get<TipRecord>(`whistleblower:tip:${hash}`)
  if (!record) {
    return Response.json({ error: 'commit_not_found', detail: 'No sealed tip with that hash.' }, { status: 404 })
  }
  if (record.status === 'revealed') {
    return Response.json({ error: 'already_revealed', record }, { status: 409 })
  }

  // Recompute the hash to verify the reveal
  const recomputed = await sha256Hex(`${entity}|${tip}|${timestamp}|${salt}`)
  if (recomputed !== hash) {
    return Response.json({
      error: 'verification_failed',
      detail: 'Recomputed hash does not match the sealed commitment.',
      recomputed,
      sealed: hash,
    }, { status: 400 })
  }

  // Update record
  const revealed: TipRecord = {
    ...record,
    status: 'revealed',
    revealed_at: new Date().toISOString(),
    tip,
    salt,
  }
  await kv.set(`whistleblower:tip:${hash}`, revealed, { ex: 60 * 60 * 24 * 365 * 10 })

  return Response.json({ ok: true, record: revealed })
}
