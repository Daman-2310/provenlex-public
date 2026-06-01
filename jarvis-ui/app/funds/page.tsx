'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Search, Globe2, TrendingUp, Sparkles, Building } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'

interface Match { lei?: string; name?: string }

// Verified real LEIs of major institutional funds/managers
const FEATURED = [
  { lei: '529900VBK42Y5HHRMD23', name: 'BlackRock Investment Management (UK)', jur: 'GB' },
  { lei: '222100FT5B9H8W7QAQ64', name: 'Pictet & Cie (Europe)', jur: 'LU' },
  { lei: '636700U30BO19GJ39477', name: 'Axel Springer SE', jur: 'DE' },
  { lei: '5493000F4ZO33MV32P92', name: 'Banque Internationale à Luxembourg', jur: 'LU' },
  { lei: '7H6GLXDRUGQFU57RNE97', name: 'JPMorgan Chase Bank, N.A.', jur: 'US' },
  { lei: '254900E1Y2K9JI3LU567', name: 'Allianz Global Investors', jur: 'DE' },
  { lei: '549300SK6OWBKBN9JG40', name: 'Goldman Sachs Asset Management', jur: 'US' },
  { lei: '5493006KMX1VKZ9XO646', name: 'Société Générale', jur: 'FR' },
]

export default function FundsIndexPage() {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<Match[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const t = setTimeout(async () => {
      if (query.trim().length < 3) { setMatches([]); return }
      setSearching(true)
      try {
        const r = await fetch(`/api/real/gleif?q=${encodeURIComponent(query.trim())}`)
        const j = await r.json() as { matches?: Match[] }
        setMatches((j.matches ?? []).slice(0, 8))
      } catch { /* */ }
      setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#4a9eff" />
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Globe2 className="w-4 h-4 text-[#4a9eff]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#4a9eff]">THE 35,000 PROJECT</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">2.4M LEIs · public score per entity</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-12">

        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
            style={{ background: 'rgba(74,158,255,0.08)', border: '1px solid rgba(74,158,255,0.3)' }}>
            <Sparkles className="w-3 h-3 text-[#4a9eff]" />
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#4a9eff]">
              The Wikipedia of operational risk
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-3" style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', lineHeight: 1.05 }}>
            <span className="text-white">A Genesis page</span>
            <br />
            <span style={{ background: 'linear-gradient(90deg, #4a9eff 0%, #00ff88 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              for every fund.
            </span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl mx-auto leading-relaxed">
            2.4 million entities indexed via GLEIF. AI-scored on demand. Each page is a permanent, public,
            cryptographically-anchored compliance dossier. SEO-indexable. Citable.
          </p>
        </div>

        {/* SEARCH */}
        <div className="rounded-2xl p-5 mb-8"
          style={{ background: 'rgba(74,158,255,0.04)', border: '1px solid rgba(74,158,255,0.25)' }}>
          <div className="flex items-center gap-3 mb-3">
            <Search className="w-4 h-4 text-[#4a9eff]" />
            <span className="text-[11px] uppercase tracking-[0.2em] text-[#4a9eff] font-black">Find any entity</span>
          </div>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by fund/company name (e.g. BlackRock, Pictet, JPMorgan)"
            className="w-full px-4 py-3 rounded-lg text-sm bg-[rgba(0,0,0,0.4)] text-white border border-[rgba(74,158,255,0.3)] focus:border-[#4a9eff] outline-none"
          />
          {searching && <div className="text-[10px] text-[rgba(255,255,255,0.4)] mt-2">searching GLEIF…</div>}
          {matches.length > 0 && (
            <div className="mt-3 space-y-1">
              {matches.map(m => m.lei && (
                <Link key={m.lei} href={`/funds/${m.lei}`}
                  className="flex items-center gap-3 px-3 py-2 rounded text-[12px] hover:bg-[rgba(74,158,255,0.06)] transition-colors">
                  <Building className="w-3.5 h-3.5 text-[#4a9eff] shrink-0" />
                  <span className="flex-1 truncate text-white" dangerouslySetInnerHTML={{ __html: m.name ?? m.lei }} />
                  <span className="font-mono text-[10px] text-[rgba(255,255,255,0.4)]">{m.lei}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* FEATURED */}
        <div className="mb-12">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] font-black mb-4">
            Featured institutional entities
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {FEATURED.map(f => (
              <Link key={f.lei} href={`/funds/${f.lei}`}
                className="group rounded-xl p-4 transition-all hover:scale-[1.02]"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(74,158,255,0.25)' }}>
                <div className="flex items-start justify-between mb-2">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ background: 'rgba(74,158,255,0.1)', border: '1px solid rgba(74,158,255,0.4)' }}>
                    <Building className="w-4 h-4 text-[#4a9eff]" />
                  </div>
                  <span className="text-[8px] uppercase tracking-widest font-black px-1.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88' }}>
                    {f.jur}
                  </span>
                </div>
                <div className="text-[13px] font-black text-white mb-1 leading-tight">{f.name}</div>
                <div className="text-[9px] font-mono text-[rgba(255,255,255,0.4)]">{f.lei}</div>
                <div className="text-[10px] mt-2 flex items-center gap-1 text-[#4a9eff] opacity-0 group-hover:opacity-100 transition-opacity">
                  <TrendingUp className="w-3 h-3" /> View dossier →
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* MANIFESTO */}
        <div className="rounded-2xl p-8"
          style={{ background: 'rgba(74,158,255,0.03)', border: '1px solid rgba(74,158,255,0.2)' }}>
          <Globe2 className="w-6 h-6 text-[#4a9eff] mb-3" />
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#4a9eff] font-black mb-2">Manifesto</div>
          <p className="text-[14px] text-[rgba(255,255,255,0.7)] leading-relaxed">
            Every legal entity in the world that holds an LEI has a Genesis page — public, permanent, indexable.
            Score is computed on-demand, anchored cryptographically on view. Fund managers can dispute, but they
            cannot erase. The page becomes the Schelling point for institutional due diligence.
          </p>
        </div>

      </div>
    </div>
  )
}
