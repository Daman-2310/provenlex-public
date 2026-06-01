'use client'
import { useState } from 'react'
import { BASE } from '@/lib/api'
import { Shield, AlertTriangle, CheckCircle, XCircle, Clock, Zap, ChevronDown, ChevronUp } from 'lucide-react'

interface AuditCriterion { id: string; category: string; requirement: string; article: string; result: 'pass'|'fail'|'partial'; finding: string; remediation: string; deadline?: string }
interface AuditResult {
  fund_name: string; simulated_at: string; simulation_id: string
  readiness_score: number; readiness_grade: 'A'|'B'|'C'|'D'|'F'
  pass_count: number; fail_count: number; partial_count: number; total: number
  criteria: AuditCriterion[]; critical_gaps: string[]; remediation_roadmap: { week: string; action: string; priority: string }[]
  verdict: string
}

const FUND_TYPES = ['AIFM','UCITS ManCo','RAIF','SIF']

export default function AuditSimPage() {
  const [form, setForm] = useState({ fund_name: '', fund_type: 'AIFM', aum_eur_m: '', has_dora_register: false, has_ict_policy: false, has_incident_log: false, has_lmt: false, has_delegation: false, has_sfdr_disclosure: false, has_depositary_agreement: false, has_aml_policy: false })
  const [result, setResult] = useState<AuditResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all'|'fail'|'partial'|'pass'>('all')

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const toggle = (k: string) => () => setForm(f => ({ ...f, [k]: !(f as Record<string,unknown>)[k] }))
  const valid = !!(form.fund_name && form.aum_eur_m)

  async function simulate() {
    if (!valid) return
    setLoading(true); setError(''); setResult(null)
    try {
      const res = await fetch(`${BASE}/api/v1/audit/simulate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, aum_eur_m: parseFloat(form.aum_eur_m) })
      })
      if (!res.ok) throw new Error()
      setResult(await res.json())
    } catch { setError('Simulation failed — please try again.') }
    finally { setLoading(false) }
  }

  const inputCls = 'w-full bg-[rgba(0,255,136,0.03)] border border-[rgba(0,255,136,0.2)] rounded px-3 py-2.5 text-[#00ff88] text-sm font-mono placeholder-[rgba(0,255,136,0.25)] focus:outline-none focus:border-[rgba(0,255,136,0.6)] transition-all'
  const labelCls = 'block text-[9px] uppercase tracking-widest text-[rgba(0,255,136,0.5)] mb-1.5'

  const gradeColor = (g?: string) => g === 'A' ? '#00ff88' : g === 'B' ? '#00cc6a' : g === 'C' ? '#ffaa00' : g === 'D' ? '#ff7700' : '#ff3366'
  const resultColor = (r: string) => r === 'pass' ? '#00ff88' : r === 'partial' ? '#ffaa00' : '#ff3366'
  const ResultIcon = ({ r }: { r: string }) => r === 'pass' ? <CheckCircle className="w-4 h-4 text-[#00ff88]" /> : r === 'partial' ? <Clock className="w-4 h-4 text-[#ffaa00]" /> : <XCircle className="w-4 h-4 text-[#ff3366]" />

  const filtered = result?.criteria.filter(c => filter === 'all' || c.result === filter) ?? []
  const categories = [...new Set(result?.criteria.map(c => c.category) ?? [])]

  return (
    <div className="min-h-screen bg-[#050508] text-[#00ff88] font-mono overflow-x-hidden">
      <div className="scanline pointer-events-none fixed inset-0 z-50" />
      <div className="sticky top-0 z-40 flex items-center justify-between px-6 py-3 border-b border-[rgba(0,255,136,0.12)]" style={{ background: 'rgba(5,5,8,0.97)', backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#ff3366] animate-pulse" />
          <a href="/operator" className="font-bold tracking-[0.2em] text-sm uppercase hover:opacity-80 transition-opacity">Genesis Swarm</a>
          <span className="text-[rgba(0,255,136,0.4)] text-[10px] tracking-widest hidden sm:block">// CSSF Audit Readiness Simulator</span>
        </div>
        <a href="/operator" className="text-[9px] uppercase tracking-wider px-3 py-1.5 border border-[rgba(0,255,136,0.3)] text-[#00ff88] rounded hover:bg-[rgba(0,255,136,0.08)] transition-colors">← Dashboard</a>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {!result && (
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="text-[9px] uppercase tracking-[0.3em] text-[rgba(255,51,102,0.7)]">CSSF Circular 22/816 · DORA 2022/2554 · AIFMD II 2024/927</div>
              <h1 className="text-3xl font-bold tracking-tight">CSSF Audit Readiness Simulator</h1>
              <p className="text-[rgba(255,255,255,0.4)] text-sm leading-relaxed max-w-2xl">What happens if CSSF knocks on your door tomorrow? Run a simulated inspection across 40+ criteria. Get a pass/fail verdict with article references and a remediation roadmap.</p>
            </div>
            <div className="p-6 rounded space-y-5" style={{ background: 'rgba(255,51,102,0.02)', border: '1px solid rgba(255,51,102,0.15)' }}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2"><label className={labelCls}>Fund name *</label><input className={inputCls} placeholder="Luxembourg Alpha AIFM S.A." value={form.fund_name} onChange={set('fund_name')} /></div>
                <div><label className={labelCls}>Fund type</label><select className={inputCls + ' cursor-pointer'} value={form.fund_type} onChange={set('fund_type')}>{FUND_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div><label className={labelCls}>AUM (€M) *</label><input className={inputCls} type="number" placeholder="750" value={form.aum_eur_m} onChange={set('aum_eur_m')} /></div>
              </div>
              <div>
                <div className={labelCls}>Current compliance posture — tick what you have</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                  {[
                    { key: 'has_dora_register', label: 'DORA ICT Register' },
                    { key: 'has_ict_policy', label: 'ICT Risk Policy' },
                    { key: 'has_incident_log', label: 'Incident Log' },
                    { key: 'has_lmt', label: 'LMT Framework' },
                    { key: 'has_delegation', label: 'Delegation Docs' },
                    { key: 'has_sfdr_disclosure', label: 'SFDR Disclosures' },
                    { key: 'has_depositary_agreement', label: 'Depositary Agreement' },
                    { key: 'has_aml_policy', label: 'AML/KYC Policy' },
                  ].map(({ key, label }) => {
                    const checked = (form as Record<string,unknown>)[key] as boolean
                    return (
                      <button key={key} onClick={toggle(key)} className="flex items-center gap-2 p-2.5 rounded text-left transition-all text-[9px] uppercase tracking-wider"
                        style={{ background: checked ? 'rgba(0,255,136,0.08)' : 'rgba(0,255,136,0.02)', border: `1px solid ${checked ? 'rgba(0,255,136,0.4)' : 'rgba(0,255,136,0.12)'}`, color: checked ? '#00ff88' : 'rgba(0,255,136,0.4)' }}>
                        <span className="w-3 h-3 rounded-sm border flex items-center justify-center shrink-0" style={{ borderColor: checked ? '#00ff88' : 'rgba(0,255,136,0.3)', background: checked ? 'rgba(0,255,136,0.2)' : 'transparent' }}>
                          {checked && <span className="text-[8px] leading-none"></span>}
                        </span>
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
              {error && <div className="text-[9px] text-[#ff3366] p-3 rounded" style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.3)' }}>{error}</div>}
              <button onClick={simulate} disabled={!valid || loading} className="w-full flex items-center justify-center gap-2 py-3.5 rounded font-bold text-sm uppercase tracking-wider transition-all disabled:opacity-50"
                style={{ background: valid ? 'rgba(255,51,102,0.12)' : 'rgba(255,51,102,0.04)', border: `1px solid ${valid ? 'rgba(255,51,102,0.6)' : 'rgba(255,51,102,0.2)'}`, color: '#ff3366', boxShadow: valid ? '0 0 20px rgba(255,51,102,0.15)' : 'none' }}>
                {loading ? <><Shield className="w-4 h-4 animate-pulse" /> Running CSSF simulation…</> : <><AlertTriangle className="w-4 h-4" /> Run CSSF audit simulation</>}
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-6">
            {/* Verdict */}
            <div className="p-6 rounded space-y-4" style={{ background: 'rgba(0,0,0,0.4)', border: `2px solid ${gradeColor(result.readiness_grade)}`, boxShadow: `0 0 40px ${gradeColor(result.readiness_grade)}22` }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.3em] text-[rgba(255,255,255,0.4)] mb-1">CSSF Audit Simulation — {result.fund_name}</div>
                  <h2 className="text-xl font-bold text-white">{result.verdict}</h2>
                  <div className="text-[rgba(255,255,255,0.4)] text-xs mt-1">{new Date(result.simulated_at).toLocaleString()} · ID: {result.simulation_id}</div>
                </div>
                <div className="text-center">
                  <div className="text-6xl font-black" style={{ color: gradeColor(result.readiness_grade) }}>{result.readiness_grade}</div>
                  <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.3)]">{result.readiness_score}/100</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[rgba(255,255,255,0.08)]">
                {[{ label: 'Pass', count: result.pass_count, color: '#00ff88' }, { label: 'Partial', count: result.partial_count, color: '#ffaa00' }, { label: 'Fail', count: result.fail_count, color: '#ff3366' }].map(({ label, count, color }) => (
                  <div key={label} className="text-center p-3 rounded" style={{ background: `rgba(${color === '#00ff88' ? '0,255,136' : color === '#ffaa00' ? '255,170,0' : '255,51,102'},0.06)`, border: `1px solid ${color}33` }}>
                    <div className="text-2xl font-bold" style={{ color }}>{count}</div>
                    <div className="text-[8px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Critical gaps */}
            {result.critical_gaps.length > 0 && (
              <div className="p-4 rounded space-y-2" style={{ background: 'rgba(255,51,102,0.06)', border: '1px solid rgba(255,51,102,0.3)' }}>
                <div className="flex items-center gap-2 mb-3"><AlertTriangle className="w-4 h-4 text-[#ff3366]" /><span className="text-[10px] font-bold uppercase tracking-wider text-[#ff3366]">Critical gaps — immediate action required</span></div>
                {result.critical_gaps.map((g, i) => <div key={i} className="flex items-start gap-2 text-[9px] text-[rgba(255,255,255,0.6)]"><span className="text-[#ff3366] shrink-0"></span>{g}</div>)}
              </div>
            )}

            {/* Criteria table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[9px] uppercase tracking-[0.2em] text-[rgba(0,255,136,0.5)]">Inspection criteria ({result.total})</div>
                <div className="flex gap-1">
                  {(['all','fail','partial','pass'] as const).map(f => (
                    <button key={f} onClick={() => setFilter(f)} className="px-2.5 py-1 rounded text-[8px] uppercase tracking-wider transition-all"
                      style={{ background: filter === f ? 'rgba(0,255,136,0.12)' : 'transparent', border: `1px solid ${filter === f ? 'rgba(0,255,136,0.5)' : 'rgba(0,255,136,0.15)'}`, color: filter === f ? '#00ff88' : 'rgba(0,255,136,0.4)' }}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                {categories.map(cat => {
                  const catItems = filtered.filter(c => c.category === cat)
                  if (catItems.length === 0) return null
                  return (
                    <div key={cat}>
                      <div className="text-[8px] uppercase tracking-widest text-[rgba(0,255,136,0.35)] px-2 py-1">{cat}</div>
                      {catItems.map(c => (
                        <div key={c.id} className="rounded transition-all" style={{ background: 'rgba(0,255,136,0.02)', border: `1px solid ${resultColor(c.result)}22`, marginBottom: '2px' }}>
                          <button className="w-full flex items-center gap-3 px-3 py-2.5 text-left" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                            <ResultIcon r={c.result} />
                            <div className="flex-1 min-w-0">
                              <div className="text-[9px] font-bold text-[rgba(255,255,255,0.8)] truncate">{c.requirement}</div>
                              <div className="text-[8px] text-[rgba(255,255,255,0.3)]">{c.article}</div>
                            </div>
                            <span className="text-[8px] font-bold uppercase px-2 py-0.5 rounded shrink-0" style={{ background: `${resultColor(c.result)}15`, color: resultColor(c.result) }}>{c.result}</span>
                            {expanded === c.id ? <ChevronUp className="w-3 h-3 text-[rgba(255,255,255,0.3)] shrink-0" /> : <ChevronDown className="w-3 h-3 text-[rgba(255,255,255,0.3)] shrink-0" />}
                          </button>
                          {expanded === c.id && (
                            <div className="px-4 pb-3 space-y-2 border-t border-[rgba(255,255,255,0.06)]">
                              <div className="text-[8px] text-[rgba(255,255,255,0.5)] leading-relaxed pt-2">{c.finding}</div>
                              {c.result !== 'pass' && <div className="flex items-start gap-1.5 text-[8px] text-[#ffaa00]"><span className="shrink-0">→</span>{c.remediation}{c.deadline && <span className="ml-1 text-[rgba(255,255,255,0.3)]">· Due: {c.deadline}</span>}</div>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Roadmap */}
            <div className="p-5 rounded space-y-3" style={{ background: 'rgba(0,170,255,0.04)', border: '1px solid rgba(0,170,255,0.2)' }}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#00aaff]">Remediation Roadmap</div>
              <div className="space-y-2">
                {result.remediation_roadmap.map((r, i) => {
                  const pc = r.priority === 'critical' ? '#ff3366' : r.priority === 'high' ? '#ffaa00' : '#00aaff'
                  return (
                    <div key={i} className="flex items-start gap-3 text-[9px]">
                      <span className="text-[rgba(255,255,255,0.3)] w-16 shrink-0">{r.week}</span>
                      <span className="px-1.5 py-0.5 rounded text-[7px] uppercase font-bold shrink-0" style={{ background: `${pc}15`, color: pc }}>{r.priority}</span>
                      <span className="text-[rgba(255,255,255,0.6)]">{r.action}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setResult(null)} className="px-5 py-2.5 rounded text-sm font-bold uppercase tracking-wider" style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88' }}>← New simulation</button>
              <a href="/trial" className="flex items-center gap-2 px-5 py-2.5 rounded text-sm font-bold uppercase tracking-wider" style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.5)', color: '#00ff88' }}><Zap className="w-4 h-4" /> Get help fixing gaps</a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
