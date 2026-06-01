// Public list of pending Reverse Onboarding applications.
//
// Only minimal fields are exposed (entity name, jurisdiction, category, tier,
// status, applied_at). Contact details and motivation are never public.

import { kv } from '@/lib/kv'

export const runtime = 'edge'

interface OnboardApplication {
  application_id: string
  entity_name: string
  jurisdiction: string
  category: string
  tier: 'standard' | 'premium'
  status: string
  applied_at: string
  contact_email: string
  contact_name: string
  contact_role: string
  motivation: string
  lei: string | null
  ip_country: string | null
}

export async function GET() {
  const ids = await kv.lrange<string>('claim:applications', 0, 199)
  const records = []
  for (const id of ids) {
    const r = await kv.get<OnboardApplication>(`claim:application:${id}`)
    if (r) {
      // Strip private fields
      records.push({
        application_id: r.application_id,
        entity_name: r.entity_name,
        jurisdiction: r.jurisdiction,
        category: r.category,
        tier: r.tier,
        status: r.status,
        applied_at: r.applied_at,
        lei: r.lei,
      })
    }
  }
  return Response.json({ total: records.length, records })
}
