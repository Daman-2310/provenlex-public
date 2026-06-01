'use client'

import { useMemo, memo } from 'react'
import clsx from 'clsx'
import {
  ComposedChart,
  Line,
  Area,
  ReferenceLine,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

interface BotCardProps {
  bot: {
    bot_id: string
    bot_type: string
    personality_label: string
    last_score: number
    is_anomaly: boolean
    healthy: boolean
    last_summary: string
    threshold: number
  }
  history: Array<{ ts: number; score: number; is_anomaly: boolean }>
  forecast: {
    forecast: number[]
    upper: number[]
    lower: number[]
    trend: string
    growth_pct: number
    current_score: number
    predicted_peak: number
  } | null
}

// AUM exposure per bot type (€ millions) — for investor demo
const AUM_EXPOSURE: Record<string, number> = {
  NAV_DETECTOR:   2100,
  FX_BOT:         3400,
  SOVEREIGN_BOT:  4500,
  SANCTIONS_BOT:  1200,
  CARGO_BOT:       890,
  COMPLIANCE_BOT:  780,
  SUCCESSION_BOT:  650,
  SHADOW_BOT:      560,
  FUEL_BOT:        450,
  ORBITAL_BOT:     230,
  YACHT_GUARDIAN:  120,
}

function calcAtRisk(botType: string, score: number): number | null {
  const aum = AUM_EXPOSURE[botType]
  if (!aum || score < 40) return null
  return aum * (score / 100) * (score > 75 ? 1.5 : 1.0)
}

function fmtEur(m: number): string {
  if (m >= 1000) return `€${(m / 1000).toFixed(1)}B`
  return `€${Math.round(m)}M`
}

interface ChartDataPoint {
  idx: number
  score: number | null
  forecastScore: number | null
  upperBand: number | null
  lowerBand: number | null
  is_anomaly: boolean
}

function abbreviate(botType: string): string {
  return botType
    .replace(/_BOT$/, '')
    .split('_')
    .map((w) => w[0])
    .join('')
}

// Custom tooltip for the chart
function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number | null; color: string }>
}) {
  if (!active || !payload?.length) return null

  return (
    <div
      style={{
        background: '#0d0d1a',
        border: '1px solid rgba(0,255,136,0.3)',
        padding: '4px 8px',
        fontSize: '9px',
        fontFamily: 'JetBrains Mono, monospace',
        color: '#00ff88',
        textTransform: 'uppercase',
      }}
    >
      {payload.map((p, i) =>
        p.value != null ? (
          <div key={i} style={{ color: p.color }}>
            {p.name}: {p.value.toFixed(3)}
          </div>
        ) : null
      )}
    </div>
  )
}

function BotCardInner({ bot, history, forecast }: BotCardProps) {
  const b = bot as Record<string, unknown>
  const bot_type       = (b.bot_type as string)        ?? 'UNKNOWN'
  const personality_label = (b.personality_label as string) ?? ''
  const last_score     = (b.last_score as number)      ?? 0
  const is_anomaly     = (b.is_anomaly as boolean)     ?? false
  const healthy        = (b.healthy as boolean)        ?? false
  const last_summary   = (b.last_summary as string)    ?? 'OFFLINE'
  const threshold      = (b.threshold as number)       ?? 75

  // Combine history + forecast into a single chart series
  const chartData = useMemo<ChartDataPoint[]>(() => {
    const histPoints: ChartDataPoint[] = history.map((h, i) => ({
      idx: i,
      score: h.score,
      forecastScore: null,
      upperBand: null,
      lowerBand: null,
      is_anomaly: h.is_anomaly,
    }))

    if (forecast) {
      const base = histPoints.length
      const forecastPoints: ChartDataPoint[] = forecast.forecast.map((f, i) => ({
        idx: base + i,
        score: null,
        forecastScore: f,
        upperBand: forecast.upper[i] ?? null,
        lowerBand: forecast.lower[i] ?? null,
        is_anomaly: false,
      }))
      return [...histPoints, ...forecastPoints]
    }

    return histPoints
  }, [history, forecast])

  // Score color logic
  const scoreColor = is_anomaly
    ? '#ff3366'
    : last_score >= threshold
    ? '#ffaa00'
    : '#00ff88'

  const trendIcon =
    forecast?.trend === 'RISING'
      ? '▲'
      : forecast?.trend === 'FALLING'
      ? '▼'
      : '─'

  const trendColor =
    forecast?.trend === 'RISING'
      ? '#ff3366'
      : forecast?.trend === 'FALLING'
      ? '#00ff88'
      : '#4a9eff'

  const shortSummary =
    last_summary.length > 60 ? last_summary.slice(0, 57) + '...' : last_summary

  return (
    <div
      className={clsx(
        'flex flex-col bg-genesis-surface terminal-border card-hover rounded-none',
        'p-0 overflow-hidden relative',
        is_anomaly && 'anomaly-pulse'
      )}
      style={{ minWidth: 0 }}
    >
      {/* ── Status stripe at top ── */}
      <div
        style={{
          height: '2px',
          background: is_anomaly
            ? '#ff3366'
            : healthy
            ? '#00ff88'
            : '#ffaa00',
        }}
      />

      {/* ── Header Row ── */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <div className="flex items-center gap-2">
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: '#00ff88',
            }}
          >
            {bot_type.replace(/_BOT$/, '')}
          </span>
          <span
            className="badge"
            style={{
              background: last_summary === 'CONNECTING'
                ? 'rgba(255,170,0,0.06)'
                : healthy ? 'rgba(0,255,136,0.1)' : 'rgba(255,51,102,0.1)',
              color: last_summary === 'CONNECTING'
                ? 'rgba(255,170,0,0.6)'
                : healthy ? '#00ff88' : '#ff3366',
              border: `1px solid ${last_summary === 'CONNECTING'
                ? 'rgba(255,170,0,0.2)'
                : healthy ? 'rgba(0,255,136,0.3)' : 'rgba(255,51,102,0.3)'}`,
              fontSize: '8px',
            }}
          >
            {last_summary === 'CONNECTING' ? '···' : healthy ? 'ONLINE' : 'DEGRADED'}
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span
            style={{
              fontSize: '14px',
              fontWeight: 700,
              color: scoreColor,
              letterSpacing: '-0.02em',
            }}
          >
            {last_score.toFixed(3)}
          </span>
          {is_anomaly && (
            <span
              className="badge badge-red ml-1"
              style={{ fontSize: '8px', verticalAlign: 'middle' }}
            >
              ANOMALY
            </span>
          )}
        </div>
      </div>

      {/* ── Personality Label ── */}
      <div className="px-3 pb-1">
        <span style={{ fontSize: '9px', color: 'rgba(74,158,255,0.7)', letterSpacing: '0.06em' }}>
          {personality_label.toUpperCase()}
        </span>
        <span style={{ fontSize: '9px', color: 'rgba(0,255,136,0.3)', marginLeft: '8px' }}>
          THR: {threshold.toFixed(2)}
        </span>
      </div>

      {/* ── Chart ── */}
      <div style={{ height: '120px', background: '#0a0a14', borderTop: '1px solid rgba(0,255,136,0.08)', borderBottom: '1px solid rgba(0,255,136,0.08)' }}>
        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
            >
              <XAxis dataKey="idx" hide />
              <YAxis
                tick={{ fontSize: 8, fill: 'rgba(0,255,136,0.3)', fontFamily: 'JetBrains Mono, monospace' }}
                tickLine={false}
                axisLine={false}
                width={32}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
              <Tooltip content={<CustomTooltip />} />

              {/* Confidence band (forecast) */}
              <Area
                dataKey="upperBand"
                stroke="none"
                fill="rgba(255,170,0,0.08)"
                name="UPPER"
                legendType="none"
                isAnimationActive={false}
              />
              <Area
                dataKey="lowerBand"
                stroke="none"
                fill="rgba(255,170,0,0.08)"
                name="LOWER"
                legendType="none"
                isAnimationActive={false}
              />

              {/* Historical score line */}
              <Line
                type="monotone"
                dataKey="score"
                stroke="#4a9eff"
                strokeWidth={1}
                dot={false}
                name="SCORE"
                isAnimationActive={false}
                connectNulls={false}
              />

              {/* Forecast line */}
              <Line
                type="monotone"
                dataKey="forecastScore"
                stroke="#ffaa00"
                strokeWidth={1}
                strokeDasharray="3 2"
                dot={false}
                name="FORECAST"
                isAnimationActive={false}
                connectNulls={false}
              />

              {/* Threshold reference */}
              <ReferenceLine
                y={threshold}
                stroke="rgba(255,51,102,0.5)"
                strokeDasharray="4 2"
                strokeWidth={1}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full" style={{ color: 'rgba(0,255,136,0.2)', fontSize: '9px' }}>
            AWAITING DATA...
          </div>
        )}
      </div>

      {/* ── Forecast Bar ── */}
      {forecast ? (
        <div
          className="px-3 py-1 flex items-center gap-2 flex-wrap"
          style={{ fontSize: '9px', borderBottom: '1px solid rgba(0,255,136,0.08)', background: 'rgba(255,170,0,0.03)' }}
        >
          <span style={{ color: trendColor, fontWeight: 700 }}>
            FORECAST {trendIcon} {((forecast.growth_pct ?? 0) > 0 ? '+' : '')}{(forecast.growth_pct ?? 0).toFixed(1)}%
          </span>
          <span style={{ color: 'rgba(0,255,136,0.4)' }}>|</span>
          <span style={{ color: '#ffaa00' }}>
            PEAK: {(forecast.predicted_peak ?? 0).toFixed(2)}
          </span>
          <span style={{ color: 'rgba(0,255,136,0.4)' }}>|</span>
          <span style={{ color: trendColor }}>
            TREND: {forecast.trend ?? 'STABLE'}
          </span>
        </div>
      ) : (
        <div className="px-3 py-1" style={{ fontSize: '9px', color: 'rgba(0,255,136,0.2)', borderBottom: '1px solid rgba(0,255,136,0.08)' }}>
          NO FORECAST AVAILABLE
        </div>
      )}

      {/* ── €-at-Risk strip ── */}
      {(() => {
        const atRisk = calcAtRisk(bot_type, last_score)
        if (!atRisk) return null
        return (
          <div
            className="px-3 py-1 flex items-center justify-between"
            style={{
              background: is_anomaly ? 'rgba(255,51,102,0.08)' : 'rgba(255,170,0,0.05)',
              borderBottom: '1px solid rgba(0,255,136,0.08)',
            }}
          >
            <span style={{ fontSize: '8px', color: 'rgba(0,255,136,0.4)', letterSpacing: '0.06em' }}>
              AT RISK
            </span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: is_anomaly ? '#ff3366' : '#ffaa00' }}>
              {fmtEur(atRisk)}
            </span>
          </div>
        )
      })()}

      {/* ── Summary ── */}
      <div className="px-3 py-2">
        <p style={{ fontSize: '9px', color: 'rgba(0,255,136,0.5)', lineHeight: '1.4', margin: 0 }}>
          {shortSummary || '—'}
        </p>
      </div>

      {/* ── Abbreviation watermark ── */}
      <div
        style={{
          position: 'absolute',
          bottom: '6px',
          right: '8px',
          fontSize: '28px',
          fontWeight: 700,
          color: 'rgba(0,255,136,0.04)',
          letterSpacing: '-0.02em',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {abbreviate(bot_type)}
      </div>
    </div>
  )
}

export default memo(BotCardInner)
