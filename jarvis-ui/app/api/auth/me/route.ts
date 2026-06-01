import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET() {
  const session = await getSession()
  if (!session.email) {
    return Response.json({ authenticated: false }, { status: 200 })
  }
  return Response.json({
    authenticated: true,
    email: session.email,
    plan: session.plan ?? 'starter',
    loggedInAt: session.loggedInAt,
  })
}
