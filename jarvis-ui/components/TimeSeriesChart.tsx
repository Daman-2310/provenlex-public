'use client'

import { useEffect, useRef, useState } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface TimePoint {
  date: string
  pre_crime_index: number
  delta_from_prior: number
  events: { kind: string; label: string }[]
}

interface Props {
  points: TimePoint[]
  currentScore: number
  trajectory: 'RISING' | 'FALLING' | 'HOLDING'
  high: { date: string; value: number }
  low: { date: string; value: number }
  height?: number
}

const indexColor = (n: number) => n >= 70 ? '#ff3366' : n >= 50 ? '#ff7700' : n >= 30 ? '#ffaa00' : '#00ff88'

export default function TimeSeriesChart({ points, currentScore, trajectory, high, low, height = 220 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [width, setWidth] = useState(720)
  const [animatedLen, setAnimatedLen] = useState(0)

  useEffect(() => {
    const onResize = () => {
      const el = svgRef.current
      if (!el) return
      setWidth(el.clientWidth || el.getBoundingClientRect().width || 720)
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Animate path-draw on mount
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const duration = 1200
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setAnimatedLen(eased)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [points])

  if (points.length === 0) return null

  const padL = 50, padR = 30, padT = 30, padB = 40
  const w = Math.max(320, width)
  const h = height
  const innerW = w - padL - padR
  const innerH = h - padT - padB

  // x-axis: equal spacing
  const xs = points.map((_, i) => padL + (i / (points.length - 1)) * innerW)
  // y-axis: 0-100 inverted
  const yOf = (v: number) => padT + (1 - v / 100) * innerH

  const pathD = points.reduce((acc, p, i) => {
    const x = xs[i], y = yOf(p.pre_crime_index)
    return acc + (i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`)
  }, '')
  const areaD = pathD + ` L ${xs[xs.length - 1]} ${padT + innerH} L ${xs[0]} ${padT + innerH} Z`

  // Animated stroke-dash
  const totalLength = pathD.length * 1.2  // rough heuristic; refined via getTotalLength below

  const c = indexColor(currentScore)
  const TIcon = trajectory === 'RISING' ? TrendingUp : trajectory === 'FALLING' ? TrendingDown : Minus
  const tColor = trajectory === 'RISING' ? '#ff3366' : trajectory === 'FALLING' ? '#00ff88' : '#ffaa00'

  return (
    <div className="relative">
      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[rgba(255,255,255,0.45)] font-black">18-month Pre-Crime trajectory</div>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider">
          <span className="inline-flex items-center gap-1" style={{ color: tColor }}>
            <TIcon className="w-3 h-3" /> {trajectory}
          </span>
          <span className="text-[rgba(255,255,255,0.4)]">·</span>
          <span className="text-[rgba(255,255,255,0.5)]">High <span className="text-[#ff3366] font-black tabular-nums ml-1">{high.value}</span></span>
          <span className="text-[rgba(255,255,255,0.4)]">·</span>
          <span className="text-[rgba(255,255,255,0.5)]">Low <span className="text-[#00ff88] font-black tabular-nums ml-1">{low.value}</span></span>
        </div>
      </div>

      <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="ts-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c} stopOpacity="0.4" />
            <stop offset="100%" stopColor={c} stopOpacity="0" />
          </linearGradient>
          <filter id="ts-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Y-axis grid lines */}
        {[20, 40, 60, 80].map(yVal => (
          <g key={yVal}>
            <line x1={padL} y1={yOf(yVal)} x2={padL + innerW} y2={yOf(yVal)}
              stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
            <text x={padL - 8} y={yOf(yVal) + 3} textAnchor="end"
              className="fill-[rgba(255,255,255,0.35)]" fontSize="9" fontFamily="ui-monospace,monospace">
              {yVal}
            </text>
          </g>
        ))}

        {/* Danger zone band (70-100) */}
        <rect x={padL} y={padT} width={innerW} height={yOf(70) - padT}
          fill="rgba(255,51,102,0.04)" />
        <line x1={padL} y1={yOf(70)} x2={padL + innerW} y2={yOf(70)}
          stroke="rgba(255,51,102,0.3)" strokeDasharray="3 3" />
        <text x={padL + innerW - 4} y={yOf(70) - 4} textAnchor="end"
          className="fill-[rgba(255,51,102,0.6)]" fontSize="9" fontFamily="ui-monospace,monospace" fontWeight="bold">
          70 DANGER
        </text>

        {/* Area fill */}
        <path d={areaD} fill="url(#ts-area)" opacity={animatedLen} />

        {/* Trajectory line — animated draw */}
        <path d={pathD} fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          filter="url(#ts-glow)"
          style={{
            strokeDasharray: totalLength,
            strokeDashoffset: totalLength * (1 - animatedLen),
            transition: 'none',
          }} />

        {/* Event markers */}
        {points.map((p, i) => p.events.length > 0 && (
          <g key={`e-${i}`} opacity={animatedLen > i / points.length ? 1 : 0}>
            <circle cx={xs[i]} cy={yOf(p.pre_crime_index)} r="6"
              fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
            <circle cx={xs[i]} cy={yOf(p.pre_crime_index)} r="2"
              fill="rgba(255,255,255,0.9)" />
          </g>
        ))}

        {/* Data points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={xs[i]} cy={yOf(p.pre_crime_index)} r={hovered === i ? 5 : 2.5}
              fill={indexColor(p.pre_crime_index)}
              stroke="rgba(0,0,0,0.4)" strokeWidth="0.5"
              style={{
                opacity: animatedLen > i / points.length ? 1 : 0,
                filter: hovered === i ? `drop-shadow(0 0 8px ${indexColor(p.pre_crime_index)})` : undefined,
                transition: 'r 120ms ease, filter 120ms ease',
                cursor: 'pointer',
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)} />
          </g>
        ))}

        {/* X-axis labels (sparse) */}
        {points.map((p, i) => (i === 0 || i === points.length - 1 || i === Math.floor(points.length / 2)) && (
          <text key={`x-${i}`} x={xs[i]} y={h - 8} textAnchor="middle"
            className="fill-[rgba(255,255,255,0.4)]" fontSize="9" fontFamily="ui-monospace,monospace">
            {p.date}
          </text>
        ))}
      </svg>

      {/* Tooltip */}
      {hovered !== null && (
        <div className="absolute pointer-events-none rounded-lg p-3 text-[11px] z-10"
          style={{
            left: `${(xs[hovered] / w) * 100}%`,
            top: `${(yOf(points[hovered].pre_crime_index) / h) * 100}%`,
            transform: 'translate(-50%, -120%)',
            background: 'rgba(0,0,0,0.92)',
            border: `1px solid ${indexColor(points[hovered].pre_crime_index)}50`,
            boxShadow: `0 8px 24px rgba(0,0,0,0.5), 0 0 16px ${indexColor(points[hovered].pre_crime_index)}30`,
            minWidth: '180px',
          }}>
          <div className="text-[8px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] font-mono mb-1">{points[hovered].date}</div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-2xl font-black tabular-nums" style={{ color: indexColor(points[hovered].pre_crime_index) }}>
              {points[hovered].pre_crime_index}
            </span>
            <span className="text-[9px] uppercase font-mono text-[rgba(255,255,255,0.4)]">PCI / 100</span>
            {points[hovered].delta_from_prior !== 0 && (
              <span className="text-[9px] font-bold ml-auto" style={{ color: points[hovered].delta_from_prior > 0 ? '#ff3366' : '#00ff88' }}>
                {points[hovered].delta_from_prior > 0 ? '+' : ''}{points[hovered].delta_from_prior}
              </span>
            )}
          </div>
          {points[hovered].events.length > 0 && (
            <div className="pt-2 border-t border-[rgba(255,255,255,0.08)]">
              {points[hovered].events.map((e, i) => (
                <div key={i} className="text-[10px] text-[rgba(255,255,255,0.7)] leading-snug">
                  <span className="text-[8px] uppercase font-black mr-1.5 px-1 py-0.5 rounded"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      color: e.kind === 'regulator' ? '#ff3366' : e.kind === 'press' ? '#4a9eff' : e.kind === 'audit' ? '#ffaa00' : 'rgba(255,255,255,0.6)',
                    }}>
                    {e.kind}
                  </span>
                  {e.label}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
