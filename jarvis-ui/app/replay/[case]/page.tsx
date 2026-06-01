'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Rewind, Play, Pause, SkipForward, SkipBack, Activity, AlertOctagon, Calendar } from 'lucide-react'
import { getCase, type ReplayCase, type ReplayMonth } from '@/lib/replay'
import CosmicBackground from '@/components/CosmicBackground'

const indexColor = (idx: number) => idx >= 70 ? '#ff3366' : idx >= 50 ? '#ff7700' : idx >= 30 ? '#ffaa00' : '#00ff88'

export default function ReplayCasePage() {
  const params = useParams() as { case: string }
  const replayCase = useMemo(() => getCase(params.case), [params.case])

  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!playing || !replayCase) return
    intervalRef.current = setInterval(() => {
      setIndex(i => {
        if (i >= replayCase.timeline.length - 1) {
          setPlaying(false)
          return i
        }
        return i + 1
      })
    }, 1800)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playing, replayCase])

  if (!replayCase) {
    return (
      <div className="min-h-screen text-white flex items-center justify-center px-6">
        <CosmicBackground variant="void" />
        <div className="text-center">
          <Rewind className="w-12 h-12 text-[#ff7700] mx-auto mb-4 opacity-50" />
          <div className="text-[16px] font-black mb-2">No such case</div>
          <Link href="/replay" className="text-[11px] uppercase tracking-wider text-[#ff7700] hover:underline">
            ← Back to all cases
          </Link>
        </div>
      </div>
    )
  }

  const current: ReplayMonth = replayCase.timeline[index]
  const finalMonth = replayCase.timeline[replayCase.timeline.length - 1]
  const c = indexColor(current.pre_crime_index)

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="intense" accent={replayCase.hero_color} />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Link href="/replay" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> All cases
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Rewind className="w-4 h-4" style={{ color: replayCase.hero_color }} />
          <span className="text-sm font-bold tracking-[0.18em]" style={{ color: replayCase.hero_color }}>REPLAY</span>
          <span className="ml-auto text-[9px] font-mono text-[rgba(255,255,255,0.4)]">{replayCase.entity}</span>
        </div>
      </header>

      <div className="relative max-w-6xl mx-auto px-6 py-10">

        {/* Hero panel */}
        <div className="rounded-2xl p-6 mb-6"
          style={{
            background: `linear-gradient(135deg, ${replayCase.hero_color}10 0%, rgba(0,0,0,0.4) 100%)`,
            border: `1px solid ${replayCase.hero_color}40`,
            boxShadow: `0 0 32px ${replayCase.hero_color}15`,
            backdropFilter: 'blur(10px)',
          }}>
          <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
            <div>
              <div className="text-[9px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] mb-1 font-bold">Forensic re-enactment</div>
              <h1 className="text-3xl md:text-4xl font-black mb-2">{replayCase.entity}</h1>
              <div className="text-[11px] text-[rgba(255,255,255,0.6)] leading-relaxed max-w-3xl">
                {replayCase.collapse_summary}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[8px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">Collapsed</div>
              <div className="text-2xl font-black tabular-nums" style={{ color: replayCase.hero_color }}>
                {replayCase.collapse_date}
              </div>
            </div>
          </div>
        </div>

        {/* TIMELINE SCRUBBER */}
        <div className="rounded-2xl p-6 mb-6"
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(10px)' }}>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" style={{ color: replayCase.hero_color }} />
              <span className="text-[10px] uppercase tracking-[0.2em] font-black" style={{ color: replayCase.hero_color }}>
                Timeline · {replayCase.timeline.length} months
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setIndex(Math.max(0, index - 1)); setPlaying(false) }}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[rgba(255,255,255,0.06)] transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                aria-label="Previous month">
                <SkipBack className="w-3.5 h-3.5 text-white" />
              </button>
              <button onClick={() => setPlaying(p => !p)}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
                style={{
                  background: playing ? 'rgba(255,51,102,0.15)' : `${replayCase.hero_color}15`,
                  border: `1px solid ${playing ? '#ff3366' : replayCase.hero_color}80`,
                  boxShadow: `0 0 16px ${playing ? '#ff3366' : replayCase.hero_color}30`,
                }}
                aria-label={playing ? 'Pause replay' : 'Play replay'}>
                {playing ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
              </button>
              <button onClick={() => { setIndex(Math.min(replayCase.timeline.length - 1, index + 1)); setPlaying(false) }}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[rgba(255,255,255,0.06)] transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                aria-label="Next month">
                <SkipForward className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </div>

          {/* Track */}
          <div className="relative h-12 mb-3">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="absolute top-1/2 -translate-y-1/2 h-0.5 rounded-full transition-all duration-500"
              style={{
                left: 0,
                width: `${(index / (replayCase.timeline.length - 1)) * 100}%`,
                background: `linear-gradient(90deg, ${replayCase.hero_color}aa, ${replayCase.hero_color})`,
                boxShadow: `0 0 8px ${replayCase.hero_color}`,
              }} />
            {replayCase.timeline.map((m, i) => {
              const left = (i / (replayCase.timeline.length - 1)) * 100
              const active = i <= index
              const dotColor = active ? indexColor(m.pre_crime_index) : 'rgba(255,255,255,0.2)'
              return (
                <button key={i} onClick={() => { setIndex(i); setPlaying(false) }}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all"
                  style={{
                    left: `${left}%`,
                    width: i === index ? 18 : 10,
                    height: i === index ? 18 : 10,
                  }}
                  aria-label={`Jump to ${m.label}`}>
                  <div className="rounded-full w-full h-full transition-all"
                    style={{
                      background: dotColor,
                      boxShadow: i === index ? `0 0 16px ${dotColor}` : `0 0 4px ${dotColor}80`,
                      border: i === index ? '2px solid white' : 'none',
                    }} />
                </button>
              )
            })}
          </div>

          {/* Month labels under the track */}
          <div className="flex justify-between text-[8px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] font-mono">
            <span>{replayCase.timeline[0].label}</span>
            <span style={{ color: replayCase.hero_color }} className="font-black">
              {current.label} · INDEX {current.pre_crime_index}
            </span>
            <span>{finalMonth.label}</span>
          </div>
        </div>

        {/* CURRENT MONTH */}
        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4 mb-6">
          {/* Big index */}
          <div className="rounded-2xl p-6 flex flex-col items-center justify-center min-w-[200px]"
            style={{
              background: `linear-gradient(135deg, ${c}10 0%, rgba(0,0,0,0.4) 100%)`,
              border: `1px solid ${c}40`,
              boxShadow: `0 0 32px ${c}15`,
              backdropFilter: 'blur(10px)',
            }}>
            <div className="text-[8px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] mb-2 font-bold">Pre-Crime Index</div>
            <div className="font-black tabular-nums leading-none transition-all duration-500"
              style={{
                fontSize: 'clamp(4rem, 8vw, 6rem)',
                color: c,
                textShadow: `0 0 32px ${c}90`,
              }}>
              {current.pre_crime_index}
            </div>
            <div className="text-[9px] font-mono text-[rgba(255,255,255,0.4)] mt-1">/100 · {current.label}</div>
          </div>

          {/* Headline + press */}
          <div className="rounded-2xl p-6 flex flex-col justify-center"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(10px)' }}>
            <div className="text-[8px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] mb-2 font-bold">What happened</div>
            <div className="text-[15px] leading-relaxed text-[rgba(255,255,255,0.9)] mb-3">
              {current.headline}
            </div>
            {current.press && (
              <div className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.45)] font-mono">
                ↳ Public reference: <span style={{ color: replayCase.hero_color }} className="font-bold">{current.press}</span>
              </div>
            )}
          </div>
        </div>

        {/* SIGNALS FIRED */}
        <div className="rounded-2xl p-6 mb-6"
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(10px)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4" style={{ color: replayCase.hero_color }} />
            <span className="text-[10px] uppercase tracking-[0.2em] font-black" style={{ color: replayCase.hero_color }}>
              Bots firing · {current.signals.length}
            </span>
          </div>
          <div className="space-y-2">
            {current.signals.map(s => (
              <div key={s.bot} className="rounded-lg p-3 transition-all"
                style={{
                  background: s.fired_first ? `${indexColor(s.severity)}06` : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${s.fired_first ? indexColor(s.severity) + '40' : 'rgba(255,255,255,0.06)'}`,
                }}>
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-[10px] uppercase tracking-[0.15em] font-black w-32 truncate" style={{ color: indexColor(s.severity) }}>
                    {s.bot}
                  </span>
                  {s.fired_first && (
                    <span className="text-[8px] uppercase font-black px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(255,255,255,0.06)', color: indexColor(s.severity), border: `1px solid ${indexColor(s.severity)}50` }}>
                      NEW
                    </span>
                  )}
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div className="h-full rounded-full transition-all duration-700" style={{
                      width: `${s.severity}%`,
                      background: `linear-gradient(90deg, ${indexColor(s.severity)}aa, ${indexColor(s.severity)})`,
                      boxShadow: `0 0 6px ${indexColor(s.severity)}`,
                    }} />
                  </div>
                  <span className="font-black tabular-nums w-8 text-right" style={{ color: indexColor(s.severity) }}>
                    {s.severity}
                  </span>
                </div>
                <div className="text-[11px] text-[rgba(255,255,255,0.65)] leading-relaxed pl-0">
                  {s.note}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* OUTCOME at the last frame */}
        {index === replayCase.timeline.length - 1 && (
          <div className="rounded-2xl p-6 text-center"
            style={{
              background: `linear-gradient(135deg, ${replayCase.hero_color}10 0%, rgba(0,0,0,0.4) 100%)`,
              border: `1px solid ${replayCase.hero_color}50`,
              boxShadow: `0 0 32px ${replayCase.hero_color}25`,
              backdropFilter: 'blur(10px)',
            }}>
            <AlertOctagon className="w-8 h-8 mx-auto mb-3" style={{ color: replayCase.hero_color }} />
            <div className="text-[10px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.5)] font-black mb-2">
              The collapse
            </div>
            <div className="text-2xl font-black mb-2" style={{ color: replayCase.hero_color }}>
              Pre-Crime Index → {current.pre_crime_index}
            </div>
            <div className="text-[13px] text-[rgba(255,255,255,0.7)] max-w-2xl mx-auto leading-relaxed">
              Had Genesis Swarm been running, the system would have flagged structural concerns{' '}
              <strong className="text-white">{monthsBetween(replayCase.timeline[0].month, replayCase.timeline.find(m => m.pre_crime_index >= 70)?.month ?? current.month)} months</strong>{' '}
              before the public collapse on <strong className="text-white">{replayCase.collapse_date}</strong>.
            </div>
            <Link href="/book"
              className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 rounded-md text-[11px] uppercase tracking-[0.15em] font-black"
              style={{
                background: `linear-gradient(135deg, ${replayCase.hero_color} 0%, #9b6dff 100%)`,
                color: '#000',
                boxShadow: `0 0 24px ${replayCase.hero_color}40`,
              }}>
              Read the Book of Genesis →
            </Link>
          </div>
        )}

      </div>
    </div>
  )
}

function monthsBetween(start: string, end: string): number {
  const [sy, sm] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  return (ey - sy) * 12 + (em - sm)
}
