'use client'

// Shadow Mode — the institutional adoption surface.
//
// Composes four honest capabilities over the real scan engine:
//   #1 Passive Shadow divergence (legacy self-consistency vs ProvenLex statutory)
//   #2 Board-ready Audit Pack (findings → citations + tamper-evident hash chain)
//   #3 Reasoning Trace (deterministic input → rule → test → result per finding)
//   #4 Resilience scorecard (the same fail-safe cases CI asserts)
//
// Nothing is fabricated: every verdict, hash, and trace is computed live in the
// browser by the same code /scan uses. The "legacy" baseline is explicitly a
// self-consistency check, disclosed on the page.

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import {
  ShieldAlert, ScanLine, GitCompareArrows, FileCheck2, Brain, ShieldCheck,
  ArrowRight, ChevronRight, Lock, CheckCircle2, XCircle, AlertTriangle,
  Eye, EyeOff, Download, RefreshCcw, Sparkles,
} from 'lucide-react'
import { extractDocument, scanCompliance, type ScanResult } from '@/lib/scan-engine'
import { buildDivergence, SHADOW_SAMPLE, type DivergenceReport } from '@/lib/shadow'
import { buildReasoningTraces, type ReasoningTrace } from '@/lib/reasoning-trace'
import { buildAuditPack, verifyAuditPack, type AuditPack } from '@/lib/audit-pack'
import { runResilienceScorecard } from '@/lib/resilience'

const CosmicBackground = dynamic(() => import('@/components/CosmicBackground'), { ssr: false })

const ACCENT = '#5B8DEF' // cool secondary — the "silent, parallel" shadow mode

function analyze(text: string): ScanResult {
  const doc = extractDocument(text)
  return { doc, ...scanCompliance(doc) }
}

const SEV = {
  critical: '#F2566E',
  warning: '#F5A524',
  ok: '#10D982',
} as const

export default function ShadowModePage() {
  const [text, setText] = useState(SHADOW_SAMPLE)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [divergence, setDivergence] = useState<DivergenceReport | null>(null)
  const [traces, setTraces] = useState<ReasoningTrace[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [pack, setPack] = useState<AuditPack | null>(null)
  const [packIntact, setPackIntact] = useState<null | boolean>(null)
  const [building, setBuilding] = useState(false)
  const [scorecard, setScorecard] = useState<ReturnType<typeof runResilienceScorecard> | null>(null)

  const run = useCallback((src: string) => {
    const r = analyze(src)
    setResult(r)
    setDivergence(buildDivergence(r))
    setTraces(buildReasoningTraces(r))
    setPack(null)
    setPackIntact(null)
  }, [])

  useEffect(() => { run(SHADOW_SAMPLE) }, [run])

  const generatePack = useCallback(async () => {
    if (!result) return
    setBuilding(true)
    const p = await buildAuditPack(result)
    setPack(p)
    setPackIntact(null)
    setBuilding(false)
  }, [result])

  const verifyPack = useCallback(async () => {
    if (!pack) return
    const { intact } = await verifyAuditPack(pack)
    setPackIntact(intact)
  }, [pack])

  const downloadPdf = useCallback(async () => {
    if (!pack) return
    const { auditPackToPdf } = await import('@/lib/audit-pdf') // lazy: pdf-lib only loads on click
    const bytes = await auditPackToPdf(pack)
    const blob = new Blob([bytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const slug = (pack.fundName ?? 'audit-pack').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 48).toLowerCase()
    a.download = `genesis-audit-pack-${slug || 'fund'}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [pack])

  const traceFor = (code: string, idx: number) => traces[idx]

  return (
    <div className="min-h-screen text-white" style={{ fontFamily: 'var(--font-geist-sans), system-ui, -apple-system, sans-serif', textTransform: 'none', letterSpacing: 'normal' }}>
      <CosmicBackground variant="calm" accent={ACCENT} />

      {/* Top bar */}
      <nav className="relative z-10 flex items-center justify-between px-5 md:px-8 py-4 border-b border-[rgba(255,255,255,0.06)]">
        <a href="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #10D982, #0B9E63)', boxShadow: '0 0 18px rgba(16,217,130,0.45)' }}>
            <Sparkles className="w-4 h-4 text-black" />
          </div>
          <span className="text-sm font-black tracking-[0.15em]">PROVENLEX</span>
        </a>
        <div className="flex items-center gap-4 text-[11px] uppercase tracking-[0.15em] font-bold text-[rgba(255,255,255,0.6)]">
          <a href="/scan" className="hover:text-white">Live Scan</a>
          <a href="/security" className="hover:text-white hidden sm:inline">Trust Center</a>
        </div>
      </nav>

      <div className="relative z-10 max-w-6xl mx-auto px-5 md:px-8 py-10 md:py-16">
        {/* Hero */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] font-bold mb-4" style={{ color: ACCENT }}>
            <EyeOff className="w-3.5 h-3.5" />
            Passive Shadow Mode · adopt with zero risk
          </div>
          <h1 className="font-black tracking-tight leading-[1.05]" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
            Run ProvenLex <span style={{ color: ACCENT }}>silently</span>, alongside
            <br className="hidden md:block" /> your current process.
          </h1>
          <p className="text-[rgba(255,255,255,0.55)] max-w-2xl mt-5 leading-relaxed">
            No big red switch. ProvenLex takes <span className="text-white font-semibold">no action</span> — it watches the same
            documents your team reviews and logs a <span className="text-white font-semibold">divergence report</span>:
            exactly what it would have caught that your current process let through. Everything below is computed live, in
            your browser, by the same engine as <a href="/scan" className="underline" style={{ color: ACCENT }}>/scan</a>.
          </p>
        </div>

        {/* Document input */}
        <section className="rounded-2xl p-5 md:p-6 mb-8"
          style={{ background: 'rgba(14,16,20,0.7)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)' }}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <span className="text-[11px] uppercase tracking-[0.2em] font-bold text-[rgba(255,255,255,0.5)]">Document under shadow review</span>
            <div className="flex gap-2">
              <button onClick={() => { setText(SHADOW_SAMPLE); run(SHADOW_SAMPLE) }}
                className="text-[11px] uppercase tracking-[0.12em] font-bold px-3 py-1.5 rounded-md"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)' }}>
                Load sample
              </button>
              <button onClick={() => run(text)}
                className="text-[11px] uppercase tracking-[0.12em] font-black px-4 py-1.5 rounded-md flex items-center gap-1.5"
                style={{ background: ACCENT, color: '#000', boxShadow: `0 0 20px ${ACCENT}66` }}>
                <GitCompareArrows className="w-3.5 h-3.5" /> Run shadow analysis
              </button>
            </div>
          </div>
          <textarea value={text} onChange={e => setText(e.target.value)} spellCheck={false}
            className="w-full h-44 rounded-lg p-3 font-mono text-[12px] leading-relaxed resize-y"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }} />
          <p className="text-[10px] text-[rgba(255,255,255,0.35)] mt-2 leading-relaxed">
            Legacy baseline is modelled as a <span style={{ color: ACCENT }}>self-consistency check</span> — it validates the
            prospectus against the limits it declares for itself, but does not independently re-derive the current AIFMD II
            statutory caps (the real gap a pre-AIFMD II checklist leaves). Disclosed, not hidden.
          </p>
        </section>

        {/* ── #1 DIVERGENCE ─────────────────────────────────────────────── */}
        {divergence && result && (
          <Block icon={GitCompareArrows} label="01 · Divergence Report" sub="What your current process missed">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              <VerdictCard title="Your current process" subtitle="self-consistency review"
                verdict={divergence.legacyVerdict} count={divergence.legacyCriticalCount} muted />
              <VerdictCard title="ProvenLex" subtitle="+ AIFMD II statutory overlay"
                verdict={divergence.genesisVerdict} count={divergence.genesisCriticalCount} />
            </div>

            <div className="rounded-xl px-4 py-3 mb-5 flex items-start gap-3"
              style={{ background: `${ACCENT}12`, border: `1px solid ${ACCENT}44` }}>
              <ShieldAlert className="w-5 h-5 mt-0.5 shrink-0" style={{ color: ACCENT }} />
              <p className="text-sm text-white leading-snug">{divergence.headline}</p>
            </div>

            {divergence.missedByLegacy.length > 0 && (
              <>
                <div className="text-[11px] uppercase tracking-[0.2em] font-bold text-[rgba(255,255,255,0.45)] mb-2">
                  Caught by ProvenLex · missed by your current process
                </div>
                <div className="space-y-2">
                  {divergence.missedByLegacy.map((f, i) => {
                    const idx = result.findings.indexOf(f)
                    const tr = traceFor(f.code, idx)
                    const open = expanded.has(f.code + idx)
                    return (
                      <div key={f.code + idx} className="rounded-lg overflow-hidden"
                        style={{ background: 'rgba(242,86,110,0.06)', border: '1px solid rgba(242,86,110,0.25)' }}>
                        <button onClick={() => setExpanded(s => { const n = new Set(s); const k = f.code + idx; n.has(k) ? n.delete(k) : n.add(k); return n })}
                          className="w-full flex items-start gap-3 px-3 py-2.5 text-left">
                          <XCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: SEV.critical }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-bold text-white">{f.title}</div>
                            <div className="text-[11px] text-[rgba(255,255,255,0.5)] mt-0.5">{f.detail}</div>
                          </div>
                          <div className="text-right shrink-0 font-mono">
                            <div className="text-[13px] font-black" style={{ color: SEV.critical }}>{f.observed}%</div>
                            <div className="text-[8px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">cap {f.limit}%</div>
                          </div>
                          <ChevronRight className="w-4 h-4 mt-0.5 shrink-0 transition-transform text-[rgba(255,255,255,0.4)]"
                            style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
                        </button>
                        {open && tr && <TracePanel trace={tr} />}
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {divergence.caughtByBoth.length > 0 && (
              <div className="mt-4 text-[11px] text-[rgba(255,255,255,0.45)]">
                {divergence.caughtByBoth.length} internal-contradiction breach{divergence.caughtByBoth.length === 1 ? '' : 'es'} were
                caught by both processes (the document violates its own declared limits).
              </div>
            )}
          </Block>
        )}

        {/* ── #3 REASONING TRACE (full list) ────────────────────────────── */}
        {traces.length > 0 && (
          <Block icon={Brain} label="03 · Reasoning Trace" sub="Why every verdict — deterministic, no black box">
            <p className="text-[12px] text-[rgba(255,255,255,0.5)] mb-4 leading-relaxed">
              There is no opaque model to explain: each verdict is regex + arithmetic. The trace below is the
              <span className="text-white"> actual computation</span> a human risk-manager can reproduce by hand.
            </p>
            <div className="space-y-2">
              {traces.map((tr, i) => (
                <div key={tr.code + i} className="rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${SEV[tr.severity]}33` }}>
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-[rgba(255,255,255,0.06)]">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: SEV[tr.severity] }} />
                    <span className="text-[12px] font-bold text-white flex-1">{tr.title}</span>
                    <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{ background: `${SEV[tr.severity]}22`, color: SEV[tr.severity] }}>{tr.severity}</span>
                  </div>
                  <TraceSteps trace={tr} />
                </div>
              ))}
            </div>
          </Block>
        )}

        {/* ── #2 AUDIT PACK ─────────────────────────────────────────────── */}
        <Block icon={FileCheck2} label="02 · Audit Readiness Pack" sub="Board-ready · each finding mapped to its rule · tamper-evident">
          {!pack ? (
            <button onClick={generatePack} disabled={building}
              className="flex items-center gap-2 px-5 py-3 rounded-md text-sm uppercase tracking-[0.12em] font-black"
              style={{ background: ACCENT, color: '#000', boxShadow: `0 0 24px ${ACCENT}55`, opacity: building ? 0.6 : 1 }}>
              <FileCheck2 className="w-4 h-4" /> {building ? 'Sealing…' : 'Generate board-ready audit pack'}
            </button>
          ) : (
            <div className="rounded-xl overflow-hidden" id="audit-pack"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.08)] flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="text-sm font-bold text-white">{pack.fundName ?? 'Compliance Audit Pack'}</div>
                  <div className="text-[10px] text-[rgba(255,255,255,0.4)]">
                    {pack.structure} · {pack.verdict.toUpperCase()} · {pack.criticalCount} critical / {pack.warningCount} warning · {new Date(pack.generatedAt).toUTCString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={verifyPack} className="text-[11px] uppercase tracking-wider font-bold px-3 py-1.5 rounded-md flex items-center gap-1.5"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)' }}>
                    <ShieldCheck className="w-3.5 h-3.5" /> Verify integrity
                  </button>
                  <button onClick={downloadPdf} className="text-[11px] uppercase tracking-wider font-black px-3 py-1.5 rounded-md flex items-center gap-1.5"
                    style={{ background: ACCENT, color: '#000', boxShadow: `0 0 18px ${ACCENT}55` }}>
                    <Download className="w-3.5 h-3.5" /> Download PDF
                  </button>
                </div>
              </div>

              {packIntact !== null && (
                <div className="px-4 py-2 text-[12px] font-bold flex items-center gap-2"
                  style={{ background: packIntact ? 'rgba(16,217,130,0.08)' : 'rgba(242,86,110,0.08)', color: packIntact ? '#10D982' : '#F2566E' }}>
                  {packIntact ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  {packIntact ? 'Chain intact — every entry re-verified against the sealed root.' : 'Chain broken — an entry was altered.'}
                </div>
              )}

              <div className="divide-y divide-[rgba(255,255,255,0.05)]">
                {pack.entries.map(e => (
                  <div key={e.index} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <span className="text-[10px] font-mono mt-0.5" style={{ color: SEV[e.severity] }}>#{e.index}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-bold text-white">{e.title}</div>
                        {e.citation && (
                          <div className="text-[10px] text-[rgba(255,255,255,0.5)] mt-1 leading-snug">
                            <span style={{ color: ACCENT }}>{e.citation.framework}</span> — {e.citation.basis}
                            <span className="block font-mono text-[rgba(255,255,255,0.4)] mt-0.5">formula: {e.citation.formula}</span>
                          </div>
                        )}
                        <div className="font-mono text-[9px] text-[rgba(255,255,255,0.3)] mt-1 truncate">
                          <Lock className="w-2.5 h-2.5 inline mr-1" />sha256 {e.entryHash}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono shrink-0" style={{ color: SEV[e.severity] }}>{e.observed}% / {e.limit}%</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-4 py-3 border-t border-[rgba(255,255,255,0.08)] font-mono text-[10px] flex items-center gap-2"
                style={{ background: 'rgba(0,0,0,0.3)' }}>
                <Lock className="w-3 h-3" style={{ color: ACCENT }} />
                <span className="text-[rgba(255,255,255,0.4)]">chain root ({pack.hashAlgo}):</span>
                <span className="truncate" style={{ color: ACCENT }}>{pack.chainRootSha256}</span>
              </div>
            </div>
          )}
        </Block>

        {/* ── #4 RESILIENCE ─────────────────────────────────────────────── */}
        <Block icon={ShieldCheck} label="04 · Resilience Scorecard" sub="Fail-safe under hostile data — the same cases CI asserts">
          {!scorecard ? (
            <button onClick={() => setScorecard(runResilienceScorecard())}
              className="flex items-center gap-2 px-5 py-3 rounded-md text-sm uppercase tracking-[0.12em] font-black"
              style={{ background: ACCENT, color: '#000', boxShadow: `0 0 24px ${ACCENT}55` }}>
              <RefreshCcw className="w-4 h-4" /> Run resilience suite
            </button>
          ) : (
            <div>
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <span className="text-2xl font-black tabular-nums" style={{ color: scorecard.allSafe ? '#10D982' : '#F2566E' }}>
                  {scorecard.passed}/{scorecard.total}
                </span>
                <span className="text-sm font-bold" style={{ color: scorecard.allSafe ? '#10D982' : '#F2566E' }}>
                  {scorecard.allSafe ? 'ALL SAFE-STATE' : 'FAILURE DETECTED'}
                </span>
                <span className="text-[11px] text-[rgba(255,255,255,0.4)]">worst case {scorecard.maxMs}ms · ledger never corrupted</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {scorecard.results.map(r => (
                  <div key={r.id} className="rounded-lg px-3 py-2.5 flex items-start gap-2.5"
                    style={{ background: r.passed ? 'rgba(16,217,130,0.05)' : 'rgba(242,86,110,0.08)', border: `1px solid ${r.passed ? 'rgba(16,217,130,0.2)' : 'rgba(242,86,110,0.4)'}` }}>
                    {r.passed ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#10D982]" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#F2566E]" />}
                    <div className="min-w-0">
                      <div className="text-[12px] font-bold text-white">{r.label}</div>
                      <div className="text-[10px] text-[rgba(255,255,255,0.45)] font-mono">{r.note} · {r.ms}ms</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Block>

        {/* CTA */}
        <div className="mt-12 rounded-2xl p-6 md:p-8 text-center"
          style={{ background: `linear-gradient(135deg, ${ACCENT}1a, rgba(91,141,239,0.08))`, border: `1px solid ${ACCENT}44` }}>
          <h3 className="text-xl md:text-2xl font-black mb-2">Run a 30-day shadow pilot on your own funds.</h3>
          <p className="text-[rgba(255,255,255,0.55)] text-sm mb-5 max-w-xl mx-auto">
            Zero risk. ProvenLex touches nothing — it just shows you, document by document, what your current process is letting through.
          </p>
          <a href="/scan" className="inline-flex items-center gap-2 px-6 py-3 rounded-md text-sm uppercase tracking-[0.12em] font-black"
            style={{ background: ACCENT, color: '#000', boxShadow: `0 0 24px ${ACCENT}66` }}>
            <ScanLine className="w-4 h-4" /> Try the live scanner <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          nav, textarea, .cosmic-bg { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>
    </div>
  )
}

// ── small presentational helpers ───────────────────────────────────────────

function Block({ icon: Icon, label, sub, children }: { icon: any; label: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="flex items-center gap-2.5 mb-1">
        <Icon className="w-4 h-4" style={{ color: ACCENT }} />
        <h2 className="text-[13px] uppercase tracking-[0.2em] font-black text-white">{label}</h2>
      </div>
      <div className="text-[11px] text-[rgba(255,255,255,0.4)] mb-4 ml-6">{sub}</div>
      {children}
    </section>
  )
}

function VerdictCard({ title, subtitle, verdict, count, muted }: {
  title: string; subtitle: string; verdict: 'compliant' | 'non-compliant'; count: number; muted?: boolean
}) {
  const ok = verdict === 'compliant'
  const color = ok ? '#10D982' : '#F2566E'
  return (
    <div className="relative rounded-xl p-4 pl-5 overflow-hidden" style={{
      background: muted ? 'rgba(14,16,20,0.7)' : `${color}10`,
      border: `1px solid ${muted ? 'rgba(255,255,255,0.1)' : color + '44'}`,
    }}>
      <span aria-hidden className="absolute left-0 top-0 bottom-0 w-1" style={{ background: muted ? 'rgba(255,255,255,0.18)' : color }} />
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[13px] font-bold text-white">{title}</div>
          <div className="text-[10px]" style={{ color: '#93A1AD' }}>{subtitle}</div>
        </div>
        {ok ? <CheckCircle2 className="w-6 h-6" style={{ color }} /> : <ShieldAlert className="w-6 h-6" style={{ color }} />}
      </div>
      <div className="font-black tracking-tight" style={{ fontSize: '1.4rem', color }}>
        {ok ? 'PASSED' : 'NON-COMPLIANT'}
      </div>
      <div className="text-[11px] mt-0.5" style={{ color: '#93A1AD' }}>{count} critical finding{count === 1 ? '' : 's'}</div>
    </div>
  )
}

function TraceSteps({ trace }: { trace: ReasoningTrace }) {
  return (
    <div className="px-3 py-2.5 font-mono text-[11px] space-y-1">
      {trace.steps.map(s => (
        <div key={s.n} className="flex gap-2">
          <span className="shrink-0 w-12 uppercase" style={{ color: ACCENT }}>{s.label}</span>
          <span className="text-[rgba(255,255,255,0.7)]">{s.text}</span>
        </div>
      ))}
      <div className="text-[9px] text-[rgba(255,255,255,0.3)] pt-1">reproducible · no LLM in the decision path</div>
    </div>
  )
}

function TracePanel({ trace }: { trace: ReasoningTrace }) {
  return (
    <div className="border-t border-[rgba(242,86,110,0.2)]" style={{ background: 'rgba(0,0,0,0.25)' }}>
      <TraceSteps trace={trace} />
    </div>
  )
}
