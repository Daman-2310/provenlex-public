'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ShieldCheck, Users, CheckCircle2 } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'

export default function CoalitionPage() {
  const [form, setForm] = useState({ organization: '', signatory: '', email: '', role: '', jurisdiction: '', consent_public: true })
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [err, setErr] = useState('')

  async function sign() {
    setStatus('sending'); setErr('')
    try {
      const r = await fetch('/api/coalition/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const j = await r.json() as { ok?: boolean; error?: string }
      if (j.ok) setStatus('success')
      else { setStatus('error'); setErr(j.error ?? 'failed') }
    } catch (e) { setStatus('error'); setErr(String(e)) }
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
          <ShieldCheck className="w-4 h-4 text-[#00ff88]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#00ff88]">THE COALITION</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">institutional pledge · target 10 signatories</span>
        </div>
      </header>

      <div className="relative max-w-4xl mx-auto px-6 py-14">

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)' }}>
            <Users className="w-3 h-3 text-[#00ff88]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#00ff88]">
              The Anti-Wirecard pledge
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.5rem, 6.5vw, 5rem)', lineHeight: 0.95 }}>
            <span className="text-white">Never another</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #00ff88 0%, #4a9eff 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(0,255,136,0.3))',
            }}>Wirecard.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl mx-auto leading-relaxed">
            A public commitment by LPs, family offices, and institutional allocators to incorporate
            independent AI operational-risk scores into due diligence. We are building a Schelling point.
          </p>
        </div>

        {/* THE PLEDGE */}
        <div className="rounded-2xl p-8 mb-10"
          style={{
            background: 'linear-gradient(135deg, rgba(0,255,136,0.04) 0%, rgba(74,158,255,0.03) 100%)',
            border: '1px solid rgba(0,255,136,0.3)',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 0 32px rgba(0,255,136,0.1)',
          }}>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#00ff88] font-black mb-4">The Pledge</div>
          <div className="text-[18px] md:text-[20px] leading-[1.55] text-white font-medium italic">
            "We commit to consulting an independent, publicly-anchored AI operational-risk score
            (such as the Genesis Score) on every fund commitment, and to documenting our risk
            acknowledgment when committing capital to entities scoring below 50.
            We endorse transparency as the moat against the next Wirecard."
          </div>
          <div className="mt-6 text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] font-bold">
            v1.0 · effective on signature · withdrawable in writing at any time
          </div>
        </div>

        {/* SIGN */}
        <div className="rounded-2xl p-6 mb-10"
          style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.25)', backdropFilter: 'blur(10px)' }}>
          {status === 'success' ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-12 h-12 text-[#00ff88] mx-auto mb-3" />
              <div className="text-2xl font-black mb-2">Pledge received.</div>
              <div className="text-[12px] text-[rgba(255,255,255,0.65)] max-w-md mx-auto">
                We'll confirm by email within 48 hours. Public signatures appear on this page after review.
              </div>
            </div>
          ) : (
            <>
              <div className="text-[11px] uppercase tracking-[0.2em] text-[#00ff88] font-black mb-4">Sign the pledge</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <Input placeholder="Organization (e.g. ATP, Norges Bank, KBC)" value={form.organization}
                  onChange={v => setForm({ ...form, organization: v })} />
                <Input placeholder="Your name" value={form.signatory}
                  onChange={v => setForm({ ...form, signatory: v })} />
                <Input placeholder="Work email" value={form.email} type="email"
                  onChange={v => setForm({ ...form, email: v })} />
                <Input placeholder="Your role (e.g. CIO, MD, Partner)" value={form.role}
                  onChange={v => setForm({ ...form, role: v })} />
                <Input placeholder="Jurisdiction (e.g. LU, DE, FR, US)" value={form.jurisdiction}
                  onChange={v => setForm({ ...form, jurisdiction: v })} />
                <label className="flex items-center gap-2 px-4 py-3 rounded-lg cursor-pointer select-none"
                  style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,255,136,0.25)' }}>
                  <input type="checkbox" checked={form.consent_public}
                    onChange={e => setForm({ ...form, consent_public: e.target.checked })}
                    className="appearance-none w-4 h-4 rounded border border-[rgba(0,255,136,0.5)] checked:bg-[#00ff88] cursor-pointer" />
                  <span className="text-[11px] text-[rgba(255,255,255,0.8)]">
                    List my organization publicly as a signatory
                  </span>
                </label>
              </div>
              <button onClick={() => void sign()}
                disabled={status === 'sending' || !form.organization || !form.signatory || !form.email}
                className="px-6 py-3 rounded-lg text-sm font-black uppercase tracking-[0.15em] disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)', color: '#000', boxShadow: '0 0 24px rgba(0,255,136,0.4)' }}>
                {status === 'sending' ? 'Signing…' : 'Sign the pledge'}
              </button>
              {err && <div className="text-[#ff3366] text-[11px] mt-3">{err}</div>}
            </>
          )}
        </div>

        {/* CURRENT SIGNATORIES */}
        <div className="rounded-2xl p-6"
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,255,136,0.2)', backdropFilter: 'blur(10px)' }}>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#00ff88] font-black mb-3">Public signatories</div>
          <div className="text-[12px] text-[rgba(255,255,255,0.5)] italic">
            No public signatures yet. Be the first institutional ally on the public record.
            Coalition launches officially at 10 signatures — pre-commits welcome.
          </div>
        </div>

        {/* OUTREACH TEMPLATE */}
        <div className="mt-10 rounded-2xl p-6"
          style={{ background: 'rgba(74,158,255,0.04)', border: '1px solid rgba(74,158,255,0.25)', backdropFilter: 'blur(10px)' }}>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#4a9eff] font-black mb-3">Help us reach the right people</div>
          <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-relaxed mb-3">
            If you know a CIO, head of risk, or due-diligence partner at a Luxembourg, German,
            Swiss, Nordic, or Dutch LP / family office / pension fund — please forward this page
            to them with a one-line intro. The first 10 signatures set the precedent for the next 1000.
          </p>
          <a href="mailto:?subject=Anti-Wirecard%20Coalition%20%E2%80%94%20pledge%20to%20use%20independent%20AI%20fund-risk%20scores&body=Hi,%0A%0AGenesis%20Swarm%20just%20launched%20the%20Anti-Wirecard%20Coalition%20%E2%80%94%20an%20institutional%20pledge%20to%20incorporate%20independent%20AI%20operational-risk%20scores%20into%20fund%20due%20diligence.%0A%0APledge%20page:%20https://genesis-swarm-rgq5.vercel.app/coalition%0A%0AThought%20you%20might%20be%20the%20right%20signatory."
            className="inline-flex items-center gap-2 px-4 py-2 rounded text-[11px] uppercase tracking-wider font-bold"
            style={{ background: 'rgba(74,158,255,0.1)', color: '#4a9eff', border: '1px solid rgba(74,158,255,0.4)' }}>
            Forward this page (mailto template)
          </a>
        </div>

      </div>
    </div>
  )
}

function Input({ placeholder, value, onChange, type = 'text' }: { placeholder: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <input type={type} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className="px-4 py-3 rounded-lg text-sm bg-[rgba(0,0,0,0.4)] text-white border border-[rgba(0,255,136,0.25)] focus:border-[#00ff88] outline-none" />
  )
}
