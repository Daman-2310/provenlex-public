// lib/api-guard.ts
// Airtight wrapper for Vercel serverless routes. Compose: withApiGuard(handler, opts).
// - Blocks open browser access (requires Authorization: Bearer <key>)
// - Verifies key against hashed api_keys table (constant-time) OR env master key
// - Rate-limits per key
// - Scrubs PII from any string field in the request body before it reaches the DB
// - Writes an audit_log row (fire-and-forget)

import { NextRequest } from 'next/server'
import { createServiceClient, isSupabaseAdminConfigured } from '@/lib/supabase'
import { enforceRateLimit } from '@/lib/ratelimit'

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// constant-time compare to defeat timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export interface AuthContext {
  key_id: string
  tenant_id: string | null
  scopes: string[]
  source: 'api_key' | 'master'
}

async function authenticate(req: NextRequest): Promise<AuthContext | null> {
  const header = req.headers.get('authorization') ?? ''
  const m = header.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const presented = m[1].trim()

  // Path A: env master key (service-to-service / cron). Constant-time compare.
  const master = process.env.GENESIS_MASTER_API_KEY
  if (master && timingSafeEqual(presented, master)) {
    return { key_id: 'master', tenant_id: null, scopes: ['*'], source: 'master' }
  }

  // Path B: hashed lookup in api_keys
  if (!isSupabaseAdminConfigured()) return null
  const hash = await sha256Hex(presented)
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('api_keys')
    .select('id, tenant_id, scopes, revoked, expires_at')
    .eq('hash', hash)
    .maybeSingle()

  if (error || !data || data.revoked) return null
  if (data.expires_at && new Date(data.expires_at as string) < new Date()) return null

  void sb.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)

  return {
    key_id: data.id as string,
    tenant_id: (data.tenant_id as string) ?? null,
    scopes: (data.scopes as string[]) ?? ['read'],
    source: 'api_key',
  }
}

// ---- PII scrubbing pipeline ----
// Structural PII only (email/IBAN/card/phone/IP/national-ID). Does NOT catch
// free-text names — that needs an NER pass; this deterministic layer is
// documented as such for the auditor.
const PII_PATTERNS: Array<[RegExp, string]> = [
  [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]'],
  [/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, '[IBAN_REDACTED]'],
  [/\b(?:\d[ -]*?){13,19}\b/g, '[CARD_REDACTED]'],
  [/\b\+?\d[\d\s().-]{9,}\d\b/g, '[PHONE_REDACTED]'],
  [/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP_REDACTED]'],
]

export function scrubPII(value: string): string {
  let out = value
  for (const [re, repl] of PII_PATTERNS) out = out.replace(re, repl)
  return out
}

function deepScrub<T>(input: T): T {
  if (typeof input === 'string') return scrubPII(input) as T
  if (Array.isArray(input)) return input.map(deepScrub) as unknown as T
  if (input && typeof input === 'object') {
    const o: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input)) o[k] = deepScrub(v)
    return o as T
  }
  return input
}

export interface GuardOptions {
  scope?: string
  rateLimit?: number
  scrubBody?: boolean
}

type Handler = (req: NextRequest, ctx: { auth: AuthContext; body: unknown }) => Promise<Response>

export function withApiGuard(handler: Handler, opts: GuardOptions = {}) {
  return async function guarded(req: NextRequest): Promise<Response> {
    // 1. Authn — absolute block on open browser access
    const auth = await authenticate(req)
    if (!auth) {
      return Response.json(
        { error: 'unauthorized', detail: 'Valid Authorization: Bearer <API_KEY> required.' },
        { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
      )
    }

    // 2. Authz — scope check
    if (opts.scope && !auth.scopes.includes('*') && !auth.scopes.includes(opts.scope)) {
      return Response.json({ error: 'forbidden', detail: `scope '${opts.scope}' required` }, { status: 403 })
    }

    // 3. Rate limit per key
    const limited = await enforceRateLimit(req, { route: `key:${auth.key_id}`, limit: opts.rateLimit ?? 120 })
    if (limited) return limited

    // 4. Parse + PII-scrub body
    let body: unknown = undefined
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      try { body = await req.json() } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }) }
      if (opts.scrubBody !== false) body = deepScrub(body)
    }

    // 5. Audit (fire-and-forget)
    if (isSupabaseAdminConfigured()) {
      const sb = createServiceClient()
      const ipHash = await sha256Hex(req.headers.get('x-forwarded-for')?.split(',')[0] ?? '0.0.0.0')
      void sb.from('audit_log').insert({
        actor_kind: auth.source === 'master' ? 'service' : 'api_key',
        tenant_id: auth.tenant_id,
        action: `api.${(req.method ?? 'get').toLowerCase()}`,
        resource: new URL(req.url).pathname,
        ip_hash: ipHash,
        user_agent: req.headers.get('user-agent')?.slice(0, 200) ?? null,
      })
    }

    return handler(req, { auth, body })
  }
}
