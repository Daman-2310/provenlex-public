'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Newspaper, ExternalLink, Clock, AlertOctagon, RefreshCw } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'

interface VindicationHit {
  prophecy_id: string
  subject: string
  pre_crime_index: number
  signal_words: string[]
  outlet: string
  headline: string
  url: string
  published_at: string
  detected_at: string
  confidence: number
  ai_reason: string
}

export default function VindicationsPage() {
  const [hits, setHits] = useState<VindicationHit[]>([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(Date.now())

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/vindicate/check')
      const j = await r.json() as { vindications?: VindicationHit[] }
      setHits(j.vindications ?? [])
    } catch { /* */ }
    setLoading(false)
  }

  useEffect(() => { void load() }, [])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="intense" accent="#ff3366" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Link href="/book" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Book of Genesis
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <CheckCircle2 className="w-4 h-4 text-[#ff3366]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#ff3366]">VINDICATION LOG</span>
          <button onClick={() => void load()}
            className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded text-[9px] uppercase tracking-wider font-bold hover:bg-[rgba(255,255,255,0.06)]"
            style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)' }}>
            <RefreshCw className={`w-2.5 h-2.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </header>

      <div className="relative max-w-6xl mx-auto px-6 py-14">

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.3)' }}>
            <CheckCircle2 className="w-3 h-3 text-[#ff3366]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#ff3366]">
              Confirmed by external press · AI verified
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.75rem, 7vw, 5.5rem)', lineHeight: 0.95 }}>
            <span className="text-white">Predictions,</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #ff3366 0%, #ff7700 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(255,51,102,0.3))',
            }}>
              now in the news.
            </span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl mx-auto leading-relaxed">
            The Vindication Engine scans credible outlets daily for distress events on Book entities.
            Hits require a strict pre-filter pass AND an AI verification step at confidence ≥ 70.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-10">
          <Stat label="Total vindications" value={hits.length} color="#ff3366" />
          <Stat label="Avg confidence" value={hits.length === 0 ? 0 : Math.round(hits.reduce((s, h) => s + h.confidence, 0) / hits.length)} suffix="/100" color="#ff7700" />
          <Stat label="Last 24h" value={hits.filter(h => (now - new Date(h.detected_at).getTime()) < 86400_000).length} color="#9b6dff" />
        </div>

        {loading ? (
          <div className="rounded-lg p-8 text-center text-[12px] text-[rgba(255,255,255,0.4)]"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)' }}>
            Loading vindications…
          </div>
        ) : hits.length === 0 ? (
          <div className="rounded-2xl p-10 text-center"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(10px)' }}>
            <AlertOctagon className="w-12 h-12 text-[rgba(255,255,255,0.2)] mx-auto mb-4" />
            <div className="text-[16px] font-black text-white mb-2">No vindications yet</div>
            <div className="text-[12px] text-[rgba(255,255,255,0.5)] max-w-md mx-auto leading-relaxed">
              The Vindication Engine runs at 07:00 UTC daily.
              Nothing on Genesis-tracked entities has crossed the strict filter yet.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {hits.map(h => (
              <VindicationCard key={h.prophecy_id + h.detected_at} hit={h} />
            ))}
          </div>
        )}

        <div className="mt-14 rounded-2xl p-8"
          style={{ background: 'rgba(255,51,102,0.03)', border: '1px solid rgba(255,51,102,0.2)' }}>
          <CheckCircle2 className="w-6 h-6 text-[#ff3366] mb-3" />
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#ff3366] font-black mb-2">How vindications work</div>
          <p className="text-[13px] text-[rgba(255,255,255,0.7)] leading-relaxed">
            Every morning at 07:00 UTC, the Vindication Engine queries Google News for distress events
            on each Book entity. Candidate hits must pass seven filters in sequence:
            entity-in-headline, strong distress signal, no exclusion phrase, no negation pattern,
            subject precedes verb, credible outlet, and finally an AI verification step with
            confidence ≥ 70. Anything that fails is rejected silently.
          </p>
        </div>

      </div>
    </div>
  )
}

function Stat({ label, value, color, suffix }: { label: string; value: number; color: string; suffix?: string }) {
  return (
    <div className="rounded-xl p-5"
      style={{
        background: `linear-gradient(135deg, ${color}10 0%, rgba(0,0,0,0.4) 100%)`,
        border: `1px solid ${color}40`,
        boxShadow: `0 0 24px ${color}15`,
        backdropFilter: 'blur(10px)',
      }}>
      <div className="text-[9px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.5)] font-black mb-2">{label}</div>
      <div className="font-black tabular-nums leading-none"
        style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', color, textShadow: `0 0 16px ${color}80` }}>
        {value}{suffix && <span className="text-[10px] text-[rgba(255,255,255,0.4)] ml-1 uppercase">{suffix}</span>}
      </div>
    </div>
  )
}

function VindicationCard({ hit }: { hit: VindicationHit }) {
  return (
    <Link href={`/book/${hit.prophecy_id}`}
      className="block rounded-2xl p-5 transition-all hover:scale-[1.005]"
      style={{
        background: 'linear-gradient(90deg, rgba(255,51,102,0.06) 0%, rgba(0,0,0,0.3) 100%)',
        border: '1px solid rgba(255,51,102,0.3)',
        backdropFilter: 'blur(10px)',
      }}>
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#ff3366] shrink-0" />
          <span className="text-[13px] font-black text-white">{hit.subject}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] uppercase tracking-wider font-bold text-[rgba(255,255,255,0.5)]">
            PCI {hit.pre_crime_index}
          </span>
          <span className="text-[9px] uppercase tracking-wider font-black px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(255,51,102,0.15)', color: '#ff3366', border: '1px solid rgba(255,51,102,0.5)' }}>
            {hit.confidence}/100
          </span>
        </div>
      </div>
      <div className="text-[13px] text-[rgba(255,255,255,0.85)] leading-snug mb-2">
        "{hit.headline}"
      </div>
      <div className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] font-mono flex flex-wrap gap-2 items-center mb-2">
        <span><Newspaper className="w-2.5 h-2.5 inline mr-1" />{hit.outlet}</span>
        <span>·</span>
        <span><Clock className="w-2.5 h-2.5 inline mr-1" />{new Date(hit.published_at).toLocaleDateString()}</span>
        <span>·</span>
        <span>signal: <span className="text-[#ff3366]">{hit.signal_words.join(', ')}</span></span>
        <a href={hit.url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 ml-auto text-[#4a9eff] hover:underline normal-case"
          onClick={e => e.stopPropagation()}>
          source <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>
      <div className="rounded p-2 text-[10px] text-[rgba(255,255,255,0.6)] italic"
        style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <span className="not-italic text-[8px] uppercase tracking-wider text-[#ff3366] font-black mr-1.5">AI:</span>
        {hit.ai_reason}
      </div>
    </Link>
  )
}
