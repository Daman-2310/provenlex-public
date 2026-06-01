// Server-only Supabase client factories.
//
// IMPORTANT: this module imports `next/headers` and CAN ONLY be used in
// Server Components, Route Handlers, Server Actions, or other server-side
// code. Client components must import `createBrowserClient` from
// `lib/supabase-browser.ts` instead.
//
// Two flavours here:
//   - createServerClient()   → reads cookies for the signed-in user's session
//   - createServiceClient()  → uses service-role key, bypasses RLS. Trusted
//                              server contexts ONLY (cron, webhooks, admin).

import { createServerClient as createSupabaseServerClient } from '@supabase/ssr'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { CookieOptions } from '@supabase/ssr'

const URL  = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY

export function isSupabaseConfigured(): boolean {
  return !!URL && !!ANON
}

export function isSupabaseAdminConfigured(): boolean {
  return !!URL && !!SVC
}

// ── Server (Server Components, Route Handlers, Server Actions) ──────────────
export async function createServerClient() {
  if (!URL || !ANON) throw new Error('Supabase env vars missing.')
  const cookieStore = await cookies()
  return createSupabaseServerClient(URL, ANON, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(toSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Read-only context (Server Component). Refresh happens via middleware.
        }
      },
    },
  })
}

// ── Service role (admin) ────────────────────────────────────────────────────
// Use ONLY in trusted server contexts (cron, webhooks, admin endpoints).
// This client bypasses Row Level Security.
export function createServiceClient() {
  if (!URL || !SVC) throw new Error('Supabase service-role env vars missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).')
  return createSupabaseAdminClient(URL, SVC, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
