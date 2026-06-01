'use client'

import { useEffect, useState, useRef } from 'react'
import { Radio, Crosshair } from 'lucide-react'

interface RadarBlip {
  bot: string
  angle: number // 0..360
  radius: number // 0..1
  threat: number // 0..100
}

const BOT_BLIPS: RadarBlip[] = [
  { bot: 'NAV',     angle:  18, radius: 0.78, threat: 34 },
  { bot: 'CARGO',   angle:  62, radius: 0.55, threat: 12 },
  { bot: 'FUEL',    angle:  98, radius: 0.62, threat: 22 },
  { bot: 'SANCT',   angle: 134, radius: 0.84, threat: 8 },
  { bot: 'FX',      angle: 172, radius: 0.68, threat: 67 },
  { bot: 'COMP',    angle: 210, radius: 0.45, threat: 18 },
  { bot: 'SUCC',    angle: 248, radius: 0.72, threat: 28 },
  { bot: 'SOVER',   angle: 286, radius: 0.58, threat: 14 },
  { bot: 'YACHT',   angle: 318, radius: 0.81, threat: 9 },
  { bot: 'ORBIT',   angle: 348, radius: 0.50, threat: 6 },
  { bot: 'SHADOW',  angle:   8, radius: 0.35, threat: 78 },
]

export default function ThreatRadar() {
  const [sweepAngle, setSweepAngle] = useState(0)
  const [blips, setBlips] = useState<RadarBlip[]>(BOT_BLIPS)
  const rafRef = useRef<number>(0)

  // Animate radar sweep
  useEffect(() => {
    let last = performance.now()
    const tick = (t: number) => {
      const dt = t - last
      last = t
      setSweepAngle(a => (a + dt * 0.05) % 360) // 1 full rotation ~7.2s
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // Wiggle blip positions slightly every 3s for life
  useEffect(() => {
    const interval = setInterval(() => {
      setBlips(prev => prev.map(b => ({
        ...b,
        threat: Math.max(0, Math.min(100, b.threat + (Math.random() - 0.5) * 14)),
        radius: Math.max(0.25, Math.min(0.92, b.radius + (Math.random() - 0.5) * 0.04)),
      })))
    }, 2800)
    return () => clearInterval(interval)
  }, [])

  const CENTER = 140
  const MAX_RADIUS = 130

  return (
    <div className="rounded-lg overflow-hidden flex flex-col h-full"
      style={{
        background: 'rgba(5,5,12,0.9)',
        border: '1px solid rgba(0,255,136,0.15)',
        boxShadow: 'inset 0 0 60px rgba(0,255,136,0.04), 0 0 40px rgba(0,255,136,0.06)',
        backdropFilter: 'blur(12px)',
      }}>

      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between shrink-0"
        style={{ borderBottom: '1px solid rgba(0,255,136,0.1)', background: 'rgba(0,255,136,0.025)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-1 h-5 rounded-full" style={{ background: '#00ff88', boxShadow: '0 0 8px #00ff88' }} />
          <div>
            <div className="text-[10px] font-black tracking-[0.15em] uppercase" style={{ color: '#00ff88' }}>Threat Radar</div>
            <div className="text-[8px] tracking-wider mt-0.5 uppercase" style={{ color: 'rgba(74,158,255,0.6)' }}>Bot positional intelligence</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Radio className="w-3 h-3 text-[#00ff88]" style={{ animation: 'pulse 1.2s ease-in-out infinite' }} />
          <span className="text-[8px] font-black uppercase tracking-wider text-[#00ff88]">SWEEPING</span>
        </div>
      </div>

      {/* Radar SVG */}
      <div className="flex-1 flex items-center justify-center p-4 relative">
        <svg viewBox="0 0 280 280" className="w-full h-full max-w-[280px]">
          <defs>
            <radialGradient id="radarBg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(0,255,136,0.08)" />
              <stop offset="100%" stopColor="rgba(0,255,136,0)" />
            </radialGradient>
            <linearGradient id="sweepGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(0,255,136,0)" />
              <stop offset="100%" stopColor="rgba(0,255,136,0.6)" />
            </linearGradient>
            <filter id="blipGlow">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background fill */}
          <circle cx={CENTER} cy={CENTER} r={MAX_RADIUS} fill="url(#radarBg)" />

          {/* Concentric rings */}
          {[0.25, 0.5, 0.75, 1.0].map(r => (
            <circle key={r}
              cx={CENTER} cy={CENTER} r={MAX_RADIUS * r}
              fill="none"
              stroke="rgba(0,255,136,0.12)"
              strokeWidth="1"
              strokeDasharray={r === 1 ? '0' : '2 3'}
            />
          ))}

          {/* Cross-hairs */}
          <line x1={CENTER - MAX_RADIUS} y1={CENTER} x2={CENTER + MAX_RADIUS} y2={CENTER}
            stroke="rgba(0,255,136,0.08)" strokeWidth="1" />
          <line x1={CENTER} y1={CENTER - MAX_RADIUS} x2={CENTER} y2={CENTER + MAX_RADIUS}
            stroke="rgba(0,255,136,0.08)" strokeWidth="1" />

          {/* Sweep cone */}
          <g transform={`rotate(${sweepAngle} ${CENTER} ${CENTER})`}>
            <path
              d={`M ${CENTER} ${CENTER} L ${CENTER + MAX_RADIUS} ${CENTER} A ${MAX_RADIUS} ${MAX_RADIUS} 0 0 0 ${CENTER + MAX_RADIUS * Math.cos(-0.6)} ${CENTER + MAX_RADIUS * Math.sin(-0.6)} Z`}
              fill="url(#sweepGrad)"
              opacity="0.5"
            />
            <line x1={CENTER} y1={CENTER} x2={CENTER + MAX_RADIUS} y2={CENTER}
              stroke="#00ff88" strokeWidth="2" opacity="0.9" filter="url(#blipGlow)" />
          </g>

          {/* Blips */}
          {blips.map(b => {
            const rad = (b.angle * Math.PI) / 180
            const x = CENTER + Math.cos(rad) * MAX_RADIUS * b.radius
            const y = CENTER + Math.sin(rad) * MAX_RADIUS * b.radius
            const color = b.threat >= 60 ? '#ff3366' : b.threat >= 30 ? '#ffaa00' : '#00ff88'
            const isHot = b.threat >= 60
            return (
              <g key={b.bot}>
                {isHot && (
                  <circle cx={x} cy={y} r={9}
                    fill="none"
                    stroke={color}
                    strokeWidth="1"
                    opacity="0.5">
                    <animate attributeName="r" values="4;14;4" dur="1.6s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.8;0;0.8" dur="1.6s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx={x} cy={y} r={isHot ? 4 : 3} fill={color} filter="url(#blipGlow)" />
                <text x={x + 7} y={y + 3}
                  fontSize="8"
                  fontWeight="900"
                  fill={color}
                  style={{ letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: 'monospace' }}>
                  {b.bot}
                </text>
              </g>
            )
          })}

          {/* Center crosshair */}
          <circle cx={CENTER} cy={CENTER} r="3" fill="#00ff88" />
          <circle cx={CENTER} cy={CENTER} r="6" fill="none" stroke="#00ff88" strokeWidth="1" opacity="0.4" />
        </svg>
      </div>

      {/* Legend */}
      <div className="px-4 py-2 flex items-center justify-between shrink-0"
        style={{ borderTop: '1px solid rgba(0,255,136,0.08)', background: 'rgba(0,0,0,0.3)' }}>
        <div className="flex items-center gap-3 text-[8px] uppercase tracking-wider">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#00ff88]" /> <span className="text-[rgba(255,255,255,0.5)]">NOMINAL</span></span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#ffaa00]" /> <span className="text-[rgba(255,255,255,0.5)]">ELEVATED</span></span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#ff3366]" /> <span className="text-[rgba(255,255,255,0.5)]">CRITICAL</span></span>
        </div>
        <div className="flex items-center gap-1 text-[8px] uppercase tracking-wider text-[rgba(0,255,136,0.5)]">
          <Crosshair className="w-2.5 h-2.5" /> <span>11 contacts</span>
        </div>
      </div>
    </div>
  )
}
