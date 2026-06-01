// Self-contained magic-link auth using HMAC-signed tokens (no DB required for token verification)
// Sessions use iron-session cookies. Drop into edge or node runtime.

import { getIronSession, type SessionOptions } from 'iron-session'
import { cookies } from 'next/headers'
import crypto from 'crypto'

export interface SessionData {
  email?: string
  loggedInAt?: number
  plan?: 'starter' | 'pro' | 'enterprise' | null
  stripeCustomerId?: string
}

const SESSION_SECRET = process.env.SESSION_SECRET ?? 'dev-secret-32-chars-minimum-please-set-prod-env-var-now'

export const sessionOptions: SessionOptions = {
  password: SESSION_SECRET.padEnd(32, '0').slice(0, 64),
  cookieName: 'gs_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  },
}

export async function getSession() {
  const c = await cookies()
  return getIronSession<SessionData>(c, sessionOptions)
}

// ── Magic-link tokens (HMAC-signed, self-verifying, 15-min TTL) ──────────
const TOKEN_TTL_MS = 15 * 60 * 1000

export function createMagicToken(email: string): string {
  const expires = Date.now() + TOKEN_TTL_MS
  const payload = `${email}|${expires}`
  const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex')
  // base64url of "email|expires|hmac"
  const raw = `${payload}|${hmac}`
  return Buffer.from(raw, 'utf8').toString('base64url')
}

export function verifyMagicToken(token: string): { ok: true; email: string } | { ok: false; reason: string } {
  let raw: string
  try {
    raw = Buffer.from(token, 'base64url').toString('utf8')
  } catch {
    return { ok: false, reason: 'malformed token' }
  }
  const parts = raw.split('|')
  if (parts.length !== 3) return { ok: false, reason: 'invalid structure' }
  const [email, expiresStr, hmac] = parts
  const expires = Number(expiresStr)
  if (!Number.isFinite(expires)) return { ok: false, reason: 'invalid expiry' }
  if (Date.now() > expires) return { ok: false, reason: 'token expired' }
  const expectedHmac = crypto.createHmac('sha256', SESSION_SECRET).update(`${email}|${expires}`).digest('hex')
  // Timing-safe compare on equal-length hex strings
  if (hmac.length !== expectedHmac.length) return { ok: false, reason: 'signature mismatch' }
  let diff = 0
  for (let i = 0; i < hmac.length; i++) diff |= hmac.charCodeAt(i) ^ expectedHmac.charCodeAt(i)
  if (diff !== 0) return { ok: false, reason: 'signature mismatch' }
  return { ok: true, email }
}

// ── Unified session lookup ─────────────────────────────────────────────────
//
// Returns the current user's email and source ('supabase' | 'iron') if a
// session exists, otherwise null. Use this in new code (route handlers,
// server components) instead of calling getSession() directly — it lets us
// migrate auth without rewriting every callsite.
//
// Order of precedence:
//   1. Supabase Auth (if NEXT_PUBLIC_SUPABASE_URL env var set + active session)
//   2. iron-session cookie (legacy fallback)
//
// During the migration window both can coexist. New users land in Supabase;
// existing iron-session cookies keep working until they expire.

export interface UnifiedUser {
  email: string
  source: 'supabase' | 'iron'
  supabase_user_id?: string
}

export async function getCurrentUser(): Promise<UnifiedUser | null> {
  // Try Supabase first
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    try {
      const { createServerClient } = await import('@/lib/supabase')
      const sb = await createServerClient()
      const { data, error } = await sb.auth.getUser()
      if (!error && data.user?.email) {
        return {
          email: data.user.email,
          source: 'supabase',
          supabase_user_id: data.user.id,
        }
      }
    } catch {
      // Supabase failure — fall through to iron-session
    }
  }

  // Iron-session legacy path
  const s = await getSession()
  if (s.email) {
    return { email: s.email, source: 'iron' }
  }
  return null
}

export async function requireUser(): Promise<UnifiedUser> {
  const u = await getCurrentUser()
  if (!u) throw new Error('unauthenticated')
  return u
}
