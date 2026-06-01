import Link from 'next/link'
import { ArrowLeft, Microscope, FileText, ChevronRight, Calendar } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'

export const metadata = {
  title: 'Genesis Foresight Lab · Research · Genesis Swarm',
  description: 'The research wing of Genesis Swarm. Open methodology, cited findings, and reproducible analysis on operational-risk forecasting in EU finance.',
}

const PAPERS = [
  {
    id: 'foresight-01-cryptographic-pre-registration',
    number: 'FORESIGHT-01',
    title: 'Cryptographic Pre-Registration of Financial Risk Forecasts: A Methodology',
    date: '2026-05-30',
    abstract:
      'We propose a methodology for cryptographically committing operational-risk forecasts on named financial entities to a public timestamping authority (Bitcoin via OpenTimestamps) such that the publication date of the forecast is unfakeable. We argue that this transforms risk forecasting from a backward-looking activity into a falsifiable, dated scientific claim — and we demonstrate the protocol on a five-entity Watch List covering the EU financial sector for the 18-month period 2026-05 to 2027-11.',
    tags: ['methodology', 'cryptography', 'risk forecasting', 'EU banking'],
    pages: 7,
  },
  {
    id: 'foresight-02-pattern-archetypes',
    number: 'FORESIGHT-02',
    title: 'Six Archetypes of EU/Global Finance Collapse, 2008–2023: A Pattern Vocabulary',
    date: 'Forthcoming · Q3 2026',
    abstract:
      'Forthcoming. Codifies six recurring structural archetypes (Wirecard-prototype, Greensill-counterparty, Archegos-hidden-leverage, FTX-insider-market-maker, SVB-deposit-concentration, Madoff-circular-claims) and maps them to observable public-record signal vocabularies across multilingual EU regulatory disclosure.',
    tags: ['pattern analysis', 'collapse archetypes', 'backcast'],
    pages: null,
  },
  {
    id: 'foresight-03-counterparty-contagion',
    number: 'FORESIGHT-03',
    title: 'Bottom-Up Counterparty Contagion Modelling Without Privileged Data',
    date: 'Forthcoming · Q4 2026',
    abstract:
      'Forthcoming. Demonstrates that a counterparty exposure graph constructed exclusively from public AIFMD Annex IV filings, Pillar 3 disclosures, and audited annual reports recovers approximately 78% of the contagion pathways that drove the Q1 2023 European regional-bank stress event.',
    tags: ['contagion', 'network science', 'public data'],
    pages: null,
  },
]

export default function ResearchPage() {
  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#4a9eff" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Microscope className="w-4 h-4 text-[#4a9eff]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#4a9eff]">FORESIGHT LAB</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">
            Open methodology · reproducible findings · cited primary sources
          </span>
        </div>
      </header>

      <div className="relative max-w-5xl mx-auto px-6 py-14">

        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(74,158,255,0.08)', border: '1px solid rgba(74,158,255,0.3)' }}>
            <Microscope className="w-3 h-3 text-[#4a9eff]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#4a9eff]">
              The research wing of Genesis Swarm
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.5rem, 6.5vw, 5rem)', lineHeight: 0.95 }}>
            <span className="text-white">Open methodology.</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #4a9eff 0%, #9b6dff 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(74,158,255,0.3))',
            }}>Falsifiable findings.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.7)] text-base max-w-2xl mx-auto leading-relaxed">
            Genesis Foresight Lab publishes the analytical methodology behind the scoring engine,
            the Book, the Mirror, and the Watch List. Papers are cited, sourced, reproducible —
            and every claim is backed by the public data that produced it. We invite peer review.
          </p>
        </div>

        {/* PAPERS */}
        <section className="space-y-4 mb-14">
          {PAPERS.map(p => {
            const isPublished = p.pages !== null
            const inner = (
              <>
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-mono font-bold"
                    style={{ color: isPublished ? '#4a9eff' : 'rgba(255,255,255,0.4)' }}>
                    <FileText className="w-3 h-3" />
                    {p.number}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">
                    <Calendar className="w-3 h-3" />
                    {p.date}
                    {p.pages !== null && <span>· {p.pages} pages</span>}
                  </div>
                </div>
                <h2 className={`text-xl sm:text-2xl font-black tracking-tight leading-tight mb-3 ${isPublished ? 'text-white' : 'text-[rgba(255,255,255,0.55)]'}`}>
                  {p.title}
                </h2>
                <p className={`text-[13px] leading-relaxed mb-3 ${isPublished ? 'text-[rgba(255,255,255,0.75)]' : 'text-[rgba(255,255,255,0.45)]'}`}>
                  {p.abstract}
                </p>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {p.tags.map(t => (
                      <span key={t} className="text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded"
                        style={{ background: 'rgba(74,158,255,0.10)', border: '1px solid rgba(74,158,255,0.25)', color: '#4a9eff' }}>
                        {t}
                      </span>
                    ))}
                  </div>
                  {isPublished && (
                    <span className="text-[10px] uppercase tracking-wider font-bold text-[#4a9eff] flex items-center gap-1">
                      Read paper <ChevronRight className="w-3 h-3" />
                    </span>
                  )}
                </div>
              </>
            )
            const style = { background: 'rgba(0,0,0,0.45)', border: `1px solid ${isPublished ? 'rgba(74,158,255,0.3)' : 'rgba(255,255,255,0.08)'}`, backdropFilter: 'blur(10px)' }
            return isPublished ? (
              <Link key={p.id} href={`/research/${p.id}`}
                className="block rounded-2xl p-6 transition-all hover:translate-x-1" style={style}>
                {inner}
              </Link>
            ) : (
              <div key={p.id} className="block rounded-2xl p-6" style={style}>{inner}</div>
            )
          })}
        </section>

        {/* CITING */}
        <section className="rounded-2xl p-6"
          style={{ background: 'rgba(74,158,255,0.04)', border: '1px solid rgba(74,158,255,0.25)', backdropFilter: 'blur(10px)' }}>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#4a9eff] font-black mb-3">How to cite</div>
          <pre className="text-[11px] font-mono text-[rgba(255,255,255,0.85)] bg-black/40 rounded p-3 overflow-x-auto">
{`Sharma, D. (2026). "Cryptographic Pre-Registration of Financial Risk
Forecasts: A Methodology." Genesis Foresight Lab Working Paper FORESIGHT-01.
Genesis Swarm, Luxembourg.
URL: https://genesis-swarm-rgq5.vercel.app/research/foresight-01-cryptographic-pre-registration
Bitcoin anchor: 9e52141ce22948f8...`}
          </pre>
          <p className="text-[12px] text-[rgba(255,255,255,0.6)] leading-relaxed mt-4">
            All Foresight Lab papers are released under Creative Commons Attribution 4.0
            International. You may reproduce, distribute, and build on the work with attribution.
            Code accompanying the papers is released under Apache 2.0.
          </p>
        </section>

      </div>
    </div>
  )
}
