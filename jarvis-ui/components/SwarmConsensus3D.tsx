'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * SWARM CONSENSUS — live 3D visualisation of the product's core claim.
 *
 * 11 autonomous compliance bots arranged on a fibonacci sphere, wired into a
 * PBFT-style mesh. On each round a random proposer lights up and emits vote
 * pulses that physically travel the edges to every peer; once a 2f+1 quorum is
 * reached the whole swarm flashes "committed" green, then the next round begins.
 *
 * Built to sit as a full-bleed hero backdrop: the centre is kept sparse and a
 * vignette is applied by the parent so the headline stays legible. Honours
 * prefers-reduced-motion (renders a single static frame) and cleans up all GL
 * resources on unmount.
 */

const NODE_COUNT = 11
const QUORUM = 8 // 2f+1 for f=3 tolerated faults across 11 nodes

// Brand palette (sRGB hex) reused from the rest of the site.
const C_IDLE = new THREE.Color('#4a9eff')
const C_PROPOSER = new THREE.Color('#9b6dff')
const C_VOTED = new THREE.Color('#00d8ff')
const C_COMMIT = new THREE.Color('#00ff88')

interface Pulse {
  from: number
  to: number
  t: number // 0..1 along the edge
  speed: number
  color: THREE.Color
  mesh: THREE.Sprite
}

// Soft radial glow sprite texture, generated once on the client.
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

// Even-ish point distribution on a sphere (fibonacci spiral).
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

export default function SwarmConsensus3D({ className }: { className?: string }) {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
    } catch {
      return // No WebGL — parent's CSS gradients remain as graceful fallback.
    }

    let width = mount.clientWidth || window.innerWidth
    let height = mount.clientHeight || window.innerHeight
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.setSize(width, height)
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
    camera.position.set(0, 0, 11)

    const swarm = new THREE.Group()
    scene.add(swarm)

    const glowTex = makeGlowTexture()
    const positions = fibonacciSphere(NODE_COUNT, 4.2)

    // ── Nodes: a bright core sprite + a faint halo sprite each. ──────────────
    interface NodeViz { core: THREE.Sprite; halo: THREE.Sprite; base: THREE.Color; target: THREE.Color; cur: THREE.Color }
    const nodes: NodeViz[] = positions.map((p) => {
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: C_IDLE.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
      core.scale.setScalar(0.6)
      core.position.copy(p)
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: C_IDLE.clone(), transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }))
      halo.scale.setScalar(1.5)
      halo.position.copy(p)
      swarm.add(halo, core)
      return { core, halo, base: C_IDLE.clone(), target: C_IDLE.clone(), cur: C_IDLE.clone() }
    })

    // ── Edges: connect each node to its nearest neighbours for a clean mesh. ─
    const edgeSet = new Set<string>()
    const edges: [number, number][] = []
    positions.forEach((p, i) => {
      const order = positions
        .map((q, j) => ({ j, d: p.distanceTo(q) }))
        .filter((o) => o.j !== i)
        .sort((a, b) => a.d - b.d)
        .slice(0, 3)
      for (const { j } of order) {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`
        if (!edgeSet.has(key)) { edgeSet.add(key); edges.push([i, j]) }
      }
    })

    const linePos = new Float32Array(edges.length * 2 * 3)
    edges.forEach(([a, b], k) => {
      positions[a].toArray(linePos, k * 6)
      positions[b].toArray(linePos, k * 6 + 3)
    })
    const lineGeo = new THREE.BufferGeometry()
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3))
    const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color('#4f8fd6'), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })
    const lineSeg = new THREE.LineSegments(lineGeo, lineMat)
    swarm.add(lineSeg)

    // ── Active vote pulses travelling along edges. ───────────────────────────
    const pulses: Pulse[] = []
    function spawnPulse(from: number, to: number, color: THREE.Color) {
      const mat = new THREE.SpriteMaterial({ map: glowTex, color: color.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
      const sprite = new THREE.Sprite(mat)
      sprite.scale.setScalar(0.55)
      swarm.add(sprite)
      pulses.push({ from, to, t: 0, speed: 0.6 + Math.random() * 0.5, color, mesh: sprite })
    }

    // ── Consensus state machine. ─────────────────────────────────────────────
    type Phase = 'idle' | 'propose' | 'voting' | 'commit'
    let phase: Phase = 'idle'
    let proposer = 0
    let votes = 0
    let phaseClock = 0

    function resetRound() {
      proposer = Math.floor(Math.random() * NODE_COUNT)
      votes = 0
      nodes.forEach((n, i) => { n.target.copy(i === proposer ? C_PROPOSER : C_IDLE) })
      phase = 'propose'
      phaseClock = 0
    }

    const clock = new THREE.Clock()
    const pointer = new THREE.Vector2(0, 0)
    function onMove(e: MouseEvent) {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    if (!reduceMotion) window.addEventListener('mousemove', onMove)

    function resize() {
      width = mount!.clientWidth || window.innerWidth
      height = mount!.clientHeight || window.innerHeight
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    window.addEventListener('resize', resize)

    let raf = 0
    const tmp = new THREE.Vector3()

    function frame() {
      const dt = Math.min(0.05, clock.getDelta())
      phaseClock += dt

      // Drive the consensus state machine.
      if (phase === 'idle') {
        if (phaseClock > 0.6) resetRound()
      } else if (phase === 'propose') {
        if (phaseClock > 0.5) {
          // Proposer fans out PREPARE pulses to every peer.
          for (let i = 0; i < NODE_COUNT; i++) if (i !== proposer) spawnPulse(proposer, i, C_VOTED)
          phase = 'voting'
          phaseClock = 0
        }
      } else if (phase === 'voting') {
        if (votes >= QUORUM && phaseClock > 0.2) {
          nodes.forEach((n) => n.target.copy(C_COMMIT))
          phase = 'commit'
          phaseClock = 0
        }
      } else if (phase === 'commit') {
        if (phaseClock > 1.1) { nodes.forEach((n) => n.target.copy(C_IDLE)); phase = 'idle'; phaseClock = 0 }
      }

      // Advance pulses; on arrival the peer "votes" and briefly turns cyan.
      for (let i = pulses.length - 1; i >= 0; i--) {
        const pu = pulses[i]
        pu.t += pu.speed * dt
        if (pu.t >= 1) {
          if (phase === 'voting') { votes++; nodes[pu.to].target.copy(C_VOTED) }
          swarm.remove(pu.mesh)
          ;(pu.mesh.material as THREE.SpriteMaterial).dispose()
          pulses.splice(i, 1)
          continue
        }
        tmp.copy(positions[pu.from]).lerp(positions[pu.to], pu.t)
        pu.mesh.position.copy(tmp)
        const s = 0.4 + Math.sin(pu.t * Math.PI) * 0.35
        pu.mesh.scale.setScalar(s)
      }

      // Smoothly ease each node toward its target colour + gentle breathing.
      const tNow = clock.elapsedTime
      nodes.forEach((n, i) => {
        n.cur.lerp(n.target, reduceMotion ? 1 : Math.min(1, dt * 6))
        ;(n.core.material as THREE.SpriteMaterial).color.copy(n.cur)
        ;(n.halo.material as THREE.SpriteMaterial).color.copy(n.cur)
        const breathe = 0.6 + Math.sin(tNow * 1.6 + i) * 0.05
        n.core.scale.setScalar(breathe)
        const committed = n.target.equals(C_COMMIT)
        ;(n.halo.material as THREE.SpriteMaterial).opacity = committed ? 0.3 : 0.14
        n.halo.scale.setScalar(committed ? 2.1 : 1.5)
      })

      if (!reduceMotion) {
        swarm.rotation.y += dt * 0.12
        swarm.rotation.x = Math.sin(tNow * 0.15) * 0.18
        // Subtle parallax toward the cursor.
        camera.position.x += (pointer.x * 1.4 - camera.position.x) * 0.04
        camera.position.y += (-pointer.y * 1.0 - camera.position.y) * 0.04
        camera.lookAt(0, 0, 0)
      }

      renderer.render(scene, camera)
      if (!reduceMotion) raf = requestAnimationFrame(frame)
    }

    if (reduceMotion) {
      resetRound()
      frame() // single static frame
    } else {
      resetRound()
      frame()
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMove)
      pulses.forEach((p) => (p.mesh.material as THREE.SpriteMaterial).dispose())
      nodes.forEach((n) => {
        ;(n.core.material as THREE.SpriteMaterial).dispose()
        ;(n.halo.material as THREE.SpriteMaterial).dispose()
      })
      lineGeo.dispose()
      lineMat.dispose()
      glowTex.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={mountRef} className={className} aria-hidden="true" />
}
