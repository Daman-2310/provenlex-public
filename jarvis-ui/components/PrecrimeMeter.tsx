'use client'

import { PrecrimePulseData } from '@/lib/useWebSocket'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Clock } from 'lucide-react'

const PATTERN_INFO: Record<string, { label: string; color: string; desc: string }> = {
  wirecard: { label: 'WIRECARD', color: '#ff3366', desc: 'Phantom asset inflation + FX obfuscation' },
  archegos: { label: 'ARCHEGOS', color: '#ff3366', desc: 'Concentrated leverage concealment' },
  ftx:      { label: 'FTX',      color: '#ff3366', desc: 'Exchange fund commingling' },
}

export default function PrecrimeMeter({ data }: { data: PrecrimePulseData }) {
  const color = data.index >= 70 ? '#ff3366' : data.index >= 40 ? '#ffaa00' : '#00ff88'
  const bgColor = data.index >= 70 ? 'rgba(255,51,102,0.05)'
                 : data.index >= 40 ? 'rgba(255,170,0,0.04)'
                 : 'rgba(0,255,136,0.03)'
  const borderColor = data.index >= 70 ? 'rgba(255,51,102,0.3)'
                    : data.index >= 40 ? 'rgba(255,170,0,0.3)'
                    : 'rgba(0,255,136,0.25)'

  const TrajectoryIcon = data.trajectory === 'RISING' ? TrendingUp
    : data.trajectory === 'FALLING' ? TrendingDown : Minus
  const trajectoryColor = data.trajectory === 'RISING' ? '#ff3366'
    : data.trajectory === 'FALLING' ? '#00ff88' : '#ffaa00'

  const pattern = data.matched_pattern ? PATTERN_INFO[data.matched_pattern] : null
  const indexPct = Math.min(100, Math.max(0, data.index))

  return (
    <div className="rounded-lg flex flex-col"
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        boxShadow: `0 0 20px ${color}10`,
      }}>

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 shrink-0"
        style={{ borderBottom: `1px solid ${color}15` }}>
        <div className="w-1 h-5 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color }} />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-black tracking-[0.15em] uppercase truncate" style={{ color }}>
            Pre-Crime Index
          </div>
          <div className="text-[8px] tracking-wider uppercase truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Behavioural fraud forecast
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 px-2 py-1 rounded-full"
          style={{ background: `${trajectoryColor}10`, border: `1px solid ${trajectoryColor}50` }}>
          <TrajectoryIcon className="w-3 h-3" style={{ color: trajectoryColor }} />
          <span className="text-[8px] font-black uppercase tracking-wider" style={{ color: trajectoryColor }}>
            {data.trajectory}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4">

        {/* Big index + pattern */}
        <div className="flex items-end gap-5">
          <div className="shrink-0">
            <div className="text-[8px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] mb-1">Fraud probability</div>
            <div className="flex items-baseline gap-1">
              <div className="font-black tabular-nums leading-none"
                style={{
                  fontSize: 'clamp(2.25rem, 4vw, 3rem)',
                  color,
                  textShadow: `0 0 20px ${color}88`,
                }}>
                {data.index.toFixed(0)}
              </div>
              <div className="text-[10px] font-mono text-[rgba(255,255,255,0.35)]">/100</div>
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-2">
            {/* Horizontal probability bar with danger zone marker */}
            <div>
              <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                {/* Danger zone tint (>=70) */}
                <div className="absolute top-0 bottom-0 right-0" style={{ width: '30%', background: 'rgba(255,51,102,0.1)' }} />
                {/* Fill */}
                <div className="absolute top-0 left-0 bottom-0 rounded-full transition-all duration-700"
                  style={{
                    width: `${indexPct}%`,
                    background: `linear-gradient(90deg, ${color}aa, ${color})`,
                    boxShadow: `0 0 6px ${color}`,
                  }} />
                {/* Danger threshold marker at 70% */}
                <div className="absolute top-0 bottom-0 w-px"
                  style={{ left: '70%', background: 'rgba(255,51,102,0.5)' }} />
              </div>
              <div className="flex justify-between text-[7px] uppercase tracking-wider text-[rgba(255,255,255,0.25)] mt-0.5">
                <span>0</span><span>50</span><span className="text-[#ff3366]">70 danger</span><span>100</span>
              </div>
            </div>

            {/* Pattern match */}
            {pattern ? (
              <div className="rounded px-2 py-1.5"
                style={{ background: 'rgba(255,51,102,0.06)', border: '1px solid rgba(255,51,102,0.3)' }}>
                <div className="text-[7px] text-[rgba(255,51,102,0.7)] uppercase tracking-wider font-bold">Pattern match</div>
                <div className="text-[11px] font-black text-[#ff3366]">{pattern.label}</div>
                <div className="text-[8px] text-[rgba(255,255,255,0.5)] mt-0.5">{pattern.desc}</div>
              </div>
            ) : (
              <div className="rounded px-2 py-1.5 flex items-center justify-between"
                style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.15)' }}>
                <span className="text-[8px] text-[rgba(255,255,255,0.45)] uppercase tracking-wider">Pattern match</span>
                <span className="text-[9px] font-black text-[#00ff88]">NONE DETECTED</span>
              </div>
            )}
          </div>
        </div>

        {/* Timeline + dominant */}
        <div className="grid grid-cols-2 gap-2">
          {data.months_to_incident !== null && data.months_to_incident !== undefined ? (
            <div className="rounded p-2.5"
              style={{ background: 'rgba(255,170,0,0.05)', border: '1px solid rgba(255,170,0,0.25)' }}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Clock className="w-2.5 h-2.5 text-[#ffaa00]" />
                <span className="text-[7px] text-[#ffaa00] uppercase tracking-wider font-bold">Timeline</span>
              </div>
              <div className="text-[12px] font-black text-[#ffaa00]">~{data.months_to_incident} months</div>
            </div>
          ) : (
            <div className="rounded p-2.5"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="text-[7px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] mb-0.5 font-bold">Timeline</div>
              <div className="text-[10px] text-[rgba(255,255,255,0.55)]">—</div>
            </div>
          )}
          <div className="rounded p-2.5"
            style={{ background: 'rgba(74,158,255,0.04)', border: '1px solid rgba(74,158,255,0.18)' }}>
            <div className="text-[7px] uppercase tracking-wider text-[#4a9eff] font-bold mb-0.5">Dominant signal</div>
            <div className="text-[10px] font-black truncate" style={{ color }}>
              {data.dominant_signal?.replace(/_/g, ' ') ?? '—'}
            </div>
          </div>
        </div>

        {/* Contributing bots */}
        {data.contributing_bots?.length > 0 && (
          <div>
            <div className="text-[8px] text-[rgba(255,255,255,0.4)] uppercase tracking-wider font-bold mb-2">
              Signal contributions
            </div>
            <div className="space-y-1.5">
              {data.contributing_bots.slice(0, 4).map(([bot, contrib]) => {
                const pct = Math.min(100, contrib)
                const barColor = pct >= 30 ? '#ff3366' : pct >= 15 ? '#ffaa00' : '#00ff88'
                return (
                  <div key={bot} className="flex items-center gap-2">
                    <span className="text-[8px] uppercase tracking-wider text-[rgba(255,255,255,0.55)] w-24 truncate shrink-0">
                      {bot.replace(/_/g, ' ')}
                    </span>
                    <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${pct}%`,
                          background: `linear-gradient(90deg, ${barColor}aa, ${barColor})`,
                          boxShadow: `0 0 4px ${barColor}`,
                        }} />
                    </div>
                    <span className="text-[9px] font-black tabular-nums w-7 text-right shrink-0" style={{ color: barColor }}>
                      {pct.toFixed(0)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {data.index < 25 && (
          <div className="text-[8px] text-[rgba(0,255,136,0.5)] uppercase tracking-[0.18em] text-center font-bold pt-2"
            style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            All signals nominal — no pre-crime indicators
          </div>
        )}
      </div>
    </div>
  )
}
