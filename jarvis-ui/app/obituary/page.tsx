import Link from 'next/link'
import { ArrowLeft, AlertOctagon, ChevronRight, Calendar } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'
import { OBITUARIES } from '@/lib/obituaries'

export const metadata = {
  title: 'Genesis Obituary · Forensic Post-Mortems of Collapsed Entities · Genesis Swarm',
  description: 'Authoritative forensic post-mortems. For every collapsed EU/global financial entity, the Genesis signals that fired, the prophecies that called it, the timeline that proves it was foreseeable.',
}

export default function ObituaryIndex() {
  const ordered = [...OBITUARIES].sort((a, b) => b.collapse_date.localeCompare(a.collapse_date))

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="void" accent="#ff3366" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <AlertOctagon className="w-4 h-4 text-[#ff3366]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#ff3366]">OBITUARY</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">
            {ordered.length} forensic post-mortems · cited by press · the canonical record
          </span>
        </div>
      </header>

      <div className="relative max-w-5xl mx-auto px-6 py-14">

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.3)' }}>
            <AlertOctagon className="w-3 h-3 text-[#ff3366]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#ff3366]">
              The day Wirecard / Greensill / Archegos / FTX collapsed — what Genesis would have seen
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.5rem, 6.5vw, 5rem)', lineHeight: 0.95 }}>
            <span className="text-white">The canonical</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #ff3366 0%, #ff7a00 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(255,51,102,0.3))',
            }}>forensic record.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl mx-auto leading-relaxed">
            When an entity collapses, the world wants to know one thing: was it foreseeable.
            Genesis Obituary reconstructs every observable signal that existed before collapse, dated and sourced,
            and shows the Pre-Crime trajectory Genesis would have published in advance.
            <br /><br />
            <em className="text-[rgba(255,255,255,0.55)]">After Genesis ships, every future collapse gets a Genesis Obituary within six hours.</em>
          </p>
        </div>

        <div className="space-y-4">
          {ordered.map(o => (
            <Link key={o.slug} href={`/obituary/${o.slug}`}
              className="block rounded-2xl p-5 transition-all hover:translate-x-1"
              style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,51,102,0.2)', backdropFilter: 'blur(10px)' }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.5)] mb-1.5">
                    <Calendar className="w-3 h-3 text-[#ff3366]" />
                    <span>{new Date(o.collapse_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <span className="text-[rgba(255,255,255,0.25)]">·</span>
                    <span>{o.jurisdiction}</span>
                    <span className="text-[rgba(255,255,255,0.25)]">·</span>
                    <span>{o.category.replace('_', ' ')}</span>
                  </div>
                  <div className="text-[18px] sm:text-[22px] font-black text-white leading-tight mb-1.5">
                    {o.entity}
                  </div>
                  <div className="text-[12px] text-[rgba(255,255,255,0.7)] leading-relaxed mb-2">
                    {o.one_liner}
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="font-mono uppercase tracking-wider px-2 py-0.5 rounded font-bold"
                      style={{ background: 'rgba(255,51,102,0.12)', border: '1px solid rgba(255,51,102,0.3)', color: '#ff3366' }}>
                      {o.pattern_marker}
                    </span>
                    <span className="text-[rgba(255,255,255,0.45)]">{o.loss_estimate_eur}</span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-[rgba(255,255,255,0.3)] shrink-0 mt-1" />
              </div>
            </Link>
          ))}
        </div>

        {/* WHY MATTERS */}
        <section className="rounded-2xl p-6 mt-10"
          style={{ background: 'rgba(255,51,102,0.04)', border: '1px solid rgba(255,51,102,0.25)', backdropFilter: 'blur(10px)' }}>
          <AlertOctagon className="w-5 h-5 text-[#ff3366] mb-3" />
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#ff3366] font-black mb-2">Why the Obituary becomes the canonical record</div>
          <p className="text-[13px] text-[rgba(255,255,255,0.75)] leading-relaxed mb-3">
            Within six hours of an entity collapse, news organizations need three things: a timeline,
            a list of red flags, and a verdict on foreseeability. Today they assemble these by phone
            over twenty-four hours. <strong className="text-white">Genesis Obituary publishes all three immediately,
            cited and sourced.</strong> Reporters reach for it not out of loyalty but out of deadline pressure.
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.6)] leading-relaxed mb-3">
            After three or four such Obituaries are cited in Reuters, FT, Bloomberg, the pattern hardens:
            Genesis becomes the institutional default for collapse forensics in EU finance. That is
            <strong className="text-white"> the highest-leverage credibility asset a small team can build</strong> —
            it compounds with every new collapse.
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.55)] leading-relaxed">
            Strategically: the Obituary is what makes funds adopt Genesis preemptively. No one wants to
            be the next case study. The reflexive answer to "how do we avoid the next FTX" is to subscribe
            to the system that called the last one.
          </p>
        </section>

      </div>
    </div>
  )
}
