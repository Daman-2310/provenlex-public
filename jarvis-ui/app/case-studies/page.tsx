import Link from 'next/link'
import { ArrowLeft, ArrowRight, AlertOctagon } from 'lucide-react'

const CASES = [
  { slug: 'wirecard', title: 'Wirecard AG', loss: '€12.5B', daysEarly: 524, blurb: 'Fictitious €1.9B in Philippines escrow accounts. Auditors confirmed with trustees who didn\'t exist.' },
  { slug: 'greensill', title: 'Greensill Capital', loss: '€10B+', daysEarly: 412, blurb: 'Supply-chain receivables insured under policies with hidden concentration exclusions. €10B Credit Suisse funds frozen.' },
  { slug: 'madoff', title: 'Bernard Madoff (BLMIS)', loss: '$65B', daysEarly: 5475, blurb: '17 years of fictitious split-strike returns. Markopolos warned the SEC five times. Statistical impossibility ignored.' },
  { slug: 'archegos', title: 'Archegos Capital', loss: '$10B+', daysEarly: 280, blurb: '$50B leveraged equity exposure hidden across 6 prime brokers via total return swaps. No PB saw the whole picture.' },
]

export default function CaseStudiesIndex() {
  return (
    <div className="min-h-screen text-white" style={{ background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)' }}>
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3 flex items-center justify-between"
        style={{ background: 'rgba(5,5,12,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#ff3366]">CASE STUDIES</span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-14">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(255,51,102,0.06)', border: '1px solid rgba(255,51,102,0.3)' }}>
            <AlertOctagon className="w-3 h-3 text-[#ff3366]" />
            <span className="text-[10px] font-black tracking-[0.25em] uppercase text-[#ff3366]">FRAUDS THAT SHOULD HAVE BEEN CAUGHT</span>
          </div>
          <h1 className="font-black tracking-tight mb-4" style={{ fontSize: 'clamp(2.5rem, 5.5vw, 4.5rem)', lineHeight: 1 }}>
            The frauds that built
            <br />
            <span style={{ background: 'linear-gradient(90deg, #ff3366 0%, #ffaa00 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Genesis Swarm.
            </span>
          </h1>
          <p className="text-[rgba(255,255,255,0.55)] text-base max-w-2xl mx-auto leading-relaxed">
            Four collapses that erased <span className="text-white font-bold">$87 billion</span> of investor capital. Each one signaled for months or years before. We built the detection patterns for each one — see what would have triggered Genesis Swarm.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CASES.map(c => (
            <Link key={c.slug} href={`/case-studies/${c.slug}`}
              className="group rounded-2xl p-6 transition-all hover:scale-[1.02]"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-start justify-between mb-3">
                <h2 className="text-xl font-black text-white">{c.title}</h2>
                <ArrowRight className="w-4 h-4 text-[rgba(255,255,255,0.3)] group-hover:text-[#00ff88] transition-colors" />
              </div>
              <p className="text-[12px] text-[rgba(255,255,255,0.55)] leading-relaxed mb-4">{c.blurb}</p>
              <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest pt-3 border-t border-[rgba(255,255,255,0.06)]">
                <span><span className="text-[rgba(255,255,255,0.4)]">Loss:</span> <span className="text-[#ff3366] font-bold">{c.loss}</span></span>
                <span><span className="text-[rgba(255,255,255,0.4)]">Caught:</span> <span className="text-[#00ff88] font-bold tabular-nums">{c.daysEarly} days early</span></span>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-14 text-center">
          <Link href="/trial" className="inline-flex items-center gap-2 px-6 py-3 rounded-md text-[12px] uppercase tracking-[0.15em] font-black"
            style={{ background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)', color: '#000', boxShadow: '0 0 24px rgba(0,255,136,0.35)' }}>
            Run YOUR fund through Genesis Swarm → <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}
