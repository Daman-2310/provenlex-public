// Browser-only Supabase client.
//
// Safe to import from 'use client' components. Does NOT pull in `next/headers`
// (which would break the build outside Server Components).

import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr'

const URL  = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export function isSupabaseConfigured(): boolean {
  return !!URL && !!ANON
}

export function createBrowserClient() {
  if (!URL || !ANON) throw new Error('Supabase env vars missing (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).')
  return createSupabaseBrowserClient(URL, ANON)
}
