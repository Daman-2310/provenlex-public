'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useWebSocket } from '@/lib/useWebSocket'
import { AlertTriangle, Zap, Shield } from 'lucide-react'

const AUM: Record<string, number> = {
  NAV_DETECTOR: 2100, FX_BOT: 3400, SOVEREIGN_BOT: 4500,
  SANCTIONS_BOT: 1200, CARGO_BOT: 890, COMPLIANCE_BOT: 780,
  SUCCESSION_BOT: 650, FUEL_BOT: 520, YACHT_GUARDIAN: 310,
  ORBITAL_BOT: 280, SHADOW_BOT: 150,
}

function fmtEur(m: number) {
  return m >= 1000 ? `€${(m / 1000).toFixed(1)}B` : `€${Math.round(m)}M`
}

type Stage = 'detecting' | 'consensus' | 'alert' | 'anchored'

interface AlertPayload {
  bot_type: string
  score: number
  summary: string
}

const STAGES: { key: Stage; label: string }[] = [
  { key: 'detecting', label: '① DETECT' },
  { key: 'consensus', label: '② QUORUM' },
  { key: 'alert',     label: '③ ALERT' },
  { key: 'anchored',  label: '④ ANCHOR' },
]

export default function AlertToast() {
  const [visible, setVisible]   = useState(false)
  const [alert, setAlert]       = useState<AlertPayload | null>(null)
  const [stage, setStage]       = useState<Stage>('detecting')
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const dismiss = useCallback(() => {
    setVisible(false)
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])

  // Listen to raw WebSocket frames — pick up 'alert' type messages
  const { data: rawAlert } = useWebSocket<AlertPayload | null>('/ws/live', (raw) => {
    if (raw.type === 'alert') return raw.payload as unknown as AlertPayload
    return null
  })

  useEffect(() => {
    if (!rawAlert) return
    timers.current.forEach(clearTimeout)
    timers.current = []

    setAlert(rawAlert)
    setStage('detecting')
    setVisible(true)

    timers.current.push(setTimeout(() => setStage('consensus'), 1400))
    timers.current.push(setTimeout(() => setStage('alert'),     3000))
    timers.current.push(setTimeout(() => setStage('anchored'),  5000))
    timers.current.push(setTimeout(() => setVisible(false),    13000))
  }, [rawAlert])

  if (!visible || !alert) return null

  const aum    = AUM[alert.bot_type] ?? 0
  const atRisk = Math.round(aum * (alert.score / 100) * 1.5)
  const stageIdx = STAGES.findIndex(s => s.key === stage)

  return (
    <div className="fixed top-14 right-4 z-[200] w-[400px] alert-slide-in pointer-events-auto">
      <div className="bg-[#0b0b16] border border-[rgba(255,51,102,0.7)]"
        style={{ boxShadow: '0 0 48px rgba(255,51,102,0.25), 0 0 8px rgba(255,51,102,0.1)' }}>

        {/* Top gradient stripe */}
        <div className="h-[3px]" style={{
          background: 'linear-gradient(90deg, #ff3366 0%, #ffaa00 60%, #ff3366 100%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 2s linear infinite',
        }} />

        <div className="p-4">
          {/* Header row */}
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-[#ff3366] shrink-0" style={{ animation: 'pulse 0.8s ease-in-out infinite' }} />
            <span className="text-[#ff3366] font-bold text-[11px] tracking-[0.2em] uppercase flex-1">
              Anomaly Detected
            </span>
            <span className="text-[8px] text-[rgba(255,255,255,0.25)] tracking-widest">
              {new Date().toLocaleTimeString('en-GB', { hour12: false })} UTC
            </span>
            <button onClick={dismiss} className="text-[rgba(255,255,255,0.25)] hover:text-white ml-1 leading-none">
              
            </button>
          </div>

          {/* Bot name + score */}
          <div className="flex items-end justify-between mb-2">
            <div>
              <div className="text-[9px] text-[rgba(0,255,136,0.5)] uppercase tracking-widest mb-0.5">
                Detection Agent
              </div>
              <div className="text-[#00ff88] font-bold text-sm tracking-wider">
                {alert.bot_type.replace(/_/g, ' ')}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] text-[rgba(255,51,102,0.6)] uppercase tracking-widest mb-0.5">
                Risk Score
              </div>
              <div className="text-3xl font-bold text-[#ff3366] leading-none">
                {alert.score.toFixed(1)}
                <span className="text-xs text-[rgba(255,51,102,0.5)]">/100</span>
              </div>
            </div>
          </div>

          {/* Score bar */}
          <div className="h-1.5 bg-[rgba(255,255,255,0.06)] rounded-full mb-3 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${alert.score}%`,
                background: 'linear-gradient(90deg, #ffaa00, #ff3366)',
              }}
            />
          </div>

          {/* Summary text */}
          <div className="text-[9px] text-[rgba(255,255,255,0.55)] mb-3 leading-[1.6] border-l-2 border-[rgba(255,51,102,0.3)] pl-2">
            {alert.summary}
          </div>

          {/* Capital at risk pill */}
          {atRisk > 0 && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded"
              style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.25)' }}>
              <Zap className="w-3.5 h-3.5 text-[#ff3366] shrink-0" />
              <span className="text-[9px] text-[rgba(255,255,255,0.45)] flex-1 uppercase tracking-wider">
                Capital at risk
              </span>
              <span className="text-[#ff3366] font-bold text-base">
                {fmtEur(atRisk)}
              </span>
            </div>
          )}

          {/* Pipeline stages */}
          <div className="flex gap-1 mb-1">
            {STAGES.map((s, i) => {
              const done    = i < stageIdx
              const active  = i === stageIdx
              const pending = i > stageIdx
              return (
                <div key={s.key} className="flex-1 text-center py-1 rounded text-[7px] font-bold uppercase tracking-wider transition-all duration-500"
                  style={{
                    background: done   ? 'rgba(0,255,136,0.12)'
                              : active ? 'rgba(255,170,0,0.12)'
                              :          'rgba(255,255,255,0.03)',
                    border: `1px solid ${done ? 'rgba(0,255,136,0.5)' : active ? 'rgba(255,170,0,0.5)' : 'rgba(255,255,255,0.08)'}`,
                    color: done ? '#00ff88' : active ? '#ffaa00' : 'rgba(255,255,255,0.25)',
                  }}>
                  {active ? <span style={{ animation: 'pulse 1s ease-in-out infinite' }}>●</span> : done ? '' : '○'} {s.label}
                </div>
              )
            })}
          </div>

          {/* BFT quorum note */}
          <div className="flex items-center gap-1 mt-2">
            <Shield className="w-2.5 h-2.5 text-[rgba(0,255,136,0.4)]" />
            <span className="text-[7px] text-[rgba(0,255,136,0.35)] uppercase tracking-widest">
              PBFT quorum required before any action — 8/11 votes
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
