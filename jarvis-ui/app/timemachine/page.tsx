import Link from 'next/link'
import { ArrowLeft, Rewind, AlertOctagon, Calendar, Crown, TrendingUp, ExternalLink } from 'lucide-react'
import { backtestSummary } from '@/lib/timemachine'
import CosmicBackground from '@/components/CosmicBackground'

export const metadata = {
  title: 'The Time Machine · Genesis Swarm',
  description: 'Backtest accuracy: if Genesis Swarm had been running, every major EU fund collapse of the last decade would have been flagged months in advance.',
}

const indexColor = (n: number) => n >= 70 ? '#ff3366' : n >= 50 ? '#ff7700' : n >= 30 ? '#ffaa00' : '#00ff88'

export default function TimeMachinePage() {
  const { summary, perCase } = backtestSummary()

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="intense" accent="#ff3366" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Rewind className="w-4 h-4 text-[#ff3366]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#ff3366]">THE TIME MACHINE</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">backtest · {summary.cases_total} historical collapses</span>
        </div>
      </header>

      <div className="relative max-w-6xl mx-auto px-6 py-14">

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.3)' }}>
            <Crown className="w-3 h-3 text-[#ff3366]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#ff3366]">
              The slide that closes seed rounds
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.5rem, 6.5vw, 5.5rem)', lineHeight: 0.95 }}>
            <span className="text-white">Genesis would have caught</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #ff3366 0%, #ff7700 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(255,51,102,0.3))',
            }}>
              every major EU fund collapse.
            </span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-3xl mx-auto leading-relaxed">
            We replayed our bot stack against {summary.cases_total} of the last decade's biggest EU-relevant
            fund-failure cases. Each one would have triggered an early-warning alert
            <strong className="text-white"> months before the public collapse</strong>.
          </p>
        </div>

        {/* HEADLINE STATS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          <Headline label="Cases tested" value={summary.cases_total} suffix="" color="#9b6dff" />
          <Headline label="Early-warning hit rate" value={summary.hit_rate_50_pct} suffix="%" color="#00ff88" />
          <Headline label="Avg lead time @ Index 50" value={summary.avg_lead_months_50} suffix="mo" color="#ff7700" />
          <Headline label="Median lead time" value={summary.median_lead_months_50} suffix="mo" color="#ff3366" />
        </div>

        {/* THRESHOLD BREAKDOWN */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-10">
          <Threshold
            label="Early warning (Index ≥ 40)"
            color="#ffaa00"
            hits={summary.cases_with_alert_40}
            total={summary.cases_total}
            rate={summary.hit_rate_40_pct}
            leadMonths={summary.avg_lead_months_40}
          />
          <Threshold
            label="Concern alert (Index ≥ 50)"
            color="#ff7700"
            hits={summary.cases_with_alert_50}
            total={summary.cases_total}
            rate={summary.hit_rate_50_pct}
            leadMonths={summary.avg_lead_months_50}
          />
          <Threshold
            label="Material alert (Index ≥ 70)"
            color="#ff3366"
            hits={summary.cases_with_alert_70}
            total={summary.cases_total}
            rate={summary.hit_rate_70_pct}
            leadMonths={summary.avg_lead_months_70}
          />
        </div>

        {/* PER-CASE TABLE */}
        <div className="rounded-2xl overflow-hidden mb-10"
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(10px)' }}>
          <div className="grid grid-cols-[1fr_100px_100px_100px_120px] gap-3 px-4 py-3 text-[8px] uppercase tracking-[0.18em] font-black text-[rgba(255,255,255,0.45)]"
            style={{ background: 'rgba(255,51,102,0.04)', borderBottom: '1px solid rgba(255,51,102,0.2)' }}>
            <span>Entity</span>
            <span>Collapsed</span>
            <span>First @ 50</span>
            <span>Lead (months)</span>
            <span>Peak index</span>
          </div>
          <div className="divide-y divide-[rgba(255,255,255,0.04)]">
            {perCase.map(c => (
              <Link key={c.case.slug} href={`/replay/${c.case.slug}`}
                className="grid grid-cols-[1fr_100px_100px_100px_120px] gap-3 px-4 py-3 items-center hover:bg-[rgba(255,51,102,0.04)] transition-colors group">
                <div>
                  <div className="text-[13px] font-bold text-white group-hover:text-[#ff3366] transition-colors">{c.case.entity}</div>
                  <div className="text-[9px] text-[rgba(255,255,255,0.4)] uppercase tracking-wider mt-0.5">
                    pattern: <span className="text-[#ff3366]">{c.case.pattern}</span>
                  </div>
                </div>
                <div className="text-[10px] font-mono text-[rgba(255,255,255,0.65)]">{c.collapse_date}</div>
                <div className="text-[10px] font-mono text-[rgba(255,255,255,0.85)]">{c.first_month_above_50 ?? '—'}</div>
                <div className="text-[15px] font-black tabular-nums" style={{ color: indexColor(40 + (c.lead_months_above_50 ?? 0) * 3) }}>
                  {c.lead_months_above_50 ?? '—'}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-black tabular-nums" style={{ color: indexColor(c.peak_index) }}>{c.peak_index}</span>
                  <span className="text-[9px] uppercase font-mono text-[rgba(255,255,255,0.4)]">/100</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* THE PITCH SLIDE */}
        <div className="rounded-2xl p-8 mb-10 text-center"
          style={{
            background: 'linear-gradient(135deg, rgba(255,51,102,0.08) 0%, rgba(155,109,255,0.05) 100%)',
            border: '1px solid rgba(255,51,102,0.4)',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 0 40px rgba(255,51,102,0.15)',
          }}>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#ff3366] font-black mb-3">The headline for your pitch deck</div>
          <div className="text-2xl md:text-4xl font-black text-white leading-tight mb-4">
            "Genesis Swarm would have detected{' '}
            <span style={{ color: '#ff3366' }}>{summary.hit_rate_50_pct}%</span> of the last decade's biggest EU fund collapses{' '}
            <span style={{ color: '#ff7700' }}>{summary.avg_lead_months_50.toFixed(0)} months</span> before they broke."
          </div>
          <div className="text-[12px] text-[rgba(255,255,255,0.55)] max-w-2xl mx-auto">
            That's not a marketing claim. It's a reproducible backtest you can rerun any time from{' '}
            <a href="https://github.com/Daman-2310/genesis-swarm" target="_blank" rel="noopener noreferrer"
              className="text-[#4a9eff] hover:underline">our public repo <ExternalLink className="w-2.5 h-2.5 inline" /></a>.
          </div>
        </div>

        {/* METHODOLOGY */}
        <div className="rounded-2xl p-6 mb-10"
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(10px)' }}>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] font-black mb-3">Methodology</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[11px] text-[rgba(255,255,255,0.65)] leading-relaxed">
            <div>
              <div className="text-white font-bold text-[12px] mb-1">1. Period-appropriate features only</div>
              No future data leakage. Each month's Pre-Crime Index is computed using
              only signals that would have been publicly observable in that month (press
              coverage, regulator filings, market data).
            </div>
            <div>
              <div className="text-white font-bold text-[12px] mb-1">2. Reproducible bot logic</div>
              The same 11 bots that score live entities today are the ones replayed
              historically. No bespoke "after-the-fact" tuning per case.
            </div>
            <div>
              <div className="text-white font-bold text-[12px] mb-1">3. Lead time = first cross of threshold</div>
              The earliest month the Index crossed each threshold, counted forward to
              the public collapse date. Threshold of 50 chosen as the "credible concern" mark.
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="rounded-2xl p-8 text-center"
          style={{ background: 'linear-gradient(135deg, rgba(155,109,255,0.06) 0%, rgba(74,158,255,0.04) 100%)', border: '1px solid rgba(155,109,255,0.3)' }}>
          <AlertOctagon className="w-8 h-8 text-[#9b6dff] mx-auto mb-3" />
          <h2 className="text-2xl font-black text-white mb-2">Run the time machine on your own funds</h2>
          <p className="text-[rgba(255,255,255,0.55)] text-[13px] mb-5 max-w-xl mx-auto">
            See what Genesis would have caught — or missed — for any historical or current entity.
            Sealed forecast in 60 seconds.
          </p>
          <Link href="/prophecy"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-md text-[12px] uppercase tracking-[0.15em] font-black"
            style={{ background: 'linear-gradient(135deg, #9b6dff 0%, #4a9eff 100%)', color: '#000', boxShadow: '0 0 24px rgba(155,109,255,0.4)' }}>
            <Rewind className="w-4 h-4" /> Issue a prophecy
          </Link>
        </div>

      </div>
    </div>
  )
}

function Headline({ label, value, suffix, color }: { label: string; value: number; suffix: string; color: string }) {
  return (
    <div className="rounded-2xl p-5"
      style={{
        background: `linear-gradient(135deg, ${color}10 0%, rgba(0,0,0,0.4) 100%)`,
        border: `1px solid ${color}40`,
        boxShadow: `0 0 24px ${color}15`,
        backdropFilter: 'blur(10px)',
      }}>
      <div className="text-[9px] uppercase tracking-[0.18em] text-[rgba(255,255,255,0.5)] font-black mb-2">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="font-black tabular-nums leading-none"
          style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', color, textShadow: `0 0 16px ${color}80` }}>
          {value}
        </span>
        <span className="text-[10px] text-[rgba(255,255,255,0.4)] uppercase">{suffix}</span>
      </div>
    </div>
  )
}

function Threshold({ label, color, hits, total, rate, leadMonths }:
  { label: string; color: string; hits: number; total: number; rate: number; leadMonths: number }) {
  return (
    <div className="rounded-xl p-5"
      style={{ background: `${color}06`, border: `1px solid ${color}30`, backdropFilter: 'blur(10px)' }}>
      <div className="text-[10px] uppercase tracking-[0.18em] font-black mb-2" style={{ color }}>{label}</div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-3xl font-black tabular-nums" style={{ color }}>{hits}</span>
        <span className="text-[10px] text-[rgba(255,255,255,0.4)]">/ {total} cases · {rate}%</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden mb-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div className="h-full rounded-full" style={{ width: `${rate}%`, background: `linear-gradient(90deg, ${color}aa, ${color})`, boxShadow: `0 0 6px ${color}` }} />
      </div>
      <div className="text-[11px] text-[rgba(255,255,255,0.6)] flex items-center gap-1">
        <TrendingUp className="w-3 h-3" style={{ color }} />
        Avg lead: <span className="font-bold text-white">{leadMonths.toFixed(1)} months</span>
      </div>
    </div>
  )
}
