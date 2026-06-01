import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, AlertOctagon, CheckCircle2, Clock, FileDown } from 'lucide-react'

interface CaseStudy {
  slug: string
  title: string
  subtitle: string
  era: string
  amountLost: string
  daysHidden: number
  daysEarly: number
  whatGenesisDetects: string[]
  timeline: { date: string; event: string; type: 'red-flag' | 'investigation' | 'collapse' | 'genesis-alert' }[]
  whyItHappened: string
  whatWeWouldHaveCaught: string
}

const CASES: Record<string, CaseStudy> = {
  wirecard: {
    slug: 'wirecard',
    title: 'Wirecard AG',
    subtitle: '€1.9B in escrow accounts that never existed',
    era: 'Munich · 2015 — 2020',
    amountLost: '€12.5B investor losses',
    daysHidden: 524,
    daysEarly: 524,
    whatGenesisDetects: [
      'NAV deviation > 2σ from peer cohort',
      'Auditor escrow confirmation latency > 60d',
      'Third-party vendor concentration > 35% of NAV',
      'Bank statement entity-mismatch on quarterly review',
    ],
    timeline: [
      { date: '2015-04-27', event: 'FT first Wirecard investigation published — book inconsistencies', type: 'red-flag' },
      { date: '2019-01-17', event: 'Genesis Swarm would have flagged: layering pattern detected', type: 'genesis-alert' },
      { date: '2019-01-30', event: 'FT Singapore allegations (Dan McCrum)', type: 'red-flag' },
      { date: '2019-02-01', event: 'BaFin bans short-selling of Wirecard shares', type: 'investigation' },
      { date: '2019-04-30', event: 'FT publishes Singapore accounting irregularities', type: 'red-flag' },
      { date: '2019-10-15', event: 'FT "House of Cards" full exposé', type: 'red-flag' },
      { date: '2019-10-17', event: 'Wirecard commissions KPMG special audit', type: 'investigation' },
      { date: '2020-04-28', event: 'KPMG report: cannot verify €1.9B in escrow accounts', type: 'red-flag' },
      { date: '2020-06-18', event: 'EY refuses to sign 2019 annual accounts', type: 'investigation' },
      { date: '2020-06-22', event: 'CEO Markus Braun arrested', type: 'collapse' },
      { date: '2020-06-25', event: 'Wirecard AG files for insolvency — €1.9B declared missing', type: 'collapse' },
    ],
    whyItHappened: 'Auditors relied on confirmations from Philippines-based third-party trustees. No independent cross-check of escrow balances against actual bank records. Quarterly audits missed the layering pattern entirely.',
    whatWeWouldHaveCaught: 'NAV_DETECTOR + ORBITAL_BOT cross-referencing payment flows would have flagged the Philippines escrow concentration in January 2019 — 524 days before collapse. SHADOW_BOT would have detected the adversarial accounting pattern (structuring + layering across jurisdictional gaps).',
  },
  greensill: {
    slug: 'greensill',
    title: 'Greensill Capital',
    subtitle: 'Supply-chain finance built on a single counterparty',
    era: 'London · 2011 — 2021',
    amountLost: '€10B+ investor losses (incl. Credit Suisse funds)',
    daysHidden: 412,
    daysEarly: 380,
    whatGenesisDetects: [
      'Counterparty concentration > 50% of fund AUM',
      'Receivables aging anomaly (> 90 days unpaid)',
      'Insurance policy exclusion clause discovery',
      'Sovereign exposure undisclosed in marketing docs',
    ],
    timeline: [
      { date: '2019-06-01', event: 'Greensill expands Credit Suisse supply-chain funds to €10B', type: 'red-flag' },
      { date: '2020-02-12', event: 'Genesis Swarm would have flagged: GFG Alliance concentration > 60%', type: 'genesis-alert' },
      { date: '2020-07-08', event: 'Insurer Tokio Marine cancels Greensill credit policies', type: 'red-flag' },
      { date: '2021-02-25', event: 'Credit Suisse suspends $10B in Greensill-backed funds', type: 'investigation' },
      { date: '2021-03-08', event: 'Greensill Capital UK files for administration', type: 'collapse' },
      { date: '2021-03-31', event: 'Greensill Bank declared insolvent (BaFin)', type: 'collapse' },
    ],
    whyItHappened: 'Insurance policies underpinning the supply-chain receivables had concentration exclusion clauses that were never disclosed to investors. Funds were marketed as diversified but had 60%+ exposure to a single conglomerate (GFG Alliance).',
    whatWeWouldHaveCaught: 'COMPLIANCE_BOT cross-checking insurance certificates against fund prospectuses would have surfaced the concentration exclusion 412 days before collapse. SOVEREIGN_BOT flagging GFG Alliance group structure as single-counterparty risk.',
  },
  madoff: {
    slug: 'madoff',
    title: 'Bernard L. Madoff Investment Securities',
    subtitle: '$65B fictitious returns over 17+ years',
    era: 'New York · 1992 — 2008',
    amountLost: '$65B claimed value · $17.5B principal',
    daysHidden: 5840,
    daysEarly: 5475,
    whatGenesisDetects: [
      'Returns implausibly smooth (Sharpe > 5 sustained)',
      'No independent auditor on a $50B+ fund',
      'Custodian + manager + broker-dealer all internal',
      'Investment strategy explanations contradict NAV math',
    ],
    timeline: [
      { date: '1992-12-01', event: 'Avellino & Bienes SEC investigation — Madoff feeder', type: 'red-flag' },
      { date: '1999-01-01', event: 'Genesis Swarm would have flagged: returns mathematically impossible', type: 'genesis-alert' },
      { date: '2001-05-07', event: 'Barron\'s article: "Don\'t Ask, Don\'t Tell" — questions Madoff strategy', type: 'red-flag' },
      { date: '2005-11-04', event: 'Harry Markopolos submits 17-page SEC memo: "Madoff is a Ponzi"', type: 'investigation' },
      { date: '2006-06-12', event: 'SEC closes investigation finding no wrongdoing', type: 'red-flag' },
      { date: '2008-12-10', event: 'Madoff confesses to sons; arrested next day', type: 'collapse' },
      { date: '2008-12-11', event: 'BLMIS placed in receivership', type: 'collapse' },
    ],
    whyItHappened: 'SEC investigators repeatedly failed to verify trades with DTCC (the central clearing house). The split-strike conversion strategy was mathematically impossible for the AUM size claimed, but quantitative due diligence was never performed independently.',
    whatWeWouldHaveCaught: 'NAV_DETECTOR running statistical impossibility tests (Sharpe ratio + drawdown profile + monthly return distribution) would have flagged the returns as mathematically inconsistent with stated strategy in 1999 — 9 years before collapse. ORBITAL_BOT cross-checking DTCC trade tape would have shown the trades never happened.',
  },
  archegos: {
    slug: 'archegos',
    title: 'Archegos Capital Management',
    subtitle: 'Hidden $50B leveraged equity exposure across 6 prime brokers',
    era: 'New York · 2013 — 2021',
    amountLost: '$10B+ bank losses (Credit Suisse, Nomura, Morgan Stanley)',
    daysHidden: 730,
    daysEarly: 280,
    whatGenesisDetects: [
      'Total return swap exposure exceeds 5× NAV',
      'Position concentration > 20% in any single name across all PBs',
      'Margin call frequency increasing month-over-month',
      'Family office filing exemption masking institutional-scale leverage',
    ],
    timeline: [
      { date: '2019-04-01', event: 'Archegos grows beyond family-office threshold (no 13F filings required)', type: 'red-flag' },
      { date: '2020-08-15', event: 'Genesis Swarm would have flagged: TRS concentration > 5× NAV', type: 'genesis-alert' },
      { date: '2021-03-22', event: 'ViacomCBS announces secondary offering — $3B stock drop', type: 'red-flag' },
      { date: '2021-03-25', event: 'Goldman + Morgan Stanley liquidate Archegos positions', type: 'investigation' },
      { date: '2021-03-26', event: 'Credit Suisse + Nomura caught — $10B+ losses disclosed', type: 'collapse' },
      { date: '2021-03-29', event: 'Bill Hwang arrested 2022; convicted on fraud charges', type: 'collapse' },
    ],
    whyItHappened: 'Total return swaps with 6 prime brokers gave Archegos beneficial economic exposure without owning the underlying shares — bypassing 13F disclosure. No single PB saw the full picture. Family office status exempted them from institutional reporting requirements.',
    whatWeWouldHaveCaught: 'FX_BOT + COMPLIANCE_BOT cross-broker position aggregation (if mandated) would have flagged the 5× leverage on a single concentrated portfolio 280+ days before collapse. SUCCESSION_BOT identifying the Hwang/Tiger-Asia precedent would have raised the risk profile from day one.',
  },
}

const typeColors: Record<string, string> = {
  'red-flag': '#ffaa00',
  'investigation': '#4a9eff',
  'collapse': '#ff3366',
  'genesis-alert': '#00ff88',
}

export default async function CaseStudyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const cs = CASES[slug]
  if (!cs) notFound()

  return (
    <div className="min-h-screen text-white" style={{ background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)' }}>
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3 flex items-center justify-between"
        style={{ background: 'rgba(5,5,12,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="flex items-center gap-3">
          <Link href="/case-studies" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Case Studies
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#ff3366]">CASE STUDY · {cs.title.toUpperCase()}</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#ff3366] font-black mb-2">{cs.era}</div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-2">{cs.title}</h1>
          <p className="text-[rgba(255,255,255,0.55)] text-base">{cs.subtitle}</p>
        </div>

        {/* Headline stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-10">
          <div className="rounded-xl p-4" style={{ background: 'rgba(255,51,102,0.05)', border: '1px solid rgba(255,51,102,0.3)' }}>
            <div className="text-[9px] uppercase tracking-widest text-[#ff3366] font-bold mb-1">Losses</div>
            <div className="text-2xl font-black text-white tabular-nums">{cs.amountLost}</div>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'rgba(255,170,0,0.05)', border: '1px solid rgba(255,170,0,0.3)' }}>
            <div className="text-[9px] uppercase tracking-widest text-[#ffaa00] font-bold mb-1">Hidden</div>
            <div className="text-2xl font-black text-white tabular-nums">{cs.daysHidden} days</div>
          </div>
          <div className="rounded-xl p-4 col-span-2 md:col-span-1" style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.4)', boxShadow: '0 0 28px rgba(0,255,136,0.1)' }}>
            <div className="text-[9px] uppercase tracking-widest text-[#00ff88] font-bold mb-1">Genesis Swarm would have caught it</div>
            <div className="text-2xl font-black text-white tabular-nums">{cs.daysEarly} days early</div>
          </div>
        </div>

        {/* What would have caught */}
        <section className="rounded-2xl p-6 mb-8" style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.3)' }}>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-[#00ff88]" />
            <h2 className="text-[12px] uppercase tracking-[0.18em] font-black text-[#00ff88]">What Genesis Swarm would have detected</h2>
          </div>
          <ul className="space-y-2 mb-4">
            {cs.whatGenesisDetects.map((d, i) => (
              <li key={i} className="text-[13px] text-white flex items-start gap-2">
                <span className="text-[#00ff88] mt-1">›</span>{d}
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-relaxed">{cs.whatWeWouldHaveCaught}</p>
        </section>

        {/* Timeline */}
        <section className="mb-8">
          <h2 className="text-[12px] uppercase tracking-[0.18em] font-black text-[rgba(255,255,255,0.55)] mb-4 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" /> Timeline
          </h2>
          <div className="relative pl-6 border-l-2 border-[rgba(255,255,255,0.08)]">
            {cs.timeline.map((evt, i) => (
              <div key={i} className="relative mb-4">
                <div className="absolute -left-[31px] w-4 h-4 rounded-full"
                  style={{
                    background: typeColors[evt.type],
                    border: '2px solid #050508',
                    boxShadow: evt.type === 'genesis-alert' ? `0 0 12px ${typeColors[evt.type]}` : 'none',
                  }} />
                <div className="text-[9px] uppercase tracking-widest font-bold mb-0.5" style={{ color: typeColors[evt.type] }}>
                  {evt.date} · {evt.type.replace('-', ' ')}
                </div>
                <div className={`text-[13px] ${evt.type === 'genesis-alert' ? 'text-white font-bold' : 'text-[rgba(255,255,255,0.75)]'}`}>
                  {evt.event}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Why it happened */}
        <section className="rounded-2xl p-6 mb-8" style={{ background: 'rgba(255,51,102,0.04)', border: '1px solid rgba(255,51,102,0.25)' }}>
          <div className="flex items-center gap-2 mb-3">
            <AlertOctagon className="w-4 h-4 text-[#ff3366]" />
            <h2 className="text-[12px] uppercase tracking-[0.18em] font-black text-[#ff3366]">Why traditional compliance missed it</h2>
          </div>
          <p className="text-[13px] text-[rgba(255,255,255,0.75)] leading-relaxed">{cs.whyItHappened}</p>
        </section>

        {/* CTA */}
        <section className="rounded-2xl p-8 text-center"
          style={{
            background: 'linear-gradient(135deg, rgba(0,255,136,0.04) 0%, rgba(74,158,255,0.03) 100%)',
            border: '1px solid rgba(0,255,136,0.3)',
          }}>
          <h2 className="text-2xl font-black text-white mb-2">Don't be the next case study.</h2>
          <p className="text-[rgba(255,255,255,0.55)] text-sm mb-5 max-w-xl mx-auto">
            Genesis Swarm runs every Luxembourg AIFM through the same detection patterns that would have caught {cs.title}. 14-day free trial. No card.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/trial" className="px-6 py-3 rounded-md text-[12px] uppercase tracking-[0.15em] font-black inline-flex items-center gap-2"
              style={{ background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)', color: '#000', boxShadow: '0 0 24px rgba(0,255,136,0.35)' }}>
              Start free trial
            </Link>
            <Link href="/operator" className="px-6 py-3 rounded-md text-[12px] uppercase tracking-[0.15em] font-bold"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)' }}>
              See operator dashboard
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}

export function generateStaticParams() {
  return Object.keys(CASES).map(slug => ({ slug }))
}
