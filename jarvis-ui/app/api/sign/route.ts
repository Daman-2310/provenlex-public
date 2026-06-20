import { NextResponse } from 'next/server'
import { signMessage, publicKeyPem, publicKeyBase64 } from '@/lib/signing'
import { enforceRateLimit } from '@/lib/ratelimit'

// Real Ed25519 signing of compliance artifacts. POST a message (e.g. a vault
// Merkle root) to receive a verifiable signature; GET to fetch the public key.
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const limited = await enforceRateLimit(req, { route: 'sign', limit: 60 })
  if (limited) return limited
  return NextResponse.json({
    alg: 'Ed25519',
    publicKeyPem: publicKeyPem(),
    publicKeyBase64: publicKeyBase64(),
    note: 'Verify any ProvenLex signature against this key with standard Ed25519.',
  })
}

export async function POST(req: Request) {
  const limited = await enforceRateLimit(req, { route: 'sign', limit: 30 })
  if (limited) return limited
  let body: { message?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }) }
  const message = body?.message
  if (typeof message !== 'string' || message.length === 0) {
    return NextResponse.json({ error: 'message (non-empty string) required.' }, { status: 400 })
  }
  if (message.length > 100_000) {
    return NextResponse.json({ error: 'message too large (max 100k chars).' }, { status: 413 })
  }
  return NextResponse.json(signMessage(message))
}
