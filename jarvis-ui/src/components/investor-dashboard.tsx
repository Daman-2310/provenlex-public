'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  TrendingUp,
  Users,
  DollarSign,
  Percent,
  BarChart3,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  type TooltipProps,
} from 'recharts'

// ─── Data Layer ────────────────────────────────────────────────────────────────

interface MrrDataPoint {
  month: string
  mrr: number
  newBusiness: number
  expansion: number
  churn: number
  netNew: number
}

interface CohortDataPoint {
  segment: string
  ltv: number
  cac: number
  ratio: number
  paybackMonths: number
}

const MRR_LEDGER: MrrDataPoint[] = [
  {
    month: 'Nov 24',
    mrr: 18_400,
    newBusiness: 4_200,
    expansion: 1_100,
    churn: -620,
    netNew: 4_680,
  },
  {
    month: 'Dec 24',
    mrr: 23_080,
    newBusiness: 5_800,
    expansion: 1_440,
    churn: -560,
    netNew: 6_680,
  },
  {
    month: 'Jan 25',
    mrr: 29_760,
    newBusiness: 7_200,
    expansion: 1_920,
    churn: -440,
    netNew: 8_680,
  },
  {
    month: 'Feb 25',
    mrr: 38_440,
    newBusiness: 9_600,
    expansion: 2_580,
    churn: -500,
    netNew: 11_680,
  },
  {
    month: 'Mar 25',
    mrr: 50_120,
    newBusiness: 12_800,
    expansion: 3_240,
    churn: -360,
    netNew: 15_680,
  },
  {
    month: 'Apr 25',
    mrr: 65_800,
    newBusiness: 16_400,
    expansion: 4_120,
    churn: -840,
    netNew: 19_680,
  },
]

const COHORT_LEDGER: CohortDataPoint[] = [
  {
    segment: 'Boutique Funds\n(<$50M AUM)',
    ltv: 28_800,
    cac: 4_200,
    ratio: 6.86,
    paybackMonths: 7,
  },
  {
    segment: 'Mid-Market\n($50–250M)',
    ltv: 86_400,
    cac: 9_800,
    ratio: 8.82,
    paybackMonths: 9,
  },
  {
    segment: 'Upper-Mid\n($250M–1B)',
    ltv: 216_000,
    cac: 22_400,
    ratio: 9.64,
    paybackMonths: 11,
  },
  {
    segment: 'Institutional\n(>$1B AUM)',
    ltv: 648_000,
    cac: 54_000,
    ratio: 12.0,
    paybackMonths: 14,
  },
]

// ─── Utility ───────────────────────────────────────────────────────────────────

function formatCurrency(value: number, compact = false): string {
  if (compact) {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
    return `$${value.toFixed(0)}`
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatPercent(value: number, decimals = 1): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`
}

function momGrowth(current: number, prior: number): number {
  if (prior === 0) return 0
  return ((current - prior) / prior) * 100
}

// ─── Custom Tooltip Components ─────────────────────────────────────────────────

function MrrTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="bg-zinc-900 border border-emerald-500/25 rounded-md px-4 py-3 shadow-2xl font-mono text-[11px]">
      <p className="text-zinc-400 uppercase tracking-widest mb-2">{label}</p>
      {payload.map(entry => (
        <div key={entry.dataKey} className="flex justify-between gap-6 mb-1">
          <span style={{ color: entry.color as string }}>{entry.name}</span>
          <span className="text-white font-bold">
            {formatCurrency(entry.value as number, true)}
          </span>
        </div>
      ))}
    </div>
  )
}

function CohortTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null
  const cohort = COHORT_LEDGER.find(c => c.segment.replace('\n', ' ') === label) ?? COHORT_LEDGER[0]
  return (
    <div className="bg-zinc-900 border border-emerald-500/25 rounded-md px-4 py-3 shadow-2xl font-mono text-[11px]">
      <p className="text-zinc-400 uppercase tracking-widest mb-2">{label}</p>
      {payload.map(entry => (
        <div key={entry.dataKey} className="flex justify-between gap-6 mb-1">
          <span style={{ color: entry.color as string }}>{entry.name}</span>
          <span className="text-white font-bold">
            {formatCurrency(entry.value as number, true)}
          </span>
        </div>
      ))}
      {cohort && (
        <>
          <div className="border-t border-zinc-700 my-2" />
          <div className="flex justify-between gap-4">
            <span className="text-zinc-400">LTV:CAC</span>
            <span className="text-emerald-400 font-bold">{cohort.ratio.toFixed(2)}×</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-zinc-400">Payback</span>
            <span className="text-amber-400 font-bold">{cohort.paybackMonths}mo</span>
          </div>
        </>
      )}
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

type DeltaDirection = 'up' | 'down' | 'flat'

interface KpiCardProps {
  icon: React.ElementType
  label: string
  value: string
  delta: number
  deltaLabel: string
  deltaPositiveIsGood?: boolean
  accentColor: 'emerald' | 'red' | 'amber' | 'blue'
  footnote?: string
}

const ACCENT_STYLES: Record<KpiCardProps['accentColor'], { border: string; icon: string; badge: string }> = {
  emerald: {
    border: 'border-emerald-500/30',
    icon: 'text-emerald-400',
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  red: {
    border: 'border-red-500/30',
    icon: 'text-red-400',
    badge: 'bg-red-500/10 text-red-400 border-red-500/20',
  },
  amber: {
    border: 'border-amber-500/30',
    icon: 'text-amber-400',
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  blue: {
    border: 'border-blue-500/30',
    icon: 'text-blue-400',
    badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
}

function KpiCard({
  icon: Icon,
  label,
  value,
  delta,
  deltaLabel,
  deltaPositiveIsGood = true,
  accentColor,
  footnote,
}: KpiCardProps) {
  const styles = ACCENT_STYLES[accentColor]
  const direction: DeltaDirection =
    Math.abs(delta) < 0.01 ? 'flat' : delta > 0 ? 'up' : 'down'
  const isGood =
    direction === 'flat'
      ? true
      : deltaPositiveIsGood
        ? direction === 'up'
        : direction === 'down'

  const DeltaIcon =
    direction === 'up'
      ? ArrowUpRight
      : direction === 'down'
        ? ArrowDownRight
        : Minus

  return (
    <div
      className={`bg-zinc-950 border ${styles.border} rounded-xl p-5 flex flex-col gap-3
        hover:border-opacity-60 transition-colors duration-200`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg bg-zinc-900 ${styles.icon}`}>
            <Icon className="w-4 h-4" />
          </div>
          <span className="font-sans text-xs font-medium text-zinc-400 uppercase tracking-wider">
            {label}
          </span>
        </div>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-mono font-bold
            ${isGood ? styles.badge : 'bg-red-500/10 text-red-400 border-red-500/20'}`}
        >
          <DeltaIcon className="w-2.5 h-2.5" />
          {formatPercent(Math.abs(delta))} {deltaLabel}
        </span>
      </div>

      <div>
        <p className="font-mono text-2xl font-bold text-white tracking-tight leading-none">
          {value}
        </p>
        {footnote && (
          <p className="font-sans text-[11px] text-zinc-500 mt-1.5">{footnote}</p>
        )}
      </div>
    </div>
  )
}

// ─── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, tag }: { title: string; subtitle: string; tag?: string }) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h3 className="font-sans text-sm font-semibold text-white">{title}</h3>
        <p className="font-sans text-[11px] text-zinc-500 mt-0.5">{subtitle}</p>
      </div>
      {tag && (
        <span className="font-mono text-[9px] uppercase tracking-widest text-emerald-500 border border-emerald-500/25 bg-emerald-500/5 px-2 py-1 rounded-md">
          {tag}
        </span>
      )}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function InvestorDashboard() {
  const [activeSegment, setActiveSegment] = useState<string | null>(null)

  const latestMrr = MRR_LEDGER[MRR_LEDGER.length - 1]!
  const priorMrr = MRR_LEDGER[MRR_LEDGER.length - 2]!

  const currentMrr = latestMrr.mrr
  const mrrMom = momGrowth(currentMrr, priorMrr.mrr)

  const grossChurnRate = useMemo(() => {
    const totalChurnAbs = MRR_LEDGER.reduce((acc, d) => acc + Math.abs(d.churn), 0)
    const avgMrr = MRR_LEDGER.reduce((acc, d) => acc + d.mrr, 0) / MRR_LEDGER.length
    return (totalChurnAbs / (avgMrr * MRR_LEDGER.length)) * 100
  }, [])

  const blendedCac = useMemo(() => {
    const totalLtv = COHORT_LEDGER.reduce((acc, c) => acc + c.ltv, 0)
    const totalCac = COHORT_LEDGER.reduce((acc, c) => acc + c.cac, 0)
    return { cac: totalCac / COHORT_LEDGER.length, ratio: totalLtv / totalCac }
  }, [])

  const cacMom = -12.4

  const cohortChartData = useMemo(
    () =>
      COHORT_LEDGER.map(c => ({
        segment: c.segment.replace('\n', ' '),
        LTV: c.ltv,
        CAC: c.cac,
        ratio: c.ratio,
        paybackMonths: c.paybackMonths,
      })),
    [],
  )

  const handleBarClick = useCallback((data: { activePayload?: Array<{ payload: { segment: string } }> }) => {
    const seg = data?.activePayload?.[0]?.payload?.segment ?? null
    setActiveSegment(prev => (prev === seg ? null : seg))
  }, [])

  const selectedCohort = activeSegment
    ? COHORT_LEDGER.find(c => c.segment.replace('\n', ' ') === activeSegment)
    : null

  return (
    <div className="bg-zinc-950 text-white p-6 rounded-2xl border border-zinc-800 space-y-8 font-mono">

      {/* ── Masthead ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="font-sans text-base font-bold text-white tracking-tight">
              Investor Analytics Suite
            </h2>
            <p className="font-sans text-[11px] text-zinc-500 mt-0.5">
              Genesis Swarm · Unit Economics · 6-Month Trailing
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-6 font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
          <span>ARR Run-Rate</span>
          <span className="text-emerald-400 text-sm font-bold">
            {formatCurrency(currentMrr * 12, true)}
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Live</span>
        </div>
      </div>

      {/* ── KPI Grid ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          icon={DollarSign}
          label="Monthly Recurring Revenue"
          value={formatCurrency(currentMrr, true)}
          delta={mrrMom}
          deltaLabel="MoM"
          deltaPositiveIsGood
          accentColor="emerald"
          footnote={`Net new: ${formatCurrency(latestMrr.netNew, true)} · Expansion: ${formatCurrency(latestMrr.expansion, true)}`}
        />
        <KpiCard
          icon={Percent}
          label="Gross Logo Churn Rate"
          value={`${grossChurnRate.toFixed(2)}%`}
          delta={-0.31}
          deltaLabel="MoM"
          deltaPositiveIsGood={false}
          accentColor="emerald"
          footnote="Monthly weighted avg across 6-month cohort window"
        />
        <KpiCard
          icon={Users}
          label="Blended CAC"
          value={formatCurrency(blendedCac.cac, true)}
          delta={cacMom}
          deltaLabel="MoM"
          deltaPositiveIsGood={false}
          accentColor="amber"
          footnote="Sales + marketing fully-loaded across all AUM segments"
        />
        <KpiCard
          icon={TrendingUp}
          label="LTV : CAC Multiplier"
          value={`${blendedCac.ratio.toFixed(2)}×`}
          delta={8.7}
          deltaLabel="MoM"
          deltaPositiveIsGood
          accentColor="blue"
          footnote={`Institutional cohort peak: ${COHORT_LEDGER[COHORT_LEDGER.length - 1]!.ratio.toFixed(2)}× · Payback <14mo`}
        />
      </div>

      {/* ── MRR Trajectory ─────────────────────────────────────────────────────── */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
        <SectionHeader
          title="MRR Growth Trajectory"
          subtitle="6-month trailing revenue motion — new business, expansion, and gross churn decomposition"
          tag="6-Mo Ledger"
        />
        <ResponsiveContainer width="100%" height={280}>
          <LineChart
            data={MRR_LEDGER}
            margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.05)"
              vertical={false}
            />
            <XAxis
              dataKey="month"
              tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
              axisLine={{ stroke: 'rgba(255,255,255,0.07)' }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={v => formatCurrency(v as number, true)}
              tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip content={<MrrTooltip />} />
            <Legend
              wrapperStyle={{
                fontSize: 10,
                fontFamily: 'JetBrains Mono, monospace',
                color: '#a1a1aa',
                paddingTop: 16,
              }}
            />
            <Line
              type="monotone"
              dataKey="mrr"
              name="Total MRR"
              stroke="#10b981"
              strokeWidth={2.5}
              dot={{ fill: '#10b981', r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: '#10b981', stroke: '#065f46', strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="newBusiness"
              name="New Business"
              stroke="#60a5fa"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false}
              activeDot={{ r: 4, fill: '#60a5fa' }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="expansion"
              name="Expansion MRR"
              stroke="#a78bfa"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false}
              activeDot={{ r: 4, fill: '#a78bfa' }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="churn"
              name="Gross Churn"
              stroke="#f87171"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 4, fill: '#f87171' }}
              isAnimationActive={false}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── LTV vs CAC Cohort Chart ────────────────────────────────────────────── */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
        <SectionHeader
          title="LTV vs CAC — Cohort Cross-Section"
          subtitle="Customer unit retention proof across AUM segments. Click a bar to drill into cohort detail."
          tag="Unit Economics"
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={cohortChartData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                onClick={handleBarClick}
                style={{ cursor: 'pointer' }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis
                  dataKey="segment"
                  tick={{ fill: '#71717a', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.07)' }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={v => formatCurrency(v as number, true)}
                  tick={{ fill: '#71717a', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip content={<CohortTooltip />} />
                <Legend
                  wrapperStyle={{
                    fontSize: 10,
                    fontFamily: 'JetBrains Mono, monospace',
                    color: '#a1a1aa',
                    paddingTop: 12,
                  }}
                />
                <Bar
                  dataKey="LTV"
                  name="Lifetime Value"
                  fill="#10b981"
                  fillOpacity={0.85}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="CAC"
                  name="Acq. Cost"
                  fill="#60a5fa"
                  fillOpacity={0.85}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-col gap-3">
            {selectedCohort ? (
              <div className="bg-zinc-950 border border-emerald-500/25 rounded-xl p-4 space-y-3">
                <p className="font-sans text-xs font-semibold text-white">
                  {selectedCohort.segment.replace('\n', ' ')}
                </p>
                <div className="space-y-2">
                  {[
                    { label: 'Lifetime Value', value: formatCurrency(selectedCohort.ltv), color: 'text-emerald-400' },
                    { label: 'Acquisition Cost', value: formatCurrency(selectedCohort.cac), color: 'text-blue-400' },
                    { label: 'LTV : CAC', value: `${selectedCohort.ratio.toFixed(2)}×`, color: 'text-violet-400' },
                    { label: 'Payback Period', value: `${selectedCohort.paybackMonths} months`, color: 'text-amber-400' },
                    {
                      label: 'Annual Gross Margin',
                      value: `${(((selectedCohort.ltv - selectedCohort.cac) / selectedCohort.ltv) * 100).toFixed(1)}%`,
                      color: 'text-emerald-400',
                    },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex justify-between items-center font-mono text-[11px]">
                      <span className="text-zinc-500">{label}</span>
                      <span className={`font-bold ${color}`}>{value}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setActiveSegment(null)}
                  className="w-full mt-1 text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors uppercase tracking-wider"
                >
                  Clear ×
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {COHORT_LEDGER.map(c => {
                  const ratioFill = Math.min((c.ratio / 14) * 100, 100)
                  return (
                    <button
                      key={c.segment}
                      onClick={() => setActiveSegment(c.segment.replace('\n', ' '))}
                      className="bg-zinc-950 border border-zinc-800 hover:border-emerald-500/35 rounded-lg p-3
                        text-left transition-colors duration-150 group"
                    >
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="font-sans text-[11px] text-zinc-400 group-hover:text-zinc-200 transition-colors">
                          {c.segment.replace('\n', ' ')}
                        </span>
                        <span className="font-mono text-[11px] font-bold text-emerald-400">
                          {c.ratio.toFixed(2)}×
                        </span>
                      </div>
                      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${ratioFill}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1.5 font-mono text-[9px] text-zinc-600">
                        <span>CAC {formatCurrency(c.cac, true)}</span>
                        <span>{c.paybackMonths}mo payback</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 mt-auto">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-sans text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                  Blended Portfolio
                </span>
              </div>
              {[
                { label: 'Avg LTV : CAC', value: `${blendedCac.ratio.toFixed(2)}×`, color: 'text-emerald-400' },
                { label: 'Avg CAC', value: formatCurrency(blendedCac.cac, true), color: 'text-blue-400' },
                { label: 'Gross Churn', value: `${grossChurnRate.toFixed(2)}%/mo`, color: 'text-amber-400' },
                { label: 'Net Revenue Ret.', value: '118%', color: 'text-violet-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex justify-between items-center font-mono text-[10px] mb-1">
                  <span className="text-zinc-600">{label}</span>
                  <span className={`font-bold ${color}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── CAC Payback Velocity ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {COHORT_LEDGER.map(c => {
          const efficiencyScore = Math.min(100, (c.ratio / 14) * 100)
          const efficiencyColor =
            efficiencyScore >= 80
              ? 'text-emerald-400'
              : efficiencyScore >= 60
                ? 'text-amber-400'
                : 'text-red-400'
          const trackColor =
            efficiencyScore >= 80
              ? 'bg-emerald-500'
              : efficiencyScore >= 60
                ? 'bg-amber-500'
                : 'bg-red-500'
          return (
            <div
              key={c.segment}
              className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-2"
            >
              <p className="font-sans text-[10px] text-zinc-500 uppercase tracking-wider leading-tight">
                {c.segment.replace('\n', ' ')}
              </p>
              <p className={`font-mono text-xl font-bold leading-none ${efficiencyColor}`}>
                {c.paybackMonths}
                <span className="text-xs font-normal text-zinc-500 ml-1">mo</span>
              </p>
              <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${trackColor}`}
                  style={{ width: `${Math.min(100, (18 - c.paybackMonths) * 7)}%` }}
                />
              </div>
              <div className="flex justify-between font-mono text-[9px]">
                <span className="text-zinc-600">CAC payback</span>
                <span className={efficiencyColor}>{c.ratio.toFixed(1)}×</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Footer Attestation ────────────────────────────────────────────────── */}
      <div className="border-t border-zinc-800 pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">
            Genesis Swarm · Sovereign Grade · CSSF DORA Compliant
          </span>
        </div>
        <span className="font-mono text-[10px] text-zinc-700 uppercase tracking-widest">
          Simulated cohort data · Apr 2025 snapshot · v0.5.0
        </span>
      </div>
    </div>
  )
}
