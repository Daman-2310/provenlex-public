'use client'

// Deterministic by Design — the architectural moat, told honestly.
//
// The case: ProvenLex runs no ML model, so it cannot drift or hallucinate; every
// verdict is the exact rule + arithmetic, reproducible bit-for-bit and hash-
// sealed. Two claims are PROVEN live, not asserted:
//   • a real throughput/latency benchmark on the visitor's own hardware
//   • a determinism proof — the same document hashed twice, byte-identical
// And the honest tradeoff is stated plainly: deterministic only catches what is
// encoded as a rule. Owning that limit is what makes the rest credible.

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import {
  ShieldCheck, Gauge, Repeat, CheckCircle2, XCircle, Cpu, Lock, ArrowRight,
  ScanLine, Sparkles, Scale,
} from 'lucide-react'
import { runScanBenchmark, proveDeterminism, type PerfResult } from '@/lib/perf-benchmark'

const CosmicBackground = dynamic(() => import('@/components/CosmicBackground'), { ssr: false })
const ACCENT = '#10D982'

interface Row { dim: string; genesis: string; llm: string }
const COMPARISON: Row[] = [
  { dim: 'Same input → output', genesis: 'Identical, bit-for-bit, forever', llm: 'Can vary between runs / model versions' },
  { dim: 'Why a verdict', genesis: 'The exact rule + the arithmetic it ran', llm: 'A post-hoc explanation, not the true cause' },
  { dim: 'Hallucination', genesis: 'Structurally impossible — no model', llm: 'Possible — a known, documented failure mode' },
  { dim: 'Regulator trust', genesis: 'Re-verifiable SHA-256 — check it yourself', llm: '“Trust the model”' },
  { dim: 'Changing a rule', genesis: 'A code change — git diff, reviewed', llm: 'Retrain + revalidate the whole model' },
  { dim: 'EU AI Act posture', genesis: 'Transparent & explainable by construction', llm: 'Model-governance + transparency obligations' },
  { dim: 'Where data goes', genesis: 'Nowhere — runs in your browser', llm: 'Often sent to a model API' },
]

export default function DeterministicPage() {
  const [bench, setBench] = useState<PerfResult | null>(null)
  const [benchRunning, setBenchRunning] = useState(false)
  const [proof, setProof] = useState<Awaited<ReturnType<typeof proveDeterminism>> | null>(null)

  const runBench = useCallback(() => {
    setBenchRunning(true)
    // Defer a frame so the button can show "running" before the sync loop.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const r = runScanBenchmark(5000)
      setBench(r)
      setBenchRunning(false)
    }))
  }, [])

  const runProof = useCallback(async () => {
    setProof(await proveDeterminism())
  }, [])

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
          <a href="/shadow" className="hover:text-white hidden sm:inline">Shadow Mode</a>
        </div>
      </nav>

      <div className="relative z-10 max-w-5xl mx-auto px-5 md:px-8 py-10 md:py-16">
        {/* Hero */}
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] font-bold mb-4" style={{ color: ACCENT }}>
            <Cpu className="w-3.5 h-3.5" /> Architecture · the moat
          </div>
          <h1 className="font-black tracking-tight leading-[1.05]" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
            Deterministic by design.
            <br />
            <span style={{ color: ACCENT }}>No model. No drift. No doubt.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.55)] max-w-2xl mt-5 leading-relaxed">
            ProvenLex runs <span className="text-white font-semibold">no machine-learning model</span> in its decision path —
            it is regex and arithmetic. So it cannot hallucinate, cannot drift between versions, and every verdict is the
            exact rule it applied. That is not a limitation to apologise for; for statutory compliance it is the
            <span className="text-white font-semibold"> entire point</span>. Below, two of these claims are proven live —
            not asserted.
          </p>
        </div>

        {/* Comparison */}
        <section className="rounded-2xl overflow-hidden mb-10"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)' }}>
          <div className="grid grid-cols-12 px-4 py-3 text-[10px] uppercase tracking-[0.18em] font-bold border-b border-[rgba(255,255,255,0.08)]">
            <div className="col-span-4 text-[rgba(255,255,255,0.4)]"> </div>
            <div className="col-span-4" style={{ color: ACCENT }}>ProvenLex · deterministic</div>
            <div className="col-span-4 text-[rgba(255,255,255,0.4)]">LLM / ML-based RegTech</div>
          </div>
          {COMPARISON.map((r, i) => (
            <div key={r.dim} className="grid grid-cols-12 px-4 py-3 items-start gap-2 text-[12px]"
              style={{ borderTop: i ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
              <div className="col-span-4 text-[rgba(255,255,255,0.55)] font-semibold">{r.dim}</div>
              <div className="col-span-4 text-white flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: ACCENT }} /> {r.genesis}
              </div>
              <div className="col-span-4 text-[rgba(255,255,255,0.5)]">{r.llm}</div>
            </div>
          ))}
        </section>

        {/* Honest tradeoff */}
        <section className="rounded-2xl p-5 mb-10 flex items-start gap-3"
          style={{ background: 'rgba(245,165,36,0.06)', border: '1px solid rgba(245,165,36,0.3)' }}>
          <Scale className="w-5 h-5 mt-0.5 shrink-0 text-[#F5A524]" />
          <div>
            <div className="text-sm font-bold text-white mb-1">The honest tradeoff</div>
            <p className="text-[13px] text-[rgba(255,255,255,0.6)] leading-relaxed">
              Deterministic is not “better at everything.” It only catches what is encoded as a rule — it won’t interpret
              genuinely ambiguous prose or infer intent the way a language model might. ProvenLex is deterministic exactly
              where the answer must be <span className="text-white">certain</span>: statutory limits, arithmetic, structure.
              Judgment calls stay with a human — not a model that can be <span className="text-white">confidently wrong</span>.
              We’d rather be precisely right about the checkable things than vaguely right about everything.
            </p>
          </div>
        </section>

        {/* Live benchmark */}
        <section className="mb-10">
          <div className="flex items-center gap-2.5 mb-1">
            <Gauge className="w-4 h-4" style={{ color: ACCENT }} />
            <h2 className="text-[13px] uppercase tracking-[0.2em] font-black">Throughput · measured live</h2>
          </div>
          <div className="text-[11px] text-[rgba(255,255,255,0.4)] mb-4 ml-6">Run on your own hardware, right now. No cached number.</div>

          {!bench ? (
            <button onClick={runBench} disabled={benchRunning}
              className="flex items-center gap-2 px-5 py-3 rounded-md text-sm uppercase tracking-[0.12em] font-black"
              style={{ background: ACCENT, color: '#000', boxShadow: `0 0 24px ${ACCENT}55`, opacity: benchRunning ? 0.6 : 1 }}>
              <Gauge className="w-4 h-4" /> {benchRunning ? 'Measuring…' : 'Run benchmark (5,000 scans)'}
            </button>
          ) : (
            <div className="rounded-2xl p-5" style={{ background: 'rgba(16,217,130,0.04)', border: `1px solid ${ACCENT}33` }}>
              <div className="flex items-baseline gap-3 mb-4 flex-wrap">
                <span className="font-black tabular-nums" style={{ fontSize: 'clamp(2rem,6vw,3rem)', color: ACCENT, textShadow: `0 0 24px ${ACCENT}66` }}>
                  {bench.docsPerSec.toLocaleString()}
                </span>
                <span className="text-sm font-bold text-[rgba(255,255,255,0.7)]">documents / second</span>
                <button onClick={runBench} className="ml-auto text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 rounded-md"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)' }}>
                  Re-run
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { k: 'p50 latency', v: `${bench.p50Ms} ms` },
                  { k: 'p95 latency', v: `${bench.p95Ms} ms` },
                  { k: 'p99 latency', v: `${bench.p99Ms} ms` },
                  { k: 'worst case', v: `${bench.maxMs} ms` },
                ].map(({ k, v }) => (
                  <div key={k} className="rounded-lg px-3 py-2.5" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">{k}</div>
                    <div className="font-mono font-bold text-sm mt-0.5 tabular-nums" style={{ color: ACCENT }}>{v}</div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-[rgba(255,255,255,0.4)] mt-4 leading-relaxed">
                {bench.iterations.toLocaleString()} scans in {bench.totalMs} ms on your device · varies by hardware.
                The engine is <span className="text-white">stateless</span> — no shared state, no coordination — so throughput
                scales linearly across cores and instances. 1,000 funds or 100,000: same code, more workers.
              </p>
            </div>
          )}
        </section>

        {/* Determinism proof */}
        <section className="mb-12">
          <div className="flex items-center gap-2.5 mb-1">
            <Repeat className="w-4 h-4" style={{ color: ACCENT }} />
            <h2 className="text-[13px] uppercase tracking-[0.2em] font-black">Determinism · proven</h2>
          </div>
          <div className="text-[11px] text-[rgba(255,255,255,0.4)] mb-4 ml-6">Scan the same document twice → the content hash is byte-identical.</div>

          {!proof ? (
            <button onClick={runProof}
              className="flex items-center gap-2 px-5 py-3 rounded-md text-sm uppercase tracking-[0.12em] font-black"
              style={{ background: ACCENT, color: '#000', boxShadow: `0 0 24px ${ACCENT}55` }}>
              <Repeat className="w-4 h-4" /> Prove it
            </button>
          ) : (
            <div className="rounded-2xl p-5" style={{ background: proof.identical ? 'rgba(16,217,130,0.05)' : 'rgba(242,86,110,0.08)', border: `1px solid ${proof.identical ? ACCENT + '44' : '#F2566E44'}` }}>
              <div className="flex items-center gap-2 mb-3">
                {proof.identical ? <CheckCircle2 className="w-5 h-5" style={{ color: ACCENT }} /> : <XCircle className="w-5 h-5 text-[#F2566E]" />}
                <span className="font-bold text-sm" style={{ color: proof.identical ? ACCENT : '#F2566E' }}>
                  {proof.identical ? 'IDENTICAL — deterministic' : 'MISMATCH'}
                </span>
              </div>
              <div className="space-y-1.5 font-mono text-[10px] md:text-[11px]">
                <div className="flex gap-2"><span className="text-[rgba(255,255,255,0.4)] w-12 shrink-0">run A</span><span className="truncate text-[rgba(255,255,255,0.7)]">{proof.hashA}</span></div>
                <div className="flex gap-2"><span className="text-[rgba(255,255,255,0.4)] w-12 shrink-0">run B</span><span className="truncate text-[rgba(255,255,255,0.7)]">{proof.hashB}</span></div>
              </div>
              <p className="text-[11px] text-[rgba(255,255,255,0.4)] mt-3 flex items-center gap-1.5">
                <Lock className="w-3 h-3" /> Same input → same SHA-256, on every machine, every time. An ML model cannot promise this.
              </p>
            </div>
          )}
        </section>

        {/* CTA */}
        <div className="rounded-2xl p-6 md:p-8 text-center"
          style={{ background: `linear-gradient(135deg, ${ACCENT}1a, rgba(0,170,85,0.08))`, border: `1px solid ${ACCENT}44` }}>
          <h3 className="text-xl md:text-2xl font-black mb-2">Compliance you can re-verify, not just trust.</h3>
          <p className="text-[rgba(255,255,255,0.55)] text-sm mb-5 max-w-xl mx-auto">
            The same property all the way through — the scanner, Shadow Mode, the audit pack. No model in the path you have to take on faith.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href="/scan" className="inline-flex items-center gap-2 px-6 py-3 rounded-md text-sm uppercase tracking-[0.12em] font-black"
              style={{ background: ACCENT, color: '#000', boxShadow: `0 0 24px ${ACCENT}66` }}>
              <ScanLine className="w-4 h-4" /> Try the live scanner <ArrowRight className="w-4 h-4" />
            </a>
            <a href="/shadow" className="inline-flex items-center gap-2 px-6 py-3 rounded-md text-sm uppercase tracking-[0.12em] font-bold"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)' }}>
              <ShieldCheck className="w-4 h-4" /> See Shadow Mode
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
