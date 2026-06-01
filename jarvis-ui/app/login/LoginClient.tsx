'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Mail, ArrowRight, Sparkles, CheckCircle2, AlertTriangle, Github } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase-browser'

export default function LoginClient({ supabaseConfigured }: { supabaseConfigured: boolean }) {
  const params = useSearchParams()
  const errorParam = params.get('error')
  const nextParam = params.get('next') ?? '/dashboard'

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [devLink, setDevLink] = useState<string | null>(null)

  useEffect(() => {
    if (errorParam) {
      const msgs: Record<string, string> = {
        missing_token: 'Sign-in link was empty. Try again.',
        missing_code:  'OAuth callback came back without a code. Try again.',
        token_expired: 'That link expired. Request a new one.',
        'token expired': 'That link expired (15 minutes). Request a new one.',
        'signature mismatch': 'Link tampered with — request a fresh one.',
        'invalid structure': 'Sign-in link malformed.',
      }
      setError(msgs[errorParam] ?? `Sign-in failed: ${decodeURIComponent(errorParam)}`)
    }
  }, [errorParam])

  async function submitSupabase(e: React.FormEvent) {
    e.preventDefault()
    if (!email.includes('@')) { setError('Please enter a valid email'); return }
    setLoading(true); setError(null)
    try {
      const supabase = createBrowserClient()
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextParam)}`
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      })
      if (error) setError(error.message)
      else setSent(true)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function oauth(provider: 'google' | 'github') {
    setLoading(true); setError(null)
    try {
      const supabase = createBrowserClient()
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextParam)}`
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      })
      if (error) setError(error.message)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  // Legacy iron-session magic-link path
  async function submitLegacy(e: React.FormEvent) {
    e.preventDefault()
    if (!email.includes('@')) { setError('Please enter a valid email'); return }
    setLoading(true); setError(null); setDevLink(null)
    try {
      const res = await fetch('/api/auth/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to send link'); return }
      setSent(true)
      if (data.devLink) setDevLink(data.devLink)
    } catch (e) {
      setError(String(e))
    } finally { setLoading(false) }
  }

  const submit = supabaseConfigured ? submitSupabase : submitLegacy

  return (
    <div className="min-h-screen text-white flex items-center justify-center px-6"
      style={{ background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)' }}>
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(155,109,255,0.08)', border: '1px solid rgba(155,109,255,0.3)' }}>
            <Sparkles className="w-3 h-3 text-[#9b6dff]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#9b6dff]">Sign in to Genesis</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-tight">
            Welcome back.
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] mt-3 text-sm">
            {supabaseConfigured
              ? 'Magic link, Google, or GitHub — pick one.'
              : 'We will email you a one-tap magic link.'}
          </p>
        </div>

        {!sent ? (
          <div className="space-y-4">
            <form onSubmit={submit} className="rounded-2xl p-2"
              style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(155,109,255,0.3)' }}>
              <div className="flex items-center gap-3 px-3 py-2">
                <Mail className="w-4 h-4 text-[#9b6dff] shrink-0" />
                <input
                  autoFocus
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your.email@fund.lu"
                  className="flex-1 bg-transparent outline-none text-white placeholder-[rgba(255,255,255,0.3)]" />
                <button type="submit" disabled={loading || !email.includes('@')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] uppercase tracking-wider font-bold transition-all disabled:opacity-50"
                  style={{ background: 'rgba(155,109,255,0.15)', border: '1px solid rgba(155,109,255,0.5)', color: '#9b6dff' }}>
                  {loading ? '…' : <>Send link <ArrowRight className="w-3 h-3" /></>}
                </button>
              </div>
            </form>

            {supabaseConfigured && (
              <>
                <div className="flex items-center gap-3 my-2">
                  <div className="flex-1 h-px bg-[rgba(255,255,255,0.08)]" />
                  <span className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">or</span>
                  <div className="flex-1 h-px bg-[rgba(255,255,255,0.08)]" />
                </div>

                <button onClick={() => oauth('google')} disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-[12px] font-bold transition-all disabled:opacity-50"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)' }}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Continue with Google
                </button>

                <button onClick={() => oauth('github')} disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-[12px] font-bold transition-all disabled:opacity-50"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)' }}>
                  <Github className="w-4 h-4" />
                  Continue with GitHub
                </button>
              </>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg text-[11px] text-[#ff3366]"
                style={{ background: 'rgba(255,51,102,0.06)', border: '1px solid rgba(255,51,102,0.25)' }}>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl p-6 text-center"
            style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.3)' }}>
            <CheckCircle2 className="w-8 h-8 text-[#00ff88] mx-auto mb-3" />
            <div className="text-[14px] font-bold text-white mb-1">Check your inbox.</div>
            <div className="text-[12px] text-[rgba(255,255,255,0.65)] leading-relaxed">
              We sent a one-tap sign-in link to <strong className="text-white">{email}</strong>.
              The link expires in 15 minutes.
            </div>
            {devLink && (
              <div className="mt-4 p-3 rounded text-left"
                style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,170,0,0.3)' }}>
                <div className="text-[9px] uppercase tracking-wider text-[#ffaa00] font-bold mb-1">Dev link (no email configured)</div>
                <a href={devLink} className="text-[10px] font-mono text-[#9b6dff] break-all hover:underline">{devLink}</a>
              </div>
            )}
          </div>
        )}

        <div className="text-center mt-6 text-[10px] text-[rgba(255,255,255,0.4)]">
          By signing in you accept the <a href="/terms" className="text-[#9b6dff] hover:underline">Terms</a>{' '}
          and <a href="/privacy" className="text-[#9b6dff] hover:underline">Privacy Policy</a>.
        </div>
      </div>
    </div>
  )
}
