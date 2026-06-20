'use client'

// Independent verdict verification.
//
// The honest payoff of a deterministic engine: anyone can reproduce a verdict.
// Paste the prospectus (and, optionally, a hash someone handed you); this page
// re-runs the exact same engine /scan uses, recomputes the canonical SHA-256,
// and tells you whether it matches. Same input → same hash, on any machine —
// so a ProvenLex verdict is something you can check, not something you trust.

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import {
  ShieldCheck, CheckCircle2, XCircle, Copy, Check, Sparkles, ArrowRight, RefreshCcw, FileText,
} from 'lucide-react'
import { extractDocument, scanCompliance, SAMPLE_PROSPECTUS, type ScanResult, type Finding } from '@/lib/scan-engine'
import { canonicalScanHash } from '@/lib/perf-benchmark'

const CosmicBackground = dynamic(() => import('@/components/CosmicBackground'), { ssr: false })
const ACCENT = '#10D982'

const SEV: Record<Finding['severity'], string> = { critical: '#F2566E', warning: '#F5A524', ok: '#10D982' }

export default function VerifyPage() {
  const [text, setText] = useState(SAMPLE_PROSPECTUS)
  const [expected, setExpected] = useState('')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [hash, setHash] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [running, setRunning] = useState(false)

  const verify = useCallback(async () => {
    setRunning(true)
    const doc = extractDocument(text)
    const r: ScanResult = { doc, ...scanCompliance(doc) }
    setResult(r)
    setHash(await canonicalScanHash(r))
    setRunning(false)
  }, [text])

  const exp = expected.trim().toLowerCase()
  const match = exp.length > 0 && hash != null && exp === hash.toLowerCase()
  const compared = exp.length > 0 && hash != null

  return (
    <div className="min-h-screen text-white" style={{ fontFamily: 'var(--font-geist-sans), system-ui, -apple-system, sans-serif', textTransform: 'none', letterSpacing: 'normal' }}>
      <CosmicBackground variant="calm" accent={ACCENT} />

      <nav className="relative z-10 flex items-center justify-between px-5 md:px-8 py-4 border-b border-[rgba(255,255,255,0.06)]">
        <a href="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, #0B9E63)`, boxShadow: `0 0 18px ${ACCENT}88` }}>
            <Sparkles className="w-4 h-4 text-black" />
          </div>
          <span className="text-sm font-black tracking-[0.15em]">PROVENLEX</span>
        </a>
        <div className="flex items-center gap-4 text-[11px] uppercase tracking-[0.15em] font-bold text-[rgba(255,255,255,0.6)]">
          <a href="/scan" className="hover:text-white">Live Scan</a>
          <a href="/deterministic" className="hover:text-white hidden sm:inline">Why Deterministic</a>
        </div>
      </nav>

      <div className="relative z-10 max-w-4xl mx-auto px-5 md:px-8 py-10 md:py-16">
        {/* Hero */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] font-bold mb-4" style={{ color: ACCENT }}>
            <ShieldCheck className="w-3.5 h-3.5" /> Independent verification
          </div>
          <h1 className="font-black tracking-tight leading-[1.07]" style={{ fontSize: 'clamp(1.9rem, 4.5vw, 3.2rem)' }}>
            Verify a verdict <span style={{ color: ACCENT }}>yourself.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] max-w-2xl mt-5 leading-relaxed">
            Paste a prospectus — and, if you have one, a hash someone gave you. This re-runs the
            exact engine <a href="/scan" className="underline" style={{ color: ACCENT }}>/scan</a> uses,
            recomputes the canonical SHA-256, and tells you whether it matches. Same input → same hash,
            on any machine. Nothing is uploaded.
          </p>
        </div>

        {/* Input */}
        <section className="rounded-2xl p-5 md:p-6 mb-6"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)' }}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <span className="text-[11px] uppercase tracking-[0.2em] font-bold text-[rgba(255,255,255,0.5)] flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Document to verify
            </span>
            <button onClick={() => setText(SAMPLE_PROSPECTUS)}
              className="text-[11px] uppercase tracking-[0.12em] font-bold px-3 py-1.5 rounded-md"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)' }}>
              Load sample
            </button>
          </div>
          <textarea value={text} onChange={e => setText(e.target.value)} spellCheck={false}
            className="w-full h-40 rounded-lg p-3 font-mono text-[12px] leading-relaxed resize-y"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }} />

          <label className="block text-[11px] uppercase tracking-[0.2em] font-bold text-[rgba(255,255,255,0.5)] mt-4 mb-2">
            Expected hash <span className="text-[rgba(255,255,255,0.3)] normal-case tracking-normal">(optional — paste a 64-char SHA-256 to compare)</span>
          </label>
          <input value={expected} onChange={e => setExpected(e.target.value)} spellCheck={false}
            placeholder="e.g. 8bda50b8bc0a28d1588bbec0628204f2…"
            className="w-full rounded-lg px-3 py-2.5 font-mono text-[12px]"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }} />

          <button onClick={verify} disabled={running}
            className="mt-4 flex items-center gap-2 px-5 py-3 rounded-md text-sm uppercase tracking-[0.12em] font-black"
            style={{ background: ACCENT, color: '#000', boxShadow: `0 0 24px ${ACCENT}55`, opacity: running ? 0.6 : 1 }}>
            <ShieldCheck className="w-4 h-4" /> {running ? 'Verifying…' : 'Verify'}
          </button>
        </section>

        {/* Result */}
        {result && hash && (
          <>
            {/* Match banner (only when an expected hash was supplied) */}
            {compared && (
              <div className="rounded-2xl px-5 py-4 mb-4 flex items-center gap-3"
                style={{ background: match ? 'rgba(16,217,130,0.06)' : 'rgba(242,86,110,0.08)', border: `1px solid ${match ? ACCENT + '55' : '#F2566E55'}` }}>
                {match ? <CheckCircle2 className="w-6 h-6" style={{ color: ACCENT }} /> : <XCircle className="w-6 h-6 text-[#F2566E]" />}
                <div>
                  <div className="font-black text-base" style={{ color: match ? ACCENT : '#F2566E' }}>
                    {match ? 'VERIFIED — hashes match' : 'MISMATCH — hashes differ'}
                  </div>
                  <div className="text-[11px] text-[rgba(255,255,255,0.5)] mt-0.5">
                    {match
                      ? 'This document reproduces exactly the verdict that hash represents. Untampered.'
                      : 'This document does not produce the expected hash — the document or the verdict has changed.'}
                  </div>
                </div>
              </div>
            )}

            {/* Recomputed canonical hash */}
            <div className="rounded-2xl p-5 mb-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-[11px] uppercase tracking-[0.2em] font-bold text-[rgba(255,255,255,0.5)] mb-2">Recomputed canonical SHA-256</div>
              <div className="flex items-center gap-2 rounded-md px-3 py-2.5 font-mono text-[11px] md:text-[12px]"
                style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="truncate" style={{ color: '#9fffd0' }}>{hash}</span>
                <button onClick={() => { navigator.clipboard?.writeText(hash); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                  className="ml-auto shrink-0 text-[rgba(255,255,255,0.5)] hover:text-white" aria-label="copy hash">
                  {copied ? <Check className="w-4 h-4" style={{ color: ACCENT }} /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-[rgba(255,255,255,0.4)] mt-2 flex items-center gap-1.5">
                <RefreshCcw className="w-3 h-3" /> Run it again — or on another machine — and you get this exact hash. It excludes timestamps, so only the document + rules drive it.
              </p>
            </div>

            {/* The recomputed verdict */}
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${result.compliant ? 'rgba(16,217,130,0.3)' : 'rgba(242,86,110,0.3)'}` }}>
              <div className="px-5 py-3 flex items-center justify-between border-b border-[rgba(255,255,255,0.06)]">
                <span className="text-[11px] uppercase tracking-[0.2em] font-bold text-[rgba(255,255,255,0.5)]">Recomputed verdict</span>
                <span className="font-black text-sm" style={{ color: result.compliant ? ACCENT : '#F2566E' }}>
                  {result.compliant ? 'COMPLIANT' : 'NON-COMPLIANT'} · {result.criticalCount} critical · {result.warningCount} warning
                </span>
              </div>
              <div className="divide-y divide-[rgba(255,255,255,0.05)]">
                {result.findings.length === 0 && (
                  <div className="px-5 py-4 text-[12px] text-[rgba(255,255,255,0.5)]">No findings — the document is within every checked limit.</div>
                )}
                {result.findings.map((f, i) => (
                  <div key={f.code + i} className="px-5 py-3 flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: SEV[f.severity] }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-bold text-white">{f.title}</div>
                      <div className="text-[11px] text-[rgba(255,255,255,0.5)] mt-0.5">{f.detail}</div>
                    </div>
                    <span className="text-[11px] font-mono shrink-0" style={{ color: SEV[f.severity] }}>{f.observed}% / {f.limit}%</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* How it works */}
        <section className="mt-10 rounded-2xl p-5 md:p-6" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 className="text-[13px] uppercase tracking-[0.2em] font-black mb-3">Why this is possible</h2>
          <p className="text-[13px] text-[rgba(255,255,255,0.6)] leading-relaxed">
            ProvenLex has no model in its decision path — it's deterministic regex + arithmetic.
            So a verdict is a pure function of (the document, the rules). Hash the document + findings and
            you get a digest that is identical for everyone, forever. That's what makes a verdict
            <span className="text-white"> independently checkable</span>: a regulator or a counterparty
            doesn't have to trust ProvenLex — they re-run it and compare. An LLM-based tool cannot offer this.
          </p>
          <a href="/deterministic" className="inline-flex items-center gap-1.5 mt-4 text-[12px] font-bold" style={{ color: ACCENT }}>
            See the determinism proof + live benchmark <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </section>
      </div>
    </div>
  )
}
