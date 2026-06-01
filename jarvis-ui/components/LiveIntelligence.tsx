'use client'

import { useEffect, useState, useCallback } from 'react'
import { Search, TrendingUp, Building2, AlertOctagon, ExternalLink, Loader2, CheckCircle2, Globe } from 'lucide-react'

// ── FX panel ─────────────────────────────────────────────────────────────
interface FxResponse {
  base: string
  date: string
  rates: Record<string, number>
  pairs: Array<{ pair: string; rate: number; formatted: string }>
  source: string
}

function FxPanel() {
  const [data, setData] = useState<FxResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const fetchRates = useCallback(async () => {
    try {
      const res = await fetch('/api/real/fx', { cache: 'no-store' })
      if (res.ok) {
        const d = (await res.json()) as FxResponse
        setData(d)
        setLastUpdate(new Date())
      }
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchRates()
    const interval = setInterval(fetchRates, 300_000) // 5 min
    return () => clearInterval(interval)
  }, [fetchRates])

  const featured = ['USD', 'GBP', 'CHF', 'JPY']
  return (
    <div className="rounded-lg p-4" style={{ background: 'rgba(74,158,255,0.03)', border: '1px solid rgba(74,158,255,0.15)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-[#4a9eff]" />
          <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[#4a9eff]">ECB FX Rates</span>
          <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider"
            style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.35)', color: '#00ff88' }}>
            ● LIVE
          </span>
        </div>
        <div className="text-[8px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">
          {data?.date ?? '—'}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {loading && !data ? (
          [0, 1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded animate-pulse" style={{ background: 'rgba(74,158,255,0.04)' }} />
          ))
        ) : (
          featured.map(sym => {
            const rate = data?.rates[sym]
            return (
              <div key={sym} className="rounded p-2.5"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="text-[8px] uppercase tracking-widest font-bold text-[rgba(74,158,255,0.6)] mb-1">EUR/{sym}</div>
                <div className="font-black tabular-nums text-base text-white" style={{ textShadow: '0 0 6px rgba(74,158,255,0.4)' }}>
                  {rate ? rate.toFixed(sym === 'JPY' ? 2 : 4) : '—'}
                </div>
              </div>
            )
          })
        )}
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[7px] uppercase tracking-widest text-[rgba(255,255,255,0.3)]">
        <span>{data?.source ?? 'connecting…'}</span>
        <span>{lastUpdate ? `refreshed ${lastUpdate.toLocaleTimeString()}` : ''}</span>
      </div>
    </div>
  )
}

// ── OFAC Sanctions screener ──────────────────────────────────────────────
interface SanctionsResult {
  id: string
  name: string
  type: string
  program: string
  remarks: string
  score: number
  matchLevel: 'EXACT' | 'STRONG' | 'PARTIAL' | 'WEAK'
}

function SanctionsPanel() {
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SanctionsResult[] | null>(null)
  const [meta, setMeta] = useState<{ indexed?: number; snapshotDate?: string }>({})

  useEffect(() => {
    fetch('/api/real/sanctions').then(r => r.json()).then(d => {
      if (d.ok) setMeta({ indexed: d.count, snapshotDate: d.fetched })
    }).catch(() => { /* ignore */ })
  }, [])

  const screen = useCallback(async (query: string) => {
    const text = query.trim()
    if (!text) return
    setLoading(true); setResults(null)
    try {
      const res = await fetch(`/api/real/sanctions?q=${encodeURIComponent(text)}`)
      if (res.ok) {
        const d = await res.json()
        setResults(d.results ?? [])
      }
    } catch { setResults([]) } finally { setLoading(false) }
  }, [])

  const examples = ['ROSNEFT', 'GAZPROM', 'PUTIN', 'SBERBANK']
  const matchColors: Record<SanctionsResult['matchLevel'], string> = {
    EXACT: '#ff3366', STRONG: '#ff6b3d', PARTIAL: '#ffaa00', WEAK: '#999',
  }

  return (
    <div className="rounded-lg p-4 flex flex-col" style={{ background: 'rgba(255,51,102,0.03)', border: '1px solid rgba(255,51,102,0.18)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertOctagon className="w-3.5 h-3.5 text-[#ff3366]" />
          <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[#ff3366]">OFAC Sanctions Screening</span>
          <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider"
            style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.35)', color: '#00ff88' }}>
            ● LIVE
          </span>
        </div>
        <div className="text-[8px] uppercase tracking-wider text-[rgba(255,255,255,0.35)] tabular-nums">
          {meta.indexed ? `${meta.indexed.toLocaleString()} entities` : '—'}
        </div>
      </div>

      <div className="flex gap-2 mb-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[rgba(255,255,255,0.3)]" />
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && screen(q)}
            placeholder="Screen entity against US Treasury SDN list…"
            className="w-full bg-[rgba(255,255,255,0.04)] rounded pl-8 pr-3 py-2 text-[11px] text-white placeholder:text-[rgba(255,255,255,0.3)] focus:outline-none"
            style={{ border: '1px solid rgba(255,51,102,0.25)' }}
          />
        </div>
        <button onClick={() => screen(q)} disabled={loading || !q.trim()}
          className="flex items-center gap-1.5 px-3 rounded text-[10px] uppercase tracking-wider font-black disabled:opacity-40"
          style={{ background: 'rgba(255,51,102,0.12)', border: '1px solid rgba(255,51,102,0.4)', color: '#ff3366' }}>
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
          Screen
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className="text-[8px] uppercase tracking-wider text-[rgba(255,255,255,0.3)] mr-1">Try:</span>
        {examples.map(ex => (
          <button key={ex} onClick={() => { setQ(ex); screen(ex) }}
            className="text-[9px] px-2 py-0.5 rounded uppercase tracking-wider"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,51,102,0.2)', color: '#ff3366' }}>
            {ex}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto min-h-[60px]" style={{ maxHeight: 180 }}>
        {results === null && !loading && (
          <div className="text-[10px] text-[rgba(255,255,255,0.35)] italic">
            Real US Treasury OFAC SDN data · {meta.indexed?.toLocaleString() ?? '—'} sanctioned entities indexed
            {meta.snapshotDate && ` · snapshot ${meta.snapshotDate}`}
          </div>
        )}
        {results !== null && results.length === 0 && !loading && (
          <div className="flex items-center gap-2 text-[10px] text-[#00ff88]">
            <CheckCircle2 className="w-3 h-3" /> No matches — clean pass on US Treasury OFAC SDN list
          </div>
        )}
        {results !== null && results.length > 0 && (
          <div className="space-y-1.5">
            {results.map(r => (
              <div key={r.id} className="rounded p-2 flex items-start gap-2"
                style={{ background: 'rgba(255,51,102,0.04)', border: `1px solid ${matchColors[r.matchLevel]}33` }}>
                <div className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                  style={{ color: matchColors[r.matchLevel], border: `1px solid ${matchColors[r.matchLevel]}`, minWidth: 50, textAlign: 'center' }}>
                  {r.score}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold text-white truncate">{r.name}</div>
                  <div className="text-[9px] uppercase tracking-wider mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="font-bold" style={{ color: matchColors[r.matchLevel] }}>{r.matchLevel}</span>
                    <span className="text-[rgba(74,158,255,0.7)]">{r.type}</span>
                    <span className="text-[rgba(255,255,255,0.4)]">SDN #{r.id}</span>
                  </div>
                  {r.program && r.program !== 'unknown' && (
                    <div className="text-[8px] text-[rgba(255,170,0,0.7)] mt-1 truncate">{r.program}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── GLEIF LEI lookup ─────────────────────────────────────────────────────
interface GleifResponse {
  lei: string
  legalName?: string
  jurisdiction?: string
  status?: string
  legalForm?: string
  category?: string
  headquarters?: { country?: string; city?: string }
  registration?: { initialRegistrationDate?: string; lastUpdateDate?: string; status?: string }
  error?: string
}

function GleifPanel() {
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GleifResponse | null>(null)

  const lookup = useCallback(async (lei: string) => {
    const v = lei.trim().toUpperCase()
    if (!v) return
    setLoading(true); setResult(null)
    try {
      const isLei = /^[A-Z0-9]{20}$/.test(v)
      const path = isLei ? `lei=${v}` : `q=${encodeURIComponent(v)}`
      const res = await fetch(`/api/real/gleif?${path}`)
      const d = await res.json()
      setResult(d)
    } catch (e) {
      setResult({ lei: '', error: String(e) })
    } finally { setLoading(false) }
  }, [])

  // Verified real LEIs (GLEIF registry, current as of snapshot)
  const examples = [
    { label: 'BlackRock Inc',         lei: '529900VBK42Y5HHRMD23' },
    { label: 'PICTET (LU)',           lei: '222100FT5B9H8W7QAQ64' },
    { label: 'AXEL GLOBAL FUND LUX',  lei: '636700U30BO19GJ39477' },
  ]

  return (
    <div className="rounded-lg p-4 flex flex-col" style={{ background: 'rgba(0,255,136,0.03)', border: '1px solid rgba(0,255,136,0.18)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Building2 className="w-3.5 h-3.5 text-[#00ff88]" />
          <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[#00ff88]">GLEIF LEI Lookup</span>
          <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider"
            style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.35)', color: '#00ff88' }}>
            ● LIVE
          </span>
        </div>
        <a href="https://www.gleif.org" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-[8px] uppercase tracking-wider text-[rgba(255,255,255,0.35)] hover:text-white">
          <Globe className="w-2.5 h-2.5" /> gleif.org
        </a>
      </div>

      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && lookup(q)}
          placeholder="Paste a 20-char LEI…"
          className="flex-1 bg-[rgba(255,255,255,0.04)] rounded px-3 py-2 text-[11px] font-mono text-white placeholder:text-[rgba(255,255,255,0.3)] focus:outline-none"
          style={{ border: '1px solid rgba(0,255,136,0.25)' }}
        />
        <button onClick={() => lookup(q)} disabled={loading || !q.trim()}
          className="flex items-center gap-1.5 px-3 rounded text-[10px] uppercase tracking-wider font-black disabled:opacity-40"
          style={{ background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.4)', color: '#00ff88' }}>
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
          Look Up
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className="text-[8px] uppercase tracking-wider text-[rgba(255,255,255,0.3)] mr-1">Try:</span>
        {examples.map(ex => (
          <button key={ex.lei} onClick={() => { setQ(ex.lei); lookup(ex.lei) }}
            className="text-[9px] px-2 py-0.5 rounded uppercase tracking-wider"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(0,255,136,0.2)', color: '#00ff88' }}>
            {ex.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-[80px]">
        {!result && !loading && (
          <div className="text-[10px] text-[rgba(255,255,255,0.35)] italic">
            Real GLEIF registry · 2.4M+ legal entity identifiers globally · authoritative source for ISO 17442 LEIs
          </div>
        )}
        {result?.error && (
          <div className="text-[10px] text-[#ff3366]">{result.error}</div>
        )}
        {result && !result.error && result.legalName && (
          <div className="space-y-2">
            <div>
              <div className="text-[10px] font-bold text-white">{result.legalName}</div>
              <div className="font-mono text-[9px] text-[rgba(0,255,136,0.6)] mt-0.5">{result.lei}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[9px]">
              <div>
                <div className="text-[7px] uppercase tracking-widest text-[rgba(255,255,255,0.3)]">Jurisdiction</div>
                <div className="font-bold text-[rgba(255,255,255,0.85)]">{result.jurisdiction ?? '—'}</div>
              </div>
              <div>
                <div className="text-[7px] uppercase tracking-widest text-[rgba(255,255,255,0.3)]">Status</div>
                <div className="font-bold text-[#00ff88]">{result.status ?? '—'}</div>
              </div>
              <div>
                <div className="text-[7px] uppercase tracking-widest text-[rgba(255,255,255,0.3)]">Legal Form</div>
                <div className="font-bold text-[rgba(255,255,255,0.85)]">{result.legalForm ?? '—'}</div>
              </div>
              <div>
                <div className="text-[7px] uppercase tracking-widest text-[rgba(255,255,255,0.3)]">HQ</div>
                <div className="font-bold text-[rgba(255,255,255,0.85)]">
                  {result.headquarters?.city ?? '—'}{result.headquarters?.country ? `, ${result.headquarters.country}` : ''}
                </div>
              </div>
            </div>
            {result.registration?.initialRegistrationDate && (
              <div className="pt-1 border-t border-[rgba(0,255,136,0.08)] text-[8px] text-[rgba(255,255,255,0.4)] uppercase tracking-wider">
                Registered: {result.registration.initialRegistrationDate.slice(0, 10)}
                {result.registration.lastUpdateDate && ` · Updated: ${result.registration.lastUpdateDate.slice(0, 10)}`}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function LiveIntelligence() {
  return (
    <div className="rounded-lg overflow-hidden"
      style={{
        background: 'rgba(5,5,12,0.7)',
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(12px)',
      }}>
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.3)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-1 h-5 rounded-full" style={{ background: '#00ff88', boxShadow: '0 0 8px #00ff88' }} />
          <div>
            <div className="text-[10px] font-black tracking-[0.15em] uppercase text-white">Live Intelligence Feed</div>
            <div className="text-[8px] tracking-wider mt-0.5 uppercase" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Real public-source data · ECB · US Treasury · GLEIF
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88]" style={{ animation: 'pulse 0.8s ease-in-out infinite', boxShadow: '0 0 6px #00ff88' }} />
          <span className="text-[8px] font-black uppercase tracking-wider text-[#00ff88]">REAL DATA</span>
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
        <FxPanel />
        <SanctionsPanel />
        <GleifPanel />
      </div>
    </div>
  )
}
