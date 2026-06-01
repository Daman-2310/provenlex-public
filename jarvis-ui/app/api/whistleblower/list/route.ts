// Whistleblower public ledger — every sealed commit is browsable.
// Contents (tip text) only appear once revealed.

import { kv } from '@/lib/kv'

export const runtime = 'edge'

interface TipRecord {
  hash: string
  entity: string
  timestamp: string
  status: 'sealed' | 'revealed'
  revealed_at: string | null
  tip?: string
  salt?: string
}

export async function GET() {
  const hashes = await kv.lrange<string>('whistleblower:ledger', 0, 199)
  const records: TipRecord[] = []
  for (const h of hashes) {
    const r = await kv.get<TipRecord>(`whistleblower:tip:${h}`)
    if (r) records.push(r)
  }
  return Response.json({
    total: records.length,
    sealed: records.filter(r => r.status === 'sealed').length,
    revealed: records.filter(r => r.status === 'revealed').length,
    records,
  })
}
