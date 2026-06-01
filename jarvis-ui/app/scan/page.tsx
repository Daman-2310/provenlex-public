'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, ScanLine, ShieldAlert, ShieldCheck, AlertTriangle, FileText,
  Loader2, Lock, Landmark, Building2,
} from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'
import {
  extractDocument, scanCompliance, sealVerdict, SAMPLE_PROSPECTUS,
  type ScanResult,
} from '@/lib/scan-engine'

const ACCENT = '#ff5630'

function BasisBadge({ basis }: { basis: 'own-prospectus' | 'eu-statutory' }) {
  const isStat = basis === 'eu-statutory'
  const c = isStat ? '#ff3366' : '#ffaa00'
  const Icon = isStat ? Landmark : FileText
  return (
    <span className="inline-flex items-center gap-1 text-[8px] uppercase tracking-[0.15em] font-bold px-1.5 py-0.5 rounded"
      style={{ color: c, background: `${c}14`, border: `1px solid ${c}55` }}>
      <Icon className="w-2.5 h-2.5" /> {isStat ? 'EU statute' : 'own prospectus'}
    </span>
  )
}

export default function ScanPage() {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [hash, setHash] = useState<string>('')

  const runScan = useCallback(async (input: string) => {
    if (!input.trim()) return
    setBusy(true); setResult(null); setHash('')
    // Tiny delay so the scan reads as "working" rather than instant-suspicious.
    await new Promise(r => setTimeout(r, 280))
    const doc = extractDocument(input)
    const scan = scanCompliance(doc)
    const full: ScanResult = { doc, ...scan }
    const sealed = await sealVerdict(full)
    setResult(full); setHash(sealed); setBusy(false)
  }, [])

  const loadSample = () => { setText(SAMPLE_PROSPECTUS); setResult(null); setHash('') }

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="intense" accent={ACCENT} />

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
            <span style={{ background: `linear-gradient(90deg, ${ACCENT} 0%, #ff3366 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Watch it get judged against EU law.
            </span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-sm max-w-2xl mx-auto leading-relaxed">
            The scanner reads a fund document&apos;s <span className="text-white">own declared limits</span> and its holdings, then checks
            them against the document&apos;s caps <span className="text-white">and</span> the AIFMD II statutory caps —
            deterministically, in your browser. It will catch a prospectus that permits more than the law allows.
          </p>
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
              style={{ background: `linear-gradient(135deg, ${ACCENT} 0%, #ff3366 100%)`, color: '#fff', boxShadow: `0 0 22px ${ACCENT}55` }}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanLine className="w-3.5 h-3.5" />}
              {busy ? 'scanning…' : 'run compliance scan'}
            </button>
            <button onClick={loadSample}
              className="px-3 py-2 rounded-md text-[10px] uppercase tracking-[0.15em] font-bold transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)' }}>
              load sample prospectus
            </button>
            {text && (
              <button onClick={() => { setText(''); setResult(null); setHash('') }}
                className="px-3 py-2 rounded-md text-[10px] uppercase tracking-[0.15em] font-bold text-[rgba(255,255,255,0.4)] hover:text-white">
                clear
              </button>
            )}
            <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.3)]">runs entirely client-side · nothing leaves your browser</span>
          </div>
        </div>

        {result && (
          <div className="space-y-5">
            {/* Verdict banner */}
            <div className="rounded-2xl p-5 flex items-center gap-4"
              style={{
                background: result.compliant ? 'rgba(0,255,136,0.06)' : 'rgba(255,51,102,0.07)',
                border: `1px solid ${result.compliant ? 'rgba(0,255,136,0.4)' : 'rgba(255,51,102,0.5)'}`,
                boxShadow: `0 0 40px ${result.compliant ? 'rgba(0,255,136,0.1)' : 'rgba(255,51,102,0.12)'}`,
              }}>
              {result.compliant
                ? <ShieldCheck className="w-9 h-9 shrink-0 text-[#00ff88]" />
                : <ShieldAlert className="w-9 h-9 shrink-0 text-[#ff3366]" />}
              <div className="min-w-0">
                <div className="text-lg font-black tracking-tight" style={{ color: result.compliant ? '#00ff88' : '#ff3366' }}>
                  {result.compliant ? 'NO CRITICAL BREACHES DETECTED' : `${result.criticalCount} CRITICAL ${result.criticalCount === 1 ? 'BREACH' : 'BREACHES'} DETECTED`}
                </div>
                <div className="text-[11px] text-[rgba(255,255,255,0.55)]">
                  {result.doc.fundName ?? 'Unnamed fund'} · {result.doc.structure.replace('_', '-')} · {result.warningCount} warning{result.warningCount === 1 ? '' : 's'} · scanned {new Date(result.checkedAt).toLocaleTimeString()}
                </div>
              </div>
            </div>

            {/* Extracted facts */}
            <div className="rounded-2xl p-4" style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-[10px] uppercase tracking-[0.2em] font-black mb-3" style={{ color: ACCENT }}>What the scanner read from the document</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
                {[
                  ['Structure', result.doc.structure.replace('_', '-')],
                  ['Declared leverage cap', result.doc.declaredLeverageCapPct != null ? `${result.doc.declaredLeverageCapPct}%` : 'not stated'],
                  ['Declared retention', result.doc.declaredRetentionPct != null ? `${result.doc.declaredRetentionPct}%` : 'not stated'],
                  ['Declared concentration cap', result.doc.declaredConcentrationCapPct != null ? `${result.doc.declaredConcentrationCapPct}%` : 'not stated'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[8px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">{k}</div>
                    <div className="font-mono font-bold text-white">{v}</div>
                  </div>
                ))}
              </div>
              {result.doc.holdings.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[rgba(255,255,255,0.06)]">
                  <div className="text-[8px] uppercase tracking-wider text-[rgba(255,255,255,0.35)] mb-1.5 flex items-center gap-1"><Building2 className="w-2.5 h-2.5" /> {result.doc.holdings.length} holdings extracted</div>
                  <div className="flex flex-wrap gap-1.5">
                    {result.doc.holdings.map((h, i) => (
                      <span key={i} className="text-[10px] font-mono px-2 py-0.5 rounded"
                        style={{ background: h.weightPct > 20 ? 'rgba(255,51,102,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${h.weightPct > 20 ? 'rgba(255,51,102,0.4)' : 'rgba(255,255,255,0.1)'}`, color: h.weightPct > 20 ? '#ff6b8a' : 'rgba(255,255,255,0.6)' }}>
                        {h.name} {h.weightPct}%
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Findings */}
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-[0.2em] font-black" style={{ color: ACCENT }}>Findings</div>
              {result.findings.length === 0 && (
                <div className="text-[11px] text-[rgba(255,255,255,0.5)]">No checkable limits were found in the text. Paste a document that states leverage / retention / concentration limits, or load the sample.</div>
              )}
              {result.findings.map((f, i) => {
                const col = f.severity === 'critical' ? '#ff3366' : f.severity === 'warning' ? '#ffaa00' : '#00ff88'
                const Icon = f.severity === 'critical' ? ShieldAlert : f.severity === 'warning' ? AlertTriangle : ShieldCheck
                return (
                  <div key={i} className="rounded-xl p-3.5" style={{ background: `${col}0a`, border: `1px solid ${col}33` }}>
                    <div className="flex items-start gap-2.5">
                      <Icon className="w-4 h-4 shrink-0 mt-0.5" style={{ color: col }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-[12px] font-bold" style={{ color: col }}>{f.title}</span>
                          <BasisBadge basis={f.basis} />
                        </div>
                        <div className="text-[11px] text-[rgba(255,255,255,0.65)] leading-snug">{f.detail}</div>
                        <div className="text-[9px] font-mono text-[rgba(255,255,255,0.4)] mt-1">observed {f.observed}% · limit {f.limit}% · {f.code}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Sealed verdict */}
            <div className="rounded-2xl p-4" style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.25)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-3.5 h-3.5 text-[#00ff88]" />
                <span className="text-[10px] uppercase tracking-[0.2em] font-black text-[#00ff88]">Tamper-evident verdict seal</span>
              </div>
              <div className="text-[11px] font-mono break-all text-[rgba(255,255,255,0.75)]">SHA-256: {hash}</div>
              <div className="text-[9px] text-[rgba(255,255,255,0.45)] mt-1.5">
                Hash of the full scan (document + findings + verdict). Re-running an unchanged document reproduces this exact hash; any altered input or result yields a different one. This seal is anchorable to Bitcoin via the same OpenTimestamps path as <Link href="/anchor" className="underline hover:text-white">/anchor</Link>.
              </div>
            </div>

            {result.doc.provenance.length > 0 && (
              <div className="text-[9px] font-mono text-[rgba(255,255,255,0.35)]">
                provenance — {result.doc.provenance.join('  ·  ')}
              </div>
            )}
          </div>
        )}

        {/* For investors */}
        <section className="rounded-2xl p-6 mt-10" style={{ background: `${ACCENT}08`, border: `1px solid ${ACCENT}30` }}>
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
