import Link from 'next/link'
import { ArrowLeft, ArrowRight, MapPin, Calendar, Target, Mail, Linkedin } from 'lucide-react'

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
          <span className="text-sm font-bold tracking-[0.18em] text-[#00ff88]">ABOUT</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-14">

        <div className="mb-10">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#00ff88] font-black mb-3">THE STORY</div>
          <h1 className="font-black tracking-tight mb-5" style={{ fontSize: 'clamp(2.5rem, 5.5vw, 4.5rem)', lineHeight: 1 }}>
            One operator.
            <br />
            <span style={{ background: 'linear-gradient(90deg, #00ff88 0%, #4a9eff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              €14.78B protected.
            </span>
          </h1>
          <p className="text-[rgba(255,255,255,0.7)] text-lg leading-relaxed">
            Genesis Swarm was built by a 16-year-old in Luxembourg
            to do what every legacy RegTech vendor refused to: catch financial crime
            in <span className="text-white font-bold">340 milliseconds</span>, with cryptographic proof,
            for under €500/mo.
          </p>
        </div>

        {/* Founder card */}
        <div className="rounded-2xl p-8 mb-10"
          style={{
            background: 'linear-gradient(135deg, rgba(0,255,136,0.04) 0%, rgba(74,158,255,0.03) 100%)',
            border: '1px solid rgba(0,255,136,0.25)',
            boxShadow: '0 0 40px rgba(0,255,136,0.06)',
          }}>
          <div className="flex items-start gap-5 mb-6">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-black shrink-0"
              style={{
                background: 'linear-gradient(135deg, #00ff88 0%, #00aa55 100%)',
                color: '#000',
                boxShadow: '0 0 24px rgba(0,255,136,0.5)',
              }}>
              DS
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-black text-white">Daman Sharma</h2>
              <div className="text-[12px] text-[rgba(0,255,136,0.85)] uppercase tracking-widest font-bold mt-0.5">Founder · Genesis Swarm</div>
              <div className="flex items-center gap-3 mt-2 text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.5)]">
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> Luxembourg</span>
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Age 16</span>
                <span className="flex items-center gap-1"><Target className="w-3 h-3" /> Seed 2028</span>
              </div>
            </div>
          </div>

          <div className="space-y-4 text-[14px] leading-relaxed text-[rgba(255,255,255,0.8)]">
            <p>
              I started building Genesis Swarm when I realized Luxembourg AIFMs were still
              relying on quarterly manual audits to catch financial crime — a model designed
              for the 1990s, applied to a world where Wirecard&apos;s €1.9B fraud went undetected for
              <span className="text-white font-bold"> 524 days</span> while every signal screamed.
            </p>
            <p>
              The big RegTech vendors (LexisNexis Bridger, Refinitiv World-Check, ComplyAdvantage)
              are screening tools dressed up as platforms. They tell you a name matched OFAC.
              They don&apos;t tell you what it means for your fund, they don&apos;t generate the audit
              evidence your CSSF officer needs, and they certainly don&apos;t produce a signed legal
              memorandum in 60 seconds.
            </p>
            <p>
              Genesis Swarm does all three — autonomous AI compliance, real-time, cryptographically
              signed, regulator-grade — at a price point that lets a sub-€100M AIFM use the same
              infrastructure BlackRock or Pictet would buy from us.
            </p>
            <p>
              My target: <span className="text-[#00ff88] font-bold">€50M exit by age 22</span>.
              First Luxembourg AIFM customer by Q3 2026. Series seed in 2028.
              This is a 6-year compounding bet on regulation outrunning the tools that police it.
            </p>
          </div>
        </div>

        {/* Mission */}
        <section className="mb-10">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#00ff88] font-black mb-3">MISSION</div>
          <h2 className="text-2xl font-black text-white mb-4">Compress 6 weeks of compliance work into 60 seconds.</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { t: '11 autonomous bots', d: 'PBFT consensus, 340ms detection, real OFAC + EU + UN screening, Merkle-anchored audit trail.' },
              { t: 'AI legal opinions', d: '€3K Arendt opinions → €99 AI ones. Watermarked, cited, qualified, signed.' },
              { t: '60-min audit packs', d: 'CCO gets a regulator letter, types the question, walks into the audit with a signed PDF.' },
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
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#00ff88] font-black mb-3">WHY NOW</div>
          <h2 className="text-2xl font-black text-white mb-4">Three forces collided.</h2>
          <ul className="space-y-3 text-[14px] text-[rgba(255,255,255,0.75)]">
            <li className="flex items-start gap-3">
              <span className="text-[#00ff88] font-black mt-0.5">1.</span>
              <div><span className="text-white font-bold">DORA enforcement Jan 17, 2027</span> — €18B compliance spend across EU financial institutions. Every fund needs an ICT vendor register, incident-reporting SLA, third-party risk framework. The big four can&apos;t scale to mid-market.</div>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-[#00ff88] font-black mt-0.5">2.</span>
              <div><span className="text-white font-bold">LLMs hit lawyer-grade accuracy</span> — Claude / Llama-3 / GPT-4 can draft a Luxembourg legal memorandum to 80% of a junior associate&apos;s quality, in 60 seconds, for cents.</div>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-[#00ff88] font-black mt-0.5">3.</span>
              <div><span className="text-white font-bold">Luxembourg is the global tokenized-asset hub</span> — BlackRock BUIDL, Franklin Templeton, ABRDN. ERC-3643 (T-REX) is becoming the standard for regulated security tokens. Nobody has compliance tooling for this category yet.</div>
            </li>
          </ul>
        </section>

        {/* CTA */}
        <section className="rounded-2xl p-8 text-center"
          style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.25)' }}>
          <h2 className="text-2xl font-black text-white mb-2">Want to talk?</h2>
          <p className="text-[rgba(255,255,255,0.55)] text-[13px] mb-5">
            I&apos;m an inbox away. Pilot customers, investors, regulators welcome.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="mailto:daman.sharma.2310@gmail.com"
              className="px-6 py-3 rounded-md text-[12px] uppercase tracking-[0.15em] font-black inline-flex items-center gap-2"
              style={{ background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)', color: '#000' }}>
              <Mail className="w-4 h-4" /> Email Daman
            </a>
            <Link href="/investors"
              className="px-6 py-3 rounded-md text-[12px] uppercase tracking-[0.15em] font-bold inline-flex items-center gap-2"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)' }}>
              Investor data room <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>

      </div>
    </div>
  )
}
