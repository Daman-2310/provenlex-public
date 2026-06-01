'use client'

import { useState, useCallback } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle, AlertTriangle, Shield, Download, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || 'https://damansh-genesis-swarm.hf.space'

interface GapItem {
  framework: string
  requirement: string
  status: 'missing' | 'partial' | 'met'
  priority: 'critical' | 'high' | 'medium' | 'low'
  action: string
  deadline: string
  detail?: string
}

interface AssessmentResult {
  fund_name: string
  fund_type: string
  aum_eur_m: number
  score: number
  grade: string
  gaps: GapItem[]
  critical_count: number
  high_count: number
  total_gaps: number
  immediate_actions: GapItem[]
  frameworks_covered: string[]
  generated_at: string
  report_id: string
}

interface Profile {
  fund_name: string; fund_type: string; aum_eur_m: string; manager_name: string
  asset_class: string; has_delegation: boolean; has_leverage: boolean
  cross_border_marketing: boolean; sfdr_article: string; pai_consideration: boolean
  dora_maturity: string; aifmd_checklist: string; lmt_status: string
  has_custody_segregation: boolean
}

const INITIAL: Profile = {
  fund_name: '', fund_type: 'AIF', aum_eur_m: '', manager_name: '',
  asset_class: 'Multi-Strategy', has_delegation: false, has_leverage: false,
  cross_border_marketing: false, sfdr_article: '6', pai_consideration: false,
  dora_maturity: 'none', aifmd_checklist: 'not_started',
  lmt_status: 'none', has_custody_segregation: false,
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!value)}
      className={`flex items-center gap-2 px-3 py-2 rounded border text-xs font-mono transition-colors ${value ? 'border-[rgba(0,255,136,0.5)] bg-[rgba(0,255,136,0.08)] text-[#00ff88]' : 'border-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.4)] hover:border-[rgba(255,255,255,0.2)]'}`}>
      <span className={`w-3 h-3 rounded-full border ${value ? 'bg-[#00ff88] border-[#00ff88]' : 'border-[rgba(255,255,255,0.3)]'}`} />
      {label}
    </button>
  )
}

function Select({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: {value: string; label: string}[]; label: string }) {
  return (
    <div>
      <label className="block text-[10px] text-[rgba(255,255,255,0.4)] uppercase tracking-wider mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.12)] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[rgba(0,170,255,0.5)]">
        {options.map(o => <option key={o.value} value={o.value} className="bg-[#0a0f14]">{o.label}</option>)}
      </select>
    </div>
  )
}

function Input({ value, onChange, label, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="block text-[10px] text-[rgba(255,255,255,0.4)] uppercase tracking-wider mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.12)] rounded px-3 py-2 text-sm text-white placeholder-[rgba(255,255,255,0.25)] focus:outline-none focus:border-[rgba(0,170,255,0.5)]" />
    </div>
  )
}

function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border transition-all ${done ? 'bg-[#00ff88] border-[#00ff88] text-black' : active ? 'border-[rgba(0,170,255,0.8)] text-[#00aaff] bg-[rgba(0,170,255,0.1)]' : 'border-[rgba(255,255,255,0.15)] text-[rgba(255,255,255,0.3)]'}`}>
      {done ? <CheckCircle className="w-4 h-4" /> : n}
    </div>
  )
}

function GapCard({ gap, expanded, onToggle }: { gap: GapItem; expanded: boolean; onToggle: () => void }) {
  const pc = { critical: '#ff3366', high: '#ff6b35', medium: '#ffaa00', low: '#00aaff' }[gap.priority]
  const sc = { missing: '#ff3366', partial: '#ffaa00', met: '#00ff88' }[gap.status]
  return (
    <div className="border border-[rgba(255,255,255,0.07)] rounded bg-[rgba(255,255,255,0.02)]">
      <button className="w-full flex items-start gap-3 p-3 text-left" onClick={onToggle}>
        <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: pc }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono text-[rgba(255,255,255,0.8)]">{gap.requirement}</span>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[9px] px-1.5 py-0.5 rounded border font-mono" style={{ color: pc, borderColor: (pc ?? '') + '55' }}>{gap.priority.toUpperCase()}</span>
              <span className="text-[9px] font-bold font-mono" style={{ color: sc }}>{gap.status.toUpperCase()}</span>
              {expanded ? <ChevronUp className="w-3 h-3 text-[rgba(255,255,255,0.3)]" /> : <ChevronDown className="w-3 h-3 text-[rgba(255,255,255,0.3)]" />}
            </div>
          </div>
          <div className="flex gap-2 mt-0.5">
            <span className="text-[9px] text-[rgba(255,255,255,0.3)]">{gap.framework}</span>
            <span className="text-[9px] text-[rgba(255,255,255,0.2)]">·</span>
            <span className="text-[9px] text-[rgba(255,255,255,0.3)]">Due: {gap.deadline}</span>
          </div>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-[rgba(255,255,255,0.05)]">
          <p className="text-[11px] text-[#00aaff] mt-2">Action: {gap.action}</p>
          {gap.detail && <p className="text-[10px] text-[rgba(255,255,255,0.4)] mt-1">{gap.detail}</p>}
        </div>
      )}
    </div>
  )
}

export default function OnboardPage() {
  const [step, setStep] = useState(1)
  const [profile, setProfile] = useState<Profile>(INITIAL)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AssessmentResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedGaps, setExpandedGaps] = useState<Set<number>>(new Set())
  const [filterFw, setFilterFw] = useState<string>('all')

  const set = (k: keyof Profile, v: string | boolean) => setProfile(p => ({ ...p, [k]: v }))

  const runAssessment = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const body = { ...profile, aum_eur_m: parseFloat(profile.aum_eur_m) || 0, sfdr_article: parseInt(profile.sfdr_article) }
      const res = await fetch(`${API}/api/v1/onboard/assess`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json()); setStep(5)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assessment failed')
    } finally { setLoading(false) }
  }, [profile])

  const downloadReport = () => {
    if (!result) return
    const lines = [
      'GENESIS SWARM — COMPLIANCE GAP REPORT',
      `Fund: ${result.fund_name}  |  Type: ${result.fund_type}  |  AUM: €${result.aum_eur_m}M`,
      `Score: ${result.score}/100  Grade: ${result.grade}  |  Report ID: ${result.report_id}`,
      '', `SUMMARY: ${result.critical_count} critical, ${result.high_count} high, ${result.total_gaps} total gaps`,
      '', '='.repeat(70), 'COMPLIANCE GAPS', '='.repeat(70),
      ...result.gaps.map(g => `\n[${g.priority.toUpperCase()}] ${g.framework}\n${g.requirement}\nStatus: ${g.status.toUpperCase()}  Deadline: ${g.deadline}\nAction: ${g.action}${g.detail ? '\n' + g.detail : ''}`),
      '', '-'.repeat(70),
      'Indicative only. Consult a Luxembourg-licensed compliance officer before acting.',
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `GapReport_${result.fund_name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.txt`
    a.click(); URL.revokeObjectURL(url)
  }

  const gradeColor = (g: string) => ({ A: '#00ff88', B: '#00aaff', C: '#ffaa00', D: '#ff6b35', F: '#ff3366' }[g] ?? '#fff')
  const frameworks = result ? ['all', ...result.frameworks_covered] : []
  const visibleGaps = result?.gaps.filter(g => filterFw === 'all' || g.framework === filterFw) ?? []

  return (
    <div className="min-h-screen bg-[#050a0e] text-white font-mono">
      <div className="border-b border-[rgba(0,255,136,0.1)] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/operator" className="text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Dashboard</a>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <span className="text-sm font-bold tracking-widest text-[#00ff88]">COMPLIANCE ONBOARDING</span>
        </div>
        <span className="text-[9px] text-[rgba(255,255,255,0.3)] uppercase tracking-wider">AIFMD II · DORA · UCITS · SFDR · CSSF</span>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {step < 5 && (
          <div className="flex items-center justify-center gap-2 mb-8 flex-wrap">
            {['Fund Identity', 'Strategy', 'Sustainability', 'Compliance'].map((label, i) => (
              <div key={i} className="flex items-center gap-2">
                <StepDot n={i+1} active={step === i+1} done={step > i+1} />
                <span className={`text-[10px] hidden sm:block ${step === i+1 ? 'text-[#00aaff]' : step > i+1 ? 'text-[#00ff88]' : 'text-[rgba(255,255,255,0.2)]'}`}>{label}</span>
                {i < 3 && <div className={`w-6 h-px ${step > i+1 ? 'bg-[#00ff88]' : 'bg-[rgba(255,255,255,0.1)]'}`} />}
              </div>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-lg font-bold">Fund Identity</h2>
            <Input value={profile.fund_name} onChange={v => set('fund_name', v)} label="Fund Name" placeholder="e.g. Acme Capital Luxembourg AIF" />
            <Input value={profile.manager_name} onChange={v => set('manager_name', v)} label="AIFM / Manager Name" placeholder="e.g. Acme Asset Management S.A." />
            <div className="grid grid-cols-2 gap-4">
              <Select value={profile.fund_type} onChange={v => set('fund_type', v)} label="Fund Type" options={[
                {value:'AIF',label:'AIF'},{value:'UCITS',label:'UCITS'},
                {value:'RAIF',label:'RAIF'},{value:'SIF',label:'SIF'},
              ]} />
              <Input value={profile.aum_eur_m} onChange={v => set('aum_eur_m', v)} label="AUM (€ millions)" placeholder="e.g. 250" type="number" />
            </div>
            <Select value={profile.asset_class} onChange={v => set('asset_class', v)} label="Primary Asset Class" options={[
              {value:'Equities',label:'Equities'},{value:'Fixed Income',label:'Fixed Income'},
              {value:'Real Estate',label:'Real Estate'},{value:'Private Equity',label:'Private Equity'},
              {value:'Hedge',label:'Hedge / Multi-Strategy'},{value:'Loan Origination',label:'Loan Origination'},
              {value:'Multi-Strategy',label:'Multi-Strategy'},
            ]} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-lg font-bold">Investment Strategy & Structure</h2>
            <div className="space-y-2">
              <label className="block text-[10px] text-[rgba(255,255,255,0.4)] uppercase tracking-wider">Fund Characteristics</label>
              <div className="flex flex-wrap gap-2">
                <Toggle value={profile.has_delegation} onChange={v => set('has_delegation', v)} label="Uses Delegation" />
                <Toggle value={profile.has_leverage} onChange={v => set('has_leverage', v)} label="Employs Leverage" />
                <Toggle value={profile.cross_border_marketing} onChange={v => set('cross_border_marketing', v)} label="Cross-Border Marketing" />
                <Toggle value={profile.has_custody_segregation} onChange={v => set('has_custody_segregation', v)} label="Custody Segregation" />
              </div>
            </div>
            <Select value={profile.lmt_status} onChange={v => set('lmt_status', v)} label="Liquidity Management Tools (LMT)" options={[
              {value:'none',label:'None implemented'},
              {value:'basic',label:'Basic (gates / notice periods only)'},
              {value:'full',label:'Full LMT suite (gates + swing pricing + fees)'},
            ]} />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-lg font-bold">Sustainability Profile (SFDR)</h2>
            <Select value={profile.sfdr_article} onChange={v => set('sfdr_article', v)} label="SFDR Classification" options={[
              {value:'6',label:'Article 6 — No sustainability objective'},
              {value:'8',label:'Article 8 — Promotes ESG characteristics'},
              {value:'9',label:'Article 9 — Sustainable investment objective'},
            ]} />
            <div className="space-y-2">
              <label className="block text-[10px] text-[rgba(255,255,255,0.4)] uppercase tracking-wider">PAI (Principal Adverse Impact)</label>
              <Toggle value={profile.pai_consideration} onChange={v => set('pai_consideration', v)} label="PAI indicators considered" />
              <p className="text-[10px] text-[rgba(255,255,255,0.3)]">
                {parseInt(profile.sfdr_article) >= 8
                  ? 'Article 8/9 funds: publish annual PAI statement with 18 mandatory indicators by June 30.'
                  : 'Article 6 funds: must explain why PAI are not considered.'}
              </p>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-lg font-bold">Current Compliance Maturity</h2>
            <Select value={profile.dora_maturity} onChange={v => set('dora_maturity', v)} label="DORA ICT Framework Maturity" options={[
              {value:'none',label:'None — no formal ICT risk framework'},
              {value:'basic',label:'Basic — some policies, no formal register'},
              {value:'advanced',label:'Advanced — full ICT risk framework + register'},
            ]} />
            <Select value={profile.aifmd_checklist} onChange={v => set('aifmd_checklist', v)} label="AIFMD II Self-Assessment Status" options={[
              {value:'not_started',label:'Not started'},
              {value:'partial',label:'Partial — some requirements mapped'},
              {value:'complete',label:'Complete — all 8 requirements addressed'},
            ]} />
          </div>
        )}

        {step === 5 && result && (
          <div className="space-y-6">
            <div className="border border-[rgba(0,255,136,0.2)] bg-[rgba(0,255,136,0.02)] rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[10px] text-[rgba(255,255,255,0.4)] uppercase tracking-wider mb-1">Compliance Gap Report</div>
                  <h2 className="text-lg font-bold">{result.fund_name}</h2>
                  <div className="text-xs text-[rgba(255,255,255,0.4)]">{result.fund_type} · €{result.aum_eur_m}M AUM</div>
                </div>
                <div className="text-center">
                  <div className="text-5xl font-black" style={{ color: gradeColor(result.grade) }}>{result.grade}</div>
                  <div className="text-xs text-[rgba(255,255,255,0.4)]">{result.score}/100</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[{label:'Critical',value:result.critical_count,color:'#ff3366'},{label:'High',value:result.high_count,color:'#ff6b35'},{label:'Total Gaps',value:result.total_gaps,color:'#ffaa00'}].map(s => (
                  <div key={s.label} className="border border-[rgba(255,255,255,0.07)] rounded p-2">
                    <div className="text-2xl font-black" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-[10px] text-[rgba(255,255,255,0.4)]">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {result.immediate_actions.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-[#ff3366] uppercase tracking-wider mb-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Immediate Actions</h3>
                <div className="space-y-2">
                  {result.immediate_actions.map((g, i) => (
                    <div key={i} className="p-3 border border-[rgba(255,51,102,0.25)] bg-[rgba(255,51,102,0.04)] rounded text-xs">
                      <div className="font-bold text-[rgba(255,255,255,0.9)]">{g.requirement}</div>
                      <div className="text-[#ff6b35] mt-1">{g.action}</div>
                      <div className="text-[rgba(255,255,255,0.3)] mt-0.5">Deadline: {g.deadline}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-[rgba(255,255,255,0.6)] uppercase tracking-wider flex items-center gap-1"><Shield className="w-3 h-3" /> All Gaps ({result.total_gaps})</h3>
                <div className="flex gap-1 flex-wrap">
                  {frameworks.map(fw => (
                    <button key={fw} onClick={() => setFilterFw(fw)}
                      className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${filterFw === fw ? 'border-[rgba(0,170,255,0.6)] text-[#00aaff] bg-[rgba(0,170,255,0.08)]' : 'border-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.35)]'}`}>
                      {fw === 'all' ? 'All' : fw}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                {visibleGaps.map((gap, i) => (
                  <GapCard key={i} gap={gap} expanded={expandedGaps.has(i)}
                    onToggle={() => setExpandedGaps(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })} />
                ))}
              </div>
            </div>

            <div className="flex gap-3 flex-wrap">
              <button onClick={downloadReport} className="flex items-center gap-2 px-4 py-2.5 bg-[rgba(0,255,136,0.08)] border border-[rgba(0,255,136,0.4)] text-[#00ff88] rounded text-sm font-bold hover:bg-[rgba(0,255,136,0.12)] transition-colors">
                <Download className="w-4 h-4" /> Download Report
              </button>
              <a href="/sfdr" className="flex items-center gap-2 px-4 py-2.5 border border-[rgba(0,170,255,0.3)] text-[#00aaff] rounded text-sm hover:bg-[rgba(0,170,255,0.08)] transition-colors">Generate SFDR →</a>
              <a href="/dora" className="flex items-center gap-2 px-4 py-2.5 border border-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.5)] rounded text-sm hover:border-[rgba(255,255,255,0.2)] transition-colors">DORA Register →</a>
              <button onClick={() => { setResult(null); setStep(1); setProfile(INITIAL) }}
                className="px-4 py-2.5 border border-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.4)] rounded text-sm hover:border-[rgba(255,255,255,0.2)] transition-colors">New Assessment</button>
            </div>

            <p className="text-[10px] text-[rgba(255,255,255,0.25)]">Report ID: {result.report_id} · Not a substitute for legal advice.</p>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 border border-[rgba(255,51,102,0.3)] bg-[rgba(255,51,102,0.05)] rounded text-sm text-[#ff3366] mt-4">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        {step < 5 && (
          <div className="flex justify-between mt-8">
            <button onClick={() => setStep(s => s - 1)} disabled={step === 1}
              className="flex items-center gap-1 px-4 py-2 border border-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.5)] rounded text-sm disabled:opacity-30 hover:border-[rgba(255,255,255,0.2)] transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            {step < 4 ? (
              <button onClick={() => setStep(s => s + 1)} disabled={step === 1 && !profile.fund_name.trim()}
                className="flex items-center gap-2 px-5 py-2 bg-[rgba(0,170,255,0.1)] border border-[rgba(0,170,255,0.5)] text-[#00aaff] rounded text-sm font-bold hover:bg-[rgba(0,170,255,0.15)] disabled:opacity-40 transition-colors">
                Next <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={runAssessment} disabled={loading}
                className="flex items-center gap-2 px-5 py-2 bg-[rgba(0,255,136,0.1)] border border-[rgba(0,255,136,0.5)] text-[#00ff88] rounded text-sm font-bold hover:bg-[rgba(0,255,136,0.15)] disabled:opacity-40 transition-colors">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</> : <><CheckCircle className="w-4 h-4" /> Generate Gap Report</>}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
