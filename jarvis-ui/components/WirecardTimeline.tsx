'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Clock, Shield, TrendingDown, Zap } from 'lucide-react'

interface DetectionEvent {
  pattern:                 string
  detected_at:             string
  risk_level:              string
  description:             string
  lead_days_vs_ey:         number
  lead_days_vs_kpmg:       number
  lead_days_vs_collapse:   number
}

interface TimelineEvent {
  date:  string
  event: string
  type:  'press' | 'regulator' | 'audit' | 'company' | 'collapse' | 'legal'
}

interface RiskPoint {
  date:       string
  risk_score: number
  risk_level: string
  tx_id:      string
}

interface SimResult {
  first_flag_date:          string
  lead_days_vs_ey:          number
  lead_days_vs_kpmg:        number
  lead_days_vs_collapse:    number
  total_transactions:       number
  flagged_transactions:     number
  total_amount_eur:         number
  detection_events:         DetectionEvent[]
  timeline:                 TimelineEvent[]
  risk_progression:         RiskPoint[]
  summary:                  string
}

const TYPE_COLOR: Record<string, string> = {
  press:     '#ffaa00',
  regulator: '#00aaff',
  audit:     '#ff8800',
  company:   'rgba(0,255,136,0.5)',
  legal:     '#ff3366',
  collapse:  '#ff3366',
}

const PATTERN_COLOR: Record<string, string> = {
  ROUND_TRIP:   '#ff3366',
  LAYERING:     '#ffaa00',
  STRUCTURING:  '#ff8800',
}

function LeadTimeBadge({ days, label }: { days: number; label: string }) {
  return (
    <div className="text-center">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, delay: 0.3 }}
        className="text-3xl font-bold font-mono text-[#ff3366] tabular-nums"
      >
        {days}
      </motion.div>
      <div className="text-[8px] uppercase tracking-wider text-[rgba(255,51,102,0.6)] mt-0.5">
        days before<br/>{label}
      </div>
    </div>
  )
}

function RiskChart({ points }: { points: RiskPoint[] }) {
  if (!points.length) return null
  const W = 560
  const H = 80
  const maxScore = 100

  const xs = points.map((_, i) => (i / (points.length - 1)) * W)
  const ys = points.map(p => H - (p.risk_score / maxScore) * H)
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  const area = `${path} L${W},${H} L0,${H} Z`

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: 80 }}>
      <defs>
        <linearGradient id="risk-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff3366" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#ff3366" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#risk-grad)" />
      <path d={path} fill="none" stroke="#ff3366" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Genesis Swarm first flag marker */}
      {points.findIndex(p => p.risk_level === 'HIGH') > -1 && (() => {
        const idx = points.findIndex(p => p.risk_level === 'HIGH')
        return (
          <g>
            <line x1={xs[idx]} y1="0" x2={xs[idx]} y2={H} stroke="#00ff88" strokeWidth="1" strokeDasharray="3 2" />
            <circle cx={xs[idx]} cy={ys[idx]} r="3" fill="#00ff88" />
          </g>
        )
      })()}
    </svg>
  )
}

export default function WirecardTimeline() {
  const [data, setData] = useState<SimResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeEvent, setActiveEvent] = useState<DetectionEvent | null>(null)

  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
    fetch(`${API}/api/simulation/wirecard`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="bg-[#0d0d1a] border border-[rgba(255,51,102,0.2)] rounded p-6 flex items-center justify-center" style={{ minHeight: 300 }}>
        <div className="text-center space-y-2">
          <div className="w-6 h-6 border-2 border-[#ff3366] border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-[9px] uppercase tracking-widest text-[rgba(255,51,102,0.6)] animate-pulse">
            Replaying Wirecard transactions…
          </div>
        </div>
      </div>
    )
  }

  if (!data) return null

  const firstDetection = data.detection_events[0]

  return (
    <div className="bg-[#0d0d1a] border border-[rgba(255,51,102,0.25)] rounded overflow-hidden">

      {/* ── Banner ─────────────────────────────────────────────────────────── */}
      <div className="bg-[rgba(255,51,102,0.08)] border-b border-[rgba(255,51,102,0.2)] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#ff3366]" />
            <span className="text-[11px] uppercase tracking-widest font-bold text-[#ff3366]">
              Wirecard Fraud Simulation // Historical Replay
            </span>
          </div>
          <div className="text-[8px] uppercase tracking-wider text-[rgba(255,51,102,0.5)]">
            Source: FT · Bundestag inquiry · KPMG audit · Munich prosecutor
          </div>
        </div>
        <div className="mt-1 text-[9px] text-[rgba(255,51,102,0.6)] font-mono">
          {data.total_transactions} transactions replayed · ~€{(data.total_amount_eur / 1e9).toFixed(1)}B total volume
        </div>
      </div>

      {/* ── Lead time heroes ───────────────────────────────────────────────── */}
      <div className="px-4 py-4 border-b border-[rgba(255,51,102,0.1)]">
        <div className="text-[8px] uppercase tracking-widest text-[rgba(0,255,136,0.5)] mb-3 flex items-center gap-2">
          <Shield className="w-3 h-3" />
          Genesis Swarm first flagged: <span className="text-[#00ff88] font-bold">{data.first_flag_date}</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <LeadTimeBadge days={data.lead_days_vs_kpmg}    label="KPMG couldn't verify €1.9B" />
          <LeadTimeBadge days={data.lead_days_vs_ey}      label="EY refused to sign" />
          <LeadTimeBadge days={data.lead_days_vs_collapse} label="Wirecard collapsed" />
        </div>
      </div>

      {/* ── Risk progression chart ─────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-1 border-b border-[rgba(255,51,102,0.08)]">
        <div className="text-[8px] uppercase tracking-wider text-[rgba(255,51,102,0.4)] mb-1 flex justify-between">
          <span>Risk Score Progression (Jan 2019 → Jun 2020)</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-0.5 bg-[#00ff88] inline-block" /> First Genesis Swarm alert
          </span>
        </div>
        <RiskChart points={data.risk_progression} />
        <div className="flex justify-between text-[7px] font-mono text-[rgba(255,51,102,0.3)] mt-0.5">
          <span>Jan 2019</span>
          <span>Jun 2020 — COLLAPSE</span>
        </div>
      </div>

      {/* ── Detection events ───────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-[rgba(255,51,102,0.08)]">
        <div className="text-[8px] uppercase tracking-wider text-[rgba(255,51,102,0.4)] mb-2">
          Fraud Patterns Detected
        </div>
        <div className="space-y-2">
          {data.detection_events.map((ev, i) => (
            <motion.div
              key={ev.pattern}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              onClick={() => setActiveEvent(activeEvent?.pattern === ev.pattern ? null : ev)}
              className="flex items-start gap-3 p-2 rounded border cursor-pointer transition-colors"
              style={{
                borderColor: activeEvent?.pattern === ev.pattern
                  ? PATTERN_COLOR[ev.pattern]
                  : 'rgba(255,51,102,0.1)',
                background: activeEvent?.pattern === ev.pattern
                  ? `${PATTERN_COLOR[ev.pattern]}10`
                  : 'transparent',
              }}
            >
              <Zap className="w-3 h-3 mt-0.5 shrink-0" style={{ color: PATTERN_COLOR[ev.pattern] }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold font-mono" style={{ color: PATTERN_COLOR[ev.pattern] }}>
                    {ev.pattern.replace('_', '-')}
                  </span>
                  <span className="text-[8px] text-[rgba(255,51,102,0.5)]">{ev.detected_at}</span>
                  <span className="text-[7px] text-[rgba(0,255,136,0.6)] ml-auto">
                    {ev.lead_days_vs_collapse}d before collapse
                  </span>
                </div>
                <AnimatePresence>
                  {activeEvent?.pattern === ev.pattern && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="text-[8px] text-[rgba(255,51,102,0.7)] font-mono mt-1 overflow-hidden"
                    >
                      {ev.description}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Timeline of real events ────────────────────────────────────────── */}
      <div className="px-4 py-3">
        <div className="text-[8px] uppercase tracking-wider text-[rgba(255,51,102,0.4)] mb-2 flex items-center gap-2">
          <Clock className="w-3 h-3" />
          Real-world timeline vs Genesis Swarm
        </div>
        <div className="space-y-1.5 relative">
          {/* Genesis Swarm flag line */}
          <div className="flex items-center gap-2 py-1 px-2 rounded border border-[rgba(0,255,136,0.3)] bg-[rgba(0,255,136,0.05)]">
            <div className="w-1.5 h-1.5 rounded-full bg-[#00ff88] shrink-0 animate-pulse" />
            <span className="text-[8px] font-mono text-[rgba(0,255,136,0.5)] shrink-0 w-20">
              {data.first_flag_date}
            </span>
            <span className="text-[8px] text-[#00ff88] font-bold">
              ▲ GENESIS SWARM FIRST ALERT — {firstDetection?.pattern?.replace('_', '-')} DETECTED
            </span>
          </div>
          {data.timeline.map((ev, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-center gap-2"
            >
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: TYPE_COLOR[ev.type] }}
              />
              <span className="text-[8px] font-mono text-[rgba(255,51,102,0.4)] shrink-0 w-20">
                {ev.date}
              </span>
              <span className="text-[8px] font-mono" style={{ color: TYPE_COLOR[ev.type] }}>
                {ev.event}
              </span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Summary ─────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-[rgba(255,51,102,0.1)] bg-[rgba(255,51,102,0.04)]">
        <div className="flex items-start gap-2">
          <TrendingDown className="w-3 h-3 text-[#ff3366] shrink-0 mt-0.5" />
          <p className="text-[8px] font-mono text-[rgba(255,51,102,0.7)] leading-relaxed">
            {data.summary}
          </p>
        </div>
      </div>
    </div>
  )
}
