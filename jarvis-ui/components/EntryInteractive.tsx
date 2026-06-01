'use client'

import { useState } from 'react'
import { Cpu, BarChart3, Eye } from 'lucide-react'
import TimeSeriesChart from './TimeSeriesChart'
import ExplainabilityModal from './ExplainabilityModal'

interface BotContribution {
  bot: string
  display_name: string
  weight: number
  signal: number
  contribution: number
  domain: string
  data_source: string
  data_source_url: string
  reasoning: string
  fired: boolean
}

interface ScoreBreakdown {
  entity: string
  prophecy_id: string
  total_score: number
  reconstructed_score: number
  algorithm: string
  confidence: number
  computed_at: string
  contributions: BotContribution[]
}

interface TimePoint {
  date: string
  pre_crime_index: number
  delta_from_prior: number
  events: { kind: string; label: string }[]
}

interface TimeSeries {
  points: TimePoint[]
  current_score: number
  trajectory: 'RISING' | 'FALLING' | 'HOLDING'
  high: { date: string; value: number }
  low: { date: string; value: number }
}

interface Props {
  breakdown: ScoreBreakdown
  timeseries: TimeSeries
}

export default function EntryInteractive({ breakdown, timeseries }: Props) {
  const [showExplain, setShowExplain] = useState(false)

  return (
    <>
      {/* TIME SERIES CHART */}
      <div className="rounded-2xl p-6 mb-8"
        style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(155,109,255,0.25)', backdropFilter: 'blur(10px)' }}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#9b6dff]" />
            <span className="text-[11px] uppercase tracking-[0.2em] text-[#9b6dff] font-black">Operational-risk trajectory</span>
          </div>
        </div>
        <TimeSeriesChart
          points={timeseries.points}
          currentScore={timeseries.current_score}
          trajectory={timeseries.trajectory}
          high={timeseries.high}
          low={timeseries.low}
        />
      </div>

      {/* EXPLAIN BUTTON */}
      <div className="rounded-2xl p-6 mb-8"
        style={{
          background: 'linear-gradient(135deg, rgba(155,109,255,0.06) 0%, rgba(74,158,255,0.04) 100%)',
          border: '1px solid rgba(155,109,255,0.3)',
          backdropFilter: 'blur(10px)',
        }}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Cpu className="w-4 h-4 text-[#9b6dff]" />
              <span className="text-[11px] uppercase tracking-[0.2em] text-[#9b6dff] font-black">Show the work</span>
            </div>
            <div className="text-[13px] text-[rgba(255,255,255,0.7)]">
              See exactly how the 11 Genesis bots contributed to this score — with weights, data sources, and reasoning.
            </div>
          </div>
          <button onClick={() => setShowExplain(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[11px] uppercase tracking-[0.15em] font-black shrink-0"
            style={{
              background: 'linear-gradient(135deg, #9b6dff 0%, #4a9eff 100%)',
              color: '#000',
              boxShadow: '0 0 24px rgba(155,109,255,0.4)',
            }}>
            <Eye className="w-3.5 h-3.5" /> Explain this score
          </button>
        </div>

        {/* Inline preview: top 3 contributors */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-2">
          {breakdown.contributions.slice(0, 3).map(c => {
            const color = c.signal >= 70 ? '#ff3366' : c.signal >= 50 ? '#ff7700' : c.signal >= 30 ? '#ffaa00' : '#00ff88'
            return (
              <div key={c.bot} className="rounded-lg p-3"
                style={{ background: `${color}06`, border: `1px solid ${color}25` }}>
                <div className="text-[9px] uppercase tracking-wider font-black mb-1" style={{ color }}>
                  {c.display_name}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black tabular-nums" style={{ color }}>{c.signal}</span>
                  <span className="text-[9px] uppercase font-mono text-[rgba(255,255,255,0.4)]">signal · wt {c.weight}</span>
                </div>
                <div className="text-[10px] text-[rgba(255,255,255,0.55)] mt-1 line-clamp-2 leading-snug">{c.reasoning}</div>
              </div>
            )
          })}
        </div>
      </div>

      {showExplain && (
        <ExplainabilityModal breakdown={breakdown} onClose={() => setShowExplain(false)} />
      )}
    </>
  )
}
