'use client'

import { useState, useCallback, useRef } from 'react'
import { BASE } from '@/lib/api'
import { Shield, CheckCircle, AlertTriangle, Clock, ChevronDown, ChevronUp, FileDown, Zap, Upload, Globe, FileText } from 'lucide-react'

interface Requirement {
  id: string
  title: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM'
  deadline: string
  description: string
  questions: string[]
  cssf_reference: string
  remediation: string | null
}

interface RequirementResult extends Requirement {
  compliance_pct: number
  gap_status: 'COMPLIANT' | 'PARTIALLY_COMPLIANT' | 'NON_COMPLIANT' | 'NOT_ASSESSED'
  answered_yes: number
  total_questions: number
}

interface CheckResult {
  fund: string
  overall_score: number
  compliant: number
  total: number
  cssf_action_required: boolean
  critical_gaps: string[]
  results: RequirementResult[]
  certificate_hash: string
  regulation: string
  scan_ts: string
}

interface ProspectusRequirement {
  status: 'COMPLIANT' | 'PARTIAL' | 'NON_COMPLIANT'
  evidence: string | null
  gap: string | null
}

interface ProspectusResult {
  detected_language: string
  fund_name: string | null
  requirements: Record<string, ProspectusRequirement>
  overall_score: number
  critical_gaps: string[]
  key_finding: string
  recommended_actions: string[]
  pages_analysed: number
  certificate_hash: string
  regulation: string
  cost_eur: number
}

const SEV_COLOR: Record<string, string> = {
  CRITICAL: '#ff3366',
  HIGH: '#ff8800',
  MEDIUM: '#ffaa00',
}

const STATUS_COLOR: Record<string, string> = {
  COMPLIANT: '#00ff88',
  PARTIALLY_COMPLIANT: '#ffaa00',
  NON_COMPLIANT: '#ff3366',
  NOT_ASSESSED: 'rgba(255,255,255,0.3)',
}

const STATUS_LABEL: Record<string, string> = {
  COMPLIANT: 'Compliant',
  PARTIALLY_COMPLIANT: 'Partial',
  NON_COMPLIANT: 'Non-Compliant',
  NOT_ASSESSED: 'Not Assessed',
}

const REQUIREMENTS: Requirement[] = [
  { id: 'A16.LMT', title: 'Liquidity Management Tools', severity: 'CRITICAL', deadline: '2026-04-16',
    description: 'Implement at least one LMT: anti-dilution levy, redemption gates, suspension, or swing pricing.',
    questions: ['Fund has documented at least one LMT from ESMA\'s approved list?', 'LMT policy is board-approved and in fund documents?', 'Investors notified of LMTs in offering documents?'],
    cssf_reference: 'CSSF Circular 24/856', remediation: '' },
  { id: 'A20.DEL', title: 'Delegation Oversight Register', severity: 'HIGH', deadline: '2026-04-16',
    description: 'Enhanced delegation oversight: substance test, register of delegated functions, quarterly reports.',
    questions: ['Formal delegation register exists listing all delegated PM functions?', 'AIFM has sufficient substance to oversee delegated functions?', 'Quarterly delegation oversight reports filed with CSSF?'],
    cssf_reference: 'CSSF FAQ — AIFMD II Delegation (Mar 2026)', remediation: '' },
  { id: 'A23.LEV', title: 'Leverage Limits & Stress Testing', severity: 'HIGH', deadline: '2026-04-16',
    description: 'New leverage reporting: gross/commitment calculations, stress scenarios, quarterly CSSF submission.',
    questions: ['Leverage calculated under both gross and commitment methods?', 'Monthly leverage stress tests documented and board-approved?', 'Leverage data submitted in updated Annex IV format?'],
    cssf_reference: 'ESMA AIFMD II Annex IV (Q1 2026)', remediation: '' },
  { id: 'A24.REP', title: 'Enhanced CSSF/ESMA Reporting', severity: 'HIGH', deadline: '2026-06-30',
    description: 'Updated Annex IV templates with new fields for liquidity, ESG, loan origination.',
    questions: ['Annex IV template updated to AIFMD II format?', 'ESG/sustainability exposure fields populated?', 'CSSF eDesk configured for new template?'],
    cssf_reference: 'CSSF eDesk — AIFMD II Annex IV', remediation: '' },
  { id: 'A30.LOAN', title: 'Loan Origination Rules', severity: 'MEDIUM', deadline: '2026-04-16',
    description: '5% retention requirement, borrower concentration limits (20% single obligor).',
    questions: ['Fund does NOT originate loans directly or indirectly?', 'If loan-originating: 5% risk retention documented?', 'Borrower concentration limits monitored and reported?'],
    cssf_reference: 'AIFMD II Art. 30a', remediation: '' },
  { id: 'A21.DEP', title: 'Depositary Oversight', severity: 'MEDIUM', deadline: '2026-04-16',
    description: 'Enhanced depositary due diligence: annual review, sub-custodian chain mapping.',
    questions: ['Depositary contract reviewed against AIFMD II?', 'Annual depositary due diligence report on file?', 'Full sub-custodian chain documented with liability mapping?'],
    cssf_reference: 'CSSF Circular 25/891', remediation: '' },
  { id: 'A22.REM', title: 'Remuneration Policy Update', severity: 'MEDIUM', deadline: '2026-04-16',
    description: 'Remuneration policies updated for sustainability alignment and new deferral rules.',
    questions: ['Remuneration policy updated for AIFMD II?', 'Policy includes ESG performance criteria?', 'Deferral periods compliant with new minimums?'],
    cssf_reference: 'ESMA Remuneration Guidelines AIFMD II', remediation: '' },
  { id: 'A23b.SFDR', title: 'SFDR / ESG Disclosure Integration', severity: 'MEDIUM', deadline: '2026-06-30',
    description: 'SFDR sustainability disclosures integrated into annual reports and offering documents.',
    questions: ['SFDR Article 6/8/9 classification documented and disclosed?', 'Principal Adverse Impact (PAI) statement current?', 'Pre-contractual SFDR disclosures in fund prospectus?'],
    cssf_reference: 'CSSF FAQ — SFDR/AIFMD II Integration', remediation: '' },
]

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

export default function AIFMDPage() {
  const [fundName, setFundName] = useState('Luxembourg AIF')
  const [fundType, setFundType] = useState<'AIF' | 'UCITS' | 'RAIF'>('AIF')
  const [answers, setAnswers] = useState<Record<string, (boolean | null)[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [mode, setMode] = useState<'auto' | 'manual'>('auto')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<CheckResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [prospectusFile, setProspectusFile] = useState<File | null>(null)
  const [prospectusResult, setProspectusResult] = useState<ProspectusResult | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const analyzeProspectus = useCallback(async () => {
    if (!prospectusFile) return
    setAnalyzing(true); setError(null); setProspectusResult(null)
    try {
      const fd = new FormData()
      fd.append('file', prospectusFile)
      const res = await fetch(`${BASE}/api/v1/aifmd/analyze-prospectus`, { method: 'POST', body: fd })
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Analysis failed') }
      setProspectusResult(await res.json())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Analysis failed')
    } finally { setAnalyzing(false) }
  }, [prospectusFile])

  const setAnswer = (reqId: string, qIdx: number, val: boolean) => {
    setAnswers(prev => {
      const arr = [...(prev[reqId] ?? new Array(REQUIREMENTS.find(r => r.id === reqId)?.questions.length).fill(null))]
      arr[qIdx] = val
      return { ...prev, [reqId]: arr }
    })
  }

  const allAnswered = REQUIREMENTS.every(r =>
    (answers[r.id] ?? []).filter(a => a !== null).length === r.questions.length
  )

  const runCheck = useCallback(async () => {
    setChecking(true); setError(null)
    const responses: Record<string, boolean[]> = {}
    for (const [k, v] of Object.entries(answers)) {
      responses[k] = v.map(a => a === true)
    }
    try {
      const res = await fetch(`${BASE}/api/v1/aifmd/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fund_name: fundName, fund_type: fundType, responses }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setResult(await res.json())
    } catch (e) { setError(String(e)) }
    finally { setChecking(false) }
  }, [fundName, fundType, answers])

  const exportRegister = () => {
    window.open(`${BASE}/api/v1/dora/register/export?fund_name=${encodeURIComponent(fundName)}`, '_blank')
  }

  return (
    <div className="min-h-screen bg-[#050508] text-[#00ff88] font-mono select-none">
      <div className="scanline pointer-events-none fixed inset-0 z-50" />

      {/* Header */}
      <div className="sticky top-0 z-40 flex items-center justify-between px-6 py-3 border-b border-[rgba(0,255,136,0.12)]"
        style={{ background: 'rgba(5,5,8,0.97)', backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-3">
          <Shield className="w-4 h-4 text-[#00ff88]" />
          <span className="font-bold tracking-[0.2em] text-sm uppercase">AIFMD II Compliance</span>
          <span className="text-[rgba(0,255,136,0.4)] text-[9px] tracking-widest hidden sm:block">
            // EU 2024/927 · Luxembourg Transposition April 2026
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a href="/dora" className="text-[9px] uppercase tracking-wider px-3 py-1.5 border border-[rgba(0,170,255,0.3)] text-[#00aaff] rounded hover:bg-[rgba(0,170,255,0.08)] transition-colors">
            DORA ICT
          </a>
          <a href="/operator" className="text-[9px] uppercase tracking-wider px-3 py-1.5 border border-[rgba(0,255,136,0.3)] text-[#00ff88] rounded hover:bg-[rgba(0,255,136,0.08)] transition-colors">
            ← Dashboard
          </a>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Urgency banner */}
        <div className="flex items-center gap-3 p-3 rounded"
          style={{ background: 'rgba(255,51,102,0.06)', border: '1px solid rgba(255,51,102,0.3)' }}>
          <AlertTriangle className="w-4 h-4 text-[#ff3366] shrink-0" />
          <div className="text-[9px] text-[rgba(255,255,255,0.6)] leading-relaxed">
            <span className="text-[#ff3366] font-bold">AIFMD II is live.</span> Luxembourg transposition effective April 2026.
            CSSF expects all AIFMs to be compliant now — 6 requirements were due April 16, 2 more due June 30.
          </div>
        </div>

        {/* Mode switcher */}
        <div className="flex gap-2 p-1 rounded" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {([['auto', 'Auto-Analyze Prospectus', 'Upload PDF — any language'], ['manual', 'Manual Assessment', 'Answer 8 questions']] as const).map(([m, label, sub]) => (
            <button key={m} onClick={() => setMode(m as 'auto' | 'manual')}
              className="flex-1 flex flex-col items-center gap-0.5 py-2 px-3 rounded text-left transition-all"
              style={{
                background: mode === m ? 'rgba(0,255,136,0.1)' : 'transparent',
                border: `1px solid ${mode === m ? 'rgba(0,255,136,0.4)' : 'transparent'}`,
              }}>
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: mode === m ? '#00ff88' : 'rgba(255,255,255,0.4)' }}>{label}</span>
              <span className="text-[8px] text-[rgba(255,255,255,0.25)]">{sub}</span>
            </button>
          ))}
        </div>

        {/* Auto-analyze panel */}
        {mode === 'auto' && (
          <div className="space-y-4">
            <div className="p-4 rounded space-y-3" style={{ background: 'rgba(0,170,255,0.04)', border: '1px solid rgba(0,170,255,0.15)' }}>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[rgba(0,170,255,0.7)]">
                <Globe className="w-3 h-3" />
                <span>Multilingual Prospectus Audit — French · German · English · Dutch · Any EU Language</span>
              </div>
              <p className="text-[9px] text-[rgba(255,255,255,0.4)] leading-relaxed">
                Upload your fund prospectus, offering memorandum, or KIID. The AI reads it in its original language
                and maps every clause against the 8 AIFMD II requirements — with direct quotes from your document as evidence.
              </p>
              <div className="flex items-center gap-3">
                <input ref={fileInputRef} type="file" accept=".pdf" className="hidden"
                  onChange={e => { setProspectusFile(e.target.files?.[0] ?? null); setProspectusResult(null) }} />
                <button onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 rounded text-[10px] uppercase tracking-wider transition-all"
                  style={{ background: 'rgba(0,170,255,0.08)', border: '1px solid rgba(0,170,255,0.35)', color: '#00aaff' }}>
                  <Upload className="w-3 h-3" />
                  {prospectusFile ? prospectusFile.name : 'Upload Fund Prospectus (PDF)'}
                </button>
                {prospectusFile && !prospectusResult && (
                  <button onClick={analyzeProspectus} disabled={analyzing}
                    className="flex items-center gap-2 px-4 py-2 rounded text-[10px] font-bold uppercase tracking-wider transition-all"
                    style={{ background: analyzing ? 'rgba(0,255,136,0.05)' : 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.4)', color: '#00ff88', opacity: analyzing ? 0.6 : 1 }}>
                    <Zap className="w-3 h-3" />
                    {analyzing ? 'Analysing…' : 'Analyse Now'}
                  </button>
                )}
              </div>
              {analyzing && (
                <div className="text-[9px] text-[rgba(0,255,136,0.5)] animate-pulse">
                  Reading document · Detecting language · Mapping AIFMD II requirements…
                </div>
              )}
            </div>

            {/* Prospectus results */}
            {prospectusResult && (
              <div className="space-y-4">
                {/* Score header */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Compliance Score', value: `${prospectusResult.overall_score}/100`, color: prospectusResult.overall_score >= 75 ? '#00ff88' : prospectusResult.overall_score >= 50 ? '#ffaa00' : '#ff3366' },
                    { label: 'Language Detected', value: prospectusResult.detected_language, color: '#00aaff' },
                    { label: 'Pages Analysed', value: `${prospectusResult.pages_analysed}p`, color: 'rgba(255,255,255,0.6)' },
                    { label: 'Analysis Cost', value: `€${prospectusResult.cost_eur}`, color: '#00ff88' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="p-3 rounded text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div className="text-[8px] uppercase tracking-widest text-[rgba(255,255,255,0.3)] mb-1">{label}</div>
                      <div className="font-bold text-sm" style={{ color }}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* Key finding */}
                <div className="p-3 rounded" style={{ background: 'rgba(255,170,0,0.06)', border: '1px solid rgba(255,170,0,0.2)' }}>
                  <div className="text-[8px] uppercase tracking-widest text-[rgba(255,170,0,0.6)] mb-1">Key Finding</div>
                  <p className="text-[11px] text-[rgba(255,255,255,0.8)]">{prospectusResult.key_finding}</p>
                </div>

                {/* Per-requirement results */}
                <div className="space-y-2">
                  <div className="text-[9px] uppercase tracking-widest text-[rgba(255,255,255,0.3)]">Requirement Analysis</div>
                  {Object.entries(prospectusResult.requirements).map(([id, req]) => {
                    const color = req.status === 'COMPLIANT' ? '#00ff88' : req.status === 'PARTIAL' ? '#ffaa00' : '#ff3366'
                    const reqMeta = REQUIREMENTS.find(r => r.id === id)
                    return (
                      <div key={id} className="p-3 rounded" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${color}22` }}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[8px] font-bold text-[rgba(255,255,255,0.4)]">{id}</span>
                            <span className="text-[10px] font-bold text-[rgba(255,255,255,0.8)]">{reqMeta?.title ?? id}</span>
                          </div>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded" style={{ color, background: `${color}15` }}>{req.status}</span>
                        </div>
                        {req.evidence && (
                          <div className="mt-1.5 p-2 rounded text-[8px] text-[rgba(255,255,255,0.5)] italic leading-relaxed" style={{ background: 'rgba(0,170,255,0.06)', borderLeft: '2px solid rgba(0,170,255,0.3)' }}>
                            "{req.evidence}"
                          </div>
                        )}
                        {req.gap && (
                          <div className="mt-1 text-[8px] text-[rgba(255,100,100,0.8)]">Gap: {req.gap}</div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Recommended actions */}
                {prospectusResult.recommended_actions?.length > 0 && (
                  <div className="p-3 rounded space-y-1.5" style={{ background: 'rgba(0,255,136,0.03)', border: '1px solid rgba(0,255,136,0.15)' }}>
                    <div className="text-[8px] uppercase tracking-widest text-[rgba(0,255,136,0.5)] mb-2">Recommended Actions</div>
                    {prospectusResult.recommended_actions.map((a, i) => (
                      <div key={i} className="flex items-start gap-2 text-[9px] text-[rgba(255,255,255,0.6)]">
                        <span className="text-[#00ff88] mt-0.5">→</span><span>{a}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Certificate */}
                <div className="text-[8px] text-[rgba(255,255,255,0.2)] text-center">
                  SHA3 · {prospectusResult.certificate_hash} · {prospectusResult.regulation}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Manual mode wrapper */}
        {mode === 'manual' && (<>

        {/* Fund setup */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[8px] uppercase tracking-widest text-[rgba(0,255,136,0.5)] block mb-1">Fund Name</label>
            <input value={fundName} onChange={e => setFundName(e.target.value)}
              className="terminal-input w-full rounded text-sm" placeholder="Luxembourg AIF" />
          </div>
          <div>
            <label className="text-[8px] uppercase tracking-widest text-[rgba(0,255,136,0.5)] block mb-1">Fund Type</label>
            <select value={fundType} onChange={e => setFundType(e.target.value as 'AIF' | 'UCITS' | 'RAIF')}
              className="terminal-input w-full rounded text-sm">
              <option value="AIF">AIF — Alternative Investment Fund</option>
              <option value="UCITS">UCITS</option>
              <option value="RAIF">RAIF — Reserved AIF</option>
            </select>
          </div>
        </div>

        {/* Requirements questionnaire */}
        <div className="space-y-2">
          <div className="text-[8px] uppercase tracking-widest text-[rgba(0,255,136,0.5)] mb-3">
            Self-Assessment — {REQUIREMENTS.length} Requirements
          </div>
          {REQUIREMENTS.map(req => {
            const reqAnswers = answers[req.id] ?? []
            const answeredCount = reqAnswers.filter(a => a !== null).length
            const yesCount = reqAnswers.filter(a => a === true).length
            const isComplete = answeredCount === req.questions.length
            const pct = isComplete ? Math.round(yesCount / req.questions.length * 100) : null
            const days = daysUntil(req.deadline)
            const isOpen = expanded === req.id

            return (
              <div key={req.id} className="rounded overflow-hidden"
                style={{ border: `1px solid ${isComplete ? (pct! >= 100 ? 'rgba(0,255,136,0.25)' : pct! >= 50 ? 'rgba(255,170,0,0.25)' : 'rgba(255,51,102,0.25)') : 'rgba(255,255,255,0.08)'}` }}>

                {/* Header row */}
                <button className="w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-[rgba(255,255,255,0.02)]"
                  onClick={() => setExpanded(isOpen ? null : req.id)}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[7px] px-1 py-0.5 rounded font-bold uppercase shrink-0"
                      style={{ color: SEV_COLOR[req.severity], background: `${SEV_COLOR[req.severity]}15`, border: `1px solid ${SEV_COLOR[req.severity]}30` }}>
                      {req.severity}
                    </span>
                    <span className="text-[10px] font-bold text-[rgba(255,255,255,0.8)] truncate">{req.title}</span>
                    <span className="text-[7px] text-[rgba(255,255,255,0.3)] shrink-0">{req.id}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <div className="flex items-center gap-1 text-[7px]"
                      style={{ color: days < 0 ? '#ff3366' : days < 30 ? '#ffaa00' : 'rgba(255,255,255,0.3)' }}>
                      <Clock className="w-2.5 h-2.5" />
                      {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
                    </div>
                    {isComplete && (
                      <span className="text-[8px] font-bold"
                        style={{ color: STATUS_COLOR[pct! >= 100 ? 'COMPLIANT' : pct! >= 50 ? 'PARTIALLY_COMPLIANT' : 'NON_COMPLIANT'] }}>
                        {pct}%
                      </span>
                    )}
                    {!isComplete && (
                      <span className="text-[7px] text-[rgba(255,255,255,0.3)]">
                        {answeredCount}/{req.questions.length}
                      </span>
                    )}
                    {isOpen ? <ChevronUp className="w-3 h-3 text-[rgba(255,255,255,0.3)]" /> : <ChevronDown className="w-3 h-3 text-[rgba(255,255,255,0.3)]" />}
                  </div>
                </button>

                {/* Expanded questions */}
                {isOpen && (
                  <div className="px-3 pb-3 space-y-2 border-t border-[rgba(255,255,255,0.06)]">
                    <p className="text-[8px] text-[rgba(255,255,255,0.4)] mt-2 leading-relaxed">{req.description}</p>
                    <div className="text-[7px] text-[rgba(0,255,136,0.4)] uppercase tracking-wider">{req.cssf_reference}</div>
                    {req.questions.map((q, qi) => (
                      <div key={qi} className="flex items-start gap-3 py-1.5">
                        <span className="text-[8px] text-[rgba(255,255,255,0.5)] flex-1 leading-relaxed">{q}</span>
                        <div className="flex gap-1.5 shrink-0">
                          {[true, false].map(val => (
                            <button key={String(val)}
                              onClick={() => setAnswer(req.id, qi, val)}
                              className="text-[7px] px-2 py-0.5 rounded font-bold uppercase transition-all"
                              style={{
                                background: reqAnswers[qi] === val
                                  ? (val ? 'rgba(0,255,136,0.2)' : 'rgba(255,51,102,0.2)')
                                  : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${reqAnswers[qi] === val ? (val ? '#00ff88' : '#ff3366') : 'rgba(255,255,255,0.1)'}`,
                                color: reqAnswers[qi] === val ? (val ? '#00ff88' : '#ff3366') : 'rgba(255,255,255,0.3)',
                              }}>
                              {val ? 'YES' : 'NO'}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Run button */}
        <div className="flex gap-3">
          <button onClick={runCheck} disabled={checking || !allAnswered}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded font-bold text-sm uppercase tracking-wider transition-all disabled:opacity-40"
            style={{
              background: checking ? 'rgba(255,170,0,0.1)' : 'rgba(0,255,136,0.1)',
              border: `2px solid ${checking ? '#ffaa00' : '#00ff88'}`,
              color: checking ? '#ffaa00' : '#00ff88',
            }}>
            {checking
              ? <><Zap className="w-4 h-4" style={{ animation: 'pulse 0.6s ease-in-out infinite' }} /> Analysing…</>
              : <><Shield className="w-4 h-4" /> Generate AIFMD II Compliance Report</>}
          </button>
          <button onClick={exportRegister}
            className="flex items-center gap-1.5 px-4 py-3 rounded border text-[9px] uppercase tracking-wider transition-colors"
            style={{ border: '1px solid rgba(0,170,255,0.4)', color: '#00aaff', background: 'rgba(0,170,255,0.06)' }}>
            <FileDown className="w-3.5 h-3.5" /> Export DORA Register
          </button>
        </div>

        {!allAnswered && (
          <p className="text-[8px] text-[rgba(255,255,255,0.3)] text-center">
            Answer all questions above to generate your compliance report.
          </p>
        )}

        {error && (
          <div className="text-[9px] text-[#ff3366] px-3 py-2 rounded"
            style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.3)' }}>
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {/* Score card */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Compliance Score', value: `${result.overall_score}%`,
                  color: result.overall_score >= 75 ? '#00ff88' : result.overall_score >= 50 ? '#ffaa00' : '#ff3366' },
                { label: 'Compliant', value: `${result.compliant}/${result.total}`, color: '#00ff88' },
                { label: 'Critical Gaps', value: result.critical_gaps.length, color: result.critical_gaps.length > 0 ? '#ff3366' : '#00ff88' },
                { label: 'CSSF Action', value: result.cssf_action_required ? 'REQUIRED' : 'CLEAR',
                  color: result.cssf_action_required ? '#ff3366' : '#00ff88' },
              ].map(m => (
                <div key={m.label} className="rounded p-2.5"
                  style={{ background: 'rgba(0,255,136,0.03)', border: '1px solid rgba(0,255,136,0.1)' }}>
                  <div className="text-[7px] text-[rgba(255,255,255,0.35)] uppercase tracking-wider">{m.label}</div>
                  <div className="text-sm font-bold mt-0.5" style={{ color: m.color }}>{m.value}</div>
                </div>
              ))}
            </div>

            {/* Per-requirement results */}
            <div className="space-y-1.5">
              {result.results.map(r => (
                <div key={r.id} className="flex items-center justify-between px-3 py-2 rounded"
                  style={{ background: 'rgba(0,255,136,0.02)', border: `1px solid ${STATUS_COLOR[r.gap_status]}22` }}>
                  <div className="flex items-center gap-2">
                    {r.gap_status === 'COMPLIANT'
                      ? <CheckCircle className="w-3 h-3 text-[#00ff88]" />
                      : <AlertTriangle className="w-3 h-3" style={{ color: SEV_COLOR[r.severity] }} />}
                    <span className="text-[9px] font-bold text-[rgba(255,255,255,0.7)]">{r.title}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[7px] uppercase font-bold" style={{ color: STATUS_COLOR[r.gap_status] }}>
                      {STATUS_LABEL[r.gap_status]}
                    </span>
                    <span className="text-[8px] font-bold" style={{ color: STATUS_COLOR[r.gap_status] }}>
                      {r.compliance_pct}%
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Certificate hash */}
            <div className="flex items-center justify-between px-3 py-2 rounded text-[7px]"
              style={{ background: 'rgba(0,255,136,0.03)', border: '1px solid rgba(0,255,136,0.1)' }}>
              <span className="text-[rgba(255,255,255,0.3)] uppercase tracking-wider">SHA3 Certificate Hash</span>
              <span className="text-[#00ff88] font-bold">{result.certificate_hash}</span>
            </div>
          </div>
        )}
        </>) }
      </div>
    </div>
  )
}
