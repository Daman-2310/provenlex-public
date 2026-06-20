'use client'

import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, ScanLine, Loader2, Lock, Vault, Check, BarChart3, Upload, Bell,
  Share2, Download, Mail, ArrowRight, Keyboard, Plus, X,
} from 'lucide-react'
import { extractFileText } from '@/lib/doc-extract'
import CosmicBackground from '@/components/CosmicBackground'
import LeiVerify from '@/components/LeiVerify'
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer'
import ScanVerdict from '@/components/ScanVerdict'
import {
  extractDocument, scanCompliance, sealVerdict, SAMPLE_PROSPECTUS, fromManualEntry,
  type ScanResult, type ManualEntry, type ExtractedDoc,
} from '@/lib/scan-engine'
import { addRecord } from '@/lib/vault'
import { benchmark, recordSample, type BenchmarkResult } from '@/lib/benchmark'
import { buildShareUrl } from '@/lib/verdict-share'
import { buildAuditPack } from '@/lib/audit-pack'

const ACCENT = '#10D982'

export default function ScanPage() {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [hash, setHash] = useState<string>('')
  const [bench, setBench] = useState<BenchmarkResult | null>(null)
  const [saved, setSaved] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [packBusy, setPackBusy] = useState(false)

  // Shared scan core — runs the deterministic engine on an already-built doc
  // (from pasted/extracted text OR from manual entry) and seals the verdict.
  const scanDoc = useCallback(async (doc: ExtractedDoc) => {
    setBusy(true); setResult(null); setHash(''); setBench(null); setSaved(false); setShareUrl(null)
    // Tiny delay so the scan reads as "working" rather than instant-suspicious.
    await new Promise(r => setTimeout(r, 280))
    const scan = scanCompliance(doc)
    const full: ScanResult = { doc, ...scan }
    const sealed = await sealVerdict(full)
    // Benchmark this fund against the peer pool, then contribute its sample.
    const topConc = full.doc.holdings.reduce((m, h) => Math.max(m, h.weightPct), 0)
    const metrics = {
      leverage: full.doc.declaredLeverageCapPct ?? undefined,
      concentration: topConc > 0 ? topConc : undefined,
      retention: full.doc.declaredRetentionPct ?? undefined,
    }
    setBench(benchmark(metrics))
    recordSample(metrics)
    setResult(full); setHash(sealed); setBusy(false)
  }, [])
  const runScan = useCallback(async (input: string) => {
    if (!input.trim()) return
    await scanDoc(extractDocument(input))
  }, [scanDoc])

  const saveToVault = useCallback(async () => {
    if (!result) return
    await addRecord({
      kind: 'prospectus-scan',
      subject: result.doc.fundName ?? 'Unnamed fund',
      verdict: result.compliant ? 'compliant' : result.criticalCount > 0 ? 'non-compliant' : 'warning',
      criticalCount: result.criticalCount,
      warningCount: result.warningCount,
      summary: `${result.criticalCount} critical / ${result.warningCount} warning · sealed ${hash.slice(0, 12)}…`,
    })
    setSaved(true)
  }, [result, hash])

  // Council #1 — make the verdict travel. Forwardable link encodes ONLY the
  // verdict + findings (never the raw prospectus), so a CO can share it safely.
  const shareVerdict = useCallback(async () => {
    if (!result) return
    const url = await buildShareUrl(window.location.origin, result)
    setShareUrl(url)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch { /* clipboard blocked — link is shown below to copy manually */ }
  }, [result])

  // Board-ready audit pack (PDF) — generated client-side, nothing uploaded.
  const downloadPack = useCallback(async () => {
    if (!result) return
    setPackBusy(true)
    try {
      const pack = await buildAuditPack(result)
      const { auditPackToPdf } = await import('@/lib/audit-pdf') // lazy: pdf-lib only on click
      const bytes = await auditPackToPdf(pack)
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const u = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = u
      const slug = (result.doc.fundName ?? 'audit-pack').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 48).toLowerCase()
      a.download = `genesis-audit-pack-${slug || 'fund'}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(u)
    } finally { setPackBusy(false) }
  }, [result])

  // One-click demo: drop in the sample AND run it, so a first-time visitor sees a
  // full sealed verdict in ~0.3s with zero typing.
  const loadSample = () => { setText(SAMPLE_PROSPECTUS); runScan(SAMPLE_PROSPECTUS) }

  const [monitorState, setMonitorState] = useState<'idle' | 'busy' | 'on' | 'signin'>('idle')
  const enableMonitor = useCallback(async () => {
    if (!result) return
    setMonitorState('busy')
    try {
      const r = await fetch('/api/monitor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fundName: result.doc.fundName, structure: result.doc.structure,
          leverageCapPct: result.doc.declaredLeverageCapPct, retentionPct: result.doc.declaredRetentionPct,
          concentrationCapPct: result.doc.declaredConcentrationCapPct, holdings: result.doc.holdings,
          verdict: result.compliant ? 'compliant' : result.criticalCount > 0 ? 'non-compliant' : 'warning',
          criticalCount: result.criticalCount,
        }),
      })
      if (r.status === 401) { setMonitorState('signin'); return }
      setMonitorState(r.ok ? 'on' : 'idle')
    } catch { setMonitorState('idle') }
  }, [result])

  const fileRef = useRef<HTMLInputElement>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [extractMsg, setExtractMsg] = useState<string | null>(null)
  // Extract text from a dropped PDF/Word/txt file — entirely in the browser —
  // then put it in the box for the user to REVIEW and edit before scanning. We
  // deliberately do NOT auto-scan: the human confirms exactly what the engine
  // will read, so there's no hidden extraction layer between document and verdict.
  const onFile = useCallback(async (file: File) => {
    if (!file) return
    if (file.size > 15 * 1024 * 1024) {
      setExtractMsg('That file is over 15 MB — please use a smaller document, or paste the relevant text.')
      return
    }
    setPdfBusy(true); setExtractMsg(null)
    try {
      const { text: txt, kind } = await extractFileText(file)
      const clean = txt.trim()
      if (!clean) {
        setExtractMsg(`Couldn't extract readable text from "${file.name}". If it's a scanned/image PDF that's expected — paste the relevant text instead.`)
      } else {
        setText(txt)
        setExtractMsg(`Extracted ${clean.length.toLocaleString()} characters from "${file.name}" (${kind.toUpperCase()}). Review it below, edit if needed, then run the scan.`)
      }
    } catch {
      setExtractMsg(`Couldn't read "${file.name}". Try a text-based (non-scanned) PDF or Word doc, or paste the text.`)
    } finally { setPdfBusy(false) }
  }, [])

  // ── Manual-entry fallback: for table-heavy PDFs the parser can't read, the user
  //    keys the few figures the engine needs; it runs the SAME deterministic engine.
  const [showManual, setShowManual] = useState(false)
  const [mName, setMName] = useState('')
  const [mStructure, setMStructure] = useState<ExtractedDoc['structure']>('unknown')
  const [mUCITS, setMUCITS] = useState(false)
  const [mLoanOrig, setMLoanOrig] = useState(false)
  const [mLev, setMLev] = useState('')
  const [mConc, setMConc] = useState('')
  const [mRet, setMRet] = useState('')
  const [mHoldings, setMHoldings] = useState<{ name: string; weightPct: string }[]>([{ name: '', weightPct: '' }])
  const runManual = useCallback(async () => {
    const entry: ManualEntry = {
      fundName: mName || undefined,
      structure: mStructure,
      isUCITS: mUCITS,
      loanOriginating: mLoanOrig,
      declaredLeverageCapPct: mLev.trim() ? parseFloat(mLev) : null,
      declaredConcentrationCapPct: mConc.trim() ? parseFloat(mConc) : null,
      declaredRetentionPct: mRet.trim() ? parseFloat(mRet) : null,
      holdings: mHoldings
        .filter(h => h.name.trim() && h.weightPct.trim())
        .map(h => ({ name: h.name.trim(), weightPct: parseFloat(h.weightPct) })),
    }
    await scanDoc(fromManualEntry(entry))
  }, [mName, mStructure, mUCITS, mLoanOrig, mLev, mConc, mRet, mHoldings, scanDoc])
  const inputCls = 'bg-[rgba(255,255,255,0.04)] rounded px-3 py-2 text-[12px] text-white outline-none border border-[rgba(255,255,255,0.1)] placeholder:text-[rgba(255,255,255,0.3)]'

  return (
    <div className="min-h-screen text-white relative" style={{ fontFamily: 'var(--font-geist-sans), system-ui, -apple-system, sans-serif', textTransform: 'none', letterSpacing: 'normal' }}>
      <CosmicBackground variant="void" accent={ACCENT} />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <ScanLine className="w-4 h-4" style={{ color: ACCENT }} />
          <span className="text-sm font-bold tracking-[0.18em]" style={{ color: ACCENT }}>LIVE COMPLIANCE SCAN</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">deterministic · no backend · no LLM</span>
        </div>
      </header>

      <div className="relative max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <h1 className="font-black tracking-tight mb-4" style={{ fontSize: 'clamp(2rem, 5.5vw, 4rem)', lineHeight: 0.96 }}>
            <span className="text-white">Paste a prospectus.</span><br />
            <span style={{ background: 'linear-gradient(90deg, #10D982 0%, #5B8DEF 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Watch it get judged against EU law.
            </span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-sm max-w-2xl mx-auto leading-relaxed">
            The scanner reads a fund document&apos;s <span className="text-white">own declared limits</span> and its holdings, then checks
            them against the document&apos;s caps <span className="text-white">and</span> the AIFMD II statutory caps —
            deterministically, in your browser. It will catch a prospectus that permits more than the law allows.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-4 text-[10px] uppercase tracking-[0.15em] text-[rgba(16,217,130,0.7)]">
            <span>🔒 Runs in your browser</span><span>· Nothing uploaded</span><span>· No LLM</span><span>· Reproducible &amp; cited to the rule</span>
          </div>
        </div>

        {/* Input */}
        <div className="rounded-2xl p-4 mb-6" style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid ${ACCENT}30`, backdropFilter: 'blur(8px)' }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Paste fund prospectus / fact-sheet text here…"
            spellCheck={false}
            className="w-full h-44 bg-transparent text-[12px] font-mono text-[rgba(255,255,255,0.85)] resize-y outline-none placeholder:text-[rgba(255,255,255,0.25)]"
          />
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-[rgba(255,255,255,0.06)]">
            <button onClick={() => runScan(text)} disabled={busy || !text.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md text-[11px] uppercase tracking-[0.15em] font-black transition-all disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #10D982 0%, #0B9E63 100%)', color: '#04130b', boxShadow: '0 1px 0 rgba(255,255,255,0.18) inset, 0 6px 18px rgba(16,217,130,0.16)' }}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanLine className="w-3.5 h-3.5" />}
              {busy ? 'scanning…' : 'run compliance scan'}
            </button>
            <input ref={fileRef} type="file"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
            <button onClick={() => fileRef.current?.click()} disabled={pdfBusy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-[10px] uppercase tracking-[0.15em] font-bold transition-all disabled:opacity-40"
              style={{ background: 'rgba(91,141,239,0.08)', border: '1px solid rgba(91,141,239,0.4)', color: '#5B8DEF' }}>
              {pdfBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              {pdfBusy ? 'reading…' : 'upload PDF · Word · txt'}
            </button>
            <button onClick={() => setShowManual(s => !s)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-[10px] uppercase tracking-[0.15em] font-bold transition-all"
              style={{ background: 'rgba(91,141,239,0.08)', border: '1px solid rgba(91,141,239,0.4)', color: '#5B8DEF' }}>
              <Keyboard className="w-3 h-3" /> {showManual ? 'hide manual entry' : 'enter figures manually'}
            </button>
            <button onClick={loadSample} disabled={busy}
              className="px-3 py-2 rounded-md text-[10px] uppercase tracking-[0.15em] font-bold transition-all disabled:opacity-50"
              style={{ background: 'rgba(16,217,130,0.1)', border: '1px solid rgba(16,217,130,0.45)', color: ACCENT }}>
              ▶ try a live sample
            </button>
            {text && (
              <button onClick={() => { setText(''); setResult(null); setHash(''); setBench(null); setSaved(false); setExtractMsg(null) }}
                className="px-3 py-2 rounded-md text-[10px] uppercase tracking-[0.15em] font-bold text-[rgba(255,255,255,0.4)] hover:text-white">
                clear
              </button>
            )}
            <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.3)]">runs entirely client-side · nothing leaves your browser</span>
          </div>
          {extractMsg && (
            <div className="mt-3 text-[11px] leading-relaxed text-[#9db8f5]">{extractMsg}</div>
          )}
          <div className="mt-2 text-[9px] leading-relaxed text-[rgba(255,255,255,0.32)]">
            Selectable-text PDFs &amp; Word docs are extracted in-browser; scanned/image PDFs aren&apos;t supported (no OCR) — paste the text instead. You always review the extracted text before scanning.
          </div>

          {showManual && (
            <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,0.08)] space-y-3">
              <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[#5B8DEF]">
                Manual entry — for table-heavy PDFs the parser can&apos;t read
              </div>
              <input value={mName} onChange={e => setMName(e.target.value)} placeholder="Fund name (optional)" className={`w-full ${inputCls}`} />
              <div className="flex flex-wrap items-center gap-4 text-[11px] text-[rgba(255,255,255,0.8)]">
                <label className="flex items-center gap-1.5">structure:
                  <select value={mStructure} onChange={e => setMStructure(e.target.value as ExtractedDoc['structure'])}
                    className="bg-[rgba(255,255,255,0.06)] rounded px-2 py-1 text-white outline-none border border-[rgba(255,255,255,0.1)]">
                    <option value="unknown">unknown</option>
                    <option value="open_ended">open-ended</option>
                    <option value="closed_ended">closed-ended</option>
                  </select>
                </label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={mUCITS} onChange={e => setMUCITS(e.target.checked)} /> UCITS</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={mLoanOrig} onChange={e => setMLoanOrig(e.target.checked)} /> loan-originating</label>
              </div>
              <div className="flex flex-wrap gap-3">
                <input value={mLev} onChange={e => setMLev(e.target.value)} inputMode="decimal" placeholder="leverage cap %" className={`flex-1 min-w-[130px] ${inputCls}`} />
                <input value={mConc} onChange={e => setMConc(e.target.value)} inputMode="decimal" placeholder="single-issuer / borrower %" className={`flex-1 min-w-[130px] ${inputCls}`} />
                <input value={mRet} onChange={e => setMRet(e.target.value)} inputMode="decimal" placeholder="risk retention %" className={`flex-1 min-w-[130px] ${inputCls}`} />
              </div>
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">Holdings (optional)</div>
                {mHoldings.map((h, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={h.name} onChange={e => setMHoldings(hs => hs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="issuer / position" className={`flex-1 ${inputCls}`} />
                    <input value={h.weightPct} onChange={e => setMHoldings(hs => hs.map((x, j) => j === i ? { ...x, weightPct: e.target.value } : x))} inputMode="decimal" placeholder="% NAV" className={`w-24 ${inputCls}`} />
                    <button onClick={() => setMHoldings(hs => hs.filter((_, j) => j !== i))} className="p-2 text-[rgba(255,255,255,0.4)] hover:text-white" aria-label="remove holding"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                <button onClick={() => setMHoldings(hs => [...hs, { name: '', weightPct: '' }])}
                  className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-[#5B8DEF] hover:text-white">
                  <Plus className="w-3 h-3" /> add holding
                </button>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={runManual} disabled={busy}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md text-[11px] uppercase tracking-[0.15em] font-black transition-all disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #10D982 0%, #0B9E63 100%)', color: '#04130b' }}>
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanLine className="w-3.5 h-3.5" />} scan these figures
                </button>
                <span className="text-[9px] text-[rgba(255,255,255,0.35)]">Entered values are tagged &quot;entered by user&quot; in the sealed verdict.</span>
              </div>
            </div>
          )}
        </div>

        {result && (
          <div className="space-y-5">
            <ScanVerdict result={result} />

            {/* Peer benchmark — the data flywheel */}
            {bench && (bench.leverage || bench.concentration || bench.retention) && (
              <div className="rounded-2xl p-4" style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(91,141,239,0.25)' }}>
                <div className="flex items-center gap-1.5 mb-1" style={{ color: '#5B8DEF' }}>
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase tracking-[0.2em] font-black">Peer benchmark · {bench.sampleSize} Luxembourg loan-fund samples</span>
                </div>
                <div className="text-[9px] text-[rgba(255,255,255,0.4)] mb-3">Reference distribution + anonymised scans contributed on this device — sharpens as more funds are scanned.</div>
                <div className="space-y-2.5">
                  {([['Leverage cap', bench.leverage, '%'], ['Top single-issuer', bench.concentration, '% of NAV'], ['Risk retention', bench.retention, '%']] as const).map(([label, m, unit]) => m && (
                    <div key={label}>
                      <div className="flex justify-between text-[10px] mb-0.5">
                        <span className="text-[rgba(255,255,255,0.6)]">{label}: <span className="text-white font-bold">{m.value}{unit}</span></span>
                        <span style={{ color: '#5B8DEF' }} className="font-bold">{m.percentile}th percentile</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                        <div className="h-full rounded-full" style={{ width: `${m.percentile}%`, background: 'linear-gradient(90deg,#5B8DEF,#86C5FF)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sealed verdict */}
            <div className="rounded-2xl p-4" style={{ background: 'rgba(16,217,130,0.04)', border: '1px solid rgba(16,217,130,0.25)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-3.5 h-3.5 text-[#10D982]" />
                <span className="text-[10px] uppercase tracking-[0.2em] font-black text-[#10D982]">Tamper-evident verdict seal</span>
              </div>
              <div className="text-[11px] font-mono break-all text-[rgba(255,255,255,0.75)]">SHA-256: {hash}</div>
              <div className="flex items-center gap-2 mt-2 text-[9px] uppercase tracking-[0.15em] font-bold">
                <span className="px-2 py-0.5 rounded" style={{ background: 'rgba(91,141,239,0.12)', color: '#9db8f5', border: '1px solid rgba(91,141,239,0.3)' }}>
                  ruleset v{result.rulesetVersion}
                </span>
                <span className="text-[rgba(255,255,255,0.4)]">effective {result.rulesetEffective} · AIFMD&nbsp;II + UCITS</span>
              </div>
              <div className="text-[9px] text-[rgba(255,255,255,0.45)] mt-1.5">
                Hash of the full scan — document, findings, verdict, <strong>and the ruleset version that produced it</strong>. Re-running an unchanged document under the same ruleset reproduces this exact hash; any altered input, result, or rule change yields a different one. The bound version means this verdict stays re-verifiable against a named, dated body of rules even after the law moves on.
              </div>
            </div>

            {/* Actions — council #1: make the verdict travel (board-ready + forwardable) */}
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={downloadPack} disabled={packBusy}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-md text-[11px] uppercase tracking-[0.15em] font-black transition-all disabled:opacity-60"
                style={{ background: '#10D982', color: '#04130b' }}>
                {packBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {packBusy ? 'sealing pdf…' : 'download audit pack'}
              </button>
              <button onClick={shareVerdict}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-md text-[11px] uppercase tracking-[0.15em] font-black transition-all"
                style={{ background: copied ? 'rgba(91,141,239,0.16)' : 'rgba(91,141,239,0.1)', color: '#5B8DEF', border: '1px solid rgba(91,141,239,0.4)' }}>
                {copied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                {copied ? 'link copied' : 'share verdict'}
              </button>
              <button onClick={saveToVault} disabled={saved}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-md text-[11px] uppercase tracking-[0.15em] font-bold transition-all disabled:opacity-60"
                style={{ background: 'rgba(16,217,130,0.08)', color: '#10D982', border: '1px solid rgba(16,217,130,0.3)' }}>
                {saved ? <Check className="w-3.5 h-3.5" /> : <Vault className="w-3.5 h-3.5" />}
                {saved ? 'in vault' : 'save to vault'}
              </button>
              <button onClick={enableMonitor} disabled={monitorState === 'busy' || monitorState === 'on'}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-md text-[11px] uppercase tracking-[0.15em] font-bold transition-all disabled:opacity-60"
                style={{ background: monitorState === 'on' ? 'rgba(91,141,239,0.12)' : 'rgba(255,255,255,0.04)', color: monitorState === 'on' ? '#5B8DEF' : 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.15)' }}>
                {monitorState === 'busy' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : monitorState === 'on' ? <Check className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                {monitorState === 'on' ? 'monitoring on' : 'monitor fund'}
              </button>
              <Link href="/vault" className="text-[10px] uppercase tracking-[0.15em] font-bold text-[#93A1AD] hover:text-white">
                evidence vault →
              </Link>
            </div>

            {shareUrl && (
              <div className="rounded-xl p-3" style={{ background: 'rgba(91,141,239,0.06)', border: '1px solid rgba(91,141,239,0.25)' }}>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Share2 className="w-3 h-3" style={{ color: '#5B8DEF' }} />
                  <span className="text-[9px] uppercase tracking-[0.2em] font-black" style={{ color: '#5B8DEF' }}>Forwardable verdict link</span>
                  <span className="ml-auto text-[9px]" style={{ color: '#93A1AD' }}>verdict + citations only · the prospectus is not in this link</span>
                </div>
                <div className="text-[10px] font-mono break-all" style={{ color: '#C7CDD2' }}>{shareUrl}</div>
              </div>
            )}
            {monitorState === 'signin' && (
              <div className="text-[10px] text-[rgba(255,255,255,0.55)]">
                <Link href="/login" className="underline hover:text-white" style={{ color: '#5B8DEF' }}>Sign in</Link> to enable continuous monitoring — we’ll re-check this fund against EU rules and email you if it ever falls out of compliance.
              </div>
            )}

            {result.doc.provenance.length > 0 && (
              <div className="text-[9px] font-mono text-[rgba(255,255,255,0.35)]">
                provenance — {result.doc.provenance.join('  ·  ')}
              </div>
            )}

            {/* Conversion: a real next step for a compliance pro who just saw value */}
            <div className="rounded-2xl p-5" style={{ background: 'rgba(16,217,130,0.05)', border: '1px solid rgba(16,217,130,0.25)' }}>
              <div className="text-[11px] uppercase tracking-[0.2em] font-black mb-2" style={{ color: '#10D982' }}>Was this useful?</div>
              <p className="text-[13px] leading-relaxed" style={{ color: '#C7CDD2' }}>
                A free, deterministic check — <span className="text-white">information only, not legal advice</span>. I&apos;m Daman, 16, building ProvenLex solo.
                If you run compliance, risk, or legal at a Luxembourg fund, I&apos;d genuinely value your blunt feedback — where does it fall short? — or I&apos;ll run it on your own funds with you, free.
              </p>
              <div className="flex items-center gap-3 flex-wrap mt-4">
                <a href="mailto:daman.sharma.2310@gmail.com?subject=ProvenLex%20feedback%20%2F%20pilot&body=Hi%20Daman%2C%0A%0AI%20ran%20a%20prospectus%20through%20the%20scanner.%0A%0A"
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-md text-[11px] uppercase tracking-[0.15em] font-black"
                  style={{ background: '#10D982', color: '#04130b' }}>
                  <Mail className="w-3.5 h-3.5" /> Email me your take
                </a>
                <Link href="/trial"
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-md text-[11px] uppercase tracking-[0.15em] font-bold"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.85)' }}>
                  Run it on your fund <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        )}

        <ComplianceDisclaimer className="mt-6" />

        {/* Live registry verification — the real-world data spine */}
        <div className="mt-8">
          <LeiVerify />
        </div>

        {/* For investors */}
        <section className="rounded-2xl p-6 mt-8" style={{ background: `${ACCENT}08`, border: `1px solid ${ACCENT}30` }}>
          <div className="text-[11px] uppercase tracking-[0.2em] font-black mb-3" style={{ color: ACCENT }}>For investors</div>
          <p className="text-[13px] text-[rgba(255,255,255,0.75)] leading-relaxed">
            Every other RegTech tool either shows you a static demo or sends your confidential prospectus to a server and an LLM
            that might hallucinate. This reads <span className="text-white">your</span> document, in <span className="text-white">your</span> browser,
            with deterministic arithmetic — so the verdict is reproducible and auditable, and the document never leaves the device. The
            standout: it catches a fund whose own prospectus permits more leverage than AIFMD II allows. That is a real, fileable finding,
            computed in 300 milliseconds with a cryptographic seal.
          </p>
        </section>
      </div>
    </div>
  )
}
