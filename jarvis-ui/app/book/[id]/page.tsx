import Link from 'next/link'
import { ArrowLeft, BookOpen, Lock, ShieldAlert, Bitcoin, CheckCircle2, MapPin, Hash, ExternalLink, TrendingUp, TrendingDown, Minus, Newspaper } from 'lucide-react'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import CosmicBackground from '@/components/CosmicBackground'
import EntryInteractive from '@/components/EntryInteractive'
import { explainScore } from '@/lib/explainability'
import { generateTimeSeries } from '@/lib/timeseries'

interface BookEntry {
  rank: number
  candidate: { name: string; lei?: string; jurisdiction: string; category: string }
  pre_crime_index: number
  genesis_score: number
  trajectory: string
  pattern_match?: string
  forecast: string
  merkle_root: string
  signature: string
  prophecy_id: string
}

interface VindicationHit {
  outlet: string
  headline: string
  url: string
  published_at: string
  detected_at: string
  signal_words: string[]
  confidence: number
  ai_reason: string
}

async function fetchEntry(id: string): Promise<{ entry: BookEntry | null; vindication: VindicationHit | null }> {
  const h = await headers()
  const host = h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? 'http'
  try {
    const r = await fetch(`${proto}://${host}/api/book/entry?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
    if (!r.ok) return { entry: null, vindication: null }
    const j = (await r.json()) as { entry?: BookEntry; vindication?: VindicationHit }
    return { entry: j.entry ?? null, vindication: j.vindication ?? null }
  } catch { return { entry: null, vindication: null } }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const { entry: e } = await fetchEntry(id).catch(() => ({ entry: null, vindication: null }))
  if (!e) return { title: 'Sealed Prophecy · Book of Genesis' }
  return {
    title: `#${e.rank.toString().padStart(2, '0')} ${e.candidate.name} · Book of Genesis`,
    description: `Pre-Crime Index ${e.pre_crime_index}/100 · sealed on Bitcoin's blockchain · ${e.forecast}`,
  }
}

const CATEGORY_LABEL: Record<string, string> = {
  asset_mgmt: 'ASSET MANAGEMENT',
  bank: 'BANKING',
  insurance: 'INSURANCE',
  private_equity: 'PRIVATE EQUITY',
  real_estate: 'REAL ESTATE',
  wealth: 'WEALTH MANAGEMENT',
  depositary: 'DEPOSITARY',
}

const indexColor = (idx: number) => idx >= 70 ? '#ff3366' : idx >= 50 ? '#ff7700' : idx >= 30 ? '#ffaa00' : '#00ff88'

export default async function BookEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { entry: e, vindication } = await fetchEntry(id)

  // Compute explainability + time series server-side (deterministic, no IO)
  const breakdown = e ? await explainScore({
    prophecy_id: e.prophecy_id,
    entity: e.candidate.name,
    jurisdiction: e.candidate.jurisdiction,
    category: e.candidate.category,
    total_score: e.pre_crime_index,
  }) : null
  const timeseries = e ? await generateTimeSeries({
    prophecy_id: e.prophecy_id,
    current_score: e.pre_crime_index,
  }) : null

  if (!e) {
    return (
      <div className="min-h-screen text-white flex items-center justify-center"
        style={{ background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)' }}>
        <div className="text-center">
          <BookOpen className="w-12 h-12 text-[#9b6dff] mx-auto mb-4 opacity-50" />
          <div className="text-[16px] font-black mb-2">Entry not found</div>
          <div className="text-[11px] text-[rgba(255,255,255,0.5)] mb-6">
            Prophecy ID <span className="font-mono text-[#9b6dff]">{id}</span> not in the Book of Genesis.
          </div>
          <Link href="/book" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] uppercase tracking-wider font-black"
            style={{ background: 'rgba(155,109,255,0.1)', color: '#9b6dff', border: '1px solid rgba(155,109,255,0.4)' }}>
            ← Back to the Book
          </Link>
        </div>
      </div>
    )
  }

  const c = indexColor(e.pre_crime_index)
  const TIcon = e.trajectory === 'RISING' ? TrendingUp : e.trajectory === 'FALLING' ? TrendingDown : Minus
  const tColor = e.trajectory === 'RISING' ? '#ff3366' : e.trajectory === 'FALLING' ? '#00ff88' : '#ffaa00'

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant={vindication ? 'intense' : 'calm'} accent={vindication ? '#ff3366' : '#9b6dff'} />
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/book" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Book of Genesis
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Lock className="w-4 h-4" style={{ color: vindication ? '#ff3366' : '#9b6dff' }} />
          <span className="text-sm font-bold tracking-[0.18em]" style={{ color: vindication ? '#ff3366' : '#9b6dff' }}>
            {vindication ? 'VINDICATED PROPHECY' : 'SEALED PROPHECY'}
          </span>
          <span className="ml-auto text-[9px] font-mono text-[rgba(255,255,255,0.4)]">{e.prophecy_id}</span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12">

        {/* RANK + IDENTITY */}
        <div className="text-center mb-10">
          <div className="font-black tabular-nums leading-none mb-2"
            style={{ fontSize: 'clamp(5rem, 12vw, 9rem)', color: c, textShadow: `0 0 40px ${c}80` }}>
            {e.rank.toString().padStart(2, '0')}
          </div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[rgba(255,255,255,0.4)] font-black mb-3">
            of 100 sealed prophecies
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-3">{e.candidate.name}</h1>
          <div className="flex flex-wrap items-center justify-center gap-3 text-[11px]">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(74,158,255,0.06)', border: '1px solid rgba(74,158,255,0.3)', color: '#4a9eff' }}>
              <MapPin className="w-3 h-3" /> {e.candidate.jurisdiction}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88' }}>
              <Hash className="w-3 h-3" /> {CATEGORY_LABEL[e.candidate.category]}
            </span>
            {e.candidate.lei && (
              <span className="text-[10px] font-mono text-[rgba(255,255,255,0.45)]">LEI {e.candidate.lei}</span>
            )}
          </div>
        </div>

        {/* SCORES */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-10">
          <ScoreTile label="Pre-Crime Index" value={e.pre_crime_index} suffix="/100" color={c} big />
          <ScoreTile label="Genesis Score" value={e.genesis_score} suffix="/100" color={indexColor(100 - e.genesis_score)} />
          <div className="rounded-xl p-4"
            style={{ background: `${tColor}06`, border: `1px solid ${tColor}30` }}>
            <div className="text-[8px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] mb-2 font-bold">Trajectory</div>
            <div className="flex items-baseline gap-2">
              <TIcon className="w-6 h-6" style={{ color: tColor }} />
              <span className="text-2xl font-black uppercase tracking-wider" style={{ color: tColor }}>{e.trajectory}</span>
            </div>
          </div>
        </div>

        {/* VINDICATION (only if matched by Vindication Engine) */}
        {vindication && (
          <div className="rounded-2xl p-6 mb-8"
            style={{
              background: 'linear-gradient(135deg, rgba(255,51,102,0.12) 0%, rgba(0,0,0,0.4) 100%)',
              border: '1px solid rgba(255,51,102,0.5)',
              boxShadow: '0 0 32px rgba(255,51,102,0.2)',
              backdropFilter: 'blur(10px)',
            }}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#ff3366]" />
                <span className="text-[11px] uppercase tracking-[0.2em] text-[#ff3366] font-black">VINDICATED · prophecy confirmed</span>
              </div>
              <span className="text-[10px] uppercase tracking-wider font-black px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(255,51,102,0.15)', color: '#ff3366', border: '1px solid rgba(255,51,102,0.5)' }}>
                AI CONFIDENCE {vindication.confidence}/100
              </span>
            </div>
            <a href={vindication.url} target="_blank" rel="noopener noreferrer"
              className="block text-[15px] leading-snug text-white font-bold mb-2 hover:text-[#ff3366] transition-colors">
              "{vindication.headline}"
            </a>
            <div className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.55)] font-mono mb-3 flex flex-wrap gap-2">
              <span><Newspaper className="w-2.5 h-2.5 inline mr-1" />{vindication.outlet}</span>
              <span>·</span>
              <span>{new Date(vindication.published_at).toUTCString()}</span>
              <span>·</span>
              <span>signal: <span className="text-[#ff3366]">{vindication.signal_words.join(', ')}</span></span>
            </div>
            <div className="rounded p-3 text-[11px] leading-relaxed text-[rgba(255,255,255,0.7)] italic"
              style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span className="not-italic text-[9px] uppercase tracking-wider text-[#ff3366] font-black mr-2">AI verification:</span>
              {vindication.ai_reason}
            </div>
            <a href={vindication.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-3 text-[10px] uppercase tracking-wider text-[#ff3366] font-bold hover:underline">
              Read the source <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        )}

        {/* FORECAST */}
        <div className="rounded-2xl p-6 mb-8"
          style={{
            background: `linear-gradient(135deg, ${c}08 0%, rgba(0,0,0,0) 100%)`,
            border: `1px solid ${c}30`,
            boxShadow: `0 0 32px ${c}10`,
          }}>
          <div className="text-[9px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] mb-3 font-black">
            {vindication ? 'Original forecast (now confirmed)' : 'Operational-risk forecast'}
          </div>
          <p className="text-[16px] leading-relaxed text-[rgba(255,255,255,0.9)] pl-3"
            style={{ borderLeft: `2px solid ${c}60` }}>
            {e.forecast}
          </p>
        </div>

        {/* PATTERN MATCH */}
        {e.pattern_match && (
          <div className="rounded-lg p-4 mb-8"
            style={{ background: 'rgba(255,51,102,0.06)', border: '1px solid rgba(255,51,102,0.3)' }}>
            <div className="text-[9px] text-[#ff3366] uppercase tracking-[0.18em] font-bold mb-1">Historical pattern match</div>
            <div className="text-2xl font-black text-[#ff3366] uppercase tracking-wider">{e.pattern_match}</div>
          </div>
        )}

        {/* TIME SERIES + EXPLAINABILITY (interactive) */}
        {breakdown && timeseries && <EntryInteractive breakdown={breakdown} timeseries={timeseries} />}

        {/* CRYPTOGRAPHIC SEAL */}
        <div className="rounded-2xl p-6 mb-8"
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(155,109,255,0.3)' }}>
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert className="w-4 h-4 text-[#9b6dff]" />
            <span className="text-[11px] uppercase tracking-[0.2em] text-[#9b6dff] font-black">Cryptographic seal</span>
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase font-black px-2 py-1 rounded-full"
              style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.4)' }}>
              <CheckCircle2 className="w-3 h-3" /> SEALED
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px] font-mono">
            <KV k="Prophecy ID" v={e.prophecy_id} />
            <KV k="Rank" v={`#${e.rank} of 100`} />
            <KV k="Merkle root" v={'0x' + e.merkle_root} mono />
            <KV k="Signature" v={'0x' + e.signature.slice(0, 32) + '…'} mono />
          </div>
          <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,0.06)]">
            <div className="text-[11px] text-[rgba(255,255,255,0.55)] leading-relaxed">
              <strong className="text-[#9b6dff]">Bitcoin anchoring:</strong> This prophecy is one of 100 in the Book.
              The Book's combined Merkle root is submitted to the OpenTimestamps calendar at seal time, then bundled
              into a Bitcoin transaction. The blockchain becomes a public witness that this prediction was made
              on this date — verifiable independently months or years later.
            </div>
          </div>
        </div>

        {/* RELATED ACTIONS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Link href={`/court?subject=${encodeURIComponent(e.candidate.name)}`}
            className="rounded-lg p-4 transition-all hover:scale-[1.02]"
            style={{ background: 'rgba(74,158,255,0.04)', border: '1px solid rgba(74,158,255,0.3)' }}>
            <div className="text-[10px] uppercase tracking-wider text-[#4a9eff] font-bold mb-1">Convene the Court →</div>
            <div className="text-[12px] text-[rgba(255,255,255,0.7)]">3 AI judges deliberate on this entity</div>
          </Link>
          <Link href={`/eye?subject=${encodeURIComponent(e.candidate.name)}`}
            className="rounded-lg p-4 transition-all hover:scale-[1.02]"
            style={{ background: 'rgba(255,51,102,0.04)', border: '1px solid rgba(255,51,102,0.3)' }}>
            <div className="text-[10px] uppercase tracking-wider text-[#ff3366] font-bold mb-1">Open The Eye →</div>
            <div className="text-[12px] text-[rgba(255,255,255,0.7)]">Live surveillance scan, public log</div>
          </Link>
          <Link href={`/prophecy?subject=${encodeURIComponent(e.candidate.name)}`}
            className="rounded-lg p-4 transition-all hover:scale-[1.02]"
            style={{ background: 'rgba(155,109,255,0.04)', border: '1px solid rgba(155,109,255,0.3)' }}>
            <div className="text-[10px] uppercase tracking-wider text-[#9b6dff] font-bold mb-1">Issue your own prophecy →</div>
            <div className="text-[12px] text-[rgba(255,255,255,0.7)]">Seal a fresh forecast on this entity</div>
          </Link>
        </div>

      </div>
    </div>
  )
}

function ScoreTile({ label, value, suffix, color, big }: { label: string; value: number; suffix: string; color: string; big?: boolean }) {
  return (
    <div className="rounded-xl p-4"
      style={{ background: `${color}06`, border: `1px solid ${color}30` }}>
      <div className="text-[8px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] mb-2 font-bold">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={big ? 'text-5xl font-black tabular-nums' : 'text-3xl font-black tabular-nums'}
          style={{ color, textShadow: big ? `0 0 20px ${color}80` : `0 0 12px ${color}50` }}>
          {value}
        </span>
        <span className="text-[10px] uppercase font-mono text-[rgba(255,255,255,0.4)]">{suffix}</span>
      </div>
    </div>
  )
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex gap-2 min-w-0">
      <span className="text-[rgba(255,255,255,0.4)] uppercase tracking-wider shrink-0 w-28">{k}</span>
      <span className={`truncate ${mono ? 'text-[#9b6dff]' : 'text-[rgba(255,255,255,0.85)]'}`}>{v}</span>
    </div>
  )
}

// Suppress unused-import warnings
void Bitcoin
void ExternalLink
