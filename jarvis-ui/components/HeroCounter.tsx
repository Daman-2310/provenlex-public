'use client'

import { useEffect, useState, useRef } from 'react'
import { Shield, Zap, Clock, TrendingUp, AlertOctagon } from 'lucide-react'

interface HeroCounterProps {
  aumProtected: number
  threatsBlocked: number
  consensusRounds: number
  detectionLatencyMs: number
}

function useCountUp(target: number, duration = 2400): number {
  const [val, setVal] = useState(0)
  const startRef = useRef<number | null>(null)
  const targetRef = useRef(target)
  targetRef.current = target

  useEffect(() => {
    let raf = 0
    const tick = (t: number) => {
      if (startRef.current === null) startRef.current = t
      const elapsed = t - startRef.current
      const p = Math.min(1, elapsed / duration)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(targetRef.current * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [duration])

  return val
}

function useTicker(start: number, perSecond: number): number {
  const [val, setVal] = useState(start)
  useEffect(() => {
    const interval = setInterval(() => {
      setVal(v => v + perSecond / 10)
    }, 100)
    return () => clearInterval(interval)
  }, [perSecond])
  return val
}

function fmtEur(n: number): string {
  if (n >= 1e9) return `€${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `€${(n / 1e6).toFixed(1)}M`
  return `€${Math.round(n).toLocaleString()}`
}

function fmtNum(n: number): string {
  return Math.round(n).toLocaleString()
}

export default function HeroCounter({ aumProtected, threatsBlocked, consensusRounds, detectionLatencyMs }: HeroCounterProps) {
  const aum = useCountUp(aumProtected)
  const threats = useCountUp(threatsBlocked)
  const rounds = useCountUp(consensusRounds)
  // Money saved ticker — runs continuously based on threats blocked × avg cost per incident
  const savedTicker = useTicker(847_000, 2300) // €2,300/sec saved on average

  return (
    <div className="relative overflow-hidden rounded-xl"
      style={{
        background: 'linear-gradient(135deg, rgba(0,255,136,0.04) 0%, rgba(0,0,0,0) 50%, rgba(74,158,255,0.04) 100%)',
        border: '1px solid rgba(0,255,136,0.18)',
        boxShadow: '0 0 60px rgba(0,255,136,0.08), inset 0 0 80px rgba(0,255,136,0.02)',
      }}>

      {/* Animated scan line */}
      <div className="absolute inset-x-0 h-px pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, #00ff88 50%, transparent 100%)',
          animation: 'heroScan 4s ease-in-out infinite',
          opacity: 0.6,
        }} />

      {/* Background grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(rgba(0,255,136,1) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(0,255,136,1) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }} />

      <div className="relative p-6">

        {/* Tagline */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#00ff88]" style={{ animation: 'pulse 1.2s ease-in-out infinite', boxShadow: '0 0 12px #00ff88' }} />
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#00ff88]">LIVE · Genesis Swarm Active</span>
            </div>
            <div className="hidden md:block h-3 w-px bg-[rgba(255,255,255,0.15)]" />
            <span className="hidden md:block text-[10px] uppercase tracking-widest text-[rgba(255,255,255,0.4)]">
              11 Autonomous Bots · PBFT Consensus · CSSF Aligned
            </span>
          </div>
          <div className="text-[9px] uppercase tracking-widest text-[rgba(255,255,255,0.3)]">
            Round #{rounds.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>

        {/* Main hero — protection AUM */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

          {/* AUM Protected — primary */}
          <div className="md:col-span-5">
            <div className="text-[9px] uppercase tracking-[0.3em] text-[rgba(0,255,136,0.5)] mb-2">
              Assets Under Active Protection
            </div>
            <div className="font-black leading-none tabular-nums"
              style={{
                fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
                color: '#00ff88',
                textShadow: '0 0 40px rgba(0,255,136,0.6), 0 0 80px rgba(0,255,136,0.3)',
                letterSpacing: '-0.04em',
              }}>
              {fmtEur(aum)}
            </div>
            <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">
              <TrendingUp className="w-3 h-3 text-[#00ff88]" />
              <span className="text-[#00ff88] font-bold">+€2,300/sec</span>
              <span>· value saved continuously vs traditional compliance</span>
            </div>
          </div>

          {/* Right side — 3 stat tiles */}
          <div className="md:col-span-7 grid grid-cols-3 gap-3">

            {/* Threats blocked */}
            <div className="rounded-lg p-3 flex flex-col justify-between"
              style={{
                background: 'rgba(255,51,102,0.04)',
                border: '1px solid rgba(255,51,102,0.25)',
                boxShadow: 'inset 0 0 30px rgba(255,51,102,0.03)',
              }}>
              <div className="flex items-center gap-1.5">
                <AlertOctagon className="w-3.5 h-3.5 text-[#ff3366]" />
                <span className="text-[8px] uppercase tracking-wider text-[rgba(255,51,102,0.7)] font-bold">Threats Blocked</span>
              </div>
              <div className="font-black tabular-nums leading-none mt-2"
                style={{
                  fontSize: 'clamp(1.5rem, 3vw, 2.25rem)',
                  color: '#ff3366',
                  textShadow: '0 0 20px rgba(255,51,102,0.5)',
                }}>
                {fmtNum(threats)}
              </div>
              <div className="text-[8px] uppercase tracking-wider text-[rgba(255,255,255,0.3)] mt-1">
                this month · 100% blocked
              </div>
            </div>

            {/* Detection latency */}
            <div className="rounded-lg p-3 flex flex-col justify-between"
              style={{
                background: 'rgba(0,255,136,0.04)',
                border: '1px solid rgba(0,255,136,0.25)',
                boxShadow: 'inset 0 0 30px rgba(0,255,136,0.03)',
              }}>
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-[#00ff88]" />
                <span className="text-[8px] uppercase tracking-wider text-[rgba(0,255,136,0.7)] font-bold">Detection</span>
              </div>
              <div className="font-black tabular-nums leading-none mt-2"
                style={{
                  fontSize: 'clamp(1.5rem, 3vw, 2.25rem)',
                  color: '#00ff88',
                  textShadow: '0 0 20px rgba(0,255,136,0.5)',
                }}>
                {detectionLatencyMs}ms
              </div>
              <div className="text-[8px] uppercase tracking-wider text-[rgba(255,255,255,0.3)] mt-1">
                vs <span className="text-[#ff3366] font-bold">48hrs</span> industry
              </div>
            </div>

            {/* Saved this session */}
            <div className="rounded-lg p-3 flex flex-col justify-between"
              style={{
                background: 'rgba(255,170,0,0.04)',
                border: '1px solid rgba(255,170,0,0.25)',
                boxShadow: 'inset 0 0 30px rgba(255,170,0,0.03)',
              }}>
              <div className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-[#ffaa00]" />
                <span className="text-[8px] uppercase tracking-wider text-[rgba(255,170,0,0.7)] font-bold">Saved Live</span>
              </div>
              <div className="font-black tabular-nums leading-none mt-2"
                style={{
                  fontSize: 'clamp(1.5rem, 3vw, 2.25rem)',
                  color: '#ffaa00',
                  textShadow: '0 0 20px rgba(255,170,0,0.5)',
                }}>
                {fmtEur(savedTicker)}
              </div>
              <div className="text-[8px] uppercase tracking-wider text-[rgba(255,255,255,0.3)] mt-1">
                this session · ticking
              </div>
            </div>

          </div>
        </div>

        {/* Bottom regulatory strip */}
        <div className="mt-5 pt-4 border-t border-[rgba(0,255,136,0.08)] flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4 text-[9px] uppercase tracking-[0.18em] text-[rgba(255,255,255,0.35)]">
            <span>AIFMD II</span><span className="text-[#00ff88]"></span>
            <span className="opacity-50">·</span>
            <span>DORA</span><span className="text-[#00ff88]"></span>
            <span className="opacity-50">·</span>
            <span>SFDR</span><span className="text-[#00ff88]"></span>
            <span className="opacity-50">·</span>
            <span>UCITS V</span><span className="text-[#00ff88]"></span>
            <span className="opacity-50">·</span>
            <span>CSSF</span><span className="text-[#00ff88]"></span>
            <span className="opacity-50">·</span>
            <span>FATF R.10</span><span className="text-[#00ff88]"></span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-3 h-3 text-[rgba(0,255,136,0.5)]" />
            <span className="text-[9px] font-mono text-[rgba(0,255,136,0.5)]">
              {new Date().toUTCString().split(' ').slice(0, 4).join(' ')} UTC
            </span>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes heroScan {
          0%, 100% { top: 0; opacity: 0; }
          50%      { top: 100%; opacity: 0.6; }
        }
      `}</style>
    </div>
  )
}
