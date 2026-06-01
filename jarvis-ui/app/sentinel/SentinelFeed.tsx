'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

interface Posting {
  bot_id: string
  bot_name: string
  bot_role: string
  bot_color: string
  bot_glyph: string
  timestamp: string
  text: string
  entity_name: string
  entity_pci: number
  source_url?: string
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleString()
}

export default function SentinelFeed() {
  const [postings, setPostings] = useState<Posting[]>([])
  const [loading, setLoading] = useState(true)
  const [latest, setLatest] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchFeed() {
      try {
        const res = await fetch('/api/sentinel/feed', { cache: 'no-store' })
        const json = await res.json()
        if (cancelled) return
        setPostings(json.postings ?? [])
        setLatest(json.generated_at ?? null)
      } catch {
        // silent fail; will retry
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchFeed()
    const interval = setInterval(fetchFeed, 20_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  if (loading) {
    return (
      <div className="rounded-2xl p-12 flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(155,109,255,0.2)' }}>
        <Loader2 className="w-6 h-6 text-[#9b6dff] animate-spin" />
      </div>
    )
  }

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(155,109,255,0.2)', backdropFilter: 'blur(10px)' }}>
      <div className="px-4 py-2 flex items-center justify-between"
        style={{ background: 'rgba(155,109,255,0.06)', borderBottom: '1px solid rgba(155,109,255,0.15)' }}>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88]" style={{ animation: 'pulse 1s ease-in-out infinite' }} />
          <span className="text-[10px] uppercase tracking-wider font-bold text-[#00ff88]">LIVE</span>
        </div>
        <span className="text-[9px] text-[rgba(255,255,255,0.4)] font-mono">
          {postings.length} postings · last refresh {latest ? new Date(latest).toLocaleTimeString() : '—'}
        </span>
      </div>

      <div className="max-h-[600px] overflow-y-auto">
        {postings.map((p, i) => (
          <div key={`${p.bot_id}-${p.timestamp}-${i}`} className="px-4 py-3 flex gap-3 transition-all hover:bg-[rgba(255,255,255,0.02)]"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            {/* Avatar */}
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-black shrink-0"
              style={{ background: `${p.bot_color}18`, color: p.bot_color, border: `1px solid ${p.bot_color}40`, boxShadow: `0 0 10px ${p.bot_color}25` }}>
              {p.bot_glyph}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
                <span className="text-[12px] font-bold text-white">{p.bot_name}</span>
                <span className="text-[9px] uppercase tracking-wider" style={{ color: p.bot_color }}>{p.bot_role}</span>
                <span className="text-[9px] text-[rgba(255,255,255,0.4)] ml-auto font-mono">{relativeTime(p.timestamp)}</span>
              </div>
              <div className="text-[12px] text-[rgba(255,255,255,0.85)] leading-relaxed">{p.text}</div>
              {p.source_url && (
                <a href={p.source_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-1 text-[10px] font-mono text-[#9b6dff] hover:underline">
                  source ↗
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
