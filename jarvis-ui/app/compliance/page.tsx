'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProgressEvent {
  type: 'progress'
  worker_id: number
  worker_name: string
  status: 'RUNNING' | 'DONE' | 'ERROR' | 'SKIPPED'
  message: string
  elapsed_ms: number
}

interface ComplianceFlag {
  flag_id: string
  worker: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'
  title: string
  description: string
  citation: { document_id: string; section: string; article: string | null } | null
  remediation: string | null
}

interface RiskScore {
  overall: number
  leverage: number
  governance: number
  liquidity: number
  ict: number
  esg: number
}

interface ComplianceReport {
  session_id: string
  filename: string | null
  fund_structure: string
  source_language: string
  page_count: number
  pii_count: number
  gdpr_clean: boolean
  flags: ComplianceFlag[]
  critical_count: number
  high_count: number
  medium_count: number
  low_count: number
  risk_score: RiskScore
  verification: { passed: boolean; checks_run: number; checks_failed: number }
  sign_off_required: boolean
  recommendation: string
  content_hash: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WORKERS = [
  'W1 Ingestion', 'W2 Anonymizer', 'W3 Translator',
  'W4 CSSF Audit', 'W5 UCITS', 'W6 RAIF/SIF',
  'W7 DORA', 'W8 Risk Score', 'W9 Verifier', 'W10 Report',
]

const SEV_COLOUR: Record<string, string> = {
  CRITICAL: '#dc2626', HIGH: '#ea580c', MEDIUM: '#ca8a04',
  LOW: '#2563eb', INFO: '#6b7280',
}

const SEV_BG: Record<string, string> = {
  CRITICAL: 'rgba(220,38,38,0.12)', HIGH: 'rgba(234,88,12,0.10)',
  MEDIUM: 'rgba(202,138,4,0.10)', LOW: 'rgba(37,99,235,0.08)', INFO: 'rgba(107,114,128,0.06)',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CompliancePage() {
  const [token, setToken]         = useState('')
  const [file, setFile]           = useState<File | null>(null)
  const [dragging, setDragging]   = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connected, setConnected] = useState(false)
  const [workerStatus, setWorkerStatus] = useState<Record<number, ProgressEvent>>({})
  const [report, setReport]       = useState<ComplianceReport | null>(null)
  const [pdfB64, setPdfB64]       = useState<string | null>(null)
  const [auditSeq, setAuditSeq]   = useState<number | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [running, setRunning]     = useState(false)
  const [log, setLog]             = useState<string[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const pushLog = useCallback((msg: string) => {
    setLog(prev => [...prev.slice(-199), `[${new Date().toISOString().slice(11, 23)}] ${msg}`])
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  // ── Drag & drop ─────────────────────────────────────────────────────────────

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) { setFile(f); pushLog(`File loaded: ${f.name} (${(f.size / 1024).toFixed(1)} KB)`) }
  }, [pushLog])

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) { setFile(f); pushLog(`File loaded: ${f.name} (${(f.size / 1024).toFixed(1)} KB)`) }
  }, [pushLog])

  // ── Run pipeline ─────────────────────────────────────────────────────────────

  const runPipeline = useCallback(async () => {
    if (!file) return
    setError(null); setReport(null); setPdfB64(null); setAuditSeq(null)
    setWorkerStatus({}); setRunning(true); setConnecting(true)

    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
    const wsUrl   = apiBase.replace(/^http/, 'ws') + '/ws/compliance/review'
    const wsUrlWithToken = `${wsUrl}?token=${encodeURIComponent(token || 'dev')}`

    let ws: WebSocket
    try {
      ws = new WebSocket(wsUrlWithToken)
      wsRef.current = ws
    } catch (e) {
      setError(`WebSocket connect failed: ${e}`); setRunning(false); setConnecting(false); return
    }

    ws.onopen = async () => {
      setConnected(true); setConnecting(false)
      pushLog(`WSS connected → ${wsUrl}`)

      const arrayBuf = await file.arrayBuffer()
      const b64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)))
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'binary'
      const fmt = ext === 'pdf' ? 'pdf' : ext === 'html' ? 'html' : 'text'

      ws.send(JSON.stringify({
        filename:   file.name,
        format:     fmt,
        data:       b64,
      }))
      pushLog(`Sent ${file.name} (${fmt.toUpperCase()}) — awaiting pipeline…`)
    }

    ws.onmessage = (evt) => {
      let payload: unknown
      try { payload = JSON.parse(evt.data) } catch { return }

      if (Array.isArray(payload)) {
        // Progress batch
        for (const ev of payload as ProgressEvent[]) {
          if (ev.type === 'progress') {
            setWorkerStatus(prev => ({ ...prev, [ev.worker_id]: ev }))
            pushLog(`W${ev.worker_id} ${ev.worker_name} — ${ev.status} (${ev.elapsed_ms.toFixed(1)}ms)`)
          }
        }
        return
      }

      const msg = payload as { type: string; payload?: ComplianceReport; pdf_b64?: string; audit_seq?: number; message?: string }

      if (msg.type === 'report' && msg.payload) {
        setReport(msg.payload)
        if (msg.pdf_b64) setPdfB64(msg.pdf_b64)
        if (msg.audit_seq != null) setAuditSeq(msg.audit_seq)
        setRunning(false); setConnected(false)
        pushLog(`Report received — audit_seq=${msg.audit_seq ?? '?'} | ${msg.payload.recommendation.slice(0, 80)}`)
        ws.close()
      } else if (msg.type === 'error') {
        setError(msg.message ?? 'Unknown pipeline error')
        setRunning(false); setConnected(false)
        pushLog(`ERROR: ${msg.message}`)
        ws.close()
      }
    }

    ws.onerror = () => { setError('WebSocket error — check API URL and token'); setRunning(false); setConnecting(false) }
    ws.onclose = () => { setConnected(false); setConnecting(false) }
  }, [file, token, pushLog])

  // ── PDF download ─────────────────────────────────────────────────────────────

  const downloadPdf = useCallback(() => {
    if (!pdfB64 || !report) return
    const bin = atob(pdfB64)
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
    const blob = new Blob([arr], { type: 'application/pdf' })
    const url  = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `genesis_compliance_${report.session_id.slice(0, 8)}.pdf`
    a.click(); URL.revokeObjectURL(url)
  }, [pdfB64, report])

  // ── Render ────────────────────────────────────────────────────────────────────

  const verdictBg = (rec: string) => {
    if (rec.startsWith('⛔')) return 'rgba(220,38,38,0.15)'
    if (rec.startsWith('⚠')) return 'rgba(234,88,12,0.12)'
    if (rec.startsWith('ℹ')) return 'rgba(37,99,235,0.10)'
    return 'rgba(34,197,94,0.12)'
  }

  return (
    <div style={{ minHeight: '100vh', background: '#050a14', color: '#e2e8f0', fontFamily: "'SF Mono', 'Fira Code', monospace", padding: '24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? '#22c55e' : connecting ? '#f59e0b' : '#4b5563', boxShadow: connected ? '0 0 8px #22c55e' : 'none' }} />
        <span style={{ color: '#c9a84c', fontWeight: 700, fontSize: '14px', letterSpacing: '0.12em' }}>GENESIS SWARM</span>
        <span style={{ color: '#4b5563' }}>|</span>
        <span style={{ color: '#94a3b8', fontSize: '13px' }}>LUXEMBOURG COMPLIANCE REVIEW ENGINE</span>
        {auditSeq != null && <span style={{ marginLeft: 'auto', color: '#6366f1', fontSize: '11px' }}>AUDIT SEQ #{auditSeq}</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '20px', alignItems: 'start' }}>

        {/* Left column — controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* JWT Token */}
          <div style={{ background: '#0d1829', border: '1px solid #1e3a5f', borderRadius: 8, padding: '16px' }}>
            <div style={{ color: '#64748b', fontSize: '10px', letterSpacing: '0.1em', marginBottom: '8px' }}>JWT / API KEY</div>
            <input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Bearer token or API key"
              style={{ width: '100%', background: '#050a14', border: '1px solid #1e3a5f', borderRadius: 4, padding: '8px 10px', color: '#e2e8f0', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* File drop */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            style={{
              background: dragging ? 'rgba(99,102,241,0.15)' : '#0d1829',
              border: `2px dashed ${dragging ? '#6366f1' : file ? '#22c55e' : '#1e3a5f'}`,
              borderRadius: 8, padding: '24px 16px', textAlign: 'center', cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <input id="file-input" type="file" accept=".pdf,.txt,.html" style={{ display: 'none' }} onChange={onFileChange} />
            {file ? (
              <>
                <div style={{ color: '#22c55e', fontSize: '20px', marginBottom: 6 }}></div>
                <div style={{ color: '#94a3b8', fontSize: '12px' }}>{file.name}</div>
                <div style={{ color: '#4b5563', fontSize: '10px', marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB</div>
              </>
            ) : (
              <>
                <div style={{ color: '#4b5563', fontSize: '24px', marginBottom: 6 }}></div>
                <div style={{ color: '#64748b', fontSize: '12px' }}>Drop PDF / HTML / TXT</div>
                <div style={{ color: '#374151', fontSize: '10px', marginTop: 4 }}>or click to browse</div>
              </>
            )}
          </div>

          {/* Run button */}
          <button
            onClick={runPipeline}
            disabled={!file || running}
            style={{
              background: running ? '#1e3a5f' : file ? '#1a2e5a' : '#0d1829',
              border: `1px solid ${running ? '#6366f1' : file ? '#3b82f6' : '#1e3a5f'}`,
              borderRadius: 6, padding: '12px', color: running ? '#818cf8' : file ? '#93c5fd' : '#4b5563',
              fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', cursor: file && !running ? 'pointer' : 'default',
              transition: 'all 0.2s', width: '100%',
            }}
          >
            {running ? '⟳  PIPELINE RUNNING…' : '▶  RUN COMPLIANCE REVIEW'}
          </button>

          {/* Workers */}
          <div style={{ background: '#0d1829', border: '1px solid #1e3a5f', borderRadius: 8, padding: '14px' }}>
            <div style={{ color: '#64748b', fontSize: '10px', letterSpacing: '0.1em', marginBottom: '10px' }}>10-WORKER PIPELINE</div>
            {WORKERS.map((name, i) => {
              const id   = i + 1
              const ev   = workerStatus[id]
              const done = ev?.status === 'DONE'
              const err  = ev?.status === 'ERROR'
              const run  = ev?.status === 'RUNNING'
              return (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', borderBottom: i < 9 ? '1px solid #0f1f35' : 'none' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: err ? '#dc2626' : done ? '#22c55e' : run ? '#f59e0b' : '#1e3a5f', boxShadow: run ? '0 0 6px #f59e0b' : done ? '0 0 4px #22c55e' : 'none' }} />
                  <span style={{ color: done ? '#94a3b8' : run ? '#fbbf24' : '#374151', fontSize: '11px', flex: 1 }}>{name}</span>
                  {ev && <span style={{ color: '#4b5563', fontSize: '9px' }}>{ev.elapsed_ms.toFixed(0)}ms</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Right column — results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Error */}
          {error && (
            <div style={{ background: 'rgba(220,38,38,0.12)', border: '1px solid #dc2626', borderRadius: 8, padding: '14px 16px', color: '#fca5a5', fontSize: '12px' }}>
              {error}
            </div>
          )}

          {/* Report */}
          {report && (
            <>
              {/* Verdict banner */}
              <div style={{ background: verdictBg(report.recommendation), border: '1px solid #1e3a5f', borderRadius: 8, padding: '16px 20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, lineHeight: 1.5, color: '#e2e8f0' }}>{report.recommendation}</div>
                <div style={{ marginTop: 8, display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                  {[
                    ['Fund', report.fund_structure],
                    ['Language', report.source_language],
                    ['Pages', String(report.page_count)],
                    ['PII tokens', String(report.pii_count)],
                    ['GDPR', report.gdpr_clean ? 'Clean' : 'Review'],
                  ].map(([k, v]) => (
                    <span key={k} style={{ fontSize: '10px', color: '#64748b' }}>{k}: <span style={{ color: '#94a3b8' }}>{v}</span></span>
                  ))}
                  {pdfB64 && (
                    <button onClick={downloadPdf} style={{ marginLeft: 'auto', background: '#1a2e5a', border: '1px solid #3b82f6', borderRadius: 4, padding: '4px 12px', color: '#93c5fd', fontSize: '10px', cursor: 'pointer', letterSpacing: '0.05em' }}>
                      ↓ DOWNLOAD PDF
                    </button>
                  )}
                </div>
              </div>

              {/* Risk scores */}
              <div style={{ background: '#0d1829', border: '1px solid #1e3a5f', borderRadius: 8, padding: '14px 16px' }}>
                <div style={{ color: '#64748b', fontSize: '10px', letterSpacing: '0.1em', marginBottom: '10px' }}>RISK SCORE DASHBOARD</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {[
                    ['OVERALL', report.risk_score.overall],
                    ['LEVERAGE', report.risk_score.leverage],
                    ['GOVERNANCE', report.risk_score.governance],
                    ['LIQUIDITY', report.risk_score.liquidity],
                    ['ICT/DORA', report.risk_score.ict],
                    ['ESG', report.risk_score.esg],
                  ].map(([k, v]) => {
                    const score = Number(v)
                    const col = score >= 60 ? '#dc2626' : score >= 30 ? '#f59e0b' : '#22c55e'
                    return (
                      <div key={k} style={{ background: '#050a14', border: '1px solid #1e3a5f', borderRadius: 6, padding: '10px 12px' }}>
                        <div style={{ color: '#4b5563', fontSize: '9px', marginBottom: 4 }}>{k}</div>
                        <div style={{ color: col, fontSize: '20px', fontWeight: 700 }}>{score.toFixed(0)}</div>
                        <div style={{ height: 3, background: '#1e3a5f', borderRadius: 2, marginTop: 6 }}>
                          <div style={{ height: '100%', width: `${Math.min(score, 100)}%`, background: col, borderRadius: 2, transition: 'width 0.8s ease' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Flag counts */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                {[
                  ['CRITICAL', report.critical_count, '#dc2626'],
                  ['HIGH', report.high_count, '#ea580c'],
                  ['MEDIUM', report.medium_count, '#ca8a04'],
                  ['LOW', report.low_count, '#2563eb'],
                ].map(([sev, count, col]) => (
                  <div key={sev as string} style={{ background: '#0d1829', border: `1px solid ${col as string}40`, borderRadius: 8, padding: '12px', textAlign: 'center' }}>
                    <div style={{ color: col as string, fontSize: '22px', fontWeight: 700 }}>{count as number}</div>
                    <div style={{ color: '#4b5563', fontSize: '9px', marginTop: 2, letterSpacing: '0.08em' }}>{sev as string}</div>
                  </div>
                ))}
              </div>

              {/* Flags table */}
              {report.flags.filter(f => f.severity !== 'INFO').length > 0 && (
                <div style={{ background: '#0d1829', border: '1px solid #1e3a5f', borderRadius: 8, padding: '14px 16px' }}>
                  <div style={{ color: '#64748b', fontSize: '10px', letterSpacing: '0.1em', marginBottom: '10px' }}>COMPLIANCE FLAGS</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '420px', overflowY: 'auto' }}>
                    {report.flags
                      .filter(f => f.severity !== 'INFO')
                      .sort((a, b) => ['CRITICAL','HIGH','MEDIUM','LOW'].indexOf(a.severity) - ['CRITICAL','HIGH','MEDIUM','LOW'].indexOf(b.severity))
                      .map(flag => (
                        <div key={flag.flag_id} style={{ background: SEV_BG[flag.severity], border: `1px solid ${SEV_COLOUR[flag.severity]}30`, borderLeft: `3px solid ${SEV_COLOUR[flag.severity]}`, borderRadius: 4, padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                            <span style={{ color: SEV_COLOUR[flag.severity], fontSize: '10px', fontWeight: 700, minWidth: 60, paddingTop: 1 }}>{flag.severity}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ color: '#e2e8f0', fontSize: '12px', fontWeight: 600 }}>{flag.title}</div>
                              {flag.citation && (
                                <div style={{ color: '#6366f1', fontSize: '10px', marginTop: 2 }}>
                                  Citation: {flag.citation.document_id}, {flag.citation.section}{flag.citation.article ? `, ${flag.citation.article}` : ''}
                                </div>
                              )}
                              {flag.remediation && (
                                <div style={{ color: '#64748b', fontSize: '10px', marginTop: 4, lineHeight: 1.5 }}>{flag.remediation}</div>
                              )}
                            </div>
                            <span style={{ color: '#374151', fontSize: '9px', flexShrink: 0 }}>{flag.worker}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Verification */}
              <div style={{ background: '#0d1829', border: `1px solid ${report.verification.passed ? '#22c55e40' : '#dc262640'}`, borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '18px' }}>{report.verification.passed ? '' : ''}</span>
                <div>
                  <div style={{ color: report.verification.passed ? '#22c55e' : '#dc2626', fontSize: '12px', fontWeight: 700 }}>
                    Mathematical Verification: {report.verification.passed ? 'PASSED' : `FAILED — ${report.verification.checks_failed} violation(s)`}
                  </div>
                  <div style={{ color: '#4b5563', fontSize: '10px', marginTop: 2 }}>{report.verification.checks_run} regulatory thresholds checked</div>
                </div>
              </div>

              {/* HITL disclaimer */}
              <div style={{ background: '#0d1829', border: '1px solid #1e3a5f', borderRadius: 8, padding: '12px 16px', color: '#4b5563', fontSize: '10px', lineHeight: 1.6, textAlign: 'center' }}>
                HUMAN-IN-THE-LOOP — For review by a certified compliance officer only.
                This output does not constitute legal advice and must not be relied upon as a final compliance determination.
              </div>
            </>
          )}

          {/* Live log */}
          <div style={{ background: '#0d1829', border: '1px solid #1e3a5f', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ color: '#64748b', fontSize: '10px', letterSpacing: '0.1em', marginBottom: '8px' }}>PIPELINE LOG</div>
            <div ref={logRef} style={{ height: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {log.length === 0
                ? <span style={{ color: '#374151', fontSize: '11px' }}>Awaiting document…</span>
                : log.map((line, i) => (
                    <div key={i} style={{ color: line.includes('ERROR') ? '#fca5a5' : line.includes('DONE') || line.includes('Report') ? '#86efac' : '#4b5563', fontSize: '10px', fontFamily: 'monospace' }}>{line}</div>
                  ))
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
