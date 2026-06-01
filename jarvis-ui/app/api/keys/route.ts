import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { generateApiKey, listUserKeys, saveApiKey, revokeApiKey, ApiKeyRecord } from '@/lib/apikeys'

export const runtime = 'nodejs'

const PLAN_LIMITS: Record<string, number> = {
  starter: 100,
  pro: 5_000,
  enterprise: 100_000,
}
const ALL_SCOPES = ['screen', 'lei', 'fx', 'opinion', 'audit', 'analyze']

export async function GET() {
  const session = await getSession()
  if (!session.email) return Response.json({ error: 'unauthenticated' }, { status: 401 })
  const keys = await listUserKeys(session.email)
  return Response.json({
    items: keys.map(k => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix + '…',
      scopes: k.scopes,
      rateLimit: k.rateLimit,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session.email) return Response.json({ error: 'unauthenticated' }, { status: 401 })
  let body: { name?: string; scopes?: string[] }
  try { body = await req.json() } catch { return Response.json({ error: 'invalid json' }, { status: 400 }) }

  const name = (body.name ?? 'My API Key').slice(0, 64)
  const scopes = Array.isArray(body.scopes)
    ? body.scopes.filter(s => ALL_SCOPES.includes(s))
    : ALL_SCOPES
  const plan = (session.plan ?? 'starter') as string
  const rateLimit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.starter

  const { plaintext, prefix, hash, id } = generateApiKey()
  const rec: ApiKeyRecord = {
    id, email: session.email, name, prefix, hash, scopes, rateLimit, createdAt: Date.now(),
  }
  await saveApiKey(rec)

  // Return plaintext ONCE — never retrievable again
  return Response.json({
    ok: true,
    key: plaintext,
    id, name, prefix: prefix + '…', scopes, rateLimit, createdAt: rec.createdAt,
    warning: 'Store this key now. It will not be shown again.',
  })
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session.email) return Response.json({ error: 'unauthenticated' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return Response.json({ error: 'missing id' }, { status: 400 })
  const ok = await revokeApiKey(session.email, id)
  return Response.json({ ok })
}
