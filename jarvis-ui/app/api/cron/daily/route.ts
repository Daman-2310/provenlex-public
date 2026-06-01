// THE GENESIS DAILY — daily broadcast. Triggered by vercel.json cron.
// Generates payload once, renders HTML + text, sends to all subscribers.
import { NextRequest } from 'next/server'
import { authorizeCron, getActiveSubscribers, sendEmail } from '@/lib/cron'
import { buildBriefingPayload, renderBriefingHtml, renderBriefingText } from '@/lib/daily'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const ok = await authorizeCron(req)
  if (!ok) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const subs = await getActiveSubscribers()
  if (subs.length === 0) {
    return Response.json({ ok: true, sent: 0, note: 'no subscribers' })
  }

  const origin = new URL(req.url).origin
  const payload = await buildBriefingPayload()
  const html = renderBriefingHtml(payload, origin)
  const text = renderBriefingText(payload, origin)

  let sent = 0
  for (const email of subs) {
    const ok = await sendEmail(email, `Genesis Daily · ${payload.date}`, html, text)
    if (ok) sent++
  }

  return Response.json({
    ok: true,
    ran_at: new Date().toISOString(),
    date: payload.date,
    total_subscribers: subs.length,
    sent,
    movers: payload.topRiskMovers.map(e => `${e.candidate.name} (${e.pre_crime_index})`),
    vindications_count: payload.vindications.length,
  })
}
