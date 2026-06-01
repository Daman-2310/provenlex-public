'use client'
import { useState } from 'react'
import { BASE } from '@/lib/api'
import { FileText, CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'

const REGULATIONS = ['DORA', 'SFDR', 'AIFMD II', 'UCITS', 'ALL']
const FUND_TYPES = ['AIFM', 'UCITS ManCo', 'RAIF', 'SIF', 'Family Office']

interface AnalysisItem { regulation: string; requirement: string; status: 'found' | 'missing'; matched_keyword: string | null; keywords_checked: string[] }
interface DocResult { check_id: string; fund_name: string; regulation: string; word_count: number; coverage_pct: number; coverage_grade: string; requirements_checked: number; found_count: number; missing_count: number; analysis: AnalysisItem[]; top_recommendations: string[]; verdict: string }

const gradeColor = (g: string) => g === 'A' ? '#00ff88' : g === 'B' ? '#00cc6a' : g === 'C' ? '#ffaa00' : g === 'D' ? '#ff7700' : '#ff3366'
const StatusIcon = ({ s }: { s: string }) => s === 'found' ? <CheckCircle className="w-3.5 h-3.5 text-[#00ff88]" /> : <XCircle className="w-3.5 h-3.5 text-[#ff3366]" />

const PLACEHOLDER = `Example: paste your fund prospectus, DORA ICT policy, or SFDR pre-contractual disclosure here.

The system will scan for required keywords and sections mandated by the selected regulation and tell you what's covered and what's missing.

Try typing: "ICT risk management framework... incident classification... SFDR pre-contractual disclosure Article 8..."`

export default function DocCheckPage() {
  const [text, setText] = useState('')
  const [regulation, setRegulation] = useState('DORA')
  const [fundType, setFundType] = useState('AIFM')
  const [fundName, setFundName] = useState('')
  const [result, setResult] = useState<DocResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const toggleExpand = (i: number) => setExpanded(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })

  const valid = text.trim().length > 50

  async function check() {
    if (!valid) return
    setLoading(true); setError(''); setResult(null)
    try {
      const res = await fetch(`${BASE}/api/v1/doc/check`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_text: text, regulation, fund_type: fundType, fund_name: fundName || 'Fund' })
      })
      if (!res.ok) throw new Error()
      setResult(await res.json())
    } catch { setError('Analysis failed — please try again.') }
    finally { setLoading(false) }
  }

  const inp = 'bg-[rgba(0,255,136,0.03)] border border-[rgba(0,255,136,0.18)] rounded px-3 py-2 text-[#00ff88] text-xs font-mono placeholder-[rgba(0,255,136,0.25)] focus:outline-none focus:border-[rgba(0,255,136,0.5)] transition-all'

  return (
    <div className="min-h-screen bg-[#050508] text-[#00ff88] font-mono overflow-x-hidden">
      <div className="scanline pointer-events-none fixed inset-0 z-50" />
      <div className="sticky top-0 z-40 flex items-center justify-between px-6 py-3 border-b border-[rgba(0,255,136,0.12)]" style={{ background: 'rgba(5,5,8,0.97)', backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
          <a href="/operator" className="font-bold tracking-[0.2em] text-sm uppercase hover:opacity-80">Genesis Swarm</a>
          <span className="text-[rgba(0,255,136,0.4)] text-[10px] tracking-widest hidden sm:block">// Regulatory Document Checker</span>
        </div>
        <a href="/operator" className="text-[9px] uppercase tracking-wider px-3 py-1.5 border border-[rgba(0,255,136,0.3)] text-[#00ff88] rounded hover:bg-[rgba(0,255,136,0.08)] transition-colors">← Dashboard</a>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {!result ? (
          <div className="space-y-6">
            <div>
              <div className="text-[9px] uppercase tracking-[0.3em] text-[rgba(0,255,136,0.5)] mb-2">DORA · SFDR · AIFMD II · UCITS</div>
              <h1 className="text-3xl font-bold tracking-tight">Regulatory Document Checker</h1>
              <p className="text-[rgba(255,255,255,0.4)] text-sm mt-2 max-w-2xl">Paste any fund document — prospectus, ICT policy, SFDR disclosure, AIF disclosure. Instantly see which regulatory requirements are covered and which are missing.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[8px] uppercase tracking-widest text-[rgba(0,255,136,0.4)] mb-1.5">Regulation</label>
                <select className={inp + ' w-full cursor-pointer'} value={regulation} onChange={e => setRegulation(e.target.value)}>
                  {REGULATIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[8px] uppercase tracking-widest text-[rgba(0,255,136,0.4)] mb-1.5">Fund type</label>
                <select className={inp + ' w-full cursor-pointer'} value={fundType} onChange={e => setFundType(e.target.value)}>
                  {FUND_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[8px] uppercase tracking-widest text-[rgba(0,255,136,0.4)] mb-1.5">Fund name (optional)</label>
                <input className={inp + ' w-full'} placeholder="Acme Capital AIFM" value={fundName} onChange={e => setFundName(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="block text-[8px] uppercase tracking-widest text-[rgba(0,255,136,0.4)] mb-1.5">Document text</label>
              <textarea
                className={inp + ' w-full resize-none leading-relaxed'}
                rows={14}
                placeholder={PLACEHOLDER}
                value={text}
                onChange={e => setText(e.target.value)}
              />
              <div className="flex justify-between mt-1">
                <span className="text-[7px] text-[rgba(0,255,136,0.25)]">Minimum 50 characters</span>
                <span className="text-[7px] text-[rgba(0,255,136,0.35)]">{text.split(/\s+/).filter(Boolean).length} words</span>
              </div>
            </div>

            {error && <div className="text-[9px] text-[#ff3366] p-3 rounded" style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.3)' }}>{error}</div>}
            <button onClick={check} disabled={!valid || loading} className="flex items-center gap-2 px-8 py-3.5 rounded font-bold text-sm uppercase tracking-wider transition-all disabled:opacity-50"
              style={{ background: valid ? 'rgba(0,255,136,0.12)' : 'rgba(0,255,136,0.04)', border: `1px solid ${valid ? 'rgba(0,255,136,0.6)' : 'rgba(0,255,136,0.2)'}`, color: '#00ff88', boxShadow: valid ? '0 0 20px rgba(0,255,136,0.15)' : 'none' }}>
              {loading ? <><FileText className="w-4 h-4 animate-pulse" /> Analysing…</> : <><FileText className="w-4 h-4" /> Analyse document</>}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Score header */}
            <div className="p-6 rounded" style={{ background: 'rgba(0,255,136,0.02)', border: `2px solid ${gradeColor(result.coverage_grade)}33` }}>
              <div className="flex items-start justify-between gap-6 mb-4">
                <div className="flex-1">
                  <div className="text-[8px] uppercase tracking-widest text-[rgba(0,255,136,0.4)] mb-1">{result.fund_name} · {result.regulation} · {result.word_count.toLocaleString()} words</div>
                  <div className="text-base text-[rgba(255,255,255,0.7)] leading-relaxed">{result.verdict}</div>
                </div>
                <div className="text-center shrink-0">
                  <div className="text-5xl font-black" style={{ color: gradeColor(result.coverage_grade) }}>{result.coverage_grade}</div>
                  <div className="text-[8px] uppercase tracking-wider text-[rgba(255,255,255,0.3)]">{result.coverage_pct}% coverage</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                {[
                  { label: 'Checked', val: result.requirements_checked, color: 'rgba(0,255,136,0.6)' },
                  { label: 'Found', val: result.found_count, color: '#00ff88' },
                  { label: 'Missing', val: result.missing_count, color: '#ff3366' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="p-2 rounded" style={{ background: 'rgba(0,0,0,0.3)' }}>
                    <div className="text-xl font-black" style={{ color }}>{val}</div>
                    <div className="text-[7px] uppercase tracking-wider text-[rgba(255,255,255,0.3)]">{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recommendations */}
            {result.top_recommendations.length > 0 && (
              <div className="p-4 rounded space-y-2" style={{ background: 'rgba(255,51,102,0.04)', border: '1px solid rgba(255,51,102,0.2)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-[#ff3366]" />
                  <span className="text-[9px] uppercase tracking-widest text-[#ff3366] font-bold">Top recommendations</span>
                </div>
                {result.top_recommendations.map((r, i) => (
                  <div key={i} className="text-[9px] text-[rgba(255,255,255,0.55)] leading-relaxed flex gap-2">
                    <span className="text-[rgba(255,51,102,0.6)] shrink-0">{i+1}.</span>{r}
                  </div>
                ))}
              </div>
            )}

            {/* Detailed analysis */}
            <div>
              <div className="text-[9px] uppercase tracking-widest text-[rgba(0,255,136,0.4)] mb-3">Detailed requirement analysis</div>
              <div className="space-y-1.5">
                {result.analysis.map((a, i) => (
                  <div key={i} className="rounded" style={{ background: a.status === 'found' ? 'rgba(0,255,136,0.02)' : 'rgba(255,51,102,0.03)', border: `1px solid ${a.status === 'found' ? 'rgba(0,255,136,0.15)' : 'rgba(255,51,102,0.2)'}` }}>
                    <button className="w-full flex items-center gap-3 p-3 text-left" onClick={() => toggleExpand(i)}>
                      <StatusIcon s={a.status} />
                      <span className="text-[10px] text-[rgba(255,255,255,0.7)] flex-1">{a.requirement}</span>
                      <span className="text-[8px] uppercase tracking-wider px-2 py-0.5 rounded font-bold" style={{ background: `rgba(0,255,136,0.06)`, color: 'rgba(0,255,136,0.5)' }}>{a.regulation}</span>
                      {expanded.has(i) ? <ChevronDown className="w-3 h-3 text-[rgba(0,255,136,0.4)]" /> : <ChevronRight className="w-3 h-3 text-[rgba(0,255,136,0.4)]" />}
                    </button>
                    {expanded.has(i) && (
                      <div className="px-3 pb-3 space-y-1">
                        {a.matched_keyword && <div className="text-[8px] text-[#00ff88]">Matched: <span className="font-bold">"{a.matched_keyword}"</span></div>}
                        <div className="text-[8px] text-[rgba(255,255,255,0.3)]">Keywords: {a.keywords_checked.join(', ')}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <button onClick={() => setResult(null)} className="px-5 py-2.5 rounded text-sm font-bold uppercase tracking-wider" style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88' }}>← Check another document</button>
          </div>
        )}
      </div>
    </div>
  )
}
