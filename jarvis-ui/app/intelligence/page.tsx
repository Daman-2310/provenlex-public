'use client'

import { useEffect, useState, useCallback } from 'react'
import { ArrowLeft, Search, Newspaper, ExternalLink, RefreshCw, Filter, Loader2 } from 'lucide-react'

interface NewsItem {
  id: string
  source: string
  title: string
  link: string
  pubDate?: string
  summary?: string
  fetchedAt: number
  frameworks?: string[]
}

interface NewsResponse { total: number; items: NewsItem[]; sources: string[]; frameworks: string[] }

const FRAMEWORK_COLORS: Record<string, string> = {
  DORA: '#ff3366', AIFMD: '#00ff88', UCITS: '#4a9eff', SFDR: '#9b6dff',
  MiFID: '#ffaa00', AML: '#ff8800', SANCTIONS: '#ff3366', CSSF: '#00ff88',
  EBA: '#4a9eff', ESMA: '#9b6dff', BANKING: '#4a9eff', SECURITIES: '#9b6dff',
  EU: '#ffaa00', LUXEMBOURG: '#00ff88',
}

const SOURCE_LOGOS: Record<string, string> = {
  CSSF: 'C', EBA: 'B', ESMA: 'S',
}

function tagColor(tag: string): string {
  return FRAMEWORK_COLORS[tag.toUpperCase()] ?? '#888'
}

function fmtAgo(ts: number | string | undefined): string {
  if (!ts) return ''
  const ms = typeof ts === 'string' ? new Date(ts).getTime() : ts
  if (!Number.isFinite(ms)) return ''
  const diff = Date.now() - ms
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function IntelligencePage() {
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [framework, setFramework] = useState<string | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [meta, setMeta] = useState<{ sources: string[]; frameworks: string[] }>({ sources: [], frameworks: [] })

  const fetchNews = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (framework) params.set('framework', framework)
    if (source) params.set('source', source)
    if (q) params.set('q', q)
    params.set('limit', '60')
    try {
      const res = await fetch(`/api/news?${params}`)
      const data = (await res.json()) as NewsResponse
      setItems(data.items)
      setMeta({ sources: data.sources, frameworks: data.frameworks })
    } finally { setLoading(false) }
  }, [framework, source, q])

  useEffect(() => { fetchNews() }, [fetchNews])

  return (
    <div className="min-h-screen text-white" style={{
      background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)',
    }}>
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3 flex items-center justify-between"
        style={{ background: 'rgba(5,5,12,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Dashboard
          </a>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <div className="flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-[#9b6dff]" />
            <span className="text-sm font-bold tracking-[0.18em] text-[#9b6dff]">REGULATORY INTELLIGENCE</span>
          </div>
        </div>
        <button onClick={fetchNews}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] uppercase tracking-wider font-bold text-[rgba(255,255,255,0.7)] hover:text-white"
          style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh
        </button>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-black mb-2 tracking-tight">
            Live regulatory feed
            <br />
            <span style={{ background: 'linear-gradient(90deg, #9b6dff 0%, #4a9eff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              CSSF · EBA · ESMA
            </span>
          </h1>
          <p className="text-[rgba(255,255,255,0.5)] text-sm max-w-2xl">
            Bloomberg-Terminal-for-compliance. Real RSS feeds polled every 6 hours,
            auto-tagged with regulatory framework relevance, fed into your morning briefing.
          </p>
        </div>

        {/* Filters */}
        <div className="rounded-xl p-4 mb-6"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-3 h-3 text-[rgba(255,255,255,0.4)]" />
            <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-[rgba(255,255,255,0.55)]">Filters</span>
          </div>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[rgba(255,255,255,0.3)]" />
            <input type="text" value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search titles, summaries…"
              className="w-full bg-[rgba(255,255,255,0.03)] rounded px-3 pl-9 py-2 text-[12px] text-white placeholder:text-[rgba(255,255,255,0.25)] focus:outline-none"
              style={{ border: '1px solid rgba(255,255,255,0.08)' }} />
          </div>

          <div className="flex flex-wrap gap-1.5 mb-2">
            <span className="text-[8px] uppercase tracking-widest text-[rgba(255,255,255,0.4)] mr-1 py-0.5">Source:</span>
            <button onClick={() => setSource(null)}
              className="text-[9px] px-2 py-0.5 rounded uppercase tracking-wider"
              style={{
                background: !source ? 'rgba(155,109,255,0.15)' : 'transparent',
                border: `1px solid ${!source ? 'rgba(155,109,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                color: !source ? '#9b6dff' : 'rgba(255,255,255,0.5)',
              }}>All</button>
            {meta.sources.map(s => (
              <button key={s} onClick={() => setSource(s)}
                className="text-[9px] px-2 py-0.5 rounded uppercase tracking-wider"
                style={{
                  background: source === s ? `${tagColor(s)}20` : 'transparent',
                  border: `1px solid ${source === s ? tagColor(s) : 'rgba(255,255,255,0.1)'}`,
                  color: source === s ? tagColor(s) : 'rgba(255,255,255,0.55)',
                }}>{s}</button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="text-[8px] uppercase tracking-widest text-[rgba(255,255,255,0.4)] mr-1 py-0.5">Framework:</span>
            <button onClick={() => setFramework(null)}
              className="text-[9px] px-2 py-0.5 rounded uppercase tracking-wider"
              style={{
                background: !framework ? 'rgba(155,109,255,0.15)' : 'transparent',
                border: `1px solid ${!framework ? 'rgba(155,109,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                color: !framework ? '#9b6dff' : 'rgba(255,255,255,0.5)',
              }}>All</button>
            {meta.frameworks.map(f => (
              <button key={f} onClick={() => setFramework(f)}
                className="text-[9px] px-2 py-0.5 rounded uppercase tracking-wider"
                style={{
                  background: framework === f ? `${tagColor(f)}20` : 'transparent',
                  border: `1px solid ${framework === f ? tagColor(f) : 'rgba(255,255,255,0.1)'}`,
                  color: framework === f ? tagColor(f) : 'rgba(255,255,255,0.55)',
                }}>{f}</button>
            ))}
          </div>
        </div>

        {/* News stream */}
        {loading && items.length === 0 ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 text-[#9b6dff] animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl p-12 text-center"
            style={{ background: 'rgba(255,255,255,0.02)', border: '2px dashed rgba(255,255,255,0.08)' }}>
            <Newspaper className="w-10 h-10 mx-auto mb-3 text-[rgba(255,255,255,0.2)]" />
            <p className="text-[13px] text-[rgba(255,255,255,0.5)] mb-2">No regulatory updates indexed yet</p>
            <p className="text-[11px] text-[rgba(255,255,255,0.35)]">
              The heartbeat cron will populate this every 6 hours. Trigger it manually with{' '}
              <code className="text-[#9b6dff]">GET /api/cron/heartbeat</code>.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <a key={item.id} href={item.link} target="_blank" rel="noopener noreferrer"
                className="block rounded-lg p-4 transition-all hover:scale-[1.01]"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded flex items-center justify-center font-black shrink-0"
                    style={{
                      background: `${tagColor(item.source)}10`,
                      border: `1px solid ${tagColor(item.source)}40`,
                      color: tagColor(item.source),
                    }}>
                    {SOURCE_LOGOS[item.source] ?? item.source[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                      <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: tagColor(item.source) }}>{item.source}</span>
                      <span className="text-[10px] text-[rgba(255,255,255,0.35)]">·</span>
                      <span className="text-[10px] text-[rgba(255,255,255,0.4)]">{fmtAgo(item.pubDate ?? item.fetchedAt)}</span>
                      <ExternalLink className="w-2.5 h-2.5 text-[rgba(255,255,255,0.3)] ml-auto" />
                    </div>
                    <div className="text-[13px] font-bold text-white leading-snug">{item.title}</div>
                    {item.summary && <div className="text-[11px] text-[rgba(255,255,255,0.55)] leading-relaxed mt-1 line-clamp-2">{item.summary}</div>}
                    {item.frameworks && item.frameworks.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {item.frameworks.slice(0, 6).map(f => (
                          <span key={f} className="text-[8px] px-1.5 py-0.5 rounded-full uppercase tracking-wider"
                            style={{ background: `${tagColor(f)}10`, border: `1px solid ${tagColor(f)}40`, color: tagColor(f) }}>
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
