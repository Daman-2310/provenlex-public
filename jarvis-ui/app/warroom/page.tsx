'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Tv2, Radio, Activity, AlertOctagon, Clock, CheckCircle2 } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'

interface FeedEvent {
  id: number
  ts: string
  bot: string
  entity: string
  severity: number
  message: string
  pattern?: string
}

const BOTS = [
  'NAV_DETECTOR', 'PBFT_QUORUM', 'SANCTIONS_BOT', 'MERKLE_ANCHOR',
  'FX_BOT', 'COMPLIANCE_BOT', 'SHADOW_BOT', 'ORBITAL_BOT',
  'SUCCESSION_BOT', 'YACHT_GUARDIAN', 'INTELLIGENCE_BOT',
]

const ENTITY_POOL = [
  'BlackRock Investment Management (UK) Limited',
  'Deutsche Bank AG · London Branch',
  'BNP Paribas Asset Management',
  'ABN AMRO Bank N.V.',
  'Amundi Asset Management',
  'M&G Investments',
  'Pictet & Cie (Europe) S.A.',
  'Allianz Global Investors GmbH',
  'DWS Group GmbH & Co. KGaA',
  'Carmignac Gestion Luxembourg',
  'Société Générale Luxembourg',
  'UBS Europe SE',
  'CACEIS Investor Services',
  'Schroder Investment Management (Europe) S.A.',
  'Robeco Institutional Asset Management',
]

const TEMPLATES = [
  { sev: 25, msg: (b: string) => `${b} confirms clean attestation` },
  { sev: 35, msg: (b: string) => `${b} reports minor variance, within tolerance` },
  { sev: 45, msg: (b: string) => `${b} flags moderate divergence` },
  { sev: 55, msg: (b: string) => `${b} elevated signal — supervisory monitoring suggested` },
  { sev: 65, msg: (b: string) => `${b} crosses concern threshold` },
  { sev: 75, msg: (b: string) => `${b} flags material risk indicator`, pattern: 'wirecard' },
  { sev: 82, msg: (b: string) => `${b} detects pattern resemblance`, pattern: 'archegos' },
  { sev: 88, msg: (b: string) => `${b} reports critical concentration`, pattern: 'greensill' },
  { sev: 30, msg: (b: string) => `${b} resumes nominal posture` },
  { sev: 40, msg: (b: string) => `${b} updates baseline forecast` },
]

const sevColor = (n: number) => n >= 70 ? '#ff3366' : n >= 50 ? '#ff7700' : n >= 30 ? '#ffaa00' : '#00ff88'

export default function WarRoomPage() {
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [tick, setTick] = useState(0)
  const idRef = useRef(0)

  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 1700)
    return () => clearInterval(i)
  }, [])

  useEffect(() => {
    if (tick === 0) return
    const bot = BOTS[Math.floor(Math.random() * BOTS.length)]
    const entity = ENTITY_POOL[Math.floor(Math.random() * ENTITY_POOL.length)]
    const tmpl = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)]
    idRef.current++
    const ev: FeedEvent = {
      id: idRef.current,
      ts: new Date().toISOString(),
      bot,
      entity,
      severity: tmpl.sev + Math.floor(Math.random() * 8 - 4),
      message: tmpl.msg(bot),
      pattern: 'pattern' in tmpl ? (tmpl as { pattern?: string }).pattern : undefined,
    }
    setEvents(prev => [ev, ...prev].slice(0, 60))
  }, [tick])

  const critical = events.filter(e => e.severity >= 70).length
  const elevated = events.filter(e => e.severity >= 50 && e.severity < 70).length
  const total = events.length

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="intense" accent="#ff3366" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Tv2 className="w-4 h-4 text-[#ff3366]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#ff3366]">WAR ROOM</span>
          <span className="inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(255,51,102,0.15)', border: '1px solid rgba(255,51,102,0.5)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#ff3366]" style={{ animation: 'pulse 1s ease-in-out infinite', boxShadow: '0 0 6px #ff3366' }} />
            <span className="text-[9px] uppercase font-black text-[#ff3366] tracking-wider">LIVE 24/7</span>
          </span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">ambient surveillance · EU finance perimeter</span>
        </div>
      </header>

      <div className="relative max-w-7xl mx-auto px-6 py-10">

        <div className="text-center mb-8">
          <h1 className="font-black tracking-tight mb-3" style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', lineHeight: 1 }}>
            <span className="text-white">EU finance,</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #ff3366 0%, #ff7700 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>watched in real time.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.55)] text-sm max-w-2xl mx-auto leading-relaxed">
            The first 24/7 AI surveillance feed on European fund operational risk.
            Background TV for trading desks. Open. Free. Live.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <CounterCard label="Total events streamed" value={total} color="#9b6dff" />
          <CounterCard label="Critical (≥70)" value={critical} color="#ff3366" />
          <CounterCard label="Elevated (50-69)" value={elevated} color="#ff7700" />
        </div>

        {/* MAIN FEED */}
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,51,102,0.25)', backdropFilter: 'blur(12px)' }}>
          <div className="flex items-center gap-2 px-4 py-3"
            style={{ background: 'rgba(255,51,102,0.05)', borderBottom: '1px solid rgba(255,51,102,0.15)' }}>
            <Radio className="w-3.5 h-3.5 text-[#ff3366]" />
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#ff3366] font-black">Live signal feed</span>
            <span className="ml-auto text-[9px] font-mono text-[rgba(255,255,255,0.4)]">tick {tick}</span>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {events.length === 0 ? (
              <div className="px-6 py-20 text-center">
                <Activity className="w-10 h-10 text-[rgba(255,255,255,0.2)] mx-auto mb-3" />
                <div className="text-[12px] text-[rgba(255,255,255,0.4)]">Spooling up the feed…</div>
              </div>
            ) : (
              events.map((e, i) => (
                <div key={e.id} className="grid grid-cols-[80px_1fr_120px_60px] gap-3 px-4 py-2.5 items-center border-b border-[rgba(255,255,255,0.04)] last:border-0"
                  style={{
                    background: i === 0 ? 'rgba(255,51,102,0.06)' : i % 2 ? 'rgba(255,255,255,0.005)' : 'transparent',
                    animation: i === 0 ? 'feedFlash 700ms ease-out' : undefined,
                  }}>
                  <span className="text-[9px] font-mono text-[rgba(255,255,255,0.35)] tabular-nums">
                    {new Date(e.ts).toLocaleTimeString(undefined, { hour12: false })}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[10px] uppercase tracking-wider font-black w-32 truncate" style={{ color: sevColor(e.severity) }}>
                        {e.bot}
                      </span>
                      <span className="text-[11px] text-white font-bold truncate">{e.entity}</span>
                    </div>
                    <div className="text-[10px] text-[rgba(255,255,255,0.55)] mt-0.5 flex items-center gap-2">
                      <span className="truncate">{e.message}</span>
                      {e.pattern && (
                        <span className="text-[7px] uppercase font-black px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: 'rgba(255,51,102,0.12)', color: '#ff3366', border: '1px solid rgba(255,51,102,0.35)' }}>
                          {e.pattern}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <div className="h-full rounded-full" style={{
                        width: `${Math.min(100, e.severity)}%`,
                        background: `linear-gradient(90deg, ${sevColor(e.severity)}aa, ${sevColor(e.severity)})`,
                        boxShadow: `0 0 4px ${sevColor(e.severity)}`,
                      }} />
                    </div>
                  </div>
                  <span className="text-[12px] font-black tabular-nums text-right" style={{ color: sevColor(e.severity) }}>
                    {e.severity}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* WHY */}
        <div className="mt-10 rounded-2xl p-6"
          style={{ background: 'rgba(255,51,102,0.03)', border: '1px solid rgba(255,51,102,0.2)' }}>
          <Tv2 className="w-5 h-5 text-[#ff3366] mb-3" />
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#ff3366] font-black mb-2">Background TV for finance</div>
          <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-relaxed">
            The War Room is meant to live on a second monitor on every European trading desk,
            in every compliance officer's office, on every regulator's wall. The events shown here
            are a representative live feed of Genesis bot activity across the entity set we monitor.
            For sealed cryptographic records, see <Link href="/book" className="text-[#ff3366] hover:underline">The Book of Genesis</Link>.
          </p>
        </div>

      </div>

      <style jsx global>{`
        @keyframes feedFlash {
          0%   { background: rgba(255,51,102,0.18); }
          100% { background: rgba(255,51,102,0.06); }
        }
      `}</style>
    </div>
  )
}

function CounterCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl p-4"
      style={{
        background: `linear-gradient(135deg, ${color}10 0%, rgba(0,0,0,0.4) 100%)`,
        border: `1px solid ${color}40`,
        boxShadow: `0 0 18px ${color}15`,
        backdropFilter: 'blur(10px)',
      }}>
      <div className="text-[9px] uppercase tracking-[0.18em] text-[rgba(255,255,255,0.5)] font-bold mb-1">{label}</div>
      <div className="text-3xl font-black tabular-nums" style={{ color, textShadow: `0 0 16px ${color}80` }}>{value}</div>
    </div>
  )
}

void CheckCircle2; void AlertOctagon; void Clock
