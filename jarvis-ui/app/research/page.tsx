import Link from 'next/link'
import { ArrowLeft, Microscope, FileText, ChevronRight, Calendar } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'

export const metadata = {
  title: 'ProvenLex Foresight Lab · Research · ProvenLex',
  description: 'The research wing of ProvenLex. Open methodology, cited findings, and reproducible analysis on operational-risk forecasting in EU finance.',
}

const PAPERS = [
  {
    id: 'note-03-the-number-that-misleads',
    number: 'NOTE-03',
    title: 'The Number That Misleads: How Real Prospectuses Disclose Leverage, and Why the Scariest Figure Means the Least',
    date: '2026-06-25',
    abstract:
      "Findings from running a deterministic extraction over seven real public Luxembourg prospectuses. Leverage method is disclosed well; but the most visible leverage number — gross/VaR leverage, sometimes 500% — is the one most likely to be misread as an AIFMD II breach, while the figure that maps to the cap is often absent. Loan-origination classification is the hinge that decides whether the limits apply at all, and the funds the rules target most are the least publicly transparent. Read leverage by method, not by percent sign.",
    tags: ['AIFMD II', 'leverage', 'disclosure', 'deterministic'],
    pages: 2,
  },
  {
    id: 'note-02-extraction-is-the-hard-part',
    number: 'NOTE-02',
    title: 'Extraction Is the Hard Part: Why Automated AIFMD II Checking Is Harder Than the AI Vendors Admit',
    date: '2026-06-20',
    abstract:
      "The AIFMD II quantitative limits are arithmetic; the hard part is getting the numbers out of a real prospectus. Findings from running a deterministic engine over real public Luxembourg prospectuses: the figures are present but rarely machine-readable (holding tables collapse on extraction), an LLM hides that wall by guessing — a silent, confident wrong 'compliant' — and naive matching over-flags as readily as naive extraction under-reads. The honest conclusion: good compliance tooling should sometimes refuse to answer.",
    tags: ['AIFMD II', 'extraction', 'deterministic', 'RegTech'],
    pages: 2,
  },
  {
    id: 'report-01-aifmd2-readiness',
    number: 'REPORT-01',
    title: 'The 2027 AIFMD II Prospectus Readiness Report',
    date: '2026-06-14',
    abstract:
      'A practical, cited readiness guide for Luxembourg ManCos and AIFMs. What AIFMD II (Directive (EU) 2024/927) changed for fund prospectuses — the loan-origination leverage/retention/concentration limits, liquidity management tools, and the UCITS limits that still stand — plus a self-check you can run today and the deterministic, versioned method behind it. Written for smaller houses carrying the same obligation on a fraction of the budget.',
    tags: ['AIFMD II', 'readiness', 'prospectus', 'Luxembourg'],
    pages: 6,
  },
  {
    id: 'note-01-consistent-isnt-compliant',
    number: 'NOTE-01',
    title: "Consistent Isn't Compliant: Teaching Software to Read Fund Prospectuses",
    date: '2026-06-07',
    abstract:
      'A practitioner field note on building a deterministic AIFMD II prospectus checker — software that tests a fund prospectus against the law with no LLM in the decision path. Three findings: internal consistency and legal compliance are different questions; the same quantitative limit appears in many textual forms, so silent omission is the dangerous failure mode; and deterministic checking reaches quantitative breaches but not structural ones.',
    tags: ['methodology', 'AIFMD II', 'deterministic', 'RegTech'],
    pages: 2,
  },
]

export default function ResearchPage() {
  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#5B8DEF" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Microscope className="w-4 h-4 text-[#5B8DEF]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#5B8DEF]">FORESIGHT LAB</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">
            Open methodology · reproducible findings · cited primary sources
          </span>
        </div>
      </header>

      <div className="relative max-w-5xl mx-auto px-6 py-14">

        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(91,141,239,0.08)', border: '1px solid rgba(91,141,239,0.3)' }}>
            <Microscope className="w-3 h-3 text-[#5B8DEF]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#5B8DEF]">
              The research wing of ProvenLex
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.5rem, 6.5vw, 5rem)', lineHeight: 0.95 }}>
            <span className="text-white">Open methodology.</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #5B8DEF 0%, #5B8DEF 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(91,141,239,0.3))',
            }}>Falsifiable findings.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.7)] text-base max-w-2xl mx-auto leading-relaxed">
            Field notes on building a deterministic AIFMD&nbsp;II / UCITS prospectus checker —
            how the engine reads a fund document, where regex-and-arithmetic checking reaches,
            and where it honestly stops. Cited, sourced, reproducible. We invite peer review.
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
                    style={{ color: isPublished ? '#5B8DEF' : 'rgba(255,255,255,0.4)' }}>
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
                        style={{ background: 'rgba(91,141,239,0.10)', border: '1px solid rgba(91,141,239,0.25)', color: '#5B8DEF' }}>
                        {t}
                      </span>
                    ))}
                  </div>
                  {isPublished && (
                    <span className="text-[10px] uppercase tracking-wider font-bold text-[#5B8DEF] flex items-center gap-1">
                      Read paper <ChevronRight className="w-3 h-3" />
                    </span>
                  )}
                </div>
              </>
            )
            const style = { background: 'rgba(0,0,0,0.45)', border: `1px solid ${isPublished ? 'rgba(91,141,239,0.3)' : 'rgba(255,255,255,0.08)'}`, backdropFilter: 'blur(10px)' }
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
          style={{ background: 'rgba(91,141,239,0.04)', border: '1px solid rgba(91,141,239,0.25)', backdropFilter: 'blur(10px)' }}>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#5B8DEF] font-black mb-3">How to cite</div>
          <pre className="text-[11px] font-mono text-[rgba(255,255,255,0.85)] bg-black/40 rounded p-3 overflow-x-auto">
{`Sharma, D. (2026). "Consistent Isn't Compliant: Teaching Software to
Read Fund Prospectuses." ProvenLex Field Note NOTE-01.
Luxembourg.
URL: https://provenlex.vercel.app/research/note-01-consistent-isnt-compliant`}
          </pre>
          <p className="text-[12px] text-[rgba(255,255,255,0.6)] leading-relaxed mt-4">
            Field notes are released under Creative Commons Attribution 4.0
            International. You may reproduce, distribute, and build on the work with attribution.
            The scan engine that accompanies them is open for inspection.
          </p>
        </section>

      </div>
    </div>
  )
}
