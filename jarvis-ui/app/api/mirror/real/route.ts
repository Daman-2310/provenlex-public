// Returns REAL ingested prospectus claims for an entity, if any exist.
// GET /api/mirror/real?id=<prophecy_id>
//
// Used by the Mirror entity page (client side) to surface a "real extracted
// claims" panel above the synthetic model when a document has been ingested.

import { NextRequest } from 'next/server'
import { getRealMirror } from '@/lib/prospectus-real'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return Response.json({ error: 'missing_id' }, { status: 400 })

  const real = await getRealMirror(id)
  if (!real) {
    return Response.json({ ok: true, has_real: false }, {
      headers: { 'Cache-Control': 'public, max-age=120' },
    })
  }
  return Response.json({ ok: true, has_real: true, ...real }, {
    headers: { 'Cache-Control': 'public, max-age=120' },
  })
}
