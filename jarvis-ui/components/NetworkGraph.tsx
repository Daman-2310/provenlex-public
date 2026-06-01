'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Network, Zap, Layers, AlertTriangle } from 'lucide-react'
import type { CounterpartyEdge, EdgeKind } from '@/lib/counterparties'
import { EDGE_KIND_COLOR, EDGE_KIND_LABEL } from '@/lib/counterparties'

interface SlimEntry {
  prophecy_id: string
  name: string
  jurisdiction: string
  category: string
  pre_crime_index: number
  contagion_risk: number
}

type Layer = 'pci' | 'contagion' | 'category'

const LAYER_LABEL: Record<Layer, string> = {
  pci: 'PRE-CRIME INDEX',
  contagion: 'NETWORK CONTAGION RISK',
  category: 'ENTITY CATEGORY',
}

const CATEGORY_COLOR: Record<string, string> = {
  bank:           '#4a9eff',
  asset_mgmt:     '#9b6dff',
  insurance:      '#00ff88',
  private_equity: '#ff7a00',
  real_estate:    '#ffd86b',
  wealth:         '#ff3388',
  depositary:     '#888899',
}

function colorForPci(p: number): string {
  if (p >= 70) return '#ff3366'
  if (p >= 50) return '#ffaa00'
  if (p >= 30) return '#ffd86b'
  return '#00ff88'
}

function nodeColor(e: SlimEntry, layer: Layer): string {
  switch (layer) {
    case 'pci': return colorForPci(e.pre_crime_index)
    case 'contagion': return colorForPci(e.contagion_risk)
    case 'category': return CATEGORY_COLOR[e.category] ?? '#888899'
  }
}

interface Pos { x: number; y: number; vx: number; vy: number }

function runForceLayout(entries: SlimEntry[], edges: CounterpartyEdge[], width: number, height: number, iterations = 600): Map<string, Pos> {
  const positions = new Map<string, Pos>()
  const cx = width / 2
  const cy = height / 2
  const seed = entries.length * 7
  // Initialize on a circle, slightly randomized
  entries.forEach((e, i) => {
    const angle = (i / entries.length) * Math.PI * 2 + (i % 3) * 0.1
    const r = 200 + ((i * seed) % 80)
    positions.set(e.name, {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      vx: 0, vy: 0,
    })
  })

  const adj = new Map<string, Set<string>>()
  for (const ed of edges) {
    if (!adj.has(ed.source)) adj.set(ed.source, new Set())
    if (!adj.has(ed.target)) adj.set(ed.target, new Set())
    adj.get(ed.source)!.add(ed.target)
    adj.get(ed.target)!.add(ed.source)
  }

  const k = Math.sqrt((width * height) / entries.length) * 0.6
  let temp = width / 12

  for (let it = 0; it < iterations; it++) {
    // Repulsion between all pairs
    const names = Array.from(positions.keys())
    for (let i = 0; i < names.length; i++) {
      const a = positions.get(names[i])!
      a.vx = 0; a.vy = 0
      for (let j = 0; j < names.length; j++) {
        if (i === j) continue
        const b = positions.get(names[j])!
        const dx = a.x - b.x
        const dy = a.y - b.y
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.01
        const force = (k * k) / dist
        a.vx += (dx / dist) * force
        a.vy += (dy / dist) * force
      }
    }

    // Attraction along edges
    for (const ed of edges) {
      const a = positions.get(ed.source)
      const b = positions.get(ed.target)
      if (!a || !b) continue
      const dx = a.x - b.x
      const dy = a.y - b.y
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01
      const force = (dist * dist) / k * ed.weight
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      a.vx -= fx; a.vy -= fy
      b.vx += fx; b.vy += fy
    }

    // Centering pull
    for (const [, p] of positions) {
      p.vx += (cx - p.x) * 0.003
      p.vy += (cy - p.y) * 0.003
    }

    // Move with capped step
    for (const [, p] of positions) {
      const v = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
      const cap = Math.min(v, temp) / Math.max(0.01, v)
      p.x += p.vx * cap
      p.y += p.vy * cap
      p.x = Math.max(40, Math.min(width - 40, p.x))
      p.y = Math.max(40, Math.min(height - 40, p.y))
    }
    temp *= 0.97
  }
  return positions
}

export default function NetworkGraph({
  entries,
  edges,
}: {
  entries: SlimEntry[]
  edges: CounterpartyEdge[]
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const [layer, setLayer] = useState<Layer>('pci')
  const [enabledKinds, setEnabledKinds] = useState<Set<EdgeKind>>(new Set(['depositary', 'prime_broker', 'fund_admin', 'sub_advisor', 'parent', 'reinsurance']))
  const [hoverEntity, setHoverEntity] = useState<SlimEntry | null>(null)
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null)
  const [contagionEntity, setContagionEntity] = useState<SlimEntry | null>(null)

  const entryByName = useMemo(() => {
    const m = new Map<string, SlimEntry>()
    for (const e of entries) m.set(e.name, e)
    return m
  }, [entries])

  const positions = useMemo(() => {
    // Pre-compute layout once based on viewport. Hard-coded 1100x720 viewport
    // re-scaled by canvas dimensions later.
    return runForceLayout(entries, edges, 1100, 720, 600)
  }, [entries, edges])

  // BFS levels from contagion source — for ripple animation
  const ripple = useMemo(() => {
    if (!contagionEntity) return null
    const adj = new Map<string, Array<{ neighbor: string; kind: EdgeKind; weight: number }>>()
    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, [])
      if (!adj.has(e.target)) adj.set(e.target, [])
      adj.get(e.source)!.push({ neighbor: e.target, kind: e.kind, weight: e.weight })
      adj.get(e.target)!.push({ neighbor: e.source, kind: e.kind, weight: e.weight })
    }
    const levels = new Map<string, number>()
    const edgeLevel = new Map<string, number>() // "src|tgt" → level when crossed
    levels.set(contagionEntity.name, 0)
    const queue: Array<{ name: string; level: number }> = [{ name: contagionEntity.name, level: 0 }]
    while (queue.length) {
      const { name, level } = queue.shift()!
      if (level >= 3) continue
      const neighbors = adj.get(name) ?? []
      for (const n of neighbors) {
        if (levels.has(n.neighbor)) continue
        levels.set(n.neighbor, level + 1)
        const k1 = `${name}|${n.neighbor}`
        const k2 = `${n.neighbor}|${name}`
        edgeLevel.set(k1, level + 1)
        edgeLevel.set(k2, level + 1)
        queue.push({ name: n.neighbor, level: level + 1 })
      }
    }
    return { levels, edgeLevel, born: performance.now() / 1000 }
  }, [contagionEntity, edges])

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted || !canvasRef.current || !containerRef.current) return
    const canvas = canvasRef.current
    const container = containerRef.current
    let raf = 0

    function resize() {
      const w = container.clientWidth
      const h = container.clientHeight
      canvas.width = w * (window.devicePixelRatio || 1)
      canvas.height = h * (window.devicePixelRatio || 1)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
    }
    resize()
    window.addEventListener('resize', resize)

    const ctx = canvas.getContext('2d')!

    function transform(px: number, py: number, w: number, h: number): { x: number; y: number } {
      // Scale from 1100x720 source space to canvas px space
      return { x: (px / 1100) * w, y: (py / 720) * h }
    }

    function draw() {
      const dpr = window.devicePixelRatio || 1
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      // Edges
      const now = performance.now() / 1000
      for (const e of edges) {
        if (!enabledKinds.has(e.kind)) continue
        const a = positions.get(e.source)
        const b = positions.get(e.target)
        if (!a || !b) continue
        const ap = transform(a.x, a.y, w, h)
        const bp = transform(b.x, b.y, w, h)

        let color = EDGE_KIND_COLOR[e.kind]
        let alpha = 0.18 + e.weight * 0.2
        let lineWidth = 0.5 + e.weight * 0.8

        if (ripple) {
          const lvl = ripple.edgeLevel.get(`${e.source}|${e.target}`)
          if (lvl !== undefined) {
            const age = (now - ripple.born) - (lvl * 0.35)
            if (age >= 0 && age < 1.4) {
              const wave = Math.sin((age / 1.4) * Math.PI)
              alpha = 0.18 + wave * 0.85
              lineWidth = 0.5 + e.weight * 0.8 + wave * 2.5
              color = '#ff3366'
            }
          }
        }

        ctx.beginPath()
        ctx.moveTo(ap.x, ap.y)
        ctx.lineTo(bp.x, bp.y)
        ctx.strokeStyle = color
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
        ctx.lineWidth = lineWidth
        ctx.stroke()
      }

      // Nodes
      ctx.globalAlpha = 1
      for (const en of entries) {
        const p = positions.get(en.name)
        if (!p) continue
        const pt = transform(p.x, p.y, w, h)
        let color = nodeColor(en, layer)
        let radius = 3 + (en.pre_crime_index / 100) * 6

        if (ripple) {
          const lvl = ripple.levels.get(en.name)
          if (lvl !== undefined) {
            const age = (now - ripple.born) - (lvl * 0.35)
            if (age >= 0 && age < 1.6) {
              const wave = Math.sin((age / 1.6) * Math.PI)
              radius += wave * 6
              color = lvl === 0 ? '#ff3366' : '#ff7a00'
              // halo ring
              ctx.beginPath()
              ctx.arc(pt.x, pt.y, radius + 6 + wave * 8, 0, Math.PI * 2)
              ctx.strokeStyle = color
              ctx.globalAlpha = wave * 0.7
              ctx.lineWidth = 1.5
              ctx.stroke()
            }
          }
        }

        ctx.globalAlpha = 1
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        ctx.lineWidth = 0.8
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'
        ctx.stroke()

        // Label for high-PCI or contagion-source
        if (en.pre_crime_index >= 50 || (ripple && ripple.levels.get(en.name) === 0)) {
          ctx.font = 'bold 9px ui-monospace, monospace'
          ctx.fillStyle = 'rgba(255,255,255,0.85)'
          ctx.fillText(en.name.split(' ').slice(0, 3).join(' '), pt.x + radius + 4, pt.y + 3)
        }
      }

      raf = requestAnimationFrame(draw)
    }
    draw()

    function pick(ev: MouseEvent): { entry: SlimEntry; screen: { x: number; y: number } } | null {
      const rect = canvas.getBoundingClientRect()
      const x = ev.clientX - rect.left
      const y = ev.clientY - rect.top
      const w = rect.width
      const h = rect.height
      let best: { entry: SlimEntry; screen: { x: number; y: number }; d: number } | null = null
      for (const en of entries) {
        const p = positions.get(en.name)
        if (!p) continue
        const pt = transform(p.x, p.y, w, h)
        const dx = pt.x - x
        const dy = pt.y - y
        const d = Math.sqrt(dx * dx + dy * dy)
        const radius = 3 + (en.pre_crime_index / 100) * 6
        if (d < radius + 6 && (!best || d < best.d)) {
          best = { entry: en, screen: { x: pt.x, y: pt.y }, d }
        }
      }
      return best
    }

    function onMove(ev: MouseEvent) {
      const r = pick(ev)
      setHoverEntity(r?.entry ?? null)
      setHoverPos(r ? r.screen : null)
      canvas.style.cursor = r ? 'pointer' : 'default'
    }
    function onClick(ev: MouseEvent) {
      const r = pick(ev)
      if (r) setContagionEntity(r.entry)
    }
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('click', onClick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('click', onClick)
    }
  }, [mounted, positions, entries, edges, layer, enabledKinds, ripple])

  function toggleKind(k: EdgeKind) {
    setEnabledKinds(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })
  }

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col h-full relative"
      style={{
        background: 'radial-gradient(circle at center, rgba(15,15,35,0.7) 0%, rgba(5,5,12,0.95) 80%)',
        border: '1px solid rgba(155,109,255,0.2)',
        boxShadow: 'inset 0 0 80px rgba(155,109,255,0.04), 0 0 50px rgba(155,109,255,0.08)',
      }}>

      {/* HEADER */}
      <div className="px-5 py-3 flex items-center justify-between shrink-0 z-10 flex-wrap gap-3"
        style={{ borderBottom: '1px solid rgba(155,109,255,0.1)', background: 'rgba(0,0,0,0.4)' }}>
        <div className="flex items-center gap-3">
          <div className="w-1 h-5 rounded-full" style={{ background: '#9b6dff', boxShadow: '0 0 8px #9b6dff' }} />
          <div>
            <div className="text-[10px] font-black tracking-[0.18em] uppercase text-[#9b6dff]">Genesis Network</div>
            <div className="text-[8px] tracking-wider mt-0.5 uppercase text-[rgba(255,255,255,0.4)]">
              {entries.length} entities · {edges.length} counterparty edges · {LAYER_LABEL[layer]}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded p-1"
          style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(155,109,255,0.2)' }}>
          <Layers className="w-3 h-3 text-[#9b6dff] mx-1" />
          {(['pci', 'contagion', 'category'] as Layer[]).map(L => (
            <button key={L} onClick={() => setLayer(L)}
              className="text-[9px] uppercase tracking-wider font-bold px-2 py-1 rounded transition-all"
              style={{
                background: layer === L ? 'rgba(155,109,255,0.25)' : 'transparent',
                color: layer === L ? '#fff' : 'rgba(255,255,255,0.5)',
              }}>
              {L === 'pci' ? 'PCI' : L === 'contagion' ? 'Contagion' : 'Category'}
            </button>
          ))}
        </div>
      </div>

      {/* CANVAS */}
      <div ref={containerRef} className="flex-1 relative" style={{ minHeight: 560 }}>
        <canvas ref={canvasRef} />
        {!mounted && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-[#9b6dff] animate-spin" />
          </div>
        )}

        {hoverEntity && hoverPos && (
          <div className="absolute rounded-lg px-3 py-2 pointer-events-none max-w-[280px]"
            style={{
              left: hoverPos.x + 12,
              top: hoverPos.y + 12,
              background: 'rgba(0,0,0,0.88)',
              border: '1px solid rgba(155,109,255,0.4)',
              backdropFilter: 'blur(10px)',
            }}>
            <div className="text-[10px] uppercase tracking-wider text-[#9b6dff] font-bold mb-0.5">
              {hoverEntity.jurisdiction} · {hoverEntity.category.replace('_', ' ')}
            </div>
            <div className="text-[12px] font-bold text-white leading-tight mb-1">{hoverEntity.name}</div>
            <div className="text-[10px] text-[rgba(255,255,255,0.65)] space-y-0.5">
              <div>PCI: <span className="font-mono font-bold" style={{ color: colorForPci(hoverEntity.pre_crime_index) }}>{hoverEntity.pre_crime_index}</span></div>
              <div>Network contagion risk: <span className="font-mono font-bold" style={{ color: colorForPci(hoverEntity.contagion_risk) }}>{hoverEntity.contagion_risk}</span></div>
              <div className="text-[#9b6dff] font-bold pt-1">click → fire contagion</div>
            </div>
          </div>
        )}

        {contagionEntity && (
          <div className="absolute top-3 right-3 rounded-lg px-3 py-2 pointer-events-none max-w-[300px]"
            style={{ background: 'rgba(0,0,0,0.88)', border: '1px solid rgba(255,51,102,0.5)', backdropFilter: 'blur(10px)', boxShadow: '0 0 20px rgba(255,51,102,0.2)' }}>
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-[#ff3366] font-bold mb-1">
              <Zap className="w-3 h-3" /> CONTAGION
            </div>
            <div className="text-[12px] font-bold text-white leading-tight">{contagionEntity.name}</div>
            <div className="text-[10px] text-[rgba(255,255,255,0.6)] mt-1">
              Risk propagating 3 hops along counterparty edges
            </div>
            <button onClick={() => setContagionEntity(null)}
              className="pointer-events-auto mt-2 text-[9px] uppercase tracking-wider px-2 py-1 rounded font-bold"
              style={{ background: 'rgba(255,51,102,0.12)', border: '1px solid rgba(255,51,102,0.4)', color: '#ff3366' }}>
              reset
            </button>
          </div>
        )}
      </div>

      {/* EDGE LEGEND */}
      <div className="px-5 py-3 shrink-0 flex items-center flex-wrap gap-3"
        style={{ borderTop: '1px solid rgba(155,109,255,0.1)', background: 'rgba(0,0,0,0.4)' }}>
        <Network className="w-3 h-3 text-[#9b6dff]" />
        <span className="text-[9px] uppercase tracking-wider font-bold text-[#9b6dff]">Edge types</span>
        {(Object.keys(EDGE_KIND_LABEL) as EdgeKind[]).map(k => {
          const enabled = enabledKinds.has(k)
          return (
            <button key={k} onClick={() => toggleKind(k)}
              className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider font-bold px-2 py-1 rounded transition-all"
              style={{
                background: enabled ? `${EDGE_KIND_COLOR[k]}18` : 'transparent',
                border: `1px solid ${enabled ? EDGE_KIND_COLOR[k] + '60' : 'rgba(255,255,255,0.08)'}`,
                color: enabled ? EDGE_KIND_COLOR[k] : 'rgba(255,255,255,0.3)',
              }}>
              <span className="w-2 h-0.5 rounded" style={{ background: EDGE_KIND_COLOR[k] }} />
              {EDGE_KIND_LABEL[k]}
            </button>
          )
        })}
        <div className="ml-auto flex items-center gap-1 text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">
          <AlertTriangle className="w-3 h-3" /> click any node → contagion
        </div>
      </div>
    </div>
  )
}
