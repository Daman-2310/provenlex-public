import Link from 'next/link'
import { ArrowLeft, Landmark, ShieldCheck } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'
import LuxConsole from './LuxConsole'

export const metadata = {
  title: 'Luxembourg RegTech Engines · Live · Genesis Swarm',
  description: 'Five institutional CSSF/AIFMD compliance engines you can run live in the browser — substance audit, cross-departmental reconciliation, AIFMD II pre-trade limits, CSSF e-ID validation, and delegation oversight.',
}

const FRAMEWORKS = [
  'CSSF Circular 24/856 — Substance',
  'AIFMD II (2026) — loan-originating AIFs',
  'CSSF e-Identification',
  'Circular CSSF 18/698 — Delegation Oversight',
  'eIDAS · ISO 17442 LEI',
]

export default function LuxPage() {
  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#9b6dff" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Landmark className="w-4 h-4 text-[#9b6dff]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#9b6dff]">LUXEMBOURG REGTECH</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">5 engines · runs in your browser</span>
        </div>
      </header>

      <div className="relative max-w-6xl mx-auto px-6 py-14">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(155,109,255,0.08)', border: '1px solid rgba(155,109,255,0.3)' }}>
            <ShieldCheck className="w-3 h-3 text-[#9b6dff]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#9b6dff]">See it work — no signup, no backend wait</span>
          </div>
          <h1 className="font-black tracking-tight mb-5" style={{ fontSize: 'clamp(2.2rem, 6vw, 4.5rem)', lineHeight: 0.95 }}>
            <span className="text-white">Five compliance engines,</span><br />
            <span style={{ background: 'linear-gradient(90deg, #9b6dff 0%, #00d8ff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 24px rgba(155,109,255,0.3))' }}>
              running live, right now.
            </span>
          </h1>
          <p className="text-[rgba(255,255,255,0.65)] text-base max-w-3xl mx-auto leading-relaxed">
            Built strictly to the Grand Duchy&apos;s highest-stakes frameworks. Every panel below executes
            the real engine logic in your browser — toggle the inputs and watch the verdicts change.
            The same logic runs as the production Python backend with a full PostgreSQL schema.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-6">
            {FRAMEWORKS.map(f => (
              <span key={f} className="text-[9px] uppercase tracking-wider px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(155,109,255,0.06)', border: '1px solid rgba(155,109,255,0.25)', color: 'rgba(255,255,255,0.6)' }}>
                {f}
              </span>
            ))}
          </div>
        </div>

        <LuxConsole />

        <section className="rounded-2xl p-6 mt-10"
          style={{ background: 'rgba(155,109,255,0.04)', border: '1px solid rgba(155,109,255,0.25)', backdropFilter: 'blur(10px)' }}>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#9b6dff] font-black mb-3">For investors</div>
          <p className="text-[13px] text-[rgba(255,255,255,0.75)] leading-relaxed mb-3">
            Most RegTech demos are screenshots. This is the actual rules engine — geofencing by
            point-in-polygon, reconciliation at 0.5% tolerance, AIFMD II leverage/retention/concentration
            maths, eIDAS pre-flight validation, and a tamper-evident SHA-256 oversight ledger — executing
            in front of you with no backend round-trip to fail.
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.55)] leading-relaxed">
            Production system of record: a modular Python/FastAPI backend (five microservice-splittable
            services) with full PostgreSQL DDL and hash-chained audit logs. This page is the in-browser
            mirror so the logic is always inspectable, live, on demand.
          </p>
        </section>
      </div>
    </div>
  )
}
