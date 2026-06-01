'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Search, AlertTriangle, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react'

interface SlimMirror {
  prophecy_id: string
  entity: string
  jurisdiction: string
  category: string
  pre_crime_index: number
  drift_score: number
  breach_count: number
  watch_count: number
  ok_count: number
  filing_reference: string
  last_review: string
}

type Filter = 'all' | 'breach' | 'watch' | 'clean'

export default function MirrorList({ mirrors }: { mirrors: SlimMirror[] }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const filtered = useMemo(() => {
    let list = mirrors
    if (filter === 'breach') list = list.filter(m => m.breach_count > 0)
    else if (filter === 'watch') list = list.filter(m => m.breach_count === 0 && m.watch_count > 0)
    else if (filter === 'clean') list = list.filter(m => m.breach_count === 0 && m.watch_count === 0)
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(m => m.entity.toLowerCase().includes(q) || m.jurisdiction.toLowerCase() === q)
    }
    return list
  }, [mirrors, query, filter])

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="rounded-2xl p-3 flex items-center gap-3 flex-wrap"
        style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,216,255,0.25)', backdropFilter: 'blur(10px)' }}>
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-[#00d8ff] shrink-0" />
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search entity name or jurisdiction code…"
            className="flex-1 bg-transparent outline-none text-white text-[13px] placeholder-[rgba(255,255,255,0.35)] font-mono" />
        </div>
        <div className="flex items-center gap-1">
          {(['all', 'breach', 'watch', 'clean'] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 rounded transition-all"
              style={{
                background: filter === f ? 'rgba(0,216,255,0.2)' : 'transparent',
                border: `1px solid ${filter === f ? 'rgba(0,216,255,0.5)' : 'rgba(255,255,255,0.08)'}`,
                color: filter === f ? '#00d8ff' : 'rgba(255,255,255,0.5)',
              }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,216,255,0.2)', backdropFilter: 'blur(10px)' }}>
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-[12px] text-[rgba(255,255,255,0.5)]">
            No entities match.
          </div>
        ) : (
          filtered.map(m => <Row key={m.prophecy_id} m={m} />)
        )}
      </div>
    </div>
  )
}

function Row({ m }: { m: SlimMirror }) {
  const statusColor = m.breach_count > 0 ? '#ff3366' : m.watch_count > 0 ? '#ffaa00' : '#00ff88'
  const StatusIcon = m.breach_count > 0 ? AlertTriangle : m.watch_count > 0 ? AlertCircle : CheckCircle2

  return (
    <Link href={`/mirror/${m.prophecy_id}`}
      className="block px-4 py-3 transition-all hover:bg-[rgba(0,216,255,0.04)]"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="flex items-center gap-4">
        <StatusIcon className="w-4 h-4 shrink-0" style={{ color: statusColor }} />

        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-white truncate">{m.entity}</div>
          <div className="flex items-center gap-2 text-[10px] mt-0.5">
            <span className="text-[rgba(255,255,255,0.45)]">{m.jurisdiction}</span>
            <span className="text-[rgba(255,255,255,0.25)]">·</span>
            <span className="text-[rgba(255,255,255,0.45)]">{m.category.replace('_', ' ')}</span>
            <span className="text-[rgba(255,255,255,0.25)]">·</span>
            <span className="text-[rgba(255,255,255,0.45)]">PCI {m.pre_crime_index}</span>
            <span className="text-[rgba(255,255,255,0.25)]">·</span>
            <span className="text-[rgba(255,255,255,0.45)]">reviewed {m.last_review}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {m.breach_count > 0 && (
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded"
              style={{ background: 'rgba(255,51,102,0.15)', border: '1px solid rgba(255,51,102,0.4)', color: '#ff3366' }}>
              {m.breach_count} breach{m.breach_count === 1 ? '' : 'es'}
            </span>
          )}
          {m.watch_count > 0 && (
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded"
              style={{ background: 'rgba(255,170,0,0.15)', border: '1px solid rgba(255,170,0,0.4)', color: '#ffaa00' }}>
              {m.watch_count} watch
            </span>
          )}
          {m.ok_count > 0 && (
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded"
              style={{ background: 'rgba(0,255,136,0.10)', border: '1px solid rgba(0,255,136,0.25)', color: '#00ff88' }}>
              {m.ok_count} ok
            </span>
          )}
        </div>

        <div className="shrink-0">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">drift</div>
            <div className="text-2xl font-black font-mono leading-none" style={{ color: statusColor }}>{m.drift_score}</div>
          </div>
        </div>

        <ArrowRight className="w-3.5 h-3.5 text-[rgba(255,255,255,0.3)] shrink-0" />
      </div>
    </Link>
  )
}
