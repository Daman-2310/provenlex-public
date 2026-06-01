import { NextRequest } from 'next/server'
import { kv } from '@/lib/kv'

export const runtime = 'edge'

interface LogEntry {
  id: string
  subject: string
  scanned_at: string
  risk_level: string
  sentiment_score: number
}

interface ScanArtifact extends LogEntry {
  ofac_hits: number
  swarm_findings: string[]
  verdict: string
  merkle_root: string
}

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')?.trim()
  if (id) {
    const a = await kv.get<ScanArtifact>(`eye:${id}`)
    if (!a) return Response.json({ error: 'not found' }, { status: 404 })
    return Response.json({ artifact: a })
  }
  const recent = await kv.lrange<LogEntry>('eye:log', 0, 99)
  return Response.json({ count: recent.length, entries: recent })
}
