'use client'

import { useEffect, useState, useRef } from 'react'
import { AlertTriangle, CheckCircle, Shield, Zap, Activity, GitBranch, Search } from 'lucide-react'

interface EventItem {
  id: string
  ts: number
  severity: 'CRITICAL' | 'WARNING' | 'INFO' | 'SUCCESS'
  bot: string
  message: string
}

// Pool of realistic event templates — sample 1 every ~2.5s
const EVENT_POOL: Array<Omit<EventItem, 'id' | 'ts'>> = [
  { severity: 'CRITICAL', bot: 'NAV_DETECTOR', message: 'Deviation 0.47% flagged in UCITS series #1422 — escalation queued' },
  { severity: 'SUCCESS',  bot: 'PBFT_CONSENSUS', message: 'Round #48,221 reached quorum — 9/11 votes in 312ms' },
  { severity: 'INFO',     bot: 'SANCTIONS_BOT', message: '47,832 transactions screened against OFAC SDN — 0 hits' },
  { severity: 'WARNING',  bot: 'FX_BOT', message: 'EUR/GBP volatility spike detected — VaR threshold at 87%' },
  { severity: 'SUCCESS',  bot: 'MERKLE_ANCHOR', message: 'Audit chain leaf 0x7a4f2c…b8e3 anchored — proof published' },
  { severity: 'INFO',     bot: 'COMPLIANCE_BOT', message: 'DORA ICT vendor register sync complete — 142 vendors validated' },
  { severity: 'CRITICAL', bot: 'SHADOW_BOT', message: 'Adversarial probe attempt blocked — vector: timing-side-channel' },
  { severity: 'SUCCESS',  bot: 'SOVEREIGN_BOT', message: 'Sovereign debt exposure recalculated — 12.4% AUM, AA+ avg' },
  { severity: 'WARNING',  bot: 'CARGO_BOT', message: 'AIS manifest discrepancy: vessel IMO 9512331 outside declared route' },
  { severity: 'INFO',     bot: 'JARVIS_AI', message: 'XAI confidence delta +4.2% on COMPLIANCE_BOT — model retrained' },
  { severity: 'SUCCESS',  bot: 'SFDR_ENGINE', message: 'Art. 8 disclosure pack regenerated for 23 funds — CSSF-aligned' },
  { severity: 'INFO',     bot: 'ORBITAL_BOT', message: 'Satellite AIS cross-ref: 2,341 vessels tracked, 0 dark events' },
  { severity: 'WARNING',  bot: 'FUEL_BOT', message: 'Energy sector exposure +1.8% — approaching SFDR Art.9 threshold' },
  { severity: 'SUCCESS',  bot: 'YACHT_GUARDIAN', message: 'UBO chain verified to 4th degree — Luxembourg PSF nominee clean' },
  { severity: 'CRITICAL', bot: 'NAV_DETECTOR', message: 'Anomaly cluster 89/100 — auto-quarantine triggered on Fund #2841' },
  { severity: 'INFO',     bot: 'AIFMD_PARSER', message: 'Art. 24 leverage report regenerated — gross 1.4×, commitment 1.1×' },
  { severity: 'SUCCESS',  bot: 'CSSF_LINK', message: 'Regulatory calendar synced — 4 deadlines tracked, 0 missed' },
  { severity: 'WARNING',  bot: 'SUCCESSION_BOT', message: 'Key-person risk elevated on Fund #1188 — board mandate review' },
]

function severityStyle(sev: EventItem['severity']) {
  switch (sev) {
    case 'CRITICAL': return { color: '#ff3366', bg: 'rgba(255,51,102,0.06)', border: 'rgba(255,51,102,0.3)', Icon: AlertTriangle, label: 'CRITICAL' }
    case 'WARNING':  return { color: '#ffaa00', bg: 'rgba(255,170,0,0.06)', border: 'rgba(255,170,0,0.3)', Icon: Activity, label: 'WARNING' }
    case 'SUCCESS':  return { color: '#00ff88', bg: 'rgba(0,255,136,0.06)', border: 'rgba(0,255,136,0.3)', Icon: CheckCircle, label: 'PASS' }
    case 'INFO':     return { color: '#4a9eff', bg: 'rgba(74,158,255,0.06)', border: 'rgba(74,158,255,0.25)', Icon: Search, label: 'INFO' }
  }
}

export default function LiveEventTicker() {
  const [events, setEvents] = useState<EventItem[]>([])
  const seedRef = useRef(0)

  useEffect(() => {
    // Seed with 4 initial events
    const initial: EventItem[] = []
    for (let i = 0; i < 4; i++) {
      const tpl = EVENT_POOL[Math.floor(Math.random() * EVENT_POOL.length)]
      initial.push({ ...tpl, id: `init-${i}`, ts: Date.now() - i * 3200 })
    }
    setEvents(initial)

    // Stream a new event every 2.2–3.8s
    const tick = () => {
      const tpl = EVENT_POOL[Math.floor(Math.random() * EVENT_POOL.length)]
      const newEvt: EventItem = { ...tpl, id: `e-${seedRef.current++}-${Date.now()}`, ts: Date.now() }
      setEvents(prev => [newEvt, ...prev].slice(0, 8))
    }
    const interval = setInterval(tick, 2200 + Math.random() * 1600)
    return () => clearInterval(interval)
  }, [])

  const fmtAgo = (ts: number): string => {
    const s = Math.floor((Date.now() - ts) / 1000)
    if (s < 1) return 'now'
    if (s < 60) return `${s}s ago`
    return `${Math.floor(s / 60)}m ago`
  }

  return (
    <div className="rounded-lg overflow-hidden flex flex-col h-full"
      style={{
        background: 'rgba(5,5,12,0.85)',
        border: '1px solid rgba(0,255,136,0.15)',
        boxShadow: 'inset 0 0 40px rgba(0,255,136,0.02), 0 0 30px rgba(0,255,136,0.05)',
        backdropFilter: 'blur(12px)',
      }}>

      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between shrink-0"
        style={{ borderBottom: '1px solid rgba(0,255,136,0.1)', background: 'rgba(0,255,136,0.025)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-1 h-5 rounded-full" style={{ background: '#00ff88', boxShadow: '0 0 8px #00ff88' }} />
          <div>
            <div className="text-[10px] font-black tracking-[0.15em] uppercase" style={{ color: '#00ff88' }}>Live Event Stream</div>
            <div className="text-[8px] tracking-wider mt-0.5 uppercase" style={{ color: 'rgba(74,158,255,0.6)' }}>Swarm telemetry · real-time</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88]" style={{ animation: 'pulse 0.8s ease-in-out infinite', boxShadow: '0 0 6px #00ff88' }} />
          <span className="text-[8px] font-black uppercase tracking-wider text-[#00ff88]">STREAMING</span>
        </div>
      </div>

      {/* Events */}
      <div className="flex-1 overflow-hidden p-2 flex flex-col gap-1.5">
        {events.map((e, i) => {
          const s = severityStyle(e.severity)
          const opacity = 1 - i * 0.09
          return (
            <div key={e.id}
              className="flex items-start gap-2 px-2.5 py-1.5 rounded transition-all"
              style={{
                background: i === 0 ? s.bg : 'rgba(255,255,255,0.015)',
                border: `1px solid ${i === 0 ? s.border : 'rgba(255,255,255,0.04)'}`,
                opacity: Math.max(opacity, 0.25),
                animation: i === 0 ? 'eventSlideIn 0.5s ease-out' : undefined,
              }}>
              <s.Icon className="w-3 h-3 shrink-0 mt-0.5" style={{ color: s.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[8px] font-black uppercase tracking-wider" style={{ color: s.color }}>{s.label}</span>
                  <span className="text-[7px] uppercase tracking-widest text-[rgba(74,158,255,0.7)] font-bold">{e.bot}</span>
                  <span className="text-[7px] uppercase text-[rgba(255,255,255,0.25)] ml-auto">{fmtAgo(e.ts)}</span>
                </div>
                <div className="text-[10px] leading-snug truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {e.message}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <style jsx>{`
        @keyframes eventSlideIn {
          0%   { transform: translateX(20px); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
