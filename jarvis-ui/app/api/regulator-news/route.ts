// Public API: live regulator press feed.
//
// GET /api/regulator-news
//   ?source=CSSF       optional filter by source
//   ?entity=Deutsche   optional filter by entity-name mention
//   ?limit=20          optional cap (default 30, max 60)
//
// Returns real CSSF/BaFin/ESMA/EBA/FCA press items, normalised. CDN-cached
// at the edge for 5 minutes.

import { NextRequest } from 'next/server'
import { fetchAllRegulatorNews, filterByEntityMention } from '@/lib/regulator-feeds'
import { enforceRateLimit } from '@/lib/ratelimit'

export const runtime = 'edge'
export const revalidate = 300  // 5 min CDN cache

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, { route: 'regulator-news', limit: 60 })
  if (limited) return limited

  const url = new URL(req.url)
  const source = url.searchParams.get('source')
  const entity = url.searchParams.get('entity')
  const limitParam = url.searchParams.get('limit')
  const limit = Math.min(60, Math.max(1, parseInt(limitParam ?? '30', 10) || 30))

  let items = await fetchAllRegulatorNews(12)

  if (source) {
    const want = source.toUpperCase()
    items = items.filter(it => it.source === want)
  }

  if (entity) {
    items = filterByEntityMention(items, [entity])
  }

  return Response.json(
    {
      ok: true,
      fetched_at: new Date().toISOString(),
      sources_queried: ['CSSF', 'BaFin', 'ESMA', 'EBA', 'FCA'],
      total: items.length,
      items: items.slice(0, limit),
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300',
        'Access-Control-Allow-Origin': '*',
      },
    },
  )
}
