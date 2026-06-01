'use client'

import { useState } from 'react'
import { MapPin, GitCompare, TrendingUp, FileCheck2, ShieldAlert, CheckCircle2, XCircle, Play, ChevronRight, ExternalLink } from 'lucide-react'
import {
  verifyInLuxembourg, reconcile, simulateTrade, preflightValidate, scoreDelegate,
  type Discrepancy, type RuleCheck, type EidFinding,
} from '@/lib/lux-engines'
import {
  AIFMD_CITATIONS, EID_CITATIONS, RECON_CITATIONS, DELEGATION_CITATION, SUBSTANCE_CITATION,
  type Citation,
} from '@/lib/lux-citations'

// Expandable regulatory provenance for a single verdict. Collapsed by default so
// the grid stays scannable; opens to show the instrument, the requirement, the
// exact formula the engine ran, and a link to the official source.
function WhyChip({ cite, accent }: { cite?: Citation; accent: string }) {
  const [open, setOpen] = useState(false)
  if (!cite) return null
  return (
    <div className="mt-0.5">
      <button onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-0.5 text-[8px] uppercase tracking-[0.15em] font-bold transition-colors"
        style={{ color: open ? accent : 'rgba(255,255,255,0.3)' }}>
        <ChevronRight className="w-2.5 h-2.5" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
        why?
      </button>
      {open && (
        <div className="mt-1 ml-2 pl-2 py-1.5 space-y-1 rounded" style={{ borderLeft: `2px solid ${accent}55`, background: 'rgba(255,255,255,0.02)' }}>
          <div className="text-[9px] font-bold" style={{ color: accent }}>{cite.framework}</div>
          <div className="text-[9px] text-[rgba(255,255,255,0.6)] leading-snug">{cite.basis}</div>
          <div className="text-[9px] font-mono text-[rgba(255,255,255,0.75)]">∑ {cite.formula}</div>
          <a href={cite.source} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[8px] uppercase tracking-wider hover:underline" style={{ color: accent }}>
            <ExternalLink className="w-2.5 h-2.5" /> official source
          </a>
        </div>
      )}
    </div>
  )
}

// Shared cell styling
const card = (accent: string) => ({
  background: 'rgba(0,0,0,0.4)', border: `1px solid ${accent}30`, backdropFilter: 'blur(8px)',
})

function Verdict({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-bold" style={{ color: ok ? '#00ff88' : '#ff3366' }}>
      {ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {ok ? okLabel : badLabel}
    </span>
  )
}

// ── 1. Substance geofence ───────────────────────────────────────────────────────
function SubstancePanel() {
  const presets = [
    { label: 'Luxembourg City', lat: 49.61, lon: 6.13 },
    { label: 'Paris', lat: 48.86, lon: 2.35 },
    { label: 'Frankfurt', lat: 50.11, lon: 8.68 },
    { label: 'Esch-sur-Alzette (LU)', lat: 49.50, lon: 5.98 },
  ]
  const [sel, setSel] = useState(0)
  const r = verifyInLuxembourg(presets[sel].lat, presets[sel].lon)
  return (
    <div className="rounded-xl p-4" style={card('#9b6dff')}>
      <Head icon={<MapPin className="w-4 h-4" />} color="#9b6dff" n={1} title="Substance Audit · geofence (CSSF 24/856)" />
      <p className="text-[11px] text-[rgba(255,255,255,0.55)] mb-3">A director&apos;s board-vote sign-off must originate inside Luxembourg. Pick a location:</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {presets.map((p, i) => (
          <button key={p.label} onClick={() => setSel(i)}
            className="text-[10px] px-2 py-1 rounded transition-all"
            style={{ background: i === sel ? 'rgba(155,109,255,0.25)' : 'rgba(255,255,255,0.04)', border: `1px solid ${i === sel ? 'rgba(155,109,255,0.5)' : 'rgba(255,255,255,0.1)'}`, color: i === sel ? '#fff' : 'rgba(255,255,255,0.6)' }}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-lg p-3" style={{ background: 'rgba(0,0,0,0.4)' }}>
        <span className="text-[11px] font-mono text-[rgba(255,255,255,0.5)]">{presets[sel].lat}, {presets[sel].lon}</span>
        <Verdict ok={r.inside} okLabel="INSIDE LUXEMBOURG" badLabel="OUTSIDE — SIGN-OFF BLOCKED" />
      </div>
      <div className="text-[9px] font-mono text-[rgba(255,255,255,0.35)] mt-2">method: {r.method} · ray-casting point-in-polygon</div>
      <WhyChip cite={SUBSTANCE_CITATION} accent="#9b6dff" />
    </div>
  )
}

// ── 2. Reconciliation ────────────────────────────────────────────────────────────
function ReconPanel() {
  const [scenario, setScenario] = useState<'clean' | 'breach'>('breach')
  const input = scenario === 'breach'
    ? { reportedNavEur: 1_000_000, assets: [{ id: 'X', valueEur: 600_000 }, { id: 'Y', valueEur: 350_000 }], liquidityBufferEur: 50_000, var95Eur: 80_000, redemptionObligationsEur: 120_000, weights: [{ id: 'X', weight: 0.6, prospectusMax: 0.5 }, { id: 'Y', weight: 0.35, prospectusMax: 0.4 }] }
    : { reportedNavEur: 1_000_000, assets: [{ id: 'X', valueEur: 500_000 }, { id: 'Y', valueEur: 500_000 }], liquidityBufferEur: 200_000, var95Eur: 80_000, redemptionObligationsEur: 150_000, weights: [{ id: 'X', weight: 0.5, prospectusMax: 0.6 }, { id: 'Y', weight: 0.5, prospectusMax: 0.6 }] }
  const res = reconcile(input)
  return (
    <div className="rounded-xl p-4" style={card('#00d8ff')}>
      <Head icon={<GitCompare className="w-4 h-4" />} color="#00d8ff" n={2} title="Cross-Departmental Discrepancy Engine" />
      <div className="flex gap-1.5 mb-3">
        {(['breach', 'clean'] as const).map(s => (
          <button key={s} onClick={() => setScenario(s)} className="text-[10px] px-2 py-1 rounded uppercase tracking-wider font-bold"
            style={{ background: scenario === s ? 'rgba(0,216,255,0.2)' : 'rgba(255,255,255,0.04)', border: `1px solid ${scenario === s ? 'rgba(0,216,255,0.5)' : 'rgba(255,255,255,0.1)'}`, color: scenario === s ? '#00d8ff' : 'rgba(255,255,255,0.5)' }}>
            {s === 'breach' ? 'stressed fund' : 'clean fund'}
          </button>
        ))}
      </div>
      <div className="mb-2"><Verdict ok={res.clean} okLabel="RECONCILED CLEAN" badLabel={`${res.discrepancies.length} DISCREPANCIES`} /></div>
      <div className="space-y-1">
        {res.discrepancies.map((d: Discrepancy, i) => (
          <div key={i} className="text-[10px] leading-snug" style={{ color: d.severity === 'critical' ? '#ff3366' : '#ffaa00' }}>
            <span className="font-mono font-bold">[{d.severity}] {d.code}</span> <span className="text-[rgba(255,255,255,0.6)]">{d.detail}</span>
            <WhyChip cite={RECON_CITATIONS[d.code]} accent="#00d8ff" />
          </div>
        ))}
        {res.clean && <div className="text-[10px] text-[rgba(255,255,255,0.5)]">All three streams (NAV / liquidity / allocation) align within 0.5% tolerance.</div>}
      </div>
    </div>
  )
}

// ── 3. AIFMD trade simulate ───────────────────────────────────────────────────────
function AifmdPanel() {
  const [structure, setStructure] = useState<'open_ended' | 'closed_ended'>('open_ended')
  const [retentionPct, setRetentionPct] = useState(4)
  const input = {
    structure, navEur: 10_000_000, grossExposureEur: 16_000_000,
    priorBorrowerExposureEur: 1_500_000, borrowerIsFI: true,
    loanNominalEur: 1_000_000, retainedEur: (retentionPct / 100) * 1_000_000, addedExposureEur: 900_000,
  }
  const res = simulateTrade(input)
  return (
    <div className="rounded-xl p-4" style={card('#ff7a00')}>
      <Head icon={<TrendingUp className="w-4 h-4" />} color="#ff7a00" n={3} title="AIFMD II · pre-trade /simulate" />
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="flex gap-1.5">
          {(['open_ended', 'closed_ended'] as const).map(s => (
            <button key={s} onClick={() => setStructure(s)} className="text-[10px] px-2 py-1 rounded"
              style={{ background: structure === s ? 'rgba(255,122,0,0.2)' : 'rgba(255,255,255,0.04)', border: `1px solid ${structure === s ? 'rgba(255,122,0,0.5)' : 'rgba(255,255,255,0.1)'}`, color: structure === s ? '#ff7a00' : 'rgba(255,255,255,0.5)' }}>
              {s === 'open_ended' ? 'open (175% cap)' : 'closed (300% cap)'}
            </button>
          ))}
        </div>
        <label className="text-[10px] text-[rgba(255,255,255,0.55)] flex items-center gap-2">
          retention {retentionPct}%
          <input type="range" min={0} max={10} value={retentionPct} onChange={e => setRetentionPct(+e.target.value)} className="w-24" />
        </label>
      </div>
      <div className="mb-2"><Verdict ok={res.allowed} okLabel="TRADE ALLOWED" badLabel="TRADE BLOCKED" /></div>
      <div className="space-y-1">
        {res.checks.map((c: RuleCheck) => (
          <div key={c.rule} className="flex items-start gap-1.5 text-[10px]">
            {c.passed ? <CheckCircle2 className="w-3 h-3 text-[#00ff88] shrink-0 mt-0.5" /> : <XCircle className="w-3 h-3 text-[#ff3366] shrink-0 mt-0.5" />}
            <span className="min-w-0">
              <span className="font-mono font-bold text-[rgba(255,255,255,0.75)]">{c.rule}</span> <span className="text-[rgba(255,255,255,0.55)]">{c.detail}</span>
              <WhyChip cite={AIFMD_CITATIONS[c.rule]} accent="#ff7a00" />
            </span>
          </div>
        ))}
      </div>
      <div className="text-[9px] font-mono text-[rgba(255,255,255,0.35)] mt-2">post-trade leverage {res.postTrade.leveragePct}% / cap {res.postTrade.leverageCapPct}%</div>
    </div>
  )
}

// ── 4. e-ID pre-flight ────────────────────────────────────────────────────────────
function EidPanel() {
  const [valid, setValid] = useState(false)
  const input = valid
    ? { legalName: 'Genesis Lux Fund SICAV-RAIF', managementCompany: 'Genesis ManCo S.A.', depositary: 'BNP Paribas LU', documentTitle: 'Offering Document v1', documentSha256: 'a'.repeat(64), eidasSignature: 'b'.repeat(80), lei: '529900VBK42Y5HHRMD23' }
    : { legalName: 'Genesis Lux Fund', managementCompany: '', depositary: 'BNP Paribas LU', documentTitle: 'Offering Document', documentSha256: 'not-a-hash', eidasSignature: 'short', lei: 'BADLEI' }
  const res = preflightValidate(input)
  return (
    <div className="rounded-xl p-4" style={card('#4a9eff')}>
      <Head icon={<FileCheck2 className="w-4 h-4" />} color="#4a9eff" n={4} title="CSSF e-Identification · pre-flight" />
      <div className="flex gap-1.5 mb-3">
        {[['incomplete package', false], ['complete package', true]].map(([label, v]) => (
          <button key={String(v)} onClick={() => setValid(v as boolean)} className="text-[10px] px-2 py-1 rounded"
            style={{ background: valid === v ? 'rgba(74,158,255,0.2)' : 'rgba(255,255,255,0.04)', border: `1px solid ${valid === v ? 'rgba(74,158,255,0.5)' : 'rgba(255,255,255,0.1)'}`, color: valid === v ? '#4a9eff' : 'rgba(255,255,255,0.5)' }}>
            {label as string}
          </button>
        ))}
      </div>
      <div className="mb-2"><Verdict ok={res.valid} okLabel="READY TO TRANSMIT" badLabel="REJECTED PRE-TRANSMISSION" /></div>
      <div className="space-y-0.5">
        {res.findings.map((f: EidFinding) => (
          <div key={f.field} className="text-[10px]">
            <div className="flex items-center gap-1.5">
              {f.ok ? <CheckCircle2 className="w-3 h-3 text-[#00ff88] shrink-0" /> : <XCircle className="w-3 h-3 text-[#ff3366] shrink-0" />}
              <span className="font-mono text-[rgba(255,255,255,0.7)]">{f.field}</span>
              <span className="text-[rgba(255,255,255,0.45)]">— {f.message}</span>
            </div>
            <div className="ml-[18px]"><WhyChip cite={EID_CITATIONS[f.field]} accent="#4a9eff" /></div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 5. Delegation oversight ─────────────────────────────────────────────────────
function DelegationPanel() {
  const [uptime, setUptime] = useState(97.5)
  const input = { name: 'AdminCo S.A.', isCritical: true, slaUptimePct: uptime, compliancePassRate: 0.8, securityIncidents90d: 2, openFindings: 3, daysSinceLastReview: 200 }
  const res = scoreDelegate(input)
  const color = res.score >= 70 ? '#00ff88' : res.score >= 50 ? '#ffaa00' : '#ff3366'
  return (
    <div className="rounded-xl p-4" style={card('#ff3366')}>
      <Head icon={<ShieldAlert className="w-4 h-4" />} color="#ff3366" n={5} title="Delegation Oversight (CSSF 18/698)" />
      <label className="text-[10px] text-[rgba(255,255,255,0.55)] flex items-center gap-2 mb-3">
        critical vendor SLA uptime {uptime.toFixed(1)}%
        <input type="range" min={94} max={100} step={0.1} value={uptime} onChange={e => setUptime(+e.target.value)} className="flex-1" />
      </label>
      <div className="flex items-center justify-between rounded-lg p-3 mb-2" style={{ background: 'rgba(0,0,0,0.4)' }}>
        <span className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.5)]">health score (floor {res.floor})</span>
        <span className="text-2xl font-black font-mono" style={{ color }}>{res.score}</span>
      </div>
      <Verdict ok={res.healthy} okLabel="WITHIN TOLERANCE" badLabel={`BREACH → ${res.action.replace(/_/g, ' ')}`} />
      <div className="text-[9px] font-mono text-[rgba(255,255,255,0.4)] mt-2">
        penalties: {Object.entries(res.drivers).filter(([, v]) => v > 0).map(([k, v]) => `${k.replace('Penalty', '')} −${v}`).join(' · ') || 'none'}
      </div>
      <WhyChip cite={DELEGATION_CITATION} accent="#ff3366" />
    </div>
  )
}

function Head({ icon, color, n, title }: { icon: React.ReactNode; color: string; n: number; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2" style={{ color }}>
      {icon}
      <span className="text-[9px] uppercase tracking-wider font-mono font-black">Engine {n}</span>
      <span className="text-[12px] font-bold text-white">{title}</span>
    </div>
  )
}

interface ChainProof {
  hash0: string; intactBefore: boolean; intactAfter: boolean; brokenAt: number | null
}

export default function LuxConsole() {
  const [chainState, setChainState] = useState<ChainProof | null>(null)
  const [chainBusy, setChainBusy] = useState(false)

  async function runChainProof() {
    setChainBusy(true)
    const { appendChain, verifyChain } = await import('@/lib/lux-engines')
    const chain: import('@/lib/lux-engines').ChainLink[] = []
    await appendChain(chain, { director: 'A. Weber', action: 'board_vote', subFund: 'SF-1' })
    await appendChain(chain, { director: 'M. Schmit', action: 'nav_sign_off', subFund: 'SF-1' })
    const before = await verifyChain(chain)
    const hash0 = chain[0].entryHash
    // Retroactively tamper with link 0's payload — exactly what a bad actor would do.
    chain[0].payload.action = 'TAMPERED'
    const after = await verifyChain(chain)
    setChainState({ hash0, intactBefore: before.intact, intactAfter: after.intact, brokenAt: after.brokenAt })
    setChainBusy(false)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SubstancePanel />
        <ReconPanel />
        <AifmdPanel />
        <EidPanel />
        <DelegationPanel />
        {/* Hash-chain integrity proof */}
        <div className="rounded-xl p-4" style={card('#00ff88')}>
          <Head icon={<ShieldAlert className="w-4 h-4" />} color="#00ff88" n={0} title="Tamper-evident audit ledger" />
          <p className="text-[11px] text-[rgba(255,255,255,0.55)] mb-3">Both the substance log and the delegation ledger are SHA-256 hash-chains. Prove that any retroactive edit is detectable:</p>
          <button onClick={runChainProof} disabled={chainBusy}
            className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold px-3 py-1.5 rounded mb-2"
            style={{ background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.5)', color: '#00ff88' }}>
            <Play className="w-3 h-3" /> {chainBusy ? 'running' : 'run tamper proof'}
          </button>
          {chainState && (
            <div className="text-[10px] font-mono leading-relaxed space-y-1">
              <div className="text-[rgba(255,255,255,0.5)]">link[0] entryHash: <span className="text-[#00ff88]">{chainState.hash0.slice(0, 24)}…</span></div>
              <div className="flex items-center gap-1.5" style={{ color: '#00ff88' }}>
                <CheckCircle2 className="w-3 h-3" /> 2 links appended → verifyChain intact = <b>{String(chainState.intactBefore)}</b>
              </div>
              <div className="text-[rgba(255,255,255,0.5)]">↳ retroactively edit link[0].action → &ldquo;TAMPERED&rdquo;</div>
              <div className="flex items-center gap-1.5" style={{ color: '#ff3366' }}>
                <XCircle className="w-3 h-3" /> verifyChain intact = <b>{String(chainState.intactAfter)}</b> · brokenAt = <b>{chainState.brokenAt}</b>
              </div>
              <div className="text-[rgba(255,255,255,0.4)]">A single retroactive edit re-derives a different SHA-256 and breaks every downstream link. Tamper-evident by construction.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
