'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Crown, Clock, AlertOctagon, CheckCircle2, ShieldAlert, Lock } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'

interface LivePrediction {
  id: string
  rank: number
  entity: string
  lei?: string
  jurisdiction: string
  category: string
  pre_crime_index: number
  trajectory: string
  claim: string
  reasoning: string
  sealed_at: string
  reveal_window_end: string
  bitcoin_anchor_status: string
  book_merkle_root: string
  status: 'PENDING' | 'VINDICATED' | 'MISSED'
  elapsed_days: number
  remaining_days: number
}

const indexColor = (n: number) => n >= 70 ? '#ff3366' : n >= 50 ? '#ff7700' : n >= 30 ? '#ffaa00' : '#00ff88'

export default function PredictionsPage() {
  const [data, setData] = useState<{ predictions: LivePrediction[]; book_merkle_root?: string; issued_at?: string; bitcoin_anchor_status?: string } | null>(null)

  useEffect(() => {
    void fetch('/api/predictions').then(r => r.json()).then(setData)
  }, [])

  const preds = data?.predictions ?? []
  const vindicated = preds.filter(p => p.status === 'VINDICATED').length
  const pending = preds.filter(p => p.status === 'PENDING').length

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="intense" accent="#ff3366" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Crown className="w-4 h-4 text-[#ff3366]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#ff3366]">PRE-REGISTERED PREDICTIONS</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">10 live forecasts · anchored on Bitcoin</span>
        </div>
      </header>

      <div className="relative max-w-6xl mx-auto px-6 py-14">

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.3)' }}>
            <Lock className="w-3 h-3 text-[#ff3366]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#ff3366]">
              Falsifiable · time-stamped · publicly auditable
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.5rem, 6.5vw, 5.5rem)', lineHeight: 0.95 }}>
            <span className="text-white">10 named entities.</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #ff3366 0%, #ff7700 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(255,51,102,0.3))',
            }}>18 months to verdict.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl mx-auto leading-relaxed">
            Specific, dated, falsifiable predictions. Sealed on Bitcoin's blockchain. We win when
            history vindicates us. We learn publicly when it doesn't. <strong className="text-white">There is no losing scenario.</strong>
          </p>
        </div>

        {/* STATS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          <Stat label="Predictions" value={preds.length} color="#9b6dff" />
          <Stat label="Pending verdict" value={pending} color="#ffaa00" />
          <Stat label="Vindicated" value={vindicated} color="#ff3366" />
          <Stat label="Days elapsed" value={preds[0]?.elapsed_days ?? 0} color="#4a9eff" suffix="d" />
        </div>

        {/* SEAL */}
        {data?.book_merkle_root && (
          <div className="rounded-xl p-4 mb-10 flex items-center gap-3 flex-wrap"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(155,109,255,0.3)', backdropFilter: 'blur(10px)' }}>
            <ShieldAlert className="w-4 h-4 text-[#9b6dff] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] font-bold">Book Merkle root (Bitcoin-anchored)</div>
              <div className="text-[11px] font-mono text-[#9b6dff] truncate">0x{data.book_merkle_root}</div>
            </div>
            <span className="text-[9px] uppercase tracking-wider font-black px-2 py-1 rounded-full shrink-0"
              style={{ background: 'rgba(255,170,0,0.08)', color: '#ffaa00', border: '1px solid rgba(255,170,0,0.3)' }}>
              {data.bitcoin_anchor_status ?? 'PENDING'}
            </span>
          </div>
        )}

        {/* PREDICTIONS GRID */}
        <div className="space-y-3 mb-12">
          {preds.length === 0 ? (
            <div className="rounded-lg p-8 text-center text-[12px] text-[rgba(255,255,255,0.4)]">Loading predictions…</div>
          ) : (
            preds.map(p => <PredictionCard key={p.id} p={p} />)
          )}
        </div>

        {/* DOCTRINE */}
        <div className="rounded-2xl p-6"
          style={{ background: 'rgba(255,51,102,0.03)', border: '1px solid rgba(255,51,102,0.2)' }}>
          <Crown className="w-5 h-5 text-[#ff3366] mb-3" />
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#ff3366] font-black mb-2">The rule</div>
          <p className="text-[13px] text-[rgba(255,255,255,0.7)] leading-relaxed">
            A prediction is <strong className="text-white">vindicated</strong> if, within the 18-month window from sealing,
            the named entity experiences a material operational-distress event (regulator enforcement,
            material restatement, insolvency, redemption gates, executive arrest, or short-seller report
            with sustained price impact) confirmed by at least two credible outlets.{' '}
            <Link href="/legal" className="text-[#4a9eff] hover:underline">Full criteria in the terms.</Link>
          </p>
        </div>

      </div>
    </div>
  )
}

function PredictionCard({ p }: { p: LivePrediction }) {
  const c = indexColor(p.pre_crime_index)
  const statusColor = p.status === 'VINDICATED' ? '#ff3366' : p.status === 'MISSED' ? '#00ff88' : '#ffaa00'
  return (
    <Link href={`/book/${p.id}`}
      className="block rounded-2xl p-5 transition-all hover:scale-[1.005]"
      style={{
        background: `linear-gradient(90deg, ${c}06 0%, rgba(0,0,0,0.3) 70%)`,
        border: `1px solid ${c}35`,
        backdropFilter: 'blur(10px)',
        boxShadow: `0 0 24px ${c}10`,
      }}>
      <div className="grid grid-cols-[60px_1fr_140px] gap-4 items-start">
        <div className="text-center">
          <div className="text-[8px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] font-bold">PCI</div>
          <div className="text-3xl font-black tabular-nums leading-none"
            style={{ color: c, textShadow: `0 0 12px ${c}80` }}>
            {p.pre_crime_index}
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[14px] font-black text-white">{p.entity}</span>
            <span className="text-[8px] uppercase tracking-wider font-bold text-[rgba(255,255,255,0.5)]">
              {p.jurisdiction} · {p.category.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="text-[12px] text-[rgba(255,255,255,0.85)] leading-snug mb-2">{p.claim}</div>
          <div className="text-[10px] text-[rgba(255,255,255,0.55)] leading-snug italic">{p.reasoning}</div>
        </div>
        <div className="text-right">
          <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full mb-2"
            style={{ background: `${statusColor}15`, border: `1px solid ${statusColor}40` }}>
            {p.status === 'VINDICATED' ? <CheckCircle2 className="w-3 h-3" style={{ color: statusColor }} /> :
             p.status === 'MISSED' ? <AlertOctagon className="w-3 h-3" style={{ color: statusColor }} /> :
             <Clock className="w-3 h-3" style={{ color: statusColor }} />}
            <span className="text-[9px] uppercase tracking-wider font-black" style={{ color: statusColor }}>{p.status}</span>
          </div>
          <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.5)] font-mono">
            sealed <span className="text-white">{p.sealed_at.slice(0, 10)}</span>
          </div>
          <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.5)] font-mono">
            reveal <span className="text-[#ffaa00] font-bold">{p.reveal_window_end.slice(0, 10)}</span>
          </div>
          <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] font-mono mt-1">
            <span className="text-[#4a9eff]">{p.remaining_days}d</span> remaining
          </div>
        </div>
      </div>
    </Link>
  )
}

function Stat({ label, value, color, suffix }: { label: string; value: number; color: string; suffix?: string }) {
  return (
    <div className="rounded-2xl p-5"
      style={{
        background: `linear-gradient(135deg, ${color}10 0%, rgba(0,0,0,0.4) 100%)`,
        border: `1px solid ${color}40`,
        boxShadow: `0 0 18px ${color}15`,
        backdropFilter: 'blur(10px)',
      }}>
      <div className="text-[9px] uppercase tracking-[0.18em] text-[rgba(255,255,255,0.5)] font-bold mb-1">{label}</div>
      <div className="font-black tabular-nums leading-none"
        style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)', color, textShadow: `0 0 16px ${color}80` }}>
        {value}{suffix && <span className="text-[10px] text-[rgba(255,255,255,0.4)] ml-1 uppercase">{suffix}</span>}
      </div>
    </div>
  )
}
