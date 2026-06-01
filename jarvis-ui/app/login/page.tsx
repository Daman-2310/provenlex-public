import { Suspense } from 'react'
import LoginClient from './LoginClient'

export const metadata = {
  title: 'Sign in · Genesis Swarm',
  description: 'Sign in to Genesis Swarm with email magic link, Google, or GitHub.',
}

export default function LoginPage() {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )

  return (
    <Suspense fallback={null}>
      <LoginClient supabaseConfigured={supabaseConfigured} />
    </Suspense>
  )
}
