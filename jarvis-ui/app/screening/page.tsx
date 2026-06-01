'use client'
import { useState } from 'react'
import { BASE } from '@/lib/api'
import { Plus, Trash2, Search, AlertTriangle, CheckCircle, Clock, Shield } from 'lucide-react'

const ENTITY_TYPES = ['individual', 'corporate', 'trust', 'fund']
const LISTS = ['OFAC SDN', 'EU Consolidated', 'UN Consolidated']

interface Entity { id: string; name: string; type: string; nationality: string; identifier: string }
interface Hit { list: string; match_type: string; confidence: number; matched_term: string; note: string }
interface EntityResult { name: string; entity_type: string; nationality: string; risk_level: string; hits: Hit[]; recommendation: string }
interface ScreeningResult { screening_id: string; screened_at: string; total: number; high_count: number; review_count: number; clear_count: number; results: EntityResult[]; lists_checked: string[]; methodology: string; regulatory_basis: string }

const riskColor = (r: string) => r === 'high' ? '#ff3366' : r === 'review' ? '#ffaa00' : '#00ff88'
const riskBg = (r: string) => r === 'high' ? 'rgba(255,51,102,0.08)' : r === 'review' ? 'rgba(255,170,0,0.08)' : 'rgba(0,255,136,0.05)'
const riskBorder = (r: string) => r === 'high' ? 'rgba(255,51,102,0.35)' : r === 'review' ? 'rgba(255,170,0,0.35)' : 'rgba(0,255,136,0.25)'
const RiskIcon = ({ r }: { r: string }) => r === 'high' ? <AlertTriangle className="w-4 h-4" /> : r === 'review' ? <Clock className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />

let _uid = 0
const uid = () => String(++_uid)

export default function ScreeningPage() {
  const [entities, setEntities] = useState<Entity[]>([{ id: uid(), name: '', type: 'individual', nationality: '', identifier: '' }])
  const [selectedLists, setSelectedLists] = useState<string[]>([...LISTS])
  const [result, setResult] = useState<ScreeningResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const add = () => setEntities(e => [...e, { id: uid(), name: '', type: 'individual', nationality: '', identifier: '' }])
  const remove = (id: string) => setEntities(e => e.filter(x => x.id !== id))
  const set = (id: string, k: keyof Entity, v: string) => setEntities(e => e.map(x => x.id === id ? { ...x, [k]: v } : x))
  const toggleList = (l: string) => setSelectedLists(s => s.includes(l) ? s.filter(x => x !== l) : [...s, l])
  const valid = entities.length > 0 && entities.every(e => e.name) && selectedLists.length > 0

  async function screen() {
    if (!valid) return
    setLoading(true); setError(''); setResult(null)
    try {
      const res = await fetch(`${BASE}/api/v1/screening/check`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entities: entities.map(e => ({ name: e.name, entity_type: e.type, nationality: e.nationality, identifier: e.identifier })), lists: selectedLists })
      })
      if (!res.ok) throw new Error()
      setResult(await res.json())
    } catch { setError('Screening failed — please try again.') }
    finally { setLoading(false) }
  }

  const inp = 'bg-[rgba(0,255,136,0.03)] border border-[rgba(0,255,136,0.18)] rounded px-2.5 py-2 text-[#00ff88] text-xs font-mono placeholder-[rgba(0,255,136,0.25)] focus:outline-none focus:border-[rgba(0,255,136,0.5)] transition-all w-full'

  return (
    <div className="min-h-screen bg-[#050508] text-[#00ff88] font-mono overflow-x-hidden">
      <div className="scanline pointer-events-none fixed inset-0 z-50" />
      <div className="sticky top-0 z-40 flex items-center justify-between px-6 py-3 border-b border-[rgba(0,255,136,0.12)]" style={{ background: 'rgba(5,5,8,0.97)', backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
          <a href="/operator" className="font-bold tracking-[0.2em] text-sm uppercase hover:opacity-80">Genesis Swarm</a>
          <span className="text-[rgba(0,255,136,0.4)] text-[10px] tracking-widest hidden sm:block">// AML · Sanctions Screener</span>
        </div>
        <a href="/operator" className="text-[9px] uppercase tracking-wider px-3 py-1.5 border border-[rgba(0,255,136,0.3)] text-[#00ff88] rounded hover:bg-[rgba(0,255,136,0.08)] transition-colors">← Dashboard</a>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {!result ? (
          <div className="space-y-6">
            <div>
              <div className="text-[9px] uppercase tracking-[0.3em] text-[rgba(0,255,136,0.5)] mb-2">AML · 4AMLD · FATF Compliance</div>
              <h1 className="text-3xl font-bold tracking-tight">AML / Sanctions Screener</h1>
              <p className="text-[rgba(255,255,255,0.4)] text-sm mt-2 max-w-2xl">Screen investors, counterparties, and beneficial owners against OFAC SDN, EU Consolidated, and UN Consolidated sanctions lists. Get instant MLRO-ready reports.</p>
            </div>

            {/* Screening lists */}
            <div>
              <div className="text-[9px] uppercase tracking-widest text-[rgba(0,255,136,0.4)] mb-3">Screening lists</div>
              <div className="flex flex-wrap gap-2">
                {LISTS.map(l => (
                  <button key={l} onClick={() => toggleList(l)} className="flex items-center gap-2 px-3 py-1.5 rounded text-[10px] uppercase tracking-wider font-bold transition-all"
                    style={{ background: selectedLists.includes(l) ? 'rgba(0,255,136,0.12)' : 'rgba(0,255,136,0.02)', border: `1px solid ${selectedLists.includes(l) ? 'rgba(0,255,136,0.5)' : 'rgba(0,255,136,0.18)'}`, color: selectedLists.includes(l) ? '#00ff88' : 'rgba(0,255,136,0.4)' }}>
                    <Shield className="w-3 h-3" /> {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Entity list */}
            <div className="space-y-3">
              <div className="hidden sm:grid grid-cols-12 gap-2 px-3 text-[8px] uppercase tracking-widest text-[rgba(0,255,136,0.35)]">
                <div className="col-span-4">Full name / entity</div><div className="col-span-2">Type</div><div className="col-span-3">Nationality</div><div className="col-span-2">Passport / LEI</div><div className="col-span-1" />
              </div>
              {entities.map((e, i) => (
                <div key={e.id} className="grid grid-cols-12 gap-2 p-3 rounded" style={{ background: 'rgba(0,255,136,0.02)', border: '1px solid rgba(0,255,136,0.12)' }}>
                  <div className="col-span-12 sm:col-span-4"><input className={inp} placeholder={`Entity ${i+1} name…`} value={e.name} onChange={x => set(e.id,'name',x.target.value)} /></div>
                  <div className="col-span-4 sm:col-span-2">
                    <select className={inp + ' cursor-pointer'} value={e.type} onChange={x => set(e.id,'type',x.target.value)}>
                      {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="col-span-4 sm:col-span-3"><input className={inp} placeholder="Nationality / country" value={e.nationality} onChange={x => set(e.id,'nationality',x.target.value)} /></div>
                  <div className="col-span-3 sm:col-span-2"><input className={inp} placeholder="ID / LEI" value={e.identifier} onChange={x => set(e.id,'identifier',x.target.value)} /></div>
                  <div className="col-span-1 flex items-center justify-center">
                    {entities.length > 1 && <button onClick={() => remove(e.id)} className="text-[rgba(255,51,102,0.4)] hover:text-[#ff3366] transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </div>
              ))}
              <button onClick={add} className="flex items-center gap-2 px-4 py-2 rounded text-[10px] uppercase tracking-wider transition-all" style={{ background: 'rgba(0,255,136,0.04)', border: '1px dashed rgba(0,255,136,0.25)', color: 'rgba(0,255,136,0.6)' }}>
                <Plus className="w-3.5 h-3.5" /> Add entity
              </button>
            </div>

            {error && <div className="text-[9px] text-[#ff3366] p-3 rounded" style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.3)' }}>{error}</div>}
            <button onClick={screen} disabled={!valid || loading} className="flex items-center gap-2 px-8 py-3.5 rounded font-bold text-sm uppercase tracking-wider transition-all disabled:opacity-50"
              style={{ background: valid ? 'rgba(0,255,136,0.12)' : 'rgba(0,255,136,0.04)', border: `1px solid ${valid ? 'rgba(0,255,136,0.6)' : 'rgba(0,255,136,0.2)'}`, color: '#00ff88', boxShadow: valid ? '0 0 20px rgba(0,255,136,0.15)' : 'none' }}>
              {loading ? <><Search className="w-4 h-4 animate-pulse" /> Screening…</> : <><Search className="w-4 h-4" /> Run screening</>}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary bar */}
            <div className="p-5 rounded grid grid-cols-2 sm:grid-cols-4 gap-4" style={{ background: 'rgba(0,255,136,0.02)', border: '1px solid rgba(0,255,136,0.18)' }}>
              <div><div className="text-[8px] uppercase tracking-widest text-[rgba(0,255,136,0.4)] mb-1">Screening ID</div><div className="text-xs font-bold text-white">{result.screening_id}</div></div>
              <div><div className="text-[8px] uppercase tracking-widest text-[rgba(255,51,102,0.6)] mb-1">High risk</div><div className="text-2xl font-black text-[#ff3366]">{result.high_count}</div></div>
              <div><div className="text-[8px] uppercase tracking-widest text-[rgba(255,170,0,0.6)] mb-1">Review</div><div className="text-2xl font-black text-[#ffaa00]">{result.review_count}</div></div>
              <div><div className="text-[8px] uppercase tracking-widest text-[rgba(0,255,136,0.6)] mb-1">Clear</div><div className="text-2xl font-black text-[#00ff88]">{result.clear_count}</div></div>
            </div>

            {/* Individual results */}
            <div className="space-y-3">
              {result.results.map((r, i) => (
                <div key={i} className="p-4 rounded space-y-3" style={{ background: riskBg(r.risk_level), border: `1px solid ${riskBorder(r.risk_level)}` }}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1" style={{ color: riskColor(r.risk_level) }}>
                        <RiskIcon r={r.risk_level} />
                        <span className="font-bold text-sm text-white">{r.name}</span>
                        <span className="text-[8px] uppercase tracking-wider px-2 py-0.5 rounded font-bold" style={{ background: `${riskColor(r.risk_level)}22`, color: riskColor(r.risk_level) }}>{r.risk_level}</span>
                      </div>
                      <div className="text-[8px] text-[rgba(255,255,255,0.35)] uppercase tracking-wider">{r.entity_type}{r.nationality ? ` · ${r.nationality}` : ''}</div>
                    </div>
                  </div>
                  <div className="text-[9px] text-[rgba(255,255,255,0.7)] leading-relaxed p-2.5 rounded" style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${riskBorder(r.risk_level)}` }}>
                    {r.recommendation}
                  </div>
                  {r.hits.length > 0 && (
                    <div className="space-y-1.5">
                      {r.hits.map((h, j) => (
                        <div key={j} className="flex items-start gap-2 text-[8px] text-[rgba(255,255,255,0.5)]">
                          <span className="text-[rgba(255,170,0,0.8)] shrink-0 mt-0.5">→</span>
                          <span><span className="font-bold text-[rgba(255,255,255,0.7)]">{h.list}</span> · {h.match_type} · confidence {Math.round(h.confidence * 100)}% · {h.note}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="text-[7px] text-[rgba(255,255,255,0.2)] leading-relaxed p-3 rounded" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-[rgba(0,255,136,0.4)] font-bold">Methodology:</span> {result.methodology}<br />
              <span className="text-[rgba(0,255,136,0.4)] font-bold">Regulatory basis:</span> {result.regulatory_basis}
            </div>

            <button onClick={() => setResult(null)} className="px-5 py-2.5 rounded text-sm font-bold uppercase tracking-wider" style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88' }}>← New screening</button>
          </div>
        )}
      </div>
    </div>
  )
}
