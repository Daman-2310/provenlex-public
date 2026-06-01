'use client'
import { useState } from 'react'
import { BASE } from '@/lib/api'
import { FileText, Printer, Zap, CheckCircle, AlertTriangle, Clock, TrendingUp, Shield, Radio } from 'lucide-react'

const QUARTERS = ['Q1 2026','Q2 2026','Q3 2026','Q4 2026','Q1 2027','Q2 2027']
const FUND_TYPES = ['AIFM','UCITS ManCo','RAIF','SIF','Family Office']
const SFDR_ARTICLES = ['Article 6','Article 8','Article 9']

interface ReportSection { title: string; status: 'green'|'amber'|'red'; content: string; items?: string[] }
interface BoardReport {
  fund_name: string; period: string; generated_at: string; report_id: string
  overall_status: 'green'|'amber'|'red'; overall_summary: string
  sections: ReportSection[]; priorities: string[]; certification_hash: string
}

function StatusDot({ s }: { s: 'green'|'amber'|'red' }) {
  const c = s === 'green' ? '#00ff88' : s === 'amber' ? '#ffaa00' : '#ff3366'
  return <span className="inline-block w-2 h-2 rounded-full shrink-0 mt-1" style={{ background: c, boxShadow: `0 0 6px ${c}` }} />
}

export default function BoardReportPage() {
  const [form, setForm] = useState({ fund_name: '', period: 'Q2 2026', fund_type: 'AIFM', aum_eur_m: '', sfdr_article: 'Article 8' })
  const [report, setReport] = useState<BoardReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const valid = !!(form.fund_name && form.aum_eur_m)

  async function generate() {
    if (!valid) return
    setLoading(true); setError(''); setReport(null)
    try {
      const res = await fetch(`${BASE}/api/v1/board-report/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, aum_eur_m: parseFloat(form.aum_eur_m) })
      })
      if (!res.ok) throw new Error()
      setReport(await res.json())
    } catch { setError('Generation failed — please try again.') }
    finally { setLoading(false) }
  }

  const inputCls = 'w-full bg-[rgba(0,255,136,0.03)] border border-[rgba(0,255,136,0.2)] rounded px-3 py-2.5 text-[#00ff88] text-sm font-mono placeholder-[rgba(0,255,136,0.25)] focus:outline-none focus:border-[rgba(0,255,136,0.6)] transition-all'
  const labelCls = 'block text-[9px] uppercase tracking-widest text-[rgba(0,255,136,0.5)] mb-1.5'
  const oc = (s: 'green'|'amber'|'red') => s === 'green' ? '#00ff88' : s === 'amber' ? '#ffaa00' : '#ff3366'

  return (
    <div className="min-h-screen bg-[#050508] text-[#00ff88] font-mono overflow-x-hidden">
      <div className="scanline pointer-events-none fixed inset-0 z-50" />
      <div className="sticky top-0 z-40 flex items-center justify-between px-6 py-3 border-b border-[rgba(0,255,136,0.12)]" style={{ background: 'rgba(5,5,8,0.97)', backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
          <a href="/operator" className="font-bold tracking-[0.2em] text-sm uppercase hover:opacity-80 transition-opacity">Genesis Swarm</a>
          <span className="text-[rgba(0,255,136,0.4)] text-[10px] tracking-widest hidden sm:block">// AI Board Report Generator</span>
        </div>
        <div className="flex items-center gap-2">
          {report && <button onClick={() => window.print()} className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider px-3 py-1.5 border border-[rgba(255,255,255,0.2)] text-[rgba(255,255,255,0.6)] rounded hover:bg-[rgba(255,255,255,0.06)] transition-colors"><Printer className="w-3 h-3" /> Print PDF</button>}
          <a href="/operator" className="text-[9px] uppercase tracking-wider px-3 py-1.5 border border-[rgba(0,255,136,0.3)] text-[#00ff88] rounded hover:bg-[rgba(0,255,136,0.08)] transition-colors">← Dashboard</a>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8 print:py-4">
        {!report && (
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="text-[9px] uppercase tracking-[0.3em] text-[rgba(0,255,136,0.5)]">AI-Generated · Groq Llama-3.3-70b</div>
              <h1 className="text-3xl font-bold tracking-tight">Quarterly Compliance Board Pack</h1>
              <p className="text-[rgba(255,255,255,0.4)] text-sm leading-relaxed max-w-2xl">Generate a complete board-ready compliance report in 30 seconds. Covers DORA, AIFMD II, SFDR, UCITS and CSSF deadlines. What used to take your CCO 3 days.</p>
            </div>
            <div className="max-w-xl space-y-4 p-6 rounded" style={{ background: 'rgba(0,255,136,0.02)', border: '1px solid rgba(0,255,136,0.15)' }}>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className={labelCls}>Fund name *</label><input className={inputCls} placeholder="Luxembourg Growth AIFM S.A." value={form.fund_name} onChange={set('fund_name')} /></div>
                <div><label className={labelCls}>Reporting period</label><select className={inputCls + ' cursor-pointer'} value={form.period} onChange={set('period')}>{QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}</select></div>
                <div><label className={labelCls}>Fund type</label><select className={inputCls + ' cursor-pointer'} value={form.fund_type} onChange={set('fund_type')}>{FUND_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div><label className={labelCls}>AUM (€M) *</label><input className={inputCls} type="number" placeholder="500" value={form.aum_eur_m} onChange={set('aum_eur_m')} /></div>
                <div><label className={labelCls}>SFDR classification</label><select className={inputCls + ' cursor-pointer'} value={form.sfdr_article} onChange={set('sfdr_article')}>{SFDR_ARTICLES.map(a => <option key={a} value={a}>{a}</option>)}</select></div>
              </div>
              {error && <div className="text-[9px] text-[#ff3366] p-3 rounded" style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.3)' }}>{error}</div>}
              <button onClick={generate} disabled={!valid || loading} className="w-full flex items-center justify-center gap-2 py-3.5 rounded font-bold text-sm uppercase tracking-wider transition-all disabled:opacity-50"
                style={{ background: valid ? 'rgba(0,255,136,0.12)' : 'rgba(0,255,136,0.04)', border: `1px solid ${valid ? 'rgba(0,255,136,0.6)' : 'rgba(0,255,136,0.2)'}`, color: '#00ff88', boxShadow: valid ? '0 0 20px rgba(0,255,136,0.15)' : 'none' }}>
                {loading ? <><Zap className="w-4 h-4 animate-pulse" /> Generating board pack…</> : <><FileText className="w-4 h-4" /> Generate board pack</>}
              </button>
            </div>
          </div>
        )}

        {report && (
          <div className="space-y-6 print:space-y-4">
            {/* Cover */}
            <div className="p-6 rounded space-y-3" style={{ background: 'rgba(0,255,136,0.03)', border: '1px solid rgba(0,255,136,0.2)' }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.3em] text-[rgba(0,255,136,0.5)] mb-1">Quarterly Compliance Board Pack</div>
                  <h2 className="text-2xl font-bold">{report.fund_name}</h2>
                  <div className="text-[rgba(255,255,255,0.4)] text-sm mt-1">{report.period} · Generated {new Date(report.generated_at).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold uppercase tracking-wider" style={{ color: oc(report.overall_status) }}>{report.overall_status === 'green' ? 'COMPLIANT' : report.overall_status === 'amber' ? 'ATTENTION REQUIRED' : 'ACTION REQUIRED'}</div>
                  <div className="text-[8px] text-[rgba(255,255,255,0.3)] mt-1 uppercase tracking-wider">ID: {report.report_id}</div>
                </div>
              </div>
              <div className="text-[rgba(255,255,255,0.6)] text-sm leading-relaxed border-t border-[rgba(0,255,136,0.1)] pt-3">{report.overall_summary}</div>
            </div>

            {/* Sections */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {report.sections.map(s => (
                <div key={s.title} className="p-4 rounded space-y-3" style={{ background: 'rgba(0,255,136,0.02)', border: `1px solid ${s.status === 'green' ? 'rgba(0,255,136,0.2)' : s.status === 'amber' ? 'rgba(255,170,0,0.25)' : 'rgba(255,51,102,0.25)'}` }}>
                  <div className="flex items-center gap-2">
                    <StatusDot s={s.status} />
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: oc(s.status) }}>{s.title}</span>
                  </div>
                  <p className="text-[9px] text-[rgba(255,255,255,0.55)] leading-relaxed">{s.content}</p>
                  {s.items && s.items.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-[rgba(255,255,255,0.06)]">
                      {s.items.map((item, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[8px] text-[rgba(255,255,255,0.4)]">
                          <span style={{ color: oc(s.status) }}>›</span> {item}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Priorities */}
            <div className="p-5 rounded space-y-3" style={{ background: 'rgba(255,170,0,0.04)', border: '1px solid rgba(255,170,0,0.2)' }}>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#ffaa00]" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#ffaa00]">Board Priorities — Next Quarter</span>
              </div>
              <div className="space-y-2">
                {report.priorities.map((p, i) => (
                  <div key={i} className="flex items-start gap-3 text-[9px] text-[rgba(255,255,255,0.6)]">
                    <span className="w-5 h-5 rounded-full bg-[rgba(255,170,0,0.15)] border border-[rgba(255,170,0,0.3)] flex items-center justify-center shrink-0 text-[8px] font-bold text-[#ffaa00]">{i+1}</span>
                    {p}
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-4 rounded text-[8px] text-[rgba(255,255,255,0.25)]" style={{ background: 'rgba(0,255,136,0.02)', border: '1px solid rgba(0,255,136,0.08)' }}>
              <div>Generated by Genesis Swarm AI · SHA3-512 certified · {report.report_id}</div>
              <div className="font-mono text-[7px] truncate max-w-[200px]">{report.certification_hash.substring(0,32)}…</div>
            </div>
            <div className="flex gap-3 print:hidden">
              <button onClick={() => setReport(null)} className="px-5 py-2.5 rounded text-sm font-bold uppercase tracking-wider transition-all" style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88' }}>← New report</button>
              <button onClick={() => window.print()} className="flex items-center gap-2 px-5 py-2.5 rounded text-sm font-bold uppercase tracking-wider transition-all" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)' }}><Printer className="w-4 h-4" /> Save as PDF</button>
            </div>
          </div>
        )}
      </div>
      <style>{`@media print { @page { size: A4; margin: 1cm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white !important; color: black !important; } .print\\:hidden { display: none !important; } }`}</style>
    </div>
  )
}
