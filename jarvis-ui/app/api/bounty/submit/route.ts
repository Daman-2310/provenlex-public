import { NextRequest } from 'next/server'
import { kv } from '@/lib/kv'
import { sendEmail } from '@/lib/cron'
import { sha256Hex, shortId } from '@/lib/merkle'

export const runtime = 'nodejs'
export const maxDuration = 30

interface SubmitBody {
  email?: string
  entity?: string
  claim?: string
  fooling_strategy?: string
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as SubmitBody
  const email = (body.email ?? '').trim().toLowerCase()
  const entity = (body.entity ?? '').trim()
  const claim = (body.claim ?? '').trim()
  const strat = (body.fooling_strategy ?? '').trim()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: 'valid email required' }, { status: 400 })
  }
  if (!entity || !claim) {
    return Response.json({ error: 'entity and claim required' }, { status: 400 })
  }

  const submittedAt = new Date().toISOString()
  const id = shortId(await sha256Hex(email + entity + submittedAt))

  const submission = {
    id,
    email,
    entity,
    claim: claim.slice(0, 2000),
    fooling_strategy: strat.slice(0, 2000),
    submitted_at: submittedAt,
    status: 'PENDING',
  }
  await kv.set(`bounty:${id}`, submission, { ex: 60 * 60 * 24 * 365 * 5 })
  await kv.lpush('bounty:log', submission)

  // Notify editor
  try {
    await sendEmail(
      'daman.sharma.2310@gmail.com',
      `Genesis Bounty submission · ${entity}`,
      `<p><strong>Submission ${id}</strong></p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Entity:</strong> ${entity}</p>
      <p><strong>Claim:</strong> ${claim}</p>
      <p><strong>Strategy:</strong> ${strat || '(not provided)'}</p>
      <p><strong>Submitted:</strong> ${submittedAt}</p>`,
      `Submission ${id} for ${entity}. Email ${email}. Claim: ${claim}. Strategy: ${strat || 'n/a'}. ts=${submittedAt}`,
    )
  } catch { /* */ }

  return Response.json({ ok: true, id, status: 'PENDING' })
}
