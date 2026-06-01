// Reverse Onboarding — entities apply (and pay) to be added to the Book.
//
// The Yelp-business-claim model: as LP demand for Genesis scores grows,
// absence from the Book becomes suspicious. Entities pay to be scored to
// clear their name.

import { NextRequest } from 'next/server'
import { kv } from '@/lib/kv'

export const runtime = 'edge'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const VALID_TIERS = ['standard', 'premium'] as const
type Tier = typeof VALID_TIERS[number]

interface OnboardApplication {
  application_id: string
  entity_name: string
  lei: string | null
  jurisdiction: string
  category: string
  contact_name: string
  contact_role: string
  contact_email: string
  tier: Tier
  motivation: string
  applied_at: string
  status: 'pending_review' | 'invoiced' | 'live' | 'declined'
  ip_country: string | null
}

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s)
  const hashBuf = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }) }

  const entity_name = String(body.entity_name ?? '').trim()
  const lei = String(body.lei ?? '').trim() || null
  const jurisdiction = String(body.jurisdiction ?? '').trim().toUpperCase()
  const category = String(body.category ?? '').trim()
  const contact_name = String(body.contact_name ?? '').trim()
  const contact_role = String(body.contact_role ?? '').trim()
  const contact_email = String(body.contact_email ?? '').toLowerCase().trim()
  const tier = (String(body.tier ?? 'standard').trim() as Tier)
  const motivation = String(body.motivation ?? '').trim()

  if (!entity_name) return Response.json({ error: 'missing_entity_name' }, { status: 400 })
  if (entity_name.length > 200) return Response.json({ error: 'entity_name_too_long' }, { status: 400 })
  if (!jurisdiction || jurisdiction.length !== 2) return Response.json({ error: 'invalid_jurisdiction', detail: 'Use 2-letter ISO code (LU, DE, FR, etc.)' }, { status: 400 })
  if (!category) return Response.json({ error: 'missing_category' }, { status: 400 })
  if (!contact_name) return Response.json({ error: 'missing_contact_name' }, { status: 400 })
  if (!contact_role) return Response.json({ error: 'missing_contact_role' }, { status: 400 })
  if (!EMAIL_RE.test(contact_email)) return Response.json({ error: 'invalid_email' }, { status: 400 })
  if (!VALID_TIERS.includes(tier)) return Response.json({ error: 'invalid_tier' }, { status: 400 })
  if (motivation.length > 1500) return Response.json({ error: 'motivation_too_long' }, { status: 400 })

  const applied_at = new Date().toISOString()
  const canonical = `${entity_name}|${lei ?? ''}|${jurisdiction}|${category}|${contact_email}|${applied_at}`
  const application_id = (await sha256Hex(canonical)).slice(0, 24)

  const record: OnboardApplication = {
    application_id,
    entity_name,
    lei,
    jurisdiction,
    category,
    contact_name,
    contact_role,
    contact_email,
    tier,
    motivation,
    applied_at,
    status: 'pending_review',
    ip_country: req.headers.get('x-vercel-ip-country') ?? null,
  }

  await kv.set(`claim:application:${application_id}`, record, { ex: 60 * 60 * 24 * 365 * 5 })
  await kv.lpush('claim:applications', application_id)

  return Response.json({
    ok: true,
    application_id,
    next_steps: 'Our team will review and email you an invoice within 5 business days. Standard tier is €5,000 one-time + €1,000/yr. Premium is €15,000 + €3,000/yr.',
    record,
  })
}
