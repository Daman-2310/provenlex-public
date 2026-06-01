import { NextRequest } from 'next/server'
import { vindicationSweep, getVindicationsList, clearAllVindications } from '@/lib/vindicate'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET() {
  const list = await getVindicationsList(100)
  return Response.json({
    total_vindications: list.length,
    vindications: list,
  })
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('x-seal-auth') ?? new URL(req.url).searchParams.get('auth')
  if (process.env.NODE_ENV === 'production' && auth !== (process.env.SEAL_AUTH ?? 'genesis-let-it-rip')) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20')))
  const dryRun = url.searchParams.get('dry') === '1'
  const skipAi = url.searchParams.get('skip_ai') === '1'
  const minConfidence = Math.min(100, Math.max(0, parseInt(url.searchParams.get('min') ?? '70')))

  const result = await vindicationSweep({ limit, dryRun, skipAi, minConfidence })
  return Response.json({
    ok: true,
    settings: { limit, dry_run: dryRun, skip_ai: skipAi, min_confidence: minConfidence },
    checked: result.checked,
    new_hits: result.hits.length,
    hits: result.hits,
    rejected_count: result.rejected.length,
    sample_rejections: result.rejected.slice(0, 10),
    errors: result.errors.slice(0, 10),
  })
}

export async function DELETE(req: NextRequest) {
  const auth = req.headers.get('x-seal-auth') ?? new URL(req.url).searchParams.get('auth')
  if (process.env.NODE_ENV === 'production' && auth !== (process.env.SEAL_AUTH ?? 'genesis-let-it-rip')) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  const cleared = await clearAllVindications()
  return Response.json({ ok: true, cleared })
}
