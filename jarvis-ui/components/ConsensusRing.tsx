'use client'

import { useEffect, useRef, useCallback } from 'react'

interface TrustScore {
  trust_score: number
  total_votes: number
  correct_votes: number
  byzantine_flags: number
}

interface QuorumHealth {
  trusted_count: number
  total: number
  healthy: boolean
  min_trust: number
  avg_trust: number
}

interface Props {
  trust: {
    scores: Record<string, TrustScore>
    quorum_health: QuorumHealth
  } | null
}

const BOT_LABELS: Record<string, string> = {
  NAV_DETECTOR:   'NAV',
  CARGO_BOT:      'CRGO',
  FUEL_BOT:       'FUEL',
  SANCTIONS_BOT:  'SANC',
  FX_BOT:         'FX',
  COMPLIANCE_BOT: 'CMPL',
  SUCCESSION_BOT: 'SUCC',
  SOVEREIGN_BOT:  'SOVR',
  YACHT_GUARDIAN: 'YCHT',
  ORBITAL_BOT:    'ORBT',
  SHADOW_BOT:     'SHDW',
}

const BOTS = Object.keys(BOT_LABELS)

function trustColor(score: number): string {
  if (score >= 0.8) return '#00ff88'
  if (score >= 0.6) return '#ffaa00'
  return '#ff3366'
}

export default function ConsensusRing({ trust }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = container.getBoundingClientRect()
    const cssW = rect.width || 280
    const cssH = Math.max(cssW * 0.78, 200)

    canvas.width  = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    canvas.style.width  = `${cssW}px`
    canvas.style.height = `${cssH}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const W = cssW
    const H = cssH
    const cx = W / 2
    const cy = H / 2
    const R = Math.min(W, H) * 0.36

    ctx.clearRect(0, 0, W, H)

    const scores = trust?.scores ?? {}
    const health = trust?.quorum_health

    // Connection lines between trusted bots
    BOTS.forEach((botA, i) => {
      const scoreA = scores[botA]?.trust_score ?? 1.0
      if (scoreA < 0.7) return
      BOTS.forEach((botB, j) => {
        if (j <= i) return
        const scoreB = scores[botB]?.trust_score ?? 1.0
        if (scoreB < 0.7) return
        const ax = cx + R * Math.cos((2 * Math.PI * i) / BOTS.length - Math.PI / 2)
        const ay = cy + R * Math.sin((2 * Math.PI * i) / BOTS.length - Math.PI / 2)
        const bx = cx + R * Math.cos((2 * Math.PI * j) / BOTS.length - Math.PI / 2)
        const by = cy + R * Math.sin((2 * Math.PI * j) / BOTS.length - Math.PI / 2)
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx, by)
        ctx.strokeStyle = 'rgba(0,255,136,0.07)'
        ctx.lineWidth = 0.5
        ctx.stroke()
      })
    })

    // Outer ring
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(0,255,136,0.08)'
    ctx.lineWidth = 1
    ctx.stroke()

    // Bot nodes
    BOTS.forEach((bot, i) => {
      const angle = (2 * Math.PI * i) / BOTS.length - Math.PI / 2
      const x = cx + R * Math.cos(angle)
      const y = cy + R * Math.sin(angle)
      const score = scores[bot]?.trust_score ?? 1.0
      const color = trustColor(score)
      const nodeR = 11

      // Glow
      const grad = ctx.createRadialGradient(x, y, nodeR * 0.2, x, y, nodeR * 1.8)
      grad.addColorStop(0, color + '50')
      grad.addColorStop(1, 'transparent')
      ctx.beginPath()
      ctx.arc(x, y, nodeR * 1.8, 0, Math.PI * 2)
      ctx.fillStyle = grad
      ctx.fill()

      // Circle
      ctx.beginPath()
      ctx.arc(x, y, nodeR, 0, Math.PI * 2)
      ctx.fillStyle = '#0d0d1a'
      ctx.fill()
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Abbreviated label
      ctx.fillStyle = color
      ctx.font = 'bold 7px "JetBrains Mono", monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(BOT_LABELS[bot] ?? bot.slice(0, 4), x, y)

      // Trust % outside ring
      const labelR = R + 20
      const lx = cx + labelR * Math.cos(angle)
      const ly = cy + labelR * Math.sin(angle)
      ctx.fillStyle = 'rgba(0,255,136,0.55)'
      ctx.font = '6.5px "JetBrains Mono", monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${Math.round(score * 100)}%`, lx, ly)
    })

    // Center quorum
    const trusted = health?.trusted_count ?? BOTS.length
    const total   = health?.total ?? BOTS.length
    const isHealthy = health?.healthy ?? true
    const centerR = Math.min(W, H) * 0.13

    ctx.beginPath()
    ctx.arc(cx, cy, centerR, 0, Math.PI * 2)
    ctx.fillStyle = '#0a0a14'
    ctx.fill()
    ctx.strokeStyle = isHealthy ? 'rgba(0,255,136,0.45)' : 'rgba(255,51,102,0.45)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.fillStyle = isHealthy ? '#00ff88' : '#ff3366'
    ctx.font = `bold ${Math.round(centerR * 0.55)}px "JetBrains Mono", monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${trusted}/${total}`, cx, cy - centerR * 0.18)

    ctx.fillStyle = 'rgba(0,255,136,0.5)'
    ctx.font = `${Math.round(centerR * 0.3)}px "JetBrains Mono", monospace`
    ctx.fillText('QUORUM', cx, cy + centerR * 0.35)
  }, [trust])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => draw())
    ro.observe(container)
    return () => ro.disconnect()
  }, [draw])

  const health = trust?.quorum_health
  const scores = trust?.scores ?? {}

  return (
    <div className="bg-[#0d0d1a] border border-[rgba(0,255,136,0.2)] rounded p-4 font-mono h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[#00ff88] tracking-widest font-bold text-xs uppercase">
          BFT Consensus Ring
        </span>
        <span className={`text-[10px] uppercase px-2 py-0.5 rounded border ${
          health?.healthy
            ? 'text-[#00ff88] border-[rgba(0,255,136,0.3)]'
            : 'text-[#ff3366] border-[rgba(255,51,102,0.3)] animate-pulse'
        }`}>
          {health?.healthy ? '● HEALTHY' : 'DEGRADED'}
        </span>
      </div>

      <div ref={containerRef} className="w-full">
        <canvas ref={canvasRef} style={{ display: 'block' }} />
      </div>

      <div className="mt-2 flex-1 overflow-y-auto min-h-0">
        <div className="grid grid-cols-3 text-[9px] text-[rgba(0,255,136,0.4)] uppercase border-b border-[rgba(0,255,136,0.1)] pb-1 mb-1">
          <span>Bot</span><span className="text-right">Trust</span><span className="text-right">Votes</span>
        </div>
        {BOTS.map(bot => {
          const s = scores[bot]
          const score = s?.trust_score ?? 1.0
          return (
            <div key={bot} className="grid grid-cols-3 text-[9px] py-0.5">
              <span className="text-[rgba(0,255,136,0.6)]">{BOT_LABELS[bot]}</span>
              <span className="text-right" style={{ color: trustColor(score) }}>
                {Math.round(score * 100)}%
              </span>
              <span className="text-right text-[rgba(0,255,136,0.4)]">
                {s?.correct_votes ?? '—'}/{s?.total_votes ?? '—'}
              </span>
            </div>
          )
        })}
      </div>

      {health && (
        <div className="mt-2 pt-2 border-t border-[rgba(0,255,136,0.1)] text-[9px] text-[rgba(0,255,136,0.5)] flex justify-between">
          <span>AVG TRUST: {Math.round((health.avg_trust ?? 1) * 100)}%</span>
          <span>MIN: {Math.round((health.min_trust ?? 1) * 100)}%</span>
        </div>
      )}
    </div>
  )
}
