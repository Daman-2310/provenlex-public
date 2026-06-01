import { NextRequest } from 'next/server'
import { kv } from '@/lib/kv'
import { sendEmail } from '@/lib/cron'

export const runtime = 'nodejs'

interface SignBody {
  organization?: string
  signatory?: string
  email?: string
  role?: string
  jurisdiction?: string
  consent_public?: boolean
}

export async function GET() {
  const list = await kv.lrange<Record<string, unknown>>('coalition:signatures', 0, 199)
  return Response.json({ count: list.length, signatures: list })
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as SignBody
  const organization = (body.organization ?? '').trim()
  const signatory = (body.signatory ?? '').trim()
  const email = (body.email ?? '').trim().toLowerCase()
  const role = (body.role ?? '').trim()
  const jurisdiction = (body.jurisdiction ?? '').trim()
  const consentPublic = body.consent_public === true

  if (!organization || !signatory || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: 'organization, signatory, valid email required' }, { status: 400 })
  }

  const signature = {
    organization,
    signatory,
    email,
    role: role || '—',
    jurisdiction: jurisdiction || '—',
    consent_public: consentPublic,
    signed_at: new Date().toISOString(),
    status: 'PENDING_REVIEW',
  }

  await kv.lpush('coalition:signatures', signature)

  try {
    await sendEmail(
      'daman.sharma.2310@gmail.com',
      `Coalition pledge · ${organization}`,
      `<p>Coalition signature received.</p>
      <p><strong>Organization:</strong> ${organization}<br>
      <strong>Signatory:</strong> ${signatory}<br>
      <strong>Email:</strong> ${email}<br>
      <strong>Role:</strong> ${role || '—'}<br>
      <strong>Jurisdiction:</strong> ${jurisdiction || '—'}<br>
      <strong>Public consent:</strong> ${consentPublic ? 'yes' : 'no (private)'}<br>
      <strong>Signed:</strong> ${signature.signed_at}</p>`,
      `Coalition signature from ${organization} (${signatory}, ${email}). Public: ${consentPublic}. ts=${signature.signed_at}`,
    )
  } catch { /* */ }

  return Response.json({ ok: true })
}
