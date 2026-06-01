'use client'
import { useState } from 'react'
import { BASE } from '@/lib/api'
import { Plus, Trash2, TrendingUp, Shield, AlertTriangle, CheckCircle, Zap, ExternalLink } from 'lucide-react'

const FUND_TYPES = ['AIFM','UCITS ManCo','RAIF','SIF','Family Office']
const SFDR_ARTS = ['Article 6','Article 8','Article 9']

interface FundEntry { id: string; name: string; type: string; aum: string; sfdr: string }
interface FundResult { fund_name: string; fund_type: string; aum_eur_m: number; grade: string; score: number; dora_status: string; sfdr_status: string; aifmd_status: string; critical_count: number; high_count: number; top_gap: string; action_url: string }
interface PortfolioResult { portfolio_id: string; generated_at: string; total_funds: number; portfolio_grade: string; portfolio_score: number; funds: FundResult[]; portfolio_summary: string; critical_funds: string[] }

const gradeColor = (g: string) => g === 'A' ? '#00ff88' : g === 'B' ? '#00cc6a' : g === 'C' ? '#ffaa00' : g === 'D' ? '#ff7700' : '#ff3366'
const statusColor = (s: string) => s === 'compliant' ? '#00ff88' : s === 'partial' ? '#ffaa00' : '#ff3366'
const statusLabel = (s: string) => s === 'compliant' ? 'COMPLIANT' : s === 'partial' ? 'PARTIAL' : 'GAPS'

let _uid = 0
const uid = () => String(++_uid)

export default function PortfolioPage() {
  const [funds, setFunds] = useState<FundEntry[]>([{ id: uid(), name: '', type: 'AIFM', aum: '', sfdr: 'Article 8' }])
  const [result, setResult] = useState<PortfolioResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const addFund = () => setFunds(f => [...f, { id: uid(), name: '', type: 'AIFM', aum: '', sfdr: 'Article 8' }])
  const removeFund = (id: string) => setFunds(f => f.filter(x => x.id !== id))
  const setField = (id: string, k: keyof FundEntry, v: string) => setFunds(f => f.map(x => x.id === id ? { ...x, [k]: v } : x))
  const valid = funds.length > 0 && funds.every(f => f.name && f.aum)

  async function assess() {
    if (!valid) return
    setLoading(true); setError(''); setResult(null)
    try {
      const res = await fetch(`${BASE}/api/v1/portfolio/assess`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funds: funds.map(f => ({ fund_name: f.name, fund_type: f.type, aum_eur_m: parseFloat(f.aum), sfdr_article: f.sfdr })) })
      })
      if (!res.ok) throw new Error()
      setResult(await res.json())
    } catch { setError('Assessment failed — please try again.') }
    finally { setLoading(false) }
  }

  const inp = 'bg-[rgba(0,255,136,0.03)] border border-[rgba(0,255,136,0.2)] rounded px-2.5 py-2 text-[#00ff88] text-xs font-mono placeholder-[rgba(0,255,136,0.25)] focus:outline-none focus:border-[rgba(0,255,136,0.5)] transition-all'

  return (
    <div className="min-h-screen bg-[#050508] text-[#00ff88] font-mono overflow-x-hidden">
      <div className="scanline pointer-events-none fixed inset-0 z-50" />
      <div className="sticky top-0 z-40 flex items-center justify-between px-6 py-3 border-b border-[rgba(0,255,136,0.12)]" style={{ background: 'rgba(5,5,8,0.97)', backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
          <a href="/operator" className="font-bold tracking-[0.2em] text-sm uppercase hover:opacity-80 transition-opacity">Genesis Swarm</a>
          <span className="text-[rgba(0,255,136,0.4)] text-[10px] tracking-widest hidden sm:block">// Multi-Fund Portfolio Dashboard</span>
        </div>
        <a href="/operator" className="text-[9px] uppercase tracking-wider px-3 py-1.5 border border-[rgba(0,255,136,0.3)] text-[#00ff88] rounded hover:bg-[rgba(0,255,136,0.08)] transition-colors">← Dashboard</a>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {!result && (
          <div className="space-y-6">
            <div>
              <div className="text-[9px] uppercase tracking-[0.3em] text-[rgba(0,255,136,0.5)] mb-2">Enterprise · Multi-Fund View</div>
              <h1 className="text-3xl font-bold tracking-tight">Portfolio Compliance Dashboard</h1>
              <p className="text-[rgba(255,255,255,0.4)] text-sm mt-2 max-w-2xl">Add all your funds. Get a unified compliance view — grades, DORA/SFDR/AIFMD II status, critical gaps — across your entire portfolio in one screen.</p>
            </div>

            <div className="space-y-3">
              <div className="hidden sm:grid grid-cols-12 gap-2 px-3 text-[8px] uppercase tracking-widest text-[rgba(0,255,136,0.35)]">
                <div className="col-span-4">Fund name</div><div className="col-span-2">Type</div><div className="col-span-2">AUM (€M)</div><div className="col-span-3">SFDR</div><div className="col-span-1" />
              </div>
              {funds.map((f, i) => (
                <div key={f.id} className="grid grid-cols-12 gap-2 p-3 rounded" style={{ background: 'rgba(0,255,136,0.02)', border: '1px solid rgba(0,255,136,0.12)' }}>
                  <div className="col-span-12 sm:col-span-4">
                    <input className={inp + ' w-full'} placeholder={`Fund ${i+1} name…`} value={f.name} onChange={e => setField(f.id, 'name', e.target.value)} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <select className={inp + ' w-full cursor-pointer'} value={f.type} onChange={e => setField(f.id, 'type', e.target.value)}>
                      {FUND_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <input className={inp + ' w-full'} type="number" placeholder="500" value={f.aum} onChange={e => setField(f.id, 'aum', e.target.value)} />
                  </div>
                  <div className="col-span-3 sm:col-span-3">
                    <select className={inp + ' w-full cursor-pointer'} value={f.sfdr} onChange={e => setField(f.id, 'sfdr', e.target.value)}>
                      {SFDR_ARTS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <div className="col-span-1 flex items-center justify-center">
                    {funds.length > 1 && <button onClick={() => removeFund(f.id)} className="text-[rgba(255,51,102,0.5)] hover:text-[#ff3366] transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </div>
              ))}
              <button onClick={addFund} className="flex items-center gap-2 px-4 py-2 rounded text-[10px] uppercase tracking-wider transition-all" style={{ background: 'rgba(0,255,136,0.04)', border: '1px dashed rgba(0,255,136,0.25)', color: 'rgba(0,255,136,0.6)' }}>
                <Plus className="w-3.5 h-3.5" /> Add fund
              </button>
            </div>

            {error && <div className="text-[9px] text-[#ff3366] p-3 rounded" style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.3)' }}>{error}</div>}
            <button onClick={assess} disabled={!valid || loading} className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 rounded font-bold text-sm uppercase tracking-wider transition-all disabled:opacity-50"
              style={{ background: valid ? 'rgba(0,255,136,0.12)' : 'rgba(0,255,136,0.04)', border: `1px solid ${valid ? 'rgba(0,255,136,0.6)' : 'rgba(0,255,136,0.2)'}`, color: '#00ff88', boxShadow: valid ? '0 0 20px rgba(0,255,136,0.15)' : 'none' }}>
              {loading ? <><TrendingUp className="w-4 h-4 animate-pulse" /> Assessing portfolio…</> : <><TrendingUp className="w-4 h-4" /> Assess full portfolio</>}
            </button>
          </div>
        )}

        {result && (
          <div className="space-y-6">
            {/* Portfolio header */}
            <div className="p-6 rounded" style={{ background: 'rgba(0,255,136,0.03)', border: `2px solid ${gradeColor(result.portfolio_grade)}33`, boxShadow: `0 0 40px ${gradeColor(result.portfolio_grade)}11` }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.3em] text-[rgba(0,255,136,0.4)] mb-1">Portfolio Assessment · {result.total_funds} funds</div>
                  <div className="text-[rgba(255,255,255,0.6)] text-sm leading-relaxed max-w-2xl">{result.portfolio_summary}</div>
                </div>
                <div className="text-center ml-6 shrink-0">
                  <div className="text-5xl font-black" style={{ color: gradeColor(result.portfolio_grade) }}>{result.portfolio_grade}</div>
                  <div className="text-[8px] uppercase tracking-wider text-[rgba(255,255,255,0.3)]">{result.portfolio_score}/100</div>
                </div>
              </div>
              {result.critical_funds.length > 0 && (
                <div className="flex items-center gap-2 p-3 rounded" style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.25)' }}>
                  <AlertTriangle className="w-4 h-4 text-[#ff3366] shrink-0" />
                  <span className="text-[9px] text-[rgba(255,255,255,0.6)]">Critical attention: <span className="text-[#ff3366] font-bold">{result.critical_funds.join(', ')}</span></span>
                </div>
              )}
            </div>

            {/* Fund cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {result.funds.map(fund => (
                <div key={fund.fund_name} className="p-4 rounded space-y-3" style={{ background: 'rgba(0,255,136,0.02)', border: `1px solid ${gradeColor(fund.grade)}33` }}>
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white truncate">{fund.fund_name}</div>
                      <div className="text-[8px] text-[rgba(255,255,255,0.3)] uppercase tracking-wider mt-0.5">{fund.fund_type} · €{fund.aum_eur_m}M</div>
                    </div>
                    <div className="text-3xl font-black ml-2 shrink-0" style={{ color: gradeColor(fund.grade) }}>{fund.grade}</div>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[{ label: 'DORA', status: fund.dora_status }, { label: 'SFDR', status: fund.sfdr_status }, { label: 'AIFMD II', status: fund.aifmd_status }].map(({ label, status }) => (
                      <div key={label} className="text-center p-1.5 rounded" style={{ background: `${statusColor(status)}0d`, border: `1px solid ${statusColor(status)}33` }}>
                        <div className="text-[7px] font-bold uppercase" style={{ color: statusColor(status) }}>{statusLabel(status)}</div>
                        <div className="text-[7px] text-[rgba(255,255,255,0.3)] mt-0.5">{label}</div>
                      </div>
                    ))}
                  </div>
                  {fund.critical_count > 0 && (
                    <div className="text-[8px] text-[rgba(255,255,255,0.5)] leading-relaxed">
                      <span className="text-[#ff3366] font-bold">{fund.critical_count} critical</span>{fund.high_count > 0 && <span>, <span className="text-[#ffaa00]">{fund.high_count} high</span></span>} gaps · {fund.top_gap}
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <a href="/onboard" className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[8px] uppercase tracking-wider transition-all" style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.25)', color: '#00ff88' }}>
                      <ExternalLink className="w-2.5 h-2.5" /> Full assessment
                    </a>
                    <a href="/board-report" className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[8px] uppercase tracking-wider transition-all" style={{ background: 'rgba(0,170,255,0.06)', border: '1px solid rgba(0,170,255,0.25)', color: '#00aaff' }}>
                      Board report
                    </a>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setResult(null)} className="px-5 py-2.5 rounded text-sm font-bold uppercase tracking-wider" style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88' }}>← Edit funds</button>
              <a href="/trial" className="flex items-center gap-2 px-5 py-2.5 rounded text-sm font-bold uppercase tracking-wider" style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.5)', color: '#00ff88' }}><Zap className="w-4 h-4" /> Start pilot</a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
