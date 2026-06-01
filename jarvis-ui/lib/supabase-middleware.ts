// Middleware helper for refreshing the Supabase session cookie on every
// request. Designed to be called from middleware.ts.
//
// If Supabase env vars are missing, returns the response unchanged so the
// app keeps working without a database.

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function refreshSupabaseSession(request: NextRequest, response: NextResponse): Promise<NextResponse> {
  const URL  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!URL || !ANON) return response

  // Build a fresh response shell so the Supabase SSR helper can write
  // cookies into it. We'll merge the headers back onto `response` before
  // returning.
  const supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(URL, ANON, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
      },
    },
  })

  // IMPORTANT: do not run code between createServerClient and getUser — see
  // https://supabase.com/docs/guides/auth/server-side/nextjs
  try {
    await supabase.auth.getUser()
  } catch {
    // Token refresh failure — clear session. Next page request will re-login.
  }

  // Merge cookies from supabaseResponse onto the caller's response
  for (const cookie of supabaseResponse.cookies.getAll()) {
    response.cookies.set(cookie.name, cookie.value, {
      domain: cookie.domain,
      expires: cookie.expires,
      httpOnly: cookie.httpOnly,
      maxAge: cookie.maxAge,
      path: cookie.path,
      sameSite: cookie.sameSite,
      secure: cookie.secure,
    })
  }

  return response
}
