import Link from 'next/link'
import { ArrowLeft, Download, Mail, Sparkles, Copy } from 'lucide-react'

const ONE_LINERS = [
  'The AI immune system for European funds.',
  '11 autonomous compliance bots. 340ms detection. PBFT consensus. Merkle-anchored audit trail.',
  'AIFMD II + DORA + SFDR + UCITS + CSSF compliance, automated.',
  'A 60-minute audit pack instead of 6 weeks of evidence gathering.',
  'AI legal opinions for €99 instead of €3,000.',
  'Built by a 16-year-old in Luxembourg. €14.78B in AUM under protection.',
]

const FACTS = [
  { k: 'Founded',            v: '2026' },
  { k: 'HQ',                 v: 'Luxembourg' },
  { k: 'Founder',            v: 'Daman Sharma (Age 16)' },
  { k: 'AUM under protection', v: '€14.78B' },
  { k: 'OFAC entities indexed', v: '18,976' },
  { k: 'Detection latency',  v: '340ms (vs 48hr industry)' },
  { k: 'Regulatory coverage', v: 'AIFMD II · DORA · SFDR · UCITS · CSSF · FATF' },
  { k: 'Target exit',        v: '€50M by 2032' },
]

export default function PressPage() {
  return (
    <div className="min-h-screen text-white" style={{ background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)' }}>
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#00ff88]">PRESS KIT</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-14">

        <div className="mb-10">
          <h1 className="font-black tracking-tight mb-3" style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', lineHeight: 1 }}>
            Press kit.
          </h1>
          <p className="text-[rgba(255,255,255,0.55)] text-base max-w-2xl">
            Everything a journalist or analyst needs to write about Genesis Swarm.
            Logos, screenshots, one-liners, founder facts, contact. No NDA required.
          </p>
        </div>

        {/* Logo block */}
        <section className="mb-10">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#00ff88] font-black mb-3">LOGO</div>
          <div className="rounded-2xl p-8 flex items-center justify-center gap-6 flex-wrap"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #00ff88 0%, #00aa55 100%)', boxShadow: '0 0 20px rgba(0,255,136,0.5)' }}>
                <Sparkles className="w-8 h-8 text-black" />
              </div>
              <div>
                <div className="text-xl font-black tracking-[0.15em] text-white">GENESIS SWARM</div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-[#00ff88]">// REGTECH AI</div>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-[rgba(255,255,255,0.4)] mt-3 text-center">
            Full mark — primary palette. Available in light/dark, mono, badge formats. Email
            <a href="mailto:daman.sharma.2310@gmail.com" className="text-[#00ff88] hover:underline ml-1">daman.sharma.2310@gmail.com</a> for vector files.
          </p>
        </section>

        {/* One-liners */}
        <section className="mb-10">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#00ff88] font-black mb-3">PULL-QUOTE ONE-LINERS</div>
          <div className="space-y-2">
            {ONE_LINERS.map((line, i) => (
              <div key={i} className="rounded-lg p-4 flex items-start gap-3"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-[10px] uppercase tracking-widest text-[rgba(0,255,136,0.5)] font-bold mt-1 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                <p className="text-[14px] text-white flex-1">&ldquo;{line}&rdquo;</p>
              </div>
            ))}
          </div>
        </section>

        {/* Facts */}
        <section className="mb-10">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#00ff88] font-black mb-3">FAST FACTS</div>
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {FACTS.map((f, i) => (
              <div key={f.k} className="flex items-center gap-4 px-5 py-3"
                style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
                <span className="text-[10px] uppercase tracking-[0.18em] text-[rgba(255,255,255,0.45)] font-bold w-44 shrink-0">{f.k}</span>
                <span className="text-[13px] font-bold text-white">{f.v}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Boilerplate */}
        <section className="mb-10">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#00ff88] font-black mb-3">BOILERPLATE</div>
          <div className="rounded-2xl p-6"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[13px] text-[rgba(255,255,255,0.8)] leading-relaxed">
              Genesis Swarm is a RegTech AI platform built in Luxembourg that automates regulatory
              compliance for European fund managers. The platform runs 11 autonomous compliance bots
              under PBFT consensus, detecting financial crime in 340 milliseconds against the live US
              Treasury OFAC SDN list (18,976 entities), GLEIF Legal Entity Registry (2.4M+ records),
              and European Central Bank FX feeds. Genesis Swarm generates regulator-grade audit packs,
              AI legal memoranda, and cryptographically-signed compliance reports across AIFMD II, DORA,
              SFDR, UCITS, and CSSF requirements. The company was founded in 2026 by 16-year-old Daman
              Sharma. Pricing starts at €99/mo with a 14-day free trial.
            </p>
          </div>
        </section>

        {/* Screenshots */}
        <section className="mb-10">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#00ff88] font-black mb-3">SCREENSHOTS</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { name: 'Landing page', href: '/' },
              { name: 'Operator dashboard (3D globe)', href: '/operator' },
              { name: '60-Min Audit Pack', href: '/audit' },
              { name: 'AI Legal Opinion', href: '/opinion' },
              { name: 'Live Intelligence feed', href: '/intelligence' },
              { name: 'Case Study: Wirecard', href: '/case-studies/wirecard' },
            ].map(s => (
              <Link key={s.name} href={s.href} target="_blank"
                className="rounded-lg p-4 flex items-center justify-between"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-[12px] text-white">{s.name}</span>
                <span className="text-[10px] uppercase tracking-wider text-[#00ff88]">View →</span>
              </Link>
            ))}
          </div>
          <p className="text-[10px] text-[rgba(255,255,255,0.4)] mt-3 text-center">
            Open in browser to capture screenshots. Email <a href="mailto:daman.sharma.2310@gmail.com" className="text-[#00ff88]">daman.sharma.2310@gmail.com</a> for high-res PNGs.
          </p>
        </section>

        {/* Contact */}
        <section className="rounded-2xl p-8 text-center"
          style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.25)' }}>
          <Mail className="w-6 h-6 text-[#00ff88] mx-auto mb-2" />
          <h2 className="text-xl font-black text-white mb-1">Press inquiries</h2>
          <p className="text-[rgba(255,255,255,0.55)] text-[12px] mb-3">Daman Sharma — Founder</p>
          <a href="mailto:daman.sharma.2310@gmail.com"
            className="text-[14px] text-[#00ff88] font-mono hover:underline">
            daman.sharma.2310@gmail.com
          </a>
        </section>

      </div>
    </div>
  )
}
