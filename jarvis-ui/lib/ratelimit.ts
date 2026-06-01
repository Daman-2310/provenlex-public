// Edge-compatible rate limiter.
//
// Uses @upstash/ratelimit + the same Redis client lib/kv.ts is built on when
// real Upstash credentials are configured (UPSTASH_REDIS_REST_URL +
// UPSTASH_REDIS_REST_TOKEN). Falls back to an in-memory sliding-window when
// Upstash is not configured, so dev / preview environments don't break.

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const HAS_UPSTASH = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN

let _upstash: Ratelimit | null = null
if (HAS_UPSTASH) {
  _upstash = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(60, '1 m'), // 60 req/min default
    analytics: false,
    prefix: 'genesis:rl',
  })
}

// In-memory fallback — last-N-requests-per-key map
const _memoryWindow: Map<string, number[]> = new Map()
const MEMORY_WINDOW_MS = 60_000
const MEMORY_LIMIT = 60

function memoryCheck(key: string, limit: number = MEMORY_LIMIT): { success: boolean; remaining: number; reset: number } {
  const now = Date.now()
  const cutoff = now - MEMORY_WINDOW_MS
  const events = (_memoryWindow.get(key) ?? []).filter(t => t > cutoff)
  if (events.length >= limit) {
    return { success: false, remaining: 0, reset: Math.min(...events) + MEMORY_WINDOW_MS }
  }
  events.push(now)
  _memoryWindow.set(key, events)
  return { success: true, remaining: limit - events.length, reset: now + MEMORY_WINDOW_MS }
}

export interface LimitResult {
  ok: boolean
  remaining: number
  reset: number       // epoch ms when the bucket resets
  backend: 'upstash' | 'memory'
}

// limit: requests allowed per minute. Default 60.
// key: usually IP from x-forwarded-for. Pass the route name too if you want
// per-route quotas.
export async function rateLimit(key: string, limit = 60): Promise<LimitResult> {
  if (_upstash) {
    try {
      const r = await _upstash.limit(`${key}`)
      return {
        ok: r.success,
        remaining: r.remaining,
        reset: r.reset,
        backend: 'upstash',
      }
    } catch {
      // fall through to memory
    }
  }
  const r = memoryCheck(key, limit)
  return { ok: r.success, remaining: r.remaining, reset: r.reset, backend: 'memory' }
}

// Extract a stable client identifier from an Edge request.
export function clientKey(req: Request, route = 'global'): string {
  const xff = req.headers.get('x-forwarded-for')
  const ip = xff ? xff.split(',')[0].trim() : (req.headers.get('x-real-ip') ?? '0.0.0.0')
  return `${route}:${ip}`
}

// Convenience: return a 429 Response if over limit, otherwise null.
export async function enforceRateLimit(
  req: Request,
  opts: { route: string; limit?: number } = { route: 'global' },
): Promise<Response | null> {
  const k = clientKey(req, opts.route)
  const r = await rateLimit(k, opts.limit ?? 60)
  if (r.ok) return null
  return Response.json(
    {
      error: 'rate_limited',
      message: `Rate limit exceeded for ${opts.route}. Try again after ${new Date(r.reset).toISOString()}.`,
      reset: r.reset,
    },
    {
      status: 429,
      headers: {
        'Retry-After': Math.max(1, Math.floor((r.reset - Date.now()) / 1000)).toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': Math.floor(r.reset / 1000).toString(),
      },
    },
  )
}
