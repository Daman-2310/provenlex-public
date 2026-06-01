import { NextRequest } from 'next/server'
import { withApiAuth, rateLimitHeaders } from '@/lib/apiHandler'

export const runtime = 'nodejs'

// GET /api/v1/lei?lei=549300...   or   /api/v1/lei?q=BlackRock
export async function GET(req: NextRequest) {
  const auth = await withApiAuth(req, 'lei')
  if (!auth.ok) return auth.res
  const url = new URL(req.url)
  const lei = url.searchParams.get('lei')
  const q = url.searchParams.get('q')
  if (!lei && !q) return Response.json({ error: 'lei or q required' }, { status: 400, headers: rateLimitHeaders(auth.ctx) })

  const path = lei ? `lei=${encodeURIComponent(lei)}` : `q=${encodeURIComponent(q!)}`
  const upstream = await fetch(`${url.origin}/api/real/gleif?${path}`)
  const data = await upstream.json()
  return Response.json({ ...data, _api: { version: 'v1', endpoint: 'lei' } }, {
    status: upstream.status,
    headers: rateLimitHeaders(auth.ctx),
  })
}
