'use client'

import { useState, useEffect, useRef, useCallback, memo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  type TooltipProps,
} from 'recharts'

export interface TelemetryPoint {
  ts: number
  risk: number
  consensus_ms: number
  bot_health: number
  alerts: number
}

export type TelemetryMetric = keyof Omit<TelemetryPoint, 'ts'>

export interface MetricConfig {
  label: string
  color: string
  unit: string
  domain: [number, number]
  fillOpacity: number
}

export const METRIC_CONFIG: Record<TelemetryMetric, MetricConfig> = {
  risk: {
    label: 'Risk Score',
    color: '#ff3366',
    unit: '%',
    domain: [0, 100],
    fillOpacity: 0.18,
  },
  consensus_ms: {
    label: 'Consensus',
    color: '#00ff88',
    unit: 'ms',
    domain: [0, 200],
    fillOpacity: 0.14,
  },
  bot_health: {
    label: 'Bot Health',
    color: '#4a9eff',
    unit: '%',
    domain: [0, 100],
    fillOpacity: 0.14,
  },
  alerts: {
    label: 'Alerts',
    color: '#ffaa00',
    unit: '',
    domain: [0, 20],
    fillOpacity: 0.18,
  },
}

const DEFAULT_METRICS: TelemetryMetric[] = ['risk', 'consensus_ms', 'bot_health']
const DEFAULT_WINDOW = 60
const DEFAULT_INTERVAL_MS = 1000

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function generateNextPoint(prev: TelemetryPoint | undefined): TelemetryPoint {
  const now = Date.now()
  if (!prev) {
    return {
      ts: now,
      risk: 18 + Math.random() * 25,
      consensus_ms: 6 + Math.random() * 18,
      bot_health: 88 + Math.random() * 11,
      alerts: Math.floor(Math.random() * 4),
    }
  }
  return {
    ts: now,
    risk: clamp(prev.risk + (Math.random() - 0.47) * 7, 0, 100),
    consensus_ms: clamp(prev.consensus_ms + (Math.random() - 0.5) * 9, 1, 200),
    bot_health: clamp(prev.bot_health + (Math.random() - 0.5) * 2.5, 0, 100),
    alerts: clamp(Math.round(prev.alerts + (Math.random() - 0.6) * 1.5), 0, 20),
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  const ss = d.getSeconds().toString().padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

interface CustomTooltipProps extends TooltipProps<number, string> {
  activeMetrics: TelemetryMetric[]
}

const CustomTooltip = memo(function CustomTooltip({
  active,
  payload,
  label,
  activeMetrics,
}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div
      style={{
        background: 'rgba(10,10,18,0.96)',
        border: '1px solid rgba(0,255,136,0.2)',
        borderRadius: 4,
        padding: '8px 12px',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
      }}
    >
      <div style={{ color: 'rgba(0,255,136,0.5)', marginBottom: 4, letterSpacing: '0.08em' }}>
        {typeof label === 'number' ? formatTime(label) : String(label)}
      </div>
      {activeMetrics.map(metric => {
        const cfg = METRIC_CONFIG[metric]
        const entry = payload.find(p => p.dataKey === metric)
        if (!entry) return null
        const value = typeof entry.value === 'number' ? entry.value : 0
        return (
          <div key={metric} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 2 }}>
            <span style={{ color: cfg.color }}>{cfg.label}</span>
            <span style={{ color: '#ffffff', fontWeight: 700 }}>
              {value.toFixed(metric === 'consensus_ms' ? 1 : 0)}{cfg.unit}
            </span>
          </div>
        )
      })}
    </div>
  )
})

interface LegendItemProps {
  metric: TelemetryMetric
  active: boolean
  onToggle: (m: TelemetryMetric) => void
  lastValue: number | null
}

const LegendItem = memo(function LegendItem({ metric, active, onToggle, lastValue }: LegendItemProps) {
  const cfg = METRIC_CONFIG[metric]
  return (
    <button
      onClick={() => onToggle(metric)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        border: `1px solid ${active ? `${cfg.color}40` : 'rgba(0,255,136,0.1)'}`,
        borderRadius: 3,
        background: active ? `${cfg.color}0f` : 'transparent',
        cursor: 'pointer',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        opacity: active ? 1 : 0.4,
        transition: 'all 0.15s ease',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: active ? cfg.color : 'transparent',
          border: `1px solid ${cfg.color}`,
          flexShrink: 0,
        }}
      />
      <span style={{ color: cfg.color }}>{cfg.label}</span>
      {lastValue !== null && active && (
        <span style={{ color: 'rgba(255,255,255,0.6)', marginLeft: 2 }}>
          {lastValue.toFixed(metric === 'consensus_ms' ? 1 : 0)}{cfg.unit}
        </span>
      )}
    </button>
  )
})

export interface TelemetryChartProps {
  externalData?: TelemetryPoint[]
  windowSize?: number
  refreshIntervalMs?: number
  title?: string
  height?: number
  defaultMetrics?: TelemetryMetric[]
  className?: string
  style?: React.CSSProperties
}

export function TelemetryChart({
  externalData,
  windowSize = DEFAULT_WINDOW,
  refreshIntervalMs = DEFAULT_INTERVAL_MS,
  title = 'SWARM TELEMETRY // LIVE',
  height = 220,
  defaultMetrics = DEFAULT_METRICS,
  className = '',
  style,
}: TelemetryChartProps) {
  const [window_, setWindow] = useState<TelemetryPoint[]>(() => {
    const seed = generateNextPoint(undefined)
    return [seed]
  })
  const [activeMetrics, setActiveMetrics] = useState<TelemetryMetric[]>(defaultMetrics)
  const lastRef = useRef<TelemetryPoint | undefined>(undefined)
  const rafRef = useRef<number | null>(null)
  const lastTickRef = useRef<number>(0)

  const tick = useCallback(() => {
    const now = performance.now()
    if (now - lastTickRef.current >= refreshIntervalMs) {
      lastTickRef.current = now
      setWindow(prev => {
        const next = generateNextPoint(lastRef.current ?? prev[prev.length - 1])
        lastRef.current = next
        const updated = [...prev, next]
        return updated.length > windowSize ? updated.slice(updated.length - windowSize) : updated
      })
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [refreshIntervalMs, windowSize])

  useEffect(() => {
    if (externalData) return
    lastTickRef.current = performance.now()
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [tick, externalData])

  const displayData = externalData && externalData.length > 0
    ? externalData.slice(-windowSize)
    : window_

  const lastPoint = displayData[displayData.length - 1]

  const toggleMetric = useCallback((m: TelemetryMetric) => {
    setActiveMetrics(prev =>
      prev.includes(m)
        ? prev.length > 1 ? prev.filter(x => x !== m) : prev
        : [...prev, m],
    )
  }, [])

  const yDomain = activeMetrics.reduce<[number, number]>(
    (acc, m) => {
      const cfg = METRIC_CONFIG[m]
      return [Math.min(acc[0], cfg.domain[0]), Math.max(acc[1], cfg.domain[1])]
    },
    [Infinity, -Infinity],
  )

  return (
    <div
      className={className}
      style={{
        background: '#0a0a12',
        border: '1px solid rgba(0,255,136,0.15)',
        borderRadius: 6,
        padding: '12px 16px',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#00ff88',
              display: 'inline-block',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9,
              color: 'rgba(0,255,136,0.55)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            {title}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {(Object.keys(METRIC_CONFIG) as TelemetryMetric[]).map(m => (
            <LegendItem
              key={m}
              metric={m}
              active={activeMetrics.includes(m)}
              onToggle={toggleMetric}
              lastValue={lastPoint ? lastPoint[m] : null}
            />
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <AreaChart
          data={displayData}
          margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
        >
          <defs>
            {activeMetrics.map(m => {
              const cfg = METRIC_CONFIG[m]
              return (
                <linearGradient key={m} id={`grad-${m}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={cfg.color} stopOpacity={cfg.fillOpacity * 2} />
                  <stop offset="85%" stopColor={cfg.color} stopOpacity={0} />
                </linearGradient>
              )
            })}
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(0,255,136,0.06)"
            vertical={false}
          />

          <XAxis
            dataKey="ts"
            type="number"
            domain={['dataMin', 'dataMax']}
            scale="time"
            tickFormatter={formatTime}
            tick={{ fill: 'rgba(0,255,136,0.3)', fontSize: 8, fontFamily: 'JetBrains Mono, monospace' }}
            tickLine={false}
            axisLine={{ stroke: 'rgba(0,255,136,0.1)' }}
            interval="preserveStartEnd"
            minTickGap={60}
          />

          <YAxis
            domain={[
              Math.max(0, yDomain[0] === Infinity ? 0 : yDomain[0]),
              yDomain[1] === -Infinity ? 100 : yDomain[1],
            ]}
            tick={{ fill: 'rgba(0,255,136,0.3)', fontSize: 8, fontFamily: 'JetBrains Mono, monospace' }}
            tickLine={false}
            axisLine={false}
            width={36}
          />

          <Tooltip
            content={<CustomTooltip activeMetrics={activeMetrics} />}
            animationDuration={0}
            isAnimationActive={false}
          />

          {activeMetrics.map(m => {
            const cfg = METRIC_CONFIG[m]
            return (
              <Area
                key={m}
                type="monotoneX"
                dataKey={m}
                stroke={cfg.color}
                strokeWidth={1.5}
                fill={`url(#grad-${m})`}
                dot={false}
                activeDot={{
                  r: 3,
                  stroke: cfg.color,
                  strokeWidth: 1,
                  fill: '#0a0a12',
                }}
                isAnimationActive={false}
              />
            )
          })}
        </AreaChart>
      </ResponsiveContainer>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 8,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 8,
          color: 'rgba(0,255,136,0.25)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        <span>Window: {windowSize}s</span>
        <span>{displayData.length} samples</span>
        <span>{externalData ? 'EXTERNAL FEED' : 'SYNTHETIC'}</span>
      </div>
    </div>
  )
}
