'use client'

import { useEffect, useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import type { LucideIcon } from 'lucide-react'

// 3D consensus swarm — lazy + client-only so Three.js stays out of the initial
// bundle and only loads once the hero mounts.
const CinematicHero3D = dynamic(() => import('@/components/CinematicHero3D'), { ssr: false })
const CosmicBackground = dynamic(() => import('@/components/CosmicBackground'), { ssr: false })
// Live Compliance Wall — runs the real scan engine in-browser as a proof section.
const ComplianceWall = dynamic(() => import('@/components/ComplianceWall'), { ssr: false })
import TiltCard from '@/components/TiltCard'
import CinematicFx from '@/components/CinematicFx'
import LiveScanHero from '@/components/LiveScanHero'
import {
  ArrowRight, Shield, Zap, Activity, AlertOctagon, CheckCircle2,
  Cpu, Lock, GitBranch, FileText, TrendingUp, Sparkles, ChevronRight, Menu, X,
  Eye, Bitcoin, Network, Scale, Brain, Award, Crosshair, BarChart3, Bot, Globe2,
  Target, Rewind, Tv2, Feather, Users, Mail, FlaskConical, ScrollText, Landmark, Boxes, ScanLine, Vault,
  SlidersHorizontal,
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
  { href: '/scan',         label: 'Live Compliance Scan',           Icon: ScanLine,    color: '#10D982', emphasis: true },
  { href: '/playground',   label: 'Rule Playground · live',         Icon: SlidersHorizontal, color: '#10D982', emphasis: true },
  { href: '/lux',          label: 'UCITS + AIFMD II Engines',       Icon: Landmark,    color: '#5B8DEF', emphasis: true },
  { href: '/shadow',       label: 'Shadow Mode · zero-risk pilot',  Icon: GitBranch,   color: '#5B8DEF', emphasis: true },
  { href: '/vault',        label: 'Evidence Vault · audit proof',   Icon: Vault,       color: '#10D982', emphasis: true },
  { href: '/deterministic',label: 'Deterministic by Design',        Icon: Cpu,         color: '#10D982' },
  { href: '/verify',       label: 'Verify a Verdict',               Icon: CheckCircle2,color: '#10D982' },
  { href: '/screening',    label: 'Sanctions Screening',            Icon: Crosshair,   color: '#5B8DEF' },
  { href: '/docs',         label: 'API Docs',                       Icon: Boxes,       color: '#5B8DEF' },
]

// All feature surfaces are real pages, shown directly in the hero chip row.

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ────────────────────────────────────────────────────────────────────
//  ProvenLex — Marketing Landing
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
    { href: '/shadow',        label: 'Shadow Mode' },
    { href: '/deterministic', label: 'Why Deterministic' },
    { href: '/verify',        label: 'Verify a Verdict' },
    { href: '/docs',          label: 'API Docs' },
    { href: '/scan',          label: 'Run a Scan' },
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
            style={{ background: 'linear-gradient(135deg, #10D982 0%, #0B9E63 100%)', boxShadow: '0 0 18px rgba(16,217,130,0.5)' }}>
            <Sparkles className="w-4 h-4 text-black" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-black tracking-[0.15em] text-white">PROVENLEX</div>
            <div className="text-[8px] uppercase tracking-[0.25em] text-[#10D982]">// DETERMINISTIC REGTECH</div>
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
              background: 'linear-gradient(135deg, #10D982 0%, #0B9E63 100%)',
              color: '#000',
              boxShadow: '0 0 20px rgba(16,217,130,0.35), 0 4px 16px rgba(16,217,130,0.2)',
            }}>
            Request a pilot <ArrowRight className="w-3 h-3" />
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
                  background: 'linear-gradient(135deg, #10D982 0%, #0B9E63 100%)',
                  color: '#000',
                  boxShadow: '0 0 16px rgba(16,217,130,0.3)',
                }}>
                Request a pilot →
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
  return (
    <section className="relative min-h-screen flex items-center justify-center px-6 pt-32 pb-24 overflow-hidden">
      {/* Slow emerald aurora wash — premium, performant, reduced-motion safe */}
      <div className="absolute inset-0 pointer-events-none aurora-hero" aria-hidden="true" />

      {/* Animated gradient blobs — desktop only; they animate blur(90-110px) which stutters phones */}
      <div className="absolute inset-0 pointer-events-none hidden md:block">
        <div className="absolute top-[10%] -left-32 w-[500px] h-[500px] rounded-full opacity-[0.2]"
          style={{ background: 'radial-gradient(circle, #10D982 0%, transparent 70%)', filter: 'blur(90px)', animation: 'float1 20s ease-in-out infinite' }} />
        <div className="absolute bottom-[5%] -right-32 w-[600px] h-[600px] rounded-full opacity-[0.16]"
          style={{ background: 'radial-gradient(circle, #5B8DEF 0%, transparent 70%)', filter: 'blur(100px)', animation: 'float2 24s ease-in-out infinite' }} />
        <div className="absolute top-[40%] left-[40%] w-[400px] h-[400px] rounded-full opacity-[0.07]"
          style={{ background: 'radial-gradient(circle, #F2566E 0%, transparent 70%)', filter: 'blur(110px)', animation: 'float3 28s ease-in-out infinite' }} />
      </div>

      {/* Cinematic bloom-lit 3D consensus mesh — the product's core claim, filmic */}
      <CinematicHero3D className="absolute inset-0 pointer-events-none" />
      {/* Legibility vignette: darken the centre where the headline sits */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(100deg, rgba(4,5,9,0.92) 0%, rgba(4,5,9,0.62) 42%, rgba(4,5,9,0.18) 72%, transparent 100%)' }} />

      {/* Subtle grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,1) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }} />

      {/* Bottom fade — blend the cinematic hero into the page so there's no hard seam */}
      <div className="absolute inset-x-0 bottom-0 h-56 pointer-events-none z-[1]" aria-hidden="true"
        style={{ background: 'linear-gradient(to bottom, transparent 0%, rgba(6,7,10,0.72) 55%, #06070A 100%)' }} />

      <div className="relative max-w-7xl w-full mx-auto grid lg:grid-cols-12 gap-10 lg:gap-8 items-center">
        {/* LEFT — the pitch */}
        <div className="lg:col-span-7 text-center lg:text-left">
        {/* Pre-headline pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-8"
          style={{
            background: 'rgba(16,217,130,0.06)',
            border: '1px solid rgba(16,217,130,0.25)',
            backdropFilter: 'blur(12px)',
          }}>
          <span className="w-1.5 h-1.5 rounded-full bg-[#10D982]" style={{ animation: 'pulse 1.2s ease-in-out infinite', boxShadow: '0 0 8px #10D982' }} />
          <span className="text-[10px] font-black tracking-[0.25em] uppercase text-[#10D982]">
            AIFMD II · UCITS · Deterministic
          </span>
        </div>

        {/* Killer headline */}
        <h1 className="font-black leading-[0.95] tracking-[-0.045em] mb-6"
          style={{ fontSize: 'clamp(2.5rem, 5.2vw, 4.75rem)' }}>
          <span className="text-white">Paste a prospectus.</span>
          <br />
          <span className="text-white">See </span>
          <span className="gradient-sheen" style={{
            background: 'linear-gradient(90deg, #10D982 0%, #6FF0B8 50%, #10D982 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            textShadow: 'none',
          }}>every breach</span>
          <br />
          <span className="text-white">in 10 seconds.</span>
        </h1>

        {/* Subhead */}
        <p className="max-w-xl mx-auto lg:mx-0 text-[rgba(255,255,255,0.62)] mb-3"
          style={{ fontSize: 'clamp(1rem, 1.5vw, 1.2rem)', lineHeight: 1.55 }}>
          Deterministic checks against the <span className="text-white font-semibold">AIFMD II and UCITS</span> quantitative limits —
          in your browser, in under a second, with no LLM in the decision path. Every verdict is reproducible and cites the exact rule.
        </p>
        <p className="text-[rgba(255,255,255,0.4)] text-sm mb-12">
          Built for Luxembourg AIFMs · AIFMD II · UCITS · DORA · CSSF-aligned
        </p>

        {/* Primary CTAs — lead with the real, no-signup product */}
        <div className="flex flex-col sm:flex-row flex-wrap items-center lg:justify-start justify-center gap-3 mb-8">
          <a href="/scan"
            className="group shimmer-sweep flex items-center justify-center gap-2 px-6 py-3.5 rounded-md text-sm uppercase tracking-[0.15em] font-black whitespace-nowrap transition-all hover:scale-[1.02]"
            style={{
              background: 'linear-gradient(135deg, #10D982 0%, #0B9E63 100%)',
              color: '#04130b',
              boxShadow: '0 1px 0 rgba(255,255,255,0.18) inset, 0 8px 24px rgba(16,217,130,0.16)',
            }}>
            <ScanLine className="w-4 h-4 shrink-0" />
            Scan a prospectus — live
            <ArrowRight className="w-4 h-4 shrink-0 group-hover:translate-x-1 transition-transform" />
          </a>
          <a href="/shadow"
            className="group flex items-center justify-center gap-2 px-6 py-3.5 rounded-md text-sm uppercase tracking-[0.15em] font-bold whitespace-nowrap transition-all"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.18)',
              color: 'rgba(255,255,255,0.9)',
              backdropFilter: 'blur(12px)',
            }}>
            See Shadow Mode
            <ArrowRight className="w-4 h-4 shrink-0 group-hover:translate-x-1 transition-transform" />
          </a>
        </div>

        {/* Feature row — every real product surface, directly reachable */}
        <div className="flex flex-wrap items-center lg:justify-start justify-center gap-2 text-[10px] uppercase tracking-[0.15em] font-bold">
          {FEATURE_CHIPS.map(({ href, label, Icon, emphasis }) => {
            // Disciplined two-tone: emerald for the headline surfaces, the cool
            // secondary for everything else. No rainbow.
            const tone = emphasis ? '#10D982' : '#5B8DEF'
            return (
              <a
                key={href}
                href={href}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full transition-all hover:scale-[1.03]"
                style={{
                  background: hexToRgba(tone, 0.1),
                  border: `1px solid ${hexToRgba(tone, 0.4)}`,
                  color: tone,
                }}
              >
                <Icon className="w-3 h-3" aria-hidden="true" />
                {label}
              </a>
            )
          })}
        </div>
        </div>{/* /LEFT */}

        {/* RIGHT — the product, judging a prospectus live */}
        <div className="lg:col-span-5 w-full">
          <LiveScanHero />

          {/* Honest signal — what's actually true, not vanity metrics */}
          <div className="grid grid-cols-2 gap-3 mt-4">
          {[
            { value: 'Instant', label: 'in-browser verdict' },
            { value: 'No LLM',  label: 'fully deterministic' },
            { value: 'SHA-256', label: 'every verdict sealed' },
            { value: 'Source',  label: 'available on GitHub' },
          ].map(({ value, label }) => (
            <TiltCard key={label}
              className="rounded-2xl px-4 py-6 text-center card-hover"
              style={{ background: 'rgba(14,16,20,0.7)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}>
              <div className="font-black tracking-tight text-white" style={{ fontSize: 'clamp(1.15rem, 2.2vw, 1.75rem)' }}>{value}</div>
              <div className="text-[9.5px] uppercase tracking-[0.18em] text-[rgba(255,255,255,0.55)] mt-1.5">{label}</div>
            </TiltCard>
          ))}
          </div>
        </div>{/* /RIGHT */}
      </div>{/* /grid */}

      {/* Regulator badges — full-width strip under the split */}
      <div className="relative max-w-5xl mx-auto flex items-center justify-center gap-x-6 gap-y-2 mt-14 flex-wrap text-[10px] uppercase tracking-[0.18em]">
        <span className="text-[rgba(255,255,255,0.4)]">ALIGNED WITH</span>
        {['AIFMD II', 'DORA', 'SFDR', 'UCITS V', 'CSSF', 'FATF R.10'].map(r => (
          <div key={r} className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-[#10D982]" />
            <span className="text-[rgba(255,255,255,0.6)]">{r}</span>
          </div>
        ))}
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
  return (
    <section id="problem" data-reveal className="relative py-20 md:py-32 px-6 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center top, rgba(242,86,110,0.06) 0%, transparent 60%)' }} />

      <div className="relative max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#F2566E] mb-4 font-bold">
            // WHY NOW
          </div>
          <h2 className="font-black tracking-tight text-white" style={{ fontSize: 'clamp(2rem, 4.5vw, 3.5rem)' }}>
            The rules are already
            <br />
            <span className="text-[#F2566E]" style={{ textShadow: '0 0 40px rgba(242,86,110,0.4)' }}>
              in force.
            </span>
          </h2>
          <p className="text-[rgba(255,255,255,0.5)] max-w-2xl mx-auto mt-6 text-base leading-relaxed">
            DORA has applied since January 2025 and AIFMD II since April 2026, with reporting under
            the new ESMA templates landing in 2027. Most funds still rely on manual quarterly audits —
            a regulatory model designed for the 1990s.
          </p>
        </div>

        {/* 3 problem cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { Icon: AlertOctagon, t: 'Audited once a quarter', d: 'Manual quarterly reviews leave a fund unverified for months — a prospectus can drift out of line with no one checking.', c: '#F2566E' },
            { Icon: FileText,     t: 'Named CSSF priority', d: 'DORA makes ICT third-party register and oversight gaps a supervisory focus — with administrative penalties and named management accountability.', c: '#F5A524' },
            { Icon: Lock,         t: '0 board-level visibility', d: 'Most CIOs cannot answer "are we compliant right now?" in real time.',          c: '#5B8DEF' },
          ].map(({ Icon, t, d, c }) => (
            <TiltCard key={t} max={5}
              className="rounded-xl p-6 card-hover"
              style={{
                background: 'rgba(14,16,20,0.7)',
                border: '1px solid rgba(255,255,255,0.08)',
                backdropFilter: 'blur(12px)',
              }}>
              <Icon className="w-7 h-7 mb-4" style={{ color: c, filter: `drop-shadow(0 0 6px ${c}88)` }} />
              <div className="text-lg font-bold text-white mb-2">{t}</div>
              <p className="text-sm leading-relaxed" style={{ color: '#A6AEB6' }}>{d}</p>
            </TiltCard>
          ))}
        </div>
      </div>
    </section>
  )
}

// Solution — 3 step "how it works"
function Solution() {
  const steps = [
    { n: '01', Icon: Cpu, t: 'Bring a document', d: 'Paste an LEI, drop a prospectus PDF, or paste the text. ProvenLex reads it in your browser — nothing is uploaded, no account needed.', accent: '#10D982' },
    { n: '02', Icon: GitBranch, t: 'Checked against the rule', d: 'Each declared limit is tested against the document’s own caps and the AIFMD II statutory caps — plain arithmetic, instant, no LLM in the decision path.', accent: '#5B8DEF' },
    { n: '03', Icon: Shield, t: 'Tamper-evident audit trail', d: 'Every verdict is hashed into a tamper-evident chain — a CSSF-grade evidence trail you can export as a PDF the moment a regulator asks.', accent: '#F5A524' },
  ]
  return (
    <section id="solution" data-reveal className="relative py-20 md:py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-20">
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#10D982] mb-4 font-bold">
            // HOW PROVENLEX WORKS
          </div>
          <h2 className="font-black tracking-tight text-white" style={{ fontSize: 'clamp(2rem, 4.5vw, 3.5rem)' }}>
            From prospectus to compliance proof
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #10D982 0%, #5B8DEF 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>in under a second.</span>
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
          <a href="/scan"
            className="inline-flex items-center gap-2 text-sm uppercase tracking-[0.15em] font-bold text-[#10D982] hover:gap-3 transition-all">
            Run a live compliance scan <ArrowRight className="w-4 h-4" />
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
  const hours = Math.round(aum * 24)

  return (
    <section data-reveal className="relative py-20 md:py-32 px-6">
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, rgba(16,217,130,0.04) 0%, transparent 70%)' }} />

      <div className="relative max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#10D982] mb-4 font-bold">// ILLUSTRATIVE SAVINGS ESTIMATE</div>
          <h2 className="font-black tracking-tight text-white" style={{ fontSize: 'clamp(2rem, 4.5vw, 3.5rem)' }}>
            What ProvenLex could save
            <br />
            <span className="text-[#10D982]" style={{ textShadow: '0 0 30px rgba(16,217,130,0.4)' }}>
              a fund your size.
            </span>
          </h2>
        </div>

        <div className="rounded-2xl p-8 md:p-12"
          style={{
            background: 'linear-gradient(135deg, rgba(16,217,130,0.04) 0%, rgba(91,141,239,0.03) 100%)',
            border: '1px solid rgba(16,217,130,0.18)',
            boxShadow: '0 0 60px rgba(16,217,130,0.06), inset 0 0 80px rgba(16,217,130,0.02)',
          }}>

          <div className="mb-10">
            <div className="flex items-end justify-between mb-3">
              <label className="text-[11px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.5)] font-bold">Your AUM</label>
              <div className="font-black tabular-nums text-white text-4xl md:text-5xl">
                €{aum >= 1000 ? `${(aum / 1000).toFixed(1)}B` : `${aum}M`}
              </div>
            </div>
            <input type="range"
              aria-label="Adjust assets under management (€)"
              min="50" max={sliderMax} step="50"
              value={aum}
              onChange={e => setAum(Number(e.target.value))}
              className="w-full"
              style={{
                accentColor: '#10D982',
                height: 6,
              }} />
            <div className="flex justify-between text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.3)] mt-2">
              <span>€50M</span><span>€1B</span><span>€2.5B</span><span>€5B+</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="text-center p-6 rounded-xl"
              style={{ background: 'rgba(16,217,130,0.05)', border: '1px solid rgba(16,217,130,0.2)' }}>
              <div className="text-[9px] uppercase tracking-[0.2em] text-[rgba(16,217,130,0.6)] font-bold mb-2">Annual Savings</div>
              <div className="font-black tabular-nums text-[#10D982] text-3xl md:text-4xl"
                style={{ textShadow: '0 0 12px rgba(16,217,130,0.3)' }}>
                €{annualSavings.toLocaleString()}
              </div>
              <div className="text-[10px] text-[rgba(255,255,255,0.4)] mt-1">vs manual quarterly audit</div>
            </div>
            <div className="text-center p-6 rounded-xl"
              style={{ background: 'rgba(91,141,239,0.05)', border: '1px solid rgba(91,141,239,0.2)' }}>
              <div className="text-[9px] uppercase tracking-[0.2em] text-[rgba(91,141,239,0.6)] font-bold mb-2">Hours Saved</div>
              <div className="font-black tabular-nums text-[#5B8DEF] text-3xl md:text-4xl"
                style={{ textShadow: '0 0 12px rgba(91,141,239,0.3)' }}>
                {hours.toLocaleString()}
              </div>
              <div className="text-[10px] text-[rgba(255,255,255,0.4)] mt-1">compliance team workload</div>
            </div>
          </div>

          <p className="mt-8 text-center text-[11px] text-[rgba(255,255,255,0.4)] max-w-2xl mx-auto leading-relaxed">
            Illustrative only — derived from published industry averages (manual-audit cost,
            CSSF / DORA fine baselines). Not a quote, not a guarantee, and not based on your fund's data.
          </p>
          <div className="mt-5 text-center">
            <a href="/trial"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-md text-sm uppercase tracking-[0.15em] font-black"
              style={{
                background: 'linear-gradient(135deg, #10D982 0%, #0B9E63 100%)',
                color: '#000',
                boxShadow: '0 0 24px rgba(16,217,130,0.4)',
              }}>
              Request a pilot <ArrowRight className="w-4 h-4" />
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
      cta: 'Request a pilot',
      ctaHref: '/trial?tier=starter',
      featured: false,
      features: [
        '1 fund',
        'Save, seal & monitor every scan',
        'AIFMD II + UCITS gap analysis',
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
      cta: 'Request a pilot',
      ctaHref: '/trial?tier=pro',
      featured: true,
      features: [
        'Up to 25 funds',
        'Continuous monitoring + regression alerts',
        'AIFMD II + UCITS + DORA + SFDR references',
        'OFAC + EU + UN sanctions screening',
        'PDF report + Merkle-anchored proof',
        'Slack + email support',
        'API + webhook access',
        'Full citation + provenance on every finding',
      ],
    },
    {
      name: 'Enterprise',
      price: null,
      period: '',
      tagline: 'For institutional AIFMs, large UCITS umbrella structures',
      cta: 'Get in touch',
      ctaHref: '/trial?tier=enterprise',
      featured: false,
      features: [
        'Unlimited funds',
        'On-premise / self-hosted deployment',
        'Custom regulatory rule engine',
        'Real-time CSSF + ECB feed integration',
        'White-label boardroom dashboards',
        'Priority support + dedicated contact',
        'Custom uptime SLA',
        'Independent penetration test + security review',
      ],
    },
  ]

  return (
    <section id="pricing" data-reveal className="relative py-20 md:py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#10D982] mb-4 font-bold">// PRICING · INDICATIVE</div>
          <h2 className="font-black tracking-tight text-white" style={{ fontSize: 'clamp(2rem, 4.5vw, 3.5rem)' }}>
            Indicative pricing
            <br />
            <span className="text-[rgba(255,255,255,0.4)]">for general availability.</span>
          </h2>
          <p className="text-[rgba(255,255,255,0.55)] mt-6 max-w-xl mx-auto">
            ProvenLex is onboarding a small number of design partners right now — those
            pilots are <span className="text-white">free</span>. The tiers below are indicative
            for when it's generally available; some features are on the roadmap.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {tiers.map(t => (
            <div key={t.name}
              className={`relative rounded-2xl p-7 flex flex-col${t.featured ? '' : ' card-hover'}`}
              style={{
                background: t.featured
                  ? 'linear-gradient(180deg, rgba(16,217,130,0.06) 0%, rgba(16,217,130,0.02) 100%)'
                  : 'rgba(14,16,20,0.7)',
                border: t.featured ? '1px solid rgba(16,217,130,0.4)' : '1px solid rgba(255,255,255,0.08)',
                boxShadow: t.featured ? '0 0 50px rgba(16,217,130,0.12), inset 0 0 60px rgba(16,217,130,0.04)' : 'none',
                backdropFilter: 'blur(12px)',
                transform: t.featured ? 'scale(1.03)' : 'scale(1)',
              }}>
              {t.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em]"
                  style={{
                    background: 'linear-gradient(135deg, #10D982 0%, #0B9E63 100%)',
                    color: '#000',
                    boxShadow: '0 0 16px rgba(16,217,130,0.5)',
                  }}>
                  Most Popular
                </div>
              )}
              <div className="mb-6">
                <div className="text-sm font-black uppercase tracking-[0.2em] mb-2"
                  style={{ color: t.featured ? '#10D982' : 'rgba(255,255,255,0.6)' }}>
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
                <p className="text-[12px] text-[#93A1AD] leading-snug">{t.tagline}</p>
              </div>

              <ul className="space-y-2.5 mb-8 flex-1">
                {t.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-[12px] text-[rgba(255,255,255,0.7)]">
                    <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
                      style={{ color: t.featured ? '#10D982' : 'rgba(255,255,255,0.4)' }} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <a href={t.ctaHref}
                className="block text-center py-3 rounded-md text-[11px] uppercase tracking-[0.15em] font-black transition-all"
                style={t.featured ? {
                  background: 'linear-gradient(135deg, #10D982 0%, #0B9E63 100%)',
                  color: '#000',
                  boxShadow: '0 0 24px rgba(16,217,130,0.35)',
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
          style={{ background: 'radial-gradient(circle, #10D982 0%, transparent 60%)', filter: 'blur(100px)' }} />
      </div>

      <div className="relative max-w-3xl mx-auto text-center">
        <h2 className="font-black tracking-tight text-white mb-6"
          style={{ fontSize: 'clamp(2.25rem, 5vw, 4rem)' }}>
          Catch it before
          <br />
          <span style={{
            background: 'linear-gradient(90deg, #F2566E 0%, #F5A524 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>the regulator does.</span>
        </h2>
        <p className="text-[rgba(255,255,255,0.6)] text-base md:text-lg mb-10 max-w-2xl mx-auto leading-relaxed">
          ProvenLex catches what manual quarterly audits miss — including a prospectus that
          permits more leverage than AIFMD&nbsp;II allows. Try the live scanner free: no account,
          nothing uploaded, every verdict reproducible and cited to the rule.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a href="/trial"
            className="group flex items-center gap-2 px-8 py-4 rounded-md text-sm uppercase tracking-[0.15em] font-black transition-all"
            style={{
              background: 'linear-gradient(135deg, #10D982 0%, #0B9E63 100%)',
              color: '#04130b',
              boxShadow: '0 1px 0 rgba(255,255,255,0.18) inset, 0 10px 30px rgba(16,217,130,0.18)',
            }}>
            Request a pilot <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </a>
          <a href="/scan"
            className="flex items-center gap-2 px-8 py-4 rounded-md text-sm uppercase tracking-[0.15em] font-bold transition-all"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.85)',
            }}>
            Run a live scan
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
                style={{ background: 'linear-gradient(135deg, #10D982 0%, #0B9E63 100%)' }}>
                <Sparkles className="w-4 h-4 text-black" />
              </div>
              <span className="text-sm font-black tracking-[0.15em] text-white">PROVENLEX</span>
            </div>
            <p className="text-[12px] text-[rgba(255,255,255,0.4)] max-w-sm leading-relaxed">
              Deterministic compliance tooling for Luxembourg AIFMs — AIFMD II, DORA, SFDR.
              No LLM in the decision path; every verdict is reproducible and re-verifiable.
              Source-available, built solo.
            </p>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] font-bold mb-3">Product</div>
            <ul className="space-y-2 text-[12px] text-[rgba(255,255,255,0.7)]">
              <li><a href="/scan" className="hover:text-white font-bold text-white">Run a Scan →</a></li>
              <li><a href="/shadow" className="hover:text-white">Shadow Mode</a></li>
              <li><a href="/vault" className="hover:text-white">Evidence Vault</a></li>
              <li><a href="/screening" className="hover:text-white">Sanctions Screening</a></li>
              <li><a href="/token-screen" className="hover:text-white">RWA Token Compliance</a></li>
              <li><a href="/intelligence" className="hover:text-white">Intelligence Feed</a></li>
            </ul>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] font-bold mb-3">Developers</div>
            <ul className="space-y-2 text-[12px] text-[rgba(255,255,255,0.7)]">
              <li><a href="/ruleset" className="hover:text-white">Ruleset Spec</a></li>
              <li><a href="/docs" className="hover:text-white">API Docs</a></li>
              <li><a href="/extension" className="hover:text-white">Chrome Extension</a></li>
              <li><a href="/status" className="hover:text-white">System Status</a></li>
            </ul>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] font-bold mb-3">Company</div>
            <ul className="space-y-2 text-[12px] text-[rgba(255,255,255,0.7)]">
              <li><a href="/about" className="hover:text-white">About</a></li>
              <li><a href="/research" className="hover:text-white">Research</a></li>
              <li><a href="#pricing" className="hover:text-white">Pricing</a></li>
              <li><a href="/trial" className="hover:text-white">Start Trial</a></li>
              <li><a href="/privacy" className="hover:text-white">Privacy</a></li>
              <li><a href="mailto:daman.sharma.2310@gmail.com" className="hover:text-white">Contact</a></li>
            </ul>
          </div>
        </div>
        <div className="pt-6 border-t border-[rgba(255,255,255,0.04)] flex items-center justify-between flex-wrap gap-3 text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.3)]">
          <div>© 2026 ProvenLex · Luxembourg RegTech</div>
          <div className="flex gap-4">
            <span>CSSF-aligned</span>
            <span>·</span>
            <span>SOC 2 Type II planned</span>
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
      background: 'transparent',
      fontFamily: 'var(--font-geist-sans), system-ui, -apple-system, "Segoe UI", sans-serif',
      textTransform: 'none',
      letterSpacing: 'normal',
    }}>
      <CosmicBackground variant="void" accent="#10D982" />
      <CinematicFx />
      <Nav />
      <Hero />
      <ComplianceWall />
      <Problem />
      <Solution />
      <ROICalculator />
      <Pricing />
      <FinalCTA />
      <Footer />
    </div>
  )
}
