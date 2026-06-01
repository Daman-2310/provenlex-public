import Link from 'next/link'
import { ArrowLeft, TrendingUp, Coins, Building, Mail } from 'lucide-react'
import { BOOK_SNAPSHOT_ENTRIES } from '@/lib/book-snapshot'
import CosmicBackground from '@/components/CosmicBackground'

export const metadata = {
  title: 'GENESIS-50 · The Genesis Index ETF · Genesis Swarm',
  description: 'A Luxembourg-domiciled ETF tracking the top 50 EU funds by Genesis operational-risk score. Index licensing for ETF issuers.',
}

const indexColor = (n: number) => n >= 80 ? '#00ff88' : n >= 65 ? '#ffaa00' : '#ff3366'

export default function ETFPage() {
  // Top 50 by genesis_score (highest = best)
  const top50 = [...BOOK_SNAPSHOT_ENTRIES]
    .sort((a, b) => b.genesis_score - a.genesis_score)
    .slice(0, 50)

  const avg = Math.round(top50.reduce((s, e) => s + e.genesis_score, 0) / top50.length)

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#00ff88" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Coins className="w-4 h-4 text-[#00ff88]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#00ff88]">GENESIS-50</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">index licensing · issuer outreach</span>
        </div>
      </header>

      <div className="relative max-w-6xl mx-auto px-6 py-14">

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)' }}>
            <Coins className="w-3 h-3 text-[#00ff88]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#00ff88]">
              The Genesis Index · ETF-licensable
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.5rem, 6.5vw, 5.5rem)', lineHeight: 0.95 }}>
            <span className="text-white">GENESIS-50.</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #00ff88 0%, #4a9eff 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(0,255,136,0.3))',
            }}>The EU's first AI-screened fund index.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl mx-auto leading-relaxed">
            A rules-based index tracking the top 50 EU institutional managers by Genesis operational-risk score,
            rebalanced quarterly, fully transparent methodology. <strong className="text-white">Available for ETF licensing.</strong>
          </p>
        </div>

        {/* HEADLINE STATS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          <Tile label="Constituents" value="50" color="#00ff88" />
          <Tile label="Avg Genesis Score" value={`${avg}`} suffix="/100" color="#00ff88" />
          <Tile label="Rebalance" value="Quarterly" color="#4a9eff" />
          <Tile label="Methodology" value="Open" color="#9b6dff" />
        </div>

        {/* METHODOLOGY */}
        <div className="rounded-2xl p-6 mb-10"
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,255,136,0.2)', backdropFilter: 'blur(10px)' }}>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#00ff88] font-black mb-4">Methodology</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[12px] text-[rgba(255,255,255,0.75)] leading-relaxed">
            <div>
              <div className="text-white font-bold text-[13px] mb-1">Eligibility</div>
              EU-domiciled or EU-passported asset managers, banks (asset mgmt arms),
              insurance asset managers. LEI required. Minimum 12 months of public reporting history.
            </div>
            <div>
              <div className="text-white font-bold text-[13px] mb-1">Ranking</div>
              Genesis Score (compliance-posture indicator) at the quarterly cutoff.
              Higher = better. Top 50 enter the index.
            </div>
            <div>
              <div className="text-white font-bold text-[13px] mb-1">Weighting</div>
              Equal-weighted at rebalance for transparency. (Cap-weighted variant available
              for issuers on request.)
            </div>
          </div>
        </div>

        {/* TOP 10 */}
        <div className="rounded-2xl overflow-hidden mb-10"
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(10px)' }}>
          <div className="px-4 py-3 flex items-center gap-2"
            style={{ background: 'rgba(0,255,136,0.04)', borderBottom: '1px solid rgba(0,255,136,0.15)' }}>
            <TrendingUp className="w-3.5 h-3.5 text-[#00ff88]" />
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#00ff88] font-black">Index constituents · top 10 by Genesis Score</span>
          </div>
          <div className="divide-y divide-[rgba(255,255,255,0.04)]">
            {top50.slice(0, 10).map((e, i) => (
              <div key={e.prophecy_id} className="grid grid-cols-[40px_1fr_80px_100px] gap-3 px-4 py-3 items-center">
                <div className="font-black text-xl tabular-nums text-[rgba(255,255,255,0.5)]">{(i + 1).toString().padStart(2, '0')}</div>
                <div>
                  <div className="text-[13px] font-bold text-white truncate">{e.candidate.name}</div>
                  <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] font-mono mt-0.5">
                    {e.candidate.jurisdiction} · {e.candidate.category.replace(/_/g, ' ')}
                  </div>
                </div>
                <div className="text-[10px] font-mono text-[rgba(255,255,255,0.5)] truncate">
                  {e.candidate.lei ? e.candidate.lei.slice(0, 12) + '…' : '—'}
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <div className="text-2xl font-black tabular-nums" style={{ color: indexColor(e.genesis_score) }}>{e.genesis_score}</div>
                  <div className="text-[9px] uppercase font-mono text-[rgba(255,255,255,0.4)]">/100</div>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-2 text-[10px] text-[rgba(255,255,255,0.4)] uppercase tracking-wider"
            style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            … 40 more constituents · full list available on issuer request
          </div>
        </div>

        {/* CTA — ETF ISSUER OUTREACH */}
        <div className="rounded-2xl p-8 text-center mb-10"
          style={{
            background: 'linear-gradient(135deg, rgba(0,255,136,0.08) 0%, rgba(74,158,255,0.05) 100%)',
            border: '1px solid rgba(0,255,136,0.4)',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 0 32px rgba(0,255,136,0.15)',
          }}>
          <Building className="w-8 h-8 text-[#00ff88] mx-auto mb-3" />
          <h2 className="text-2xl md:text-3xl font-black text-white mb-3">For ETF issuers</h2>
          <p className="text-[rgba(255,255,255,0.6)] text-[13px] mb-5 max-w-2xl mx-auto leading-relaxed">
            We're licensing GENESIS-50 to one or two Luxembourg-domiciled UCITS ETF issuers
            in 2026. Tickets ~€100K-1M/year base + AUM-linked. Open methodology — no black-box risk.
            First-mover gets exclusivity in their distribution geography.
          </p>
          <a href="mailto:daman.sharma.2310@gmail.com?subject=GENESIS-50%20index%20licensing%20inquiry"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-md text-[12px] uppercase tracking-[0.15em] font-black"
            style={{ background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)', color: '#000', boxShadow: '0 0 24px rgba(0,255,136,0.4)' }}>
            <Mail className="w-4 h-4" /> Inquire about licensing
          </a>
        </div>

        {/* DISCLAIMER */}
        <div className="rounded-xl p-5 text-[11px] text-[rgba(255,255,255,0.55)] leading-relaxed"
          style={{ background: 'rgba(255,170,0,0.03)', border: '1px solid rgba(255,170,0,0.18)' }}>
            <strong className="text-[#ffaa00] uppercase tracking-wider text-[9px]">Disclaimer:</strong>{' '}
            GENESIS-50 is an analytical research index. It is not a regulated financial benchmark under
            the EU Benchmarks Regulation at this stage. Constituent selection is based on AI-generated
            Genesis Scores; methodology is subject to refinement. Not investment advice.{' '}
            <Link href="/legal" className="text-[#4a9eff] hover:underline">Terms</Link>.
        </div>

      </div>
    </div>
  )
}

function Tile({ label, value, color, suffix }: { label: string; value: string; color: string; suffix?: string }) {
  return (
    <div className="rounded-2xl p-5"
      style={{
        background: `linear-gradient(135deg, ${color}10 0%, rgba(0,0,0,0.4) 100%)`,
        border: `1px solid ${color}40`,
        boxShadow: `0 0 18px ${color}15`,
        backdropFilter: 'blur(10px)',
      }}>
      <div className="text-[9px] uppercase tracking-[0.18em] text-[rgba(255,255,255,0.5)] font-bold mb-2">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="font-black tabular-nums leading-none" style={{ fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', color, textShadow: `0 0 16px ${color}80` }}>{value}</span>
        {suffix && <span className="text-[10px] text-[rgba(255,255,255,0.4)] uppercase">{suffix}</span>}
      </div>
    </div>
  )
}
