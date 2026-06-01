'use client'

import { useState, useCallback, useRef } from 'react'
import { ArrowLeft, Upload, FileText, Loader2, AlertTriangle, CheckCircle2, Download, Sparkles, FileDown, Bookmark, BookmarkCheck } from 'lucide-react'

interface AnalysisGap { requirement: string; status: 'met' | 'partial' | 'missing'; note: string }
interface AnalysisResult {
  fundName: string
  fundType: string
  domicile: string
  estimatedAUM: string
  sfdrClassification: string
  investmentStrategy: string
  riskScore: number
  complianceScore: number
  verdict: string
  strengths: string[]
  risks: string[]
  gaps: AnalysisGap[]
  regulatoryFlags: string[]
}

export default function AnalyzePage() {
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [meta, setMeta] = useState<{ filename?: string; pageCount?: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [savingToDash, setSavingToDash] = useState(false)
  const [saved, setSaved] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are accepted')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('PDF too large (max 8 MB)')
      return
    }
    setLoading(true); setError(null); setResult(null); setMeta(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('/api/analyze/prospectus', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`)
        return
      }
      setResult(data.analysis)
      setMeta({ filename: data.filename, pageCount: data.pageCount })
    } catch (e) {
      setError(String(e))
    } finally { setLoading(false) }
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }, [handleFile])

  const saveToDashboard = useCallback(async () => {
    if (!result) return
    setSavingToDash(true)
    try {
      const res = await fetch('/api/saved/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fundName: result.fundName,
          fundType: result.fundType,
          domicile: result.domicile,
          complianceScore: result.complianceScore,
          verdict: result.verdict,
          source: 'analyzer',
        }),
      })
      if (res.status === 401) {
        // Not signed in — punt to login, preserving intent
        window.location.href = '/login?next=/analyze'
        return
      }
      if (res.ok) setSaved(true)
      else alert('Could not save — try again')
    } finally { setSavingToDash(false) }
  }, [result])

  const downloadPdf = useCallback(async () => {
    if (!result) return
    setDownloadingPdf(true)
    try {
      const res = await fetch('/api/report/compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fundName: result.fundName,
          fundType: result.fundType,
          score: result.complianceScore,
          grade: result.complianceScore >= 85 ? 'A' : result.complianceScore >= 70 ? 'B' : result.complianceScore >= 55 ? 'C' : 'D',
          verdict: result.verdict,
          strengths: result.strengths,
          risks: result.risks,
          gaps: result.gaps,
          regulatoryFlags: result.regulatoryFlags,
          metadata: { aum: result.estimatedAUM, jurisdiction: result.domicile },
        }),
      })
      if (!res.ok) { setError('PDF generation failed'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `genesis-swarm-${result.fundName.replace(/\W+/g,'-')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally { setDownloadingPdf(false) }
  }, [result])

  const gapColors: Record<string, string> = {
    met: '#00ff88', partial: '#ffaa00', missing: '#ff3366',
  }
  const scoreColor = result ? (result.complianceScore >= 80 ? '#00ff88' : result.complianceScore >= 60 ? '#ffaa00' : '#ff3366') : '#00ff88'

  return (
    <div className="min-h-screen bg-[#050508] text-white font-mono">
      {/* Header */}
      <header className="border-b border-[rgba(0,255,136,0.1)] px-6 py-3 flex items-center justify-between sticky top-0 z-30"
        style={{ background: 'rgba(5,5,8,0.95)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-3">
          <a href="/operator" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Dashboard
          </a>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#00ff88]" />
            <span className="text-sm font-bold tracking-[0.18em] text-[#00ff88]">AI PROSPECTUS ANALYZER</span>
          </div>
        </div>
        <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">
          Groq llama-3.3-70b · pdf-parse · DORA + AIFMD II + SFDR
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">

        {/* Drop zone */}
        {!result && (
          <>
            <div className="text-center mb-6">
              <h1 className="text-3xl md:text-4xl font-black mb-3 tracking-tight">
                Drop a fund prospectus.
                <br />
                <span style={{ background: 'linear-gradient(90deg, #00ff88 0%, #4a9eff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  Get instant compliance gaps.
                </span>
              </h1>
              <p className="text-[rgba(255,255,255,0.5)] text-sm max-w-xl mx-auto">
                Real PDF text extraction · Real Groq AI analysis · Real AIFMD II / DORA / SFDR / CSSF gap scoring.
                Your fund never leaves the analysis run — no storage, no training.
              </p>
            </div>

            <div
              onDragEnter={e => { e.preventDefault(); setDragOver(true) }}
              onDragOver={e => e.preventDefault()}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className="relative cursor-pointer rounded-2xl p-12 text-center transition-all"
              style={{
                background: dragOver ? 'rgba(0,255,136,0.05)' : 'rgba(255,255,255,0.02)',
                border: `2px dashed ${dragOver ? 'rgba(0,255,136,0.55)' : 'rgba(255,255,255,0.15)'}`,
                boxShadow: dragOver ? '0 0 40px rgba(0,255,136,0.15), inset 0 0 60px rgba(0,255,136,0.05)' : 'none',
              }}>
              <input ref={fileRef} type="file" accept="application/pdf,.pdf"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                className="hidden" />

              {loading ? (
                <>
                  <Loader2 className="w-12 h-12 text-[#00ff88] animate-spin mx-auto mb-4"
                    style={{ filter: 'drop-shadow(0 0 12px #00ff88)' }} />
                  <div className="text-[11px] uppercase tracking-[0.25em] text-[#00ff88] font-black mb-2">Analyzing…</div>
                  <div className="text-[10px] text-[rgba(255,255,255,0.4)]">
                    Extracting text · Running compliance analysis · Scoring gaps
                  </div>
                </>
              ) : (
                <>
                  <Upload className="w-12 h-12 mx-auto mb-4"
                    style={{ color: dragOver ? '#00ff88' : 'rgba(255,255,255,0.3)', filter: dragOver ? 'drop-shadow(0 0 8px #00ff88)' : 'none' }} />
                  <div className="text-base font-bold text-white mb-1">
                    {dragOver ? 'Drop to analyse' : 'Drop your fund prospectus PDF here'}
                  </div>
                  <div className="text-[11px] text-[rgba(255,255,255,0.4)] mb-3">
                    or click to browse · max 8 MB
                  </div>
                  <div className="flex items-center justify-center gap-3 text-[8px] uppercase tracking-widest text-[rgba(255,255,255,0.3)]">
                    <span>AIFMD II</span><span>·</span><span>DORA</span><span>·</span><span>SFDR</span><span>·</span><span>CSSF</span>
                  </div>
                </>
              )}
            </div>

            {error && (
              <div className="mt-4 flex items-center gap-2 p-3 rounded border border-[rgba(255,51,102,0.3)] bg-[rgba(255,51,102,0.05)] text-sm text-[#ff3366]">
                <AlertTriangle className="w-4 h-4" /> {error}
              </div>
            )}
          </>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-5">

            {/* Fund identity + score */}
            <div className="rounded-2xl p-6"
              style={{
                background: 'linear-gradient(135deg, rgba(0,255,136,0.04) 0%, rgba(74,158,255,0.03) 100%)',
                border: '1px solid rgba(0,255,136,0.2)',
                boxShadow: '0 0 50px rgba(0,255,136,0.06)',
              }}>
              <div className="flex items-start justify-between gap-6 mb-4">
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] uppercase tracking-[0.25em] text-[rgba(0,255,136,0.6)] font-black mb-1">FUND IDENTIFIED</div>
                  <h2 className="text-2xl md:text-3xl font-black text-white mb-1 truncate">{result.fundName}</h2>
                  <div className="flex items-center flex-wrap gap-2 text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.5)]">
                    <span className="text-[#00ff88]">{result.fundType}</span>
                    <span>·</span><span>{result.domicile}</span>
                    <span>·</span><span>{result.estimatedAUM}</span>
                    {result.sfdrClassification && result.sfdrClassification !== 'Unknown' && (
                      <><span>·</span><span className="text-[#4a9eff]">SFDR {result.sfdrClassification}</span></>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-black tabular-nums leading-none" style={{
                    fontSize: 'clamp(2.5rem, 6vw, 4rem)',
                    color: scoreColor,
                    textShadow: `0 0 30px ${scoreColor}88`,
                  }}>{result.complianceScore}</div>
                  <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] mt-1">/ 100 compliance</div>
                </div>
              </div>

              <div className="pt-4 border-t border-[rgba(255,255,255,0.06)]">
                <div className="text-[9px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] font-black mb-2">VERDICT</div>
                <p className="text-[14px] text-white leading-relaxed">{result.verdict}</p>
              </div>

              {result.regulatoryFlags?.length > 0 && (
                <div className="pt-4 mt-4 border-t border-[rgba(255,255,255,0.06)] flex flex-wrap gap-1.5">
                  {result.regulatoryFlags.map((f, i) => (
                    <span key={i} className="text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider"
                      style={{ background: 'rgba(255,170,0,0.08)', border: '1px solid rgba(255,170,0,0.3)', color: '#ffaa00' }}>
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Strengths + Risks */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl p-5"
                style={{ background: 'rgba(0,255,136,0.03)', border: '1px solid rgba(0,255,136,0.18)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#00ff88]" />
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#00ff88]">Strengths</span>
                </div>
                <ul className="space-y-2">
                  {result.strengths?.map((s, i) => (
                    <li key={i} className="text-[12px] leading-relaxed text-[rgba(255,255,255,0.85)] flex items-start gap-2">
                      <span className="text-[#00ff88] mt-0.5">+</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl p-5"
                style={{ background: 'rgba(255,51,102,0.03)', border: '1px solid rgba(255,51,102,0.18)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#ff3366]" />
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff3366]">Risk Factors</span>
                </div>
                <ul className="space-y-2">
                  {result.risks?.map((r, i) => (
                    <li key={i} className="text-[12px] leading-relaxed text-[rgba(255,255,255,0.85)] flex items-start gap-2">
                      <span className="text-[#ff3366] mt-0.5">!</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Gap analysis */}
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-[rgba(74,158,255,0.7)] font-black mb-3">REGULATORY GAP BREAKDOWN</div>
              <div className="space-y-2">
                {result.gaps?.map((g, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded"
                    style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${gapColors[g.status]}22` }}>
                    <div className="w-2 h-2 rounded-full" style={{ background: gapColors[g.status], boxShadow: `0 0 6px ${gapColors[g.status]}` }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-bold text-white">{g.requirement}</span>
                        <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: gapColors[g.status] }}>
                          {g.status}
                        </span>
                      </div>
                      <div className="text-[10px] text-[rgba(255,255,255,0.5)] mt-0.5">{g.note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button onClick={saveToDashboard} disabled={savingToDash || saved}
                className="flex items-center gap-2 px-5 py-3 rounded-md text-sm uppercase tracking-[0.15em] font-black"
                style={{
                  background: saved ? 'rgba(0,255,136,0.08)' : 'rgba(74,158,255,0.1)',
                  border: `1px solid ${saved ? 'rgba(0,255,136,0.5)' : 'rgba(74,158,255,0.4)'}`,
                  color: saved ? '#00ff88' : '#4a9eff',
                }}>
                {savingToDash ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                {savingToDash ? 'Saving…' : saved ? 'Saved to dashboard' : 'Save to dashboard'}
              </button>
              <button onClick={downloadPdf} disabled={downloadingPdf}
                className="flex items-center gap-2 px-5 py-3 rounded-md text-sm uppercase tracking-[0.15em] font-black"
                style={{
                  background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
                  color: '#000',
                  boxShadow: '0 0 24px rgba(0,255,136,0.4)',
                }}>
                {downloadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                {downloadingPdf ? 'Signing…' : 'Download Signed PDF'}
              </button>
              <button onClick={() => { setResult(null); setError(null); setMeta(null) }}
                className="flex items-center gap-2 px-5 py-3 rounded-md text-sm uppercase tracking-[0.15em] font-bold"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)' }}>
                Analyse another fund
              </button>
            </div>

            {meta && (
              <div className="text-center text-[8px] uppercase tracking-widest text-[rgba(255,255,255,0.3)] pt-4">
                ⓘ {meta.filename} · {meta.pageCount} pages · {result.fundName} fingerprint via Merkle SHA-256
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
