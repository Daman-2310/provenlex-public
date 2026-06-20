import Link from 'next/link'
import { ArrowLeft, ArrowRight, MapPin, Calendar, Target, Mail } from 'lucide-react'

export default function AboutPage() {
  return (
    <div className="min-h-screen text-white" style={{ background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)' }}>
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#10D982]">ABOUT</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-14">

        <div className="mb-10">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#10D982] font-black mb-3">THE STORY</div>
          <h1 className="font-black tracking-tight mb-5" style={{ fontSize: 'clamp(2.5rem, 5.5vw, 4.5rem)', lineHeight: 1 }}>
            No AI.
            <br />
            <span style={{ background: 'linear-gradient(90deg, #10D982 0%, #5B8DEF 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              On purpose.
            </span>
          </h1>
          <p className="text-[rgba(255,255,255,0.7)] text-lg leading-relaxed">
            ProvenLex checks a fund prospectus against AIFMD&nbsp;II and UCITS using
            deterministic arithmetic and the rule text — <span className="text-white font-bold">no large
            language model anywhere</span>. Every verdict cites the exact article, is reproducible,
            and runs entirely in your browser. Nothing you paste is uploaded.
          </p>
        </div>

        {/* Founder card */}
        <div className="rounded-2xl p-8 mb-10"
          style={{
            background: 'linear-gradient(135deg, rgba(16,217,130,0.04) 0%, rgba(91,141,239,0.03) 100%)',
            border: '1px solid rgba(16,217,130,0.25)',
            boxShadow: '0 0 40px rgba(16,217,130,0.06)',
          }}>
          <div className="flex items-start gap-5 mb-6">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-black shrink-0"
              style={{
                background: 'linear-gradient(135deg, #10D982 0%, #0B9E63 100%)',
                color: '#000',
                boxShadow: '0 0 24px rgba(16,217,130,0.5)',
              }}>
              DS
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-black text-white">Daman Sharma</h2>
              <div className="text-[12px] text-[rgba(16,217,130,0.85)] uppercase tracking-widest font-bold mt-0.5">Founder · ProvenLex</div>
              <div className="flex items-center gap-3 mt-2 text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.5)]">
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> Building for Luxembourg</span>
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Age 16</span>
                <span className="flex items-center gap-1"><Target className="w-3 h-3" /> Source-available engine</span>
              </div>
            </div>
          </div>

          <div className="space-y-4 text-[14px] leading-relaxed text-[rgba(255,255,255,0.8)]">
            <p>
              I&apos;m 16, and I built ProvenLex because of one thing every Conducting Officer
              already knows: they are <span className="text-white font-bold">personally liable</span> for
              what goes into a regulatory filing — and &quot;the model said so&quot; has never been a defence.
            </p>
            <p>
              Most RegTech is racing to bolt an LLM onto everything. I went the other way. A
              language model that hallucinates one citation into a prospectus check isn&apos;t a
              time-saver — it&apos;s a career risk for the person who signed off. So the engine has
              no model in it at all: it reads a document&apos;s declared limits and holdings and checks
              them, with pure arithmetic and the regulation text, against the document&apos;s own caps
              and the AIFMD&nbsp;II / UCITS statutory limits.
            </p>
            <p>
              The result is the one property a model can&apos;t give you: the same document always
              returns the same verdict, every line is cited to the article, and any reviewer can
              re-verify it independently. The engine is source-available so a technical reviewer can
              check the logic with no NDA.
            </p>
            <p className="text-[rgba(255,255,255,0.6)]">
              Where things honestly stand: this is early. It&apos;s a live, free tool, not a funded
              company yet — I&apos;m looking for working compliance professionals to pull it apart and
              tell me where it&apos;s wrong, and for a first pilot. No inflated numbers here; if it
              hasn&apos;t happened, it isn&apos;t on this page.
            </p>
          </div>
        </div>

        {/* What it is */}
        <section className="mb-10">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#10D982] font-black mb-3">WHAT IT ACTUALLY DOES</div>
          <h2 className="text-2xl font-black text-white mb-4">Deterministic, cited, re-verifiable.</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { t: 'No LLM, anywhere', d: 'Pure regex + arithmetic over the rule text. No model decides a verdict, so nothing can hallucinate into a filing.' },
              { t: 'Cited to the article', d: 'Every finding maps to the exact AIFMD II / UCITS provision it tests — leverage caps, retention, single-issuer / 5-10-40 limits.' },
              { t: 'Runs in your browser', d: 'The document you paste is analysed client-side. Nothing is uploaded; the sealed verdict is reproducible and tamper-evident.' },
            ].map(p => (
              <div key={p.t} className="rounded-xl p-4"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="text-[14px] font-black text-white mb-1">{p.t}</div>
                <div className="text-[11px] text-[rgba(255,255,255,0.55)] leading-relaxed">{p.d}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Why now */}
        <section className="mb-10">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#10D982] font-black mb-3">WHY NOW</div>
          <h2 className="text-2xl font-black text-white mb-4">Two things collided.</h2>
          <ul className="space-y-3 text-[14px] text-[rgba(255,255,255,0.75)]">
            <li className="flex items-start gap-3">
              <span className="text-[#10D982] font-black mt-0.5">1.</span>
              <div><span className="text-white font-bold">AIFMD&nbsp;II is in force (16 April 2026)</span> — new Article&nbsp;23 disclosure and loan-origination rules change what fund documents must say. Every EU manager is reconciling existing prospectuses against the new text right now.</div>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-[#10D982] font-black mt-0.5">2.</span>
              <div><span className="text-white font-bold">AI is flooding compliance</span> — and regulators and personally-liable officers are rightly wary of hallucination risk in something they have to defend. A provably deterministic check is the conservative, defensible alternative.</div>
            </li>
          </ul>
        </section>

        {/* CTA */}
        <section className="rounded-2xl p-8 text-center"
          style={{ background: 'rgba(16,217,130,0.04)', border: '1px solid rgba(16,217,130,0.25)' }}>
          <h2 className="text-2xl font-black text-white mb-2">Want to pull it apart?</h2>
          <p className="text-[rgba(255,255,255,0.55)] text-[13px] mb-5">
            Practitioners, regulators, and anyone who&apos;s lived AIFMD&nbsp;II from the inside — I&apos;d genuinely value the teardown.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/scan"
              className="px-6 py-3 rounded-md text-[12px] uppercase tracking-[0.15em] font-black inline-flex items-center gap-2"
              style={{ background: 'linear-gradient(135deg, #10D982 0%, #0B9E63 100%)', color: '#000' }}>
              Run a live scan <ArrowRight className="w-4 h-4" />
            </Link>
            <a href="mailto:daman.sharma.2310@gmail.com"
              className="px-6 py-3 rounded-md text-[12px] uppercase tracking-[0.15em] font-bold inline-flex items-center gap-2"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)' }}>
              <Mail className="w-4 h-4" /> Email Daman
            </a>
          </div>
        </section>

      </div>
    </div>
  )
}
