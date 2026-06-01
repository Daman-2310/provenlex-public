'use client'

import { useEffect, useState } from 'react'
import { X, Activity, ExternalLink, Cpu } from 'lucide-react'

interface BotContribution {
  bot: string
  display_name: string
  weight: number
  signal: number
  contribution: number
  domain: string
  data_source: string
  data_source_url: string
  reasoning: string
  fired: boolean
}

interface ScoreBreakdown {
  entity: string
  prophecy_id: string
  total_score: number
  reconstructed_score: number
  algorithm: string
  confidence: number
  computed_at: string
  contributions: BotContribution[]
}

interface Props {
  breakdown: ScoreBreakdown
  onClose: () => void
}

const indexColor = (n: number) => n >= 70 ? '#ff3366' : n >= 50 ? '#ff7700' : n >= 30 ? '#ffaa00' : '#00ff88'

export default function ExplainabilityModal({ breakdown, onClose }: Props) {
  const [revealed, setRevealed] = useState(0)

  useEffect(() => {
    const t = setInterval(() => {
      setRevealed(r => r < breakdown.contributions.length ? r + 1 : r)
    }, 120)
    return () => clearInterval(t)
  }, [breakdown.contributions.length])

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [onClose])

  return (
    <div onClick={onClose}
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[6vh] px-4 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px) saturate(140%)' }}>

      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-4xl rounded-2xl overflow-hidden mb-12"
        style={{
          background: 'rgba(8,8,16,0.97)',
          border: '1px solid rgba(155,109,255,0.4)',
          boxShadow: '0 40px 100px rgba(0,0,0,0.8), 0 0 80px rgba(155,109,255,0.15)',
        }}>

        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-4"
          style={{ background: 'rgba(155,109,255,0.06)', borderBottom: '1px solid rgba(155,109,255,0.2)' }}>
          <div className="flex items-center gap-3">
            <Cpu className="w-5 h-5 text-[#9b6dff]" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#9b6dff] font-black">Score breakdown</div>
              <div className="text-[15px] font-black text-white">{breakdown.entity}</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[rgba(255,255,255,0.06)]"
            style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
            <X className="w-4 h-4 text-[rgba(255,255,255,0.7)]" />
          </button>
        </div>

        {/* AGGREGATE PANEL */}
        <div className="px-6 py-5 grid grid-cols-3 gap-4"
          style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="text-center">
            <div className="text-[8px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] mb-1 font-bold">Pre-Crime Index</div>
            <div className="font-black tabular-nums leading-none"
              style={{ fontSize: '2.75rem', color: indexColor(breakdown.total_score), textShadow: `0 0 20px ${indexColor(breakdown.total_score)}80` }}>
              {breakdown.total_score}
            </div>
            <div className="text-[9px] text-[rgba(255,255,255,0.4)] mt-1 uppercase font-mono">/ 100</div>
          </div>
          <div className="text-center">
            <div className="text-[8px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] mb-1 font-bold">Reconstructed</div>
            <div className="font-black tabular-nums leading-none text-[#4a9eff]"
              style={{ fontSize: '2.75rem' }}>
              {breakdown.reconstructed_score}
            </div>
            <div className="text-[9px] text-[rgba(255,255,255,0.4)] mt-1 uppercase font-mono">weighted-mean of 11 bots</div>
          </div>
          <div className="text-center">
            <div className="text-[8px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] mb-1 font-bold">Confidence</div>
            <div className="font-black tabular-nums leading-none text-[#00ff88]"
              style={{ fontSize: '2.75rem' }}>
              {breakdown.confidence}
            </div>
            <div className="text-[9px] text-[rgba(255,255,255,0.4)] mt-1 uppercase font-mono">reconstruction match</div>
          </div>
        </div>

        {/* ALGORITHM */}
        <div className="px-6 py-3 text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.45)] font-mono"
          style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          Algorithm: <span className="text-[#9b6dff] font-bold">{breakdown.algorithm}</span>
          <span className="mx-2 text-[rgba(255,255,255,0.2)]">·</span>
          Computed: <span className="text-white">{new Date(breakdown.computed_at).toUTCString()}</span>
        </div>

        {/* BOT CONTRIBUTIONS */}
        <div className="max-h-[60vh] overflow-y-auto p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[rgba(255,255,255,0.4)] font-black mb-3">
            11 bot panel · sorted by contribution to final score
          </div>
          <div className="space-y-2">
            {breakdown.contributions.map((c, i) => (
              <BotCard key={c.bot} contribution={c} revealed={i < revealed} />
            ))}
          </div>
        </div>

        {/* FOOTER */}
        <div className="px-6 py-3 text-[10px] text-[rgba(255,255,255,0.5)] flex items-center justify-between gap-3 flex-wrap"
          style={{ background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <span>Prophecy ID: <span className="text-[#9b6dff] font-mono font-bold">{breakdown.prophecy_id}</span></span>
          <span className="text-[rgba(255,255,255,0.4)]">Press <kbd className="font-mono font-bold px-1.5 py-0.5 rounded mx-1" style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>ESC</kbd> to close</span>
        </div>

      </div>
    </div>
  )
}

function BotCard({ contribution, revealed }: { contribution: BotContribution; revealed: boolean }) {
  const c = indexColor(contribution.signal)
  return (
    <div className="rounded-xl p-4 transition-all duration-500"
      style={{
        background: contribution.fired
          ? `linear-gradient(90deg, ${c}08 0%, rgba(0,0,0,0) 60%)`
          : 'rgba(255,255,255,0.02)',
        border: `1px solid ${contribution.fired ? c + '35' : 'rgba(255,255,255,0.06)'}`,
        opacity: revealed ? 1 : 0,
        transform: revealed ? 'translateY(0)' : 'translateY(8px)',
      }}>
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5" style={{ color: c }} />
          <span className="text-[11px] uppercase tracking-[0.15em] font-black" style={{ color: c }}>
            {contribution.display_name}
          </span>
          {contribution.fired && (
            <span className="text-[8px] uppercase font-black px-1.5 py-0.5 rounded-full"
              style={{ background: `${c}15`, color: c, border: `1px solid ${c}40` }}>
              FIRED
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider">
          <span className="text-[rgba(255,255,255,0.5)]">weight <span className="text-white font-bold tabular-nums ml-1">{contribution.weight}</span></span>
          <span className="text-[rgba(255,255,255,0.4)]">·</span>
          <span className="text-[rgba(255,255,255,0.5)]">signal <span className="font-black tabular-nums ml-1" style={{ color: c }}>{contribution.signal}</span></span>
          <span className="text-[rgba(255,255,255,0.4)]">·</span>
          <span className="text-[rgba(255,255,255,0.5)]">contrib <span className="font-black tabular-nums ml-1 text-white">{contribution.contribution.toFixed(1)}</span></span>
        </div>
      </div>

      {/* Signal bar */}
      <div className="h-1 rounded-full overflow-hidden mb-2" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{
            width: revealed ? `${contribution.signal}%` : '0%',
            background: `linear-gradient(90deg, ${c}aa, ${c})`,
            boxShadow: `0 0 6px ${c}`,
          }} />
      </div>

      <div className="text-[11px] text-[rgba(255,255,255,0.72)] leading-relaxed mb-2">{contribution.reasoning}</div>

      <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] font-mono">
        <span className="truncate"><span className="text-[rgba(255,255,255,0.5)]">Domain:</span> <span className="normal-case text-[rgba(255,255,255,0.6)]">{contribution.domain}</span></span>
        <a href={contribution.data_source_url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[#4a9eff] hover:underline shrink-0 ml-3 normal-case">
          {contribution.data_source} <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>
    </div>
  )
}
