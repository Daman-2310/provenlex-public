// Daily Vindication Engine sweep.
// Scheduled by vercel.json. Manually triggerable by signed-in users or with CRON_SECRET.
import { NextRequest } from 'next/server'
import { authorizeCron } from '@/lib/cron'
import { vindicationSweep } from '@/lib/vindicate'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const ok = await authorizeCron(req)
  if (!ok) return Response.json({ error: 'unauthorized' }, { status: 401 })

  // Sweep up to 30 entries per cron tick (politely paced). KV de-dupes already-vindicated.
  const result = await vindicationSweep({ limit: 30 })
  return Response.json({
    ok: true,
    ran_at: new Date().toISOString(),
    checked: result.checked,
    new_hits: result.hits.length,
    sample: result.hits.slice(0, 5),
    error_count: result.errors.length,
  })
}
