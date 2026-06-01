import Link from 'next/link'
import { ArrowLeft, Scale, Lock, Shield, Eye, AlertOctagon, CheckCircle2 } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'

export const metadata = {
  title: 'The Genesis Independence Pledge · Structurally Conflict-Free · Genesis Swarm',
  description: 'Genesis Swarm will never accept money from any entity it scores. The structural commitment incumbents and enterprise SaaS competitors cannot make.',
  openGraph: {
    title: 'The Genesis Independence Pledge',
    description: 'Structurally conflict-free risk scoring. Forever.',
  },
}

const PRINCIPLES = [
  {
    icon: <Lock className="w-5 h-5 text-[#00ff88]" />,
    title: 'We will never accept payment from any entity we score.',
    body: 'No revenue, no consulting fees, no advisory retainers, no equity, no in-kind contributions. Listed entities can sponsor public-good initiatives only through unrestricted grants to a third-party Luxembourg ASBL with no editorial influence on the Genesis ledger. This principle is irrevocable in our Articles of Association.',
  },
  {
    icon: <Eye className="w-5 h-5 text-[#00ff88]" />,
    title: 'We will never let a scored entity preview, dispute, or delay a published score.',
    body: 'Right of reply is exercised publicly, after publication, never before. Disputed claims are footnoted on the live entry — never silently withdrawn.',
  },
  {
    icon: <Shield className="w-5 h-5 text-[#00ff88]" />,
    title: 'We will never sell, license, or service a Compliance Department.',
    body: 'Genesis is built for the people who VERIFY compliance is happening — LPs, regulators, journalists, board members exercising oversight — not for the people responsible for the compliance itself. Selling to both sides is the conflict that has hollowed out every legacy risk vendor. We refuse to make the same trade.',
  },
  {
    icon: <Scale className="w-5 h-5 text-[#00ff88]" />,
    title: 'We will commit every prediction cryptographically and publish every miss.',
    body: 'Every Watch List and every Book of Genesis edition is hashed and anchored to Bitcoin before publication. When a prediction fails to vindicate within its reveal window, Genesis retires the edition publicly and explains why. Falsifiability is the only honest form of risk forecasting.',
  },
  {
    icon: <AlertOctagon className="w-5 h-5 text-[#00ff88]" />,
    title: 'We will publish forensic Obituaries within six hours of any vindicated collapse.',
    body: 'When the world finds out an entity has failed, Genesis is already publishing the cited, dated, sourced post-mortem. Reporters reach us first because we move first. This is the obligation that earns the credibility.',
  },
  {
    icon: <CheckCircle2 className="w-5 h-5 text-[#00ff88]" />,
    title: 'We will open-source the scoring engine under a permissive licence.',
    body: 'The eleven-bot Pre-Crime engine, the Mirror, the Network, the Twin, the Obituary — all will be released under Apache 2.0 once the audit pass is complete. Anyone, anywhere, can run Genesis locally on their own data. The brand and the data network are the moat, not the code.',
  },
]

const CONTRAST = [
  {
    they: 'S&P, Moody\'s, Fitch',
    do: 'Paid by the issuers they rate',
    we: 'Paid by no one we score',
  },
  {
    they: 'Norm AI ($140M raised)',
    do: 'Sells AI compliance agents TO regulated entities — the customer IS the judged party',
    we: 'Sells nothing to regulated entities — serves the LPs, regulators, journalists, and public who NEED to verify them',
  },
  {
    they: 'Bloomberg, Refinitiv',
    do: 'Sells terminals to anyone with $24K/year — including the rated entities themselves',
    we: 'Free, public, machine-readable. No subscription tier that creates a privileged tier of access',
  },
  {
    they: 'Big-4 audit (KPMG, EY, Deloitte, PwC)',
    do: 'Paid by the audit client to opine on the client\'s own books',
    we: 'Paid by no one. Our public record is the only audit our methodology can fail',
  },
  {
    they: 'Quantexa, ComplyAdvantage',
    do: 'Banks license the tools to assess their own counterparty risk privately',
    we: 'The counterparty risk is published openly. Banks read it from outside, not control it from inside',
  },
]

export default function IndependencePage() {
  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="void" accent="#00ff88" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Scale className="w-4 h-4 text-[#00ff88]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#00ff88]">INDEPENDENCE PLEDGE</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">
            Sealed 2026-05-30 · Irrevocable
          </span>
        </div>
      </header>

      <div className="relative max-w-5xl mx-auto px-6 py-14">

        {/* HERO */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)' }}>
            <Scale className="w-3 h-3 text-[#00ff88]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#00ff88]">
              The structural commitment competitors cannot make
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.5rem, 6.5vw, 5rem)', lineHeight: 0.95 }}>
            <span className="text-white">Genesis will never</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #00ff88 0%, #4a9eff 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(0,255,136,0.3))',
            }}>be paid by what it judges.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.7)] text-base max-w-2xl mx-auto leading-relaxed">
            Every legacy risk vendor — S&amp;P, Moody&apos;s, Fitch, the Big-4, Bloomberg, the entire
            $140M-valuation AI-compliance category — sells to the entities they assess. That is the
            conflict of interest that hollowed them out. Genesis is structured so that conflict
            cannot exist.
          </p>
        </div>

        {/* THE SIX PRINCIPLES */}
        <section className="mb-14">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#00ff88] font-black mb-6">The six pledges</div>
          <div className="space-y-4">
            {PRINCIPLES.map((p, i) => (
              <div key={i} className="rounded-2xl p-5"
                style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(0,255,136,0.25)', backdropFilter: 'blur(10px)' }}>
                <div className="flex items-start gap-4">
                  <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center mt-1"
                    style={{ background: 'rgba(0,255,136,0.10)', border: '1px solid rgba(0,255,136,0.3)' }}>
                    {p.icon}
                  </div>
                  <div className="flex-1">
                    <div className="text-[10px] uppercase tracking-wider text-[#00ff88] font-bold mb-1">Pledge {String(i + 1).padStart(2, '0')}</div>
                    <h3 className="text-lg sm:text-xl font-black text-white leading-tight mb-2">{p.title}</h3>
                    <p className="text-[13px] text-[rgba(255,255,255,0.7)] leading-relaxed">{p.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CONTRAST TABLE */}
        <section className="mb-14">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#00ff88] font-black mb-4">What every other risk vendor does — and what we will not</div>
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(0,255,136,0.2)', backdropFilter: 'blur(10px)' }}>
            <div className="grid grid-cols-[200px_1fr_1fr] gap-0 text-[10px] uppercase tracking-wider font-bold p-3"
              style={{ borderBottom: '1px solid rgba(0,255,136,0.15)', background: 'rgba(0,0,0,0.5)' }}>
              <div className="text-[rgba(255,255,255,0.4)]">Category</div>
              <div className="text-[#ff7a00]">They do</div>
              <div className="text-[#00ff88]">We will not</div>
            </div>
            {CONTRAST.map((row, i) => (
              <div key={i} className="grid grid-cols-[200px_1fr_1fr] gap-0 p-4"
                style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
                <div className="text-[12px] font-bold text-white pr-3">{row.they}</div>
                <div className="text-[12px] text-[rgba(255,255,255,0.65)] leading-relaxed pr-3">{row.do}</div>
                <div className="text-[12px] text-[#00ff88] leading-relaxed">{row.we}</div>
              </div>
            ))}
          </div>
        </section>

        {/* THE NORM AI MOMENT */}
        <section className="rounded-2xl p-7 mb-12"
          style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.25)', backdropFilter: 'blur(10px)' }}>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#00ff88] font-black mb-3">Why the well-funded AI-compliance category cannot copy this</div>
          <p className="text-[14px] text-[rgba(255,255,255,0.85)] leading-relaxed mb-4">
            Norm AI raised $140 million in 2024-2026 from Blackstone, Bain, Vanguard, Citi, TIAA,
            Coatue, and New York Life. Their product is excellent. Their team is serious. They are
            not the enemy. They are the comparison.
          </p>
          <p className="text-[14px] text-[rgba(255,255,255,0.85)] leading-relaxed mb-4">
            But every dollar of that $140M was raised on the promise that Norm AI sells to the
            entities that need compliance — banks, asset managers, insurers, broker-dealers. That
            customer base is the asset their valuation depends on. They cannot publish a Watch
            List against UBS Europe SE without losing the UBS Europe SE customer relationship.
            They cannot open-source their scoring engine without collapsing their SaaS ARR. They
            cannot fire a forensic Obituary against an enterprise client without ending the
            contract that pays for the office.
          </p>
          <p className="text-[14px] text-[rgba(255,255,255,0.85)] leading-relaxed">
            <strong className="text-white">Genesis Swarm is structured to be the thing $140M of
            enterprise venture money cannot become.</strong> Free where they are paid. Public
            where they are private. Bound by cryptographic commitment where they are bound by
            customer NDAs. Serving the LPs and the regulators and the journalists and the
            public — not the rated entities themselves.
          </p>
          <p className="text-[14px] text-[rgba(255,255,255,0.75)] italic leading-relaxed mt-4">
            Norm AI is the H&amp;R Block of compliance. Genesis is the S&amp;P Ratings of operational
            risk — but free, public, and bottom-up. We are not in the same business.
          </p>
        </section>

        {/* SIGNATURE */}
        <section className="rounded-2xl p-7 text-center"
          style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,255,136,0.3)', backdropFilter: 'blur(10px)' }}>
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#00ff88] font-black mb-4">Founder commitment · publicly signed</div>
          <div className="text-2xl font-black text-white mb-1">Daman Sharma</div>
          <div className="text-[11px] text-[rgba(255,255,255,0.55)] mb-4">Founder, Genesis Swarm · Luxembourg-bound from India · Age 16</div>
          <div className="text-[11px] text-[rgba(255,255,255,0.55)] max-w-2xl mx-auto leading-relaxed">
            These six pledges will be embedded in the Articles of Association of the Luxembourg
            SARL on or before 10 August 2026 — incorporation date. After that date, removing them
            will require a special resolution of 75% of shareholders, which I will personally
            commit never to support.
          </div>
          <div className="text-[10px] uppercase tracking-wider text-[#00ff88] font-mono mt-4">Sealed 2026-05-30</div>
        </section>

      </div>
    </div>
  )
}
