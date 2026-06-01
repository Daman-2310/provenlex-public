import Link from 'next/link'
import { ArrowLeft, Rewind, ArrowRight, AlertOctagon } from 'lucide-react'
import { REPLAY_CASES } from '@/lib/replay'
import CosmicBackground from '@/components/CosmicBackground'

export const metadata = {
  title: 'The Replay Engine · Genesis Swarm',
  description: 'Interactive time-travel through historical fund collapses — watch Genesis bots fire month-by-month as signals emerge.',
}

export default function ReplayIndexPage() {
  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#ff7700" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Rewind className="w-4 h-4 text-[#ff7700]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#ff7700]">REPLAY ENGINE</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">historical time-travel · forensic re-enactment</span>
        </div>
      </header>

      <div className="relative max-w-6xl mx-auto px-6 py-14">

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(255,119,0,0.08)', border: '1px solid rgba(255,119,0,0.3)' }}>
            <Rewind className="w-3 h-3 text-[#ff7700]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#ff7700]">
              Choose a collapse · scrub the timeline
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.75rem, 7vw, 5.5rem)', lineHeight: 0.95 }}>
            <span className="text-white">If Genesis Swarm existed</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #ff7700 0%, #ff3366 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(255,119,0,0.3))',
            }}>
              in 2019.
            </span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl mx-auto leading-relaxed">
            Pick a historical fund collapse. Scrub through the months. Watch the 11 Genesis bots
            fire as the structural signals would have emerged in real time.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {REPLAY_CASES.map(c => (
            <Link key={c.slug} href={`/replay/${c.slug}`}
              className="group rounded-2xl p-6 transition-all hover:scale-[1.02]"
              style={{
                background: `linear-gradient(135deg, ${c.hero_color}10 0%, rgba(0,0,0,0.4) 100%)`,
                border: `1px solid ${c.hero_color}40`,
                boxShadow: `0 0 24px ${c.hero_color}15`,
                backdropFilter: 'blur(10px)',
              }}>
              <div className="flex items-start justify-between mb-4">
                <AlertOctagon className="w-6 h-6" style={{ color: c.hero_color }} />
                <span className="text-[8px] uppercase tracking-[0.2em] font-black px-2 py-1 rounded-full"
                  style={{ background: `${c.hero_color}15`, color: c.hero_color, border: `1px solid ${c.hero_color}50` }}>
                  {c.pattern}
                </span>
              </div>
              <div className="text-[16px] font-black text-white mb-1">{c.entity}</div>
              <div className="text-[10px] font-mono text-[rgba(255,255,255,0.5)] mb-3">
                Collapsed {c.collapse_date}
              </div>
              <div className="text-[11px] text-[rgba(255,255,255,0.65)] leading-relaxed mb-4">
                {c.collapse_summary}
              </div>
              <div className="grid grid-cols-2 gap-2 text-[9px] uppercase tracking-wider mb-3">
                <div>
                  <div className="text-[rgba(255,255,255,0.4)]">Peak</div>
                  <div className="text-white font-bold text-[10px] normal-case">{c.aum_at_peak}</div>
                </div>
                <div>
                  <div className="text-[rgba(255,255,255,0.4)]">Loss</div>
                  <div className="text-white font-bold text-[10px] normal-case">{c.final_loss}</div>
                </div>
              </div>
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider mt-3 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: c.hero_color }}>
                Replay timeline <ArrowRight className="w-3 h-3" />
              </div>
            </Link>
          ))}
        </div>

      </div>
    </div>
  )
}
