import Link from 'next/link'
import { ArrowLeft, BarChart3, TrendingDown, ChevronRight } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'
import { getAllTwins, SCENARIOS } from '@/lib/twin'

export const metadata = {
  title: 'Genesis Twin · Monte Carlo Stress Simulator · Genesis Swarm',
  description: '10,000-trial synthetic stress test per entity. Survival probability, expected loss, time-to-collapse across rate shock, credit crunch, key-person exit, regulator probe, LP redemption wave, counterparty default.',
}

export default function TwinIndex() {
  const twins = getAllTwins(4000).sort((a, b) => a.aggregate_resilience - b.aggregate_resilience)
  const worst = twins.slice(0, 10)
  const best = twins.slice(-10).reverse()

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#ff7a00" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <BarChart3 className="w-4 h-4 text-[#ff7a00]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#ff7a00]">TWIN</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">
            Monte Carlo stress simulator · {twins.length} entities × {SCENARIOS.length} scenarios × 4k samples
          </span>
        </div>
      </header>

      <div className="relative max-w-6xl mx-auto px-6 py-14">

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(255,122,0,0.08)', border: '1px solid rgba(255,122,0,0.3)' }}>
            <BarChart3 className="w-3 h-3 text-[#ff7a00]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#ff7a00]">
              Synthetic stress test · 10,000-trial Monte Carlo
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.5rem, 6.5vw, 5rem)', lineHeight: 0.95 }}>
            <span className="text-white">What survives</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #ff7a00 0%, #ff3366 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(255,122,0,0.3))',
            }}>the next stress?</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl mx-auto leading-relaxed">
            For each Book entity, we run 10,000 synthetic trajectories under six named stress
            scenarios. The output is a probability distribution of survival, expected loss, and
            time-to-collapse — institutional risk modelling, published openly.
          </p>
        </div>

        {/* SCENARIOS LEGEND */}
        <section className="mb-10">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#ff7a00] font-black mb-4">Six stress scenarios</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {SCENARIOS.map(s => (
              <div key={s.id} className="rounded-xl p-4"
                style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,122,0,0.2)', backdropFilter: 'blur(8px)' }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[12px] font-bold text-white">{s.label}</div>
                  <div className="text-[9px] uppercase tracking-wider text-[#ff7a00] font-mono">{s.short}</div>
                </div>
                <div className="text-[11px] text-[rgba(255,255,255,0.6)] leading-relaxed">{s.description}</div>
              </div>
            ))}
          </div>
        </section>

        {/* LEAST RESILIENT */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[#ff3366] font-black">Least Resilient · top 10</div>
            <TrendingDown className="w-4 h-4 text-[#ff3366]" />
          </div>
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,51,102,0.25)', backdropFilter: 'blur(10px)' }}>
            {worst.map(t => <Row key={t.prophecy_id} t={t} accent="#ff3366" />)}
          </div>
        </section>

        {/* MOST RESILIENT */}
        <section className="mb-10">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#00ff88] font-black mb-4">Most Resilient · top 10</div>
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(0,255,136,0.2)', backdropFilter: 'blur(10px)' }}>
            {best.map(t => <Row key={t.prophecy_id} t={t} accent="#00ff88" />)}
          </div>
        </section>

        {/* WHY MATTERS */}
        <section className="rounded-2xl p-6"
          style={{ background: 'rgba(255,122,0,0.04)', border: '1px solid rgba(255,122,0,0.25)', backdropFilter: 'blur(10px)' }}>
          <BarChart3 className="w-5 h-5 text-[#ff7a00] mb-3" />
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#ff7a00] font-black mb-2">Why investors recognise this shape immediately</div>
          <p className="text-[13px] text-[rgba(255,255,255,0.75)] leading-relaxed mb-3">
            Citadel runs Monte Carlo stress tests internally. Bridgewater runs them. Apollo runs them.
            None of them publish results. <strong className="text-white">Genesis Twin publishes the
            same model class openly</strong>, at a public-data-only resolution, for every named
            EU entity. This is institutional risk modelling delivered as a free public good.
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.6)] leading-relaxed mb-3">
            For LPs deciding which funds to allocate to, this is the question the bank&apos;s annual
            risk report half-answers: <em>what happens to my exposure if rates jump 200bp tomorrow?
            What happens if a tier-1 counterparty fails?</em> Today the only honest answer is "run
            it yourself." Genesis Twin makes the answer one URL.
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.55)] leading-relaxed">
            Premium tier: per-fund Monte Carlo runs at 100k samples with custom scenarios
            (€10K-€50K per fund per year). Genesis Twin is the line item where the model becomes
            a product an LP&apos;s risk committee actually buys.
          </p>
        </section>

      </div>
    </div>
  )
}

function Row({ t, accent }: { t: ReturnType<typeof import('@/lib/twin').runTwin>; accent: string }) {
  const worstScenario = SCENARIOS.find(s => s.id === t.weakest_scenario_id)
  const worstOutcome = t.outcomes.find(o => o.scenario_id === t.weakest_scenario_id)!
  return (
    <Link href={`/twin/${t.prophecy_id}`}
      className="block px-4 py-3 transition-all hover:bg-[rgba(255,255,255,0.03)]"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-white truncate">{t.entity}</div>
          <div className="flex items-center gap-2 text-[10px] mt-0.5">
            <span className="text-[rgba(255,255,255,0.45)]">{t.category.replace('_', ' ')}</span>
            <span className="text-[rgba(255,255,255,0.25)]">·</span>
            <span className="text-[rgba(255,255,255,0.45)]">PCI {t.pre_crime_index}</span>
            <span className="text-[rgba(255,255,255,0.25)]">·</span>
            <span className="text-[rgba(255,255,255,0.45)]">weakest: <span className="text-[#ff7a00]">{worstScenario?.label}</span> · {(worstOutcome.survival_prob * 100).toFixed(0)}% survives</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">resilience</div>
          <div className="text-2xl font-black font-mono leading-none" style={{ color: accent }}>{t.aggregate_resilience}</div>
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-[rgba(255,255,255,0.3)] shrink-0" />
      </div>
    </Link>
  )
}
