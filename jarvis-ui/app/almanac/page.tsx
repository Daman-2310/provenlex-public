'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, BookMarked, Truck, CheckCircle2, Crown } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'

export default function AlmanacPage() {
  const [email, setEmail] = useState('')
  const [org, setOrg] = useState('')
  const [audience, setAudience] = useState<'regulator' | 'lp' | 'journalist' | 'other'>('regulator')
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')

  async function preorder() {
    if (!email.trim()) return
    setStatus('sending')
    try {
      const r = await fetch('/api/daily/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), send_sample: false }),
      })
      const j = await r.json() as { ok?: boolean }
      setStatus(j.ok ? 'success' : 'error')
    } catch {
      setStatus('error')
    }
    void org; void audience
  }

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#ff7700" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <BookMarked className="w-4 h-4 text-[#ff7700]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#ff7700]">THE GENESIS ALMANAC</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">printed hardback · annual</span>
        </div>
      </header>

      <div className="relative max-w-5xl mx-auto px-6 py-14">

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(255,119,0,0.08)', border: '1px solid rgba(255,119,0,0.3)' }}>
            <Crown className="w-3 h-3 text-[#ff7700]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#ff7700]">
              The desk artifact · printed annually
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.5rem, 6.5vw, 5rem)', lineHeight: 0.95 }}>
            <span className="text-white">The state of EU compliance,</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #ff7700 0%, #ffaa00 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(255,119,0,0.3))',
            }}>printed, bound, mailed.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl mx-auto leading-relaxed">
            The Genesis Almanac is a beautifully-designed annual hardback. 200 pages of
            sealed prophecies, vindications, the year's biggest collapses, and Genesis
            Doctrine essays. Mailed free to every EU regulator, journalist, and select
            LP each January.
          </p>
        </div>

        {/* COVER PREVIEW */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          <div className="aspect-[2/3] rounded-2xl flex flex-col justify-between p-8 relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #1a0a08 0%, #050508 100%)',
              border: '1px solid rgba(255,119,0,0.4)',
              boxShadow: '0 30px 80px rgba(255,119,0,0.15), inset 0 0 32px rgba(255,119,0,0.06)',
            }}>
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-[#ff7700] font-black mb-2">VOLUME I</div>
              <div className="text-3xl md:text-4xl font-black leading-none mb-3"
                style={{ background: 'linear-gradient(135deg, #ffffff 0%, #ff7700 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                THE GENESIS<br />ALMANAC
              </div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-[rgba(255,255,255,0.5)]">2026 · annual review</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] mb-1">Edited by</div>
              <div className="text-[13px] font-bold text-white">Daman Sharma · Luxembourg</div>
            </div>
            <div className="absolute inset-x-0 bottom-0 h-1"
              style={{ background: 'linear-gradient(90deg, #ff3366 0%, #ff7700 50%, #ffaa00 100%)' }} />
          </div>

          <div className="space-y-3">
            <Spec n="01" title="The Year in Vindications" body="Every prophecy issued in 2026 + every vindication received, with source URLs." />
            <Spec n="02" title="The Time Machine Report" body="Updated backtest accuracy across the historical EU collapse set." />
            <Spec n="03" title="The Genesis Doctrine essays" body="Annual editorials by the founder on AI compliance, regulator dynamics, and what changed." />
            <Spec n="04" title="The Book of Genesis annex" body="Full 100-entity sealed register printed in archival format. Merkle root + Bitcoin block reference." />
            <Spec n="05" title="The Coalition register" body="Every public signatory of the Anti-Wirecard Pledge as of the printing date." />
          </div>
        </div>

        {/* SHIPPING LIST */}
        <div className="rounded-2xl p-6 mb-10"
          style={{ background: 'rgba(255,119,0,0.04)', border: '1px solid rgba(255,119,0,0.25)', backdropFilter: 'blur(10px)' }}>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#ff7700] font-black mb-3 flex items-center gap-2">
            <Truck className="w-3.5 h-3.5" /> Free copy mailed to
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
            {[
              'CSSF (Luxembourg)', 'BaFin (Germany)', 'AMF (France)', 'FCA (UK)',
              'AFM (Netherlands)', 'CONSOB (Italy)', 'CNMV (Spain)', 'FINMA (Switzerland)',
              'EBA', 'ESMA', 'ECB SSM', 'EIOPA',
              'FT', 'Bloomberg', 'Reuters', 'Risk.net',
              'Handelsblatt', 'FAZ', 'Les Echos', 'NRC',
            ].map(name => (
              <div key={name} className="px-2 py-1 rounded text-[rgba(255,255,255,0.7)]"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                {name}
              </div>
            ))}
          </div>
          <div className="text-[10px] text-[rgba(255,255,255,0.4)] uppercase tracking-wider mt-3">
            ~500 physical copies · ~€20K print + shipping budget · zero ask in return
          </div>
        </div>

        {/* PRE-ORDER */}
        <div className="rounded-2xl p-6 mb-10"
          style={{
            background: 'linear-gradient(135deg, rgba(255,119,0,0.04) 0%, rgba(255,170,0,0.03) 100%)',
            border: '1px solid rgba(255,119,0,0.3)',
            backdropFilter: 'blur(10px)',
          }}>
          {status === 'success' ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-10 h-10 text-[#ff7700] mx-auto mb-3" />
              <div className="text-[18px] font-black mb-1">You're on the mailing list.</div>
              <div className="text-[12px] text-[rgba(255,255,255,0.6)]">First volume ships January 2027.</div>
            </div>
          ) : (
            <>
              <div className="text-[11px] uppercase tracking-[0.2em] text-[#ff7700] font-black mb-4">Request a copy</div>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 mb-3">
                <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email"
                  type="email"
                  className="px-4 py-3 rounded-lg text-sm bg-[rgba(0,0,0,0.4)] text-white border border-[rgba(255,119,0,0.3)] focus:border-[#ff7700] outline-none" />
                <input value={org} onChange={e => setOrg(e.target.value)} placeholder="Organization"
                  className="px-4 py-3 rounded-lg text-sm bg-[rgba(0,0,0,0.4)] text-white border border-[rgba(255,119,0,0.3)] focus:border-[#ff7700] outline-none" />
                <select value={audience} onChange={e => setAudience(e.target.value as 'regulator' | 'lp' | 'journalist' | 'other')}
                  className="px-4 py-3 rounded-lg text-sm bg-[rgba(0,0,0,0.4)] text-white border border-[rgba(255,119,0,0.3)]">
                  <option value="regulator">Regulator</option>
                  <option value="lp">LP / institutional investor</option>
                  <option value="journalist">Journalist</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <button onClick={() => void preorder()} disabled={status === 'sending' || !email.trim()}
                className="px-6 py-3 rounded-lg text-sm font-black uppercase tracking-[0.15em] disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #ff7700 0%, #ffaa00 100%)', color: '#000', boxShadow: '0 0 24px rgba(255,119,0,0.4)' }}>
                {status === 'sending' ? 'Requesting…' : 'Request your copy'}
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  )
}

function Spec({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-xl p-5"
      style={{ background: 'rgba(255,119,0,0.04)', border: '1px solid rgba(255,119,0,0.2)', backdropFilter: 'blur(10px)' }}>
      <div className="flex items-start gap-3">
        <span className="text-[22px] font-black text-[#ff7700] tabular-nums leading-none">{n}</span>
        <div>
          <div className="text-[13px] font-black text-white mb-1">{title}</div>
          <div className="text-[11px] text-[rgba(255,255,255,0.65)] leading-relaxed">{body}</div>
        </div>
      </div>
    </div>
  )
}
