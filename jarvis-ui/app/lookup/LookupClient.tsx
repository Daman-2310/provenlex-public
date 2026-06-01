'use client'

import Link from 'next/link'
import { useState, useMemo, useDeferredValue } from 'react'
import { Search, TrendingUp, TrendingDown, Minus, ExternalLink } from 'lucide-react'

interface SlimEntry {
  prophecy_id: string
  rank: number
  name: string
  jurisdiction: string
  category: string
  pre_crime_index: number
  genesis_score: number
  trajectory: 'RISING' | 'FALLING' | 'HOLDING'
  pattern_match: string | null
  forecast: string
}

const SAMPLE_QUERIES = ['Deutsche Bank', 'UBS', 'BNP Paribas', 'BlackRock', 'Amundi', 'Santander', 'Pictet']

export default function LookupClient({ entries }: { entries: SlimEntry[] }) {
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)

  const { hits, byCategory } = useMemo(() => {
    if (!deferred.trim()) {
      return { hits: [] as SlimEntry[], byCategory: new Map<string, SlimEntry[]>() }
    }
    const q = deferred.toLowerCase().trim()
    const matches = entries.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.jurisdiction.toLowerCase() === q ||
      e.category.toLowerCase().includes(q)
    ).sort((a, b) => b.pre_crime_index - a.pre_crime_index)

    const grouped = new Map<string, SlimEntry[]>()
    for (const m of matches) {
      const list = grouped.get(m.category) ?? []
      list.push(m)
      grouped.set(m.category, list)
    }
    return { hits: matches, byCategory: grouped }
  }, [deferred, entries])

  return (
    <div>
      {/* Search box */}
      <div className="rounded-2xl p-2 mb-8"
        style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(74,158,255,0.3)', backdropFilter: 'blur(10px)' }}>
        <div className="flex items-center gap-3 px-3 py-2">
          <Search className="w-5 h-5 text-[#4a9eff] shrink-0" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a fund, bank, or counterparty name…"
            className="flex-1 bg-transparent outline-none text-white text-lg placeholder-[rgba(255,255,255,0.3)] font-mono" />
          {query && (
            <button onClick={() => setQuery('')}
              className="text-[10px] uppercase tracking-wider px-2 py-1 rounded text-[rgba(255,255,255,0.5)] hover:text-white">
              clear
            </button>
          )}
        </div>
      </div>

      {/* Sample chips */}
      {!query && (
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] mb-3">Try one of these</div>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_QUERIES.map(s => (
              <button key={s} onClick={() => setQuery(s)}
                className="px-3 py-1.5 rounded-full text-[11px] text-[rgba(255,255,255,0.7)] transition-all hover:bg-[rgba(74,158,255,0.08)]"
                style={{ background: 'rgba(74,158,255,0.04)', border: '1px solid rgba(74,158,255,0.2)' }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {query && (
        <div>
          <div className="flex items-baseline justify-between mb-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[#4a9eff] font-black">
              {hits.length === 0 ? 'No matches' : `${hits.length} match${hits.length === 1 ? '' : 'es'}`}
            </div>
            {hits.length > 0 && (
              <div className="text-[10px] text-[rgba(255,255,255,0.45)]">
                avg PCI {Math.round(hits.reduce((s, h) => s + h.pre_crime_index, 0) / hits.length)}
              </div>
            )}
          </div>

          {hits.length === 0 ? (
            <NoResults query={query} />
          ) : (
            <div className="space-y-6">
              {Array.from(byCategory.entries()).map(([cat, list]) => (
                <div key={cat}>
                  <div className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] mb-2 font-bold">
                    {cat.replace('_', ' ')} · {list.length}
                  </div>
                  <div className="space-y-2">
                    {list.map(e => <Result key={e.prophecy_id} entry={e} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Result({ entry: e }: { entry: SlimEntry }) {
  const pciColor = e.pre_crime_index >= 70 ? '#ff3366' : e.pre_crime_index >= 50 ? '#ffaa00' : e.pre_crime_index >= 30 ? '#ffd86b' : '#00ff88'
  const TIcon = e.trajectory === 'RISING' ? TrendingUp : e.trajectory === 'FALLING' ? TrendingDown : Minus
  const tColor = e.trajectory === 'RISING' ? '#ff3366' : e.trajectory === 'FALLING' ? '#00ff88' : 'rgba(255,255,255,0.5)'

  return (
    <Link href={`/book/${e.prophecy_id}`}
      className="block rounded-xl p-4 transition-all hover:translate-x-1"
      style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid ${pciColor}25`, backdropFilter: 'blur(8px)' }}>

      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-bold text-white truncate">{e.name}</div>
          <div className="flex items-center gap-2 mt-1 text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.5)]">
            <span>#{e.rank}</span>
            <span>·</span>
            <span>{e.jurisdiction}</span>
            {e.pattern_match && (
              <>
                <span>·</span>
                <span className="font-mono text-[#9b6dff]">pattern: {e.pattern_match}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">PCI</div>
            <div className="text-2xl font-black font-mono leading-none" style={{ color: pciColor }}>
              {e.pre_crime_index}
            </div>
          </div>
          <div className="flex flex-col items-center" style={{ color: tColor }}>
            <TIcon className="w-4 h-4" />
            <span className="text-[8px] uppercase tracking-wider font-bold mt-0.5">{e.trajectory}</span>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-[rgba(255,255,255,0.3)]" />
        </div>
      </div>

      <div className="text-[11px] text-[rgba(255,255,255,0.6)] leading-relaxed line-clamp-2">
        {e.forecast}
      </div>
    </Link>
  )
}

function NoResults({ query }: { query: string }) {
  return (
    <div className="rounded-2xl p-6 text-center"
      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}>
      <div className="text-[13px] text-white font-bold mb-2">
        &ldquo;{query}&rdquo; is not yet in the sealed Book
      </div>
      <div className="text-[11px] text-[rgba(255,255,255,0.55)] leading-relaxed mb-4 max-w-md mx-auto">
        The Book covers 100 of the largest EU financial entities. If your counterparty isn&apos;t here,
        the 11-bot engine can still score them on demand — paid tier only.
      </div>
      <Link href="/pricing"
        className="inline-flex items-center gap-2 px-4 py-2 rounded text-[11px] uppercase tracking-wider font-bold transition-all"
        style={{ background: 'rgba(74,158,255,0.12)', border: '1px solid rgba(74,158,255,0.4)', color: '#4a9eff' }}>
        See pricing →
      </Link>
    </div>
  )
}
