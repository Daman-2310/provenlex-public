'use client'

import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import { usePolling } from '@/lib/usePolling'
import { fetchGatewayDecisions, fetchGatewayStats, type GatewayDecision } from '@/lib/api'

// ── Node + Link types for D3 ──────────────────────────────────────────────────
interface MapNode extends d3.SimulationNodeDatum {
  id:        string
  type:      'entity' | 'firewall' | 'blocked'
  label:     string
  infected:  boolean
  blocked:   boolean
  weight:    number
}

interface MapLink extends d3.SimulationLinkDatum<MapNode> {
  suspicious: boolean
  bucket:     string
  tx_type:    string
  id:         string
}

const W = 520
const H = 340
const FIREWALL_NODES = ['FIREWALL-A', 'FIREWALL-B', 'FIREWALL-C']

function buildGraph(decisions: GatewayDecision[]): { nodes: MapNode[], links: MapLink[] } {
  const nodeMap = new Map<string, MapNode>()

  // Add firewall sentinels
  FIREWALL_NODES.forEach((id, i) => {
    nodeMap.set(id, {
      id, type: 'firewall', label: `FW-${i + 1}`,
      infected: false, blocked: false, weight: 3,
      x: (W / (FIREWALL_NODES.length + 1)) * (i + 1),
      y: H * 0.15,
    })
  })

  const links: MapLink[] = []
  const last30 = decisions.slice(-30)

  for (const d of last30) {
    const fromId = d.masked_tx_id + '-SRC'
    const toId   = d.masked_tx_id + '-DST'

    if (!nodeMap.has(fromId)) {
      nodeMap.set(fromId, {
        id: fromId, type: d.status === 'HARD_BLOCK' ? 'blocked' : 'entity',
        label: (d.masked_tx_id ?? '').slice(0, 8),
        infected: d.status === 'HARD_BLOCK',
        blocked:  d.status === 'HARD_BLOCK',
        weight: 1 + d.weighted_suspicion * 3,
      })
    }
    if (!nodeMap.has(toId)) {
      nodeMap.set(toId, {
        id: toId, type: 'entity',
        label: (d.tx_type ?? '').slice(0, 4),
        infected: d.weighted_suspicion > 0.5,
        blocked: false,
        weight: 1,
      })
    }

    // Edge to random firewall
    const fw = FIREWALL_NODES[Math.abs(d.masked_tx_id.charCodeAt(3)) % FIREWALL_NODES.length]
    links.push({
      source: fromId, target: fw,
      suspicious: d.status === 'HARD_BLOCK',
      bucket: d.amount_bucket, tx_type: d.tx_type,
      id: `${fromId}-fw`,
    })
    links.push({
      source: fw, target: toId,
      suspicious: false, bucket: d.amount_bucket, tx_type: d.tx_type,
      id: `${fw}-${toId}`,
    })
  }

  return { nodes: Array.from(nodeMap.values()), links }
}

export default function ThreatMap() {
  const svgRef = useRef<SVGSVGElement>(null)
  const simRef = useRef<d3.Simulation<MapNode, MapLink> | null>(null)

  const { data: decisions } = usePolling(fetchGatewayDecisions, 3000, [])
  const { data: stats }     = usePolling(fetchGatewayStats, 3000)

  const render = useCallback(() => {
    const svg = d3.select(svgRef.current)
    if (!svg || !decisions?.length) return

    svg.selectAll('*').remove()

    const { nodes, links } = buildGraph(decisions as GatewayDecision[])

    // ── Defs: glow filters ───────────────────────────────────────────────────
    const defs = svg.append('defs')

    const glowGreen = defs.append('filter').attr('id', 'glow-green')
    glowGreen.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur')
    glowGreen.append('feMerge').selectAll('feMergeNode')
      .data(['blur', 'SourceGraphic']).enter().append('feMergeNode')
      .attr('in', d => d)

    const glowRed = defs.append('filter').attr('id', 'glow-red')
    glowRed.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'blur')
    glowRed.append('feMerge').selectAll('feMergeNode')
      .data(['blur', 'SourceGraphic']).enter().append('feMergeNode')
      .attr('in', d => d)

    // Arrow marker
    defs.append('marker')
      .attr('id', 'arrow-clean').attr('viewBox', '0 -5 10 10')
      .attr('refX', 14).attr('refY', 0)
      .attr('markerWidth', 4).attr('markerHeight', 4)
      .attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', 'rgba(0,255,136,0.5)')

    defs.append('marker')
      .attr('id', 'arrow-sus').attr('viewBox', '0 -5 10 10')
      .attr('refX', 14).attr('refY', 0)
      .attr('markerWidth', 4).attr('markerHeight', 4)
      .attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#ff3366')

    // ── Simulation ───────────────────────────────────────────────────────────
    if (simRef.current) simRef.current.stop()

    const sim = d3.forceSimulation<MapNode>(nodes)
      .force('link', d3.forceLink<MapNode, MapLink>(links)
        .id(d => d.id).distance(70).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-120))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide<MapNode>(d => d.weight * 10 + 8))

    simRef.current = sim

    // Fix firewall nodes near top
    nodes.filter(n => n.type === 'firewall').forEach((n, i) => {
      n.fx = (W / (FIREWALL_NODES.length + 1)) * (i + 1)
      n.fy = H * 0.18
    })

    // ── Links ────────────────────────────────────────────────────────────────
    const link = svg.append('g').selectAll<SVGLineElement, MapLink>('line')
      .data(links).enter().append('line')
      .attr('stroke', d => d.suspicious ? '#ff3366' : 'rgba(0,255,136,0.25)')
      .attr('stroke-width', d => d.suspicious ? 1.5 : 0.8)
      .attr('stroke-dasharray', d => d.suspicious ? '4 2' : 'none')
      .attr('marker-end', d => d.suspicious ? 'url(#arrow-sus)' : 'url(#arrow-clean)')
      .style('opacity', 0)
      .transition().duration(600).style('opacity', 1)

    // ── Nodes ────────────────────────────────────────────────────────────────
    const nodeG = svg.append('g').selectAll<SVGGElement, MapNode>('g')
      .data(nodes).enter().append('g')
      .style('cursor', 'default')

    // Infection pulse ring
    nodeG.filter(d => d.infected).append('circle')
      .attr('r', d => d.weight * 9 + 5)
      .attr('fill', 'none')
      .attr('stroke', '#ff3366')
      .attr('stroke-width', 1)
      .attr('opacity', 0.4)
      .each(function() {
        const el = d3.select(this)
        function pulse() {
          el.transition().duration(900)
            .attr('r', (el.datum() as MapNode).weight * 9 + 12)
            .attr('opacity', 0)
            .transition().duration(100)
            .attr('r', (el.datum() as MapNode).weight * 9 + 5)
            .attr('opacity', 0.4)
            .on('end', pulse)
        }
        pulse()
      })

    // Core circle
    nodeG.append('circle')
      .attr('r', d => {
        if (d.type === 'firewall') return 14
        return d.weight * 7 + 5
      })
      .attr('fill', d => {
        if (d.type === 'firewall') return 'rgba(0,170,255,0.15)'
        if (d.blocked) return 'rgba(255,51,102,0.2)'
        if (d.infected) return 'rgba(255,170,0,0.15)'
        return 'rgba(0,255,136,0.08)'
      })
      .attr('stroke', d => {
        if (d.type === 'firewall') return '#00aaff'
        if (d.blocked) return '#ff3366'
        if (d.infected) return '#ffaa00'
        return 'rgba(0,255,136,0.4)'
      })
      .attr('stroke-width', d => d.type === 'firewall' ? 2 : 1)
      .attr('filter', d => {
        if (d.type === 'firewall') return 'url(#glow-green)'
        if (d.blocked) return 'url(#glow-red)'
        return ''
      })

    // Label
    nodeG.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', d => d.type === 'firewall' ? 4 : 3)
      .attr('font-size', d => d.type === 'firewall' ? 8 : 6)
      .attr('font-family', 'monospace')
      .attr('fill', d => {
        if (d.type === 'firewall') return '#00aaff'
        if (d.blocked) return '#ff3366'
        if (d.infected) return '#ffaa00'
        return 'rgba(0,255,136,0.7)'
      })
      .attr('pointer-events', 'none')
      .text(d => d.label)

    // ── Tick ─────────────────────────────────────────────────────────────────
    sim.on('tick', () => {
      link
        .attr('x1', d => (d.source as MapNode).x ?? 0)
        .attr('y1', d => (d.source as MapNode).y ?? 0)
        .attr('x2', d => (d.target as MapNode).x ?? 0)
        .attr('y2', d => (d.target as MapNode).y ?? 0)

      nodeG.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })
  }, [decisions])

  useEffect(() => {
    render()
    return () => { simRef.current?.stop() }
  }, [render])

  const s = stats as { total_evaluated?: number; hard_blocked?: number; block_rate_pct?: number; avg_suspicion_pct?: number } | null

  return (
    <div className="bg-[#0d0d1a] border border-[rgba(0,255,136,0.15)] rounded h-full flex flex-col">
      {/* Header */}
      <div className="px-3 pt-3 pb-1 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse" />
          <span className="text-[10px] uppercase tracking-widest text-[rgba(0,255,136,0.6)]">
            Financial Immune System // Threat Map
          </span>
        </div>
        <div className="flex gap-3 text-[9px] font-mono">
          <span className="text-[rgba(0,255,136,0.5)]">
            EVAL: <span className="text-[#00ff88]">{s?.total_evaluated ?? 0}</span>
          </span>
          <span className="text-[rgba(255,51,102,0.7)]">
            BLOCKED: <span className="text-[#ff3366] font-bold">{s?.hard_blocked ?? 0}</span>
          </span>
          <span className="text-[rgba(255,170,0,0.7)]">
            RATE: <span className="text-[#ffaa00]">{s?.block_rate_pct ?? 0}%</span>
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="px-3 pb-1 flex gap-3 text-[8px] font-mono shrink-0">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full border border-[#00aaff] inline-block" />
          <span className="text-[rgba(0,170,255,0.7)]">Firewall</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full border border-[#ff3366] inline-block" />
          <span className="text-[rgba(255,51,102,0.7)]">Hard-Blocked</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full border border-[#ffaa00] inline-block" />
          <span className="text-[rgba(255,170,0,0.7)]">Suspicious</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full border border-[rgba(0,255,136,0.4)] inline-block" />
          <span className="text-[rgba(0,255,136,0.5)]">Clean</span>
        </span>
      </div>

      {/* SVG canvas */}
      <div className="flex-1 relative min-h-0">
        {(!decisions || (decisions as GatewayDecision[]).length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-[10px] text-[rgba(0,255,136,0.3)] uppercase tracking-widest animate-pulse">
              Waiting for transactions…
            </div>
          </div>
        )}
        <svg
          ref={svgRef}
          width="100%" height="100%"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full"
        />
      </div>

      {/* Suspicion bar */}
      <div className="px-3 pb-2 shrink-0">
        <div className="flex justify-between text-[8px] font-mono text-[rgba(0,255,136,0.4)] mb-0.5">
          <span>AVG SUSPICION</span>
          <span>{s?.avg_suspicion_pct ?? 0}%</span>
        </div>
        <div className="h-0.5 bg-[rgba(0,255,136,0.1)] rounded-full overflow-hidden">
          <div
            className="h-full transition-all duration-1000 rounded-full"
            style={{
              width: `${s?.avg_suspicion_pct ?? 0}%`,
              background: (s?.avg_suspicion_pct ?? 0) > 40 ? '#ff3366' : '#00ff88',
            }}
          />
        </div>
      </div>
    </div>
  )
}
