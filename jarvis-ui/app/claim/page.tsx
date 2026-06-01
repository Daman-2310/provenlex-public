import Link from 'next/link'
import { ArrowLeft, Award, CheckCircle2, TrendingUp, ShieldCheck, Sparkles } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'
import ClaimForm from './ClaimForm'

export const metadata = {
  title: 'Claim Your Listing · Apply to Be Scored · Genesis Swarm',
  description: 'Entities not currently in the Book can apply (and pay) to be added. As LP demand for Genesis scores grows, absence from the Book becomes a signal in itself.',
}

const STANDARD_PERKS = [
  'Permanent listing on the Book of Genesis ledger',
  '11-bot scoring engine applied annually',
  'Mirror prospectus-drift tracking',
  'Network counterparty graph inclusion',
  'Twin Monte Carlo stress simulation (4k samples)',
  'Forensic Obituary clause (we publish if you fail)',
  'Cryptographic anchoring to Bitcoin via OpenTimestamps',
  'Annual review and re-scoring',
]

const PREMIUM_PERKS = [
  'Everything in Standard',
  'Quarterly review (4× per year)',
  'Twin Monte Carlo at 100k samples (institutional resolution)',
  'Mirror prospectus drift compared to your real filings',
  'Custom stress scenarios (bring your own)',
  'Priority in Sentinel agent monitoring',
  'Genesis Codex API rate limit raised',
  'Direct quarterly call with founding team',
]

export default function ClaimPage() {
  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#00ff88" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Award className="w-4 h-4 text-[#00ff88]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#00ff88]">CLAIM YOUR LISTING</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">
            Reverse onboarding · entity application to be scored
          </span>
        </div>
      </header>

      <div className="relative max-w-5xl mx-auto px-6 py-14">

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)' }}>
            <Sparkles className="w-3 h-3 text-[#00ff88]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#00ff88]">
              The Yelp-business-claim moment for compliance
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.5rem, 6.5vw, 5rem)', lineHeight: 0.95 }}>
            <span className="text-white">Apply to be</span>{' '}
            <span style={{
              background: 'linear-gradient(90deg, #00ff88 0%, #4a9eff 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(0,255,136,0.3))',
            }}>scored on Genesis.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl mx-auto leading-relaxed">
            Genesis Swarm scores 100 EU financial entities by default. If your entity is not on
            the Book, your LPs and counterparties are increasingly asking why. Apply to be added
            and run through the full Genesis stack: Mirror, Network, Twin, and the 11-bot engine.
          </p>
        </div>

        {/* WHY APPLY */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-10">
          <Reason icon={<TrendingUp className="w-4 h-4 text-[#00ff88]" />}
            title="LP demand is shifting"
            desc="Family offices and pension funds increasingly request Genesis Scores during due diligence. Being absent from the Book reads as 'not scored', which reads as 'declined to be transparent.'" />
          <Reason icon={<ShieldCheck className="w-4 h-4 text-[#4a9eff]" />}
            title="Proactive credibility"
            desc="Entities that opt-in to independent scoring signal that they trust their own books. Audit reports do not say this. Genesis scores do." />
          <Reason icon={<Award className="w-4 h-4 text-[#ffd86b]" />}
            title="The Mirror clause"
            desc="Premium tier compares your real prospectus and operations to observed behavior. A clean Mirror score is a marketable asset; a deteriorating one is an early-warning system." />
        </section>

        {/* TIERS */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          <Tier
            name="Standard"
            price="€5,000"
            recurring="+ €1,000 / year"
            perks={STANDARD_PERKS}
            accent="#00ff88"
            recommended={false}
          />
          <Tier
            name="Premium"
            price="€15,000"
            recurring="+ €3,000 / year"
            perks={PREMIUM_PERKS}
            accent="#ffd86b"
            recommended={true}
          />
        </section>

        {/* APPLICATION FORM */}
        <section className="mb-10">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#00ff88] font-black mb-4">Application</div>
          <ClaimForm />
        </section>

        {/* WHY MATTERS */}
        <section className="rounded-2xl p-6"
          style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.25)', backdropFilter: 'blur(10px)' }}>
          <Award className="w-5 h-5 text-[#00ff88] mb-3" />
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#00ff88] font-black mb-2">Why this is the unit-economics moment</div>
          <p className="text-[13px] text-[rgba(255,255,255,0.75)] leading-relaxed mb-3">
            S&P and Moody&apos;s charge issuers for ratings. Yelp charges businesses to claim
            their listing. Glassdoor charges employers to manage their profile. Once a network
            is large enough that absence becomes a signal, <strong className="text-white">the
            entities themselves become the customer.</strong>
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.6)] leading-relaxed mb-3">
            For Genesis Swarm, this is the inflection where the LP-side product (free, public,
            authoritative) drives entity-side revenue (per-entity tier pricing). The economics
            compound: each new paying entity adds data, which strengthens scores for everyone,
            which raises LP demand, which brings more entities to apply.
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.55)] leading-relaxed">
            Strategically: at €5K-€15K per entity per year across 2,000+ EU funds and banks,
            this is the line item where Genesis becomes profitable at €10M-€30M annual revenue
            without venture financing. It is the path investors immediately recognise.
          </p>
        </section>

      </div>
    </div>
  )
}

function Reason({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-xl p-4"
      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,255,136,0.2)', backdropFilter: 'blur(8px)' }}>
      <div className="mb-2">{icon}</div>
      <div className="text-[12px] font-bold text-white mb-1.5">{title}</div>
      <div className="text-[11px] text-[rgba(255,255,255,0.65)] leading-relaxed">{desc}</div>
    </div>
  )
}

function Tier({ name, price, recurring, perks, accent, recommended }: { name: string; price: string; recurring: string; perks: string[]; accent: string; recommended: boolean }) {
  return (
    <div className="rounded-2xl p-5 relative"
      style={{ background: 'rgba(0,0,0,0.45)', border: `1px solid ${accent}40`, backdropFilter: 'blur(10px)', boxShadow: recommended ? `0 0 24px ${accent}25` : 'none' }}>
      {recommended && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[8px] uppercase tracking-[0.2em] font-black px-2.5 py-0.5 rounded"
          style={{ background: accent, color: '#050508' }}>
          recommended
        </div>
      )}
      <div className="text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: accent }}>{name}</div>
      <div className="flex items-baseline gap-2 mb-1">
        <div className="text-3xl font-black text-white">{price}</div>
        <div className="text-[11px] text-[rgba(255,255,255,0.5)]">one-time</div>
      </div>
      <div className="text-[11px] text-[rgba(255,255,255,0.55)] mb-4">{recurring}</div>
      <div className="space-y-1.5">
        {perks.map(p => (
          <div key={p} className="flex items-start gap-2 text-[11px] text-[rgba(255,255,255,0.78)]">
            <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5" style={{ color: accent }} />
            <span>{p}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
