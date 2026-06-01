// Genesis Witness — board members publicly attest to having reviewed a
// specific operational-risk prophecy.
//
// This is not a legal instrument. It is a public timestamped acknowledgement.
// Board members who sign early and are later vindicated have a paper trail
// proving due diligence. Board members at entities that later collapse who
// DID NOT sign have a contrary paper trail.

import { NextRequest } from 'next/server'
import { kv } from '@/lib/kv'
import { BOOK_SNAPSHOT_ENTRIES } from '@/lib/book-snapshot'

export const runtime = 'edge'

interface WitnessRecord {
  attestation_id: string       // sha256 of canonical record
  prophecy_id: string
  prophecy_entity: string
  signer_name: string
  signer_email_hash: string    // optional, hashed
  fund_name: string
  role: string
  jurisdiction: string
  acknowledgement: string
  signed_at: string
  ip_country: string | null
}

const MAX_NAME = 120
const MAX_FUND = 200
const MAX_ROLE = 80
const MAX_ACK = 500

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s)
  const hashBuf = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function POST(req: NextRequest) {
  let body: { prophecy_id?: string; signer_name?: string; signer_email?: string; fund_name?: string; role?: string; jurisdiction?: string; acknowledgement?: string }
  try { body = await req.json() } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }) }

  const prophecy_id = (body.prophecy_id ?? '').trim()
  const signer_name = (body.signer_name ?? '').trim()
  const signer_email = (body.signer_email ?? '').trim()
  const fund_name = (body.fund_name ?? '').trim()
  const role = (body.role ?? '').trim()
  const jurisdiction = (body.jurisdiction ?? '').trim().toUpperCase()
  const acknowledgement = (body.acknowledgement ?? '').trim()

  if (!prophecy_id || !signer_name || !fund_name || !role || !acknowledgement) {
    return Response.json({ error: 'missing_fields', required: ['prophecy_id', 'signer_name', 'fund_name', 'role', 'acknowledgement'] }, { status: 400 })
  }
  if (signer_name.length > MAX_NAME) return Response.json({ error: 'signer_name_too_long' }, { status: 400 })
  if (fund_name.length > MAX_FUND) return Response.json({ error: 'fund_name_too_long' }, { status: 400 })
  if (role.length > MAX_ROLE) return Response.json({ error: 'role_too_long' }, { status: 400 })
  if (acknowledgement.length > MAX_ACK) return Response.json({ error: 'acknowledgement_too_long' }, { status: 400 })
  if (acknowledgement.length < 30) return Response.json({ error: 'acknowledgement_too_short', detail: 'Min 30 chars — please write your full attestation.' }, { status: 400 })

  // Verify prophecy_id is in the Book
  const prophecy = BOOK_SNAPSHOT_ENTRIES.find(e => e.prophecy_id === prophecy_id)
  if (!prophecy) return Response.json({ error: 'prophecy_not_found' }, { status: 404 })

  const signed_at = new Date().toISOString()
  const ip_country = req.headers.get('x-vercel-ip-country') ?? null

  const signer_email_hash = signer_email ? await sha256Hex(signer_email.toLowerCase()) : ''

  // Canonical record for hashing (excluding ip_country & hash itself)
  const canonical = [
    prophecy_id,
    prophecy.candidate.name,
    signer_name,
    signer_email_hash,
    fund_name,
    role,
    jurisdiction,
    acknowledgement,
    signed_at,
  ].join('|')
  const attestation_id = await sha256Hex(canonical)

  const record: WitnessRecord = {
    attestation_id,
    prophecy_id,
    prophecy_entity: prophecy.candidate.name,
    signer_name,
    signer_email_hash,
    fund_name,
    role,
    jurisdiction,
    acknowledgement,
    signed_at,
    ip_country,
  }

  await kv.set(`witness:attestation:${attestation_id}`, record, { ex: 60 * 60 * 24 * 365 * 10 })
  await kv.lpush('witness:ledger', attestation_id)
  // Per-prophecy index
  await kv.lpush(`witness:prophecy:${prophecy_id}`, attestation_id)

  return Response.json({ ok: true, record })
}
