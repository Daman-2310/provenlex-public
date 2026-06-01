import Link from 'next/link'
import { ArrowLeft, Anchor, CheckCircle2, Clock, ExternalLink, Hash, Bitcoin, Copy } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'
import { BOOK_SNAPSHOT_MANIFEST } from '@/lib/book-snapshot'
import AnchorClient from './AnchorClient'

export const metadata = {
  title: 'Bitcoin Anchor Proof · The Book of Genesis · Genesis Swarm',
  description: 'Cryptographic proof that the Book of Genesis was sealed before the events it predicts. Merkle root anchored on Bitcoin via OpenTimestamps. Verifiable by anyone, forever.',
}

const STATUS_LABELS: Record<string, { label: string; color: string; description: string }> = {
  PENDING_ANCHOR:     { label: 'PENDING ANCHOR',     color: '#ffaa00', description: 'Calendar submission in progress.' },
  CALENDAR_ATTESTED:  { label: 'CALENDAR ATTESTED',  color: '#4a9eff', description: 'OpenTimestamps calendar has issued a receipt. Bitcoin confirmation aggregates within ~24h on the next bundle transaction.' },
  BITCOIN_CONFIRMED:  { label: 'BITCOIN CONFIRMED',  color: '#00ff88', description: 'Anchored permanently in a Bitcoin block. Verifiable forever, independent of Genesis Swarm.' },
}

export default function AnchorPage() {
  const m = BOOK_SNAPSHOT_MANIFEST
  const status = STATUS_LABELS[m.ots_status] ?? STATUS_LABELS.PENDING_ANCHOR

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#f7931a" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Anchor className="w-4 h-4 text-[#f7931a]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#f7931a]">BITCOIN ANCHOR PROOF</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">
            OpenTimestamps · Free · Public · Permissionless
          </span>
        </div>
      </header>

      <div className="relative max-w-5xl mx-auto px-6 py-14">

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(247,147,26,0.08)', border: '1px solid rgba(247,147,26,0.3)' }}>
            <Bitcoin className="w-3 h-3 text-[#f7931a]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#f7931a]">
              Sealed before the events. Provable forever.
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.5rem, 6.5vw, 5rem)', lineHeight: 0.95 }}>
            <span className="text-white">The Book of Genesis is</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #f7931a 0%, #ffaa00 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(247,147,26,0.3))',
            }}>anchored on Bitcoin.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl mx-auto leading-relaxed">
            We hash the Book&apos;s Merkle root and submit it to OpenTimestamps&apos; public calendars,
            which bundle it into a Bitcoin transaction. Once mined, the timestamp is immutable —
            anyone, anywhere, anytime can prove the predictions were sealed <em>before</em> the events occurred.
          </p>
        </div>

        {/* STATUS PANEL */}
        <section className="rounded-2xl p-6 mb-10"
          style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid ${status.color}40`, backdropFilter: 'blur(10px)' }}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: status.color, animation: 'pulse 1.5s ease-in-out infinite', boxShadow: `0 0 12px ${status.color}` }} />
              <span className="text-[11px] uppercase tracking-[0.25em] font-black" style={{ color: status.color }}>{status.label}</span>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.35)] font-mono">
              {m.total_prophecies} prophecies · sealed {new Date(m.sealed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>

          <div className="text-[13px] text-[rgba(255,255,255,0.7)] leading-relaxed mb-6">
            {status.description}
          </div>

          {/* Merkle root */}
          <div className="rounded-xl p-4 mb-3" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(247,147,26,0.2)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Hash className="w-3 h-3 text-[#f7931a]" />
              <span className="text-[10px] uppercase tracking-wider font-bold text-[#f7931a]">Book Merkle Root (SHA-256, hex)</span>
            </div>
            <div className="font-mono text-[12px] text-white break-all leading-relaxed">{m.merkle_root}</div>
          </div>

          {/* Calendar receipt */}
          {m.ots_receipt && (
            <AnchorClient receipt={m.ots_receipt} hash={m.merkle_root} calendar={m.ots_calendar ?? ''} submittedAt={m.ots_submitted_at ?? ''} />
          )}
        </section>

        {/* VERIFY YOURSELF */}
        <section className="mb-10">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#f7931a] font-black mb-4">Verify it yourself — three ways</div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* OPTION 1: ots CLI */}
            <div className="rounded-xl p-5"
              style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(247,147,26,0.2)', backdropFilter: 'blur(10px)' }}>
              <div className="text-[10px] uppercase tracking-wider font-black text-[#f7931a] mb-2">1. Local CLI</div>
              <p className="text-[11px] text-[rgba(255,255,255,0.65)] leading-relaxed mb-3">
                Install the OpenTimestamps client, download the receipt, verify against the hash above.
              </p>
              <pre className="font-mono text-[10px] text-[rgba(255,255,255,0.85)] bg-black/40 rounded p-2 leading-relaxed overflow-x-auto">
{`pip install opentimestamps-client
ots verify book.ots`}
              </pre>
            </div>

            {/* OPTION 2: public calendar */}
            <div className="rounded-xl p-5"
              style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(247,147,26,0.2)', backdropFilter: 'blur(10px)' }}>
              <div className="text-[10px] uppercase tracking-wider font-black text-[#f7931a] mb-2">2. Public calendar</div>
              <p className="text-[11px] text-[rgba(255,255,255,0.65)] leading-relaxed mb-3">
                Query a public OpenTimestamps calendar with the hash — it returns the Bitcoin block, tx ID, and confirmation count.
              </p>
              <a href={`https://btc.calendar.opentimestamps.org/timestamp/${m.merkle_root}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#f7931a] hover:underline break-all">
                btc.calendar.opentimestamps.org/timestamp/{m.merkle_root.slice(0, 12)}…
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>

            {/* OPTION 3: independent re-hash */}
            <div className="rounded-xl p-5"
              style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(247,147,26,0.2)', backdropFilter: 'blur(10px)' }}>
              <div className="text-[10px] uppercase tracking-wider font-black text-[#f7931a] mb-2">3. Re-hash the Book</div>
              <p className="text-[11px] text-[rgba(255,255,255,0.65)] leading-relaxed mb-3">
                Fetch all 100 prophecies, compute the Merkle root with SHA-256, and verify it equals the anchored hash. Any mismatch means tampering.
              </p>
              <Link href="/book" className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#f7931a] hover:underline">
                Open the Book →
              </Link>
            </div>
          </div>
        </section>

        {/* TIMELINE */}
        <section className="rounded-2xl p-6 mb-10"
          style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(10px)' }}>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#f7931a] font-black mb-5">Anchor lifecycle</div>
          <div className="space-y-4">
            <TimelineStep
              icon={<Hash className="w-4 h-4 text-[#f7931a]" />}
              title="Hash the Book"
              detail={`SHA-256 Merkle tree over all ${m.total_prophecies} sealed entries → 32-byte root.`}
              status="done"
            />
            <TimelineStep
              icon={<Anchor className="w-4 h-4 text-[#4a9eff]" />}
              title="Submit to OpenTimestamps calendars"
              detail={`Multiple independent calendar servers receive the digest. Submitted ${new Date(m.ots_submitted_at ?? m.sealed_at).toLocaleString('en-GB')}.`}
              status="done"
            />
            <TimelineStep
              icon={<Bitcoin className="w-4 h-4 text-[#ffaa00]" />}
              title="Bundled into Bitcoin transaction"
              detail="Calendar aggregates submissions into a single Merkle tree and writes the root into a Bitcoin OP_RETURN. Confirmation typically within ~24h."
              status={m.ots_status === 'BITCOIN_CONFIRMED' ? 'done' : 'in_progress'}
            />
            <TimelineStep
              icon={<CheckCircle2 className="w-4 h-4 text-[#00ff88]" />}
              title="Verifiable forever"
              detail="Once mined, any node on Earth can prove the Book existed before that block. Genesis Swarm could vanish; the proof remains."
              status={m.ots_status === 'BITCOIN_CONFIRMED' ? 'done' : 'future'}
            />
          </div>
        </section>

        {/* WHY THIS MATTERS */}
        <section className="rounded-2xl p-6"
          style={{ background: 'rgba(247,147,26,0.04)', border: '1px solid rgba(247,147,26,0.25)', backdropFilter: 'blur(10px)' }}>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#f7931a] font-black mb-3">Why Bitcoin anchoring matters</div>
          <p className="text-[13px] text-[rgba(255,255,255,0.75)] leading-relaxed mb-3">
            Anyone can publish a list of risk predictions and claim they made them earlier. The
            only way to <strong className="text-white">prove sealing time</strong> is to commit
            the hash to a public timestamping authority no one — including us — can rewrite.
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.6)] leading-relaxed">
            Bitcoin&apos;s blockchain is the longest-running, most-replicated timestamp in human
            history. By anchoring there, Genesis Swarm makes its predictions falsifiable in a
            cryptographically rigorous way. If a prediction comes true after the seal date, the
            chain proves we called it before it happened.
          </p>
        </section>

      </div>
    </div>
  )
}

function TimelineStep({ icon, title, detail, status }: { icon: React.ReactNode; title: string; detail: string; status: 'done' | 'in_progress' | 'future' }) {
  const color = status === 'done' ? '#00ff88' : status === 'in_progress' ? '#ffaa00' : 'rgba(255,255,255,0.3)'
  const Icon = status === 'in_progress' ? Clock : CheckCircle2
  return (
    <div className="flex gap-4 items-start">
      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
        style={{ background: `${color}15`, border: `1px solid ${color}40` }}>
        {icon}
      </div>
      <div className="flex-1 pt-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[13px] font-bold text-white">{title}</span>
          <Icon className="w-3 h-3" style={{ color }} />
        </div>
        <div className="text-[11px] text-[rgba(255,255,255,0.55)] leading-relaxed">{detail}</div>
      </div>
    </div>
  )
}
