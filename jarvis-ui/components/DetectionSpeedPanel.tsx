'use client'

import { useState, useCallback } from 'react'
import { triggerDemoAnomaly, resetDemo, type DemoResult } from '@/lib/api'

const COMPARISON_ROWS = [
  { label: 'Detection latency',    traditional: '48–72 hours',    genesis: '340 ms' },
  { label: 'False positive rate',  traditional: '~34%',           genesis: '< 2%' },
  { label: 'Capital at risk (avg)',traditional: '€4.2B',          genesis: '€0 (quarantined)' },
  { label: 'Audit trail',          traditional: 'Manual logs',    genesis: 'Merkle-locked' },
  { label: 'BFT consensus',        traditional: 'None',           genesis: '11-node quorum' },
  { label: 'Regulatory SLA (DORA)',traditional: 'Manual report',  genesis: 'Auto-export' },
]

const WIRECARD_TIMELINE = [
  { year: '2015',     event: 'First whistleblower report filed', caught: false },
  { year: '2019',     event: 'FT investigation published', caught: false },
  { year: 'Jun 2020', event: 'Auditors discover €1.9B missing', caught: false },
  { year: 'Jun 25',   event: 'Wirecard insolvency — €12.5B wiped', caught: false },
  { year: 'T+340ms',  event: 'Genesis Swarm detects NAV manipulation', caught: true },
]

export default function DetectionSpeedPanel() {
  const [demo, setDemo] = useState<DemoResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'idle' | 'crisis'>('idle')

  const handleDemoFire = useCallback(async () => {
    setLoading(true)
    const result = await triggerDemoAnomaly()
    setLoading(false)
    if (result) {
      setDemo(result)
      setMode('crisis')
      setTimeout(() => { setMode('idle'); setDemo(null) }, 90_000)
    }
  }, [])

  const handleReset = useCallback(async () => {
    await resetDemo()
    setDemo(null)
    setMode('idle')
  }, [])

  return (
    <div className="terminal-border bg-genesis-surface flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: '1px solid rgba(0,255,136,0.1)' }}
      >
        <div>
          <div style={{ fontSize: '9px', fontWeight: 700, color: '#00ff88', letterSpacing: '0.1em' }}>
            DETECTION BENCHMARK
          </div>
          <div style={{ fontSize: '8px', color: 'rgba(74,158,255,0.6)' }}>
            GENESIS SWARM vs TRADITIONAL COMPLIANCE
          </div>
        </div>
        <div className="flex gap-2">
          {mode === 'crisis' ? (
            <button
              onClick={handleReset}
              style={{
                fontSize: '9px', padding: '4px 10px', fontFamily: 'JetBrains Mono, monospace',
                background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)',
                color: '#00ff88', cursor: 'pointer', letterSpacing: '0.06em',
              }}
            >
              RESET
            </button>
          ) : (
            <button
              onClick={handleDemoFire}
              disabled={loading}
              style={{
                fontSize: '9px', padding: '4px 10px', fontFamily: 'JetBrains Mono, monospace',
                background: loading ? 'rgba(255,51,102,0.05)' : 'rgba(255,51,102,0.15)',
                border: '1px solid rgba(255,51,102,0.5)',
                color: '#ff3366', cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '0.06em',
              }}
            >
              {loading ? 'TRIGGERING...' : 'DEMO CRISIS'}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 p-3 flex flex-col gap-3 overflow-auto" style={{ minHeight: 0 }}>

        {/* Crisis banner */}
        {mode === 'crisis' && demo && (
          <div
            style={{
              background: 'rgba(255,51,102,0.1)',
              border: '1px solid rgba(255,51,102,0.4)',
              padding: '8px 12px',
            }}
          >
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#ff3366', marginBottom: '4px', letterSpacing: '0.08em' }}>
              WIRECARD ANALOG CRISIS DETECTED
            </div>
            <div className="flex gap-4 flex-wrap">
              <div>
                <div style={{ fontSize: '8px', color: 'rgba(255,51,102,0.6)' }}>DETECTION TIME</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: '#ff3366' }}>
                  {demo.detection_time_ms}ms
                </div>
              </div>
              <div>
                <div style={{ fontSize: '8px', color: 'rgba(255,51,102,0.6)' }}>CAPITAL AT RISK</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: '#ff3366' }}>
                  €{(demo.total_at_risk_eur_m / 1000).toFixed(1)}B
                </div>
              </div>
              <div>
                <div style={{ fontSize: '8px', color: 'rgba(0,255,136,0.5)' }}>TRADITIONAL WOULD CATCH IN</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: 'rgba(0,255,136,0.4)' }}>
                  {demo.traditional_detection_hours}h
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {demo.timeline.map((step, i) => (
                <div key={i} className="flex gap-2" style={{ fontSize: '9px' }}>
                  <span style={{ color: 'rgba(255,51,102,0.5)', minWidth: '60px' }}>{step.t}</span>
                  <span style={{ color: 'rgba(0,255,136,0.7)' }}>{step.event}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comparison table */}
        <div>
          <div style={{ fontSize: '8px', color: 'rgba(0,255,136,0.4)', letterSpacing: '0.08em', marginBottom: '6px' }}>
            HEAD-TO-HEAD COMPARISON:
          </div>
          <div style={{ border: '1px solid rgba(0,255,136,0.1)' }}>
            <div className="grid grid-cols-3 px-2 py-1" style={{ background: 'rgba(0,255,136,0.05)', borderBottom: '1px solid rgba(0,255,136,0.1)', fontSize: '8px', color: 'rgba(0,255,136,0.4)', letterSpacing: '0.06em' }}>
              <span>METRIC</span>
              <span>TRADITIONAL</span>
              <span style={{ color: '#00ff88' }}>GENESIS SWARM</span>
            </div>
            {COMPARISON_ROWS.map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-3 px-2 py-1.5"
                style={{ borderBottom: i < COMPARISON_ROWS.length - 1 ? '1px solid rgba(0,255,136,0.06)' : 'none', fontSize: '9px' }}
              >
                <span style={{ color: 'rgba(0,255,136,0.5)' }}>{row.label}</span>
                <span style={{ color: '#ffaa00' }}>{row.traditional}</span>
                <span style={{ color: '#00ff88', fontWeight: 700 }}>{row.genesis}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Wirecard Timeline */}
        <div>
          <div style={{ fontSize: '8px', color: 'rgba(0,255,136,0.4)', letterSpacing: '0.08em', marginBottom: '6px' }}>
            WIRECARD CASE STUDY — WHY SPEED MATTERS:
          </div>
          <div className="flex flex-col gap-1">
            {WIRECARD_TIMELINE.map((item, i) => (
              <div key={i} className="flex gap-3 items-start" style={{ fontSize: '9px' }}>
                <span style={{ color: item.caught ? '#00ff88' : 'rgba(255,170,0,0.6)', minWidth: '72px', fontWeight: 700 }}>
                  {item.year}
                </span>
                <span style={{ color: item.caught ? '#00ff88' : 'rgba(0,255,136,0.4)' }}>
                  {item.caught ? '' : ''}{item.event}
                </span>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: '8px', padding: '6px 8px', fontSize: '9px',
              background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.15)',
              color: 'rgba(0,255,136,0.7)',
            }}
          >
            Genesis Swarm would have flagged Wirecard 5 years before collapse.
            €12.5B in investor losses, preventable in 340ms.
          </div>
        </div>

      </div>
    </div>
  )
}
