import { NextRequest } from 'next/server'
import { kv } from '@/lib/kv'
import { sha256Hex, shortId } from '@/lib/merkle'

export const runtime = 'edge'

// THE GENESIS FEDERATION — accept score submissions from other compliance tools.
// Each submission is hashed, timestamped, and added to a public ledger so partners
// get distribution and Genesis becomes the aggregator. POST a JSON payload with:
//   - publisher_name: who you are (e.g. "ComplyAdvantage", "Sumsub")
//   - publisher_api_key: optional shared-secret key (rate-limit + spam control)
//   - subject_name: the entity being scored
//   - subject_lei: optional GLEIF LEI
//   - score: 0-100 (your scoring system, higher = better OR worse — declare which)
//   - score_direction: "higher_better" or "higher_worse"
//   - confidence: 0-100 your own confidence
//   - source_url: link to your full report
//   - methodology_url: link to your methodology
//   - notes: free-text (max 500 chars)

interface FedSubmission {
  publisher_name: string
  publisher_api_key?: string
  subject_name: string
  subject_lei?: string
  score: number
  score_direction: 'higher_better' | 'higher_worse'
  confidence: number
  source_url: string
  methodology_url?: string
  notes?: string
}

export async function POST(req: NextRequest) {
  let body: FedSubmission
  try { body = await req.json() as FedSubmission }
  catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }) }

  // Required field check
  if (!body.publisher_name || !body.subject_name || typeof body.score !== 'number'
      || !body.score_direction || !body.source_url) {
    return Response.json({
      error: 'missing required fields',
      required: ['publisher_name', 'subject_name', 'score', 'score_direction', 'source_url'],
    }, { status: 400 })
  }

  if (body.score < 0 || body.score > 100) {
    return Response.json({ error: 'score must be 0-100' }, { status: 400 })
  }

  const submittedAt = new Date().toISOString()
  const hash = await sha256Hex(JSON.stringify(body) + submittedAt)
  const id = shortId(hash)

  const record = {
    id,
    publisher_name: body.publisher_name.trim(),
    subject_name: body.subject_name.trim(),
    subject_lei: body.subject_lei?.trim().toUpperCase() ?? null,
    score: Math.round(body.score),
    score_direction: body.score_direction,
    confidence: Math.max(0, Math.min(100, Math.round(body.confidence ?? 50))),
    source_url: body.source_url,
    methodology_url: body.methodology_url ?? null,
    notes: (body.notes ?? '').slice(0, 500),
    submitted_at: submittedAt,
    hash,
  }

  await kv.set(`federation:${id}`, record, { ex: 60 * 60 * 24 * 365 * 5 })
  await kv.lpush('federation:log', record)

  return Response.json({
    ok: true,
    id,
    hash,
    submitted_at: submittedAt,
    public_url: `/federation/${id}`,
  })
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')?.trim()
  if (id) {
    const r = await kv.get(`federation:${id}`)
    if (!r) return Response.json({ error: 'not found' }, { status: 404 })
    return Response.json(r)
  }
  const list = await kv.lrange<Record<string, unknown>>('federation:log', 0, 99)
  return Response.json({ count: list.length, submissions: list })
}
