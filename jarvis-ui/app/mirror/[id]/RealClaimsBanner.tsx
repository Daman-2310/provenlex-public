'use client'

import { useEffect, useState } from 'react'
import { FileCheck2, ExternalLink, Quote } from 'lucide-react'

interface RealClaim {
  metric: string
  label: string
  promised: number | null
  observed: number | null
  unit: string | null
  direction: 'min' | 'max' | null
  quote: string
  confidence: number
}

interface RealMirror {
  has_real: boolean
  entity_name?: string
  source_url?: string
  doc_type?: string
  ingested_at?: string
  page_count?: number
  claims?: RealClaim[]
}

export default function RealClaimsBanner({ prophecyId }: { prophecyId: string }) {
  const [data, setData] = useState<RealMirror | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/mirror/real?id=${encodeURIComponent(prophecyId)}`)
      .then(r => r.json())
      .then(j => { if (!cancelled) setData(j) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [prophecyId])

  // Render nothing until we know — keeps the static page clean when no real data
  if (!data || !data.has_real || !data.claims || data.claims.length === 0) return null

  return (
    <section className="rounded-2xl p-5 mb-8"
      style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.35)', backdropFilter: 'blur(10px)' }}>
      <div className="flex items-center gap-2 mb-2">
        <FileCheck2 className="w-4 h-4 text-[#00ff88]" />
        <span className="text-[11px] uppercase tracking-[0.2em] font-black text-[#00ff88]">
          Real extracted claims · live document
        </span>
        <span className="ml-auto text-[9px] uppercase tracking-wider px-2 py-0.5 rounded font-bold"
          style={{ background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.4)', color: '#00ff88' }}>
          {data.claims.length} real
        </span>
      </div>
      <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-relaxed mb-4">
        These claims were extracted directly from <strong className="text-white">{data.entity_name}</strong>&apos;s
        published {data.doc_type?.replace('_', ' ')} ({data.page_count} pages,
        ingested {data.ingested_at ? new Date(data.ingested_at).toLocaleDateString('en-GB') : 'recently'}).
        Each is shown with the exact source sentence.
        {data.source_url && (
          <>
            {' '}
            <a href={data.source_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#00ff88] hover:underline">
              source document <ExternalLink className="w-3 h-3" />
            </a>
          </>
        )}
      </p>

      <div className="space-y-2">
        {data.claims.map((c, i) => (
          <div key={i} className="rounded-xl p-3"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,255,136,0.2)' }}>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <span className="text-[13px] font-bold text-white">{c.label}</span>
              <div className="flex items-center gap-2">
                {c.promised !== null && (
                  <span className="text-[13px] font-mono font-black text-[#00ff88]">
                    {c.direction === 'min' ? '≥' : c.direction === 'max' ? '≤' : ''} {c.promised}{c.unit ?? ''}
                  </span>
                )}
                <span className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">
                  {c.confidence}% conf
                </span>
              </div>
            </div>
            {c.quote && (
              <div className="flex items-start gap-2 text-[11px] text-[rgba(255,255,255,0.6)] italic leading-relaxed">
                <Quote className="w-3 h-3 shrink-0 mt-0.5 text-[rgba(0,255,136,0.5)]" />
                <span>&ldquo;{c.quote}&rdquo;</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
