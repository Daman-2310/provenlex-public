'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { BASE, wakeupBackend } from '@/lib/api'
import { useLiveDashboard } from '@/lib/useWebSocket'
import { useWebSocket } from '@/lib/useWebSocket'
import {
  AlertTriangle, Shield, Zap, Activity, Radio, Calendar, FileText,
  FileDown, ArrowRight, Play, CheckCircle, Clock, MessageSquare, TrendingUp,
} from 'lucide-react'

// ── Lightweight types ──────────────────────────────────────────────────────

interface BotRow {
  bot_type: string
  last_score: number
  last_summary: string
  is_anomaly: boolean
  healthy: boolean
}

interface AlertPayload {
  bot_type: string
  score: number
  summary: string
}

// ── AUM per bot (€M) ──────────────────────────────────────────────────────

const AUM: Record<string, number> = {
  NAV_DETECTOR: 2100, FX_BOT: 3400, SOVEREIGN_BOT: 4500,
  SANCTIONS_BOT: 1200, CARGO_BOT: 890, COMPLIANCE_BOT: 780,
  SUCCESSION_BOT: 650, FUEL_BOT: 520, YACHT_GUARDIAN: 310,
  ORBITAL_BOT: 280, SHADOW_BOT: 150,
}

function fmtEur(m: number) {
  return m >= 1000 ? `€${(m / 1000).toFixed(1)}B` : `€${Math.round(m)}M`
}

// ── Score arc gauge ───────────────────────────────────────────────────────

function ScoreArc({ score, size = 64 }: { score: number; size?: number }) {
  const r = size * 0.4
  const cx = size / 2
  const cy = size / 2
  const pct = Math.min(100, Math.max(0, score)) / 100
  const angle = -180 + pct * 180

  function pt(deg: number, rad: number) {
    const a = (deg * Math.PI) / 180
    return { x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) }
  }

  const s = pt(-180, r)
  const e = pt(0, r)
  const m = pt(angle, r)
  const bg = `M ${s.x} ${s.y} A ${r} ${r} 0 0 1 ${e.x} ${e.y}`
  const fill = pct > 0 ? `M ${s.x} ${s.y} A ${r} ${r} 0 ${pct > 0.5 ? 1 : 0} 1 ${m.x} ${m.y}` : ''
  const color = score >= 75 ? '#ff3366' : score >= 40 ? '#ffaa00' : '#00ff88'

  return (
    <svg width={size} height={size * 0.6} viewBox={`0 0 ${size} ${size * 0.6}`} className="overflow-visible">
      <path d={bg} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={size * 0.08} strokeLinecap="round" />
      {fill && <path d={fill} fill="none" stroke={color} strokeWidth={size * 0.08} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 4px ${color})` }} />}
      <text x={cx} y={cy * 0.9} textAnchor="middle" fontSize={size * 0.22} fontWeight="bold"
        fontFamily="JetBrains Mono, monospace" fill={color}>{Math.round(score)}</text>
    </svg>
  )
}

// ── Bot mini-card ─────────────────────────────────────────────────────────

function BotMiniCard({ bot }: { bot: BotRow }) {
  const color = bot.is_anomaly ? '#ff3366' : bot.last_score >= 40 ? '#ffaa00' : '#00ff88'
  const aum = AUM[bot.bot_type]
  return (
    <div className={`rounded p-3 transition-all duration-500${bot.is_anomaly ? ' anomaly-pulse' : ''}`}
      style={{
        background: bot.is_anomaly ? 'rgba(255,51,102,0.08)' : 'rgba(0,255,136,0.03)',
        border: `1px solid ${bot.is_anomaly ? 'rgba(255,51,102,0.6)' : 'rgba(0,255,136,0.15)'}`,
        boxShadow: bot.is_anomaly ? '0 0 32px rgba(255,51,102,0.25)' : 'none',
      }}>
      {/* Top stripe */}
      <div className="h-0.5 rounded-full mb-2" style={{ background: color }} />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-bold tracking-wider truncate" style={{ color }}>
            {bot.bot_type.replace(/_/g, ' ')}
          </div>
          {aum && (
            <div className="text-[8px] text-[rgba(255,255,255,0.3)] mt-0.5 uppercase tracking-wider">
              {fmtEur(aum)} AUM
            </div>
          )}
        </div>
        <ScoreArc score={bot.last_score} size={52} />
      </div>

      <div className="mt-2 text-[8px] text-[rgba(255,255,255,0.45)] leading-relaxed line-clamp-2">
        {bot.last_summary}
      </div>

      {bot.is_anomaly && (
        <div className="mt-2 flex items-center gap-1">
          <AlertTriangle className="w-2.5 h-2.5 text-[#ff3366]" style={{ animation: 'pulse 0.8s ease-in-out infinite' }} />
          <span className="text-[7px] text-[#ff3366] uppercase tracking-widest font-bold">Anomaly · Quorum voting</span>
        </div>
      )}
    </div>
  )
}

// ── Pipeline stage strip ──────────────────────────────────────────────────

const STAGES = [
  { label: 'Detect',    icon: Activity,       desc: '340ms' },
  { label: 'Consensus', icon: Radio,           desc: '8/11 votes' },
  { label: 'Alert',     icon: AlertTriangle,   desc: 'dispatched' },
  { label: 'Anchor',    icon: Shield,          desc: 'Merkle proof' },
  { label: 'Report',    icon: FileDown,        desc: 'PDF ready' },
]

function PipelineStrip({ activeIdx }: { activeIdx: number }) {
  return (
    <div className="flex items-center gap-0 w-full">
      {STAGES.map((s, i) => {
        const done   = i < activeIdx
        const active = i === activeIdx
        const Icon   = s.icon
        const color  = done ? '#00ff88' : active ? '#ffaa00' : 'rgba(255,255,255,0.2)'
        return (
          <div key={s.label} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-1 gap-1">
              <div className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500"
                style={{
                  background: done   ? 'rgba(0,255,136,0.15)'
                            : active ? 'rgba(255,170,0,0.15)'
                            :          'rgba(255,255,255,0.04)',
                  border: `1px solid ${color}`,
                  boxShadow: active ? `0 0 12px rgba(255,170,0,0.4)` : done ? `0 0 8px rgba(0,255,136,0.3)` : 'none',
                }}>
                {done
                  ? <CheckCircle className="w-4 h-4 text-[#00ff88]" />
                  : active
                  ? <Icon className="w-4 h-4 text-[#ffaa00]" style={{ animation: 'pulse 1s ease-in-out infinite' }} />
                  : <Icon className="w-4 h-4" style={{ color }} />
                }
              </div>
              <div className="text-center">
                <div className="text-[8px] font-bold uppercase tracking-wider" style={{ color }}>{s.label}</div>
                <div className="text-[7px] text-[rgba(255,255,255,0.25)] uppercase">{s.desc}</div>
              </div>
            </div>
            {i < STAGES.length - 1 && (
              <div className="flex-none px-1">
                <ArrowRight className="w-3 h-3" style={{ color: i < activeIdx ? '#00ff88' : 'rgba(255,255,255,0.12)' }} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main demo page ────────────────────────────────────────────────────────

const HIGHLIGHT_BOTS = ['FX_BOT', 'SANCTIONS_BOT', 'NAV_DETECTOR', 'COMPLIANCE_BOT', 'CARGO_BOT', 'SOVEREIGN_BOT']

// Wirecard simulation — which bots light up red when demo fires
const DEMO_ANOMALIES: Record<string, { score: number; summary: string }> = {
  FX_BOT:        { score: 92, summary: 'EUR/USD manipulation pattern — correlated cross-border flows detected across 7 accounts' },
  SOVEREIGN_BOT: { score: 87, summary: 'Sovereign fund exposure — undisclosed derivatives chain, phantom liability €1.9B' },
  NAV_DETECTOR:  { score: 89, summary: 'NAV drift +4.8% vs T-1 — asset inflation pattern matches Wirecard 2019 signature' },
}

export default function DemoPage() {
  const [ready, setReady]               = useState(false)
  const [running, setRunning]           = useState(false)
  const [pipelineIdx, setPipelineIdx]   = useState(-1)
  const [reportUrl, setReportUrl]       = useState<string | null>(null)
  const [liveAlert, setLiveAlert]       = useState<AlertPayload | null>(null)
  const [demoActive, setDemoActive]     = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  // Mark ready after short init delay — demo is client-side, no backend needed
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1200)
    wakeupBackend().catch(() => {})  // warm up in background, non-blocking
    return () => clearTimeout(t)
  }, [])

  // Live swarm data via WebSocket
  const { data: snap } = useLiveDashboard()

  // Alert events from WebSocket
  const { data: wsAlert } = useWebSocket<AlertPayload | null>('/ws/live', (raw) => {
    if (raw.type === 'alert') return raw.payload as unknown as AlertPayload
    return null
  })

  useEffect(() => {
    if (wsAlert) setLiveAlert(wsAlert)
  }, [wsAlert])

  // Bot rows — show highlighted bots, prefer WS data; overlay demo anomalies when active
  const botMap = Object.fromEntries(
    ((snap?.bots ?? []) as BotRow[]).map(b => [b.bot_type, b])
  )
  const shownBots: BotRow[] = HIGHLIGHT_BOTS.map(bt => {
    const base = botMap[bt] ?? { bot_type: bt, last_score: 0, last_summary: 'Connecting…', is_anomaly: false, healthy: true }
    if (demoActive && DEMO_ANOMALIES[bt]) {
      return { ...base, last_score: DEMO_ANOMALIES[bt].score, last_summary: DEMO_ANOMALIES[bt].summary, is_anomaly: true }
    }
    return base
  })

  const fearIndex = snap?.mode?.fear_index ?? 0
  const fearColor = fearIndex > 70 ? '#ff3366' : fearIndex > 40 ? '#ffaa00' : '#00ff88'
  const mode      = snap?.mode?.mode ?? 'NORMAL'
  const rounds    = snap?.status?.consensus_rounds ?? 0

  // Trigger demo pipeline
  const triggerDemo = useCallback(async () => {
    if (running) return
    setRunning(true)
    setPipelineIdx(0)
    setReportUrl(null)

    timers.current.forEach(clearTimeout)
    timers.current = []

    // Fire AI analysis at detection stage
    setTimeout(() => {
      fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'Wirecard replay triggered. Analyse anomaly: NAV_DETECTOR flagged 23% NAV deviation in Wirecard fund series. What regulatory action and PBFT consensus steps are required?' }),
      }).catch(() => {})
    }, 1400)

    const delays = [0, 1400, 3000, 5000, 7500]
    delays.forEach((d, i) => {
      timers.current.push(setTimeout(() => setPipelineIdx(i), d))
    })

    // At stage 2 (Alert), flip bot cards red
    timers.current.push(setTimeout(() => setDemoActive(true), 3000))

    timers.current.push(setTimeout(() => {
      setReportUrl(`${BASE}/api/report/compliance`)
    }, 8000))

    timers.current.push(setTimeout(() => {
      setRunning(false)
      setDemoActive(false)
    }, 18000))
  }, [running])

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#050508] text-[#00ff88] font-mono select-none overflow-x-hidden">
      <div className="scanline pointer-events-none fixed inset-0 z-50" />

      {/* ── Live pipeline overlay — appears when demo fires ──────────── */}
      {pipelineIdx >= 0 && (
        <div className="fixed top-0 left-0 right-0 z-[60] px-4 pt-3 pb-3 pointer-events-none"
          style={{ background: 'rgba(5,5,8,0.97)', borderBottom: '1px solid rgba(255,51,102,0.5)', backdropFilter: 'blur(12px)', boxShadow: '0 0 60px rgba(255,51,102,0.2)' }}>
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#ff3366]" style={{ animation: 'pulse 0.6s ease-in-out infinite', boxShadow: '0 0 8px #ff3366' }} />
                <span className="text-[#ff3366] font-black text-xs uppercase tracking-[0.2em]">Wirecard Replay — Live Pipeline Execution</span>
              </div>
              <span className="text-[8px] text-[rgba(255,51,102,0.5)] uppercase tracking-widest">Stage {pipelineIdx + 1} / 5</span>
            </div>
            <PipelineStrip activeIdx={pipelineIdx} />
          </div>
        </div>
      )}

      {/* ── Header strip ──────────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 flex items-center justify-between px-6 py-3 border-b border-[rgba(0,255,136,0.12)]"
        style={{ background: 'rgba(5,5,8,0.97)', backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#00ff88]" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
          <span className="font-bold tracking-[0.2em] text-sm uppercase">Genesis Swarm</span>
          <span className="text-[rgba(0,255,136,0.4)] text-[10px] tracking-widest hidden sm:block">
            // Autonomous RegTech · Luxembourg
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-[9px] text-[rgba(0,255,136,0.5)] uppercase tracking-widest">
            <div className="w-1.5 h-1.5 rounded-full bg-[#00ff88]" style={{ animation: 'pulse 1s ease-in-out infinite' }} />
            Live · {rounds} BFT rounds
          </div>
          <a href="/login"
            className="text-[9px] uppercase tracking-wider px-3 py-1.5 border border-[rgba(0,255,136,0.3)] text-[#00ff88] rounded hover:bg-[rgba(0,255,136,0.08)] transition-colors">
            Operator Login →
          </a>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-16">

        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <div className="space-y-6">
          {/* Pre-headline */}
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[rgba(0,255,136,0.3)]" />
            <span className="text-[9px] uppercase tracking-[0.3em] text-[rgba(0,255,136,0.5)]">
              CSSF · UCITS V · DORA · RegTech AI
            </span>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[rgba(0,255,136,0.3)]" />
          </div>

          {/* Main headline */}
          <h1 className="text-3xl sm:text-5xl font-bold leading-tight tracking-tight text-center"
            style={{ textShadow: '0 0 40px rgba(0,255,136,0.3)' }}>
            The AI immune system that catches
            <br />
            <span className="text-[#ff3366]" style={{ textShadow: '0 0 40px rgba(255,51,102,0.4)' }}>
              Wirecard
            </span>{' '}
            before it happens.
          </h1>

          <p className="text-center text-[rgba(255,255,255,0.45)] text-sm max-w-2xl mx-auto leading-relaxed lowercase">
            12 autonomous agents running PBFT consensus, screening real OFAC/EU/UN sanctions lists,
            and pulling live ECB FX data — detecting what traditional compliance misses in{' '}
            <span className="text-[#00ff88] font-bold">340ms</span> vs 48 hours.
          </p>

          {/* Fear index + key stats row */}
          <div className="flex flex-wrap items-center justify-center gap-6 pt-2">
            <div className="flex flex-col items-center">
              <div className="text-4xl font-bold" style={{ color: fearColor, textShadow: `0 0 20px ${fearColor}` }}>
                {Math.round(fearIndex)}
              </div>
              <div className="text-[8px] uppercase tracking-widest text-[rgba(255,255,255,0.3)] mt-0.5">Fear Index</div>
            </div>
            {[
              { label: 'AUM Protected',      value: '€14.78B',   color: '#00ff88' },
              { label: 'Detection Latency',  value: '340ms',     color: '#00ff88' },
              { label: 'Traditional Time',   value: '48 hours',  color: '#ff3366' },
              { label: 'Speedup',            value: '508,000×',  color: '#ffaa00' },
              { label: 'Swarm Mode',         value: mode,        color: mode === 'NORMAL' ? '#00ff88' : '#ff3366' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex flex-col items-center px-4 border-l border-[rgba(255,255,255,0.06)]">
                <div className="font-bold text-lg leading-none" style={{ color }}>{value}</div>
                <div className="text-[8px] uppercase tracking-wider text-[rgba(255,255,255,0.3)] mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* CTA button */}
          <div className="flex justify-center pt-4">
            <button
              onClick={triggerDemo}
              disabled={!ready || running}
              className="group flex items-center gap-3 px-8 py-4 text-sm font-bold uppercase tracking-[0.15em] rounded transition-all duration-300 disabled:opacity-60 disabled:cursor-wait"
              style={{
                background: running ? 'rgba(255,170,0,0.12)' : 'rgba(0,255,136,0.1)',
                border: `2px solid ${running ? '#ffaa00' : '#00ff88'}`,
                color: running ? '#ffaa00' : '#00ff88',
                boxShadow: running
                  ? '0 0 30px rgba(255,170,0,0.3)'
                  : '0 0 20px rgba(0,255,136,0.2)',
              }}>
              {!ready ? (
                <><Clock className="w-5 h-5 animate-spin" /> Connecting…</>
              ) : running ? (
                <><Activity className="w-5 h-5" style={{ animation: 'pulse 0.6s ease-in-out infinite' }} /> Pipeline running…</>
              ) : (
                <><Play className="w-5 h-5 group-hover:scale-110 transition-transform" /> Trigger live detection</>
              )}
            </button>
          </div>

          {!ready && (
            <p className="text-center text-[8px] text-[rgba(255,255,255,0.25)] uppercase tracking-widest animate-pulse">
              Compliance engine initializing — connecting to live data feeds
            </p>
          )}
        </div>

        {/* ── Live alert callout ─────────────────────────────────────── */}
        {liveAlert && (
          <div className="rounded p-4 transition-all duration-500"
            style={{
              background: 'rgba(255,51,102,0.07)',
              border: '1px solid rgba(255,51,102,0.5)',
              boxShadow: '0 0 40px rgba(255,51,102,0.15)',
            }}>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-[#ff3366]" style={{ animation: 'pulse 0.8s ease-in-out infinite' }} />
              <span className="text-[#ff3366] font-bold text-xs uppercase tracking-widest">Live alert — just fired</span>
              <span className="ml-auto text-[8px] text-[rgba(255,255,255,0.3)]">{new Date().toLocaleTimeString()}</span>
            </div>
            <div className="flex items-center gap-4">
              <div>
                <div className="text-[#00ff88] font-bold text-sm">{liveAlert.bot_type.replace(/_/g, ' ')}</div>
                <div className="text-[9px] text-[rgba(255,255,255,0.5)] mt-0.5">{liveAlert.summary}</div>
              </div>
              <div className="ml-auto text-right shrink-0">
                <div className="text-2xl font-bold text-[#ff3366]">{liveAlert.score.toFixed(1)}<span className="text-xs">/100</span></div>
                {AUM[liveAlert.bot_type] && (
                  <div className="text-[9px] text-[rgba(255,51,102,0.7)]">
                    {fmtEur(Math.round(AUM[liveAlert.bot_type] * (liveAlert.score / 100) * 1.5))} at risk
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Pipeline stages ────────────────────────────────────────── */}
        {pipelineIdx >= 0 && (
          <div className="space-y-4">
            <div className="text-[9px] uppercase tracking-[0.25em] text-[rgba(0,255,136,0.5)] text-center">
              Detection pipeline — live execution
            </div>
            <PipelineStrip activeIdx={pipelineIdx} />
            {reportUrl && (
              <div className="flex justify-center mt-4">
                <a href={reportUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-6 py-3 text-sm font-bold uppercase tracking-wider rounded transition-all duration-300"
                  style={{
                    background: 'rgba(0,255,136,0.1)',
                    border: '1px solid rgba(0,255,136,0.5)',
                    color: '#00ff88',
                    boxShadow: '0 0 20px rgba(0,255,136,0.2)',
                  }}>
                  <FileDown className="w-4 h-4" /> Download compliance report PDF
                </a>
              </div>
            )}
          </div>
        )}

        {/* ── Bot grid ──────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-[#00ff88]" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
            <span className="text-[9px] uppercase tracking-[0.2em] text-[rgba(0,255,136,0.5)]">
              Live detection agents — real ECB + OFAC data
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {shownBots.map(bot => <BotMiniCard key={bot.bot_type} bot={bot} />)}
          </div>
        </div>

        {/* ── Proof strip ───────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Consensus Algorithm', value: 'PBFT', sub: 'Byzantine fault tolerant' },
            { label: 'Audit Evidence',      value: 'Merkle',  sub: 'Hash-chain + ZK anchored' },
            { label: 'Compliance Targets',  value: '4 regs',  sub: 'CSSF · UCITS · RAIF · DORA' },
            { label: 'Data Sources',        value: 'Live',    sub: 'ECB · OFAC · EU · UN' },
          ].map(({ label, value, sub }) => (
            <div key={label} className="rounded p-3"
              style={{ background: 'rgba(0,255,136,0.03)', border: '1px solid rgba(0,255,136,0.12)' }}>
              <div className="text-[8px] uppercase tracking-wider text-[rgba(0,255,136,0.4)] mb-1">{label}</div>
              <div className="text-[#00ff88] font-bold text-lg leading-none">{value}</div>
              <div className="text-[7px] text-[rgba(255,255,255,0.3)] mt-1 uppercase tracking-wider">{sub}</div>
            </div>
          ))}
        </div>

        {/* ── Value prop comparison ──────────────────────────────────── */}
        <div className="space-y-4">
          <div className="text-[9px] uppercase tracking-[0.25em] text-[rgba(0,255,136,0.5)] text-center">
            Traditional compliance vs Genesis Swarm
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Traditional */}
            <div className="rounded p-4 space-y-3"
              style={{ background: 'rgba(255,51,102,0.04)', border: '1px solid rgba(255,51,102,0.2)' }}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#ff3366]">Traditional</div>
              {[
                '48–72h to detect anomaly',
                '€18.5M/year compliance cost',
                'Manual review bottleneck',
                'Single-point-of-failure auditor',
                'No real-time market data',
                'Wirecard passed 10 audits',
              ].map(t => (
                <div key={t} className="flex items-start gap-2 text-[9px] text-[rgba(255,255,255,0.45)]">
                  <span className="text-[#ff3366] shrink-0 mt-0.5"></span> {t}
                </div>
              ))}
            </div>
            {/* Genesis */}
            <div className="rounded p-4 space-y-3"
              style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.2)' }}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#00ff88]">Genesis Swarm</div>
              {[
                '340ms detection latency',
                '€240K/year — 77× cheaper',
                'Autonomous 24/7 monitoring',
                '11-agent PBFT consensus',
                'Live ECB · OFAC · AIS feeds',
                'Cryptographic audit evidence',
              ].map(t => (
                <div key={t} className="flex items-start gap-2 text-[9px] text-[rgba(255,255,255,0.55)]">
                  <span className="text-[#00ff88] shrink-0 mt-0.5"></span> {t}
                </div>
              ))}
            </div>
          </div>
        </div>


        {/* ── Regulatory urgency calendar ───────────────────────────── */}
        <div className="space-y-3 pb-6">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.3)]">
            <Calendar className="w-3 h-3" />
            <span>CSSF Regulatory Deadline Tracker</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {[
              { label: 'DORA Art. 28 ICT Register', date: '2026-01-17', desc: 'Annual CSSF submission — ICT third-party vendors', done: true },
              { label: 'AIFMD II Luxembourg Transposition', date: '2026-04-16', desc: 'EU 2024/927 effective — liquidity & leverage rules', done: true },
              { label: 'DORA Art. 26 Major Incident Report', date: '2026-06-30', desc: 'H1 2026 major ICT incident report to CSSF', done: false },
              { label: 'UCITS Liquidity Stress Test', date: '2026-09-30', desc: 'Annual LST submission for all UCITS funds', done: false },
              { label: 'AIFMD II Leverage Report', date: '2026-12-31', desc: 'Enhanced Article 25 leverage disclosure to CSSF', done: false },
              { label: 'DORA Full Compliance', date: '2027-01-17', desc: 'Full DORA ICT risk framework — 2-year phase-in end', done: false },
            ].map(({ label, date, desc, done }) => {
              const msLeft = new Date(date).getTime() - Date.now()
              const daysLeft = Math.ceil(msLeft / 86400000)
              const urgent = !done && daysLeft <= 60
              const warning = !done && daysLeft > 60 && daysLeft <= 180
              const color = done ? 'rgba(0,255,136,0.15)' : urgent ? 'rgba(255,51,102,0.15)' : warning ? 'rgba(255,170,0,0.15)' : 'rgba(255,255,255,0.04)'
              const borderColor = done ? 'rgba(0,255,136,0.25)' : urgent ? 'rgba(255,51,102,0.35)' : warning ? 'rgba(255,170,0,0.35)' : 'rgba(255,255,255,0.08)'
              const textColor = done ? '#00ff88' : urgent ? '#ff3366' : warning ? '#ffaa00' : 'rgba(255,255,255,0.5)'
              return (
                <div key={label} className="p-3 rounded text-left"
                  style={{ background: color, border: `1px solid ${borderColor}` }}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-[9px] uppercase tracking-wider font-bold text-[rgba(255,255,255,0.7)] leading-tight">{label}</span>
                    <span className="text-[9px] font-bold shrink-0 leading-none mt-0.5" style={{ color: textColor }}>
                      {done ? 'Done' : daysLeft <= 0 ? 'OVERDUE' : `${daysLeft}d`}
                    </span>
                  </div>
                  <div className="text-[7px] text-[rgba(255,255,255,0.35)] uppercase tracking-wide mb-1">{desc}</div>
                  <div className="text-[7px] text-[rgba(255,255,255,0.25)]">{date}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Platform feature showcase ─────────────────────────────── */}
        <div className="space-y-6 pb-4">
          <div className="h-px bg-gradient-to-r from-transparent via-[rgba(0,255,136,0.2)] to-transparent" />
          <div className="text-center">
            <div className="text-[8px] uppercase tracking-[0.35em] text-[rgba(0,255,136,0.4)] mb-1">Full platform access</div>
            <div className="text-lg font-black tracking-tight text-[rgba(255,255,255,0.8)]">Everything you need. Nothing you don't.</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {([
              {
                color: '#00ff88',
                glow: 'rgba(0,255,136,0.08)',
                border: 'rgba(0,255,136,0.2)',
                label: 'Compliance Suite',
                sub: 'Full DORA · SFDR · AIFMD II · UCITS coverage for Luxembourg funds',
                links: [
                  { href: '/onboard',   label: 'Fund Onboarding' },
                  { href: '/dora',      label: 'DORA Art. 28 Scanner' },
                  { href: '/sfdr',      label: 'SFDR Generator' },
                  { href: '/aifmd',     label: 'AIFMD II Assessment' },
                  { href: '/doc-check', label: 'Document Checker' },
                  { href: '/audit-sim', label: 'CSSF Audit Simulator' },
                ],
              },
              {
                color: '#00aaff',
                glow: 'rgba(0,170,255,0.08)',
                border: 'rgba(0,170,255,0.2)',
                label: 'Intelligence Reports',
                sub: 'AI-generated board packs, fund grades, and cryptographic audit evidence',
                links: [
                  { href: '/board-report', label: 'AI Board Report' },
                  { href: '/fund-score',   label: 'Fund Health Score' },
                  { href: '/radar',        label: 'Regulatory Radar' },
                  { href: '/certificate',  label: 'Compliance Certificate' },
                  { href: '/onepager',     label: 'PDF One-Pager' },
                  { href: '/chat',         label: 'AI Compliance Chat' },
                ],
              },
              {
                color: '#b478ff',
                glow: 'rgba(180,120,255,0.08)',
                border: 'rgba(180,120,255,0.2)',
                label: 'Operational Tools',
                sub: 'AML screening, multi-fund portfolio view, and smart alert management',
                links: [
                  { href: '/portfolio', label: 'Portfolio Dashboard' },
                  { href: '/screening', label: 'AML / Sanctions Screen' },
                  { href: '/pricing',   label: 'Pricing & Plans' },
                  { href: '/settings',  label: 'Alert Preferences' },
                  { href: '/trial',     label: 'Request Free Trial' },
                  { href: '/',          label: 'Live Dashboard' },
                ],
              },
            ] as { color: string; glow: string; border: string; label: string; sub: string; links: { href: string; label: string }[] }[]).map(col => (
              <div key={col.label} className="rounded-lg p-4 space-y-3"
                style={{ background: col.glow, border: `1px solid ${col.border}` }}>
                <div>
                  <div className="text-[11px] font-black uppercase tracking-wider mb-1" style={{ color: col.color }}>{col.label}</div>
                  <div className="text-[8px] text-[rgba(255,255,255,0.3)] leading-relaxed">{col.sub}</div>
                </div>
                <div className="h-px" style={{ background: col.border }} />
                <div className="space-y-0.5">
                  {col.links.map(l => (
                    <a key={l.href} href={l.href}
                      className="flex items-center justify-between px-2 py-1.5 rounded transition-all hover:bg-[rgba(255,255,255,0.04)] group/link">
                      <span className="text-[9px] text-[rgba(255,255,255,0.55)] group-hover/link:text-[rgba(255,255,255,0.85)] transition-colors uppercase tracking-wider">
                        {l.label}
                      </span>
                      <ArrowRight className="w-2.5 h-2.5 opacity-0 group-hover/link:opacity-100 transition-opacity" style={{ color: col.color }} />
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Primary CTA ───────────────────────────────────────────── */}
        <div className="pb-12 space-y-6">
          <div className="relative rounded-xl overflow-hidden p-8 text-center"
            style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.18)', boxShadow: '0 0 80px rgba(0,255,136,0.06) inset' }}>
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(0,255,136,0.1) 0%, transparent 70%)' }} />
            <div className="relative space-y-4">
              <div className="text-[8px] uppercase tracking-[0.4em] text-[rgba(0,255,136,0.5)]">Ready to eliminate compliance risk?</div>
              <div className="text-2xl font-black tracking-tight text-white">
                14-day free trial. No credit card.<br />
                <span className="text-[#00ff88]">Full platform access from day one.</span>
              </div>
              <div className="text-[rgba(255,255,255,0.35)] text-xs">
                Trusted by Luxembourg AIFMs · CSSF-framework aligned · DORA + UCITS V + AIFMD II ready
              </div>
              <div className="flex items-center justify-center gap-4 pt-2">
                <a href="/trial"
                  className="flex items-center gap-2 px-8 py-3.5 rounded-lg font-black text-sm uppercase tracking-[0.2em] transition-all"
                  style={{ background: 'rgba(0,255,136,0.15)', border: '2px solid #00ff88', color: '#00ff88', boxShadow: '0 0 40px rgba(0,255,136,0.3)' }}>
                  <Zap className="w-4 h-4" /> Start Free Trial
                </a>
                <a href="/onepager"
                  className="flex items-center gap-2 px-6 py-3.5 rounded-lg font-bold text-sm uppercase tracking-[0.15em] transition-all hover:bg-[rgba(255,255,255,0.04)]"
                  style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}>
                  <FileDown className="w-4 h-4" /> Download PDF
                </a>
              </div>
            </div>
          </div>
          <div className="text-[8px] text-center text-[rgba(255,255,255,0.15)] uppercase tracking-widest">
            Genesis Swarm v0.5 · AGPL-3.0 ·{' '}
            <a href="https://github.com/Daman-2310/genesis-swarm"
              className="text-[rgba(0,255,136,0.3)] hover:text-[#00ff88] transition-colors">
              github.com/Daman-2310/genesis-swarm
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
