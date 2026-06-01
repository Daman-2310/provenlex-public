// Genesis Codex .gguf model release waitlist.

import { NextRequest } from 'next/server'
import { kv } from '@/lib/kv'

export const runtime = 'edge'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  let body: { email?: string; intent?: string; org?: string }
  try { body = await req.json() } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }) }

  const email = (body.email ?? '').toLowerCase().trim()
  if (!EMAIL_RE.test(email)) return Response.json({ error: 'invalid_email' }, { status: 400 })

  const record = {
    email,
    intent: (body.intent ?? '').trim().slice(0, 280),
    org: (body.org ?? '').trim().slice(0, 200),
    signed_up_at: new Date().toISOString(),
    ip_country: req.headers.get('x-vercel-ip-country') ?? null,
  }

  await kv.set(`codex:waitlist:${email}`, record, { ex: 60 * 60 * 24 * 365 })
  await kv.lpush('codex:waitlist', email)

  return Response.json({ ok: true, message: 'You are on the list. We will email when the .gguf release is ready.' })
}
