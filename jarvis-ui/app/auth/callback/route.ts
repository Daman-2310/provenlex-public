// Supabase Auth OAuth + email-confirmation callback handler.
//
// Supabase redirects here after a magic-link click or an OAuth provider
// approves the sign-in. We exchange the code for a session, ensure the user
// has a default tenant, and redirect them to /dashboard (or ?next=<path>).

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const runtime = 'nodejs'  // service-role call inside ensure_default_tenant

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/dashboard'

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', url.origin))
  }

  const supabase = await createServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin))
  }

  // Ensure the user has a default tenant on first sign-in
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const display = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0]
      await supabase.rpc('ensure_default_tenant', { p_user: user.id, p_display: display })
    }
  } catch {
    // Non-fatal — tenant creation will retry on next request
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
