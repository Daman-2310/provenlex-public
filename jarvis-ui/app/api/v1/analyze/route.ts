import { NextRequest } from 'next/server'
import { withApiAuth, rateLimitHeaders } from '@/lib/apiHandler'

export const runtime = 'nodejs'
export const maxDuration = 30

// POST /api/v1/analyze — multipart/form-data with `file` field (PDF up to 8MB)
// Returns JSON: { filename, pageCount, analysis: { ... } }
export async function POST(req: NextRequest) {
  const auth = await withApiAuth(req, 'analyze')
  if (!auth.ok) return auth.res
  const url = new URL(req.url)

  // Forward multipart body as-is
  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.startsWith('multipart/form-data')) {
    return Response.json({ error: 'multipart/form-data required' }, { status: 400, headers: rateLimitHeaders(auth.ctx) })
  }
  const upstream = await fetch(`${url.origin}/api/analyze/prospectus`, {
    method: 'POST', headers: { 'Content-Type': contentType }, body: req.body, duplex: 'half',
  } as RequestInit & { duplex: string })
  const data = await upstream.json()
  return Response.json({ ...data, _api: { version: 'v1', endpoint: 'analyze' } }, {
    status: upstream.status,
    headers: rateLimitHeaders(auth.ctx),
  })
}
