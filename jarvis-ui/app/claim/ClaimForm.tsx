'use client'

import { useState } from 'react'
import { Loader2, Send, CheckCircle2, AlertCircle } from 'lucide-react'

const CATEGORIES = [
  { v: 'bank',           l: 'Bank' },
  { v: 'asset_mgmt',     l: 'Asset Management' },
  { v: 'insurance',      l: 'Insurance' },
  { v: 'private_equity', l: 'Private Equity' },
  { v: 'real_estate',    l: 'Real Estate' },
  { v: 'wealth',         l: 'Wealth Management' },
  { v: 'depositary',     l: 'Depositary' },
]

const JURISDICTIONS = ['LU', 'DE', 'FR', 'GB', 'IT', 'NL', 'CH', 'IE', 'ES', 'AT', 'BE', 'DK', 'SE', 'FI', 'NO', 'PL', 'CZ', 'PT', 'GR', 'HU']

export default function ClaimForm() {
  const [form, setForm] = useState({
    entity_name: '',
    lei: '',
    jurisdiction: 'LU',
    category: 'asset_mgmt',
    contact_name: '',
    contact_role: '',
    contact_email: '',
    tier: 'standard' as 'standard' | 'premium',
    motivation: '',
  })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<{ application_id: string; next_steps: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit() {
    setLoading(true); setError(null); setSuccess(null)
    try {
      const res = await fetch('/api/claim/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) { setError(`${json.error}${json.detail ? ' · ' + json.detail : ''}`); return }
      setSuccess({ application_id: json.application_id, next_steps: json.next_steps })
    } catch (e) {
      setError(`Network error: ${e}`)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="rounded-2xl p-5 space-y-4"
        style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,255,136,0.3)', backdropFilter: 'blur(10px)' }}>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-6 h-6 text-[#00ff88] shrink-0 mt-1" />
          <div>
            <div className="text-[14px] uppercase tracking-[0.18em] font-black text-[#00ff88] mb-1">Application received</div>
            <div className="text-[12px] text-[rgba(255,255,255,0.75)] leading-relaxed">{success.next_steps}</div>
            <div className="text-[10px] text-[rgba(255,255,255,0.5)] mt-3 font-mono">
              Application ID: <span className="text-[#00ff88]">{success.application_id}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl p-5 space-y-4"
      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,255,136,0.25)', backdropFilter: 'blur(10px)' }}>

      {/* Tier selection */}
      <div>
        <label className="block text-[10px] uppercase tracking-wider font-bold text-[#00ff88] mb-2">Tier</label>
        <div className="grid grid-cols-2 gap-3">
          {(['standard', 'premium'] as const).map(t => (
            <button key={t} onClick={() => setForm(f => ({ ...f, tier: t }))}
              className="text-left p-3 rounded-lg transition-all"
              style={{
                background: form.tier === t ? `rgba(${t === 'premium' ? '255,216,107' : '0,255,136'},0.12)` : 'rgba(0,0,0,0.3)',
                border: `1px solid ${form.tier === t ? (t === 'premium' ? 'rgba(255,216,107,0.5)' : 'rgba(0,255,136,0.5)') : 'rgba(255,255,255,0.1)'}`,
              }}>
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t === 'premium' ? '#ffd86b' : '#00ff88' }}>{t}</div>
              <div className="text-[13px] font-black text-white mt-0.5">{t === 'premium' ? '€15,000' : '€5,000'}</div>
              <div className="text-[10px] text-[rgba(255,255,255,0.5)]">+ {t === 'premium' ? '€3,000' : '€1,000'} / year</div>
            </button>
          ))}
        </div>
      </div>

      {/* Entity */}
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-3">
        <Field label="Entity name *"  value={form.entity_name}  onChange={update('entity_name')}  placeholder="Acme Capital Partners S.A." />
        <div>
          <label className="block text-[10px] uppercase tracking-wider font-bold text-[#00ff88] mb-1.5">Jurisdiction *</label>
          <select value={form.jurisdiction} onChange={update('jurisdiction')}
            className="w-full bg-black/40 outline-none text-white text-[12px] px-3 py-2 rounded border border-[rgba(0,255,136,0.2)] focus:border-[rgba(0,255,136,0.6)]">
            {JURISDICTIONS.map(j => <option key={j} value={j}>{j}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider font-bold text-[#00ff88] mb-1.5">Category *</label>
          <select value={form.category} onChange={update('category')}
            className="w-full bg-black/40 outline-none text-white text-[12px] px-3 py-2 rounded border border-[rgba(0,255,136,0.2)] focus:border-[rgba(0,255,136,0.6)]">
            {CATEGORIES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
          </select>
        </div>
      </div>

      <Field label="LEI (optional)" value={form.lei} onChange={update('lei')} placeholder="20-char Legal Entity Identifier · helps us prefill GLEIF data" mono />

      {/* Contact */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Your name *"  value={form.contact_name}  onChange={update('contact_name')} />
        <Field label="Your role *"  value={form.contact_role}  onChange={update('contact_role')} placeholder="Compliance Officer, CFO, GC…" />
        <Field label="Email *"      value={form.contact_email} onChange={update('contact_email')} type="email" />
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider font-bold text-[#00ff88] mb-1.5">Why are you applying? (optional)</label>
        <textarea value={form.motivation} onChange={update('motivation')} rows={4}
          placeholder="LP question? Marketing? Pre-audit credibility? Tell us so we can prioritise the review."
          className="w-full bg-black/40 outline-none text-white text-[12px] px-3 py-2 rounded border border-[rgba(0,255,136,0.2)] focus:border-[rgba(0,255,136,0.6)] resize-y" />
      </div>

      {error && (
        <div className="rounded p-2.5 flex items-start gap-2 text-[11px]"
          style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.3)', color: '#ff3366' }}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <button onClick={submit} disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-3 rounded font-bold text-sm uppercase tracking-wider transition-all disabled:opacity-50"
        style={{ background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.6)', color: '#00ff88', boxShadow: '0 0 20px rgba(0,255,136,0.15)' }}>
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting</> : <><Send className="w-4 h-4" /> Submit application</>}
      </button>

      <div className="text-[10px] text-[rgba(255,255,255,0.45)] leading-relaxed">
        We will review and email you an invoice within 5 business days. Payment is invoice-based today;
        Stripe self-serve checkout is coming. Your contact details are private to our team.
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type, mono, placeholder }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string; mono?: boolean; placeholder?: string }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider font-bold text-[#00ff88] mb-1.5">{label}</label>
      <input type={type ?? 'text'} value={value} onChange={onChange} placeholder={placeholder}
        className={`w-full bg-black/40 outline-none text-white text-[12px] px-3 py-2 rounded border border-[rgba(0,255,136,0.2)] focus:border-[rgba(0,255,136,0.6)] ${mono ? 'font-mono' : ''}`} />
    </div>
  )
}
