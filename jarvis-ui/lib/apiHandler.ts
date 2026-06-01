// Public-API request wrapper: Bearer auth, scope check, rate limit, response headers.
import { NextRequest } from 'next/server'
import { authenticateApiKey, checkRateLimit, ApiKeyRecord } from './apikeys'

export interface ApiContext {
  key: ApiKeyRecord
  remaining: number
  resetAt: number
}

export async function withApiAuth(req: NextRequest, requiredScope: string): Promise<{ ok: true; ctx: ApiContext } | { ok: false; res: Response }> {
  const auth = req.headers.get('authorization')
  const key = await authenticateApiKey(auth)
  if (!key) {
    return {
      ok: false,
      res: Response.json(
        { error: 'unauthenticated', message: 'Pass a valid API key as `Authorization: Bearer gs_live_...`. Create one at /dashboard.' },
        { status: 401 },
      ),
    }
  }
  if (!key.scopes.includes(requiredScope)) {
    return {
      ok: false,
      res: Response.json(
        { error: 'insufficient_scope', message: `This key does not have the "${requiredScope}" scope.`, allowedScopes: key.scopes },
        { status: 403 },
      ),
    }
  }
  const rl = await checkRateLimit(key)
  if (!rl.ok) {
    return {
      ok: false,
      res: Response.json(
        { error: 'rate_limited', message: `Hourly rate limit (${key.rateLimit}) exceeded. Resets at ${new Date(rl.resetAt).toISOString()}.` },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(key.rateLimit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.floor(rl.resetAt / 1000)),
          },
        },
      ),
    }
  }
  return { ok: true, ctx: { key, remaining: rl.remaining, resetAt: rl.resetAt } }
}

export function rateLimitHeaders(ctx: ApiContext): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(ctx.key.rateLimit),
    'X-RateLimit-Remaining': String(ctx.remaining),
    'X-RateLimit-Reset': String(Math.floor(ctx.resetAt / 1000)),
  }
}
