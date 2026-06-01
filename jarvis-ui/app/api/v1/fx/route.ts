import { NextRequest } from 'next/server'
import { withApiAuth, rateLimitHeaders } from '@/lib/apiHandler'

export const runtime = 'nodejs'

// GET /api/v1/fx
export async function GET(req: NextRequest) {
  const auth = await withApiAuth(req, 'fx')
  if (!auth.ok) return auth.res
  const url = new URL(req.url)
  const upstream = await fetch(`${url.origin}/api/real/fx`)
  const data = await upstream.json()
  return Response.json({ ...data, _api: { version: 'v1', endpoint: 'fx' } }, { headers: rateLimitHeaders(auth.ctx) })
}
