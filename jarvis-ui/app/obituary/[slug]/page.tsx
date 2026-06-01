import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, AlertOctagon, Calendar, ExternalLink, TrendingUp, FileText, Lightbulb } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'
import { OBITUARIES, getObituary } from '@/lib/obituaries'
import type { ObituarySignal, ObituaryProphecy } from '@/lib/obituaries'

export const dynamic = 'force-static'

export async function generateStaticParams() {
  return OBITUARIES.map(o => ({ slug: o.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const o = getObituary(slug)
  if (!o) return { title: 'Obituary not found' }
  return {
    title: `Genesis Obituary · ${o.entity} · ${o.pattern_marker}`,
    description: o.one_liner,
  }
}

export default async function ObituaryDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const o = getObituary(slug)
  if (!o) notFound()

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="void" accent="#ff3366" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/obituary" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> All Obituaries
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <AlertOctagon className="w-4 h-4 text-[#ff3366]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#ff3366]">OBITUARY</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)] font-mono">
            {o.pattern_marker}
          </span>
        </div>
      </header>

      <article className="relative max-w-4xl mx-auto px-6 py-12">

        {/* TITLE */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.5)] mb-2">
            <Calendar className="w-3 h-3 text-[#ff3366]" />
            <span>Collapsed {new Date(o.collapse_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            <span className="text-[rgba(255,255,255,0.25)]">·</span>
            <span>{o.jurisdiction}</span>
            <span className="text-[rgba(255,255,255,0.25)]">·</span>
            <span>{o.category.replace('_', ' ')}</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white leading-tight mb-4">
            {o.entity}
          </h1>
          <p className="text-[16px] text-[rgba(255,255,255,0.75)] leading-relaxed mb-4">
            {o.one_liner}
          </p>
          <div className="inline-block text-[11px] uppercase tracking-wider font-bold px-3 py-1.5 rounded"
            style={{ background: 'rgba(255,51,102,0.15)', border: '1px solid rgba(255,51,102,0.4)', color: '#ff3366' }}>
            {o.loss_estimate_eur}
          </div>
        </div>

        {/* WHAT HAPPENED */}
        <Section title="What Happened" icon={<AlertOctagon className="w-4 h-4 text-[#ff3366]" />}>
          {o.what_happened.split('\n\n').map((para, i) => (
            <p key={i} className="text-[14px] text-[rgba(255,255,255,0.8)] leading-relaxed mb-4">{para}</p>
          ))}
        </Section>

        {/* WHAT GENESIS WOULD HAVE SEEN */}
        <Section title="What Genesis Would Have Seen" icon={<TrendingUp className="w-4 h-4 text-[#9b6dff]" />} accent="#9b6dff">
          {o.what_genesis_would_have_seen.split('\n\n').map((para, i) => (
            <p key={i} className="text-[14px] text-[rgba(255,255,255,0.8)] leading-relaxed mb-4">{para}</p>
          ))}
        </Section>

        {/* PROPHECY TIMELINE */}
        <Section title="Pre-Crime Trajectory (Backcast)" icon={<TrendingUp className="w-4 h-4 text-[#ffaa00]" />} accent="#ffaa00">
          <div className="text-[11px] text-[rgba(255,255,255,0.55)] mb-4 leading-relaxed">
            What Genesis would have published, dated, in advance. Each row represents the official Pre-Crime Index
            assignment that would have been visible on the Book of Genesis ledger at that point in time.
          </div>
          <div className="space-y-3">
            {o.prophecy_timeline.map((p, i) => <ProphecyRow key={i} p={p} />)}
          </div>
        </Section>

        {/* SIGNALS */}
        <Section title="Observable Signals" icon={<FileText className="w-4 h-4 text-[#4a9eff]" />} accent="#4a9eff">
          <div className="text-[11px] text-[rgba(255,255,255,0.55)] mb-4 leading-relaxed">
            Public-record signals available before collapse. Each contributed to Pre-Crime Index assignment.
          </div>
          <div className="space-y-2">
            {o.signals.map((s, i) => <SignalRow key={i} s={s} />)}
          </div>
        </Section>

        {/* LESSONS */}
        <Section title="Lessons" icon={<Lightbulb className="w-4 h-4 text-[#00ff88]" />} accent="#00ff88">
          <ul className="space-y-3">
            {o.lessons.map((l, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="text-[#00ff88] mt-1 font-mono text-[12px] shrink-0">{(i + 1).toString().padStart(2, '0')}.</span>
                <span className="text-[14px] text-[rgba(255,255,255,0.8)] leading-relaxed">{l}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* CITATIONS */}
        <Section title="Citations" icon={<ExternalLink className="w-4 h-4 text-[rgba(255,255,255,0.5)]" />}>
          <div className="space-y-2">
            {o.citations.map((c, i) => (
              <a key={i} href={c.url} target="_blank" rel="noopener noreferrer"
                className="block rounded p-3 transition-all hover:bg-[rgba(255,255,255,0.04)]"
                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-white font-bold truncate">{c.source}</div>
                    <div className="text-[10px] text-[rgba(255,255,255,0.4)] mt-0.5 font-mono truncate">{c.url}</div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] shrink-0">{c.date}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-[rgba(255,255,255,0.3)] shrink-0" />
                </div>
              </a>
            ))}
          </div>
        </Section>

        <div className="rounded-xl p-4 text-[11px] text-[rgba(255,255,255,0.5)] leading-relaxed"
          style={{ background: 'rgba(255,170,0,0.04)', border: '1px solid rgba(255,170,0,0.2)' }}>
          <strong className="text-[#ffaa00] uppercase tracking-wider text-[10px]">Methodology</strong>
          <br />
          This obituary is a backcast: a reconstruction of what Genesis Swarm would have published using only
          signals that were public before collapse. No private or non-public information is used. Pre-Crime
          Index values are derived from the same scoring logic Genesis applies to currently-live entities
          (see the Book of Genesis ledger). Citations link to the original public sources.
        </div>

      </article>
    </div>
  )
}

function Section({ title, icon, accent = '#ff3366', children }: { title: string; icon: React.ReactNode; accent?: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="text-[12px] uppercase tracking-[0.2em] font-black" style={{ color: accent }}>{title}</h2>
      </div>
      {children}
    </section>
  )
}

function ProphecyRow({ p }: { p: ObituaryProphecy }) {
  const color = p.pre_crime_index >= 70 ? '#ff3366' : p.pre_crime_index >= 50 ? '#ffaa00' : '#ffd86b'
  return (
    <div className="rounded-xl p-4 grid grid-cols-[100px_1fr_70px] gap-4 items-center"
      style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid ${color}25` }}>
      <div className="text-[10px] uppercase tracking-wider font-mono text-[rgba(255,255,255,0.55)] font-bold">{p.date}</div>
      <div className="text-[12px] text-[rgba(255,255,255,0.8)] leading-relaxed">{p.forecast}</div>
      <div className="text-right">
        <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">PCI</div>
        <div className="text-2xl font-black font-mono leading-none" style={{ color }}>{p.pre_crime_index}</div>
      </div>
    </div>
  )
}

function SignalRow({ s }: { s: ObituarySignal }) {
  const sourceColor = s.source === 'regulator' ? '#9b6dff' : s.source === 'press' ? '#4a9eff' : s.source === 'audit' ? '#ffaa00' : s.source === 'governance' ? '#ff3366' : '#00ff88'
  return (
    <div className="rounded-lg p-3 grid grid-cols-[100px_80px_1fr_60px] gap-3 items-center"
      style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="text-[10px] uppercase tracking-wider font-mono text-[rgba(255,255,255,0.5)] font-bold">{s.date}</div>
      <span className="text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded text-center"
        style={{ background: `${sourceColor}15`, border: `1px solid ${sourceColor}40`, color: sourceColor }}>
        {s.source}
      </span>
      <div className="text-[12px] text-[rgba(255,255,255,0.78)] leading-snug">{s.signal}</div>
      <div className="text-right text-[11px] font-mono font-bold text-[#ff3366]">
        {s.genesis_contribution > 0 ? `+${s.genesis_contribution}` : '—'}
      </div>
    </div>
  )
}
