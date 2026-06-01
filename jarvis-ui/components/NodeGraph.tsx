'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import type { BotStatus, Alert } from '@/lib/api'

interface NodeGraphProps {
  bots: BotStatus[]
  alerts: Alert[]
}

interface NodeDatum {
  id: string
  label: string
  botType: string
  healthy: boolean
  isAnomaly: boolean
  score: number
  isCommander: boolean
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
  vx?: number
  vy?: number
}

interface LinkDatum {
  source: string | NodeDatum
  target: string | NodeDatum
}

const EXTRA_LINKS: Array<[string, string]> = [
  ['SANCTIONS_BOT', 'SUCCESSION_BOT'],
  ['CARGO_BOT', 'ORBITAL_BOT'],
  ['FX_BOT', 'SOVEREIGN_BOT'],
  ['FUEL_BOT', 'COMPLIANCE_BOT'],
]

function getNodeColor(node: NodeDatum): string {
  if (node.isCommander) return '#ffd700'
  if (node.isAnomaly) return '#ff3366'
  if (!node.healthy) return '#ffaa00'
  return '#00ff88'
}

function abbreviate(botType: string): string {
  const clean = botType.replace(/_BOT$/, '')
  const parts = clean.split('_')
  if (parts.length === 1) return clean.slice(0, 3)
  return parts.map((p) => p[0]).join('')
}

export default function NodeGraph({ bots, alerts }: NodeGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{
    x: number
    y: number
    node: NodeDatum
  } | null>(null)
  const simulationRef = useRef<ReturnType<typeof import('d3').forceSimulation> | null>(null)

  const anomalySet = new Set(alerts.filter((a) => !a.acknowledged).map((a) => a.bot_type))

  const buildGraph = useCallback(async () => {
    if (!svgRef.current || !containerRef.current || bots.length === 0) return

    const d3 = await import('d3')
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const W = containerRef.current.clientWidth || 480
    const H = containerRef.current.clientHeight || 320

    svg.attr('width', W).attr('height', H)

    // Build nodes
    const commander = bots.find((b) => b.bot_type === 'COMMANDER_BOT')
    const nodes: NodeDatum[] = bots.map((b) => ({
      id: b.bot_type,
      label: abbreviate(b.bot_type),
      botType: b.bot_type,
      healthy: b.healthy,
      isAnomaly: b.is_anomaly || anomalySet.has(b.bot_type),
      score: b.last_score,
      isCommander: b.bot_type === 'COMMANDER_BOT',
      x: b.bot_type === 'COMMANDER_BOT' ? W / 2 : undefined,
      y: b.bot_type === 'COMMANDER_BOT' ? H / 2 : undefined,
    }))

    // Build links: hub-and-spoke from COMMANDER
    const commanderType = commander?.bot_type ?? 'COMMANDER_BOT'
    const links: LinkDatum[] = bots
      .filter((b) => b.bot_type !== commanderType)
      .map((b) => ({ source: commanderType, target: b.bot_type }))

    // Extra lateral links
    EXTRA_LINKS.forEach(([src, tgt]) => {
      if (nodes.find((n) => n.id === src) && nodes.find((n) => n.id === tgt)) {
        links.push({ source: src, target: tgt })
      }
    })

    // Defs: glow filters
    const defs = svg.append('defs')

    const filterGreen = defs.append('filter').attr('id', 'glow-green').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%')
    filterGreen.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur')
    const fmGreen = filterGreen.append('feMerge')
    fmGreen.append('feMergeNode').attr('in', 'coloredBlur')
    fmGreen.append('feMergeNode').attr('in', 'SourceGraphic')

    const filterRed = defs.append('filter').attr('id', 'glow-red').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%')
    filterRed.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'coloredBlur')
    const fmRed = filterRed.append('feMerge')
    fmRed.append('feMergeNode').attr('in', 'coloredBlur')
    fmRed.append('feMergeNode').attr('in', 'SourceGraphic')

    const filterGold = defs.append('filter').attr('id', 'glow-gold').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%')
    filterGold.append('feGaussianBlur').attr('stdDeviation', '5').attr('result', 'coloredBlur')
    const fmGold = filterGold.append('feMerge')
    fmGold.append('feMergeNode').attr('in', 'coloredBlur')
    fmGold.append('feMergeNode').attr('in', 'SourceGraphic')

    // Link group
    const linkGroup = svg.append('g').attr('class', 'links')
    const linkSelection = linkGroup
      .selectAll<SVGLineElement, LinkDatum>('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4 3')
      .style('animation', 'dash-flow 2s linear infinite')

    // Node group
    const nodeGroup = svg.append('g').attr('class', 'nodes')
    const nodeSelection = nodeGroup
      .selectAll<SVGGElement, NodeDatum>('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')

    // Outer pulse ring for anomalies
    nodeSelection
      .filter((d) => d.isAnomaly)
      .append('circle')
      .attr('r', (d) => (d.isCommander ? 22 : 18))
      .attr('fill', 'none')
      .attr('stroke', '#ff3366')
      .attr('stroke-width', 1)
      .attr('opacity', 0.4)
      .style('animation', 'node-pulse 1.5s ease-in-out infinite')

    // Main circle
    nodeSelection
      .append('circle')
      .attr('r', (d) => (d.isCommander ? 18 : d.healthy ? 14 : 9))
      .attr('fill', (d) => {
        const c = getNodeColor(d)
        return `${c}22`
      })
      .attr('stroke', (d) => getNodeColor(d))
      .attr('stroke-width', (d) => (d.isCommander ? 2 : 1.5))
      .attr('filter', (d) =>
        d.isCommander ? 'url(#glow-gold)' : d.isAnomaly ? 'url(#glow-red)' : 'url(#glow-green)'
      )

    // Label
    nodeSelection
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', (d) => (d.isCommander ? '9px' : '8px'))
      .attr('font-weight', 700)
      .attr('fill', (d) => getNodeColor(d))
      .attr('pointer-events', 'none')
      .text((d) => d.label)

    // Bot type label below
    nodeSelection
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => (d.isCommander ? '32px' : '26px'))
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '7px')
      .attr('letter-spacing', '0.04em')
      .attr('fill', 'rgba(0,255,136,0.4)')
      .attr('pointer-events', 'none')
      .text((d) => d.label)

    // Tooltip events
    nodeSelection
      .on('mouseenter', function (event: MouseEvent, d: NodeDatum) {
        const svgRect = svgRef.current!.getBoundingClientRect()
        setTooltip({
          x: event.clientX - svgRect.left,
          y: event.clientY - svgRect.top,
          node: d,
        })
        d3.select(this).select('circle').attr('stroke-width', 3)
      })
      .on('mouseleave', function (_: MouseEvent, d: NodeDatum) {
        setTooltip(null)
        d3.select(this).select('circle').attr('stroke-width', d.isCommander ? 2 : 1.5)
      })

    // Fix commander to center
    const commanderNode = nodes.find((n) => n.isCommander)
    if (commanderNode) {
      commanderNode.fx = W / 2
      commanderNode.fy = H / 2
    }

    // Force simulation
    if (simulationRef.current) {
      simulationRef.current.stop()
    }

    const sim = d3
      .forceSimulation<NodeDatum>(nodes)
      .force(
        'link',
        d3
          .forceLink<NodeDatum, LinkDatum>(links)
          .id((d) => d.id)
          .distance(80)
      )
      .force('charge', d3.forceManyBody<NodeDatum>().strength(-200))
      .force('center', d3.forceCenter<NodeDatum>(W / 2, H / 2))
      .force('collision', d3.forceCollide<NodeDatum>(20))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    simulationRef.current = sim as any

    sim.on('tick', () => {
      linkSelection
        .attr('x1', (d) => {
          const s = d.source as NodeDatum
          return s.x ?? 0
        })
        .attr('y1', (d) => {
          const s = d.source as NodeDatum
          return s.y ?? 0
        })
        .attr('x2', (d) => {
          const t = d.target as NodeDatum
          return t.x ?? 0
        })
        .attr('y2', (d) => {
          const t = d.target as NodeDatum
          return t.y ?? 0
        })
        .attr('stroke', (d) => {
          const t = d.target as NodeDatum
          return t.isAnomaly
            ? 'rgba(255,51,102,0.6)'
            : 'rgba(0,255,136,0.2)'
        })

      nodeSelection.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    return () => sim.stop()
  }, [bots, alerts]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cleanup: (() => void) | undefined
    buildGraph().then((fn) => {
      cleanup = fn
    })
    return () => {
      if (cleanup) cleanup()
      if (simulationRef.current) simulationRef.current.stop()
    }
  }, [buildGraph])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full terminal-border bg-genesis-surface"
      style={{ minHeight: '280px' }}
    >
      {/* Header */}
      <div
        className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-1"
        style={{ borderBottom: '1px solid rgba(0,255,136,0.1)', background: 'rgba(13,13,26,0.9)' }}
      >
        <span style={{ fontSize: '9px', fontWeight: 700, color: '#00ff88', letterSpacing: '0.1em' }}>
          SWARM TOPOLOGY
        </span>
        <span style={{ fontSize: '8px', color: 'rgba(0,255,136,0.4)' }}>
          {bots.length} NODES ACTIVE
        </span>
      </div>

      <svg ref={svgRef} className="w-full h-full" style={{ paddingTop: '24px' }} />

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x + 12,
            top: tooltip.y - 10,
            background: '#0d0d1a',
            border: '1px solid rgba(0,255,136,0.4)',
            padding: '6px 10px',
            fontSize: '9px',
            fontFamily: 'JetBrains Mono, monospace',
            color: '#00ff88',
            textTransform: 'uppercase',
            pointerEvents: 'none',
            zIndex: 20,
            letterSpacing: '0.04em',
            minWidth: '140px',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '2px' }}>{tooltip.node.botType}</div>
          <div style={{ color: 'rgba(0,255,136,0.6)' }}>
            SCORE: <span style={{ color: tooltip.node.isAnomaly ? '#ff3366' : '#00ff88' }}>
              {tooltip.node.score.toFixed(3)}
            </span>
          </div>
          <div style={{ color: 'rgba(0,255,136,0.6)' }}>
            STATUS:{' '}
            <span style={{ color: tooltip.node.isAnomaly ? '#ff3366' : tooltip.node.healthy ? '#00ff88' : '#ffaa00' }}>
              {tooltip.node.isAnomaly ? 'ANOMALY' : tooltip.node.healthy ? 'HEALTHY' : 'DEGRADED'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
