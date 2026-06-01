'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Loader2, Globe2, Play, Pause, Zap, Layers } from 'lucide-react'

// Jurisdiction → approximate financial-capital lat/lon
const JURISDICTION_COORDS: Record<string, { lat: number; lon: number; city: string }> = {
  DE: { lat: 50.11, lon:   8.68, city: 'Frankfurt' },
  FR: { lat: 48.86, lon:   2.35, city: 'Paris' },
  LU: { lat: 49.61, lon:   6.13, city: 'Luxembourg' },
  GB: { lat: 51.51, lon:  -0.13, city: 'London' },
  IT: { lat: 45.46, lon:   9.19, city: 'Milan' },
  NL: { lat: 52.37, lon:   4.90, city: 'Amsterdam' },
  CH: { lat: 47.37, lon:   8.55, city: 'Zurich' },
  IE: { lat: 53.35, lon:  -6.26, city: 'Dublin' },
  ES: { lat: 40.42, lon:  -3.70, city: 'Madrid' },
  AT: { lat: 48.21, lon:  16.37, city: 'Vienna' },
  BE: { lat: 50.85, lon:   4.35, city: 'Brussels' },
  DK: { lat: 55.68, lon:  12.57, city: 'Copenhagen' },
  SE: { lat: 59.33, lon:  18.07, city: 'Stockholm' },
  FI: { lat: 60.17, lon:  24.94, city: 'Helsinki' },
  NO: { lat: 59.91, lon:  10.75, city: 'Oslo' },
  PL: { lat: 52.23, lon:  21.01, city: 'Warsaw' },
  CZ: { lat: 50.08, lon:  14.44, city: 'Prague' },
  PT: { lat: 38.72, lon:  -9.14, city: 'Lisbon' },
  GR: { lat: 37.98, lon:  23.73, city: 'Athens' },
  HU: { lat: 47.50, lon:  19.04, city: 'Budapest' },
}

const RADIUS = 2

interface SlimEntry {
  prophecy_id: string
  rank: number
  name: string
  jurisdiction: string
  category: string
  pre_crime_index: number
  trajectory: 'RISING' | 'FALLING' | 'HOLDING'
  pattern_match: string | null
}

interface HistoryItem {
  prophecy_id: string
  points: { date: string; pci: number }[]
}

type Layer = 'pci' | 'trajectory' | 'pattern' | 'category'

const LAYER_LABEL: Record<Layer, string> = {
  pci: 'PRE-CRIME INDEX',
  trajectory: 'TRAJECTORY',
  pattern: 'PATTERN MATCH',
  category: 'ENTITY CATEGORY',
}

const PATTERN_COLORS: Record<string, number> = {
  wirecard:  0x9b6dff,
  archegos:  0xff7a00,
  ftx:       0xff3388,
  greensill: 0x00d8ff,
  madoff:    0xff3366,
  none:      0x666677,
}

const CATEGORY_COLORS: Record<string, number> = {
  bank:           0x4a9eff,
  asset_mgmt:     0x9b6dff,
  insurance:      0x00ff88,
  private_equity: 0xff7a00,
  real_estate:    0xffd86b,
  wealth:         0xff3388,
  depositary:     0x888899,
}

function latLonToVec3(lat: number, lon: number, r = RADIUS): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -(r * Math.sin(phi) * Math.cos(theta)),
     (r * Math.cos(phi)),
     (r * Math.sin(phi) * Math.sin(theta)),
  )
}

function hashSeed(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h << 5) - h + id.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

function jitter(prophecy_id: string, lat: number, lon: number, n: number): { lat: number; lon: number } {
  // Deterministic jitter using mulberry32 seeded by prophecy_id
  let seed = hashSeed(prophecy_id) + n
  seed = (seed + 0x6D2B79F5) | 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const r1 = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  t = (t + 0x6D2B79F5) | 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const r2 = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return {
    lat: lat + (r1 - 0.5) * 2.4,
    lon: lon + (r2 - 0.5) * 3.6,
  }
}

function colorForPci(p: number): number {
  if (p >= 70) return 0xff3366
  if (p >= 50) return 0xffaa00
  if (p >= 30) return 0xffd86b
  return 0x00ff88
}

function colorForLayer(e: SlimEntry, pciAtMonth: number, layer: Layer): number {
  switch (layer) {
    case 'pci': return colorForPci(pciAtMonth)
    case 'trajectory':
      return e.trajectory === 'RISING' ? 0xff3366 : e.trajectory === 'FALLING' ? 0x00ff88 : 0x888899
    case 'pattern':
      return PATTERN_COLORS[e.pattern_match ?? 'none'] ?? PATTERN_COLORS.none
    case 'category':
      return CATEGORY_COLORS[e.category] ?? 0x888899
  }
}

export default function EntityGlobe({
  entries,
  history,
  presentDefault = false,
}: {
  entries: SlimEntry[]
  history: HistoryItem[]
  presentDefault?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const [monthIndex, setMonthIndex] = useState(17) // current
  const [layer, setLayer] = useState<Layer>('pci')
  const [present, setPresent] = useState(presentDefault)
  const [presentCaption, setPresentCaption] = useState<string>('')
  const [hoverEntity, setHoverEntity] = useState<SlimEntry | null>(null)
  const [contagionEntity, setContagionEntity] = useState<SlimEntry | null>(null)

  // Build history lookup
  const historyMap = useMemo(() => {
    const m = new Map<string, { date: string; pci: number }[]>()
    for (const h of history) m.set(h.prophecy_id, h.points)
    return m
  }, [history])

  // Date string at current month index
  const currentDate = useMemo(() => {
    const first = historyMap.get(entries[0]?.prophecy_id ?? '')
    return first?.[monthIndex]?.date ?? ''
  }, [historyMap, entries, monthIndex])

  // Refs into Three.js scene so the React state changes can update pin colors etc.
  // without rebuilding the scene from scratch.
  const sceneRef = useRef<{
    pins: Array<{ entry: SlimEntry; mesh: THREE.Mesh; halo: THREE.Mesh; position: THREE.Vector3 }>
    globe: THREE.Group
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    contagionArcs: Array<{ line: THREE.Line; mat: THREE.LineBasicMaterial; geom: THREE.BufferGeometry; born: number; lifetime: number; totalPoints: number; targetId: string }>
  } | null>(null)

  useEffect(() => { setMounted(true) }, [])

  // Initial scene setup — run once
  useEffect(() => {
    if (!mounted || !containerRef.current) return
    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
    camera.position.set(0, 0, 6)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const point = new THREE.PointLight(0xffffff, 0.6)
    point.position.set(10, 10, 10)
    scene.add(point)

    // Stars
    const starsGeom = new THREE.BufferGeometry()
    const starCount = 1500
    const starPos = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      const r = 20 + Math.random() * 30
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      starPos[i * 3 + 2] = r * Math.cos(phi)
    }
    starsGeom.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    scene.add(new THREE.Points(starsGeom, new THREE.PointsMaterial({ color: 0xffffff, size: 0.03, sizeAttenuation: true, transparent: true, opacity: 0.55 })))

    // Globe
    const globe = new THREE.Group()
    globe.add(new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 0.99, 64, 64),
      new THREE.MeshBasicMaterial({ color: 0x0a0a1a, transparent: true, opacity: 0.85 }),
    ))
    globe.add(new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, 40, 30),
      new THREE.MeshBasicMaterial({ color: 0x9b6dff, wireframe: true, transparent: true, opacity: 0.16 }),
    ))
    globe.add(new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.03, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x9b6dff, transparent: true, opacity: 0.05, side: THREE.BackSide }),
    ))
    const eq = new THREE.Mesh(
      new THREE.TorusGeometry(RADIUS, 0.003, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0x9b6dff, transparent: true, opacity: 0.4 }),
    )
    eq.rotation.x = Math.PI / 2
    globe.add(eq)
    scene.add(globe)

    // Build pins — one per entity, jittered around its jurisdiction's capital
    const pins: NonNullable<typeof sceneRef.current>['pins'] = []
    entries.forEach((e, i) => {
      const coord = JURISDICTION_COORDS[e.jurisdiction]
      if (!coord) return
      const j = jitter(e.prophecy_id, coord.lat, coord.lon, i)
      const pos = latLonToVec3(j.lat, j.lon, RADIUS * 1.005)
      const initialColor = colorForLayer(e, e.pre_crime_index, 'pci')
      const mat = new THREE.MeshBasicMaterial({ color: initialColor })
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 12), mat)
      mesh.position.copy(pos)
      mesh.userData = { prophecy_id: e.prophecy_id }
      globe.add(mesh)
      const haloMat = new THREE.MeshBasicMaterial({ color: initialColor, transparent: true, opacity: 0.28 })
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 12), haloMat)
      halo.position.copy(pos)
      globe.add(halo)
      pins.push({ entry: e, mesh, halo, position: pos })
    })

    sceneRef.current = { pins, globe, camera, renderer, contagionArcs: [] }

    // Raycasting for pin click + hover
    const raycaster = new THREE.Raycaster()
    raycaster.params.Points = { threshold: 0.04 }
    raycaster.params.Mesh = { threshold: 0.04 } as { threshold: number }
    const mouseVec = new THREE.Vector2()

    function pick(ev: MouseEvent): SlimEntry | null {
      const rect = renderer.domElement.getBoundingClientRect()
      mouseVec.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
      mouseVec.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(mouseVec, camera)
      const meshes = pins.map(p => p.mesh)
      const hits = raycaster.intersectObjects(meshes, false)
      if (hits.length === 0) return null
      const pickedId = (hits[0].object as THREE.Mesh).userData.prophecy_id as string
      return pins.find(p => p.entry.prophecy_id === pickedId)?.entry ?? null
    }

    function onMove(ev: MouseEvent) {
      const e = pick(ev)
      setHoverEntity(e)
      renderer.domElement.style.cursor = e ? 'pointer' : 'grab'
    }

    function onClick(ev: MouseEvent) {
      const e = pick(ev)
      if (e) setContagionEntity(e)
    }

    renderer.domElement.addEventListener('mousemove', onMove)
    renderer.domElement.addEventListener('click', onClick)

    // Animation loop
    let raf = 0
    const clock = new THREE.Clock()
    let lastInteraction = clock.elapsedTime
    let userDragging = false

    function tick() {
      const dt = clock.getDelta()
      const t = clock.elapsedTime

      // Slow auto-rotation when nothing is being clicked
      if (!userDragging && t - lastInteraction > 0.5) {
        globe.rotation.y += dt * 0.07
      }

      // Pulse halos on every pin
      pins.forEach((p, idx) => {
        const phase = (t * 0.8 + idx * 0.04) % 1
        const s = 1 + phase * 0.6
        p.halo.scale.set(s, s, s)
        ;(p.halo.material as THREE.MeshBasicMaterial).opacity = 0.28 * (1 - phase)
      })

      // Animate contagion arcs (use performance.now to share origin with arc creation)
      if (sceneRef.current) {
        const arcs = sceneRef.current.contagionArcs
        const nowSec = performance.now() / 1000
        for (let i = arcs.length - 1; i >= 0; i--) {
          const a = arcs[i]
          const age = (nowSec - a.born) / a.lifetime
          if (age >= 1) {
            globe.remove(a.line)
            a.geom.dispose()
            a.mat.dispose()
            arcs.splice(i, 1)
            continue
          }
          if (age < 0) continue // arc hasn't started yet (staggered birth)
          const drawN = Math.floor(Math.min(1, age * 1.6) * a.totalPoints)
          a.geom.setDrawRange(0, drawN)
          a.mat.opacity = Math.sin(age * Math.PI) * 0.95
        }
      }
      void t // suppress unused

      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    tick()

    // Mouse drag for manual rotation
    let dragLast: { x: number; y: number } | null = null
    function down(ev: MouseEvent) { dragLast = { x: ev.clientX, y: ev.clientY }; userDragging = true; lastInteraction = clock.elapsedTime }
    function up() { dragLast = null; userDragging = false; lastInteraction = clock.elapsedTime }
    function moveDrag(ev: MouseEvent) {
      if (!dragLast) return
      const dx = ev.clientX - dragLast.x
      const dy = ev.clientY - dragLast.y
      globe.rotation.y += dx * 0.005
      globe.rotation.x += dy * 0.005
      dragLast = { x: ev.clientX, y: ev.clientY }
      lastInteraction = clock.elapsedTime
    }
    renderer.domElement.addEventListener('mousedown', down)
    window.addEventListener('mouseup', up)
    renderer.domElement.addEventListener('mousemove', moveDrag)

    const onResize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      renderer.domElement.removeEventListener('mousemove', onMove)
      renderer.domElement.removeEventListener('click', onClick)
      renderer.domElement.removeEventListener('mousedown', down)
      renderer.domElement.removeEventListener('mousemove', moveDrag)
      window.removeEventListener('mouseup', up)
      renderer.dispose()
      scene.traverse(obj => {
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose()
        const mat = (obj as THREE.Mesh).material
        if (mat) {
          if (Array.isArray(mat)) mat.forEach(m => m.dispose())
          else mat.dispose()
        }
      })
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

  // Recolor pins when month or layer changes
  useEffect(() => {
    if (!sceneRef.current) return
    for (const p of sceneRef.current.pins) {
      const points = historyMap.get(p.entry.prophecy_id)
      const pciAtMonth = points?.[monthIndex]?.pci ?? p.entry.pre_crime_index
      const color = colorForLayer(p.entry, pciAtMonth, layer)
      ;(p.mesh.material as THREE.MeshBasicMaterial).color.setHex(color)
      ;(p.halo.material as THREE.MeshBasicMaterial).color.setHex(color)
      // Scale pin a bit based on PCI when layer is 'pci'
      const s = layer === 'pci' ? 0.6 + (pciAtMonth / 100) * 1.2 : 1
      p.mesh.scale.set(s, s, s)
    }
  }, [monthIndex, layer, historyMap])

  // Fire contagion when entity is selected
  useEffect(() => {
    if (!contagionEntity || !sceneRef.current) return
    const src = sceneRef.current.pins.find(p => p.entry.prophecy_id === contagionEntity.prophecy_id)
    if (!src) return

    // Connect entities sharing the same pattern_match (or same category if no pattern)
    const pattern = contagionEntity.pattern_match
    const targets = sceneRef.current.pins.filter(p =>
      p.entry.prophecy_id !== contagionEntity.prophecy_id &&
      (pattern
        ? p.entry.pattern_match === pattern
        : p.entry.category === contagionEntity.category && p.entry.jurisdiction === contagionEntity.jurisdiction)
    ).slice(0, 12) // cap to keep it visually clean

    const baseBorn = performance.now() / 1000

    targets.forEach((tgt, idx) => {
      const s = src.position.clone()
      const e = tgt.position.clone()
      const mid = new THREE.Vector3().addVectors(s, e).multiplyScalar(0.5)
      const dist = s.distanceTo(e)
      mid.setLength(RADIUS + dist * 0.45)
      const curve = new THREE.QuadraticBezierCurve3(s, mid, e)
      const points = curve.getPoints(64)
      const geom = new THREE.BufferGeometry().setFromPoints(points)
      const color = pattern ? PATTERN_COLORS[pattern] : 0xff3366
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0 })
      const line = new THREE.Line(geom, mat)
      geom.setDrawRange(0, 0)
      sceneRef.current!.globe.add(line)
      sceneRef.current!.contagionArcs.push({
        line, mat, geom,
        born: baseBorn + idx * 0.08,
        lifetime: 2.5,
        totalPoints: points.length,
        targetId: tgt.entry.prophecy_id,
      })
    })

    // Auto-clear selected entity after contagion completes
    const clearTimer = setTimeout(() => setContagionEntity(null), 3000)
    return () => clearTimeout(clearTimer)
  }, [contagionEntity])

  // Presenter autoplay
  useEffect(() => {
    if (!present) { setPresentCaption(''); return }
    let cancelled = false
    let timers: ReturnType<typeof setTimeout>[] = []

    const wait = (ms: number) => new Promise<void>(r => {
      const t = setTimeout(r, ms)
      timers.push(t)
    })

    async function tour() {
      while (!cancelled) {
        // 1) PCI heat sweep
        setLayer('pci')
        setMonthIndex(0)
        setPresentCaption('PCI heat · 18 months ago')
        await wait(1500)
        for (let i = 0; i <= 17; i++) {
          if (cancelled) return
          setMonthIndex(i)
          await wait(420)
        }
        setPresentCaption('PCI heat · today')
        await wait(1200)

        // 2) Trajectory layer
        if (cancelled) return
        setLayer('trajectory')
        setPresentCaption('Trajectory layer · red rising, green falling')
        await wait(2500)

        // 3) Pattern layer + contagion from top RISING wirecard-pattern
        if (cancelled) return
        setLayer('pattern')
        setPresentCaption('Pattern match · entities sharing Wirecard archetype')
        await wait(1500)
        const wirecardEntity = entries.find(e => e.pattern_match === 'wirecard') ?? entries[0]
        if (wirecardEntity && !cancelled) {
          setPresentCaption(`Contagion from ${wirecardEntity.name}`)
          setContagionEntity(wirecardEntity)
          await wait(3200)
        }

        // 4) Category layer
        if (cancelled) return
        setLayer('category')
        setPresentCaption('Category layer · banks blue, asset mgmt purple, insurance green')
        await wait(2500)

        // 5) Reset to PCI for next loop
        if (cancelled) return
        setLayer('pci')
        setMonthIndex(17)
        setPresentCaption('')
        await wait(800)
      }
    }
    tour()
    return () => { cancelled = true; timers.forEach(clearTimeout) }
  }, [present, entries])

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col h-full relative"
      style={{
        background: 'radial-gradient(circle at center, rgba(20,8,40,0.6) 0%, rgba(5,5,12,0.95) 70%)',
        border: '1px solid rgba(155,109,255,0.2)',
        boxShadow: 'inset 0 0 80px rgba(155,109,255,0.04), 0 0 50px rgba(155,109,255,0.08)',
      }}>

      {/* HEADER */}
      <div className="px-5 py-3 flex items-center justify-between shrink-0 z-10 flex-wrap gap-3"
        style={{ borderBottom: '1px solid rgba(155,109,255,0.1)', background: 'rgba(0,0,0,0.4)' }}>
        <div className="flex items-center gap-3">
          <div className="w-1 h-5 rounded-full" style={{ background: '#9b6dff', boxShadow: '0 0 8px #9b6dff' }} />
          <div>
            <div className="text-[10px] font-black tracking-[0.18em] uppercase text-[#9b6dff]">Genesis Globe · v2</div>
            <div className="text-[8px] tracking-wider mt-0.5 uppercase text-[rgba(255,255,255,0.4)]">
              {entries.length} entities · 18 mo history · {LAYER_LABEL[layer]}
            </div>
          </div>
        </div>

        {/* LAYER TOGGLE */}
        <div className="flex items-center gap-1 rounded p-1"
          style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(155,109,255,0.2)' }}>
          <Layers className="w-3 h-3 text-[#9b6dff] mx-1" />
          {(['pci', 'trajectory', 'pattern', 'category'] as Layer[]).map(L => (
            <button key={L} onClick={() => setLayer(L)}
              className="text-[9px] uppercase tracking-wider font-bold px-2 py-1 rounded transition-all"
              style={{
                background: layer === L ? 'rgba(155,109,255,0.25)' : 'transparent',
                color: layer === L ? '#fff' : 'rgba(255,255,255,0.5)',
              }}>
              {L === 'pci' ? 'PCI' : L === 'trajectory' ? 'Traj' : L === 'pattern' ? 'Pattern' : 'Cat'}
            </button>
          ))}
        </div>

        {/* PRESENTER TOGGLE */}
        <button onClick={() => setPresent(p => !p)}
          className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider font-bold px-3 py-1.5 rounded transition-all"
          style={{
            background: present ? 'rgba(255,170,0,0.15)' : 'rgba(0,0,0,0.5)',
            border: `1px solid ${present ? 'rgba(255,170,0,0.5)' : 'rgba(155,109,255,0.2)'}`,
            color: present ? '#ffaa00' : '#9b6dff',
          }}>
          {present ? <><Pause className="w-3 h-3" /> Stop tour</> : <><Play className="w-3 h-3" /> Investor tour</>}
        </button>
      </div>

      {/* CANVAS */}
      <div ref={containerRef} className="flex-1 relative" style={{ minHeight: 540, cursor: 'grab' }}>
        {!mounted && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-[#9b6dff] animate-spin" />
          </div>
        )}

        {/* Hover tooltip */}
        {hoverEntity && !present && (
          <div className="absolute top-3 left-3 rounded-lg px-3 py-2 pointer-events-none max-w-[280px]"
            style={{ background: 'rgba(0,0,0,0.88)', border: '1px solid rgba(155,109,255,0.4)', backdropFilter: 'blur(10px)' }}>
            <div className="text-[10px] uppercase tracking-wider text-[#9b6dff] font-bold mb-0.5">
              #{hoverEntity.rank} · {hoverEntity.jurisdiction} · {hoverEntity.category.replace('_', ' ')}
            </div>
            <div className="text-[13px] font-bold text-white leading-tight">{hoverEntity.name}</div>
            <div className="text-[10px] text-[rgba(255,255,255,0.65)] mt-1">
              PCI {(historyMap.get(hoverEntity.prophecy_id)?.[monthIndex]?.pci ?? hoverEntity.pre_crime_index)} ·{' '}
              <span className="text-[#9b6dff] font-bold">click to fire contagion</span>
            </div>
          </div>
        )}

        {/* Contagion HUD */}
        {contagionEntity && (
          <div className="absolute top-3 right-3 rounded-lg px-3 py-2 pointer-events-none max-w-[280px]"
            style={{ background: 'rgba(0,0,0,0.88)', border: '1px solid rgba(255,51,102,0.5)', backdropFilter: 'blur(10px)', boxShadow: '0 0 20px rgba(255,51,102,0.2)' }}>
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-[#ff3366] font-bold mb-1">
              <Zap className="w-3 h-3" /> CONTAGION
            </div>
            <div className="text-[12px] font-bold text-white leading-tight">{contagionEntity.name}</div>
            <div className="text-[10px] text-[rgba(255,255,255,0.6)] mt-1">
              {contagionEntity.pattern_match
                ? `Risk propagating along ${contagionEntity.pattern_match} pattern peers`
                : `Risk propagating to ${contagionEntity.jurisdiction} ${contagionEntity.category} peers`}
            </div>
          </div>
        )}

        {/* Presenter caption */}
        {present && presentCaption && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg px-4 py-2 pointer-events-none"
            style={{ background: 'rgba(0,0,0,0.88)', border: '1px solid rgba(255,170,0,0.5)', backdropFilter: 'blur(10px)' }}>
            <div className="text-[11px] uppercase tracking-[0.15em] font-bold text-[#ffaa00]">{presentCaption}</div>
          </div>
        )}
      </div>

      {/* TIMELINE SCRUBBER */}
      <div className="px-5 py-3 shrink-0"
        style={{ borderTop: '1px solid rgba(155,109,255,0.1)', background: 'rgba(0,0,0,0.4)' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[9px] uppercase tracking-wider font-bold text-[#9b6dff]">Timeline · {currentDate}</div>
          <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.45)]">
            month {monthIndex + 1} / 18 · drag to scrub
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={17}
          value={monthIndex}
          onChange={e => { setMonthIndex(parseInt(e.target.value, 10)); setPresent(false) }}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
          style={{
            background: 'linear-gradient(to right, rgba(155,109,255,0.3) 0%, rgba(255,51,102,0.5) 100%)',
            WebkitAppearance: 'none',
            outline: 'none',
          }}
        />
        <style>{`
          input[type=range]::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: #9b6dff;
            box-shadow: 0 0 12px #9b6dff;
            cursor: pointer;
          }
          input[type=range]::-moz-range-thumb {
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: #9b6dff;
            box-shadow: 0 0 12px #9b6dff;
            border: none;
            cursor: pointer;
          }
        `}</style>
      </div>
    </div>
  )
}
