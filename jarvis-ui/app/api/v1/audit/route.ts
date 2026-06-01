import { NextRequest } from 'next/server'
import { withApiAuth, rateLimitHeaders } from '@/lib/apiHandler'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/v1/audit — body: { question: string }
// Returns PDF binary with X-Merkle-Root + X-Signature
export async function POST(req: NextRequest) {
  const auth = await withApiAuth(req, 'audit')
  if (!auth.ok) return auth.res
  const url = new URL(req.url)
  const body = await req.text()
  const upstream = await fetch(`${url.origin}/api/audit/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
  })
  const buf = await upstream.arrayBuffer()
  const headers: Record<string, string> = {
    ...rateLimitHeaders(auth.ctx),
    'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
  }
  const merkle = upstream.headers.get('x-merkle-root')
  const sig = upstream.headers.get('x-signature')
  if (merkle) headers['X-Merkle-Root'] = merkle
  if (sig) headers['X-Signature'] = sig
  return new Response(buf, { status: upstream.status, headers })
}
