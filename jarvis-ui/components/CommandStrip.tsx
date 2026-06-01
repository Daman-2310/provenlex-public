'use client'

import { useMemo } from 'react'
import { Wifi, WifiOff, ShieldCheck, TrendingUp } from 'lucide-react'

interface CommandStripProps {
  fearIndex: number
  totalBots: number
  healthyBots: number
  mode: string
  consensusRounds: number
  wsConnected: boolean
  topScore: number
  precrimeIndex?: number | null
  defeatScore?: number | null
}

function FearArc({ fear }: { fear: number }) {
  // SVG semicircle gauge: 0 = green, 50 = amber, 100 = red
  const r = 36
  const cx = 48
  const cy = 48
  const startAngle = -180
  const endAngle   = 0
  const pct = Math.min(100, Math.max(0, fear)) / 100

  // Arc path helper
  function polarToXY(deg: number, radius: number) {
    const rad = (deg * Math.PI) / 180
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    }
  }

  const startPt  = polarToXY(startAngle, r)
  const endPt    = polarToXY(endAngle, r)
  const activeDeg = startAngle + pct * 180
  const activePt  = polarToXY(activeDeg, r)

  const bgArc = `M ${startPt.x} ${startPt.y} A ${r} ${r} 0 0 1 ${endPt.x} ${endPt.y}`
  const fillArc = `M ${startPt.x} ${startPt.y} A ${r} ${r} 0 ${pct > 0.5 ? 1 : 0} 1 ${activePt.x} ${activePt.y}`

  const color = fear > 70 ? '#ff3366' : fear > 40 ? '#ffaa00' : '#00ff88'

  return (
    <div className="flex flex-col items-center">
      <svg width="96" height="56" viewBox="0 0 96 56" className="overflow-visible">
        {/* Background arc */}
        <path d={bgArc} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" strokeLinecap="round" />
        {/* Filled arc */}
        {pct > 0 && (
          <path d={fillArc} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
        )}
        {/* Tick marks */}
        {[0, 25, 50, 75, 100].map((v) => {
          const deg = -180 + (v / 100) * 180
          const inner = polarToXY(deg, r - 10)
          const outer = polarToXY(deg, r - 5)
          return (
            <line key={v}
              x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
              stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
          )
        })}
        {/* Center value */}
        <text x={cx} y={cy + 2} textAnchor="middle" fontSize="14" fontWeight="bold"
          fontFamily="JetBrains Mono, monospace" fill={color}>
          {Math.round(fear)}
        </text>
      </svg>
      <div className="text-[8px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.3)] -mt-1">
        Fear Index
      </div>
    </div>
  )
}

function Metric({ label, value, sub, color = '#00ff88' }: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 border-l border-[rgba(255,255,255,0.06)] first:border-0">
      <div className="text-[8px] uppercase tracking-[0.18em] text-[rgba(255,255,255,0.3)] mb-0.5">{label}</div>
      <div className="font-bold text-lg leading-none" style={{ color }}>{value}</div>
      {sub && <div className="text-[7px] text-[rgba(255,255,255,0.25)] mt-0.5 uppercase tracking-wider">{sub}</div>}
    </div>
  )
}

export default function CommandStrip({
  fearIndex, totalBots, healthyBots, mode, consensusRounds, wsConnected, topScore,
  precrimeIndex, defeatScore,
}: CommandStripProps) {
  const modeColor = mode === 'LOCKDOWN' ? '#ff3366'
    : mode === 'WAR_ROOM' ? '#ff3366'
    : mode === 'ALERT' ? '#ffaa00'
    : '#00ff88'

  const aumTotal = 14780  // €M — mirrors backend AUM_EXPOSURE total
  const atRisk   = useMemo(() =>
    Math.round(aumTotal * (topScore / 100) * (topScore > 75 ? 1.5 : 1.0)),
    [topScore]
  )

  function fmtEur(m: number) {
    return m >= 1000 ? `€${(m / 1000).toFixed(2)}B` : `€${m}M`
  }

  return (
    <div className="w-full border-b border-[rgba(0,255,136,0.08)]"
      style={{ background: 'linear-gradient(180deg, rgba(0,255,136,0.03) 0%, transparent 100%)' }}>
      <div className="flex items-center justify-between px-4 py-2 gap-2 overflow-x-auto">

        {/* Fear arc gauge */}
        <FearArc fear={fearIndex} />

        {/* Metrics strip */}
        <div className="flex items-center flex-1 min-w-0">
          <Metric
            label="AUM Protected"
            value={fmtEur(aumTotal)}
            sub="across 11 bots"
          />
          <Metric
            label="Capital at Risk"
            value={topScore < 20 ? '—' : fmtEur(atRisk)}
            sub={topScore < 20 ? 'all clear' : `score ${topScore.toFixed(0)}/100`}
            color={topScore >= 75 ? '#ff3366' : topScore >= 40 ? '#ffaa00' : '#00ff88'}
          />
          <Metric
            label="Swarm Mode"
            value={mode}
            color={modeColor}
          />
          <Metric
            label="BFT Rounds"
            value={consensusRounds.toString()}
            sub="last hour"
          />
          <Metric
            label="Bots Online"
            value={`${healthyBots}/${totalBots}`}
            color={healthyBots === totalBots ? '#00ff88' : '#ffaa00'}
          />
          {precrimeIndex != null && (
            <Metric
              label="Pre-Crime"
              value={`${precrimeIndex.toFixed(0)}/100`}
              sub="fraud probability"
              color={precrimeIndex >= 70 ? '#ff3366' : precrimeIndex >= 40 ? '#ffaa00' : '#00ff88'}
            />
          )}
          {defeatScore != null && (
            <Metric
              label="Red-Team"
              value={`${defeatScore.toFixed(0)}/100`}
              sub="adversary defeated"
              color={defeatScore >= 80 ? '#00ff88' : defeatScore >= 60 ? '#ffaa00' : '#ff3366'}
            />
          )}
        </div>

        {/* WS live badge + detection latency */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded"
            style={{
              background: wsConnected ? 'rgba(0,255,136,0.07)' : 'rgba(255,51,102,0.07)',
              border: `1px solid ${wsConnected ? 'rgba(0,255,136,0.3)' : 'rgba(255,51,102,0.3)'}`,
            }}>
            {wsConnected
              ? <Wifi className="w-3 h-3 text-[#00ff88]" />
              : <WifiOff className="w-3 h-3 text-[#ff3366]" />
            }
            <span className="text-[8px] uppercase tracking-widest font-bold"
              style={{ color: wsConnected ? '#00ff88' : '#ff3366' }}>
              {wsConnected ? 'WS LIVE' : 'HTTP POLL'}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[7px] text-[rgba(0,255,136,0.4)] uppercase tracking-wider">
            <TrendingUp className="w-2.5 h-2.5" />
            <span>340ms vs 48h traditional</span>
          </div>
          <div className="flex items-center gap-1 text-[7px] text-[rgba(0,255,136,0.35)] uppercase tracking-wider">
            <ShieldCheck className="w-2.5 h-2.5" />
            <span>CSSF · UCITS · DORA compliant</span>
          </div>
          <div className="flex items-center gap-1 text-[7px] text-[rgba(120,180,255,0.5)] uppercase tracking-wider">
            <ShieldCheck className="w-2.5 h-2.5" />
            <span>SHA3-512 · PQC secured</span>
          </div>
        </div>
      </div>
    </div>
  )
}
