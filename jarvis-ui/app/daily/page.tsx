'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Mail, Sparkles, CheckCircle2 } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'

export default function DailyPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  async function subscribe() {
    if (!email.trim()) return
    setStatus('sending'); setError('')
    try {
      const r = await fetch('/api/daily/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const j = await r.json() as { ok?: boolean; error?: string }
      if (j.ok) setStatus('success')
      else { setStatus('error'); setError(j.error ?? 'subscribe failed') }
    } catch (e) {
      setStatus('error'); setError(String(e))
    }
  }

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#00ff88" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Mail className="w-4 h-4 text-[#00ff88]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#00ff88]">THE GENESIS DAILY</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">07:00 UTC · 7 days a week</span>
        </div>
      </header>

      <div className="relative max-w-3xl mx-auto px-6 py-20">

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)' }}>
            <Sparkles className="w-3 h-3 text-[#00ff88]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#00ff88]">
              5-minute morning brief · free forever
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.75rem, 7vw, 5.5rem)', lineHeight: 0.95 }}>
            <span className="text-white">EU compliance,</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #00ff88 0%, #4a9eff 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(0,255,136,0.3))',
            }}>
              before your coffee.
            </span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl mx-auto leading-relaxed">
            Top operational-risk movers from the Book of Genesis. Fresh vindications. One paragraph of
            editor's narrative. Delivered to your inbox at <span className="text-white font-bold">07:00 UTC</span>, every day.
          </p>
        </div>

        {/* SUBSCRIBE */}
        <div className="rounded-2xl p-8 mb-10"
          style={{
            background: 'linear-gradient(135deg, rgba(0,255,136,0.04) 0%, rgba(74,158,255,0.03) 100%)',
            border: '1px solid rgba(0,255,136,0.3)',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 0 32px rgba(0,255,136,0.1)',
          }}>
          {status === 'success' ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-12 h-12 text-[#00ff88] mx-auto mb-3" />
              <div className="text-2xl font-black mb-2">Subscribed.</div>
              <div className="text-[13px] text-[rgba(255,255,255,0.65)] max-w-md mx-auto leading-relaxed">
                A sample brief is on its way to <span className="text-white font-bold">{email}</span>.
                Check your inbox (or spam folder — first delivery sometimes lands there).
              </div>
            </div>
          ) : (
            <>
              <div className="text-[11px] uppercase tracking-[0.2em] text-[#00ff88] font-black mb-4">Subscribe (free)</div>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  disabled={status === 'sending'}
                  onKeyDown={e => { if (e.key === 'Enter') void subscribe() }}
                  className="px-4 py-3.5 rounded-lg text-sm bg-[rgba(0,0,0,0.4)] text-white border border-[rgba(0,255,136,0.3)] focus:border-[#00ff88] outline-none disabled:opacity-50"
                />
                <button onClick={() => void subscribe()} disabled={status === 'sending' || !email.trim()}
                  className="px-6 py-3.5 rounded-lg text-sm font-black uppercase tracking-[0.15em] disabled:opacity-40"
                  style={{
                    background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
                    color: '#000',
                    boxShadow: '0 0 24px rgba(0,255,136,0.4)',
                  }}>
                  {status === 'sending' ? 'Subscribing…' : 'Subscribe'}
                </button>
              </div>
              {status === 'error' && <div className="text-[#ff3366] text-[11px] mt-3">{error}</div>}
              <div className="text-[10px] text-[rgba(255,255,255,0.4)] mt-3 uppercase tracking-wider">
                You'll receive a sample brief immediately + daily delivery at 07:00 UTC. Unsubscribe anytime.
              </div>
            </>
          )}
        </div>

        {/* PREVIEW */}
        <div className="mb-12">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] font-black mb-4">What's inside</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <PreviewCard
              accent="#9b6dff"
              kicker="§ 1"
              title="Top operational-risk movers"
              body="The 5 highest Pre-Crime Index entities from this morning's Book sweep, ranked. Direct link to each sealed prophecy."
            />
            <PreviewCard
              accent="#ff3366"
              kicker="§ 2"
              title="Recent vindications"
              body="Any Book entries the Vindication Engine has matched to credible press/regulator coverage in the last 24h."
            />
            <PreviewCard
              accent="#4a9eff"
              kicker="§ 3"
              title="Editor's morning note"
              body="One paragraph of analytical narrative from the Genesis AI editor. Bloomberg-brief energy. 4-6 sentences."
            />
          </div>
        </div>

        {/* WHY */}
        <div className="rounded-2xl p-6"
          style={{ background: 'rgba(0,255,136,0.03)', border: '1px solid rgba(0,255,136,0.2)' }}>
          <Sparkles className="w-5 h-5 text-[#00ff88] mb-3" />
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#00ff88] font-black mb-2">Why subscribe</div>
          <p className="text-[13px] text-[rgba(255,255,255,0.7)] leading-relaxed">
            The Book of Genesis is a permanent, cryptographically-sealed record of operational-risk forecasts.
            The Genesis Daily turns it into a habit — five minutes a morning, you know what changed overnight
            in EU fund operational integrity. Free. No tracking pixels. Unsubscribe in one click.
          </p>
        </div>

      </div>
    </div>
  )
}

function PreviewCard({ accent, kicker, title, body }: { accent: string; kicker: string; title: string; body: string }) {
  return (
    <div className="rounded-xl p-5"
      style={{ background: `${accent}06`, border: `1px solid ${accent}30`, backdropFilter: 'blur(10px)' }}>
      <div className="text-[10px] uppercase tracking-[0.2em] font-black mb-2" style={{ color: accent }}>{kicker}</div>
      <div className="text-[14px] font-black text-white mb-2">{title}</div>
      <div className="text-[11px] text-[rgba(255,255,255,0.6)] leading-relaxed">{body}</div>
    </div>
  )
}
