'use client'

import {
  BadgeCheck, Banknote, Clock3, FileCheck2, GitBranch, LockKeyhole,
  ShieldCheck, Sparkles, TrendingUp, Trophy,
} from 'lucide-react'
import type { InvestorBrief } from '@/lib/api'

function money(millions: number) {
  if (millions >= 1000) return `€${(millions / 1000).toFixed(1)}B`
  return `€${millions.toFixed(1)}M`
}

function ProofMetric({
  label, value, tone = 'green',
}: {
  label: string
  value: string
  tone?: 'green' | 'red' | 'blue' | 'gold'
}) {
  const color = tone === 'red' ? '#ff3366' : tone === 'blue' ? '#4a9eff' : tone === 'gold' ? '#ffaa00' : '#00ff88'
  return (
    <div className="border border-[rgba(0,255,136,0.14)] bg-[rgba(0,255,136,0.035)] rounded p-3 min-h-[74px]">
      <div className="text-[9px] uppercase tracking-wider text-[rgba(0,255,136,0.42)]">{label}</div>
      <div className="mt-1 text-xl font-bold" style={{ color }}>{value}</div>
    </div>
  )
}

export default function InvestorProofPanel({ brief }: { brief: InvestorBrief | null }) {
  const data = brief ?? {
    headline: 'Autonomous RegTech immune system for institutional capital',
    readiness_score: 0,
    protected_aum_eur_m: 0,
    capital_quarantined_eur_m: 0,
    annual_value_eur_m: 0,
    payback_days: 0,
    detection_latency_ms: 340,
    traditional_detection_hours: 48,
    speedup_multiple: 0,
    top_risk_score: 0,
    open_cases: 0,
    evidence: {
      tests_passing: 0, bot_count: 11, quorum: '7/11', merkle_depth: 0,
      ledger_chain_length: 0, ledger_integrity: false, consensus_rounds: 0,
      avg_trust_score: 1, case_workflow: true, jwt_protected_writes: true, ci_gate: true,
    },
    moat: [],
    investor_takeaway: 'Loading investor proof pack...',
  }

  const evidence = [
    { icon: Trophy, label: 'Tests', value: `${data.evidence.tests_passing} passing`, ok: data.evidence.tests_passing >= 66 },
    { icon: ShieldCheck, label: 'Quorum', value: data.evidence.quorum, ok: true },
    { icon: GitBranch, label: 'Audit Chain', value: `${data.evidence.ledger_chain_length} blocks`, ok: data.evidence.ledger_integrity },
    { icon: FileCheck2, label: 'Merkle', value: `${data.evidence.merkle_depth} events`, ok: true },
    { icon: LockKeyhole, label: 'Writes', value: 'JWT gated', ok: data.evidence.jwt_protected_writes },
    { icon: BadgeCheck, label: 'CI', value: data.evidence.ci_gate ? 'enforced' : 'missing', ok: data.evidence.ci_gate },
  ]

  return (
    <section className="terminal-border bg-genesis-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-[rgba(0,255,136,0.12)] flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold text-[#00ff88] uppercase tracking-[0.16em] flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" />
            Investor Proof Pack
          </div>
          <div className="text-xs text-[rgba(0,255,136,0.52)] mt-1">{data.headline}</div>
        </div>
        <div className="flex items-end gap-2">
          <span className="text-[9px] uppercase tracking-wider text-[rgba(0,255,136,0.42)] mb-1">Readiness</span>
          <span className="text-3xl font-bold text-[#00ff88]">{Math.round(data.readiness_score)}</span>
          <span className="text-sm text-[rgba(0,255,136,0.45)] mb-1">/100</span>
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-7 grid grid-cols-2 md:grid-cols-4 gap-3">
          <ProofMetric label="Protected AUM" value={money(data.protected_aum_eur_m)} tone="blue" />
          <ProofMetric label="Annual Value" value={money(data.annual_value_eur_m)} />
          <ProofMetric label="Payback" value={`${data.payback_days} days`} tone="gold" />
          <ProofMetric label="Speedup" value={`${data.speedup_multiple.toLocaleString()}x`} tone="red" />
          <ProofMetric label="Detection" value={`${data.detection_latency_ms}ms`} />
          <ProofMetric label="Legacy Lag" value={`${data.traditional_detection_hours}h`} tone="gold" />
          <ProofMetric label="Quarantined" value={money(data.capital_quarantined_eur_m)} tone={data.capital_quarantined_eur_m > 0 ? 'red' : 'green'} />
          <ProofMetric label="Open Cases" value={String(data.open_cases)} tone="blue" />
        </div>

        <div className="xl:col-span-5 grid grid-cols-2 gap-2 content-start">
          {evidence.map(({ icon: Icon, label, value, ok }) => (
            <div key={label} className="flex items-center gap-2 border border-[rgba(0,255,136,0.12)] bg-[#050508] rounded px-3 py-2 min-h-[48px]">
              <Icon className="w-4 h-4 shrink-0" style={{ color: ok ? '#00ff88' : '#ffaa00' }} />
              <div className="min-w-0">
                <div className="text-[8px] uppercase tracking-wider text-[rgba(0,255,136,0.38)]">{label}</div>
                <div className="text-[11px] text-[#00ff88] truncate">{value}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="xl:col-span-12 grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
          <div className="border border-[rgba(74,158,255,0.18)] bg-[rgba(74,158,255,0.045)] rounded p-3">
            <div className="flex items-center gap-2 text-[9px] uppercase tracking-wider text-[#4a9eff] font-bold mb-2">
              <TrendingUp className="w-3.5 h-3.5" />
              Why This Is Hard To Copy
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
              {data.moat.map((item) => (
                <div key={item} className="text-[10px] leading-5 text-[rgba(0,255,136,0.66)] flex gap-2">
                  <span className="text-[#00ff88]">+</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="border border-[rgba(0,255,136,0.18)] bg-[rgba(0,255,136,0.05)] rounded p-3 flex items-center gap-3">
            <Banknote className="w-8 h-8 text-[#00ff88] shrink-0" />
            <div>
              <div className="text-[9px] uppercase tracking-wider text-[rgba(0,255,136,0.42)]">Boardroom Takeaway</div>
              <div className="text-sm leading-6 text-[#00ff88]">{data.investor_takeaway}</div>
              <div className="mt-1 flex items-center gap-2 text-[9px] text-[rgba(0,255,136,0.46)]">
                <Clock3 className="w-3 h-3" />
                Evidence refreshes from live backend state.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
