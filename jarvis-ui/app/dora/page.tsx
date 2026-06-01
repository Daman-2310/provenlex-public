'use client'

import { useState, useCallback, useRef } from 'react'
import { BASE } from '@/lib/api'
import { Shield, Plus, Trash2, Zap, FileDown, CheckCircle, AlertTriangle, Clock, Upload, Cpu, FileText } from 'lucide-react'

interface Vendor {
  name: string
  criticality: 'low' | 'medium' | 'high' | 'critical'
  contracts_uploaded: boolean
  contractFile?: File | null
  aiAnalysis?: AIAnalysis | null
  analyzing?: boolean
}

interface GapItem {
  article: string
  clause: string
  severity: 'HIGH' | 'MEDIUM'
  remediation: string
  evidence?: string
  status?: string
}

interface CompliantClause {
  article: string
  clause: string
  evidence: string
}

interface AIAnalysis {
  overall_assessment: 'COMPLIANT' | 'PARTIALLY_COMPLIANT' | 'NON_COMPLIANT'
  compliance_score: number
  gaps: GapItem[]
  compliant_clauses: CompliantClause[]
  cssf_filing_required: boolean
  key_finding: string
  contract_hash: string
  ai_analyzed: boolean
}

interface VendorResult {
  vendor: string; criticality: string; risk_score: number
  compliant_clauses: number; total_clauses: number; compliance_pct: number
  gaps: GapItem[]; action_required: boolean; cssf_filing_required: boolean
  contract_hash: string; ai_analyzed?: boolean
}

interface ScanResult {
  fund: string; scan_ts: string; vendors_scanned: number; total_risk_score: number
  critical_vendors: string[]; cssf_filing_required: boolean; dora_ready: boolean
  results: VendorResult[]; next_review_date: string
}

const CRIT_COLORS: Record<string, string> = {
  low: '#00ff88', medium: '#ffaa00', high: '#ff8800', critical: '#ff3366'
}
const CRIT_OPTS: Vendor['criticality'][] = ['low', 'medium', 'high', 'critical']

const ASSESS_COLOR: Record<string, string> = {
  COMPLIANT: '#00ff88',
  PARTIALLY_COMPLIANT: '#ffaa00',
  NON_COMPLIANT: '#ff3366',
}

export default function DORAPage() {
  const [fundName, setFundName] = useState('Luxembourg AIF')
  const [vendors, setVendors] = useState<Vendor[]>([
    { name: 'AWS Frankfurt', criticality: 'critical', contracts_uploaded: false },
    { name: 'Bloomberg Terminal', criticality: 'high', contracts_uploaded: false },
    { name: 'Microsoft Azure', criticality: 'high', contracts_uploaded: false },
  ])
  const [scanning, setScanning]   = useState(false)
  const [result, setResult]       = useState<ScanResult | null>(null)
  const [selected, setSelected]   = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const fileRefs = useRef<(HTMLInputElement | null)[]>([])

  const addVendor = () =>
    setVendors(v => [...v, { name: '', criticality: 'medium', contracts_uploaded: false }])

  const removeVendor = (i: number) =>
    setVendors(v => v.filter((_, idx) => idx !== i))

  const updateVendor = (i: number, patch: Partial<Vendor>) =>
    setVendors(v => v.map((x, idx) => idx === i ? { ...x, ...patch } : x))

  // AI contract analysis — uploads the PDF to Claude
  const analyzeContract = useCallback(async (i: number) => {
    const vendor = vendors[i]
    if (!vendor.contractFile) return
    updateVendor(i, { analyzing: true })

    const form = new FormData()
    form.append('vendor_name', vendor.name || 'Unknown Vendor')
    form.append('criticality', vendor.criticality)
    form.append('file', vendor.contractFile)

    try {
      const res = await fetch(`${BASE}/api/v1/dora/analyze-contract`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const analysis: AIAnalysis = await res.json()
      updateVendor(i, { aiAnalysis: analysis, analyzing: false })
    } catch (e) {
      updateVendor(i, { analyzing: false })
      setError(`Analysis failed: ${String(e)}`)
    }
  }, [vendors])

  const runScan = useCallback(async () => {
    const valid = vendors.filter(v => v.name.trim())
    if (!valid.length) return
    setScanning(true); setResult(null); setError(null); setSelected(null)
    try {
      const res = await fetch(`${BASE}/api/v1/dora/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fund_name: fundName,
          vendors: valid.map(v => ({
            name: v.name,
            criticality: v.criticality,
            contracts_uploaded: !!v.contractFile,
          })),
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: ScanResult = await res.json()

      // Merge AI analysis results where available
      data.results = data.results.map(r => {
        const vendor = valid.find(v => v.name === r.vendor)
        if (vendor?.aiAnalysis) {
          return {
            ...r,
            gaps: vendor.aiAnalysis.gaps,
            compliant_clauses: vendor.aiAnalysis.compliant_clauses.length,
            compliance_pct: vendor.aiAnalysis.compliance_score,
            risk_score: 100 - vendor.aiAnalysis.compliance_score,
            action_required: vendor.aiAnalysis.overall_assessment !== 'COMPLIANT',
            cssf_filing_required: vendor.aiAnalysis.cssf_filing_required,
            contract_hash: vendor.aiAnalysis.contract_hash,
            ai_analyzed: true,
          }
        }
        return r
      })

      setResult(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setScanning(false)
    }
  }, [vendors, fundName])

  const selectedResult = result?.results.find(r => r.vendor === selected) ?? null
  const selectedVendor = vendors.find(v => v.name === selected) ?? null

  return (
    <div className="min-h-screen bg-[#050508] text-[#00ff88] font-mono select-none">
      <div className="scanline pointer-events-none fixed inset-0 z-50" />

      {/* Header */}
      <div className="sticky top-0 z-40 flex items-center justify-between px-6 py-3 border-b border-[rgba(0,255,136,0.12)]"
        style={{ background: 'rgba(5,5,8,0.97)', backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-3">
          <Shield className="w-4 h-4 text-[#00ff88]" />
          <span className="font-bold tracking-[0.2em] text-sm uppercase">DORA ICT Scanner</span>
          <span className="text-[rgba(0,255,136,0.4)] text-[9px] tracking-widest hidden sm:block">
            // Article 28 Compliance · AI Contract Analysis
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a href="/dora/register" className="text-[9px] uppercase tracking-wider px-3 py-1.5 border border-[rgba(0,170,255,0.3)] text-[#00aaff] rounded hover:bg-[rgba(0,170,255,0.08)] transition-colors">
            ICT Register Builder →
          </a>
          <a href="/operator" className="text-[9px] uppercase tracking-wider px-3 py-1.5 border border-[rgba(0,255,136,0.3)] text-[#00ff88] rounded hover:bg-[rgba(0,255,136,0.08)] transition-colors">
            ← Dashboard
          </a>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Intro */}
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-wider">DORA Article 28 — AI Contract Analysis</h1>
          <p className="text-[9px] text-[rgba(255,255,255,0.35)] leading-relaxed max-w-2xl">
            Upload your ICT vendor contracts. Claude reads each PDF and identifies exactly which
            Article 28 clauses are missing — with the contract text as evidence. No more manual
            review. CSSF Circular 25/882 compliance in minutes.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Input */}
          <div className="space-y-4">
            <div>
              <label className="text-[8px] uppercase tracking-widest text-[rgba(0,255,136,0.5)] block mb-1">
                Fund Name
              </label>
              <input
                value={fundName}
                onChange={e => setFundName(e.target.value)}
                className="terminal-input w-full rounded text-sm"
                placeholder="Luxembourg AIF"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[8px] uppercase tracking-widest text-[rgba(0,255,136,0.5)]">
                  ICT Vendors
                </label>
                <button onClick={addVendor}
                  className="flex items-center gap-1 text-[8px] text-[rgba(0,255,136,0.7)] hover:text-[#00ff88] transition-colors uppercase tracking-wider">
                  <Plus className="w-3 h-3" /> Add vendor
                </button>
              </div>

              {vendors.map((v, i) => (
                <div key={i} className="rounded p-2.5 space-y-2"
                  style={{ background: 'rgba(0,255,136,0.03)', border: '1px solid rgba(0,255,136,0.1)' }}>

                  {/* Vendor name + criticality + delete */}
                  <div className="flex items-center gap-2">
                    <input
                      value={v.name}
                      onChange={e => updateVendor(i, { name: e.target.value })}
                      className="terminal-input flex-1 rounded text-[10px] min-w-0"
                      placeholder="Vendor name"
                    />
                    <select
                      value={v.criticality}
                      onChange={e => updateVendor(i, { criticality: e.target.value as Vendor['criticality'] })}
                      className="terminal-input rounded text-[9px] uppercase"
                      style={{ color: CRIT_COLORS[v.criticality] }}>
                      {CRIT_OPTS.map(c => (
                        <option key={c} value={c}>{c.toUpperCase()}</option>
                      ))}
                    </select>
                    <button onClick={() => removeVendor(i)}
                      className="text-[rgba(255,51,102,0.5)] hover:text-[#ff3366] transition-colors shrink-0">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Contract upload row */}
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept=".pdf"
                      ref={el => { fileRefs.current[i] = el }}
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0] ?? null
                        updateVendor(i, { contractFile: file, contracts_uploaded: !!file, aiAnalysis: null })
                      }}
                    />
                    <button
                      onClick={() => fileRefs.current[i]?.click()}
                      className="flex items-center gap-1.5 text-[8px] uppercase tracking-wider px-2 py-1 rounded border transition-colors"
                      style={{
                        border: v.contractFile ? '1px solid rgba(0,255,136,0.4)' : '1px solid rgba(255,255,255,0.12)',
                        color: v.contractFile ? '#00ff88' : 'rgba(255,255,255,0.35)',
                        background: v.contractFile ? 'rgba(0,255,136,0.05)' : 'transparent',
                      }}>
                      <Upload className="w-3 h-3" />
                      {v.contractFile ? v.contractFile.name.slice(0, 20) + (v.contractFile.name.length > 20 ? '…' : '') : 'Upload contract PDF'}
                    </button>

                    {v.contractFile && !v.aiAnalysis && (
                      <button
                        onClick={() => analyzeContract(i)}
                        disabled={v.analyzing}
                        className="flex items-center gap-1 text-[8px] uppercase tracking-wider px-2 py-1 rounded border transition-colors disabled:opacity-50"
                        style={{
                          border: '1px solid rgba(0,170,255,0.4)',
                          color: '#00aaff',
                          background: 'rgba(0,170,255,0.06)',
                        }}>
                        {v.analyzing
                          ? <><Cpu className="w-3 h-3" style={{ animation: 'spin 1s linear infinite' }} /> Analyzing…</>
                          : <><Zap className="w-3 h-3" /> AI Analyze</>}
                      </button>
                    )}

                    {v.aiAnalysis && (
                      <div className="flex items-center gap-1 text-[8px] uppercase tracking-wider px-2 py-1 rounded"
                        style={{
                          background: `${ASSESS_COLOR[v.aiAnalysis.overall_assessment]}10`,
                          border: `1px solid ${ASSESS_COLOR[v.aiAnalysis.overall_assessment]}44`,
                          color: ASSESS_COLOR[v.aiAnalysis.overall_assessment],
                        }}>
                        <CheckCircle className="w-3 h-3" />
                        {v.aiAnalysis.compliance_score}% · {v.aiAnalysis.overall_assessment.replace('_', ' ')}
                      </div>
                    )}
                  </div>

                  {/* Key finding from AI */}
                  {v.aiAnalysis?.key_finding && (
                    <div className="text-[7px] text-[rgba(255,170,0,0.7)] flex items-start gap-1 pl-0.5">
                      <AlertTriangle className="w-2.5 h-2.5 shrink-0 mt-0.5 text-[#ffaa00]" />
                      {v.aiAnalysis.key_finding}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={runScan}
              disabled={scanning || !vendors.some(v => v.name.trim())}
              className="w-full flex items-center justify-center gap-2 py-3 rounded font-bold text-sm uppercase tracking-wider transition-all duration-300 disabled:opacity-50 disabled:cursor-wait"
              style={{
                background: scanning ? 'rgba(255,170,0,0.1)' : 'rgba(0,255,136,0.1)',
                border: `2px solid ${scanning ? '#ffaa00' : '#00ff88'}`,
                color: scanning ? '#ffaa00' : '#00ff88',
              }}>
              {scanning
                ? <><Zap className="w-4 h-4" style={{ animation: 'pulse 0.6s ease-in-out infinite' }} /> Scanning…</>
                : <><Shield className="w-4 h-4" /> Run DORA Gap Analysis</>}
            </button>

            {error && (
              <div className="text-[9px] text-[#ff3366] px-3 py-2 rounded"
                style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.3)' }}>
                {error}
              </div>
            )}
          </div>

          {/* Right: Results overview */}
          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Total Risk Score', value: `${result.total_risk_score}/100`,
                    color: result.total_risk_score >= 60 ? '#ff3366' : result.total_risk_score >= 30 ? '#ffaa00' : '#00ff88' },
                  { label: 'DORA Ready', value: result.dora_ready ? 'YES' : 'NO',
                    color: result.dora_ready ? '#00ff88' : '#ff3366' },
                  { label: 'Vendors Scanned', value: result.vendors_scanned, color: '#00ff88' },
                  { label: 'CSSF Filing Required', value: result.cssf_filing_required ? 'YES' : 'NO',
                    color: result.cssf_filing_required ? '#ff3366' : '#00ff88' },
                ].map(m => (
                  <div key={m.label} className="rounded p-2"
                    style={{ background: 'rgba(0,255,136,0.03)', border: '1px solid rgba(0,255,136,0.1)' }}>
                    <div className="text-[7px] text-[rgba(255,255,255,0.35)] uppercase tracking-wider">{m.label}</div>
                    <div className="text-sm font-bold mt-0.5" style={{ color: m.color }}>{m.value}</div>
                  </div>
                ))}
              </div>

              {result.cssf_filing_required && (
                <div className="flex items-center gap-2 p-2 rounded"
                  style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.4)' }}>
                  <AlertTriangle className="w-3.5 h-3.5 text-[#ff3366] shrink-0" />
                  <span className="text-[8px] text-[rgba(255,255,255,0.6)] leading-relaxed">
                    CSSF notification required within 4 hours (DORA Art.19).
                  </span>
                </div>
              )}

              <div className="space-y-1">
                <div className="text-[7px] uppercase tracking-widest text-[rgba(0,255,136,0.4)] mb-2">
                  Vendor results — click to inspect
                </div>
                {result.results.map(r => {
                  const riskColor = r.risk_score >= 60 ? '#ff3366' : r.risk_score >= 30 ? '#ffaa00' : '#00ff88'
                  const isSelected = selected === r.vendor
                  return (
                    <button key={r.vendor} onClick={() => setSelected(isSelected ? null : r.vendor)}
                      className="w-full text-left rounded p-2.5 transition-all duration-200"
                      style={{
                        background: isSelected ? 'rgba(0,255,136,0.06)' : 'rgba(0,255,136,0.02)',
                        border: `1px solid ${isSelected ? 'rgba(0,255,136,0.4)' : 'rgba(0,255,136,0.1)'}`,
                      }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {r.action_required
                            ? <AlertTriangle className="w-3 h-3 text-[#ff3366]" />
                            : <CheckCircle className="w-3 h-3 text-[#00ff88]" />}
                          <span className="text-[10px] font-bold text-[rgba(255,255,255,0.8)]">{r.vendor}</span>
                          <span className="text-[7px] uppercase px-1 py-0.5 rounded"
                            style={{ color: CRIT_COLORS[r.criticality], background: `${CRIT_COLORS[r.criticality]}15`,
                                     border: `1px solid ${CRIT_COLORS[r.criticality]}33` }}>
                            {r.criticality}
                          </span>
                          {r.ai_analyzed && (
                            <span className="text-[6px] uppercase px-1 py-0.5 rounded"
                              style={{ color: '#00aaff', background: 'rgba(0,170,255,0.1)', border: '1px solid rgba(0,170,255,0.3)' }}>
                              AI
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[8px] text-[rgba(255,255,255,0.4)]">
                            {r.compliance_pct}% compliant
                          </span>
                          <span className="text-sm font-bold" style={{ color: riskColor }}>
                            {r.risk_score.toFixed(0)}
                          </span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="flex items-center gap-1 text-[7px] text-[rgba(255,255,255,0.25)] uppercase tracking-widest">
                <Clock className="w-2.5 h-2.5" />
                Next review: {result.next_review_date}
              </div>
            </div>
          )}
        </div>

        {/* Gap detail panel */}
        {selectedResult && (
          <div className="rounded p-4 space-y-3"
            style={{ background: 'rgba(0,255,136,0.02)', border: '1px solid rgba(0,255,136,0.2)' }}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[#00ff88]">{selectedResult.vendor} — Gap Detail</span>
                {selectedResult.ai_analyzed && (
                  <span className="text-[7px] px-1.5 py-0.5 rounded font-bold uppercase"
                    style={{ color: '#00aaff', background: 'rgba(0,170,255,0.1)', border: '1px solid rgba(0,170,255,0.3)' }}>
                    Claude AI Analysis
                  </span>
                )}
              </div>
              <span className="text-[7px] text-[rgba(255,255,255,0.3)] uppercase tracking-wider">
                Hash: {selectedResult.contract_hash}
              </span>
            </div>

            {/* AI key finding */}
            {selectedVendor?.aiAnalysis?.key_finding && (
              <div className="flex items-start gap-2 p-2 rounded"
                style={{ background: 'rgba(255,170,0,0.06)', border: '1px solid rgba(255,170,0,0.25)' }}>
                <FileText className="w-3 h-3 text-[#ffaa00] shrink-0 mt-0.5" />
                <span className="text-[8px] text-[rgba(255,255,255,0.6)]">
                  {selectedVendor.aiAnalysis.key_finding}
                </span>
              </div>
            )}

            {/* Compliant clauses (AI only) */}
            {selectedVendor?.aiAnalysis?.compliant_clauses && selectedVendor.aiAnalysis.compliant_clauses.length > 0 && (
              <div className="space-y-1">
                <div className="text-[7px] uppercase tracking-widest text-[rgba(0,255,136,0.4)]">
                  {selectedVendor.aiAnalysis.compliant_clauses.length} clauses satisfied
                </div>
                <div className="flex flex-wrap gap-1">
                  {selectedVendor.aiAnalysis.compliant_clauses.map(c => (
                    <div key={c.article} className="text-[7px] px-1.5 py-0.5 rounded flex items-center gap-1"
                      style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', color: '#00ff88' }}>
                      <CheckCircle className="w-2.5 h-2.5" /> Art. {c.article}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedResult.gaps.length === 0 ? (
              <div className="flex items-center gap-2 text-[#00ff88] text-[9px]">
                <CheckCircle className="w-4 h-4" />
                All Article 28 clauses satisfied — no remediation required.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-[7px] uppercase tracking-widest text-[rgba(255,255,255,0.3)]">
                  {selectedResult.gaps.length} gaps identified
                </div>
                {selectedResult.gaps.map((g, idx) => (
                  <div key={`${g.article}-${idx}`} className="rounded p-2.5"
                    style={{
                      background: g.severity === 'HIGH' ? 'rgba(255,51,102,0.05)' : 'rgba(255,170,0,0.05)',
                      border: `1px solid ${g.severity === 'HIGH' ? 'rgba(255,51,102,0.25)' : 'rgba(255,170,0,0.2)'}`,
                    }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[8px] font-bold"
                            style={{ color: g.severity === 'HIGH' ? '#ff3366' : '#ffaa00' }}>
                            Art. {g.article}
                          </span>
                          <span className="text-[7px] px-1 py-px rounded font-bold uppercase"
                            style={{
                              background: g.severity === 'HIGH' ? 'rgba(255,51,102,0.15)' : 'rgba(255,170,0,0.15)',
                              color: g.severity === 'HIGH' ? '#ff3366' : '#ffaa00',
                            }}>{g.severity}</span>
                        </div>
                        <div className="text-[8px] text-[rgba(255,255,255,0.6)]">{g.clause}</div>

                        {/* Contract evidence (AI only) */}
                        {g.evidence && (
                          <div className="mt-1 text-[7px] text-[rgba(255,255,255,0.35)] italic border-l pl-2"
                            style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                            &quot;{g.evidence}&quot;
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-1.5 text-[7px] text-[rgba(255,255,255,0.4)] flex items-start gap-1">
                      <span className="text-[#00ff88] shrink-0">→</span>
                      {g.remediation}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
