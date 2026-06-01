'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Crosshair, Target, CheckCircle2, Skull, ShieldCheck } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'

export default function BountyPage() {
  const [form, setForm] = useState({ email: '', entity: '', claim: '', fooling_strategy: '' })
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [err, setErr] = useState('')
  const [submissionId, setSubmissionId] = useState('')

  async function submit() {
    setStatus('sending'); setErr('')
    try {
      const r = await fetch('/api/bounty/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const j = await r.json() as { ok?: boolean; id?: string; error?: string }
      if (j.ok && j.id) { setSubmissionId(j.id); setStatus('success') }
      else { setStatus('error'); setErr(j.error ?? 'submission failed') }
    } catch (e) { setStatus('error'); setErr(String(e)) }
  }

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="intense" accent="#ffaa00" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Crosshair className="w-4 h-4 text-[#ffaa00]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#ffaa00]">THE GENESIS BOUNTY</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">€10,000 · open to researchers</span>
        </div>
      </header>

      <div className="relative max-w-5xl mx-auto px-6 py-14">

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(255,170,0,0.08)', border: '1px solid rgba(255,170,0,0.3)' }}>
            <Skull className="w-3 h-3 text-[#ffaa00]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#ffaa00]">
              €10,000 if you can fool us
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.5rem, 6.5vw, 5rem)', lineHeight: 0.95 }}>
            <span className="text-white">Break Genesis.</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #ffaa00 0%, #ff7700 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(255,170,0,0.3))',
            }}>Get paid.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl mx-auto leading-relaxed">
            Find a real, named EU financial entity that Genesis scores below 30 but
            which has demonstrable material operational-risk indicators. Show us
            what we missed. <strong className="text-white">€10,000</strong> on the first
            ten validated submissions. Public hall of fame for every winner.
          </p>
        </div>

        {/* SUBMIT */}
        <div className="rounded-2xl p-6 mb-10"
          style={{
            background: 'linear-gradient(135deg, rgba(255,170,0,0.04) 0%, rgba(255,119,0,0.03) 100%)',
            border: '1px solid rgba(255,170,0,0.3)',
            boxShadow: '0 0 32px rgba(255,170,0,0.1)',
            backdropFilter: 'blur(10px)',
          }}>
          {status === 'success' ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-12 h-12 text-[#ffaa00] mx-auto mb-3" />
              <div className="text-2xl font-black mb-2">Submission received.</div>
              <div className="text-[13px] text-[rgba(255,255,255,0.65)] max-w-md mx-auto leading-relaxed mb-3">
                Your submission ID is <span className="font-mono text-[#ffaa00] font-bold">{submissionId}</span>.
                We review within 7 days. If validated, you'll get the €10,000 via SEPA and your name on the hall of fame.
              </div>
              <button onClick={() => { setForm({ email: '', entity: '', claim: '', fooling_strategy: '' }); setStatus('idle') }}
                className="text-[10px] uppercase tracking-wider font-bold text-[#ffaa00] hover:underline">
                Submit another →
              </button>
            </div>
          ) : (
            <>
              <div className="text-[11px] uppercase tracking-[0.2em] text-[#ffaa00] font-black mb-4">Submit a counterexample</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <input
                  type="email" placeholder="Your email" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="px-4 py-3 rounded-lg text-sm bg-[rgba(0,0,0,0.4)] text-white border border-[rgba(255,170,0,0.3)] focus:border-[#ffaa00] outline-none" />
                <input
                  placeholder="Entity name (e.g. Some Fund S.A.)" value={form.entity}
                  onChange={e => setForm({ ...form, entity: e.target.value })}
                  className="px-4 py-3 rounded-lg text-sm bg-[rgba(0,0,0,0.4)] text-white border border-[rgba(255,170,0,0.3)] focus:border-[#ffaa00] outline-none" />
              </div>
              <textarea
                placeholder="What's the risk indicator Genesis missed? Cite public sources (regulator filings, press, short reports)."
                value={form.claim} rows={4}
                onChange={e => setForm({ ...form, claim: e.target.value })}
                className="w-full mb-3 px-4 py-3 rounded-lg text-sm bg-[rgba(0,0,0,0.4)] text-white border border-[rgba(255,170,0,0.3)] focus:border-[#ffaa00] outline-none" />
              <textarea
                placeholder="(Optional) What scoring heuristic do you think made Genesis miss this?"
                value={form.fooling_strategy} rows={3}
                onChange={e => setForm({ ...form, fooling_strategy: e.target.value })}
                className="w-full mb-4 px-4 py-3 rounded-lg text-sm bg-[rgba(0,0,0,0.4)] text-white border border-[rgba(255,170,0,0.3)] focus:border-[#ffaa00] outline-none" />
              <button onClick={() => void submit()}
                disabled={status === 'sending' || !form.email || !form.entity || !form.claim}
                className="px-6 py-3 rounded-lg text-sm font-black uppercase tracking-[0.15em] disabled:opacity-40"
                style={{
                  background: 'linear-gradient(135deg, #ffaa00 0%, #ff7700 100%)',
                  color: '#000',
                  boxShadow: '0 0 24px rgba(255,170,0,0.4)',
                }}>
                {status === 'sending' ? 'Submitting…' : 'Submit & claim bounty'}
              </button>
              {err && <div className="text-[#ff3366] text-[11px] mt-3">{err}</div>}
            </>
          )}
        </div>

        {/* RULES */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          <Box title="The rules" icon={ShieldCheck} color="#ffaa00">
            <ol className="space-y-2 text-[11px] text-[rgba(255,255,255,0.7)] leading-relaxed">
              <li><strong className="text-white">1.</strong> Entity must be a real, named, regulated EU financial entity</li>
              <li><strong className="text-white">2.</strong> Current Genesis Score must be below 30 (we'll re-check on review)</li>
              <li><strong className="text-white">3.</strong> Your claim must cite at least one independently-verifiable public source (regulator filing, court document, credible press)</li>
              <li><strong className="text-white">4.</strong> You must consent to having your name in the Hall of Fame (or remain anonymous)</li>
              <li><strong className="text-white">5.</strong> First ten validated submissions win. Future winners get model-improvement credits.</li>
            </ol>
          </Box>
          <Box title="What we'll do" icon={Target} color="#ff7700">
            <ol className="space-y-2 text-[11px] text-[rgba(255,255,255,0.7)] leading-relaxed">
              <li><strong className="text-white">A.</strong> Within 7 days: human review by the editor (Daman Sharma)</li>
              <li><strong className="text-white">B.</strong> Validate the public sources independently</li>
              <li><strong className="text-white">C.</strong> If valid → €10,000 SEPA payout + Hall of Fame entry + adjustment to our scoring engine</li>
              <li><strong className="text-white">D.</strong> Public retro published explaining the heuristic gap and how we fixed it</li>
            </ol>
          </Box>
        </div>

        {/* HALL OF FAME placeholder */}
        <div className="rounded-2xl p-6"
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,170,0,0.2)', backdropFilter: 'blur(10px)' }}>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#ffaa00] font-black mb-3">Hall of Fame</div>
          <div className="text-[12px] text-[rgba(255,255,255,0.5)] italic">
            No winners yet. Be the first researcher to fool Genesis. Your name goes here forever.
          </div>
        </div>

      </div>
    </div>
  )
}

function Box({ title, icon: Icon, color, children }: { title: string; icon: React.ElementType; color: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5"
      style={{ background: `${color}06`, border: `1px solid ${color}30`, backdropFilter: 'blur(10px)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4" style={{ color }} />
        <span className="text-[10px] uppercase tracking-[0.2em] font-black" style={{ color }}>{title}</span>
      </div>
      {children}
    </div>
  )
}
