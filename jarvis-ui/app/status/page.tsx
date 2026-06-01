'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, AlertTriangle, XCircle, Activity, RefreshCw, Loader2 } from 'lucide-react'

interface Check {
  id: string
  label: string
  description: string
  status: 'up' | 'degraded' | 'down'
  latencyMs?: number
  detail?: string
}

interface StatusResponse {
  overall: 'up' | 'degraded' | 'down'
  checks: Check[]
  generatedAt: string
}

const StatusBadge = ({ status, size = 'sm' }: { status: 'up' | 'degraded' | 'down'; size?: 'sm' | 'lg' }) => {
  const cfg = {
    up:       { color: '#00ff88', Icon: CheckCircle2, label: 'OPERATIONAL' },
    degraded: { color: '#ffaa00', Icon: AlertTriangle, label: 'DEGRADED' },
    down:     { color: '#ff3366', Icon: XCircle, label: 'OUTAGE' },
  }[status]
  if (size === 'lg') {
    return (
      <div className="inline-flex items-center gap-3 px-5 py-3 rounded-full"
        style={{ background: `${cfg.color}10`, border: `1px solid ${cfg.color}50`, boxShadow: `0 0 24px ${cfg.color}40` }}>
        <cfg.Icon className="w-5 h-5" style={{ color: cfg.color }} />
        <span className="text-base font-black uppercase tracking-[0.15em]" style={{ color: cfg.color }}>{cfg.label}</span>
      </div>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider"
      style={{ background: `${cfg.color}10`, border: `1px solid ${cfg.color}55`, color: cfg.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  )
}

export default function StatusPage() {
  const [data, setData] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/status', { cache: 'no-store' })
      if (res.ok) {
        setData(await res.json())
        setLastFetched(new Date())
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchStatus()
    const i = setInterval(fetchStatus, 30_000) // refresh every 30s
    return () => clearInterval(i)
  }, [fetchStatus])

  return (
    <div className="min-h-screen text-white" style={{ background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)' }}>
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3 flex items-center justify-between"
        style={{ background: 'rgba(5,5,12,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Activity className="w-4 h-4 text-[#00ff88]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#00ff88]">SYSTEM STATUS</span>
        </div>
        <button onClick={fetchStatus} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] uppercase tracking-wider font-bold text-[rgba(255,255,255,0.7)] hover:text-white"
          style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh
        </button>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-12">

        <div className="text-center mb-10">
          {data ? <StatusBadge status={data.overall} size="lg" /> : (
            <div className="inline-flex items-center gap-3 px-5 py-3 rounded-full"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-base font-black uppercase tracking-[0.15em] text-[rgba(255,255,255,0.7)]">Checking…</span>
            </div>
          )}
          <h1 className="text-3xl md:text-4xl font-black mt-5 mb-2 tracking-tight">All systems</h1>
          <p className="text-[rgba(255,255,255,0.5)] text-sm">
            Live health checks across every Genesis Swarm dependency. Refreshes every 30 seconds.
          </p>
          {lastFetched && (
            <div className="text-[9px] uppercase tracking-widest text-[rgba(255,255,255,0.35)] mt-2">
              Last checked: {lastFetched.toLocaleTimeString()}
            </div>
          )}
        </div>

        {data && (
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {data.checks.map((c, i) => (
              <div key={c.id} className="flex items-center gap-4 p-4"
                style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[13px] font-bold text-white">{c.label}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="text-[10px] text-[rgba(255,255,255,0.5)]">{c.description}</div>
                  {c.detail && (
                    <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)] mt-0.5">{c.detail}</div>
                  )}
                </div>
                {c.latencyMs !== undefined && (
                  <div className="text-right shrink-0">
                    <div className="text-[14px] font-black tabular-nums text-white">{c.latencyMs}ms</div>
                    <div className="text-[8px] uppercase tracking-widest text-[rgba(255,255,255,0.4)]">latency</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 text-center text-[10px] uppercase tracking-widest text-[rgba(255,255,255,0.35)]">
          Genesis Swarm RegTech AI · CSSF-aligned · DORA + AIFMD II + SFDR ready
        </div>
      </div>
    </div>
  )
}
