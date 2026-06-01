'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, BookOpen, Lock, Sparkles, ShieldAlert, ExternalLink, Clock, Bitcoin,
  TrendingUp, TrendingDown, Minus, Filter, ArrowDown, CheckCircle2,
} from 'lucide-react'
import LegalDisclaimer from '@/components/LegalDisclaimer'
import CosmicBackground from '@/components/CosmicBackground'

interface Manifest {
  version: string
  sealed_at: string
  reveal_at: string
  total_prophecies: number
  vindications: number
  misses: number
  pending: number
  merkle_root: string
  ots_calendar?: string
  ots_submitted_at?: string
  ots_status: 'PENDING_ANCHOR' | 'CALENDAR_ATTESTED' | 'BITCOIN_CONFIRMED'
  has_receipt: boolean
}

interface VindicationHit {
  outlet: string
  headline: string
  url: string
  published_at: string
  detected_at: string
  signal_words: string[]
}

interface BookEntry {
  rank: number
  candidate: { name: string; lei?: string; jurisdiction: string; category: string }
  pre_crime_index: number
  genesis_score: number
  trajectory: 'RISING' | 'FALLING' | 'HOLDING'
  pattern_match?: string
  forecast: string
  merkle_root: string
  prophecy_id: string
  vindication?: VindicationHit
}

interface StateResponse {
  sealed: boolean
  manifest?: Manifest
  entries?: BookEntry[]
  message?: string
}

const CATEGORY_LABEL: Record<string, string> = {
  asset_mgmt: 'ASSET MGMT',
  bank: 'BANKING',
  insurance: 'INSURANCE',
  private_equity: 'PRIVATE EQUITY',
  real_estate: 'REAL ESTATE',
  wealth: 'WEALTH',
  depositary: 'DEPOSITARY',
}

const indexColor = (idx: number) => idx >= 70 ? '#ff3366' : idx >= 50 ? '#ff7700' : idx >= 30 ? '#ffaa00' : '#00ff88'

export default function BookPage() {
  const [state, setState] = useState<StateResponse | null>(null)
  const [now, setNow] = useState(Date.now())
  const [filter, setFilter] = useState<string>('all')
  const [sort, setSort] = useState<'pre_crime' | 'name' | 'jurisdiction'>('pre_crime')

  useEffect(() => {
    void fetch('/api/book/state').then(r => r.json()).then(setState)
  }, [])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const filtered = useMemo(() => {
    if (!state?.entries) return []
    let list = filter === 'all' ? state.entries : state.entries.filter(e => e.candidate.category === filter)
    if (sort === 'pre_crime') list = [...list].sort((a, b) => b.pre_crime_index - a.pre_crime_index)
    else if (sort === 'name') list = [...list].sort((a, b) => a.candidate.name.localeCompare(b.candidate.name))
    else list = [...list].sort((a, b) => a.candidate.jurisdiction.localeCompare(b.candidate.jurisdiction))
    return list
  }, [state, filter, sort])

  const categories = useMemo(() => {
    if (!state?.entries) return [] as string[]
    return Array.from(new Set(state.entries.map(e => e.candidate.category)))
  }, [state])

  // Live counter
  const sealedMs = state?.manifest ? new Date(state.manifest.sealed_at).getTime() : 0
  const daysWaiting = sealedMs ? Math.max(0, Math.floor((now - sealedMs) / 86400_000)) : 0
  const hoursWaiting = sealedMs ? Math.max(0, Math.floor(((now - sealedMs) % 86400_000) / 3600_000)) : 0
  const minutesWaiting = sealedMs ? Math.max(0, Math.floor(((now - sealedMs) % 3600_000) / 60_000)) : 0
  const secondsWaiting = sealedMs ? Math.max(0, Math.floor(((now - sealedMs) % 60_000) / 1000)) : 0

  // Distribution stats
  const counts = useMemo(() => {
    const e = state?.entries ?? []
    return {
      critical: e.filter(x => x.pre_crime_index >= 70).length,
      elevated: e.filter(x => x.pre_crime_index >= 50 && x.pre_crime_index < 70).length,
      moderate: e.filter(x => x.pre_crime_index >= 30 && x.pre_crime_index < 50).length,
      low:      e.filter(x => x.pre_crime_index < 30).length,
    }
  }, [state])

  if (state && !state.sealed) {
    return <UnsealedView />
  }

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="intense" accent="#9b6dff" />

      {/* Legacy fallback starfield kept hidden — superseded by CosmicBackground */}
      <div className="fixed inset-0 pointer-events-none opacity-0">
        <StarField />
      </div>

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <BookOpen className="w-4 h-4" style={{ color: '#9b6dff' }} />
          <span className="text-sm font-bold tracking-[0.18em]" style={{ color: '#9b6dff' }}>THE BOOK OF GENESIS</span>
          {state?.manifest && (
            <>
              <span className="hidden md:inline-block ml-3 text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] font-mono">
                {state.manifest.version}
              </span>
              <span className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] uppercase tracking-[0.18em] font-black"
                style={{
                  background: 'rgba(255,170,0,0.06)',
                  border: '1px solid rgba(255,170,0,0.3)',
                  color: '#ffaa00',
                }}>
                <Bitcoin className="w-2.5 h-2.5" />
                {state.manifest.ots_status === 'BITCOIN_CONFIRMED' ? 'BITCOIN ANCHORED' :
                 state.manifest.ots_status === 'CALENDAR_ATTESTED' ? 'CALENDAR ATTESTED · PENDING BTC' :
                 'AWAITING ANCHOR'}
              </span>
            </>
          )}
        </div>
      </header>

      <div className="relative max-w-7xl mx-auto px-6 py-12">

        {/* HERO */}
        <div className="text-center mb-14 relative">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(155,109,255,0.08)', border: '1px solid rgba(155,109,255,0.3)' }}>
            <Lock className="w-3 h-3" style={{ color: '#9b6dff' }} />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: '#9b6dff' }}>
              {state?.manifest?.total_prophecies ?? 100} sealed prophecies · anchored on bitcoin
            </span>
          </div>

          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(3rem, 8vw, 7rem)', lineHeight: 0.95 }}>
            <span style={{
              background: 'linear-gradient(135deg, #9b6dff 0%, #4a9eff 30%, #00ff88 60%, #ffaa00 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 30px rgba(155,109,255,0.3))',
            }}>
              THE BOOK
            </span>
            <br />
            <span className="text-white">OF GENESIS</span>
          </h1>

          <p className="text-[rgba(255,255,255,0.6)] text-base md:text-lg max-w-3xl mx-auto leading-relaxed mb-2">
            <strong className="text-white">100 named EU financial entities.</strong> Each scored. Each sealed. Each forecast committed to Bitcoin's blockchain.
          </p>
          <p className="text-[rgba(255,255,255,0.45)] text-sm max-w-2xl mx-auto leading-relaxed italic">
            "There is no losing scenario. Every collapse vindicates us. Every miss makes us sharper.
            Bitcoin is the witness." — Genesis Doctrine §1
          </p>

          {/* Live counter */}
          {state?.manifest && (
            <div className="mt-10 mx-auto inline-block">
              <div className="grid grid-cols-3 gap-3 md:gap-6">
                <Counter label="Predictions" value={state.manifest.total_prophecies} color="#9b6dff" />
                <Link href="/vindications" className="block transition-transform hover:scale-[1.02]">
                  <Counter label="Vindications" value={state.manifest.vindications} color={state.manifest.vindications > 0 ? '#ff3366' : '#00ff88'} />
                </Link>
                <Counter label="Days waiting" value={daysWaiting} color="#ffaa00" suffix={`d ${hoursWaiting}h ${minutesWaiting}m ${secondsWaiting}s`} small />
              </div>
            </div>
          )}
        </div>

        {/* DISTRIBUTION STRIP */}
        {state?.entries && (
          <div className="rounded-2xl p-5 mb-8 grid grid-cols-2 md:grid-cols-4 gap-3"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Distro label="Critical (≥70)" count={counts.critical} total={state.entries.length} color="#ff3366" />
            <Distro label="Elevated (50-69)" count={counts.elevated} total={state.entries.length} color="#ff7700" />
            <Distro label="Moderate (30-49)" count={counts.moderate} total={state.entries.length} color="#ffaa00" />
            <Distro label="Low (<30)" count={counts.low} total={state.entries.length} color="#00ff88" />
          </div>
        )}

        {/* CRYPTOGRAPHIC SEAL */}
        {state?.manifest && (
          <div className="rounded-2xl p-6 mb-10"
            style={{ background: 'rgba(155,109,255,0.04)', border: '1px solid rgba(155,109,255,0.25)' }}>
            <div className="flex items-start gap-4 flex-wrap">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(155,109,255,0.1)', border: '1px solid rgba(155,109,255,0.4)' }}>
                <ShieldAlert className="w-5 h-5 text-[#9b6dff]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] uppercase tracking-[0.2em] text-[#9b6dff] font-black mb-1">Cryptographic seal</div>
                <div className="text-[12px] font-mono text-[rgba(255,255,255,0.7)] truncate">
                  <span className="text-[rgba(255,255,255,0.4)] mr-2">MERKLE ROOT</span>
                  <span className="text-[#9b6dff]">0x{state.manifest.merkle_root}</span>
                </div>
                <div className="text-[10px] text-[rgba(255,255,255,0.5)] mt-1">
                  Sealed {new Date(state.manifest.sealed_at).toUTCString()}
                  {state.manifest.ots_submitted_at && (
                    <> · OTS submitted {new Date(state.manifest.ots_submitted_at).toUTCString()}</>
                  )}
                </div>
                <div className="text-[10px] text-[rgba(255,255,255,0.55)] mt-2">
                  Reveal window opens <span className="text-[#ffaa00] font-bold">{new Date(state.manifest.reveal_at).toUTCString()}</span> (18 months)
                </div>
              </div>
              <div className="shrink-0 flex flex-col gap-2 items-stretch">
                <a href="https://opentimestamps.org/" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-[10px] uppercase tracking-wider font-bold"
                  style={{ background: 'rgba(255,170,0,0.06)', color: '#ffaa00', border: '1px solid rgba(255,170,0,0.3)' }}>
                  <Bitcoin className="w-3 h-3" /> Verify on OpenTimestamps
                  <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                </a>
                <button
                  onClick={() => { void navigator.clipboard.writeText(state.manifest!.merkle_root) }}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-[10px] uppercase tracking-wider font-bold"
                  style={{ background: 'rgba(155,109,255,0.06)', color: '#9b6dff', border: '1px solid rgba(155,109,255,0.3)' }}>
                  Copy root
                </button>
              </div>
            </div>
          </div>
        )}

        {/* FILTERS */}
        {state?.entries && (
          <div className="rounded-xl p-3 mb-4 flex flex-wrap items-center gap-2"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Filter className="w-3.5 h-3.5 text-[rgba(255,255,255,0.4)] ml-1" />
            <Chip active={filter === 'all'} onClick={() => setFilter('all')}>All ({state.entries.length})</Chip>
            {categories.map(c => (
              <Chip key={c} active={filter === c} onClick={() => setFilter(c)}>
                {CATEGORY_LABEL[c] ?? c.toUpperCase()} ({state.entries!.filter(e => e.candidate.category === c).length})
              </Chip>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">Sort:</span>
              <select value={sort} onChange={e => setSort(e.target.value as 'pre_crime' | 'name' | 'jurisdiction')}
                className="px-2 py-1 rounded text-[10px] uppercase tracking-wider font-bold bg-[rgba(0,0,0,0.4)] text-white border border-[rgba(255,255,255,0.1)]">
                <option value="pre_crime">By Pre-Crime Index</option>
                <option value="name">By name</option>
                <option value="jurisdiction">By jurisdiction</option>
              </select>
            </div>
          </div>
        )}

        {/* TABLE */}
        {state?.entries && (
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="grid grid-cols-[50px_1fr_80px_120px_100px_36px] gap-3 px-4 py-3 text-[8px] uppercase tracking-[0.18em] font-black text-[rgba(255,255,255,0.45)]"
              style={{ background: 'rgba(155,109,255,0.04)', borderBottom: '1px solid rgba(155,109,255,0.2)' }}>
              <span>Rank</span>
              <span>Entity</span>
              <span>Juris.</span>
              <span>Pre-Crime</span>
              <span>Trajectory</span>
              <span></span>
            </div>
            <div className="divide-y divide-[rgba(255,255,255,0.04)]">
              {filtered.map(e => (
                <BookRow key={e.prophecy_id} entry={e} />
              ))}
            </div>
            {filtered.length === 0 && (
              <div className="px-4 py-12 text-center text-[12px] text-[rgba(255,255,255,0.4)]">
                No entries match this filter.
              </div>
            )}
          </div>
        )}

        {/* DOCTRINE FOOTER */}
        <div className="mt-14 rounded-2xl p-8"
          style={{ background: 'linear-gradient(135deg, rgba(155,109,255,0.04) 0%, rgba(74,158,255,0.03) 100%)', border: '1px solid rgba(155,109,255,0.25)' }}>
          <BookOpen className="w-6 h-6 text-[#9b6dff] mb-3" />
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#9b6dff] font-black mb-2">The Doctrine</div>
          <p className="text-[14px] text-[rgba(255,255,255,0.7)] leading-relaxed mb-3">
            The Book is published in good faith as an AI analytical exercise. <strong className="text-white">No claim of wrongdoing</strong>{' '}
            is made against any named entity. The forecasts are probabilistic operational-risk indicators computed against
            historical archetypes (Wirecard, Archegos, FTX, Greensill, Madoff) used <em>as analytical patterns only</em>, and
            time-stamped on a public blockchain so that, eighteen months from sealing, the forecasts can be independently
            audited for predictive accuracy.
          </p>
          <p className="text-[13px] text-[rgba(255,255,255,0.55)] leading-relaxed italic">
            The Book is updated periodically. Each update is sealed anew. Earlier seals remain forever — the
            chain does not forget. This is the first publicly-published, blockchain-anchored AI operational-risk
            research project in European finance.
          </p>
          <div className="mt-5 flex items-center gap-3 text-[10px] uppercase tracking-wider">
            <Link href="/protocol" className="text-[#9b6dff] hover:underline">→ GENESIS-1 Standard</Link>
            <span className="text-[rgba(255,255,255,0.2)]">·</span>
            <Link href="/prophecy" className="text-[#4a9eff] hover:underline">→ Issue your own prophecy</Link>
            <span className="text-[rgba(255,255,255,0.2)]">·</span>
            <Link href="/about" className="text-[#00ff88] hover:underline">→ About the editor</Link>
            <span className="text-[rgba(255,255,255,0.2)]">·</span>
            <Link href="/legal" className="text-[#ffaa00] hover:underline">→ Legal &amp; right-to-erasure</Link>
          </div>
        </div>

        <div className="mt-6">
          <LegalDisclaimer variant="full" />
        </div>

      </div>

      {/* Animated keyframes */}
      <style jsx global>{`
        @keyframes bookStarDrift {
          from { transform: translateY(0); }
          to   { transform: translateY(-100vh); }
        }
        @keyframes counterPulse {
          0%, 100% { box-shadow: 0 0 0 0 currentColor; opacity: 1; }
          50%      { box-shadow: 0 0 16px 2px currentColor; opacity: 0.85; }
        }
      `}</style>
    </div>
  )
}

function Counter({ label, value, color, suffix, small }: { label: string; value: number; color: string; suffix?: string; small?: boolean }) {
  return (
    <div className="rounded-2xl px-4 md:px-6 py-4 md:py-5 min-w-[110px] md:min-w-[160px]"
      style={{
        background: `linear-gradient(135deg, ${color}10 0%, rgba(0,0,0,0.4) 100%)`,
        border: `1px solid ${color}40`,
        boxShadow: `0 0 24px ${color}15`,
      }}>
      <div className="text-[8px] md:text-[9px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.5)] font-black mb-2">{label}</div>
      <div className="font-black tabular-nums leading-none"
        style={{
          fontSize: small ? 'clamp(1.25rem, 2.5vw, 1.75rem)' : 'clamp(2rem, 4vw, 3.5rem)',
          color,
          textShadow: `0 0 24px ${color}80`,
        }}>
        {small ? value : value.toLocaleString()}
      </div>
      {suffix && <div className="text-[9px] text-[rgba(255,255,255,0.5)] uppercase tracking-wider font-mono mt-1">{suffix}</div>}
    </div>
  )
}

function Distro({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = Math.round((count / total) * 100)
  return (
    <div className="rounded-lg p-3"
      style={{ background: `${color}06`, border: `1px solid ${color}25` }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[8px] uppercase tracking-[0.15em] font-black" style={{ color }}>{label}</span>
        <span className="text-[10px] font-mono text-[rgba(255,255,255,0.5)]">{pct}%</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-black tabular-nums" style={{ color }}>{count}</span>
        <span className="text-[9px] text-[rgba(255,255,255,0.4)]">/ {total}</span>
      </div>
      <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}aa, ${color})`, boxShadow: `0 0 6px ${color}` }} />
      </div>
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="px-2.5 py-1 rounded-full text-[9px] uppercase tracking-[0.15em] font-black transition-colors"
      style={{
        background: active ? 'rgba(155,109,255,0.15)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${active ? 'rgba(155,109,255,0.5)' : 'rgba(255,255,255,0.08)'}`,
        color: active ? '#9b6dff' : 'rgba(255,255,255,0.55)',
      }}>
      {children}
    </button>
  )
}

function BookRow({ entry }: { entry: BookEntry }) {
  const c = indexColor(entry.pre_crime_index)
  const TIcon = entry.trajectory === 'RISING' ? TrendingUp : entry.trajectory === 'FALLING' ? TrendingDown : Minus
  const tColor = entry.trajectory === 'RISING' ? '#ff3366' : entry.trajectory === 'FALLING' ? '#00ff88' : '#ffaa00'
  const vindicated = !!entry.vindication

  return (
    <Link href={`/book/${entry.prophecy_id}`}
      className="grid grid-cols-[50px_1fr_80px_120px_100px_36px] gap-3 px-4 py-3 items-center hover:bg-[rgba(155,109,255,0.04)] transition-colors group"
      style={vindicated ? { background: 'linear-gradient(90deg, rgba(255,51,102,0.06) 0%, rgba(0,0,0,0) 60%)' } : undefined}>
      <div className="font-black text-2xl tabular-nums" style={{ color: c, textShadow: `0 0 8px ${c}60` }}>
        {entry.rank.toString().padStart(2, '0')}
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-bold truncate text-white group-hover:text-[#9b6dff] transition-colors flex items-center gap-2">
          {entry.candidate.name}
          {vindicated && (
            <span className="text-[8px] uppercase font-black px-1.5 py-0.5 rounded-full shrink-0"
              style={{ background: 'rgba(255,51,102,0.15)', color: '#ff3366', border: '1px solid rgba(255,51,102,0.5)', boxShadow: '0 0 8px rgba(255,51,102,0.3)' }}>
              VINDICATED
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[8px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] font-mono">{CATEGORY_LABEL[entry.candidate.category]}</span>
          {entry.pattern_match && (
            <span className="text-[8px] uppercase font-black px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(255,51,102,0.1)', color: '#ff3366', border: '1px solid rgba(255,51,102,0.3)' }}>
              {entry.pattern_match}
            </span>
          )}
        </div>
      </div>
      <div className="text-[10px] uppercase font-mono font-bold text-[rgba(255,255,255,0.65)]">{entry.candidate.jurisdiction}</div>
      <div className="flex items-center gap-2">
        <div className="text-xl font-black tabular-nums w-8" style={{ color: c }}>{entry.pre_crime_index}</div>
        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div className="h-full rounded-full" style={{
            width: `${Math.min(100, entry.pre_crime_index)}%`,
            background: `linear-gradient(90deg, ${c}aa, ${c})`,
            boxShadow: `0 0 4px ${c}`,
          }} />
        </div>
      </div>
      <div className="flex items-center gap-1">
        <TIcon className="w-3 h-3" style={{ color: tColor }} />
        <span className="text-[9px] uppercase tracking-wider font-black" style={{ color: tColor }}>{entry.trajectory}</span>
      </div>
      <ArrowDown className="w-3 h-3 -rotate-[135deg] text-[rgba(255,255,255,0.3)] group-hover:text-[#9b6dff] transition-colors" />
    </Link>
  )
}

function StarField() {
  // Generate static set of stars (SSR-safe via deterministic positions)
  const stars = Array.from({ length: 60 }, (_, i) => {
    const x = (i * 37) % 100
    const y = (i * 53) % 100
    const size = (i % 4) + 1
    const delay = (i * 0.13) % 5
    return { x, y, size, delay }
  })
  return (
    <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.size * 0.05}
          fill="#9b6dff"
          style={{
            animation: `bookStarDrift ${20 + s.delay * 2}s linear infinite`,
            animationDelay: `-${s.delay * 4}s`,
            opacity: 0.4,
          }} />
      ))}
    </svg>
  )
}

function UnsealedView() {
  return (
    <div className="min-h-screen text-white flex items-center justify-center px-6"
      style={{ background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)' }}>
      <div className="text-center max-w-xl">
        <BookOpen className="w-16 h-16 text-[#9b6dff] mx-auto mb-6 opacity-60" />
        <div className="text-[24px] font-black mb-3">The Book has not yet been sealed.</div>
        <div className="text-[13px] text-[rgba(255,255,255,0.55)] leading-relaxed mb-8">
          100 named EU financial entities will be scored, sealed, Merkle-rooted, and anchored on Bitcoin's blockchain.
          The Book is updated weekly. The first seal is moments away.
        </div>
        <div className="flex items-center justify-center gap-3 text-[10px] uppercase tracking-wider">
          <Clock className="w-3.5 h-3.5 text-[#ffaa00]" />
          <span className="text-[#ffaa00] font-bold">Awaiting initial seal</span>
        </div>
      </div>
    </div>
  )
}

// Suppress unused-import warnings
void CheckCircle2
void Sparkles
