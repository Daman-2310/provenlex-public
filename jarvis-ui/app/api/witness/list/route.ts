// Genesis Witness public ledger.
//
// All attestations are public. Optionally filter by prophecy_id.

import { NextRequest } from 'next/server'
import { kv } from '@/lib/kv'

export const runtime = 'edge'

interface WitnessRecord {
  attestation_id: string
  prophecy_id: string
  prophecy_entity: string
  signer_name: string
  signer_email_hash: string
  fund_name: string
  role: string
  jurisdiction: string
  acknowledgement: string
  signed_at: string
  ip_country: string | null
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const prophecy_id = url.searchParams.get('prophecy_id')

  const listKey = prophecy_id ? `witness:prophecy:${prophecy_id}` : 'witness:ledger'
  const ids = await kv.lrange<string>(listKey, 0, 199)

  const records: WitnessRecord[] = []
  for (const id of ids) {
    const r = await kv.get<WitnessRecord>(`witness:attestation:${id}`)
    if (r) records.push(r)
  }

  return Response.json({
    total: records.length,
    filter: prophecy_id ?? null,
    records,
  })
}
