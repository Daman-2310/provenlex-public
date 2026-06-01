import Link from 'next/link'
import { ArrowLeft, Crosshair, Calendar, ChevronRight, Hash, Bitcoin, AlertTriangle } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'
import { WATCHLIST, WATCHLIST_PUBLICATION_DATE, WATCHLIST_REVEAL_AT, computeWatchListHash } from '@/lib/watchlist'

export const metadata = {
  title: 'The Genesis Watch List 2026-2027 · 5 EU Entities · Genesis Swarm',
  description: 'Five EU financial entities ranked by Pre-Crime Index trajectory. Cryptographically committed and anchored to Bitcoin. Falsifiable. The kid who called it lives here.',
  openGraph: {
    title: 'The Genesis Watch List 2026-2027',
    description: '5 EU entities · cryptographically committed · Bitcoin-anchored · 18-month reveal window',
    type: 'article',
  },
}

export const dynamic = 'force-static'

export default async function WatchListPage() {
  const hash = await computeWatchListHash()
  const pubDate = new Date(WATCHLIST_PUBLICATION_DATE)
  const revealDate = new Date(WATCHLIST_REVEAL_AT)

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="void" accent="#ff3366" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Crosshair className="w-4 h-4 text-[#ff3366]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#ff3366]">WATCH LIST</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">
            5 entities · sealed {pubDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · reveal {revealDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
      </header>

      <div className="relative max-w-5xl mx-auto px-6 py-14">

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.3)' }}>
            <Crosshair className="w-3 h-3 text-[#ff3366]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#ff3366]">
              Falsifiable. Cryptographically committed. Bitcoin-anchored.
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.5rem, 6.5vw, 5rem)', lineHeight: 0.95 }}>
            <span className="text-white">The Genesis</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #ff3366 0%, #ff7a00 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(255,51,102,0.3))',
            }}>Watch List 2026-2027.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.65)] text-base max-w-3xl mx-auto leading-relaxed">
            Five EU financial entities — selected algorithmically by Pre-Crime Index trajectory
            from the Book of Genesis — at materially elevated risk of operational-risk events in
            the next 18 months. Each entity has documented public-record signals and falsifiable
            vindication criteria. The list is cryptographically sealed and anchored to Bitcoin
            via OpenTimestamps. Anyone, anywhere, anytime can prove this list existed at the
            publication date below.
          </p>
        </div>

        {/* COMMITMENT BLOCK */}
        <section className="rounded-2xl p-6 mb-10"
          style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(247,147,26,0.3)', backdropFilter: 'blur(10px)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Bitcoin className="w-4 h-4 text-[#f7931a]" />
            <span className="text-[10px] uppercase tracking-[0.2em] font-black text-[#f7931a]">Cryptographic Commit</span>
            <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.45)]">SHA-256 · OpenTimestamps · Bitcoin</span>
          </div>
          <div className="space-y-3">
            <Row label="Publication date" value={pubDate.toISOString()} mono />
            <Row label="Reveal window ends" value={revealDate.toISOString()} mono />
            <Row label="SHA-256 commit hash" value={hash} mono break />
          </div>
          <div className="text-[10px] text-[rgba(255,255,255,0.55)] mt-4 leading-relaxed">
            Hash computed over canonical concatenation of all entries (entity, PCI, trajectory,
            forecast, signals, vindication criteria) plus the publication and reveal dates.
            To verify: hit <code className="text-[#f7931a] font-mono">btc.calendar.opentimestamps.org/timestamp/{hash}</code>{' '}
            once the OpenTimestamps anchor is confirmed (~24h after publication).
            See <Link href="/anchor" className="text-[#f7931a] hover:underline">/anchor</Link> for the full anchoring methodology.
          </div>
        </section>

        {/* ENTRIES */}
        <section className="space-y-6 mb-12">
          {WATCHLIST.map((e, idx) => (
            <EntryCard key={e.prophecy_id} entry={e} index={idx + 1} />
          ))}
        </section>

        {/* METHODOLOGY */}
        <section className="rounded-2xl p-6 mb-10"
          style={{ background: 'rgba(255,51,102,0.04)', border: '1px solid rgba(255,51,102,0.25)', backdropFilter: 'blur(10px)' }}>
          <AlertTriangle className="w-5 h-5 text-[#ff3366] mb-3" />
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#ff3366] font-black mb-2">Methodology</div>
          <p className="text-[13px] text-[rgba(255,255,255,0.75)] leading-relaxed mb-3">
            Entities are selected from the Book of Genesis (100 EU entities scored by the 11-bot
            engine) by Pre-Crime Index ≥ 45 and trajectory RISING at the time of publication. The
            top 5 by score, with at least one supporting public-record signal each, form the
            Watch List.
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.65)] leading-relaxed mb-3">
            All forecasts are analytical opinion based exclusively on publicly available
            information. Genesis Swarm does not allege fraud, criminal conduct, or wrongdoing
            of any kind. The vindication criteria are intentionally broad — supervisory action,
            fine, restructuring, audit qualification, leadership change, or share-price stress —
            to capture the range of operational-risk events the analytical framework anticipates.
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.55)] leading-relaxed">
            This Watch List is the falsifiable counterpart to the Book of Genesis. If 18 months
            pass and none of the named entities experiences any of the listed vindication events,
            Genesis Swarm will publicly retire this edition of the Watch List as unconfirmed.
            If any does, the Genesis Obituary mechanism activates for the affected entity.
          </p>
        </section>

        {/* PRESS KIT */}
        <section className="rounded-2xl p-6 mb-10"
          style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(74,158,255,0.25)', backdropFilter: 'blur(10px)' }}>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#4a9eff] font-black mb-4">For journalists</div>
          <div className="space-y-4 text-[13px] text-[rgba(255,255,255,0.78)] leading-relaxed">
            <div>
              <strong className="text-white">Story angle (one line):</strong>{' '}
              A 16-year-old founder in Luxembourg has published a Bitcoin-anchored Watch List of 5 EU financial entities at elevated operational-risk in the next 18 months — and bound himself cryptographically to the dated forecast.
            </div>
            <div>
              <strong className="text-white">What is new:</strong>{' '}
              Risk-scoring lists exist (S&amp;P, Moody&apos;s, Fitch). What does not exist is a publicly-cryptographically-committed list with falsifiable vindication criteria timestamped on a public blockchain. This is the first.
            </div>
            <div>
              <strong className="text-white">Why it is falsifiable:</strong>{' '}
              The SHA-256 commit hash is anchored to Bitcoin via OpenTimestamps. Anyone, anywhere, anytime can prove the list existed on the publication date. If 18 months pass and none of the named entities trigger a vindication criterion, Genesis publicly retires the edition as unconfirmed.
            </div>
            <div>
              <strong className="text-white">The Genesis Obituary mechanism:</strong>{' '}
              If any named entity triggers, the Obituary engine publishes a forensic post-mortem within six hours combining all Genesis signals and the vindicated prophecy. See{' '}
              <Link href="/obituary" className="text-[#4a9eff] hover:underline">/obituary</Link> for the five inaugural Obituary cases already published (Wirecard, Greensill, Archegos, FTX, SVB).
            </div>
            <div>
              <strong className="text-white">Founder:</strong>{' '}
              Daman Sharma, 16, Luxembourg. Built the Genesis scoring engine (11 specialised AI bots, Pre-Crime Index, cryptographic prophecy ledger) and published 100 prophecies in the Book of Genesis. Direct contact: <a href="mailto:daman.sharma.2310@gmail.com" className="text-[#4a9eff] hover:underline">daman.sharma.2310@gmail.com</a>.
            </div>
            <div>
              <strong className="text-white">Verification:</strong>{' '}
              The full Watch List commit hash appears above. Verification path is at{' '}
              <Link href="/anchor" className="text-[#4a9eff] hover:underline">/anchor</Link>. The methodology is at{' '}
              <Link href="/protocol" className="text-[#4a9eff] hover:underline">/protocol</Link>. The full 100-entity Book is at{' '}
              <Link href="/book" className="text-[#4a9eff] hover:underline">/book</Link>.
            </div>
          </div>
        </section>

        {/* LEGAL */}
        <div className="rounded-xl p-4 text-[11px] text-[rgba(255,255,255,0.5)] leading-relaxed"
          style={{ background: 'rgba(255,170,0,0.04)', border: '1px solid rgba(255,170,0,0.2)' }}>
          <strong className="text-[#ffaa00] uppercase tracking-wider text-[10px]">Important · Read first</strong>
          <br />
          This Watch List is published as analytical opinion under freedom-of-expression
          protections. It does not allege fraud, insolvency, criminal conduct, or wrongdoing by
          any named entity. All cited signals are public-record. Genesis Swarm makes no warranty
          of accuracy and provides no investment advice. Readers should consult their own legal
          and financial advisors before acting on any analysis presented here. Affected entities
          have a public right of reply at <a href="mailto:daman.sharma.2310@gmail.com" className="text-[#ffaa00] hover:underline">daman.sharma.2310@gmail.com</a>.
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, mono, break: brk }: { label: string; value: string; mono?: boolean; break?: boolean }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 items-start">
      <div className="text-[10px] uppercase tracking-wider text-[#f7931a] font-bold">{label}</div>
      <div className={`text-[12px] text-white ${mono ? 'font-mono' : ''} ${brk ? 'break-all' : ''}`}>{value}</div>
    </div>
  )
}

function EntryCard({ entry, index }: { entry: typeof WATCHLIST[0]; index: number }) {
  const pciColor = entry.pre_crime_index >= 55 ? '#ff3366' : entry.pre_crime_index >= 50 ? '#ff7a00' : '#ffaa00'
  return (
    <div className="rounded-2xl p-6"
      style={{ background: 'rgba(0,0,0,0.45)', border: `1px solid ${pciColor}30`, backdropFilter: 'blur(10px)' }}>

      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.5)] mb-1">
            <span className="font-mono font-bold" style={{ color: pciColor }}>#{index} / 5</span>
            <span>·</span>
            <span>{entry.jurisdiction}</span>
            <span>·</span>
            <span>{entry.category.replace('_', ' ')}</span>
            {entry.pattern_match && (
              <>
                <span>·</span>
                <span className="font-mono text-[#9b6dff]">pattern: {entry.pattern_match}</span>
              </>
            )}
          </div>
          <h2 className="text-2xl font-black text-white leading-tight">{entry.entity}</h2>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">PCI</div>
          <div className="text-4xl font-black font-mono leading-none" style={{ color: pciColor }}>{entry.pre_crime_index}</div>
          <div className="text-[9px] uppercase tracking-wider font-bold mt-1" style={{ color: pciColor }}>{entry.trajectory}</div>
        </div>
      </div>

      <div className="text-[13px] text-[rgba(255,255,255,0.8)] leading-relaxed mb-5">{entry.forecast}</div>

      {/* SIGNALS */}
      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[rgba(255,255,255,0.55)] mb-2">
          Public-record signals · {entry.signals.length}
        </div>
        <div className="space-y-2">
          {entry.signals.map((s, i) => (
            <div key={i} className="rounded-lg p-3 grid grid-cols-[90px_70px_1fr] gap-3 items-center"
              style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="text-[10px] font-mono text-[rgba(255,255,255,0.5)]">{s.date}</div>
              <span className="text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded text-center"
                style={{
                  background: s.source === 'regulator' ? 'rgba(155,109,255,0.15)' : s.source === 'press' ? 'rgba(74,158,255,0.15)' : s.source === 'audit' ? 'rgba(255,170,0,0.15)' : s.source === 'governance' ? 'rgba(255,51,102,0.15)' : 'rgba(0,255,136,0.15)',
                  color: s.source === 'regulator' ? '#9b6dff' : s.source === 'press' ? '#4a9eff' : s.source === 'audit' ? '#ffaa00' : s.source === 'governance' ? '#ff3366' : '#00ff88',
                }}>
                {s.source}
              </span>
              <div className="text-[12px] text-[rgba(255,255,255,0.78)] leading-snug">
                {s.observation}
                <div className="text-[10px] text-[rgba(255,255,255,0.4)] italic mt-1">— {s.citation}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* VINDICATION CRITERIA */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.2em] font-bold mb-2" style={{ color: pciColor }}>
          Vindication criteria · any one within 18 months triggers
        </div>
        <ul className="space-y-1.5">
          {entry.vindication_criteria.map((v, i) => (
            <li key={i} className="flex items-start gap-2 text-[12px] text-[rgba(255,255,255,0.75)]">
              <ChevronRight className="w-3 h-3 shrink-0 mt-1" style={{ color: pciColor }} />
              <span>{v}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
