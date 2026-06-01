'use client'

import { useState } from 'react'
import { Loader2, CheckCircle2, AlertCircle, Mail } from 'lucide-react'

export default function CodexWaitlist() {
  const [email, setEmail] = useState('')
  const [intent, setIntent] = useState('')
  const [org, setOrg] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!email.trim()) { setError('Email required.'); return }
    setLoading(true); setError(null); setSuccess(null)
    try {
      const res = await fetch('/api/codex/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, intent, org }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed'); return }
      setSuccess(json.message ?? 'You are on the list.')
    } catch (e) {
      setError(`Network error: ${e}`)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="rounded p-3 flex items-center gap-2"
        style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)' }}>
        <CheckCircle2 className="w-4 h-4 text-[#00ff88]" />
        <span className="text-[12px] text-[#00ff88]">{success}</span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="you@firm.com"
          className="bg-black/40 outline-none text-white text-[13px] px-3 py-2 rounded border border-[rgba(0,216,255,0.2)] focus:border-[rgba(0,216,255,0.6)]" />
        <input type="text" value={org} onChange={e => setOrg(e.target.value)}
          placeholder="Organisation (optional)"
          className="bg-black/40 outline-none text-white text-[13px] px-3 py-2 rounded border border-[rgba(0,216,255,0.2)] focus:border-[rgba(0,216,255,0.6)]" />
      </div>
      <textarea value={intent} onChange={e => setIntent(e.target.value)}
        rows={2}
        placeholder="Use case (optional) — e.g. local deployment in our compliance team, research on AIFMD, etc."
        className="w-full bg-black/40 outline-none text-white text-[13px] px-3 py-2 rounded border border-[rgba(0,216,255,0.2)] focus:border-[rgba(0,216,255,0.6)] resize-y" />
      {error && (
        <div className="rounded p-2 flex items-center gap-2 text-[11px]"
          style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.3)', color: '#ff3366' }}>
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </div>
      )}
      <button onClick={submit} disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded font-bold text-sm uppercase tracking-wider transition-all disabled:opacity-50"
        style={{ background: 'rgba(0,216,255,0.15)', border: '1px solid rgba(0,216,255,0.6)', color: '#00d8ff' }}>
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Adding</> : <><Mail className="w-4 h-4" /> Join waitlist</>}
      </button>
    </div>
  )
}
