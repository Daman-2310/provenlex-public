import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Eye, FileText, AlertTriangle, AlertCircle, CheckCircle2, ChevronRight } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'
import { getMirrorById } from '@/lib/prospectus'
import type { ResolvedClaim, Severity } from '@/lib/prospectus'
import { BOOK_SNAPSHOT_ENTRIES } from '@/lib/book-snapshot'
import RealClaimsBanner from './RealClaimsBanner'

export const dynamic = 'force-static'

export async function generateStaticParams() {
  return BOOK_SNAPSHOT_ENTRIES.map(e => ({ id: e.prophecy_id }))
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = getMirrorById(id)
  return {
    title: m ? `Mirror · ${m.entity} · Drift Score ${m.drift_score}` : 'Mirror · Entity Not Found',
    description: m ? `Genesis Mirror: ${m.breach_count} breach, ${m.watch_count} watch, ${m.ok_count} ok across ${m.claims.length} tracked claims.` : '',
  }
}

const SEVERITY_COLOR: Record<Severity, string> = {
  breach: '#ff3366',
  watch:  '#ffaa00',
  ok:     '#00ff88',
}

const SEVERITY_LABEL: Record<Severity, string> = {
  breach: 'BREACH',
  watch:  'WATCH',
  ok:     'OK',
}

export default async function MirrorEntityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = getMirrorById(id)
  if (!m) notFound()

  const statusColor = m.breach_count > 0 ? '#ff3366' : m.watch_count > 0 ? '#ffaa00' : '#00ff88'

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent={statusColor} />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/mirror" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Back to Mirror
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Eye className="w-4 h-4" style={{ color: statusColor }} />
          <span className="text-sm font-bold tracking-[0.18em]" style={{ color: statusColor }}>MIRROR DETAIL</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">
            {m.filing_reference} · reviewed {m.last_review}
          </span>
        </div>
      </header>

      <div className="relative max-w-5xl mx-auto px-6 py-10">

        {/* TITLE */}
        <div className="mb-8">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] mb-2">
            {m.jurisdiction} · {m.category.replace('_', ' ')} · PCI {m.pre_crime_index}
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white mb-3 leading-tight">
            {m.entity}
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[11px] uppercase tracking-wider font-bold px-3 py-1.5 rounded"
              style={{ background: `${statusColor}15`, border: `1px solid ${statusColor}40`, color: statusColor }}>
              Drift Score · {m.drift_score}
            </span>
            {m.breach_count > 0 && (
              <span className="text-[11px] uppercase tracking-wider font-bold px-3 py-1.5 rounded"
                style={{ background: 'rgba(255,51,102,0.15)', border: '1px solid rgba(255,51,102,0.4)', color: '#ff3366' }}>
                {m.breach_count} breach{m.breach_count === 1 ? '' : 'es'}
              </span>
            )}
            {m.watch_count > 0 && (
              <span className="text-[11px] uppercase tracking-wider font-bold px-3 py-1.5 rounded"
                style={{ background: 'rgba(255,170,0,0.15)', border: '1px solid rgba(255,170,0,0.4)', color: '#ffaa00' }}>
                {m.watch_count} watch
              </span>
            )}
            <span className="text-[11px] uppercase tracking-wider font-bold px-3 py-1.5 rounded"
              style={{ background: 'rgba(0,255,136,0.10)', border: '1px solid rgba(0,255,136,0.25)', color: '#00ff88' }}>
              {m.ok_count} ok
            </span>
            <Link href={`/book/${m.prophecy_id}`}
              className="ml-auto text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 rounded transition-all hover:bg-[rgba(155,109,255,0.08)]"
              style={{ background: 'rgba(155,109,255,0.06)', border: '1px solid rgba(155,109,255,0.3)', color: '#9b6dff' }}>
              Book entry <ChevronRight className="w-3 h-3 inline" />
            </Link>
          </div>
        </div>

        {/* VERDICT */}
        <section className="rounded-2xl p-5 mb-8"
          style={{ background: `rgba(0,0,0,0.4)`, border: `1px solid ${statusColor}30`, backdropFilter: 'blur(10px)' }}>
          <div className="text-[11px] uppercase tracking-[0.2em] font-black mb-2" style={{ color: statusColor }}>Mirror Verdict</div>
          <p className="text-[13px] text-[rgba(255,255,255,0.85)] leading-relaxed">
            {generateVerdict(m)}
          </p>
        </section>

        {/* REAL EXTRACTED CLAIMS (client-fetched; renders only if a document was ingested) */}
        <RealClaimsBanner prophecyId={m.prophecy_id} />

        {/* CLAIMS TABLE */}
        <section>
          <div className="text-[11px] uppercase tracking-[0.2em] font-black text-[rgba(255,255,255,0.5)] mb-4">
            Tracked claims · {m.claims.length} <span className="text-[rgba(255,255,255,0.3)]">(model baseline)</span>
          </div>
          <div className="space-y-3">
            {m.claims.map(c => <ClaimRow key={c.metric} c={c} />)}
          </div>
        </section>

        {/* FILING REFERENCE */}
        <section className="mt-8 rounded-xl p-4"
          style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-3.5 h-3.5 text-[rgba(255,255,255,0.45)]" />
            <span className="text-[10px] uppercase tracking-wider font-bold text-[rgba(255,255,255,0.5)]">Filing reference</span>
          </div>
          <div className="text-[12px] text-[rgba(255,255,255,0.7)]">{m.filing_reference}</div>
          <div className="text-[10px] text-[rgba(255,255,255,0.4)] mt-2">
            Claims extracted from public regulatory filings. Observed values derived from a
            deterministic synthetic model in v1 (real AIFMD/CSSF filing ingestion in v2).
          </div>
        </section>

      </div>
    </div>
  )
}

function ClaimRow({ c }: { c: ResolvedClaim }) {
  const color = SEVERITY_COLOR[c.severity]
  const Icon = c.severity === 'breach' ? AlertTriangle : c.severity === 'watch' ? AlertCircle : CheckCircle2
  return (
    <div className="rounded-xl p-4"
      style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid ${color}25`, backdropFilter: 'blur(8px)' }}>

      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5" style={{ color }} />
          <span className="text-[13px] font-bold text-white">{c.label}</span>
          <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded"
            style={{ background: `${color}18`, border: `1px solid ${color}40`, color }}>
            {SEVERITY_LABEL[c.severity]}
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.35)] font-mono">{c.source}</span>
      </div>

      <div className="text-[11px] text-[rgba(255,255,255,0.6)] leading-relaxed mb-3">{c.description}</div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded p-2.5" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">Promised ({c.direction})</div>
          <div className="text-[16px] font-black font-mono text-white mt-0.5">{c.promised}{c.unit}</div>
        </div>
        <div className="rounded p-2.5" style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid ${color}20` }}>
          <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">Observed</div>
          <div className="text-[16px] font-black font-mono mt-0.5" style={{ color }}>{c.observed}{c.unit}</div>
        </div>
        <div className="rounded p-2.5" style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid ${color}20` }}>
          <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">Delta</div>
          <div className="text-[16px] font-black font-mono mt-0.5" style={{ color }}>
            {c.delta_pct >= 0 ? '+' : ''}{c.delta_pct}%
          </div>
        </div>
      </div>
    </div>
  )
}

function generateVerdict(m: ReturnType<typeof getMirrorById>): string {
  if (!m) return ''
  if (m.breach_count >= 3) {
    return `${m.entity} is in active breach of ${m.breach_count} stated commitments across ${m.claims.length} tracked claims. This is the elevated-risk profile a Wirecard- or Greensill-style stress historically presents 12 to 18 months before public collapse. LPs holding direct exposure should request a formal explanation under their fund's reporting obligations.`
  }
  if (m.breach_count >= 1) {
    return `${m.entity} is in breach of ${m.breach_count} stated commitment${m.breach_count === 1 ? '' : 's'} as of the most recent review. Other claims (${m.watch_count} in watch, ${m.ok_count} in compliance) remain in range. Breaches at this scale warrant follow-up with the fund's risk officer but do not yet indicate structural failure.`
  }
  if (m.watch_count >= 2) {
    return `${m.entity} is operating within its stated ranges on all claims, but ${m.watch_count} metrics are within 15% of their stated limits. This is the "drifting toward the limit" profile — not yet alarming, but worth monitoring on a quarterly cadence rather than annual.`
  }
  return `${m.entity} is operating cleanly against its prospectus claims. No breaches detected; all ${m.claims.length} tracked metrics are well within stated ranges. This is the baseline profile expected of a well-governed regulated entity.`
}
