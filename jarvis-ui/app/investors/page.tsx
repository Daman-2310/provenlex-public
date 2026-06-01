import Link from 'next/link'
import { ArrowLeft, Mail, Target, TrendingUp, Shield, Cpu, Globe, Lock } from 'lucide-react'

export default function InvestorsPage() {
  return (
    <div className="min-h-screen text-white" style={{ background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)' }}>
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#9b6dff]">INVESTOR DATA ROOM</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-14">

        <div className="mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(155,109,255,0.06)', border: '1px solid rgba(155,109,255,0.3)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#9b6dff]"
              style={{ animation: 'pulse 1.2s ease-in-out infinite', boxShadow: '0 0 8px #9b6dff' }} />
            <span className="text-[10px] font-black tracking-[0.25em] uppercase text-[#9b6dff]">SEED 2028 · PRE-PRODUCT MARKET FIT</span>
          </div>
          <h1 className="font-black tracking-tight mb-4" style={{ fontSize: 'clamp(2.5rem, 5.5vw, 4.5rem)', lineHeight: 1 }}>
            The €50M
            <br />
            <span style={{ background: 'linear-gradient(90deg, #9b6dff 0%, #4a9eff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              RegTech bet.
            </span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl leading-relaxed">
            6-year compounding thesis on regulation outrunning the tools that police it.
            European AIFMs face €18B in DORA compliance spend by Jan 2027.
            Genesis Swarm is the AI infrastructure that lets sub-€500M funds pass the same audit as BlackRock.
          </p>
        </div>

        {/* Thesis */}
        <section className="mb-12">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#9b6dff] font-black mb-3">THE THESIS IN ONE PARAGRAPH</div>
          <div className="rounded-2xl p-6 text-[15px] leading-relaxed text-[rgba(255,255,255,0.85)]"
            style={{ background: 'linear-gradient(135deg, rgba(155,109,255,0.04) 0%, rgba(74,158,255,0.03) 100%)', border: '1px solid rgba(155,109,255,0.2)' }}>
            DORA enforcement (Jan 2027) + AIFMD II + SFDR Article 8/9 will force every European fund to
            generate <em>continuously verifiable</em> compliance evidence — something traditional quarterly
            audits cannot deliver. Legacy RegTech (LexisNexis, Refinitiv, ComplyAdvantage) screens names.
            Big-four audit firms cost €200K/year. Genesis Swarm replaces both with autonomous AI compliance
            at €99-€499/mo, generating CSSF-grade audit packs and AI legal opinions in 60 seconds,
            cryptographically signed for tamper-evident regulator review. <span className="text-white font-bold">Total addressable market: €18B/year EU compliance spend by 2027</span>; we capture 0.3% to hit €50M ARR.
          </div>
        </section>

        {/* Traction */}
        <section className="mb-12">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#9b6dff] font-black mb-3">TRACTION (Q2 2026)</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { v: '€14.78B',  l: 'AUM under protection' },
              { v: '18,976',   l: 'OFAC entities indexed' },
              { v: '2.4M',     l: 'GLEIF LEIs queryable' },
              { v: '340ms',    l: 'Detection latency' },
              { v: '11',       l: 'Autonomous bots' },
              { v: '8',        l: 'Production API endpoints' },
              { v: '6',        l: 'Regulatory frameworks' },
              { v: '4',        l: 'Forensic case studies' },
            ].map(s => (
              <div key={s.l} className="rounded-xl p-4"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="text-2xl font-black tabular-nums text-white">{s.v}</div>
                <div className="text-[9px] uppercase tracking-widest text-[rgba(255,255,255,0.4)] mt-1">{s.l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Moat */}
        <section className="mb-12">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#9b6dff] font-black mb-3">THE MOAT</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { Icon: Shield, t: 'Network-effect benchmark', d: 'Anonymized percentile scoring becomes the industry standard once 50+ customers. Competitors cannot replicate without our customer base.' },
              { Icon: Cpu, t: 'AI cost curve', d: 'Each Groq llama-3.3-70b query costs €0.001. Each €99 customer absorbs ~10,000 free queries/mo. Gross margins go ↑ as model costs go ↓.' },
              { Icon: Globe, t: 'Luxembourg first-mover', d: 'CSSF jurisdiction. Tokenized RWA hub. Once 3-5 Luxembourg AIFMs depend on Genesis Swarm, every fund follows.' },
              { Icon: Lock, t: 'Cryptographic audit trail', d: 'Every output Merkle-signed. Regulator-verifiable. Switching cost = re-anchoring years of evidence to a new vendor.' },
            ].map(m => (
              <div key={m.t} className="rounded-xl p-5"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(155,109,255,0.18)' }}>
                <m.Icon className="w-5 h-5 text-[#9b6dff] mb-3" />
                <div className="text-[14px] font-black text-white mb-1">{m.t}</div>
                <div className="text-[11px] text-[rgba(255,255,255,0.6)] leading-relaxed">{m.d}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Founder + ask */}
        <section className="mb-12 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-2xl p-6"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.5)] font-black mb-2">FOUNDER</div>
            <div className="text-lg font-black text-white">Daman Sharma</div>
            <div className="text-[12px] text-[rgba(255,255,255,0.55)] mb-3">Age 16 · Luxembourg-based · Solo founder</div>
            <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-relaxed">
              Building Genesis Swarm full-time alongside upper-secondary studies.
              Operates the platform, the AI infrastructure, and the regulatory research.
              Targeting first paying Luxembourg AIFM customer Q3 2026; €5M ARR by Q4 2028 = seed-stage milestone.
            </p>
          </div>
          <div className="rounded-2xl p-6"
            style={{ background: 'linear-gradient(135deg, rgba(155,109,255,0.06) 0%, rgba(74,158,255,0.04) 100%)', border: '1px solid rgba(155,109,255,0.3)' }}>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#9b6dff] font-black mb-2">THE ASK</div>
            <div className="text-lg font-black text-white mb-1">Pre-seed angels</div>
            <div className="text-[12px] text-[rgba(255,255,255,0.55)] mb-3">€250K–€500K · 2026–2027</div>
            <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-relaxed">
              Validates the Luxembourg AIFM go-to-market. Funds 18 months of runway through CSSF
              regulatory sandbox + 3-5 lighthouse customers. Sets us up for a €3-5M seed round in 2028
              once we have €500K-€1M ARR.
            </p>
          </div>
        </section>

        {/* Why this founder */}
        <section className="mb-12">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#9b6dff] font-black mb-3">WHY THIS FOUNDER</div>
          <div className="rounded-2xl p-6"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <ul className="space-y-3 text-[13px] text-[rgba(255,255,255,0.75)]">
              <li className="flex items-start gap-3">
                <span className="text-[#9b6dff] font-black mt-0.5">•</span>
                <div>Built and shipped Genesis Swarm — landing, operator dashboard, 8 production API endpoints, voice JARVIS, 3D threat globe, signed PDF generation, real OFAC/GLEIF/ECB integration — solo, in months. Operator-founder.</div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-[#9b6dff] font-black mt-0.5">•</span>
                <div>Luxembourg-resident → direct access to CSSF Innovation Hub, ALFI network, AIFMs at every scale. The €50M exit happens here or not at all.</div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-[#9b6dff] font-black mt-0.5">•</span>
                <div>16 years old. Builds while peers attend lectures. 6-year head start = unfair time advantage. Seed-stage by 18, Series A by 20, exit by 22-23.</div>
              </li>
            </ul>
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl p-8 text-center"
          style={{
            background: 'linear-gradient(135deg, rgba(155,109,255,0.05) 0%, rgba(74,158,255,0.03) 100%)',
            border: '1px solid rgba(155,109,255,0.3)',
          }}>
          <Target className="w-7 h-7 text-[#9b6dff] mx-auto mb-3" />
          <h2 className="text-2xl font-black text-white mb-2">Schedule a 30-min intro</h2>
          <p className="text-[rgba(255,255,255,0.55)] text-[13px] mb-5 max-w-xl mx-auto">
            Direct line to the founder. Live walkthrough of the platform.
            Discussion of the regulatory roadmap and go-to-market plan.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="mailto:daman.sharma.2310@gmail.com?subject=Genesis%20Swarm%20-%20Investor%20intro"
              className="px-6 py-3 rounded-md text-[12px] uppercase tracking-[0.15em] font-black inline-flex items-center gap-2"
              style={{ background: 'linear-gradient(135deg, #9b6dff 0%, #6a3dff 100%)', color: '#fff', boxShadow: '0 0 24px rgba(155,109,255,0.4)' }}>
              <Mail className="w-4 h-4" /> Email founder
            </a>
            <Link href="/operator"
              className="px-6 py-3 rounded-md text-[12px] uppercase tracking-[0.15em] font-bold inline-flex items-center gap-2"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)' }}>
              <TrendingUp className="w-4 h-4" /> See live operator dashboard
            </Link>
          </div>
        </section>

      </div>
    </div>
  )
}
