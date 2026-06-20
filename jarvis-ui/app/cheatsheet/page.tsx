'use client'

// Free inbound magnet — the AIFMD II quantitative limits on one page, each with a
// live pass/fail calculator and its real regulatory citation. Reuses the engine's
// actual STATUTORY constants and AIFMD_CITATIONS — nothing here is invented.
// Shareable: drop the URL in a post/comment; it links into /scan and /shadow.

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { ScanLine, ArrowRight, CheckCircle2, XCircle, Scale, ShieldCheck, PieChart, Sparkles } from 'lucide-react'
import { STATUTORY } from '@/lib/scan-engine'
import { AIFMD_CITATIONS } from '@/lib/lux-citations'

const CosmicBackground = dynamic(() => import('@/components/CosmicBackground'), { ssr: false })

const ACCENT = '#00e08a'
const PASS = '#00e08a'
const FAIL = '#ff3b6b'

function num(v: string): number | null {
  if (v.trim() === '') return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

function Verdict({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="text-[11px] text-[rgba(255,255,255,0.35)]">enter a value</span>
  const c = ok ? PASS : FAIL
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-black" style={{ color: c }}>
      {ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {ok ? 'WITHIN LIMIT' : 'BREACH'}
    </span>
  )
}

function Card({
  icon: Icon, title, limitLabel, citation, children,
}: {
  icon: any; title: string; limitLabel: string; citation: { framework: string; basis: string; formula: string; source: string }; children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl p-5 md:p-6"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)' }}>
      <div className="flex items-center gap-2.5 mb-1">
        <Icon className="w-4 h-4" style={{ color: ACCENT }} />
        <h2 className="text-[15px] font-black text-white">{title}</h2>
      </div>
      <div className="text-[12px] font-bold mb-4" style={{ color: ACCENT }}>{limitLabel}</div>
      {children}
      <div className="mt-4 pt-3 border-t border-[rgba(255,255,255,0.07)]">
        <div className="text-[11px] font-bold text-white">{citation.framework}</div>
        <div className="text-[11px] text-[rgba(255,255,255,0.5)] mt-0.5 leading-snug">{citation.basis}</div>
        <div className="text-[10px] font-mono text-[rgba(255,255,255,0.4)] mt-1">formula: {citation.formula}</div>
        <a href={citation.source} target="_blank" rel="noopener noreferrer"
          className="text-[10px] font-mono mt-0.5 inline-block hover:underline" style={{ color: ACCENT }}>
          {citation.source}
        </a>
      </div>
    </section>
  )
}

const inputCls = 'w-24 rounded-md px-2 py-1.5 font-mono text-[13px] text-white'
const inputStyle = { background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)' } as const

export default function CheatSheetPage() {
  const [lev, setLev] = useState('')
  const [closed, setClosed] = useState(false)
  const [ret, setRet] = useState('')
  const [conc, setConc] = useState('')

  const levCap = closed ? STATUTORY.LEVERAGE_CAP_CLOSED_PCT : STATUTORY.LEVERAGE_CAP_OPEN_PCT
  const levVal = num(lev)
  const levOk = levVal === null ? null : levVal <= levCap

  const retVal = num(ret)
  const retOk = retVal === null ? null : retVal >= STATUTORY.MIN_RETENTION_PCT

  const concVal = num(conc)
  const concOk = concVal === null ? null : concVal <= STATUTORY.SINGLE_ISSUER_CONCENTRATION_PCT

  return (
    <div className="min-h-screen text-white" style={{ fontFamily: 'var(--font-geist-sans), system-ui, -apple-system, sans-serif', textTransform: 'none', letterSpacing: 'normal' }}>
      <CosmicBackground variant="calm" accent={ACCENT} />

      <nav className="relative z-10 flex items-center justify-between px-5 md:px-8 py-4 border-b border-[rgba(255,255,255,0.06)]">
        <a href="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, #00a866)`, boxShadow: `0 0 18px ${ACCENT}88` }}>
            <Sparkles className="w-4 h-4 text-black" />
          </div>
          <span className="text-sm font-black tracking-[0.15em]">PROVENLEX</span>
        </a>
        <div className="flex items-center gap-4 text-[11px] uppercase tracking-[0.15em] font-bold text-[rgba(255,255,255,0.6)]">
          <a href="/scan" className="hover:text-white">Live Scan</a>
          <a href="/shadow" className="hover:text-white hidden sm:inline">Shadow Mode</a>
        </div>
      </nav>

      <div className="relative z-10 max-w-3xl mx-auto px-5 md:px-8 py-10 md:py-16">
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] font-bold mb-4" style={{ color: ACCENT }}>
            <Scale className="w-3.5 h-3.5" /> Free reference
          </div>
          <h1 className="font-black tracking-tight leading-[1.05]" style={{ fontSize: 'clamp(1.9rem, 5vw, 3.2rem)' }}>
            AIFMD II, in the numbers that <span style={{ color: ACCENT }}>actually bind</span>.
          </h1>
          <p className="text-[rgba(255,255,255,0.55)] max-w-2xl mt-5 leading-relaxed">
            The quantitative limits a loan-originating AIF is measured against — each with the rule behind it and a
            live check. Type your figure; see pass or breach instantly. Same constants the
            <a href="/scan" className="underline mx-1" style={{ color: ACCENT }}>deterministic scanner</a>
            uses, nothing invented.
          </p>
        </div>

        <div className="space-y-5">
          <Card icon={Scale} title="Leverage cap" citation={AIFMD_CITATIONS.LEVERAGE_CAP}
            limitLabel={`≤ ${STATUTORY.LEVERAGE_CAP_OPEN_PCT}% open-ended · ≤ ${STATUTORY.LEVERAGE_CAP_CLOSED_PCT}% closed-ended (commitment method)`}>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[12px] text-[rgba(255,255,255,0.6)]">Your leverage</span>
              <input className={inputCls} style={inputStyle} value={lev} onChange={e => setLev(e.target.value)} placeholder="200" inputMode="decimal" />
              <span className="text-[12px] text-[rgba(255,255,255,0.6)]">%</span>
              <button onClick={() => setClosed(c => !c)}
                className="text-[11px] uppercase tracking-wider font-bold px-3 py-1.5 rounded-md"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)' }}>
                {closed ? 'closed-ended' : 'open-ended'} · cap {levCap}%
              </button>
              <Verdict ok={levOk} />
            </div>
          </Card>

          <Card icon={ShieldCheck} title="Risk retention" citation={AIFMD_CITATIONS.LOAN_RETENTION_5PCT}
            limitLabel={`≥ ${STATUTORY.MIN_RETENTION_PCT}% of each originated loan's notional`}>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[12px] text-[rgba(255,255,255,0.6)]">Your retention</span>
              <input className={inputCls} style={inputStyle} value={ret} onChange={e => setRet(e.target.value)} placeholder="3" inputMode="decimal" />
              <span className="text-[12px] text-[rgba(255,255,255,0.6)]">%</span>
              <Verdict ok={retOk} />
            </div>
          </Card>

          <Card icon={PieChart} title="Single-borrower concentration" citation={AIFMD_CITATIONS.SINGLE_FI_CONCENTRATION_20PCT}
            limitLabel={`≤ ${STATUTORY.SINGLE_ISSUER_CONCENTRATION_PCT}% to one borrower that is a financial undertaking / AIF / UCITS`}>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[12px] text-[rgba(255,255,255,0.6)]">Largest exposure</span>
              <input className={inputCls} style={inputStyle} value={conc} onChange={e => setConc(e.target.value)} placeholder="24" inputMode="decimal" />
              <span className="text-[12px] text-[rgba(255,255,255,0.6)]">% of NAV</span>
              <Verdict ok={concOk} />
            </div>
          </Card>
        </div>

        <div className="mt-7 text-[11px] text-[rgba(255,255,255,0.4)] leading-relaxed">
          Framework-level reference for loan-originating AIFs under AIFMD II (Directive (EU) 2024/927) — not legal
          advice. Always verify against the instrument itself; the linked source is the official portal.
        </div>

        <div className="mt-10 rounded-2xl p-6 md:p-8 text-center"
          style={{ background: `linear-gradient(135deg, ${ACCENT}1a, rgba(0,168,102,0.1))`, border: `1px solid ${ACCENT}44` }}>
          <h3 className="text-xl md:text-2xl font-black mb-2">These are three numbers. A prospectus has hundreds.</h3>
          <p className="text-[rgba(255,255,255,0.55)] text-sm mb-5 max-w-xl mx-auto">
            Run the full deterministic check on your actual document — every limit, every holding, sealed and
            reproducible, in your browser. Nothing uploaded.
          </p>
          <a href="/scan" className="inline-flex items-center gap-2 px-6 py-3 rounded-md text-sm uppercase tracking-[0.12em] font-black"
            style={{ background: ACCENT, color: '#000', boxShadow: `0 0 24px ${ACCENT}66` }}>
            <ScanLine className="w-4 h-4" /> Scan a prospectus <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  )
}
