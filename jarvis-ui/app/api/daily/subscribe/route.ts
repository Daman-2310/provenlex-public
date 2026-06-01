import { NextRequest } from 'next/server'
import { addSubscriber, sendEmail } from '@/lib/cron'
import { buildBriefingPayload, renderBriefingHtml, renderBriefingText } from '@/lib/daily'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; send_sample?: boolean }
  const email = (body.email ?? '').trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: 'valid email required' }, { status: 400 })
  }

  await addSubscriber(email)

  // Send confirmation + sample brief if requested (default true)
  if (body.send_sample !== false) {
    try {
      const origin = new URL(req.url).origin
      const payload = await buildBriefingPayload()
      const html = renderBriefingHtml(payload, origin)
      const text = renderBriefingText(payload, origin)
      await sendEmail(email,
        'Welcome to the Genesis Daily — sample brief inside',
        html,
        text,
      )
    } catch (e) {
      // Subscription succeeded; sample send failed silently
      console.error('[daily/subscribe] sample send failed', e)
    }
  }

  return Response.json({ ok: true, email, sample_sent: body.send_sample !== false })
}
