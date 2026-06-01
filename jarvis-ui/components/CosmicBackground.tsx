'use client'

import { useEffect, useRef } from 'react'

/**
 * GENESIS COSMIC BACKGROUND
 *
 * Pure SVG + Canvas, no Three.js, edge-runtime friendly.
 *
 * Three depth layers:
 *  - Far: dim drifting starfield (CSS-animated SVG circles)
 *  - Mid: nebula clouds (radial-gradient blobs with slow rotation)
 *  - Near: occasional meteor streaks + cursor-reactive parallax dust (Canvas)
 *
 * Variants:
 *  - "calm"     — for content-heavy pages (book table, prophecy detail)
 *  - "intense"  — for hero/landing moments (book home, court verdict)
 *  - "void"     — minimal stars only (legal page, settings)
 */

interface Props {
  variant?: 'calm' | 'intense' | 'void'
  accent?: string  // hex color, default purple
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  alpha: number
  hue: number
}

interface Meteor {
  x: number
  y: number
  len: number
  speed: number
  angle: number
  life: number
  maxLife: number
}

export default function CosmicBackground({ variant = 'calm', accent = '#9b6dff' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    let width = window.innerWidth
    let height = window.innerHeight

    function resize() {
      width = window.innerWidth
      height = window.innerHeight
      canvas!.width = width * dpr
      canvas!.height = height * dpr
      canvas!.style.width = `${width}px`
      canvas!.style.height = `${height}px`
      ctx!.scale(dpr, dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    // Particle density by variant
    const particleCount = variant === 'intense' ? 80 : variant === 'calm' ? 50 : 24
    const meteorChance = variant === 'intense' ? 0.012 : variant === 'calm' ? 0.005 : 0.001

    const particles: Particle[] = []
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.08,
        vy: (Math.random() - 0.5) * 0.08,
        r: Math.random() * 1.2 + 0.2,
        alpha: Math.random() * 0.7 + 0.2,
        hue: Math.random() < 0.7 ? 0 : Math.random() < 0.5 ? 280 : 200,  // mostly white, some violet/cyan
      })
    }

    const meteors: Meteor[] = []
    let mouseX = width / 2
    let mouseY = height / 2

    function onMove(e: MouseEvent) {
      mouseX = e.clientX
      mouseY = e.clientY
    }
    window.addEventListener('mousemove', onMove)

    let raf = 0
    function draw() {
      // Fade trails — semi-transparent black overlay
      ctx!.fillStyle = 'rgba(2,2,6,0.18)'
      ctx!.fillRect(0, 0, width, height)

      // Parallax offset based on mouse position
      const offsetX = ((mouseX - width / 2) / width) * 12
      const offsetY = ((mouseY - height / 2) / height) * 12

      // Draw particles
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < -10) p.x = width + 10
        if (p.x > width + 10) p.x = -10
        if (p.y < -10) p.y = height + 10
        if (p.y > height + 10) p.y = -10

        const px = p.x + offsetX * p.r
        const py = p.y + offsetY * p.r

        ctx!.beginPath()
        ctx!.arc(px, py, p.r, 0, Math.PI * 2)
        const color = p.hue === 0
          ? `rgba(255,255,255,${p.alpha})`
          : p.hue === 280
            ? `rgba(180,140,255,${p.alpha})`
            : `rgba(120,200,255,${p.alpha})`
        ctx!.fillStyle = color
        ctx!.fill()

        // Subtle glow for larger particles
        if (p.r > 0.8) {
          ctx!.beginPath()
          ctx!.arc(px, py, p.r * 4, 0, Math.PI * 2)
          const grad = ctx!.createRadialGradient(px, py, 0, px, py, p.r * 4)
          grad.addColorStop(0, color.replace(/[\d.]+\)/, `${p.alpha * 0.25})`))
          grad.addColorStop(1, 'rgba(0,0,0,0)')
          ctx!.fillStyle = grad
          ctx!.fill()
        }
      }

      // Spawn meteors
      if (Math.random() < meteorChance) {
        const fromLeft = Math.random() < 0.5
        meteors.push({
          x: fromLeft ? 0 : width,
          y: Math.random() * height * 0.4,
          len: Math.random() * 80 + 60,
          speed: Math.random() * 6 + 5,
          angle: fromLeft ? Math.PI / 5 : Math.PI - Math.PI / 5,
          life: 0,
          maxLife: 90,
        })
      }

      // Draw meteors
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i]
        m.x += Math.cos(m.angle) * m.speed
        m.y += Math.sin(m.angle) * m.speed
        m.life++

        const alpha = m.life < 15
          ? m.life / 15
          : m.life > m.maxLife - 20
            ? Math.max(0, (m.maxLife - m.life) / 20)
            : 1

        const tailX = m.x - Math.cos(m.angle) * m.len
        const tailY = m.y - Math.sin(m.angle) * m.len

        const grad = ctx!.createLinearGradient(tailX, tailY, m.x, m.y)
        grad.addColorStop(0, 'rgba(155,109,255,0)')
        grad.addColorStop(0.5, `rgba(180,140,255,${alpha * 0.3})`)
        grad.addColorStop(1, `rgba(255,255,255,${alpha})`)

        ctx!.strokeStyle = grad
        ctx!.lineWidth = 1.5
        ctx!.lineCap = 'round'
        ctx!.beginPath()
        ctx!.moveTo(tailX, tailY)
        ctx!.lineTo(m.x, m.y)
        ctx!.stroke()

        // Head glow
        ctx!.beginPath()
        ctx!.arc(m.x, m.y, 2, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(255,255,255,${alpha})`
        ctx!.fill()

        if (m.life > m.maxLife || m.x > width + 100 || m.x < -100 || m.y > height + 100) {
          meteors.splice(i, 1)
        }
      }

      raf = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMove)
    }
  }, [variant])

  // Nebula intensity
  const nebulaOpacity = variant === 'intense' ? 0.35 : variant === 'calm' ? 0.2 : 0.08
  const accentRgb = hexToRgb(accent)

  return (
    <>
      {/* Background base — deep space gradient */}
      <div className="fixed inset-0 pointer-events-none -z-30"
        style={{
          background: `
            radial-gradient(ellipse at 20% 10%, rgba(${accentRgb}, ${nebulaOpacity * 0.6}) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 80%, rgba(74, 158, 255, ${nebulaOpacity * 0.45}) 0%, transparent 55%),
            radial-gradient(ellipse at 60% 30%, rgba(0, 255, 136, ${nebulaOpacity * 0.18}) 0%, transparent 60%),
            radial-gradient(ellipse at top, #0a0a1a 0%, #050508 40%, #000 100%)
          `,
        }} />

      {/* Slow-rotating nebula clouds */}
      {variant !== 'void' && (
        <div className="fixed inset-0 pointer-events-none -z-20 overflow-hidden">
          <div className="absolute" style={{
            top: '-20%', left: '-10%', width: '60%', height: '60%',
            background: `radial-gradient(circle, rgba(${accentRgb}, ${nebulaOpacity * 0.7}) 0%, transparent 60%)`,
            filter: 'blur(60px)',
            animation: 'cosmicDrift1 80s linear infinite',
          }} />
          <div className="absolute" style={{
            bottom: '-15%', right: '-10%', width: '55%', height: '55%',
            background: `radial-gradient(circle, rgba(74,158,255,${nebulaOpacity * 0.55}) 0%, transparent 60%)`,
            filter: 'blur(70px)',
            animation: 'cosmicDrift2 120s linear infinite',
          }} />
          {variant === 'intense' && (
            <div className="absolute" style={{
              top: '30%', left: '40%', width: '40%', height: '40%',
              background: `radial-gradient(circle, rgba(255,51,102,${nebulaOpacity * 0.3}) 0%, transparent 65%)`,
              filter: 'blur(80px)',
              animation: 'cosmicPulse 14s ease-in-out infinite',
            }} />
          )}
        </div>
      )}

      {/* Canvas layer — particles + meteors */}
      <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none -z-10"
        style={{ mixBlendMode: 'screen' }} />

      {/* Subtle grid overlay for technical feel */}
      <div className="fixed inset-0 pointer-events-none -z-10 opacity-[0.012]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px',
        }} />

      {/* Film grain noise */}
      <div className="fixed inset-0 pointer-events-none -z-10 opacity-[0.025] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }} />

      <style jsx global>{`
        @keyframes cosmicDrift1 {
          from { transform: translate(0,0) rotate(0deg); }
          to   { transform: translate(40px, 30px) rotate(360deg); }
        }
        @keyframes cosmicDrift2 {
          from { transform: translate(0,0) rotate(0deg); }
          to   { transform: translate(-50px, -20px) rotate(-360deg); }
        }
        @keyframes cosmicPulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50%      { opacity: 1; transform: scale(1.15); }
        }
      `}</style>
    </>
  )
}

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `${r},${g},${b}`
}
