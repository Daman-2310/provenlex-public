import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { kv } from '@/lib/kv'
import { addSubscriber } from '@/lib/cron'

export const runtime = 'nodejs'

export interface AlertPreferences {
  email: string
  slackWebhook?: string
  emailAlerts: boolean
  dailyBriefing: boolean
  alertOnNewSanctions: boolean
  alertOnDoraDeadlines: boolean
  updatedAt: number
}

const prefsKey = (email: string) => `user:${email}:alert-prefs`

export async function GET() {
  const session = await getSession()
  if (!session.email) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const prefs = await kv.get<AlertPreferences>(prefsKey(session.email))
  return Response.json({
    prefs: prefs ?? {
      email: session.email,
      emailAlerts: true,
      dailyBriefing: true,
      alertOnNewSanctions: true,
      alertOnDoraDeadlines: true,
      updatedAt: 0,
    },
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session.email) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  let body: Partial<AlertPreferences>
  try { body = await req.json() } catch { return Response.json({ error: 'invalid json' }, { status: 400 }) }

  // Validate Slack webhook
  if (body.slackWebhook && !/^https:\/\/hooks\.slack\.com\/services\//.test(body.slackWebhook)) {
    return Response.json({ error: 'invalid_slack_webhook', message: 'Must start with https://hooks.slack.com/services/' }, { status: 400 })
  }

  const merged: AlertPreferences = {
    email: session.email,
    slackWebhook: body.slackWebhook,
    emailAlerts: body.emailAlerts ?? true,
    dailyBriefing: body.dailyBriefing ?? true,
    alertOnNewSanctions: body.alertOnNewSanctions ?? true,
    alertOnDoraDeadlines: body.alertOnDoraDeadlines ?? true,
    updatedAt: Date.now(),
  }
  await kv.set(prefsKey(session.email), merged)
  await addSubscriber(session.email)
  return Response.json({ ok: true, prefs: merged })
}

export async function DELETE() {
  const session = await getSession()
  if (!session.email) return Response.json({ error: 'unauthenticated' }, { status: 401 })
  await kv.del(prefsKey(session.email))
  return Response.json({ ok: true })
}
