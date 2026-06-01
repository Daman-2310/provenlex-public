'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Crosshair, Globe2, Loader2 } from 'lucide-react'

// Real-ish lat/lon of sanctioned-region cities
const THREAT_PINS = [
  { name: 'Moscow',       lat: 55.75, lon:  37.62, threat: 92 },
  { name: 'St Petersburg',lat: 59.93, lon:  30.34, threat: 78 },
  { name: 'Tehran',       lat: 35.69, lon:  51.39, threat: 88 },
  { name: 'Bandar Abbas', lat: 27.18, lon:  56.27, threat: 71 },
  { name: 'Pyongyang',    lat: 39.04, lon: 125.76, threat: 95 },
  { name: 'Damascus',     lat: 33.51, lon:  36.29, threat: 83 },
  { name: 'Caracas',      lat: 10.49, lon: -66.88, threat: 77 },
  { name: 'Havana',       lat: 23.13, lon: -82.36, threat: 62 },
  { name: 'Minsk',        lat: 53.90, lon:  27.57, threat: 74 },
  { name: 'Yangon',       lat: 16.87, lon:  96.20, threat: 68 },
  { name: 'Khartoum',     lat: 15.50, lon:  32.56, threat: 64 },
  { name: 'Mogadishu',    lat:  2.04, lon:  45.32, threat: 58 },
  { name: 'Vladivostok',  lat: 43.12, lon: 131.89, threat: 67 },
  { name: 'Sochi',        lat: 43.60, lon:  39.73, threat: 55 },
  { name: 'Kaliningrad',  lat: 54.71, lon:  20.45, threat: 69 },
  { name: 'Isfahan',      lat: 32.65, lon:  51.67, threat: 72 },
  { name: 'Aleppo',       lat: 36.20, lon:  37.16, threat: 76 },
  { name: 'Maracaibo',    lat: 10.66, lon: -71.61, threat: 60 },
  { name: 'Rason',        lat: 42.25, lon: 130.30, threat: 81 },
  { name: 'Wonsan',       lat: 39.16, lon: 127.43, threat: 79 },
  { name: 'London',       lat: 51.51, lon:  -0.13, threat: 35 },
  { name: 'NYC',          lat: 40.71, lon: -74.01, threat: 32 },
  { name: 'Luxembourg',   lat: 49.61, lon:   6.13, threat: 22 },
]

const RADIUS = 2

function latLonToVec3(lat: number, lon: number, r = RADIUS): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -(r * Math.sin(phi) * Math.cos(theta)),
     (r * Math.cos(phi)),
     (r * Math.sin(phi) * Math.sin(theta)),
  )
}

function colorForThreat(t: number): number {
  if (t >= 80) return 0xff3366
  if (t >= 60) return 0xffaa00
  return 0x00ff88
}

export default function ThreatGlobe() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted || !containerRef.current) return
    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    // Scene
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
    camera.position.set(0, 0, 6)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.5))
    const point = new THREE.PointLight(0xffffff, 0.6)
    point.position.set(10, 10, 10)
    scene.add(point)

    // Stars background
    const starsGeom = new THREE.BufferGeometry()
    const starCount = 1200
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
    const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.03, sizeAttenuation: true, transparent: true, opacity: 0.5 })
    const stars = new THREE.Points(starsGeom, starsMat)
    scene.add(stars)

    // Globe — solid translucent core
    const globe = new THREE.Group()
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 0.99, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x001a0d, transparent: true, opacity: 0.85 }),
    )
    globe.add(core)
    // Wireframe overlay
    const wire = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, transparent: true, opacity: 0.18 }),
    )
    globe.add(wire)
    // Inner glow
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.02, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.04, side: THREE.BackSide }),
    )
    globe.add(glow)
    // Equator
    const eq = new THREE.Mesh(
      new THREE.TorusGeometry(RADIUS, 0.003, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.45 }),
    )
    eq.rotation.x = Math.PI / 2
    globe.add(eq)
    // Prime meridian
    const pm = new THREE.Mesh(
      new THREE.TorusGeometry(RADIUS, 0.003, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.25 }),
    )
    globe.add(pm)
    scene.add(globe)

    // Pins
    interface PinObj {
      group: THREE.Group
      ring?: THREE.Mesh
      threat: number
    }
    const pins: PinObj[] = []
    THREAT_PINS.forEach(p => {
      const pos = latLonToVec3(p.lat, p.lon, RADIUS * 1.005)
      const color = colorForThreat(p.threat)
      const group = new THREE.Group()
      group.position.copy(pos)
      const inner = new THREE.Mesh(
        new THREE.SphereGeometry(0.025, 12, 12),
        new THREE.MeshBasicMaterial({ color }),
      )
      group.add(inner)
      const outer = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 12, 12),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 }),
      )
      group.add(outer)
      let ring: THREE.Mesh | undefined
      if (p.threat >= 80) {
        ring = new THREE.Mesh(
          new THREE.RingGeometry(0.05, 0.06, 24),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide }),
        )
        ring.lookAt(camera.position)
        group.add(ring)
      }
      globe.add(group)
      pins.push({ group, ring, threat: p.threat })
    })

    // Threat arcs — pick 6 random pairs from hot pins
    interface Arc {
      line: THREE.Line
      mat: THREE.LineBasicMaterial
      geom: THREE.BufferGeometry
      totalPoints: number
      delay: number
    }
    const arcs: Arc[] = []
    const hotPins = THREAT_PINS.filter(p => p.threat >= 75)
    for (let i = 0; i < 6; i++) {
      const a = hotPins[Math.floor(Math.random() * hotPins.length)]
      const b = hotPins[Math.floor(Math.random() * hotPins.length)]
      if (!a || !b || a === b) continue
      const s = latLonToVec3(a.lat, a.lon)
      const e = latLonToVec3(b.lat, b.lon)
      const mid = new THREE.Vector3().addVectors(s, e).multiplyScalar(0.5)
      const dist = s.distanceTo(e)
      mid.setLength(RADIUS + dist * 0.5)
      const curve = new THREE.QuadraticBezierCurve3(s, mid, e)
      const points = curve.getPoints(64)
      const geom = new THREE.BufferGeometry().setFromPoints(points)
      const mat = new THREE.LineBasicMaterial({ color: 0xff3366, transparent: true, opacity: 0 })
      const line = new THREE.Line(geom, mat)
      globe.add(line)
      arcs.push({ line, mat, geom, totalPoints: points.length, delay: i * 0.7 })
    }

    // Animation loop
    let raf = 0
    const clock = new THREE.Clock()
    const tick = () => {
      const dt = clock.getDelta()
      const t = clock.elapsedTime
      // Rotate globe
      globe.rotation.y += dt * 0.06
      // Pulse rings on hot pins
      pins.forEach(p => {
        if (p.ring) {
          const cycle = ((t * 1.4 + p.threat * 0.01) % 1)
          const s = 1 + cycle * 2.5
          p.ring.scale.set(s, s, s)
          ;(p.ring.material as THREE.MeshBasicMaterial).opacity = (1 - cycle) * 0.8
        }
      })
      // Animate arc draw range + opacity
      arcs.forEach(a => {
        const cycle = ((t + a.delay) % 4) / 4
        const draw = Math.floor(cycle * a.totalPoints * 1.3)
        a.geom.setDrawRange(0, Math.min(draw, a.totalPoints))
        a.mat.opacity = Math.sin(cycle * Math.PI) * 0.85
      })
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    tick()

    // Resize handling
    const onResize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)

    // Cleanup
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
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
  }, [mounted])

  return (
    <div className="rounded-lg overflow-hidden flex flex-col h-full"
      style={{
        background: 'radial-gradient(circle at center, rgba(0,30,15,0.4) 0%, rgba(5,5,12,0.95) 70%)',
        border: '1px solid rgba(0,255,136,0.15)',
        boxShadow: 'inset 0 0 80px rgba(0,255,136,0.04), 0 0 50px rgba(0,255,136,0.08)',
      }}>

      <div className="px-4 py-3 flex items-center justify-between shrink-0"
        style={{ borderBottom: '1px solid rgba(0,255,136,0.1)', background: 'rgba(0,0,0,0.3)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-1 h-5 rounded-full" style={{ background: '#00ff88', boxShadow: '0 0 8px #00ff88' }} />
          <div>
            <div className="text-[10px] font-black tracking-[0.15em] uppercase text-[#00ff88]">3D Threat Globe</div>
            <div className="text-[8px] tracking-wider mt-0.5 uppercase text-[rgba(255,255,255,0.4)]">
              Sanctioned regions · WebGL · Real-time
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Globe2 className="w-3 h-3 text-[#00ff88]" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
          <span className="text-[8px] font-black uppercase tracking-wider text-[#00ff88]">SCANNING</span>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 relative" style={{ minHeight: 320 }}>
        {!mounted && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-[#00ff88] animate-spin" />
          </div>
        )}
      </div>

      <div className="px-4 py-2 flex items-center justify-between shrink-0"
        style={{ borderTop: '1px solid rgba(0,255,136,0.08)', background: 'rgba(0,0,0,0.3)' }}>
        <div className="flex items-center gap-3 text-[8px] uppercase tracking-wider">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#ff3366]" /> <span className="text-[rgba(255,255,255,0.5)]">CRITICAL</span></span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#ffaa00]" /> <span className="text-[rgba(255,255,255,0.5)]">ELEVATED</span></span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#00ff88]" /> <span className="text-[rgba(255,255,255,0.5)]">NOMINAL</span></span>
        </div>
        <div className="flex items-center gap-1 text-[8px] uppercase tracking-wider text-[rgba(0,255,136,0.5)]">
          <Crosshair className="w-2.5 h-2.5" /> <span>{THREAT_PINS.length} regions</span>
        </div>
      </div>
    </div>
  )
}
