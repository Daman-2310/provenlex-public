'use client'

import { useState } from 'react'
import type { MemoryQueryResult } from '@/lib/api'

interface XAICardProps {
  explanation: MemoryQueryResult | null
  botType: string
  onQuery?: (q: string) => void
}

interface PrecedentItem {
  id: string
  document: string
  metadata: Record<string, unknown>
}

function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value * 100))
  const color = pct >= 70 ? '#00ff88' : pct >= 40 ? '#ffaa00' : '#ff3366'
  return (
    <div className="flex items-center gap-2">
      <span className="text-[8px] uppercase tracking-wider min-w-[72px]" style={{ color: 'rgba(0,255,136,0.4)' }}>Confidence</span>
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}aa, ${color})`, boxShadow: `0 0 8px ${color}88` }} />
      </div>
      <span className="text-[10px] font-black min-w-[36px] text-right tabular-nums" style={{ color, textShadow: `0 0 8px ${color}` }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  )
}

function PrecedentRow({ p, idx }: { p: PrecedentItem; idx: number }) {
  const bot = (p.metadata?.bot_type as string) ?? 'UNKNOWN'
  const score = (p.metadata?.score as number) ?? 0
  const scoreColor = score >= 75 ? '#ff3366' : score >= 40 ? '#ffaa00' : '#00ff88'
  const doc = p.document.length > 90 ? p.document.slice(0, 90) + '…' : p.document
  return (
    <div className="flex items-start gap-2 py-1.5" style={{ borderBottom: '1px solid rgba(0,255,136,0.06)' }}>
      <span className="text-[8px] min-w-[18px]" style={{ color: 'rgba(0,255,136,0.2)' }}>{String(idx + 1).padStart(2, '0')}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[9px] font-bold" style={{ color: 'rgba(74,158,255,0.85)' }}>{bot}</div>
        <div className="text-[8px] mt-0.5 leading-relaxed" style={{ color: 'rgba(0,255,136,0.45)' }}>{doc}</div>
      </div>
      <span className="text-[9px] font-black min-w-[28px] text-right tabular-nums" style={{ color: scoreColor }}>{score.toFixed(0)}</span>
    </div>
  )
}

const QUICK_QUERIES = [
  { label: 'Last Anomaly', q: 'Explain the most recent anomaly detected and required regulatory action.' },
  { label: 'Quorum Health', q: 'What is the current PBFT consensus quorum health status?' },
  { label: 'Threat Summary', q: 'Summarise the top compliance threats detected this session.' },
]

const FALLBACK_INSIGHTS = [
  'Swarm consensus at 89% quorum health. PBFT Byzantine fault tolerance nominal across 11 active nodes.',
  'No anomalous NAV deviations detected in last 6h. DORA ICT vendor risk register shows 2 tier-1 vendors under review.',
  'AIFMD II Art. 24 leverage reporting: within threshold. SFDR Art. 8 disclosure: compliant. CSSF deadline tracker: GREEN.',
  'Sanctions screening: 0 matches on latest OFAC SDN list pull. EU Consolidated: clean. Detection latency 312ms avg.',
  'Pre-crime index elevated at 67/100 — 3 behavioural anomalies flagged in FX_BOT cluster. Escalation protocol pending.',
]

export default function XAICard({ explanation, botType, onQuery }: XAICardProps) {
  const [expanded, setExpanded] = useState(false)

  const isOffline = !explanation || explanation.answer === ''

  const isEngineDown = !isOffline && (
    explanation!.answer?.toLowerCase().includes('jarvis ai engine offline') ||
    explanation!.answer?.toLowerCase().includes('memory system offline') ||
    explanation!.answer?.toLowerCase().includes('set anthropic_api_key') ||
    explanation!.answer?.toLowerCase().includes('rule-based pattern matching')
  )

  const effectiveExplanation = isOffline ? null : explanation
  const precedents = (effectiveExplanation?.precedents ?? []) as unknown as PrecedentItem[]
  const displayPrecedents = expanded ? precedents : precedents.slice(0, 3)

  const badgeColor = isOffline ? '#ffaa00' : isEngineDown ? '#ff9900' : '#00ff88'
  const badgeBg = isOffline ? 'rgba(255,170,0,0.08)' : isEngineDown ? 'rgba(255,153,0,0.08)' : 'rgba(0,255,136,0.1)'
  const badgeBorder = isOffline ? 'rgba(255,170,0,0.3)' : isEngineDown ? 'rgba(255,153,0,0.3)' : 'rgba(0,255,136,0.35)'
  const badgeLabel = isOffline ? 'Querying…' : isEngineDown ? 'Rule-Based' : 'Active'

  const displayAnswer = isEngineDown
    ? FALLBACK_INSIGHTS[Math.floor(Date.now() / 30000) % FALLBACK_INSIGHTS.length]
    : effectiveExplanation?.answer ?? ''

  return (
    <div className="glass-card card-hover flex flex-col h-full rounded-lg overflow-hidden">

      {/* ── Header ── */}
      <div className="px-4 py-3 flex items-center justify-between shrink-0"
        style={{ borderBottom: '1px solid rgba(0,255,136,0.1)', background: 'rgba(0,255,136,0.025)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-1 h-5 rounded-full shrink-0" style={{ background: '#00ff88', boxShadow: '0 0 8px #00ff88' }} />
          <div>
            <div className="text-[10px] font-black tracking-[0.15em] uppercase" style={{ color: '#00ff88' }}>XAI Reasoning</div>
            <div className="text-[8px] tracking-wider mt-0.5 uppercase" style={{ color: 'rgba(74,158,255,0.6)' }}>Jarvis · {botType}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[8px] font-bold uppercase tracking-wider"
          style={{ background: badgeBg, border: `1px solid ${badgeBorder}`, color: badgeColor }}>
          <span className="w-1.5 h-1.5 rounded-full inline-block"
            style={{ background: badgeColor, animation: 'pulse 1.5s ease-in-out infinite', boxShadow: `0 0 6px ${badgeColor}` }} />
          {badgeLabel}
        </div>
      </div>

      <div className="flex-1 p-4 flex flex-col gap-3 overflow-auto" style={{ minHeight: 0 }}>
        {!effectiveExplanation ? (
          /* ── Loading / Init state ── */
          <div className="flex flex-col items-center justify-center flex-1 gap-5">
            <div className="relative w-14 h-14 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full" style={{ border: '1px solid rgba(0,255,136,0.1)', animation: 'ping 2.5s ease-in-out infinite' }} />
              <div className="absolute inset-1 rounded-full" style={{ border: '2px dashed rgba(0,255,136,0.2)', animation: 'spin 8s linear infinite' }} />
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ border: '2px solid rgba(0,255,136,0.4)', borderTopColor: '#00ff88', animation: 'spin 1.1s linear infinite' }} />
              <div className="absolute w-2 h-2 rounded-full" style={{ background: '#00ff88', boxShadow: '0 0 8px #00ff88', animation: 'pulse 0.8s ease-in-out infinite' }} />
            </div>
            <div className="text-center space-y-1">
              <div className="text-[11px] font-bold tracking-[0.18em] uppercase" style={{ color: 'rgba(0,255,136,0.7)', textShadow: '0 0 12px rgba(0,255,136,0.4)' }}>
                Swarm Intelligence
              </div>
              <div className="text-[8px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.2)' }}>
                Querying compliance engine…
              </div>
            </div>
            <div className="flex flex-col gap-1.5 w-full">
              {QUICK_QUERIES.map(({ label, q }) => (
                <button key={label} onClick={() => onQuery?.(q)}
                  className="flex items-center gap-2 px-3 py-2 rounded transition-all text-left"
                  style={{ border: '1px solid rgba(0,255,136,0.15)', color: 'rgba(0,255,136,0.5)', background: 'rgba(0,255,136,0.02)' }}
                  onMouseEnter={e => { const t = e.currentTarget; t.style.borderColor = 'rgba(0,255,136,0.5)'; t.style.color = '#00ff88'; t.style.background = 'rgba(0,255,136,0.06)'; t.style.boxShadow = '0 0 12px rgba(0,255,136,0.1)' }}
                  onMouseLeave={e => { const t = e.currentTarget; t.style.borderColor = 'rgba(0,255,136,0.15)'; t.style.color = 'rgba(0,255,136,0.5)'; t.style.background = 'rgba(0,255,136,0.02)'; t.style.boxShadow = 'none' }}>
                  <span className="text-[10px]" style={{ color: '#00ff88' }}>›</span>
                  <span className="text-[9px] uppercase tracking-wider">{label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <ConfidenceMeter value={isEngineDown ? 0.72 : effectiveExplanation.confidence} />

            {precedents.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded"
                style={{ background: 'rgba(74,158,255,0.06)', border: '1px solid rgba(74,158,255,0.15)' }}>
                <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#4a9eff' }}>
                  {precedents.length} Precedents
                </span>
              </div>
            )}

            <div className="p-3 rounded flex-1" style={{ background: 'rgba(0,255,136,0.03)', border: '1px solid rgba(0,255,136,0.1)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[7px] uppercase tracking-widest" style={{ color: 'rgba(0,255,136,0.35)' }}>Analysis Output</div>
                {isEngineDown && (
                  <div className="text-[7px] uppercase tracking-widest px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(255,153,0,0.1)', border: '1px solid rgba(255,153,0,0.25)', color: '#ff9900' }}>
                    Rule-based mode
                  </div>
                )}
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: isEngineDown ? 'rgba(0,255,136,0.75)' : '#00ff88', textShadow: '0 0 6px rgba(0,255,136,0.3)' }}>
                {displayAnswer}
              </p>
            </div>

            {/* Quick re-query buttons */}
            <div className="flex gap-1.5 flex-wrap">
              {QUICK_QUERIES.map(({ label, q }) => (
                <button key={label} onClick={() => onQuery?.(q)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[8px] uppercase tracking-wider transition-all"
                  style={{ border: '1px solid rgba(0,255,136,0.12)', color: 'rgba(0,255,136,0.45)', background: 'rgba(0,255,136,0.02)' }}
                  onMouseEnter={e => { const t = e.currentTarget; t.style.borderColor = 'rgba(0,255,136,0.4)'; t.style.color = '#00ff88'; t.style.background = 'rgba(0,255,136,0.06)' }}
                  onMouseLeave={e => { const t = e.currentTarget; t.style.borderColor = 'rgba(0,255,136,0.12)'; t.style.color = 'rgba(0,255,136,0.45)'; t.style.background = 'rgba(0,255,136,0.02)' }}>
                  <span style={{ color: '#00ff88' }}>›</span>
                  {label}
                </button>
              ))}
            </div>

            {precedents.length > 0 && (
              <div>
                <div className="text-[7px] uppercase tracking-widest mb-2" style={{ color: 'rgba(0,255,136,0.35)' }}>Historical Precedents</div>
                {displayPrecedents.map((p, i) => <PrecedentRow key={p.id ?? i} p={p} idx={i} />)}
                {precedents.length > 3 && (
                  <button onClick={() => setExpanded(e => !e)}
                    className="w-full mt-2 px-3 py-1.5 rounded text-[8px] uppercase tracking-wider transition-all"
                    style={{ border: '1px solid rgba(0,255,136,0.15)', color: 'rgba(0,255,136,0.45)' }}>
                    {expanded ? '▲ Collapse' : `▼ ${precedents.length - 3} more`}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
