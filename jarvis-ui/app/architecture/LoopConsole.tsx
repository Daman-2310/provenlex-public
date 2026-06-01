'use client'

import { useState } from 'react'
import { Play, Loader2, CheckCircle2, XCircle, AlertTriangle, Lock, Swords, Scale, Brain, Zap, Network } from 'lucide-react'

interface LoopData {
  pillars: {
    p3_code_to_law: { compliant: boolean; passed: number; failed: number; critical_failures: number; total: number; state_hash: string; trace: Array<{ rule_id: string; passed: boolean; detail: string; children?: Array<{ rule_id: string; passed: boolean; detail: string }> }> }
    p2_red_team: { breaches_found: number; attacks_attempted: number; margin_score: number; vectors: Array<{ field: string; delta_pct: number; rule_id: string; patch_suggestion: string }> }
    p1_zk_vault: { verification: { valid: boolean; root_ok: boolean; checks: Array<{ predicate: string; result: boolean; binding_ok: boolean }> }; bundle: { vault_root: string } } | null
    p4_precedent: { p_any_action: number; expected_fine_eur_m: number; worst_case_eur_m: number; median_lag_months: number; distribution: Record<string, number> }
    p6_regulatory_twin: { supervisor: string; enforcement_risk: number; likely_instrument: string; expected_speed_months: number; posture_read: string }
    p7_kinetic: Array<{ id: string; kind: string; urgency: string; requires_approval: string; rationale: string }>
    p5_topology: { nodes: number; edges: number; betti_1: number; bridges: Array<{ source: string; target: string }>; loopholes: Array<{ description: string; severity: number }> }
  }
}

const JURISDICTIONS = ['CSSF', 'BaFin', 'FCA', 'AMF', 'AFM']

export default function LoopConsole() {
  const [loading, setLoading] = useState(false)
  const [jur, setJur] = useState('CSSF')
  const [data, setData] = useState<LoopData | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/pillars/demo?jurisdiction=${jur}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'failed'); return }
      setData(json)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const p = data?.pillars

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(155,109,255,0.3)', backdropFilter: 'blur(10px)' }}>
      <div className="px-5 py-3 flex items-center gap-3 flex-wrap" style={{ borderBottom: '1px solid rgba(155,109,255,0.15)', background: 'rgba(155,109,255,0.05)' }}>
        <span className="text-[11px] uppercase tracking-wider font-black text-[#9b6dff]">Compliance Kernel · stressed-bank demo</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">jurisdiction</span>
          <select value={jur} onChange={e => setJur(e.target.value)}
            className="bg-black/40 text-[11px] text-white rounded px-2 py-1 border border-[rgba(155,109,255,0.3)] outline-none">
            {JURISDICTIONS.map(j => <option key={j} value={j}>{j}</option>)}
          </select>
          <button onClick={run} disabled={loading}
            className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold px-3 py-1.5 rounded transition-all disabled:opacity-50"
            style={{ background: 'rgba(155,109,255,0.18)', border: '1px solid rgba(155,109,255,0.5)', color: '#9b6dff' }}>
            {loading ? <><Loader2 className="w-3 h-3 animate-spin" /> Running</> : <><Play className="w-3 h-3" /> Run loop</>}
          </button>
        </div>
      </div>

      {error && <div className="px-5 py-4 text-[12px] text-[#ff3366]">{error}</div>}

      {!data && !loading && (
        <div className="px-5 py-10 text-center text-[12px] text-[rgba(255,255,255,0.5)]">
          Click <strong className="text-[#9b6dff]">Run loop</strong> — evaluates a deliberately stressed institution
          (Tier-1 11.2% &lt; 12% limit, single-issuer 13.5% &gt; 10% limit) across all 7 pillars.
        </div>
      )}

      {p && (
        <div className="p-5 space-y-4">
          {/* P3 verdict */}
          <Block icon={<Scale className="w-4 h-4" />} color="#9b6dff" title="Pillar 3 · Code-to-Law verdict">
            <div className="flex items-center gap-3 mb-2">
              {p.p3_code_to_law.compliant
                ? <span className="flex items-center gap-1 text-[#00ff88] text-[13px] font-bold"><CheckCircle2 className="w-4 h-4" /> COMPLIANT</span>
                : <span className="flex items-center gap-1 text-[#ff3366] text-[13px] font-bold"><XCircle className="w-4 h-4" /> NON-COMPLIANT</span>}
              <span className="text-[11px] text-[rgba(255,255,255,0.6)]">{p.p3_code_to_law.passed}/{p.p3_code_to_law.total} checks pass · {p.p3_code_to_law.critical_failures} critical fail</span>
            </div>
            <div className="space-y-1">
              {p.p3_code_to_law.trace.flatMap(t => 'children' in t && (t as { children?: unknown[] }).children ? ((t as { children: typeof t[] }).children) : [t]).slice(0, 8).map((leaf, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                  {leaf.passed ? <CheckCircle2 className="w-3 h-3 text-[#00ff88] shrink-0" /> : <XCircle className="w-3 h-3 text-[#ff3366] shrink-0" />}
                  <span className="text-[rgba(255,255,255,0.65)]">{leaf.detail}</span>
                </div>
              ))}
            </div>
            <div className="text-[9px] font-mono text-[rgba(255,255,255,0.35)] mt-2">state_hash {p.p3_code_to_law.state_hash.slice(0, 24)}…</div>
          </Block>

          {/* P2 red team */}
          <Block icon={<Swords className="w-4 h-4" />} color="#ff3366" title="Pillar 2 · Autonomous red-team">
            <div className="text-[11px] text-[rgba(255,255,255,0.6)] mb-2">{p.p2_red_team.attacks_attempted} perturbations · {p.p2_red_team.breaches_found} breach vectors · robustness {p.p2_red_team.margin_score}/100</div>
            {p.p2_red_team.vectors.slice(0, 3).map((v, i) => (
              <div key={i} className="text-[10px] mb-1.5">
                <span className="font-mono text-[#ff3366]">{v.field}</span>
                <span className="text-[rgba(255,255,255,0.5)]"> breaks {v.rule_id} at {v.delta_pct > 0 ? '+' : ''}{v.delta_pct}% · </span>
                <span className="text-[rgba(255,255,255,0.45)] italic">{v.patch_suggestion}</span>
              </div>
            ))}
          </Block>

          {/* P1 ZK */}
          {p.p1_zk_vault && (
            <Block icon={<Lock className="w-4 h-4" />} color="#00ff88" title="Pillar 1 · ZK privacy vault">
              <div className="flex items-center gap-2 text-[12px] mb-2">
                {p.p1_zk_vault.verification.valid
                  ? <span className="text-[#00ff88] font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> proof bundle valid</span>
                  : <span className="text-[#ff3366] font-bold">invalid</span>}
                <span className="text-[10px] text-[rgba(255,255,255,0.5)]">verifier learns only booleans, never values</span>
              </div>
              {p.p1_zk_vault.verification.checks.map((c, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px] font-mono text-[rgba(255,255,255,0.6)]">
                  {c.binding_ok
                    ? <CheckCircle2 className="w-3 h-3 text-[#00ff88] shrink-0" />
                    : <XCircle className="w-3 h-3 text-[#ff3366] shrink-0" />}
                  {c.predicate} &rarr; {String(c.result)}
                </div>
              ))}
              <div className="text-[9px] font-mono text-[rgba(255,255,255,0.35)] mt-1">vault_root {p.p1_zk_vault.bundle.vault_root.slice(0, 24)}…</div>
            </Block>
          )}

          {/* P4 precedent */}
          <Block icon={<Scale className="w-4 h-4" />} color="#ffaa00" title="Pillar 4 · Synthetic precedent (Monte Carlo)">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <Stat label="P(any action)" value={`${(p.p4_precedent.p_any_action * 100).toFixed(0)}%`} color="#ffaa00" />
              <Stat label="Exp. fine" value={`€${p.p4_precedent.expected_fine_eur_m}m`} color="#ffaa00" />
              <Stat label="P95 fine" value={`€${p.p4_precedent.worst_case_eur_m}m`} color="#ff3366" />
              <Stat label="Median lag" value={`${p.p4_precedent.median_lag_months}mo`} color="#ffaa00" />
            </div>
          </Block>

          {/* P6 twin */}
          <Block icon={<Brain className="w-4 h-4" />} color="#00d8ff" title="Pillar 6 · Regulatory twin (institutional)">
            <div className="flex items-center gap-3 mb-1.5">
              <span className="text-[13px] font-bold text-white">{p.p6_regulatory_twin.supervisor}</span>
              <span className="text-[11px] font-mono" style={{ color: p.p6_regulatory_twin.enforcement_risk >= 65 ? '#ff3366' : p.p6_regulatory_twin.enforcement_risk >= 45 ? '#ffaa00' : '#00ff88' }}>
                risk {p.p6_regulatory_twin.enforcement_risk}/100
              </span>
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded" style={{ background: 'rgba(0,216,255,0.12)', border: '1px solid rgba(0,216,255,0.3)', color: '#00d8ff' }}>
                {p.p6_regulatory_twin.likely_instrument.replace('_', ' ')} · ~{p.p6_regulatory_twin.expected_speed_months}mo
              </span>
            </div>
            <p className="text-[11px] text-[rgba(255,255,255,0.65)] leading-relaxed">{p.p6_regulatory_twin.posture_read}</p>
          </Block>

          {/* P5 topology */}
          <Block icon={<Network className="w-4 h-4" />} color="#4a9eff" title="Pillar 5 · Topological law mapping">
            <div className="text-[11px] text-[rgba(255,255,255,0.6)] mb-2">{p.p5_topology.nodes} obligations · {p.p5_topology.edges} edges · β₁={p.p5_topology.betti_1} cycles · {p.p5_topology.bridges.length} bridges</div>
            {p.p5_topology.loopholes.slice(0, 3).map((l, i) => (
              <div key={i} className="flex items-start gap-2 text-[10px] mb-1">
                <AlertTriangle className="w-3 h-3 text-[#4a9eff] shrink-0 mt-0.5" />
                <span className="text-[rgba(255,255,255,0.6)]"><span className="text-[#4a9eff] font-bold">[{l.severity}]</span> {l.description}</span>
              </div>
            ))}
          </Block>

          {/* P7 kinetic */}
          <Block icon={<Zap className="w-4 h-4" />} color="#ff7a00" title="Pillar 7 · Kinetic compliance (signed intents)">
            {p.p7_kinetic.map((intent, i) => (
              <div key={i} className="rounded-lg p-2.5 mb-1.5" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,122,0,0.2)' }}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-mono text-[#ff7a00] font-bold">{intent.id}</span>
                  <span className="text-[11px] font-bold text-white">{intent.kind.replace(/_/g, ' ')}</span>
                  <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded ml-auto" style={{
                    background: intent.urgency === 'immediate' ? 'rgba(255,51,102,0.15)' : 'rgba(255,170,0,0.12)',
                    color: intent.urgency === 'immediate' ? '#ff3366' : '#ffaa00',
                  }}>{intent.urgency} · gate: {intent.requires_approval.replace('_', ' ')}</span>
                </div>
                <div className="text-[10px] text-[rgba(255,255,255,0.6)]">{intent.rationale}</div>
              </div>
            ))}
          </Block>
        </div>
      )}
    </div>
  )
}

function Block({ icon, color, title, children }: { icon: React.ReactNode; color: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.35)', border: `1px solid ${color}25` }}>
      <div className="flex items-center gap-2 mb-2" style={{ color }}>
        {icon}
        <span className="text-[11px] uppercase tracking-wider font-black">{title}</span>
      </div>
      {children}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg p-2" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="text-[16px] font-black font-mono" style={{ color }}>{value}</div>
      <div className="text-[8px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">{label}</div>
    </div>
  )
}
