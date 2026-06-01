import { getSession } from '@/lib/auth'
import { kv } from '@/lib/kv'

export const runtime = 'nodejs'

interface AuditRecord {
  id: string
  question: string
  fundCount: number
  fundNames: string[]
  summary: string
  merkleRoot: string
  signature: string
  generatedAt: number
}

export async function GET() {
  const session = await getSession()
  if (!session.email) return Response.json({ error: 'unauthenticated' }, { status: 401 })
  const list = await kv.lrange<AuditRecord>(`user:${session.email}:audits`, 0, 49)
  return Response.json({ items: list })
}
