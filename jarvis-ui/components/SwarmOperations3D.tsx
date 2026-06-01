'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { BotStatus } from '@/lib/api'

/**
 * SWARM OPERATIONS — live 3D consensus constellation, bound to real telemetry.
 *
 * Unlike the decorative hero swarm, every node here IS a bot: its colour tracks
 * the live anomaly score (green → amber → red), it flares and grows when it
 * trips an anomaly, and it drifts out of the mesh and goes dark when quarantined
 * (chaos mode). Consensus waves sweep the healthy mesh each round. The scene is
 * built once; live props are read each frame through a ref so 3s telemetry
 * updates never tear down the GL context.
 */

// Canonical 11-bot roster + short labels for the floating tags.
const ROSTER: { type: string; short: string }[] = [
  { type: 'NAV_DETECTOR', short: 'NAV' },
  { type: 'CARGO_BOT', short: 'CARGO' },
  { type: 'FUEL_BOT', short: 'FUEL' },
  { type: 'SANCTIONS_BOT', short: 'SANCT' },
  { type: 'FX_BOT', short: 'FX' },
  { type: 'COMPLIANCE_BOT', short: 'COMPLY' },
  { type: 'SUCCESSION_BOT', short: 'SUCCN' },
  { type: 'SOVEREIGN_BOT', short: 'SOVRGN' },
  { type: 'YACHT_GUARDIAN', short: 'YACHT' },
  { type: 'ORBITAL_BOT', short: 'ORBITAL' },
  { type: 'SHADOW_BOT', short: 'SHADOW' },
]

const C_HEALTHY = new THREE.Color('#00ff88')
const C_WARN = new THREE.Color('#ffaa00')
const C_ALERT = new THREE.Color('#ff3366')
const C_DARK = new THREE.Color('#33414d')
const C_VOTE = new THREE.Color('#00d8ff')

function makeGlowTexture(): THREE.Texture {
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.25, 'rgba(255,255,255,0.85)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeLabelTexture(text: string): THREE.Texture {
  const w = 256, h = 64
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d')!
  g.font = 'bold 34px ui-monospace, monospace'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = 'rgba(255,255,255,0.92)'
  g.fillText(text, w / 2, h / 2)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// Which node chaos mode isolates: the highest-scoring bot (matching the
// backend's quarantine target), or a deterministic fallback when telemetry is
// flat/cold so the visual ALWAYS reacts to the toggle.
function pickQuarantineIdx(bots: BotStatus[], chaos: boolean): number {
  if (!chaos) return -1
  let bestIdx = -1, bestScore = -1
  ROSTER.forEach((r, i) => {
    const b = bots.find(x => x.bot_type === r.type)
    const s = b?.last_score ?? -1
    if (s > bestScore) { bestScore = s; bestIdx = i }
  })
  if (bestIdx < 0 || bestScore <= 0) return 3 // SANCTIONS_BOT — deterministic fallback
  return bestIdx
}

function fibonacciSphere(n: number, radius: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  const phi = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const theta = phi * i
    pts.push(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).multiplyScalar(radius))
  }
  return pts
}

interface Props {
  bots: BotStatus[]
  chaosMode?: boolean
  wsConnected?: boolean
}

export default function SwarmOperations3D({ bots, chaosMode = false, wsConnected = false }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const dataRef = useRef<Props>({ bots, chaosMode, wsConnected })

  // Keep the render loop reading the freshest telemetry without rebuilding GL.
  useEffect(() => { dataRef.current = { bots, chaosMode, wsConnected } }, [bots, chaosMode, wsConnected])

  // Derived live counters for the HTML overlay — same per-node categorisation
  // the 3D scene uses, so the legend always matches what's on screen.
  const targetIdx = pickQuarantineIdx(bots, chaosMode)
  const cats = ROSTER.map((r, i) => {
    if (chaosMode && i === targetIdx) return 'quarantined'
    const b = bots.find(x => x.bot_type === r.type)
    if (b?.healthy === false) return 'quarantined'
    const s = b?.last_score ?? 0
    if (b?.is_anomaly || s >= 75) return 'anomaly'
    if (s >= 40) return 'warn'
    return 'healthy'
  })
  const anomalies = cats.filter(c => c === 'anomaly').length
  const quarantined = cats.filter(c => c === 'quarantined').length
  const warning = cats.filter(c => c === 'warn').length
  const healthy = cats.filter(c => c === 'healthy').length

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
    } catch { return }

    let width = mount.clientWidth || 800
    let height = mount.clientHeight || 480
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.setSize(width, height)
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
    camera.position.set(0, 0, 12)

    const swarm = new THREE.Group()
    scene.add(swarm)

    const glowTex = makeGlowTexture()
    const N = ROSTER.length
    const home = fibonacciSphere(N, 4.4)

    interface NodeViz {
      core: THREE.Sprite; halo: THREE.Sprite; label: THREE.Sprite
      cur: THREE.Color; target: THREE.Color
      pos: THREE.Vector3; homePos: THREE.Vector3
    }
    const nodes: NodeViz[] = home.map((p, i) => {
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: C_HEALTHY.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
      core.scale.setScalar(0.9); core.position.copy(p)
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: C_HEALTHY.clone(), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }))
      halo.scale.setScalar(2.4); halo.position.copy(p)
      const labelTex = makeLabelTexture(ROSTER[i].short)
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, transparent: true, opacity: 0.0, depthWrite: false }))
      label.scale.set(1.9, 0.48, 1); label.position.copy(p).multiplyScalar(1.18)
      swarm.add(halo, core, label)
      return { core, halo, label, cur: C_HEALTHY.clone(), target: C_HEALTHY.clone(), pos: p.clone(), homePos: p.clone() }
    })

    // Mesh edges between nearest neighbours.
    const edges: [number, number][] = []
    const seen = new Set<string>()
    home.forEach((p, i) => {
      home.map((q, j) => ({ j, d: p.distanceTo(q) }))
        .filter(o => o.j !== i).sort((a, b) => a.d - b.d).slice(0, 3)
        .forEach(({ j }) => { const k = i < j ? `${i}-${j}` : `${j}-${i}`; if (!seen.has(k)) { seen.add(k); edges.push([i, j]) } })
    })
    const linePos = new Float32Array(edges.length * 6)
    const lineGeo = new THREE.BufferGeometry()
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3))
    const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color('#1f3a5a'), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
    const lineSeg = new THREE.LineSegments(lineGeo, lineMat)
    swarm.add(lineSeg)

    interface Pulse { from: number; to: number; t: number; speed: number; mesh: THREE.Sprite }
    const pulses: Pulse[] = []
    function spawnPulse(from: number, to: number) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: C_VOTE.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
      sprite.scale.setScalar(0.5); swarm.add(sprite)
      pulses.push({ from, to, t: 0, speed: 0.7 + Math.random() * 0.5, mesh: sprite })
    }

    const clock = new THREE.Clock()
    let consensusClock = 0
    const pointer = new THREE.Vector2(0, 0)
    function onMove(e: MouseEvent) {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = ((e.clientY - rect.top) / rect.height) * 2 - 1
    }
    renderer.domElement.addEventListener('mousemove', onMove)

    function resize() {
      width = mount!.clientWidth || width
      height = mount!.clientHeight || height
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(mount)

    function colorFor(b: BotStatus | undefined): { c: THREE.Color; quarantined: boolean; anomaly: boolean } {
      if (!b) return { c: C_HEALTHY.clone().multiplyScalar(0.6), quarantined: false, anomaly: false }
      if (b.healthy === false) return { c: C_DARK.clone(), quarantined: true, anomaly: false }
      const s = b.last_score ?? 0
      if (b.is_anomaly || s >= 75) return { c: C_ALERT.clone(), quarantined: false, anomaly: true }
      if (s >= 40) return { c: C_WARN.clone(), quarantined: false, anomaly: false }
      return { c: C_HEALTHY.clone(), quarantined: false, anomaly: false }
    }

    let raf = 0
    const tmp = new THREE.Vector3()

    function frame() {
      const dt = Math.min(0.05, clock.getDelta())
      const tNow = clock.elapsedTime
      const { bots: liveBots, chaosMode: liveChaos } = dataRef.current
      const byType = new Map(liveBots.map(b => [b.bot_type, b]))
      const targetIdx = pickQuarantineIdx(liveBots, !!liveChaos)

      // Periodic consensus wave across healthy nodes only.
      consensusClock += dt
      if (consensusClock > 3.4 && !reduceMotion) {
        consensusClock = 0
        const healthyIdx = nodes.map((_, i) => i).filter(i => {
          if (i === targetIdx) return false
          const b = byType.get(ROSTER[i].type); return b ? b.healthy !== false : true
        })
        if (healthyIdx.length > 1) {
          const proposer = healthyIdx[Math.floor(Math.random() * healthyIdx.length)]
          for (const j of healthyIdx) if (j !== proposer) spawnPulse(proposer, j)
        }
      }

      // Update node visuals from live telemetry.
      nodes.forEach((n, i) => {
        const b = byType.get(ROSTER[i].type)
        let { c, quarantined: q, anomaly } = colorFor(b)
        if (i === targetIdx) { c = C_DARK.clone(); q = true; anomaly = false } // chaos isolation
        n.target.copy(c)
        n.cur.lerp(n.target, Math.min(1, dt * 5))
        ;(n.core.material as THREE.SpriteMaterial).color.copy(n.cur)
        ;(n.halo.material as THREE.SpriteMaterial).color.copy(n.cur)
        ;(n.label.material as THREE.SpriteMaterial).color.copy(n.cur)

        // Quarantined bots drift outward and dim; anomalies flare and pulse.
        const targetPos = q ? tmp.copy(n.homePos).multiplyScalar(1.5) : n.homePos
        n.pos.lerp(targetPos, Math.min(1, dt * 2.5))
        n.core.position.copy(n.pos); n.halo.position.copy(n.pos)
        n.label.position.copy(n.pos).multiplyScalar(1.18)

        const flare = anomaly ? 1 + Math.sin(tNow * 9 + i) * 0.28 : 1
        const breathe = 0.9 + Math.sin(tNow * 1.5 + i) * 0.06
        n.core.scale.setScalar((q ? 0.55 : 0.95) * breathe * flare)
        const haloMat = n.halo.material as THREE.SpriteMaterial
        haloMat.opacity = q ? 0.08 : anomaly ? 0.42 : 0.22
        n.halo.scale.setScalar(anomaly ? 3.2 : q ? 1.8 : 2.4)
        ;(n.label.material as THREE.SpriteMaterial).opacity = q ? 0.25 : 0.7
      })

      // Refresh edges: drop links to quarantined nodes (mesh visibly fractures).
      edges.forEach(([a, b], k) => {
        const ba = byType.get(ROSTER[a].type), bb = byType.get(ROSTER[b].type)
        const cut = (ba?.healthy === false) || (bb?.healthy === false) || a === targetIdx || b === targetIdx
        nodes[a].pos.toArray(linePos, k * 6)
        ;(cut ? nodes[a].pos : nodes[b].pos).toArray(linePos, k * 6 + 3)
      })
      lineGeo.attributes.position.needsUpdate = true

      // Advance pulses.
      for (let i = pulses.length - 1; i >= 0; i--) {
        const pu = pulses[i]
        pu.t += pu.speed * dt
        if (pu.t >= 1) { swarm.remove(pu.mesh); (pu.mesh.material as THREE.SpriteMaterial).dispose(); pulses.splice(i, 1); continue }
        tmp.copy(nodes[pu.from].pos).lerp(nodes[pu.to].pos, pu.t)
        pu.mesh.position.copy(tmp)
        pu.mesh.scale.setScalar(0.35 + Math.sin(pu.t * Math.PI) * 0.3)
      }

      if (!reduceMotion) {
        swarm.rotation.y += dt * 0.14
        swarm.rotation.x = Math.sin(tNow * 0.18) * 0.16
        camera.position.x += (pointer.x * 2.2 - camera.position.x) * 0.05
        camera.position.y += (-pointer.y * 1.6 - camera.position.y) * 0.05
        camera.lookAt(0, 0, 0)
      }

      renderer.render(scene, camera)
      raf = requestAnimationFrame(frame)
    }
    frame()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener('mousemove', onMove)
      pulses.forEach(p => (p.mesh.material as THREE.SpriteMaterial).dispose())
      nodes.forEach(n => {
        ;(n.core.material as THREE.SpriteMaterial).dispose()
        ;(n.halo.material as THREE.SpriteMaterial).dispose()
        const lm = n.label.material as THREE.SpriteMaterial
        lm.map?.dispose(); lm.dispose()
      })
      lineGeo.dispose(); lineMat.dispose(); glowTex.dispose(); renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [])

  const legend: { label: string; n: number; color: string }[] = [
    { label: 'Healthy', n: Math.max(0, healthy), color: '#00ff88' },
    { label: 'Watch', n: warning, color: '#ffaa00' },
    { label: 'Anomaly', n: anomalies, color: '#ff3366' },
    { label: 'Quarantined', n: quarantined, color: '#33414d' },
  ]

  return (
    <div className="relative w-full overflow-hidden rounded-lg"
      style={{ height: 460, background: 'radial-gradient(ellipse at center, rgba(0,40,30,0.18) 0%, rgba(3,5,10,0.6) 70%)', border: '1px solid rgba(0,255,136,0.12)' }}>
      <div ref={mountRef} className="absolute inset-0" aria-hidden="true" />

      {/* Title + connection state */}
      <div className="absolute top-3 left-4 flex items-center gap-2 pointer-events-none">
        <span className="w-2 h-2 rounded-full" style={{ background: wsConnected ? '#00ff88' : '#ffaa00', boxShadow: `0 0 8px ${wsConnected ? '#00ff88' : '#ffaa00'}`, animation: 'pulse 1.4s ease-in-out infinite' }} />
        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#00ff88]">Live Consensus Swarm</span>
        <span className="text-[8px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.35)]">{wsConnected ? 'WS LIVE' : 'POLLING'} · {ROSTER.length} nodes · PBFT</span>
      </div>

      {/* Live legend bound to telemetry */}
      <div className="absolute bottom-3 left-4 flex flex-wrap gap-x-4 gap-y-1 pointer-events-none">
        {legend.map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: l.color, boxShadow: `0 0 6px ${l.color}` }} />
            <span className="text-[9px] uppercase tracking-wider tabular-nums" style={{ color: l.color }}>{l.n} {l.label}</span>
          </div>
        ))}
      </div>

      {chaosMode && (
        <div className="absolute top-3 right-4 px-2 py-1 rounded text-[9px] font-black uppercase tracking-[0.2em] pointer-events-none"
          style={{ background: 'rgba(255,51,102,0.12)', border: '1px solid rgba(255,51,102,0.5)', color: '#ff3366' }}>
          Chaos · node isolated
        </div>
      )}
    </div>
  )
}
