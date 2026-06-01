'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Sparkles, Lock, Eye, AlertOctagon, Clock, TrendingUp, ShieldAlert } from 'lucide-react'
import LegalDisclaimer from '@/components/LegalDisclaimer'
import CosmicBackground from '@/components/CosmicBackground'

interface ProphecyLite {
  id: string
  subject: string
  sealed_at: string
  pre_crime_index: number
  pattern?: string
}

interface FullProphecy {
  id: string
  subject: string
  lei?: string
  sealed_at: string
  reveal_at: string
  pre_crime_index: number
  genesis_score: number
  trajectory: string
  pattern_match?: string
  forecast: string
  signals: { name: string; severity: number; note: string }[]
  merkle_root: string
  signature: string
  status: string
}

export default function ProphecyPage() {
  const [subject, setSubject] = useState('')
  const [lei, setLei] = useState('')
  const [loading, setLoading] = useState(false)
  const [latest, setLatest] = useState<FullProphecy | null>(null)
  const [recent, setRecent] = useState<ProphecyLite[]>([])
  const [error, setError] = useState('')

  async function loadRecent() {
    try {
      const r = await fetch('/api/prophecy/list')
      const j = await r.json() as { prophecies?: ProphecyLite[] }
      setRecent(j.prophecies ?? [])
    } catch { /* */ }
  }

  useEffect(() => { void loadRecent() }, [])

  async function sealProphecy() {
    if (!subject.trim()) return
    setLoading(true); setError(''); setLatest(null)
    try {
      const r = await fetch('/api/prophecy/seal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), lei: lei.trim() || undefined }),
      })
      const j = await r.json() as { ok?: boolean; prophecy?: FullProphecy; error?: string }
      if (j.ok && j.prophecy) {
        setLatest(j.prophecy)
        void loadRecent()
      } else {
        setError(j.error ?? 'sealing failed')
      }
    } catch (e) { setError(String(e)) }
    setLoading(false)
  }

  const indexColor = (idx: number) =>
    idx >= 70 ? '#ff3366' : idx >= 40 ? '#ffaa00' : '#00ff88'

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#9b6dff" />
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Sparkles className="w-4 h-4" style={{ color: '#9b6dff' }} />
          <span className="text-sm font-bold tracking-[0.18em]" style={{ color: '#9b6dff' }}>PROPHECY ENGINE</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">cryptographically sealed · merkle anchored</span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-14">

        {/* HERO */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(155,109,255,0.08)', border: '1px solid rgba(155,109,255,0.3)' }}>
            <Lock className="w-3 h-3" style={{ color: '#9b6dff' }} />
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold" style={{ color: '#9b6dff' }}>
              Mythological-tier feature · industry first
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-4" style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', lineHeight: 1 }}>
            <span style={{ background: 'linear-gradient(90deg, #9b6dff 0%, #4a9eff 50%, #00ff88 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              We predict.
            </span>
            <br />
            <span className="text-white">We seal it.</span>
            <br />
            <span style={{ color: '#9b6dff' }}>We prove it later.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl mx-auto leading-relaxed">
            Every fund prophecy is sealed with a Merkle proof and timestamped on issue.
            When fraud breaks 12-24 months later, we open the seal and prove the date stamp.
            Nobody else does this — because of liability. We do it because it's <em>legend</em>.
          </p>
        </div>

        {/* SEAL FORM */}
        <div className="rounded-2xl p-6 mb-10"
          style={{ background: 'rgba(155,109,255,0.04)', border: '1px solid rgba(155,109,255,0.25)', boxShadow: '0 0 32px rgba(155,109,255,0.08)' }}>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#9b6dff] font-black mb-3">Issue a sealed prophecy</div>
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_auto] gap-3">
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Fund or entity name (e.g. Wirecard AG, BlackRock UCITS)"
              className="px-4 py-3 rounded-lg text-sm bg-[rgba(0,0,0,0.4)] text-white border border-[rgba(155,109,255,0.3)] focus:border-[#9b6dff] outline-none"
              onKeyDown={e => { if (e.key === 'Enter') void sealProphecy() }}
            />
            <input
              value={lei}
              onChange={e => setLei(e.target.value)}
              placeholder="LEI (optional, 20 chars)"
              maxLength={20}
              className="px-4 py-3 rounded-lg text-sm bg-[rgba(0,0,0,0.4)] text-white border border-[rgba(155,109,255,0.3)] focus:border-[#9b6dff] outline-none font-mono uppercase"
            />
            <button
              onClick={() => void sealProphecy()}
              disabled={loading || !subject.trim()}
              className="px-6 py-3 rounded-lg text-sm font-black uppercase tracking-[0.15em] transition-all disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #9b6dff 0%, #4a9eff 100%)', color: '#000', boxShadow: '0 0 24px rgba(155,109,255,0.4)' }}>
              {loading ? 'Sealing…' : 'Seal It'}
            </button>
          </div>
          {error && <div className="text-[#ff3366] text-[11px] mt-3">{error}</div>}
          <div className="text-[9px] text-[rgba(255,255,255,0.35)] mt-3 uppercase tracking-wider">
            On issue: AI computes Pre-Crime Index → Merkle root → 5-year KV anchor → public verification URL
          </div>
        </div>

        {/* LATEST PROPHECY */}
        {latest && (
          <div className="rounded-2xl p-6 mb-10"
            style={{
              background: `linear-gradient(135deg, ${indexColor(latest.pre_crime_index)}08 0%, rgba(0,0,0,0) 100%)`,
              border: `1px solid ${indexColor(latest.pre_crime_index)}40`,
              boxShadow: `0 0 32px ${indexColor(latest.pre_crime_index)}15`,
            }}>
            <div className="flex items-start justify-between mb-5">
              <div>
                <div className="text-[9px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.5)] mb-1">Sealed Prophecy</div>
                <div className="text-2xl font-black">{latest.subject}</div>
                {latest.lei && <div className="text-[10px] font-mono text-[rgba(255,255,255,0.4)] mt-1">LEI {latest.lei}</div>}
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{ background: `${indexColor(latest.pre_crime_index)}15`, border: `1px solid ${indexColor(latest.pre_crime_index)}50` }}>
                <Lock className="w-3 h-3" style={{ color: indexColor(latest.pre_crime_index) }} />
                <span className="text-[10px] uppercase tracking-[0.15em] font-black"
                  style={{ color: indexColor(latest.pre_crime_index) }}>{latest.status}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              <Tile label="Pre-Crime Index" value={`${latest.pre_crime_index}/100`} color={indexColor(latest.pre_crime_index)} big />
              <Tile label="Genesis Score" value={`${latest.genesis_score}/100`} color={indexColor(100 - latest.genesis_score)} />
              <Tile label="Trajectory" value={latest.trajectory} color={latest.trajectory === 'RISING' ? '#ff3366' : latest.trajectory === 'FALLING' ? '#00ff88' : '#ffaa00'} icon={<TrendingUp className="w-3 h-3" />} />
            </div>

            <div className="text-[13px] leading-relaxed text-[rgba(255,255,255,0.8)] mb-5 pl-3"
              style={{ borderLeft: `2px solid ${indexColor(latest.pre_crime_index)}60` }}>
              {latest.forecast}
            </div>

            {latest.pattern_match && (
              <div className="rounded-lg p-3 mb-5"
                style={{ background: 'rgba(255,51,102,0.06)', border: '1px solid rgba(255,51,102,0.3)' }}>
                <div className="text-[9px] text-[#ff3366] uppercase tracking-[0.18em] font-bold mb-1">Historical pattern match</div>
                <div className="text-[18px] font-black text-[#ff3366] uppercase tracking-wider">{latest.pattern_match}</div>
              </div>
            )}

            <div className="space-y-2 mb-5">
              <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] font-bold">Signal contributions</div>
              {latest.signals.map(s => (
                <div key={s.name} className="flex items-center gap-3 text-[11px]">
                  <span className="w-32 truncate text-[rgba(255,255,255,0.7)]">{s.name}</span>
                  <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div className="h-full rounded-full" style={{
                      width: `${Math.min(100, s.severity)}%`,
                      background: `linear-gradient(90deg, ${indexColor(s.severity)}aa, ${indexColor(s.severity)})`,
                    }} />
                  </div>
                  <span className="w-7 text-right font-black tabular-nums" style={{ color: indexColor(s.severity) }}>{s.severity}</span>
                  <span className="flex-[2] text-[rgba(255,255,255,0.5)] truncate">{s.note}</span>
                </div>
              ))}
            </div>

            <div className="rounded-lg p-3"
              style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-[9px] uppercase tracking-[0.18em] text-[#9b6dff] font-bold mb-2 flex items-center gap-2">
                <ShieldAlert className="w-3 h-3" /> Cryptographic seal
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] font-mono">
                <Field k="ID" v={latest.id} />
                <Field k="Sealed" v={new Date(latest.sealed_at).toUTCString()} />
                <Field k="Reveal" v={new Date(latest.reveal_at).toUTCString()} />
                <Field k="Merkle root" v={'0x' + latest.merkle_root.slice(0, 24) + '…'} />
                <Field k="Signature" v={'0x' + latest.signature.slice(0, 24) + '…'} />
                <Field k="Status" v={latest.status} />
              </div>
              <div className="mt-3 flex gap-3">
                <Link href={`/prophecy/${latest.id}`}
                  className="text-[10px] uppercase tracking-[0.15em] font-bold px-3 py-1.5 rounded"
                  style={{ background: 'rgba(155,109,255,0.1)', color: '#9b6dff', border: '1px solid rgba(155,109,255,0.4)' }}>
                  View permanent record →
                </Link>
                <button
                  onClick={() => { void navigator.clipboard.writeText(`${location.origin}/prophecy/${latest.id}`) }}
                  className="text-[10px] uppercase tracking-[0.15em] font-bold px-3 py-1.5 rounded"
                  style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  Copy URL
                </button>
              </div>
            </div>
          </div>
        )}

        {/* RECENT */}
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] font-black mb-4 flex items-center gap-2">
            <Eye className="w-3 h-3" />
            Recent prophecies <span className="text-[#9b6dff]">({recent.length})</span>
          </div>
          {recent.length === 0 ? (
            <div className="rounded-lg p-6 text-center text-[12px] text-[rgba(255,255,255,0.4)]"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)' }}>
              No prophecies sealed yet. Be the first.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {recent.map(p => (
                <Link key={p.id} href={`/prophecy/${p.id}`}
                  className="rounded-lg p-4 transition-all hover:scale-[1.02]"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${indexColor(p.pre_crime_index)}30`,
                  }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[8px] font-mono text-[rgba(255,255,255,0.4)]">{p.id}</div>
                    {p.pattern && (
                      <span className="text-[8px] uppercase font-black px-1.5 py-0.5 rounded-full"
                        style={{ background: 'rgba(255,51,102,0.1)', color: '#ff3366', border: '1px solid rgba(255,51,102,0.3)' }}>
                        {p.pattern}
                      </span>
                    )}
                  </div>
                  <div className="text-[14px] font-black mb-2 truncate">{p.subject}</div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-black tabular-nums" style={{ color: indexColor(p.pre_crime_index) }}>
                      {p.pre_crime_index}
                    </span>
                    <span className="text-[8px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">/100 pre-crime</span>
                  </div>
                  <div className="text-[9px] text-[rgba(255,255,255,0.4)] mt-1.5 flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {new Date(p.sealed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* WHY */}
        <div className="mt-14 rounded-2xl p-8"
          style={{ background: 'rgba(155,109,255,0.03)', border: '1px solid rgba(155,109,255,0.2)' }}>
          <AlertOctagon className="w-6 h-6 text-[#9b6dff] mb-3" />
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#9b6dff] font-black mb-2">The point</div>
          <p className="text-[14px] text-[rgba(255,255,255,0.7)] leading-relaxed">
            Every compliance tool tells you what <em>is</em>. Genesis Prophecy tells you what an AI model{' '}
            <em>forecasts may be</em> — and cryptographically locks the analysis so you can verify the date stamp
            later. The forecast is research, not advice. The timestamp is the witness.
          </p>
        </div>

        <div className="mt-6">
          <LegalDisclaimer variant="compact" />
        </div>

      </div>
    </div>
  )
}

function Tile({ label, value, color, big, icon }: { label: string; value: string; color: string; big?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg p-4"
      style={{ background: `${color}06`, border: `1px solid ${color}30` }}>
      <div className="text-[8px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] mb-1 font-bold">{label}</div>
      <div className="flex items-baseline gap-2">
        {icon && <span style={{ color }}>{icon}</span>}
        <span className={big ? 'text-4xl font-black tabular-nums' : 'text-xl font-black'} style={{ color, textShadow: big ? `0 0 16px ${color}80` : undefined }}>
          {value}
        </span>
      </div>
    </div>
  )
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-[rgba(255,255,255,0.4)] uppercase tracking-wider shrink-0 w-20">{k}</span>
      <span className="text-[rgba(255,255,255,0.85)] truncate">{v}</span>
    </div>
  )
}
