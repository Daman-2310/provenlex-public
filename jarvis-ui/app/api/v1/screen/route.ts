import { NextRequest } from 'next/server'
import { withApiAuth, rateLimitHeaders } from '@/lib/apiHandler'

export const runtime = 'nodejs'

// GET /api/v1/screen?q=ROSNEFT&limit=5
export async function GET(req: NextRequest) {
  const auth = await withApiAuth(req, 'screen')
  if (!auth.ok) return auth.res
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  const limit = url.searchParams.get('limit') ?? '8'
  if (!q) return Response.json({ error: 'q required' }, { status: 400, headers: rateLimitHeaders(auth.ctx) })

  const upstream = await fetch(`${url.origin}/api/real/sanctions?q=${encodeURIComponent(q)}&limit=${limit}`)
  const data = await upstream.json()
  return Response.json({ ...data, _api: { version: 'v1', endpoint: 'screen' } }, { headers: rateLimitHeaders(auth.ctx) })
}
