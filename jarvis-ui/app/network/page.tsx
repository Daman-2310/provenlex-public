import Link from 'next/link'
import { ArrowLeft, Network as NetworkIcon, AlertTriangle, TrendingUp } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'
import NetworkGraph from '@/components/NetworkGraph'
import { BOOK_SNAPSHOT_ENTRIES, BOOK_SNAPSHOT_MANIFEST } from '@/lib/book-snapshot'
import { COUNTERPARTY_EDGES, computeContagionRisk } from '@/lib/counterparties'

export const metadata = {
  title: 'Genesis Network · Counterparty Contagion Graph · Genesis Swarm',
  description: 'Every EU fund/bank as a node. Custody, prime broker, depositary, sub-advisor edges. Risk propagates along edges. Bloomberg risk terminal, bottom-up.',
}

export const dynamic = 'force-static'

export default function NetworkPage() {
  const entries = BOOK_SNAPSHOT_ENTRIES
  const sealedDate = new Date(BOOK_SNAPSHOT_MANIFEST.sealed_at)

  // Compute network contagion risk for every entity
  const pciByName = new Map<string, number>()
  for (const e of entries) pciByName.set(e.candidate.name, e.pre_crime_index)
  const contagionByName = computeContagionRisk(pciByName)

  const slim = entries.map(e => ({
    prophecy_id: e.prophecy_id,
    name: e.candidate.name,
    jurisdiction: e.candidate.jurisdiction,
    category: e.candidate.category,
    pre_crime_index: e.pre_crime_index,
    contagion_risk: contagionByName.get(e.candidate.name) ?? 0,
  }))

  // Anomalies — entities where contagion_risk > pci by a wide margin
  // These are entities that LOOK safe but are exposed via the network
  const hiddenRisk = slim
    .filter(s => s.contagion_risk - s.pre_crime_index >= 8)
    .sort((a, b) => (b.contagion_risk - b.pre_crime_index) - (a.contagion_risk - a.pre_crime_index))
    .slice(0, 8)

  // High network risk
  const topContagion = slim
    .slice()
    .sort((a, b) => b.contagion_risk - a.contagion_risk)
    .slice(0, 8)

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
          <NetworkIcon className="w-4 h-4 text-[#9b6dff]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#9b6dff]">GENESIS NETWORK</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">
            {entries.length} entities · {COUNTERPARTY_EDGES.length} edges · sealed {sealedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
      </header>

      <div className="relative max-w-7xl mx-auto px-6 py-10">

        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
            style={{ background: 'rgba(155,109,255,0.08)', border: '1px solid rgba(155,109,255,0.3)' }}>
            <NetworkIcon className="w-3 h-3 text-[#9b6dff]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#9b6dff]">
              Bloomberg risk terminal · bottom-up
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-4"
            style={{ fontSize: 'clamp(2rem, 5.5vw, 4rem)', lineHeight: 0.95 }}>
            <span className="text-white">Risk propagates</span>{' '}
            <span style={{
              background: 'linear-gradient(90deg, #9b6dff 0%, #ff3366 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(155,109,255,0.3))',
            }}>through counterparty edges.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-sm max-w-3xl mx-auto leading-relaxed">
            Every node is a Book entity. Every edge is a real-world counterparty relationship —
            custody, prime brokerage, sub-advisory, fund admin, reinsurance.
            Click any node to fire contagion: risk ripples 3 hops along the edges.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* GRAPH */}
          <div className="h-[760px]">
            <NetworkGraph entries={slim} edges={COUNTERPARTY_EDGES} />
          </div>

          {/* SIDEBAR */}
          <aside className="space-y-4">
            {/* Hidden risk panel — what makes Genesis Network unique */}
            <div className="rounded-2xl overflow-hidden flex flex-col"
              style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,170,0,0.25)', backdropFilter: 'blur(10px)' }}>
              <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,170,0,0.15)', background: 'rgba(0,0,0,0.3)' }}>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#ffaa00]" />
                  <div className="text-[10px] font-black tracking-[0.18em] uppercase text-[#ffaa00]">Hidden Network Risk</div>
                </div>
                <div className="text-[8px] mt-1 text-[rgba(255,255,255,0.5)] leading-relaxed">
                  Looks safe on PCI · exposed via counterparty edges
                </div>
              </div>
              <div className="max-h-[280px] overflow-y-auto">
                {hiddenRisk.map(s => (
                  <Link key={s.prophecy_id} href={`/book/${s.prophecy_id}`}
                    className="block px-4 py-2.5 transition-all hover:bg-[rgba(255,170,0,0.04)]"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="text-[11px] font-bold text-white leading-tight mb-1 truncate">{s.name}</div>
                    <div className="flex items-center gap-3 text-[9px]">
                      <span className="text-[rgba(255,255,255,0.45)]">PCI <span className="font-mono text-white">{s.pre_crime_index}</span></span>
                      <span className="text-[rgba(255,255,255,0.45)]">→ Network <span className="font-mono font-bold text-[#ffaa00]">{s.contagion_risk}</span></span>
                      <span className="ml-auto text-[#ffaa00] font-bold">+{s.contagion_risk - s.pre_crime_index}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Top contagion */}
            <div className="rounded-2xl overflow-hidden flex flex-col"
              style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,51,102,0.2)', backdropFilter: 'blur(10px)' }}>
              <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,51,102,0.15)', background: 'rgba(0,0,0,0.3)' }}>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-[#ff3366]" />
                  <div className="text-[10px] font-black tracking-[0.18em] uppercase text-[#ff3366]">Top Network Risk</div>
                </div>
                <div className="text-[8px] mt-1 text-[rgba(255,255,255,0.5)] leading-relaxed">
                  Highest aggregate contagion exposure
                </div>
              </div>
              <div className="max-h-[280px] overflow-y-auto">
                {topContagion.map(s => (
                  <Link key={s.prophecy_id} href={`/book/${s.prophecy_id}`}
                    className="block px-4 py-2.5 transition-all hover:bg-[rgba(255,51,102,0.04)]"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="text-[11px] font-bold text-white leading-tight mb-1 truncate">{s.name}</div>
                    <div className="flex items-center gap-3 text-[9px]">
                      <span className="text-[rgba(255,255,255,0.45)]">PCI <span className="font-mono text-white">{s.pre_crime_index}</span></span>
                      <span className="text-[rgba(255,255,255,0.45)]">·</span>
                      <span className="text-[rgba(255,255,255,0.45)]">Net <span className="font-mono font-bold text-[#ff3366]">{s.contagion_risk}</span></span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </div>

        {/* WHY MATTERS */}
        <section className="rounded-2xl p-6 mt-10"
          style={{ background: 'rgba(155,109,255,0.04)', border: '1px solid rgba(155,109,255,0.25)', backdropFilter: 'blur(10px)' }}>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#9b6dff] font-black mb-3">Why this is the moat</div>
          <p className="text-[13px] text-[rgba(255,255,255,0.75)] leading-relaxed mb-3">
            S&P, Moody&apos;s and Fitch publish standalone ratings. They don&apos;t map who owes whom.
            Bloomberg Terminal has counterparty data but you can&apos;t see it as a public graph.
            <strong className="text-white"> No vendor publishes a network risk metric.</strong>
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.6)] leading-relaxed mb-3">
            Each prospectus we ingest adds edges. Each edge makes every other entity&apos;s
            contagion score more accurate. That is a <strong className="text-white">data moat that
            compounds</strong>. By the time a competitor wants to copy us they have to back-fill
            ten thousand prospectuses.
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.55)] leading-relaxed">
            Strategically: this is what a Bloomberg or Refinitiv acquires. They sell terminals;
            they don&apos;t build new data layers. Genesis Network IS a new data layer.
          </p>
        </section>

      </div>
    </div>
  )
}
