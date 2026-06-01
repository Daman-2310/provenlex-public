// Helpers for cron jobs — auth, user iteration, Slack/email delivery.
import { NextRequest } from 'next/server'
import { kv } from './kv'
import { Resend } from 'resend'
import { getSession } from './auth'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM = process.env.EMAIL_FROM ?? 'Genesis Swarm <onboarding@resend.dev>'
const CRON_SECRET = process.env.CRON_SECRET

export async function authorizeCron(req: NextRequest): Promise<boolean> {
  // 1. Vercel cron injects Authorization: Bearer ${CRON_SECRET}
  if (CRON_SECRET) {
    const auth = req.headers.get('authorization')
    if (auth === `Bearer ${CRON_SECRET}`) return true
  } else {
    // No secret set — dev mode, allow
    return true
  }
  // 2. Also allow signed-in users (so dashboard can manually trigger)
  try {
    const session = await getSession()
    if (session.email) return true
  } catch { /* ignore */ }
  return false
}

export async function getActiveSubscribers(): Promise<string[]> {
  // Iterate subscriber-emails:* keys. With in-memory fallback this works on each instance;
  // with real KV this is via SCAN.
  // For simplicity, we maintain a single 'all-subscribers' list.
  const list = await kv.lrange<string>('all-subscribers', 0, 999)
  return Array.from(new Set(list))
}

export async function addSubscriber(email: string): Promise<void> {
  const existing = await kv.lrange<string>('all-subscribers', 0, 999)
  if (!existing.includes(email)) {
    await kv.lpush('all-subscribers', email)
  }
}

export async function sendSlackMessage(webhook: string, text: string, blocks?: unknown[]): Promise<boolean> {
  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, blocks }),
    })
    return res.ok
  } catch { return false }
}

export async function sendEmail(to: string, subject: string, html: string, text?: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log(`[cron-email] would send to ${to}: ${subject}`)
    return false
  }
  try {
    const client = new Resend(RESEND_API_KEY)
    await client.emails.send({ from: FROM, to, subject, html, text })
    return true
  } catch (e) {
    console.error('[cron-email] resend failed', e)
    return false
  }
}
