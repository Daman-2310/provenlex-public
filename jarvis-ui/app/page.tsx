'use client'

import { useEffect, useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import type { LucideIcon } from 'lucide-react'

// 3D consensus swarm — lazy + client-only so Three.js stays out of the initial
// bundle and only loads once the hero mounts.
const SwarmConsensus3D = dynamic(() => import('@/components/SwarmConsensus3D'), { ssr: false })
import {
  ArrowRight, Shield, Zap, Activity, AlertOctagon, CheckCircle2,
  Cpu, Lock, GitBranch, FileText, TrendingUp, Sparkles, Play, ChevronRight, Menu, X,
  Eye, Bitcoin, Network, Scale, Brain, Award, Crosshair, BarChart3, Bot, Globe2,
  Target, Rewind, Tv2, Feather, Users, Mail, FlaskConical, ScrollText, Landmark, Boxes, ScanLine,
} from 'lucide-react'

// Secondary feature navigation. Kept as data so the row stays DRY and ordered
// by prominence; icons come from lucide for visual consistency with the rest
// of the app.
interface FeatureChip {
  href: string
  label: string
  Icon: LucideIcon
  color: string
  emphasis?: boolean
}

const FEATURE_CHIPS: FeatureChip[] = [
  { href: '/predictions',  label: '10 Live Predictions',            Icon: Eye,         color: '#ff3366' },
  { href: '/anchor',       label: 'Bitcoin-Anchored Proof',         Icon: Bitcoin,     color: '#f7931a' },
  { href: '/network',      label: 'Counterparty Network',           Icon: Network,     color: '#9b6dff' },
  { href: '/oracle',       label: 'On-Chain Oracle',                Icon: Zap,         color: '#00d8ff' },
  { href: '/whistleblower',label: 'Sealed Whistleblower',           Icon: Lock,        color: '#ff3388' },
  { href: '/witness',      label: 'Board Witness',                  Icon: Scale,       color: '#ffd86b' },
  { href: '/mirror',       label: 'Prospectus Mirror',              Icon: Eye,         color: '#00d8ff' },
  { href: '/obituary',     label: 'Forensic Obituaries',            Icon: AlertOctagon,color: '#ff3366' },
  { href: '/twin',         label: 'Monte Carlo Twin',               Icon: BarChart3,   color: '#ff7a00' },
  { href: '/sentinel',     label: 'Sentinel Agents',                Icon: Bot,         color: '#9b6dff' },
  { href: '/codex',        label: 'Compliance LLM (Codex)',         Icon: Brain,       color: '#00d8ff' },
  { href: '/claim',        label: 'Claim Your Listing',             Icon: Award,       color: '#00ff88' },
  { href: '/watchlist',    label: 'The Watch List 2026-27',         Icon: Crosshair,   color: '#ff3366', emphasis: true },
  { href: '/deck',         label: 'Pitch Deck',                     Icon: BarChart3,   color: '#9b6dff' },
  { href: '/independence', label: 'Independence Pledge',            Icon: Scale,       color: '#00ff88' },
  { href: '/research',     label: 'Foresight Lab',                  Icon: FlaskConical,color: '#4a9eff' },
  { href: '/architecture', label: 'The Genesis Engine · 7 Pillars', Icon: Cpu,         color: '#9b6dff', emphasis: true },
  { href: '/lux',          label: 'Luxembourg RegTech · 5 Engines', Icon: Landmark,    color: '#9b6dff', emphasis: true },
  { href: '/clearing',     label: 'Clearing Matrix · live crypto',  Icon: Boxes,       color: '#00d8ff', emphasis: true },
  { href: '/scan',         label: 'Live Compliance Scan',           Icon: ScanLine,    color: '#ff5630', emphasis: true },
  { href: '/globe',        label: '3D Genesis Globe',               Icon: Globe2,      color: '#9b6dff' },
  { href: '/lookup',       label: 'Search Your Exposure',           Icon: Target,      color: '#4a9eff' },
  { href: '/mcp',          label: 'MCP for ChatGPT / Claude',       Icon: Bot,         color: '#9b6dff' },
  { href: '/timemachine',  label: 'Time Machine',                   Icon: Rewind,      color: '#ff3366' },
  { href: '/warroom',      label: 'War Room (live 24/7)',           Icon: Tv2,         color: '#ff7700' },
  { href: '/doctrine',     label: 'The Doctrine',                   Icon: Feather,     color: '#4a9eff' },
  { href: '/coalition',    label: 'Sign the Coalition',             Icon: Users,       color: '#00ff88' },
  { href: '/bounty',       label: '€10K Bounty',                    Icon: Target,      color: '#ffaa00' },
  { href: '/daily',        label: 'Daily Brief',                    Icon: Mail,        color: '#00ff88' },
]

// The strongest, most-undeniable surfaces — the only ones shown on the hero.
// Everything else lives behind "Explore all" so the landing reads as one sharp
// product, not a 27-door arcade.
const PRIMARY_HREFS = new Set(['/scan', '/lux', '/clearing', '/watchlist', '/architecture', '/anchor'])

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ────────────────────────────────────────────────────────────────────
//  Genesis Swarm — Marketing Landing
//  Goal: 30-second pitch that makes an investor lean forward.
// ────────────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 2400, start = 0): number {
  const [val, setVal] = useState(start)
  const startedRef = useRef<number | null>(null)
  useEffect(() => {
    let raf = 0
    const tick = (t: number) => {
      if (startedRef.current === null) startedRef.current = t
      const p = Math.min(1, (t - startedRef.current) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(start + (target - start) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, start])
  return val
}

function useTicker(start: number, perSecond: number): number {
  const [v, setV] = useState(start)
  useEffect(() => {
    const i = setInterval(() => setV(x => x + perSecond / 10), 100)
    return () => clearInterval(i)
  }, [perSecond])
  return v
}

// Sticky top nav
function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])
  const links = [
    { href: '/everything',    label: 'All Features' },
    { href: '/audit',         label: '60-Min Audit' },
    { href: '/opinion',       label: 'Legal Opinion' },
    { href: '/analyze',       label: 'PDF Analyzer' },
    { href: '/token-screen',  label: 'RWA Tokens' },
    { href: '/intelligence',  label: 'Intelligence' },
    { href: '/case-studies',  label: 'Case Studies' },
    { href: '/docs',          label: 'API Docs' },
    { href: '/operator',      label: 'Live Dashboard' },
  ]
  return (
    <nav className="fixed top-0 inset-x-0 z-50 transition-all"
      style={{
        background: scrolled || open ? 'rgba(5,5,12,0.92)' : 'transparent',
        backdropFilter: scrolled || open ? 'blur(20px) saturate(180%)' : 'none',
        borderBottom: scrolled || open ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
      }}>
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 rounded-md flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #00ff88 0%, #00aa55 100%)', boxShadow: '0 0 18px rgba(0,255,136,0.5)' }}>
            <Sparkles className="w-4 h-4 text-black" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-black tracking-[0.15em] text-white">GENESIS SWARM</div>
            <div className="text-[8px] uppercase tracking-[0.25em] text-[#00ff88]">// REGTECH AI</div>
          </div>
        </a>
        <div className="hidden xl:flex items-center gap-x-5 text-[12px] tracking-wide text-[rgba(255,255,255,0.6)] min-w-0">
          {links.map(l => (
            <a key={l.href} href={l.href} className="hover:text-white transition-colors whitespace-nowrap">{l.label}</a>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a href="/login" className="hidden sm:inline-block text-[10px] uppercase tracking-[0.15em] font-bold text-[rgba(255,255,255,0.7)] hover:text-white whitespace-nowrap">
            Sign in
          </a>
          <a href="/trial" className="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-md text-[11px] uppercase tracking-[0.15em] font-black whitespace-nowrap"
            style={{
              background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
              color: '#000',
              boxShadow: '0 0 20px rgba(0,255,136,0.35), 0 4px 16px rgba(0,255,136,0.2)',
            }}>
            Start Free Trial <ArrowRight className="w-3 h-3" />
          </a>
          <button onClick={() => setOpen(o => !o)}
            className="xl:hidden p-2 rounded"
            style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)' }}
            aria-label="menu">
            {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="xl:hidden px-4 pb-4 pt-2 border-t border-[rgba(255,255,255,0.06)]">
          <div className="flex flex-col gap-1">
            {links.map(l => (
              <a key={l.href} href={l.href}
                onClick={() => setOpen(false)}
                className="py-2 px-3 rounded text-[13px] text-[rgba(255,255,255,0.75)] hover:bg-[rgba(255,255,255,0.04)]">
                {l.label}
              </a>
            ))}
            <div className="grid grid-cols-2 gap-2 mt-3">
              <a href="/login"
                className="text-center py-2.5 rounded text-[11px] uppercase tracking-[0.15em] font-bold"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)' }}>
                Sign in
              </a>
              <a href="/trial"
                className="text-center py-2.5 rounded text-[11px] uppercase tracking-[0.15em] font-black"
                style={{
                  background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
                  color: '#000',
                  boxShadow: '0 0 16px rgba(0,255,136,0.3)',
                }}>
                Start trial →
              </a>
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}

// Hero with animated headline + live counter
function Hero() {
  const aum = useCountUp(14_780_000_000, 2200)
  const savedNow = useTicker(0, 2300)

  return (
    <section className="relative min-h-screen flex items-center justify-center px-6 pt-32 pb-24 overflow-hidden">
      {/* Animated gradient blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[10%] -left-32 w-[500px] h-[500px] rounded-full opacity-30"
          style={{ background: 'radial-gradient(circle, #00ff88 0%, transparent 70%)', filter: 'blur(80px)', animation: 'float1 18s ease-in-out infinite' }} />
        <div className="absolute bottom-[5%] -right-32 w-[600px] h-[600px] rounded-full opacity-25"
          style={{ background: 'radial-gradient(circle, #4a9eff 0%, transparent 70%)', filter: 'blur(90px)', animation: 'float2 22s ease-in-out infinite' }} />
        <div className="absolute top-[40%] left-[40%] w-[400px] h-[400px] rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #ff3366 0%, transparent 70%)', filter: 'blur(100px)', animation: 'float3 26s ease-in-out infinite' }} />
      </div>

      {/* Live 3D PBFT consensus swarm — the product's core claim, animated */}
      <SwarmConsensus3D className="absolute inset-0 pointer-events-none opacity-90" />
      {/* Legibility vignette: darken the centre where the headline sits */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 55% 42% at 50% 44%, rgba(3,3,10,0.72) 0%, rgba(3,3,10,0.3) 50%, transparent 78%)' }} />

      {/* Subtle grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,1) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }} />

      <div className="relative max-w-6xl w-full mx-auto text-center">
        {/* THE BOOK announcement — mythological strip */}
        <a href="/book"
          className="inline-flex items-center gap-3 px-4 py-2 rounded-full mb-5 group transition-all hover:scale-[1.02]"
          style={{
            background: 'linear-gradient(135deg, rgba(155,109,255,0.12) 0%, rgba(74,158,255,0.08) 100%)',
            border: '1px solid rgba(155,109,255,0.5)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 0 24px rgba(155,109,255,0.25)',
          }}>
          <span className="text-[9px] font-black tracking-[0.25em] uppercase px-2 py-0.5 rounded"
            style={{ background: 'rgba(155,109,255,0.2)', color: '#9b6dff', border: '1px solid rgba(155,109,255,0.5)' }}>
            JUST SEALED
          </span>
          <span className="text-[11px] font-bold tracking-wide text-white">
            The Book of Genesis · 100 prophecies anchored on Bitcoin
          </span>
          <ArrowRight className="w-3 h-3 text-[#9b6dff] group-hover:translate-x-1 transition-transform" />
        </a>

        {/* Pre-headline pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-8"
          style={{
            background: 'rgba(0,255,136,0.06)',
            border: '1px solid rgba(0,255,136,0.25)',
            backdropFilter: 'blur(12px)',
          }}>
          <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88]" style={{ animation: 'pulse 1.2s ease-in-out infinite', boxShadow: '0 0 8px #00ff88' }} />
          <span className="text-[10px] font-black tracking-[0.25em] uppercase text-[#00ff88]">
            DORA · Jan 17, 2027 Enforcement
          </span>
        </div>

        {/* Killer headline */}
        <h1 className="font-black leading-[0.95] tracking-[-0.04em] mb-6"
          style={{ fontSize: 'clamp(2.75rem, 7vw, 6.5rem)' }}>
          <span className="text-white">The AI immune system</span>
          <br />
          <span style={{
            background: 'linear-gradient(90deg, #00ff88 0%, #4a9eff 60%, #ff3366 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            textShadow: 'none',
          }}>
            for European funds.
          </span>
        </h1>

        {/* Subhead */}
        <p className="max-w-2xl mx-auto text-[rgba(255,255,255,0.55)] mb-3"
          style={{ fontSize: 'clamp(1rem, 1.5vw, 1.25rem)', lineHeight: 1.55 }}>
          11 autonomous compliance bots running PBFT consensus. Detect financial crime in
          <span className="text-white font-bold"> 340 milliseconds </span>
          versus the industry standard of
          <span className="text-[#ff3366] font-bold"> 48 hours</span>.
        </p>
        <p className="text-[rgba(255,255,255,0.4)] text-sm mb-12">
          Built for Luxembourg AIFMs · CSSF-aligned · DORA + AIFMD II + SFDR ready
        </p>

        {/* Dual CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-16">
          <a href="/trial"
            className="group flex items-center gap-2 px-6 py-3.5 rounded-md text-sm uppercase tracking-[0.15em] font-black transition-all"
            style={{
              background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
              color: '#000',
              boxShadow: '0 0 30px rgba(0,255,136,0.4), 0 8px 24px rgba(0,255,136,0.2)',
            }}>
            Start 14-Day Free Trial
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </a>
          <a href="/operator"
            className="flex items-center gap-2 px-6 py-3.5 rounded-md text-sm uppercase tracking-[0.15em] font-bold transition-all"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.85)',
              backdropFilter: 'blur(12px)',
            }}>
            <Play className="w-4 h-4" />
            See It Live
          </a>
          <a href="/book"
            className="flex items-center gap-2 px-6 py-3.5 rounded-md text-sm uppercase tracking-[0.15em] font-black transition-all"
            style={{
              background: 'linear-gradient(135deg, rgba(155,109,255,0.18) 0%, rgba(74,158,255,0.12) 100%)',
              border: '1px solid rgba(155,109,255,0.5)',
              color: '#fff',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 0 20px rgba(155,109,255,0.25)',
            }}>
            Read The Book
          </a>
        </div>

        {/* Primary feature row — only the strongest surfaces, plus one door to the rest */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-10 text-[10px] uppercase tracking-[0.15em] font-bold">
          {FEATURE_CHIPS.filter(c => PRIMARY_HREFS.has(c.href)).map(({ href, label, Icon, color }) => (
            <a
              key={href}
              href={href}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full transition-all hover:scale-[1.03]"
              style={{
                background: hexToRgba(color, 0.14),
                border: `1px solid ${hexToRgba(color, 0.7)}`,
                color,
                boxShadow: `0 0 22px ${hexToRgba(color, 0.25)}`,
              }}
            >
              <Icon className="w-3 h-3" aria-hidden="true" />
              {label}
            </a>
          ))}
          <a
            href="/everything"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full transition-all hover:scale-[1.03]"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)' }}
          >
            Explore all {FEATURE_CHIPS.length} <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </a>
        </div>

        {/* Live metrics strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto pt-12 border-t border-[rgba(255,255,255,0.06)]">
          {[
            { label: 'Under Protection',     value: `€${(aum / 1e9).toFixed(2)}B`,  color: '#00ff88' },
            { label: 'Saved This Session',   value: `€${Math.round(savedNow).toLocaleString()}`, color: '#ffaa00' },
            { label: 'Detection Latency',    value: '340ms',                          color: '#4a9eff' },
            { label: 'Threats Blocked',      value: '847,231',                        color: '#ff3366' },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <div className="font-black tabular-nums tracking-tight" style={{
                fontSize: 'clamp(1.5rem, 3vw, 2.25rem)',
                color,
                textShadow: `0 0 20px ${color}66`,
              }}>{value}</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.35)] mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Regulator badges */}
        <div className="flex items-center justify-center gap-6 mt-12 flex-wrap text-[10px] uppercase tracking-[0.18em]">
          <span className="text-[rgba(255,255,255,0.3)]">ALIGNED WITH</span>
          {['AIFMD II', 'DORA', 'SFDR', 'UCITS V', 'CSSF', 'FATF R.10'].map(r => (
            <div key={r} className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-[#00ff88]" />
              <span className="text-[rgba(255,255,255,0.55)]">{r}</span>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes float1 { 0%, 100% { transform: translate(0,0); } 50% { transform: translate(60px, 40px); } }
        @keyframes float2 { 0%, 100% { transform: translate(0,0); } 50% { transform: translate(-80px, -40px); } }
        @keyframes float3 { 0%, 100% { transform: translate(0,0); } 50% { transform: translate(40px, -60px); } }
      `}</style>
    </section>
  )
}

// Problem section — DORA countdown
function Problem() {
  const deadline = new Date('2027-01-17T00:00:00Z').getTime()
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(i)
  }, [])
  const ms = Math.max(0, deadline - now)
  const days = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  const mins = Math.floor((ms % 3600000) / 60000)
  const secs = Math.floor((ms % 60000) / 1000)

  return (
    <section id="problem" data-reveal className="relative py-20 md:py-32 px-6 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center top, rgba(255,51,102,0.06) 0%, transparent 60%)' }} />

      <div className="relative max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#ff3366] mb-4 font-bold">
            // THE €18 BILLION PROBLEM
          </div>
          <h2 className="font-black tracking-tight text-white" style={{ fontSize: 'clamp(2rem, 4.5vw, 3.5rem)' }}>
            European fund managers have
            <br />
            <span className="text-[#ff3366]" style={{ textShadow: '0 0 40px rgba(255,51,102,0.4)' }}>
              {days} days
            </span>
            {' '}to comply.
          </h2>
          <p className="text-[rgba(255,255,255,0.5)] max-w-2xl mx-auto mt-6 text-base leading-relaxed">
            DORA enforcement begins January 17, 2027. AIFMD II rolls out in parallel. Most funds are
            still relying on manual quarterly audits — a regulatory model designed for the 1990s.
          </p>
        </div>

        {/* Countdown */}
        <div className="flex items-center justify-center gap-3 sm:gap-6 mb-20">
          {[
            { v: days,  l: 'Days' },
            { v: hours, l: 'Hours' },
            { v: mins,  l: 'Min' },
            { v: secs,  l: 'Sec' },
          ].map(({ v, l }, i) => (
            <div key={l} className="flex items-center gap-3 sm:gap-6">
              <div className="text-center">
                <div className="font-black tabular-nums leading-none text-white"
                  style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', textShadow: '0 0 30px rgba(255,255,255,0.15)' }}>
                  {String(v).padStart(2, '0')}
                </div>
                <div className="text-[9px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] mt-2">{l}</div>
              </div>
              {i < 3 && <div className="text-[#ff3366] font-black text-3xl opacity-30">:</div>}
            </div>
          ))}
        </div>

        {/* 3 problem cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { Icon: AlertOctagon, t: '48-hour detection', d: 'Manual quarterly audits miss fast-moving fraud. Wirecard was hidden for 500+ days.', c: '#ff3366' },
            { Icon: FileText,     t: '€2.4M average fine', d: 'CSSF penalties for ICT vendor register gaps under DORA Art. 28 alone.',           c: '#ffaa00' },
            { Icon: Lock,         t: '0 board-level visibility', d: 'Most CIOs cannot answer "are we compliant right now?" in real time.',          c: '#4a9eff' },
          ].map(({ Icon, t, d, c }) => (
            <div key={t} className="rounded-xl p-6 transition-all hover:scale-[1.02]"
              style={{
                background: `rgba(255,255,255,0.02)`,
                border: '1px solid rgba(255,255,255,0.06)',
                backdropFilter: 'blur(12px)',
              }}>
              <Icon className="w-7 h-7 mb-4" style={{ color: c, filter: `drop-shadow(0 0 8px ${c})` }} />
              <div className="text-lg font-bold text-white mb-2">{t}</div>
              <p className="text-sm text-[rgba(255,255,255,0.5)] leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// Solution — 3 step "how it works"
function Solution() {
  const steps = [
    { n: '01', Icon: Cpu, t: 'Connect your fund', d: 'Paste an LEI, drop a prospectus PDF, or sync via SFTP. Genesis Swarm onboards in under 90 seconds.', accent: '#00ff88' },
    { n: '02', Icon: GitBranch, t: '11 bots vote in real time', d: 'Each transaction crosses NAV detection, sanctions screening, FX volatility, ICT vendor checks. PBFT consensus reaches quorum in 312ms.', accent: '#4a9eff' },
    { n: '03', Icon: Shield, t: 'Merkle-anchored audit trail', d: 'Every decision is hashed into an immutable chain. CSSF-grade evidence trail downloadable as PDF the moment a regulator asks.', accent: '#ffaa00' },
  ]
  return (
    <section id="solution" data-reveal className="relative py-20 md:py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-20">
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#00ff88] mb-4 font-bold">
            // HOW GENESIS SWARM WORKS
          </div>
          <h2 className="font-black tracking-tight text-white" style={{ fontSize: 'clamp(2rem, 4.5vw, 3.5rem)' }}>
            From fund LEI to compliance proof
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #00ff88 0%, #4a9eff 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>in 90 seconds.</span>
          </h2>
        </div>

        <div className="space-y-6">
          {steps.map(({ n, Icon, t, d, accent }, i) => (
            <div key={n}
              className="relative rounded-2xl p-8 overflow-hidden transition-all hover:translate-x-1"
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${accent}22`,
                backdropFilter: 'blur(12px)',
              }}>
              <div className="absolute right-0 top-0 w-1/3 h-full pointer-events-none opacity-30"
                style={{ background: `radial-gradient(circle at right, ${accent}33 0%, transparent 70%)` }} />
              <div className="relative grid grid-cols-12 gap-6 items-center">
                <div className="col-span-2 md:col-span-1">
                  <div className="text-4xl md:text-5xl font-black tabular-nums opacity-25" style={{ color: accent }}>{n}</div>
                </div>
                <div className="col-span-10 md:col-span-2 flex justify-center md:justify-start">
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center"
                    style={{
                      background: `${accent}10`,
                      border: `1px solid ${accent}44`,
                      boxShadow: `0 0 24px ${accent}33`,
                    }}>
                    <Icon className="w-6 h-6" style={{ color: accent }} />
                  </div>
                </div>
                <div className="col-span-12 md:col-span-9">
                  <div className="text-xl md:text-2xl font-bold text-white mb-2">{t}</div>
                  <p className="text-[rgba(255,255,255,0.55)] leading-relaxed">{d}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <a href="/operator"
            className="inline-flex items-center gap-2 text-sm uppercase tracking-[0.15em] font-bold text-[#00ff88] hover:gap-3 transition-all">
            See the live operator dashboard <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  )
}

// ROI Calculator
function ROICalculator() {
  const [aum, setAum] = useState(500) // €M
  const sliderMax = 5000
  const annualSavings = Math.round((aum * 1000 * 0.018) + (aum > 100 ? 240000 : 80000))
  const fines = Math.round(aum * 1000 * 0.004)
  const hours = Math.round(aum * 24)

  return (
    <section data-reveal className="relative py-20 md:py-32 px-6">
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, rgba(0,255,136,0.04) 0%, transparent 70%)' }} />

      <div className="relative max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#00ff88] mb-4 font-bold">// CALCULATE YOUR SAVINGS</div>
          <h2 className="font-black tracking-tight text-white" style={{ fontSize: 'clamp(2rem, 4.5vw, 3.5rem)' }}>
            What Genesis Swarm saves
            <br />
            <span className="text-[#00ff88]" style={{ textShadow: '0 0 30px rgba(0,255,136,0.4)' }}>
              a fund your size.
            </span>
          </h2>
        </div>

        <div className="rounded-2xl p-8 md:p-12"
          style={{
            background: 'linear-gradient(135deg, rgba(0,255,136,0.04) 0%, rgba(74,158,255,0.03) 100%)',
            border: '1px solid rgba(0,255,136,0.18)',
            boxShadow: '0 0 60px rgba(0,255,136,0.06), inset 0 0 80px rgba(0,255,136,0.02)',
          }}>

          <div className="mb-10">
            <div className="flex items-end justify-between mb-3">
              <label className="text-[11px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.5)] font-bold">Your AUM</label>
              <div className="font-black tabular-nums text-white text-4xl md:text-5xl">
                €{aum >= 1000 ? `${(aum / 1000).toFixed(1)}B` : `${aum}M`}
              </div>
            </div>
            <input type="range"
              min="50" max={sliderMax} step="50"
              value={aum}
              onChange={e => setAum(Number(e.target.value))}
              className="w-full"
              style={{
                accentColor: '#00ff88',
                height: 6,
              }} />
            <div className="flex justify-between text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.3)] mt-2">
              <span>€50M</span><span>€1B</span><span>€2.5B</span><span>€5B+</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-6 rounded-xl"
              style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.2)' }}>
              <div className="text-[9px] uppercase tracking-[0.2em] text-[rgba(0,255,136,0.6)] font-bold mb-2">Annual Savings</div>
              <div className="font-black tabular-nums text-[#00ff88] text-3xl md:text-4xl"
                style={{ textShadow: '0 0 24px rgba(0,255,136,0.5)' }}>
                €{annualSavings.toLocaleString()}
              </div>
              <div className="text-[10px] text-[rgba(255,255,255,0.4)] mt-1">vs manual quarterly audit</div>
            </div>
            <div className="text-center p-6 rounded-xl"
              style={{ background: 'rgba(255,170,0,0.05)', border: '1px solid rgba(255,170,0,0.2)' }}>
              <div className="text-[9px] uppercase tracking-[0.2em] text-[rgba(255,170,0,0.6)] font-bold mb-2">Fines Avoided</div>
              <div className="font-black tabular-nums text-[#ffaa00] text-3xl md:text-4xl"
                style={{ textShadow: '0 0 24px rgba(255,170,0,0.5)' }}>
                €{fines.toLocaleString()}
              </div>
              <div className="text-[10px] text-[rgba(255,255,255,0.4)] mt-1">CSSF DORA Art.28 baseline</div>
            </div>
            <div className="text-center p-6 rounded-xl"
              style={{ background: 'rgba(74,158,255,0.05)', border: '1px solid rgba(74,158,255,0.2)' }}>
              <div className="text-[9px] uppercase tracking-[0.2em] text-[rgba(74,158,255,0.6)] font-bold mb-2">Hours Saved</div>
              <div className="font-black tabular-nums text-[#4a9eff] text-3xl md:text-4xl"
                style={{ textShadow: '0 0 24px rgba(74,158,255,0.5)' }}>
                {hours.toLocaleString()}
              </div>
              <div className="text-[10px] text-[rgba(255,255,255,0.4)] mt-1">compliance team workload</div>
            </div>
          </div>

          <div className="mt-8 text-center">
            <a href="/trial"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-md text-sm uppercase tracking-[0.15em] font-black"
              style={{
                background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
                color: '#000',
                boxShadow: '0 0 24px rgba(0,255,136,0.4)',
              }}>
              Claim these savings — start free trial <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

// Pricing section — 3 tiers
function Pricing() {
  const tiers = [
    {
      name: 'Starter',
      price: 99,
      period: 'mo',
      tagline: 'For boutique AIFMs and emerging managers',
      cta: 'Start free trial',
      ctaHref: '/trial?tier=starter',
      featured: false,
      features: [
        '1 fund · up to €100M AUM',
        '11-bot swarm · 8s polling',
        'AIFMD II + UCITS V gap analysis',
        'OFAC + EU sanctions screening',
        'Monthly PDF compliance report',
        'Email support',
      ],
    },
    {
      name: 'Pro',
      price: 499,
      period: 'mo',
      tagline: 'For mid-size AIFMs and family offices',
      cta: 'Start free trial',
      ctaHref: '/trial?tier=pro',
      featured: true,
      features: [
        'Up to 25 funds · €2B AUM',
        '11-bot swarm · 340ms real-time',
        'Full DORA + AIFMD II + SFDR + CSSF coverage',
        'Real-time sanctions + adverse media',
        'Weekly PDF + Merkle-anchored proof',
        'Slack + dedicated support',
        'API + webhook access',
        'XAI reasoning console',
      ],
    },
    {
      name: 'Enterprise',
      price: null,
      period: '',
      tagline: 'For institutional AIFMs, large UCITS umbrella structures',
      cta: 'Talk to sales',
      ctaHref: '/trial?tier=enterprise',
      featured: false,
      features: [
        'Unlimited funds & AUM',
        'On-premise + dedicated swarm cluster',
        'Custom regulatory rule engine',
        'Real-time CSSF + ECB feed integration',
        'White-label boardroom dashboards',
        '24/7 SOC + dedicated CSM',
        'SLA: 99.99% uptime',
        'Penetration test + SOC 2 reports',
      ],
    },
  ]

  return (
    <section id="pricing" data-reveal className="relative py-20 md:py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#00ff88] mb-4 font-bold">// SIMPLE, TRANSPARENT PRICING</div>
          <h2 className="font-black tracking-tight text-white" style={{ fontSize: 'clamp(2rem, 4.5vw, 3.5rem)' }}>
            Three tiers.
            <br />
            <span className="text-[rgba(255,255,255,0.4)]">No setup fees. No hidden costs.</span>
          </h2>
          <p className="text-[rgba(255,255,255,0.5)] mt-6 max-w-xl mx-auto">
            14-day free trial on every plan. Cancel anytime. No credit card required to start.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {tiers.map(t => (
            <div key={t.name}
              className="relative rounded-2xl p-7 flex flex-col"
              style={{
                background: t.featured
                  ? 'linear-gradient(180deg, rgba(0,255,136,0.06) 0%, rgba(0,255,136,0.02) 100%)'
                  : 'rgba(255,255,255,0.02)',
                border: t.featured ? '1px solid rgba(0,255,136,0.4)' : '1px solid rgba(255,255,255,0.08)',
                boxShadow: t.featured ? '0 0 50px rgba(0,255,136,0.12), inset 0 0 60px rgba(0,255,136,0.04)' : 'none',
                backdropFilter: 'blur(12px)',
                transform: t.featured ? 'scale(1.03)' : 'scale(1)',
              }}>
              {t.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em]"
                  style={{
                    background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
                    color: '#000',
                    boxShadow: '0 0 16px rgba(0,255,136,0.5)',
                  }}>
                  Most Popular
                </div>
              )}
              <div className="mb-6">
                <div className="text-sm font-black uppercase tracking-[0.2em] mb-2"
                  style={{ color: t.featured ? '#00ff88' : 'rgba(255,255,255,0.6)' }}>
                  {t.name}
                </div>
                <div className="flex items-baseline gap-1 mb-3">
                  {t.price === null ? (
                    <div className="text-4xl font-black text-white">Custom</div>
                  ) : (
                    <>
                      <span className="text-[rgba(255,255,255,0.5)] text-lg">€</span>
                      <span className="text-5xl font-black text-white tabular-nums">{t.price}</span>
                      <span className="text-[rgba(255,255,255,0.4)] text-sm">/{t.period}</span>
                    </>
                  )}
                </div>
                <p className="text-[12px] text-[rgba(255,255,255,0.45)] leading-snug">{t.tagline}</p>
              </div>

              <ul className="space-y-2.5 mb-8 flex-1">
                {t.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-[12px] text-[rgba(255,255,255,0.7)]">
                    <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
                      style={{ color: t.featured ? '#00ff88' : 'rgba(255,255,255,0.4)' }} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <a href={t.ctaHref}
                className="block text-center py-3 rounded-md text-[11px] uppercase tracking-[0.15em] font-black transition-all"
                style={t.featured ? {
                  background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
                  color: '#000',
                  boxShadow: '0 0 24px rgba(0,255,136,0.35)',
                } : {
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'rgba(255,255,255,0.9)',
                }}>
                {t.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// Final CTA + footer
function FinalCTA() {
  return (
    <section data-reveal className="relative py-20 md:py-32 px-6 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-25"
          style={{ background: 'radial-gradient(circle, #00ff88 0%, transparent 60%)', filter: 'blur(100px)' }} />
      </div>

      <div className="relative max-w-3xl mx-auto text-center">
        <h2 className="font-black tracking-tight text-white mb-6"
          style={{ fontSize: 'clamp(2.25rem, 5vw, 4rem)' }}>
          Don't be the next
          <br />
          <span style={{
            background: 'linear-gradient(90deg, #ff3366 0%, #ffaa00 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>Wirecard headline.</span>
        </h2>
        <p className="text-[rgba(255,255,255,0.55)] text-base md:text-lg mb-10 max-w-2xl mx-auto leading-relaxed">
          Genesis Swarm catches what manual quarterly audits miss. Start your free trial — no card,
          no contract, no friction. Be CSSF-bulletproof in 14 days.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a href="/trial"
            className="group flex items-center gap-2 px-8 py-4 rounded-md text-sm uppercase tracking-[0.15em] font-black transition-all"
            style={{
              background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
              color: '#000',
              boxShadow: '0 0 40px rgba(0,255,136,0.5), 0 12px 32px rgba(0,255,136,0.2)',
            }}>
            Start free trial — 14 days <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </a>
          <a href="/operator"
            className="flex items-center gap-2 px-8 py-4 rounded-md text-sm uppercase tracking-[0.15em] font-bold transition-all"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.85)',
            }}>
            Watch live dashboard
          </a>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-[rgba(255,255,255,0.06)] py-12 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-md flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #00ff88 0%, #00aa55 100%)' }}>
                <Sparkles className="w-4 h-4 text-black" />
              </div>
              <span className="text-sm font-black tracking-[0.15em] text-white">GENESIS SWARM</span>
            </div>
            <p className="text-[12px] text-[rgba(255,255,255,0.4)] max-w-sm leading-relaxed">
              The autonomous AI immune system for Luxembourg AIFMs. Built for DORA, AIFMD II, SFDR.
              CSSF-aligned. Used by funds protecting €14.78B in AUM.
            </p>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] font-bold mb-3">Product</div>
            <ul className="space-y-2 text-[12px] text-[rgba(255,255,255,0.7)]">
              <li><a href="/everything" className="hover:text-white font-bold text-white">All Features →</a></li>
              <li><a href="/operator" className="hover:text-white">Live Dashboard</a></li>
              <li><a href="/analyze" className="hover:text-white">PDF Analyzer</a></li>
              <li><a href="/audit" className="hover:text-white">60-Min Audit Pack</a></li>
              <li><a href="/opinion" className="hover:text-white">AI Legal Opinion</a></li>
              <li><a href="/token-screen" className="hover:text-white">RWA Token Compliance</a></li>
              <li><a href="/intelligence" className="hover:text-white">Intelligence Feed</a></li>
              <li><a href="/case-studies" className="hover:text-white">Case Studies</a></li>
            </ul>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] font-bold mb-3">Developers</div>
            <ul className="space-y-2 text-[12px] text-[rgba(255,255,255,0.7)]">
              <li><a href="/docs" className="hover:text-white">API Docs</a></li>
              <li><a href="/extension" className="hover:text-white">Chrome Extension</a></li>
              <li><a href="/gpt" className="hover:text-white">ChatGPT Integration</a></li>
              <li><a href="/status" className="hover:text-white">System Status</a></li>
              <li><a href="/api/gpt/openapi" className="hover:text-white">OpenAPI Spec</a></li>
            </ul>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] font-bold mb-3">Company</div>
            <ul className="space-y-2 text-[12px] text-[rgba(255,255,255,0.7)]">
              <li><a href="/about" className="hover:text-white">About</a></li>
              <li><a href="/investors" className="hover:text-white">Investors</a></li>
              <li><a href="/press" className="hover:text-white">Press Kit</a></li>
              <li><a href="#pricing" className="hover:text-white">Pricing</a></li>
              <li><a href="/trial" className="hover:text-white">Start Trial</a></li>
              <li><a href="/privacy" className="hover:text-white">Privacy</a></li>
              <li><a href="mailto:daman.sharma.2310@gmail.com" className="hover:text-white">Contact</a></li>
            </ul>
          </div>
        </div>
        <div className="pt-6 border-t border-[rgba(255,255,255,0.04)] flex items-center justify-between flex-wrap gap-3 text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.3)]">
          <div>© 2026 Genesis Swarm · Luxembourg RegTech</div>
          <div className="flex gap-4">
            <span>CSSF-aligned</span>
            <span>·</span>
            <span>SOC 2 Type II in progress</span>
            <span>·</span>
            <span>GDPR · DORA · AIFMD II ready</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen text-white" style={{
      background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    }}>
      <Nav />
      <Hero />
      <Problem />
      <Solution />
      <ROICalculator />
      <Pricing />
      <FinalCTA />
      <Footer />
    </div>
  )
}
