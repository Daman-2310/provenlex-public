import Link from 'next/link'
import { ArrowLeft, Globe2, AlertTriangle } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'
import EntityGlobe from '@/components/EntityGlobe'
import { BOOK_SNAPSHOT_ENTRIES, BOOK_SNAPSHOT_MANIFEST } from '@/lib/book-snapshot'
import { generateTimeSeries } from '@/lib/timeseries'

export const metadata = {
  title: 'Genesis Globe · Live Pattern Contagion · Genesis Swarm',
  description: 'All 100 sealed Book of Genesis prophecies plotted on a 3D globe. Scrub through 18 months of history. Trigger pattern contagion. Switch between PCI / trajectory / pattern / category layers.',
}

export const dynamic = 'force-static'

export default async function GlobePage({ searchParams }: { searchParams: Promise<{ present?: string }> }) {
  const sp = await searchParams
  const isPresentMode = sp.present === '1'

  const entries = BOOK_SNAPSHOT_ENTRIES
  const topRising = entries.filter(e => e.trajectory === 'RISING').sort((a, b) => b.pre_crime_index - a.pre_crime_index).slice(0, 8)
  const sealedDate = new Date(BOOK_SNAPSHOT_MANIFEST.sealed_at)

  // Precompute 18-month timeseries for all 100 entries (server-side, deterministic).
  // Each entity gets {prophecy_id, points: [{date, pci}, ...18]} — total ~50KB serialized.
  const allSeries = await Promise.all(
    entries.map(async e => {
      const ts = await generateTimeSeries({ prophecy_id: e.prophecy_id, current_score: e.pre_crime_index, months: 18 })
      return {
        prophecy_id: e.prophecy_id,
        points: ts.points.map(p => ({ date: p.date, pci: p.pre_crime_index })),
      }
    })
  )

  // Slim entries shipped to client
  const slim = entries.map(e => ({
    prophecy_id: e.prophecy_id,
    rank: e.rank,
    name: e.candidate.name,
    jurisdiction: e.candidate.jurisdiction,
    category: e.candidate.category,
    pre_crime_index: e.pre_crime_index,
    trajectory: e.trajectory,
    pattern_match: e.pattern_match ?? null,
  }))

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="intense" accent="#9b6dff" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Globe2 className="w-4 h-4 text-[#9b6dff]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#9b6dff]">GENESIS GLOBE</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">
            {entries.length} prophecies · 18-month history · sealed {sealedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
      </header>

      <div className="relative max-w-7xl mx-auto px-6 py-10">

        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
            style={{ background: 'rgba(155,109,255,0.08)', border: '1px solid rgba(155,109,255,0.3)' }}>
            <Globe2 className="w-3 h-3 text-[#9b6dff]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#9b6dff]">
              Scrub history · Trigger contagion · Switch layers
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-4"
            style={{ fontSize: 'clamp(2rem, 5.5vw, 4rem)', lineHeight: 0.95 }}>
            <span className="text-white">The world,</span>{' '}
            <span style={{
              background: 'linear-gradient(90deg, #9b6dff 0%, #4a9eff 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(155,109,255,0.3))',
            }}>scored across time.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-sm max-w-2xl mx-auto leading-relaxed">
            Click any pin to ignite pattern contagion. Drag the time slider to walk through 18 months of risk history.
            Toggle layers to switch what the colors mean.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* GLOBE */}
          <div className="h-[720px]">
            <EntityGlobe entries={slim} history={allSeries} presentDefault={isPresentMode} />
          </div>

          {/* RISING WATCHLIST */}
          <aside className="rounded-2xl overflow-hidden flex flex-col"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,51,102,0.2)', backdropFilter: 'blur(10px)' }}>
            <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(255,51,102,0.1)', background: 'rgba(0,0,0,0.3)' }}>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-[#ff3366]" />
                <div className="text-[10px] font-black tracking-[0.18em] uppercase text-[#ff3366]">Rising Watchlist</div>
              </div>
              <div className="text-[8px] uppercase tracking-wider mt-1 text-[rgba(255,255,255,0.4)]">
                {topRising.length} entities · trajectory RISING
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {topRising.map(e => (
                <Link key={e.prophecy_id} href={`/book/${e.prophecy_id}`}
                  className="block px-4 py-3 transition-all hover:bg-[rgba(255,51,102,0.04)]"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="text-[11px] font-bold text-white leading-tight flex-1">{e.candidate.name}</div>
                    <div className="text-[10px] font-mono font-black shrink-0" style={{ color: e.pre_crime_index >= 50 ? '#ff3366' : '#ffaa00' }}>
                      {e.pre_crime_index}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] uppercase tracking-wider">
                    <span className="text-[rgba(255,255,255,0.4)]">{e.candidate.jurisdiction}</span>
                    <span className="text-[rgba(255,255,255,0.25)]">·</span>
                    <span className="text-[rgba(255,255,255,0.4)]">{e.candidate.category.replace('_', ' ')}</span>
                    {e.pattern_match && (
                      <>
                        <span className="text-[rgba(255,255,255,0.25)]">·</span>
                        <span className="font-mono text-[#9b6dff]">{e.pattern_match}</span>
                      </>
                    )}
                  </div>
                </Link>
              ))}
            </div>

            <div className="px-4 py-3 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.3)' }}>
              <Link href="/book" className="text-[10px] uppercase tracking-wider font-bold text-[#9b6dff] hover:underline">
                Open the full Book →
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
