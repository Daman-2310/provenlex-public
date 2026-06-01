import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { kv, kvMode } from '@/lib/kv'
import crypto from 'crypto'

export const runtime = 'nodejs'

interface SavedAnalysis {
  id: string
  savedAt: number
  fundName: string
  fundType?: string
  domicile?: string
  complianceScore: number
  verdict: string
  source: 'analyzer' | 'manual'
}

function userKey(email: string): string {
  return `user:${email}:analyses`
}

export async function GET() {
  const session = await getSession()
  if (!session.email) return Response.json({ error: 'unauthenticated' }, { status: 401 })
  const list = await kv.lrange<SavedAnalysis>(userKey(session.email), 0, 49)
  return Response.json({
    items: list,
    persistence: kvMode,
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session.email) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  let body: Partial<SavedAnalysis>
  try { body = await req.json() } catch { return Response.json({ error: 'invalid json' }, { status: 400 }) }

  if (!body.fundName || typeof body.complianceScore !== 'number') {
    return Response.json({ error: 'missing fundName or complianceScore' }, { status: 400 })
  }

  const saved: SavedAnalysis = {
    id: crypto.randomBytes(8).toString('hex'),
    savedAt: Date.now(),
    fundName: body.fundName,
    fundType: body.fundType,
    domicile: body.domicile,
    complianceScore: body.complianceScore,
    verdict: body.verdict ?? '',
    source: body.source ?? 'analyzer',
  }
  await kv.lpush(userKey(session.email), saved)
  return Response.json({ ok: true, saved })
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session.email) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return Response.json({ error: 'missing id' }, { status: 400 })

  const list = await kv.lrange<SavedAnalysis>(userKey(session.email), 0, 49)
  const match = list.find(a => a.id === id)
  if (!match) return Response.json({ error: 'not found' }, { status: 404 })

  await kv.lrem(userKey(session.email), 1, match)
  return Response.json({ ok: true })
}
