'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, AlertOctagon, Shield, Activity, Clock } from 'lucide-react'

interface TickerItem {
  id: string
  type: 'fx' | 'sanctions' | 'dora' | 'event' | 'system'
  color: string
  icon: React.ElementType
  label: string
  value: string
  detail?: string
}

const BOT_EVENT_POOL = [
  { color: '#00ff88', label: 'NAV_DETECTOR',   v: 'CLEAN',     d: 'fund-series #1422 nominal' },
  { color: '#00ff88', label: 'PBFT_QUORUM',    v: '9/11 VOTES', d: 'consensus reached 312ms' },
  { color: '#4a9eff', label: 'SANCTIONS_BOT',  v: 'SCAN OK',   d: '47,832 txns vs OFAC SDN' },
  { color: '#00ff88', label: 'MERKLE_ANCHOR',  v: 'PROOF #48,221', d: 'leaf 0x7a4f2c…b8e3 anchored' },
  { color: '#ffaa00', label: 'FX_BOT',          v: 'WATCH',      d: 'EUR/GBP volatility +0.8σ' },
  { color: '#00ff88', label: 'COMPLIANCE_BOT', v: 'OK',         d: 'DORA Art.28 register synced' },
  { color: '#4a9eff', label: 'SHADOW_BOT',      v: 'PROBE BLOCKED', d: 'adversarial vector neutralised' },
  { color: '#00ff88', label: 'ORBITAL_BOT',     v: 'CLEAR',     d: '2,341 vessels · 0 dark events' },
  { color: '#ffaa00', label: 'SUCCESSION_BOT', v: 'REVIEW',    d: 'mandate continuity Fund #1188' },
  { color: '#00ff88', label: 'YACHT_GUARDIAN', v: 'UBO OK',    d: '4th-degree beneficial owner chain' },
]

interface FxApiResponse {
  rates: Record<string, number>
  date: string
}

interface SanctionsApiResponse {
  count?: number
  fetched?: string
}

export default function TickerBar() {
  const [items, setItems] = useState<TickerItem[]>([])

  useEffect(() => {
    let cancelled = false

    const build = async () => {
      const tickers: TickerItem[] = []

      // 1. DORA countdown
      const dora = new Date('2027-01-17T00:00:00Z').getTime() - Date.now()
      const doraDays = Math.floor(dora / 86400000)
      tickers.push({
        id: 'dora',
        type: 'dora',
        color: '#ff3366',
        icon: Clock,
        label: 'DORA ENFORCEMENT',
        value: `T-${doraDays}d`,
        detail: 'Jan 17, 2027',
      })

      // 2. Real FX rates
      try {
        const fxRes = await fetch('/api/real/fx', { cache: 'no-store' })
        if (fxRes.ok) {
          const fx = (await fxRes.json()) as FxApiResponse
          const featured: Array<{ sym: string; baseline: number }> = [
            { sym: 'USD', baseline: 1.085 },
            { sym: 'GBP', baseline: 0.855 },
            { sym: 'JPY', baseline: 163.5 },
            { sym: 'CHF', baseline: 0.941 },
          ]
          for (const f of featured) {
            const rate = fx.rates?.[f.sym]
            if (typeof rate !== 'number') continue
            const delta = ((rate - f.baseline) / f.baseline) * 100
            const up = delta > 0
            tickers.push({
              id: `fx-${f.sym}`,
              type: 'fx',
              color: up ? '#00ff88' : '#ff3366',
              icon: up ? TrendingUp : TrendingDown,
              label: `EUR/${f.sym}`,
              value: rate.toFixed(f.sym === 'JPY' ? 2 : 4),
              detail: `${up ? '+' : ''}${delta.toFixed(2)}% vs baseline`,
            })
          }
        }
      } catch { /* fail soft */ }

      // 3. OFAC index count
      try {
        const ofacRes = await fetch('/api/real/sanctions', { cache: 'no-store' })
        if (ofacRes.ok) {
          const ofac = (await ofacRes.json()) as SanctionsApiResponse
          tickers.push({
            id: 'ofac',
            type: 'sanctions',
            color: '#ff3366',
            icon: AlertOctagon,
            label: 'OFAC SDN',
            value: `${ofac.count?.toLocaleString() ?? '—'} entities`,
            detail: `snapshot ${ofac.fetched ?? 'today'}`,
          })
        }
      } catch { /* fail soft */ }

      // 4. AUM under protection
      tickers.push({
        id: 'aum',
        type: 'system',
        color: '#00ff88',
        icon: Shield,
        label: 'AUM PROTECTED',
        value: '€14.78B',
        detail: 'across 14 institutional funds',
      })

      // 5. Live bot events (rotating selection of 6)
      const shuffled = [...BOT_EVENT_POOL].sort(() => Math.random() - 0.5).slice(0, 6)
      shuffled.forEach((e, i) => {
        tickers.push({
          id: `evt-${Date.now()}-${i}`,
          type: 'event',
          color: e.color,
          icon: Activity,
          label: e.label,
          value: e.v,
          detail: e.d,
        })
      })

      if (!cancelled) setItems(tickers)
    }

    build()
    const interval = setInterval(build, 30_000) // refresh every 30s
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  if (items.length === 0) return null

  // Repeat the items twice for seamless infinite scroll
  const doubled = [...items, ...items]

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-40 overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(5,5,12,0.95) 100%)',
        borderTop: '1px solid rgba(0,255,136,0.18)',
        backdropFilter: 'blur(16px)',
        boxShadow: '0 -8px 32px rgba(0,0,0,0.5), 0 -1px 0 rgba(0,255,136,0.08) inset',
      }}>

      {/* Top scan line */}
      <div className="absolute top-0 inset-x-0 h-px pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, #00ff88 50%, transparent 100%)',
          animation: 'tickerSweep 6s ease-in-out infinite',
        }} />

      <div className="relative flex items-center h-9 md:h-10">
        {/* LIVE badge */}
        <div className="flex items-center gap-1.5 px-2.5 md:px-3 shrink-0 z-10 h-full"
          style={{ background: 'rgba(0,255,136,0.06)', borderRight: '1px solid rgba(0,255,136,0.18)' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88]"
            style={{ animation: 'pulse 1s ease-in-out infinite', boxShadow: '0 0 6px #00ff88' }} />
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#00ff88]">LIVE</span>
        </div>

        {/* ⌘K opener — always visible at top of stream */}
        <button onClick={() => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('gs:open-palette')) }}
          className="flex items-center gap-1.5 px-2.5 md:px-3 shrink-0 z-10 h-full hover:bg-[rgba(255,255,255,0.04)] transition-colors"
          style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}
          aria-label="Open command palette">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <span className="hidden sm:inline text-[9px] uppercase tracking-[0.18em] text-[rgba(255,255,255,0.55)]">Search</span>
          <kbd className="hidden sm:inline text-[8px] font-mono font-bold px-1 py-0.5 rounded ml-1"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.1)' }}>
            ⌘K
          </kbd>
        </button>

        {/* Scrolling content */}
        <div className="flex-1 overflow-hidden relative">
          <div className="flex items-center gap-8 whitespace-nowrap"
            style={{ animation: 'tickerScroll 65s linear infinite' }}>
            {doubled.map((it, i) => {
              const Icon = it.icon
              return (
                <div key={`${it.id}-${i}`} className="flex items-center gap-2 shrink-0">
                  <Icon className="w-3 h-3 shrink-0" style={{ color: it.color }} />
                  <span className="text-[9px] font-black uppercase tracking-[0.15em]" style={{ color: it.color }}>
                    {it.label}
                  </span>
                  <span className="text-[11px] font-bold tabular-nums" style={{ color: 'rgba(255,255,255,0.95)' }}>
                    {it.value}
                  </span>
                  {it.detail && (
                    <span className="text-[9px] uppercase tracking-wider"
                      style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {it.detail}
                    </span>
                  )}
                  <span className="text-[#00ff88] opacity-30">·</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right edge fade */}
        <div className="absolute right-0 top-0 bottom-0 w-16 pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(5,5,12,0.95) 100%)' }} />
      </div>

      <style jsx>{`
        @keyframes tickerScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes tickerSweep {
          0%, 100% { opacity: 0; transform: translateX(-100%); }
          50%      { opacity: 1; transform: translateX(100%); }
        }
      `}</style>
    </div>
  )
}
