'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * PROVENLEX COSMIC BACKGROUND — flowing aurora edition.
 *
 * Deep parallax starfield + drifting aurora/energy clouds (large additive
 * gradient sprites that morph, rotate and pulse) + cursor-reactive dust.
 * Seeded per route so every feature looks distinct. No planets. Same
 * variant/accent/solarSystem API; DPR-capped, paused on hidden tabs, single
 * static frame under reduced-motion, CSS gradient base kept for legibility.
 */

interface Props { variant?: 'calm' | 'intense' | 'void'; accent?: string; solarSystem?: boolean }

// Institutional Emerald — emerald + cool family only (no rainbow particles).
const PALETTE = ['#10D982', '#5B8DEF', '#14F08C', '#22D3A6', '#3F7DE0', '#0B9E63', '#7FB0FF', '#10D982']
function hexToRgb(hex: string) { const h = hex.replace('#', ''); return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) } }
function hashString(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
function radial(inner: string): THREE.Texture {
  const s = 256, c = document.createElement('canvas'); c.width = c.height = s
  const g = c.getContext('2d')!, grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  grad.addColorStop(0, inner); grad.addColorStop(0.45, inner.replace(/[\d.]+\)$/, '0.3)')); grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad; g.fillRect(0, 0, s, s)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}

export default function CosmicBackground({ variant = 'calm', accent = '#10D982', solarSystem = false }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const rng = mulberry32(hashString((typeof window !== 'undefined' ? window.location.pathname : '/') + accent))

    // Mobile / low-power: skip the WebGL starfield entirely and keep only the CSS
    // gradient fallback below (the radial-gradient div renders regardless). Prevents
    // the phone hang from running a WebGL context per page.
    const nav = navigator as Navigator & { deviceMemory?: number }
    const lowPower =
      !!window.matchMedia?.('(max-width: 820px)').matches ||
      !!window.matchMedia?.('(pointer: coarse)').matches ||
      (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4) ||
      (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4)
    if (lowPower) return

    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' }) } catch { return }

    let w = window.innerWidth, h = window.innerHeight
    renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1)); renderer.setSize(w, h); renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement); Object.assign(renderer.domElement.style, { width: '100%', height: '100%' })

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 3000); camera.position.set(0, 0, 60)
    const accentRgb = hexToRgb(accent), accentColor = new THREE.Color(`rgb(${accentRgb.r},${accentRgb.g},${accentRgb.b})`)
    const disposables: { dispose: () => void }[] = []
    const track = <T extends { dispose: () => void }>(o: T) => { disposables.push(o); return o }

    // Starfield (seeded count + hue)
    const base = variant === 'intense' ? 5200 : variant === 'calm' ? 3600 : 1500
    const n = Math.floor(base * (0.8 + rng() * 0.6))
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3)
    const white = new THREE.Color('#ffffff'), seeded = new THREE.Color(PALETTE[Math.floor(rng() * PALETTE.length)])
    for (let i = 0; i < n; i++) {
      const r = 120 + rng() * 820, th = rng() * Math.PI * 2, ph = Math.acos(2 * rng() - 1)
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th); pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th); pos[i * 3 + 2] = r * Math.cos(ph)
      const p = rng(), cc = p < 0.66 ? white : p < 0.85 ? accentColor : seeded
      col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b
    }
    const sg = track(new THREE.BufferGeometry())
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const sm = track(new THREE.PointsMaterial({ size: 1.2 + rng() * 0.8, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }))
    const stars = new THREE.Points(sg, sm); scene.add(stars)

    // Aurora / energy clouds — drifting, rotating, pulsing additive sprites.
    const auroraHexes = [accent, PALETTE[Math.floor(rng() * PALETTE.length)], '#5B8DEF', '#10D982', '#3F7DE0']
    const count = (variant === 'void' ? 3 : variant === 'intense' ? 8 : 5) + (solarSystem ? 4 : 0)
    interface Cloud { sp: THREE.Sprite; baseOp: number; ph: number; spd: number; drift: THREE.Vector2 }
    const clouds: Cloud[] = []
    for (let i = 0; i < count; i++) {
      const hex = auroraHexes[Math.floor(rng() * auroraHexes.length)], c = hexToRgb(hex)
      const tex = track(radial(`rgba(${c.r},${c.g},${c.b},0.9)`))
      const baseOp = (variant === 'intense' ? 0.18 : 0.12) * (0.6 + rng() * 0.8)
      const m = track(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: baseOp, blending: THREE.AdditiveBlending, depthWrite: false }))
      const sp = new THREE.Sprite(m)
      sp.scale.set(120 + rng() * 220, (120 + rng() * 220) * (0.5 + rng() * 0.6), 1)
      sp.position.set((rng() - 0.5) * 280, (rng() - 0.5) * 200, -60 - rng() * 200)
      sp.material.rotation = rng() * Math.PI
      scene.add(sp)
      clouds.push({ sp, baseOp, ph: rng() * Math.PI * 2, spd: 0.1 + rng() * 0.25, drift: new THREE.Vector2((rng() - 0.5) * 2, (rng() - 0.5) * 1.2) })
    }

    // Reactive dust
    const dn = variant === 'void' ? 120 : 340, dp = new Float32Array(dn * 3)
    for (let i = 0; i < dn; i++) { dp[i * 3] = (rng() - 0.5) * 170; dp[i * 3 + 1] = (rng() - 0.5) * 110; dp[i * 3 + 2] = (rng() - 0.5) * 50 + 20 }
    const dg = track(new THREE.BufferGeometry()); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3))
    const dm = track(new THREE.PointsMaterial({ size: 0.7, color: accentColor, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }))
    const dust = new THREE.Points(dg, dm); scene.add(dust)

    const pointer = new THREE.Vector2(), target = new THREE.Vector2()
    function onMove(e: MouseEvent) { target.x = (e.clientX / window.innerWidth) * 2 - 1; target.y = (e.clientY / window.innerHeight) * 2 - 1 }
    if (!reduce) window.addEventListener('mousemove', onMove, { passive: true })
    let scrollY = 0; function onScroll() { scrollY = window.scrollY || 0 }
    if (!reduce) window.addEventListener('scroll', onScroll, { passive: true })
    function resize() { w = window.innerWidth; h = window.innerHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h) }
    window.addEventListener('resize', resize)

    const clock = new THREE.Clock(); let raf = 0, running = true
    function onVis() { running = !document.hidden; if (running && !reduce) { clock.getDelta(); loop() } }
    document.addEventListener('visibilitychange', onVis)

    function loop() {
      const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime
      pointer.x += (target.x - pointer.x) * 0.05; pointer.y += (target.y - pointer.y) * 0.05
      stars.rotation.y += dt * 0.012; stars.rotation.x = pointer.y * 0.04
      dust.rotation.y += dt * 0.04
      clouds.forEach(cl => {
        cl.sp.material.rotation += dt * cl.spd * 0.3
        cl.sp.material.opacity = cl.baseOp * (0.55 + 0.45 * Math.sin(t * cl.spd + cl.ph))
        cl.sp.position.x += cl.drift.x * dt; cl.sp.position.y += cl.drift.y * dt
        if (Math.abs(cl.sp.position.x) > 200) cl.drift.x *= -1
        if (Math.abs(cl.sp.position.y) > 150) cl.drift.y *= -1
      })
      camera.position.x += (pointer.x * 8 - camera.position.x) * 0.04
      camera.position.y += (-pointer.y * 6 - scrollY * 0.01 - camera.position.y) * 0.04
      camera.lookAt(0, 0, 0)
      renderer.render(scene, camera)
      if (running && !reduce) raf = requestAnimationFrame(loop)
    }
    loop()

    return () => {
      cancelAnimationFrame(raf); running = false
      window.removeEventListener('mousemove', onMove); window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', onVis)
      disposables.forEach(d => d.dispose()); renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [variant, accent, solarSystem])

  const op = variant === 'intense' ? 0.32 : variant === 'calm' ? 0.2 : 0.08, a = hexToRgb(accent)
  return (
    <>
      <div className="fixed inset-0 pointer-events-none -z-30" style={{ background: `radial-gradient(ellipse at 20% 10%, rgba(${a.r},${a.g},${a.b}, ${op * 0.5}) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(91,141,239, ${op * 0.38}) 0%, transparent 55%), radial-gradient(ellipse at top, #080A12 0%, #06070A 45%, #000 100%)` }} />
      <div ref={mountRef} className="fixed inset-0 pointer-events-none -z-20" aria-hidden="true" />
      <div className="fixed inset-0 pointer-events-none -z-10 opacity-[0.022] mix-blend-overlay" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,}} />
    </>
  )
}
