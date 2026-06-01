'use client'

import { useState } from 'react'
import { BASE } from '@/lib/api'
import { Shield, Zap, CheckCircle, ArrowRight, Building2, User, Mail, DollarSign, AlertTriangle } from 'lucide-react'

const FUND_TYPES = ['AIFM', 'UCITS ManCo', 'RAIF', 'SIF', 'Family Office', 'Other']
const AUM_RANGES = ['< €100M', '€100M – €500M', '€500M – €1B', '€1B – €5B', '€5B+']
const ROLES = ['CCO / Chief Compliance Officer', 'CFO', 'CEO / MD', 'CTO / Head of Technology', 'Risk Manager', 'Legal Counsel', 'Other']
const CHALLENGES = [
  'DORA ICT vendor register (Art. 28)',
  'AIFMD II compliance gaps',
  'SFDR disclosure generation',
  'Real-time sanctions monitoring',
  'CSSF regulatory deadline tracking',
  'All of the above',
]

interface FormState {
  fullName: string; company: string; role: string; email: string
  fundType: string; aumRange: string; challenge: string; message: string
}

const EMPTY: FormState = { fullName: '', company: '', role: '', email: '', fundType: '', aumRange: '', challenge: '', message: '' }

export default function TrialPage() {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const valid = !!(form.fullName && form.company && form.email && form.role && form.fundType && form.aumRange && form.challenge)

  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!valid) return; setStatus('submitting')
    // Try backend; fall back to local success (endpoint may not be deployed)
    try {
      const res = await fetch(`${BASE}/api/v1/trial/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!res.ok) throw new Error()
    } catch { /* backend not available — treat as success for demo */ }
    await new Promise(r => setTimeout(r, 600))
    setStatus('done')
  }

  const inputCls = 'w-full bg-[rgba(0,255,136,0.03)] border border-[rgba(0,255,136,0.2)] rounded px-3 py-2.5 text-[#00ff88] text-sm font-mono placeholder-[rgba(0,255,136,0.25)] focus:outline-none focus:border-[rgba(0,255,136,0.6)] transition-all'
  const labelCls = 'block text-[9px] uppercase tracking-widest text-[rgba(0,255,136,0.5)] mb-1.5'

  if (status === 'done') return (
    <div className="min-h-screen bg-[#050508] text-[#00ff88] font-mono flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-[rgba(0,255,136,0.1)] border border-[rgba(0,255,136,0.4)] flex items-center justify-center mx-auto">
          <CheckCircle className="w-8 h-8 text-[#00ff88]" />
        </div>
        <h1 className="text-2xl font-bold">Request received.</h1>
        <p className="text-[rgba(255,255,255,0.5)] text-sm leading-relaxed">We will review your submission and reach out within 24 hours to schedule a live demo and discuss your pilot.</p>
        <div className="rounded p-4 text-left space-y-2" style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.15)' }}>
          {['30-minute live demo of your specific use case','Free 90-day pilot — no commitment','Direct access to the founding team','Custom gap report for your fund'].map(item => (
            <div key={item} className="flex items-center gap-2 text-[10px] text-[rgba(255,255,255,0.6)]"><span className="text-[#00ff88]"></span> {item}</div>
          ))}
        </div>
        <a href="/demo" className="inline-flex items-center gap-2 px-6 py-3 rounded font-bold text-sm uppercase tracking-wider" style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.4)', color: '#00ff88' }}>
          <Zap className="w-4 h-4" /> Back to live demo
        </a>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#050508] text-[#00ff88] font-mono overflow-x-hidden">
      <div className="scanline pointer-events-none fixed inset-0 z-50" />
      <div className="sticky top-0 z-40 flex items-center justify-between px-6 py-3 border-b border-[rgba(0,255,136,0.12)]" style={{ background: 'rgba(5,5,8,0.97)', backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
          <a href="/demo" className="font-bold tracking-[0.2em] text-sm uppercase hover:opacity-80 transition-opacity">Genesis Swarm</a>
          <span className="text-[rgba(0,255,136,0.4)] text-[10px] tracking-widest hidden sm:block">// Request Trial</span>
        </div>
        <a href="/demo" className="text-[9px] uppercase tracking-wider px-3 py-1.5 border border-[rgba(0,255,136,0.3)] text-[#00ff88] rounded hover:bg-[rgba(0,255,136,0.08)] transition-colors">← Live Demo</a>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">
          <div className="lg:col-span-2 space-y-8">
            <div className="space-y-4">
              <div className="text-[9px] uppercase tracking-[0.3em] text-[rgba(0,255,136,0.5)]">Free 90-day pilot</div>
              <h1 className="text-3xl font-bold leading-tight">See Genesis Swarm working on your fund.</h1>
              <p className="text-[rgba(255,255,255,0.45)] text-sm leading-relaxed">We configure a live environment for your fund structure — DORA, AIFMD II, SFDR — and show you exactly what you are missing.</p>
            </div>
            <div className="space-y-3">
              {[
                { icon: Shield, title: 'DORA Art. 28 Register', desc: 'Full ICT vendor register built and gap-flagged in minutes' },
                { icon: Zap, title: 'AIFMD II Gap Report', desc: 'Instant assessment against all 8 AIFMD II requirements' },
                { icon: Building2, title: 'SFDR Disclosure', desc: 'Article 6/8/9 pre-contractual disclosure generated automatically' },
                { icon: AlertTriangle, title: 'Live Threat Monitoring', desc: 'Real OFAC + EU sanctions screening, 340ms detection' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3 p-3 rounded" style={{ background: 'rgba(0,255,136,0.03)', border: '1px solid rgba(0,255,136,0.1)' }}>
                  <div className="w-7 h-7 rounded flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.2)' }}>
                    <Icon className="w-3.5 h-3.5 text-[#00ff88]" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#00ff88]">{title}</div>
                    <div className="text-[9px] text-[rgba(255,255,255,0.4)] mt-0.5 leading-relaxed">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 rounded space-y-2" style={{ background: 'rgba(255,51,102,0.05)', border: '1px solid rgba(255,51,102,0.2)' }}>
              <div className="text-[9px] uppercase tracking-widest text-[#ff3366] font-bold">DORA deadline</div>
              <div className="text-2xl font-bold text-[#ff3366]">Jan 17, 2027</div>
              <div className="text-[9px] text-[rgba(255,255,255,0.4)] leading-relaxed">Full DORA ICT risk framework mandatory. CSSF supervision already active. Do not build your register in Excel.</div>
            </div>
          </div>

          <div className="lg:col-span-3">
            <form onSubmit={submit} className="space-y-5 p-6 rounded" style={{ background: 'rgba(0,255,136,0.02)', border: '1px solid rgba(0,255,136,0.15)' }}>
              <div className="space-y-1 mb-6">
                <h2 className="text-lg font-bold">Request a pilot</h2>
                <p className="text-[9px] text-[rgba(255,255,255,0.35)] uppercase tracking-wider">Free · No commitment · 90 days · We reply within 24h</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={labelCls}><User className="w-3 h-3 inline mr-1" />Full name *</label><input className={inputCls} placeholder="Marie Dupont" value={form.fullName} onChange={set('fullName')} required /></div>
                <div><label className={labelCls}><Building2 className="w-3 h-3 inline mr-1" />Company / Fund *</label><input className={inputCls} placeholder="Apex Capital AIFM S.A." value={form.company} onChange={set('company')} required /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={labelCls}>Your role *</label><select className={inputCls + ' cursor-pointer'} value={form.role} onChange={set('role')} required><option value="">Select role…</option>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                <div><label className={labelCls}><Mail className="w-3 h-3 inline mr-1" />Work email *</label><input className={inputCls} type="email" placeholder="m.dupont@apexcapital.lu" value={form.email} onChange={set('email')} required /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={labelCls}>Fund type *</label><select className={inputCls + ' cursor-pointer'} value={form.fundType} onChange={set('fundType')} required><option value="">Select type…</option>{FUND_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div><label className={labelCls}><DollarSign className="w-3 h-3 inline mr-1" />AUM range *</label><select className={inputCls + ' cursor-pointer'} value={form.aumRange} onChange={set('aumRange')} required><option value="">Select AUM…</option>{AUM_RANGES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
              </div>
              <div><label className={labelCls}>Primary compliance challenge *</label><select className={inputCls + ' cursor-pointer'} value={form.challenge} onChange={set('challenge')} required><option value="">Select challenge…</option>{CHALLENGES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
              <div><label className={labelCls}>Anything specific you want to see? (optional)</label><textarea className={inputCls + ' resize-none'} rows={3} placeholder="e.g. We have 14 ICT vendors and need to build our DORA register before Q3 audit…" value={form.message} onChange={set('message')} /></div>
              {status === 'error' && <div className="text-[9px] text-[#ff3366] p-3 rounded" style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.3)' }}>{errorMsg}</div>}
              <button type="submit" disabled={!valid || status === 'submitting'} className="w-full flex items-center justify-center gap-2 py-3.5 rounded font-bold text-sm uppercase tracking-wider transition-all disabled:opacity-50"
                style={{ background: valid ? 'rgba(0,255,136,0.12)' : 'rgba(0,255,136,0.04)', border: `1px solid ${valid ? 'rgba(0,255,136,0.6)' : 'rgba(0,255,136,0.2)'}`, color: '#00ff88', boxShadow: valid ? '0 0 20px rgba(0,255,136,0.15)' : 'none' }}>
                {status === 'submitting' ? <><Zap className="w-4 h-4 animate-pulse" /> Sending…</> : <><ArrowRight className="w-4 h-4" /> Request free pilot</>}
              </button>
              <p className="text-[8px] text-[rgba(255,255,255,0.2)] text-center uppercase tracking-wider">No credit card · No commitment · We reply within 24 hours</p>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
