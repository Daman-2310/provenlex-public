'use client'

import { ShadowBotData } from '@/lib/useWebSocket'
import { Shield, Eye, Zap, AlertTriangle } from 'lucide-react'

const DIFFICULTY_CONFIG = {
  EXTREME: { color: '#00ff88', bg: 'rgba(0,255,136,0.06)',  border: 'rgba(0,255,136,0.35)', label: 'EXTREME' },
  HIGH:    { color: '#00ff88', bg: 'rgba(0,255,136,0.04)',  border: 'rgba(0,255,136,0.25)', label: 'HIGH' },
  MODERATE:{ color: '#ffaa00', bg: 'rgba(255,170,0,0.05)',  border: 'rgba(255,170,0,0.3)',  label: 'MODERATE' },
  LOW:     { color: '#ff3366', bg: 'rgba(255,51,102,0.05)', border: 'rgba(255,51,102,0.35)',label: 'LOW' },
}

export default function ShadowBotCard({ data }: { data: ShadowBotData }) {
  const cfg = DIFFICULTY_CONFIG[data.evasion_difficulty] ?? DIFFICULTY_CONFIG.MODERATE
  const scoreColor = data.defeat_score >= 80 ? '#00ff88' : data.defeat_score >= 60 ? '#ffaa00' : '#ff3366'
  const coveragePct = Math.round((data.coverage ?? 0) * 100)

  return (
    <div className="rounded-lg flex flex-col"
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        boxShadow: `0 0 20px ${cfg.color}10`,
      }}>

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 shrink-0"
        style={{ borderBottom: `1px solid ${cfg.color}15` }}>
        <div className="w-1 h-5 rounded-full shrink-0" style={{ background: cfg.color, boxShadow: `0 0 8px ${cfg.color}` }} />
        <Eye className="w-3.5 h-3.5 shrink-0" style={{ color: cfg.color }} />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-black tracking-[0.15em] uppercase truncate" style={{ color: cfg.color }}>
            Shadow Adversary
          </div>
          <div className="text-[8px] tracking-wider uppercase truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Red-team · adversarial robustness
          </div>
        </div>
        <span className="text-[8px] uppercase tracking-[0.15em] font-black px-2 py-1 rounded-full shrink-0"
          style={{ background: `${cfg.color}15`, color: cfg.color, border: `1px solid ${cfg.color}55` }}>
          {cfg.label}
        </span>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4">

        {/* Big score + metrics */}
        <div className="flex items-end gap-5">
          <div className="shrink-0">
            <div className="text-[8px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] mb-1">Defeat Score</div>
            <div className="flex items-baseline gap-1">
              <div className="font-black tabular-nums leading-none"
                style={{
                  fontSize: 'clamp(2.25rem, 4vw, 3rem)',
                  color: scoreColor,
                  textShadow: `0 0 20px ${scoreColor}88`,
                }}>
                {data.defeat_score?.toFixed(0) ?? '—'}
              </div>
              <div className="text-[10px] font-mono text-[rgba(255,255,255,0.35)]">/100</div>
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-2">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[8px] text-[rgba(255,255,255,0.45)] uppercase tracking-wider">Signal coverage</span>
                <span className="text-[10px] font-black tabular-nums" style={{ color: cfg.color }}>{coveragePct}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${coveragePct}%`,
                    background: `linear-gradient(90deg, ${cfg.color}aa, ${cfg.color})`,
                    boxShadow: `0 0 6px ${cfg.color}`,
                  }} />
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[8px] text-[rgba(255,255,255,0.45)] uppercase tracking-wider">Red-team attempts</span>
              <span className="text-[10px] font-black tabular-nums text-white">
                {data.red_team_attempts?.toLocaleString() ?? '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Blind spots */}
        {data.blind_spots?.length > 0 ? (
          <div className="rounded p-3"
            style={{ background: 'rgba(255,170,0,0.05)', border: '1px solid rgba(255,170,0,0.25)' }}>
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3 h-3 text-[#ffaa00] shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-[8px] text-[#ffaa00] uppercase tracking-wider font-bold mb-1.5">Exploitable blind spots</div>
                <div className="flex flex-wrap gap-1">
                  {data.blind_spots.map(b => (
                    <span key={b} className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                      style={{ background: 'rgba(255,170,0,0.1)', color: '#ffaa00', border: '1px solid rgba(255,170,0,0.35)' }}>
                      {b.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded p-2.5 flex items-center gap-2"
            style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.2)' }}>
            <Shield className="w-3 h-3 text-[#00ff88] shrink-0" />
            <span className="text-[9px] text-[rgba(0,255,136,0.85)] uppercase tracking-wider font-bold">
              No exploitable blind spots detected
            </span>
          </div>
        )}

        {/* Narrative */}
        {data.adversarial_narrative && (
          <div className="text-[9px] text-[rgba(255,255,255,0.5)] leading-relaxed pl-3"
            style={{ borderLeft: `2px solid ${cfg.color}40` }}>
            {data.adversarial_narrative}
          </div>
        )}

        {/* Industry-first badge */}
        <div className="flex items-center gap-1.5 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <Zap className="w-2.5 h-2.5 text-[rgba(255,255,255,0.3)]" />
          <span className="text-[7px] text-[rgba(255,255,255,0.35)] uppercase tracking-[0.18em] font-bold">
            Industry first · Adversarial robustness published openly
          </span>
        </div>
      </div>
    </div>
  )
}
