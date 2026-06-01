import Link from 'next/link'
import { ArrowLeft, Eye, AlertTriangle, FileText, Search } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'
import { getAllMirrors } from '@/lib/prospectus'
import MirrorList from './MirrorList'

export const metadata = {
  title: 'Genesis Mirror · Prospectus vs Reality Drift · Genesis Swarm',
  description: 'Every Book entity scored against its own stated rules. AIFMD claims compared to observed behavior. The metric LPs actually want.',
}

export default function MirrorPage() {
  const mirrors = getAllMirrors().sort((a, b) => b.drift_score - a.drift_score)
  const totalBreaches = mirrors.reduce((s, m) => s + m.breach_count, 0)
  const totalWatches = mirrors.reduce((s, m) => s + m.watch_count, 0)
  const totalClaims = mirrors.reduce((s, m) => s + m.claims.length, 0)
  const entitiesInBreach = mirrors.filter(m => m.breach_count > 0).length

  // Slim for client component
  const slim = mirrors.map(m => ({
    prophecy_id: m.prophecy_id,
    entity: m.entity,
    jurisdiction: m.jurisdiction,
    category: m.category,
    pre_crime_index: m.pre_crime_index,
    drift_score: m.drift_score,
    breach_count: m.breach_count,
    watch_count: m.watch_count,
    ok_count: m.ok_count,
    filing_reference: m.filing_reference,
    last_review: m.last_review,
  }))

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#00d8ff" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Eye className="w-4 h-4 text-[#00d8ff]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#00d8ff]">MIRROR</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">
            Prospectus claim engine · {totalClaims} claims across {mirrors.length} entities
          </span>
        </div>
      </header>

      <div className="relative max-w-6xl mx-auto px-6 py-14">

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(0,216,255,0.08)', border: '1px solid rgba(0,216,255,0.3)' }}>
            <FileText className="w-3 h-3 text-[#00d8ff]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#00d8ff]">
              The question every LP asks · the metric no vendor publishes
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.5rem, 6.5vw, 5rem)', lineHeight: 0.95 }}>
            <span className="text-white">Is your fund</span>{' '}
            <span style={{
              background: 'linear-gradient(90deg, #00d8ff 0%, #4a9eff 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(0,216,255,0.3))',
            }}>following its own rules?</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl mx-auto leading-relaxed">
            Every regulated EU entity publishes claims about how it will behave — Tier-1 ratios,
            NAV deviation caps, solvency floors, concentration limits.
            Genesis Mirror tracks each promise against observed behavior, and flags drift before
            it becomes a regulator letter.
          </p>
        </div>

        {/* HEADLINE STATS */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          <Stat label="Entities monitored"  value={mirrors.length.toString()}      color="#ffffff" />
          <Stat label="Total claims tracked" value={totalClaims.toString()}         color="#00d8ff" />
          <Stat label="In breach (any claim)" value={entitiesInBreach.toString()}  color="#ff3366" />
          <Stat label="Watch-list claims"    value={totalWatches.toString()}        color="#ffaa00" />
        </section>

        <MirrorList mirrors={slim} />

        {/* WHY MATTERS */}
        <section className="rounded-2xl p-6 mt-10"
          style={{ background: 'rgba(0,216,255,0.04)', border: '1px solid rgba(0,216,255,0.25)', backdropFilter: 'blur(10px)' }}>
          <AlertTriangle className="w-5 h-5 text-[#00d8ff] mb-3" />
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#00d8ff] font-black mb-2">Why Mirror is the moat that compounds</div>
          <p className="text-[13px] text-[rgba(255,255,255,0.75)] leading-relaxed mb-3">
            Bloomberg Terminal shows price data. S&P shows credit ratings. Refinitiv shows news flow.
            <strong className="text-white"> No vendor publishes "is this fund actually following its own prospectus."</strong>
            That is the question LPs ask quarterly and currently have to answer themselves with a
            stack of PDFs.
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.6)] leading-relaxed mb-3">
            Every prospectus we ingest adds claims to monitor. Every monitored claim adds a
            data-point in the drift series. After 18 months we have the only public dataset of
            <strong className="text-white"> promise-vs-reality across EU finance</strong>. A Refinitiv
            engineer cannot replicate this in less than 24 months even with their budget.
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.55)] leading-relaxed">
            Strategically: this is the data layer the rating agencies should have built and didn&apos;t.
            Genesis Mirror is what an acquirer pays a premium to own.
          </p>
        </section>

      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl p-4 text-center"
      style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid ${color}30`, backdropFilter: 'blur(8px)' }}>
      <div className="text-[28px] font-black font-mono leading-none mb-1.5" style={{ color }}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.5)]">{label}</div>
    </div>
  )
}
