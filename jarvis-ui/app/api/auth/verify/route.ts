import { NextRequest, NextResponse } from 'next/server'
import { verifyMagicToken, getSession } from '@/lib/auth'
import { addSubscriber } from '@/lib/cron'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/login?error=missing_token', req.url))
  }

  const result = verifyMagicToken(token)
  if (!result.ok) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(result.reason)}`, req.url))
  }

  const session = await getSession()
  session.email = result.email
  session.loggedInAt = Date.now()
  await session.save()

  // Auto-register as subscriber so crons can find them
  await addSubscriber(result.email)

  return NextResponse.redirect(new URL('/dashboard', req.url))
}
