import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, BarChart3, AlertTriangle, ChevronRight } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'
import { getTwin, SCENARIOS } from '@/lib/twin'
import type { TwinScenarioOutcome } from '@/lib/twin'
import { BOOK_SNAPSHOT_ENTRIES } from '@/lib/book-snapshot'

export const dynamic = 'force-static'

export async function generateStaticParams() {
  return BOOK_SNAPSHOT_ENTRIES.map(e => ({ id: e.prophecy_id }))
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t = getTwin(id, 4000)
  return {
    title: t ? `Twin · ${t.entity} · Resilience ${t.aggregate_resilience}` : 'Twin · not found',
    description: t ? `Monte Carlo stress test across 6 scenarios for ${t.entity}.` : '',
  }
}

export default async function TwinDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t = getTwin(id, 10000)
  if (!t) notFound()

  const colorForRes = t.aggregate_resilience >= 70 ? '#00ff88' : t.aggregate_resilience >= 40 ? '#ffaa00' : '#ff3366'

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent={colorForRes} />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/twin" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> All Twins
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <BarChart3 className="w-4 h-4" style={{ color: colorForRes }} />
          <span className="text-sm font-bold tracking-[0.18em]" style={{ color: colorForRes }}>TWIN DETAIL</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">
            10,000-trial Monte Carlo · per scenario · category-vulnerability weighted
          </span>
        </div>
      </header>

      <article className="relative max-w-5xl mx-auto px-6 py-10">

        {/* TITLE */}
        <div className="mb-8">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] mb-2">
            {t.category.replace('_', ' ')} · PCI {t.pre_crime_index}
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white mb-4 leading-tight">
            {t.entity}
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-[11px] uppercase tracking-wider font-bold px-3 py-1.5 rounded"
              style={{ background: `${colorForRes}15`, border: `1px solid ${colorForRes}40`, color: colorForRes }}>
              Aggregate Resilience · {t.aggregate_resilience}/100
            </div>
            <div className="text-[11px] uppercase tracking-wider font-bold px-3 py-1.5 rounded"
              style={{ background: 'rgba(255,51,102,0.10)', border: '1px solid rgba(255,51,102,0.3)', color: '#ff3366' }}>
              Weakest · {SCENARIOS.find(s => s.id === t.weakest_scenario_id)?.label}
            </div>
            <Link href={`/book/${t.prophecy_id}`}
              className="ml-auto text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 rounded hover:bg-[rgba(155,109,255,0.08)]"
              style={{ background: 'rgba(155,109,255,0.06)', border: '1px solid rgba(155,109,255,0.3)', color: '#9b6dff' }}>
              Book entry <ChevronRight className="w-3 h-3 inline" />
            </Link>
          </div>
        </div>

        {/* SCENARIOS */}
        <section className="space-y-5">
          {t.outcomes.map(o => {
            const meta = SCENARIOS.find(s => s.id === o.scenario_id)!
            return <ScenarioCard key={o.scenario_id} outcome={o} label={meta.label} short={meta.short} description={meta.description} />
          })}
        </section>

        {/* METHODOLOGY */}
        <section className="mt-10 rounded-xl p-4 text-[11px] text-[rgba(255,255,255,0.5)] leading-relaxed"
          style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-[#ff7a00]" />
            <span className="text-[10px] uppercase tracking-wider font-bold text-[#ff7a00]">Methodology</span>
          </div>
          For each scenario, 10,000 trajectories are simulated. Survival probability per trial =
          sigmoid(robustness × 6 − vulnerability × 5 + noise), where robustness scales inversely
          with Pre-Crime Index and vulnerability scales with category exposure to the named stress.
          Surviving trials still incur a stress loss drawn from a heavy-tailed distribution; failed
          trials draw losses from a higher distribution shifted by PCI. The PRNG is deterministic
          per entity ID + scenario ID, so results are reproducible across page loads.
          <br /><br />
          This is the institutional risk-modelling shape Citadel/Bridgewater/Apollo run internally
          on private data. Genesis Twin runs the same class of model on public data, openly published.
        </section>

      </article>
    </div>
  )
}

function ScenarioCard({ outcome, label, short, description }: { outcome: TwinScenarioOutcome; label: string; short: string; description: string }) {
  const survivalPct = outcome.survival_prob * 100
  const color = survivalPct >= 70 ? '#00ff88' : survivalPct >= 45 ? '#ffaa00' : '#ff3366'
  const max = Math.max(1, ...outcome.histogram)

  return (
    <div className="rounded-2xl p-5"
      style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid ${color}25`, backdropFilter: 'blur(10px)' }}>

      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
        <div>
          <div className="text-[14px] font-bold text-white">{label}</div>
          <div className="text-[10px] uppercase tracking-wider text-[#ff7a00] font-mono">{short}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">Survives</div>
          <div className="text-3xl font-black font-mono" style={{ color }}>{survivalPct.toFixed(0)}%</div>
        </div>
      </div>

      <div className="text-[11px] text-[rgba(255,255,255,0.6)] leading-relaxed mb-4">{description}</div>

      {/* Histogram */}
      <div>
        <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] mb-2 font-bold">Loss distribution · 10,000 trials</div>
        <div className="flex items-end gap-1 h-24">
          {outcome.histogram.map((count, i) => {
            const h = Math.max(2, (count / max) * 100)
            const binColor = i < 3 ? '#00ff88' : i < 5 ? '#ffaa00' : i < 8 ? '#ff7a00' : '#ff3366'
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t" style={{ height: `${h}%`, background: binColor, opacity: 0.85 }} />
                <div className="text-[8px] font-mono text-[rgba(255,255,255,0.4)]">{i * 10}–{(i + 1) * 10}</div>
              </div>
            )
          })}
        </div>
        <div className="text-[9px] text-[rgba(255,255,255,0.35)] mt-2 text-center font-mono">% loss (10k samples)</div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        <Stat label="Expected loss" value={`${outcome.expected_loss_pct}%`} color={color} />
        <Stat label="P50 loss"      value={`${outcome.p50_loss_pct}%`} color={color} />
        <Stat label="P90 loss"      value={`${outcome.p90_loss_pct}%`} color={color} />
      </div>
      {outcome.months_to_collapse_p50 !== null && (
        <div className="mt-3 text-[11px] text-[rgba(255,255,255,0.6)]">
          <span className="text-[#ff3366] font-bold">Among failures:</span>{' '}
          median time-to-collapse is{' '}
          <span className="font-mono font-bold text-white">{outcome.months_to_collapse_p50} months</span>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded p-2.5" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">{label}</div>
      <div className="text-[16px] font-black font-mono mt-0.5" style={{ color }}>{value}</div>
    </div>
  )
}
