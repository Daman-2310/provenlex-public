'use client'

import { memo } from 'react'
import { Activity, AlertTriangle, Shield, Zap } from 'lucide-react'

interface BotCardPremiumProps {
  bot: {
    bot_id: string
    bot_type: string
    last_score: number
    is_anomaly: boolean
    healthy: boolean
    last_summary: string
    threshold: number
  }
}

// AUM exposure per bot type (€ millions)
const AUM: Record<string, number> = {
  NAV_DETECTOR:   2100,  FX_BOT:         3400,
  SOVEREIGN_BOT:  4500,  SANCTIONS_BOT:  1200,
  CARGO_BOT:       890,  COMPLIANCE_BOT:  780,
  SUCCESSION_BOT:  650,  SHADOW_BOT:      560,
  FUEL_BOT:        450,  ORBITAL_BOT:     230,
  YACHT_GUARDIAN:  120,
}

const ICONS: Record<string, string> = {
  NAV_DETECTOR:   '⊕',  CARGO_BOT:      '▤',
  FUEL_BOT:       '◉',  SANCTIONS_BOT:  '⊘',
  FX_BOT:         '€',  COMPLIANCE_BOT: '⊨',
  SUCCESSION_BOT: '⏃',  SOVEREIGN_BOT:  '◆',
  YACHT_GUARDIAN: '⊛',  ORBITAL_BOT:    '◐',
  SHADOW_BOT:     '◗',
}

const PERSONALITIES: Record<string, string> = {
  NAV_DETECTOR: 'Alpha Sentinel',  CARGO_BOT: 'Logistics Oracle',
  FUEL_BOT: 'Energy Hawk',         SANCTIONS_BOT: 'OFAC Watchdog',
  FX_BOT: 'Currency Predator',     COMPLIANCE_BOT: 'Lex Guardian',
  SUCCESSION_BOT: 'Dynasty Keeper', SOVEREIGN_BOT: 'State Monitor',
  YACHT_GUARDIAN: 'Asset Tracer',  ORBITAL_BOT: 'Satellite Watcher',
  SHADOW_BOT: 'Ghost Operative',
}

function BotCardPremium({ bot }: BotCardPremiumProps) {
  const { bot_type, last_score, is_anomaly, threshold, last_summary } = bot

  // Color based on threat level
  const ratio = Math.min(1, last_score / 100)
  const color = is_anomaly ? '#ff3366' : last_score > 50 ? '#ffaa00' : '#00ff88'
  const aum = AUM[bot_type] ?? 200
  const atRisk = Math.round(aum * (last_score / 100) * 10)
  const icon = ICONS[bot_type] ?? '◆'
  const personality = PERSONALITIES[bot_type] ?? bot_type

  return (
    <div className="relative rounded-xl overflow-hidden transition-all hover:scale-[1.02] cursor-pointer h-full"
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(0,0,0,0) 100%)',
        border: `1px solid ${color}30`,
        boxShadow: is_anomaly
          ? `0 0 24px ${color}40, inset 0 0 30px ${color}08`
          : `0 0 12px ${color}15, inset 0 0 20px ${color}05`,
      }}>

      {/* Anomaly pulse overlay */}
      {is_anomaly && (
        <div className="absolute inset-0 pointer-events-none rounded-xl"
          style={{
            background: `radial-gradient(circle at center, ${color}12 0%, transparent 70%)`,
            animation: 'pulse 1.4s ease-in-out infinite',
          }} />
      )}

      {/* Top accent bar */}
      <div className="absolute top-0 left-0 right-0 h-[2px]"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${color} 50%, transparent 100%)`,
          boxShadow: `0 0 8px ${color}`,
        }} />

      <div className="relative p-4 flex flex-col h-full gap-3">

        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0"
              style={{
                background: `${color}15`,
                border: `1px solid ${color}40`,
                color,
                textShadow: `0 0 8px ${color}`,
              }}>
              {icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-black uppercase tracking-[0.12em] truncate"
                style={{ color: 'rgba(255,255,255,0.95)' }}>
                {bot_type.replace('_BOT', '').replace('_', ' ')}
              </div>
              <div className="text-[8px] uppercase tracking-wider truncate"
                style={{ color: 'rgba(74,158,255,0.7)' }}>
                {personality}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[7px] font-black uppercase tracking-wider"
              style={{
                background: is_anomaly ? 'rgba(255,51,102,0.15)' : 'rgba(0,255,136,0.12)',
                border: `1px solid ${is_anomaly ? 'rgba(255,51,102,0.35)' : 'rgba(0,255,136,0.35)'}`,
                color: is_anomaly ? '#ff3366' : '#00ff88',
              }}>
              <span className="w-1 h-1 rounded-full"
                style={{
                  background: is_anomaly ? '#ff3366' : '#00ff88',
                  animation: 'pulse 1.5s ease-in-out infinite',
                  boxShadow: `0 0 4px ${is_anomaly ? '#ff3366' : '#00ff88'}`,
                }} />
              {is_anomaly ? 'ALERT' : 'CLEAR'}
            </div>
          </div>
        </div>

        {/* Score — massive */}
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[8px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.3)] mb-0.5">
              Anomaly Score
            </div>
            <div className="font-black tabular-nums leading-none"
              style={{
                fontSize: 'clamp(1.75rem, 3vw, 2.5rem)',
                color,
                textShadow: `0 0 20px ${color}88`,
              }}>
              {last_score.toFixed(1)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[8px] uppercase tracking-wider text-[rgba(255,255,255,0.3)]">Threshold</div>
            <div className="font-bold tabular-nums text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {threshold}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="relative h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
            style={{
              width: `${Math.min(100, ratio * 100)}%`,
              background: `linear-gradient(90deg, ${color}aa 0%, ${color} 100%)`,
              boxShadow: `0 0 8px ${color}`,
            }} />
          {/* Threshold marker */}
          <div className="absolute top-0 bottom-0 w-px bg-[rgba(255,255,255,0.4)]"
            style={{ left: `${threshold}%` }} />
        </div>

        {/* Summary */}
        <div className="text-[9px] leading-relaxed line-clamp-2 min-h-[24px]"
          style={{ color: 'rgba(255,255,255,0.55)' }}>
          {last_summary || 'Monitoring nominal — all signals within tolerance'}
        </div>

        {/* Footer — AUM exposure */}
        <div className="pt-2 mt-auto border-t border-[rgba(255,255,255,0.05)] flex items-center justify-between">
          <div>
            <div className="text-[7px] uppercase tracking-widest text-[rgba(255,255,255,0.3)]">
              AUM Watched
            </div>
            <div className="text-[10px] font-bold tabular-nums" style={{ color: 'rgba(255,255,255,0.7)' }}>
              €{aum >= 1000 ? `${(aum / 1000).toFixed(1)}B` : `${aum}M`}
            </div>
          </div>
          {is_anomaly && (
            <div className="text-right">
              <div className="text-[7px] uppercase tracking-widest" style={{ color: 'rgba(255,170,0,0.6)' }}>
                At Risk
              </div>
              <div className="text-[10px] font-black tabular-nums" style={{ color: '#ffaa00', textShadow: '0 0 6px rgba(255,170,0,0.5)' }}>
                €{atRisk}M
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(BotCardPremium)
