// Genesis Morning Orchestrator — single cron tick that runs:
//   1. Vindication sweep (Google News scan over Book entries)
//   2. Genesis Daily broadcast (email subscribers the morning brief)
// Consolidated into one route to fit Vercel Hobby's 2-cron limit.
import { NextRequest } from 'next/server'
import { authorizeCron, getActiveSubscribers, sendEmail } from '@/lib/cron'
import { vindicationSweep } from '@/lib/vindicate'
import { buildBriefingPayload, renderBriefingHtml, renderBriefingText } from '@/lib/daily'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const ok = await authorizeCron(req)
  if (!ok) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const startedAt = Date.now()
  const ranAt = new Date().toISOString()
  const origin = new URL(req.url).origin

  // Phase 1 — Vindication sweep (politely paced, 30 entities/tick)
  let vindResult: Awaited<ReturnType<typeof vindicationSweep>> = { checked: 0, hits: [], rejected: [], errors: [] }
  try {
    vindResult = await vindicationSweep({ limit: 30 })
  } catch (e) {
    vindResult = { checked: 0, hits: [], rejected: [], errors: [String(e).slice(0, 200)] }
  }

  // Phase 2 — Genesis Daily broadcast
  let dailyResult = { total_subscribers: 0, sent: 0, date: '', error: undefined as string | undefined }
  try {
    const subs = await getActiveSubscribers()
    if (subs.length > 0) {
      const payload = await buildBriefingPayload()
      const html = renderBriefingHtml(payload, origin)
      const text = renderBriefingText(payload, origin)
      let sent = 0
      for (const email of subs) {
        const ok = await sendEmail(email, `Genesis Daily · ${payload.date}`, html, text)
        if (ok) sent++
      }
      dailyResult = { total_subscribers: subs.length, sent, date: payload.date, error: undefined }
    } else {
      dailyResult = { total_subscribers: 0, sent: 0, date: new Date().toISOString().slice(0, 10), error: undefined }
    }
  } catch (e) {
    dailyResult = { total_subscribers: 0, sent: 0, date: '', error: String(e).slice(0, 200) }
  }

  return Response.json({
    ok: true,
    ran_at: ranAt,
    elapsed_ms: Date.now() - startedAt,
    vindication: {
      checked: vindResult.checked,
      new_hits: vindResult.hits.length,
      hit_subjects: vindResult.hits.map(h => h.subject),
      errors: vindResult.errors.slice(0, 5),
    },
    daily: dailyResult,
  })
}
