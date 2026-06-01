import { NextRequest } from 'next/server'
import { createMagicToken } from '@/lib/auth'
import { sendMagicLink } from '@/lib/email'

export const runtime = 'nodejs'

function validEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length < 200
}

export async function POST(req: NextRequest) {
  let body: { email?: string }
  try { body = await req.json() } catch { return Response.json({ error: 'invalid json' }, { status: 400 }) }

  const email = (body.email ?? '').trim().toLowerCase()
  if (!validEmail(email)) return Response.json({ error: 'invalid email' }, { status: 400 })

  const token = createMagicToken(email)
  const origin = new URL(req.url).origin
  const link = `${origin}/api/auth/verify?token=${token}`

  const result = await sendMagicLink(email, link)

  // In dev/console mode return the link directly so user can click it
  // In production with Resend, never expose the token in the response
  const expose = !result.delivered
  return Response.json({
    sent: result.delivered,
    via: result.via,
    // The inline link is shown ONLY when email delivery is unavailable
    // (e.g. RESEND_API_KEY not set). Lets you test the flow end-to-end.
    devLink: expose ? link : undefined,
    devNotice: expose ? 'Email delivery not configured — use the dev link to verify' : undefined,
  })
}
