import Link from 'next/link'
import { ArrowLeft, Search, Target } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'
import { BOOK_SNAPSHOT_ENTRIES } from '@/lib/book-snapshot'
import LookupClient from './LookupClient'

export const metadata = {
  title: 'Search Your Exposure · Genesis Swarm',
  description: 'Type your fund or any counterparty name. Genesis tells you exactly which sealed prophecies are exposed to it, with PCI, trajectory, and pattern match.',
}

export default function LookupPage() {
  // Trim payload sent to client — only what we need for filter/display
  const slim = BOOK_SNAPSHOT_ENTRIES.map(e => ({
    prophecy_id: e.prophecy_id,
    rank: e.rank,
    name: e.candidate.name,
    jurisdiction: e.candidate.jurisdiction,
    category: e.candidate.category,
    pre_crime_index: e.pre_crime_index,
    genesis_score: e.genesis_score,
    trajectory: e.trajectory,
    pattern_match: e.pattern_match ?? null,
    forecast: e.forecast,
  }))

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#4a9eff" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Target className="w-4 h-4 text-[#4a9eff]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#4a9eff]">LOOKUP</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">
            {slim.length} sealed prophecies · instant search
          </span>
        </div>
      </header>

      <div className="relative max-w-5xl mx-auto px-6 py-14">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(74,158,255,0.08)', border: '1px solid rgba(74,158,255,0.3)' }}>
            <Search className="w-3 h-3 text-[#4a9eff]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#4a9eff]">
              Type a fund. See your exposure. In one second.
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.5rem, 6.5vw, 5rem)', lineHeight: 0.95 }}>
            <span className="text-white">Your counterparties.</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #4a9eff 0%, #9b6dff 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(74,158,255,0.3))',
            }}>Already scored.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl mx-auto leading-relaxed">
            Most Luxembourg funds have 5-15 counterparty banks and 20+ asset-management exposures.
            Type any name to see if it&apos;s in the sealed Book, what its Pre-Crime Index is,
            and what historical pattern it matches.
          </p>
        </div>

        <LookupClient entries={slim} />
      </div>
    </div>
  )
}
