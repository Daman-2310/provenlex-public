'use client'

import { useState, useCallback } from 'react'
import { ArrowLeft, Scale, FileDown, Loader2, AlertOctagon, Sparkles, CheckCircle2 } from 'lucide-react'

const EXAMPLES = [
  {
    label: 'AIFMD II marketing passport',
    text: 'Can a Luxembourg-domiciled SICAV-RAIF managed by a non-EU AIFM market to professional investors in France, Germany, and the Netherlands under the AIFMD II marketing passport, and what are the disclosure obligations under Article 31?',
  },
  {
    label: 'SFDR Art. 9 classification',
    text: 'A new private credit fund will invest at least 60% of NAV in EU-Taxonomy-aligned green-bond issuances. Can the fund be classified as SFDR Article 9, and what pre-contractual disclosure obligations arise under the SFDR Regulation 2019/2088 and the SFDR RTS?',
  },
  {
    label: 'DORA third-country ICT vendor',
    text: 'A Luxembourg AIFM intends to use a US-based cloud provider for critical fund accounting workloads. What are the obligations under DORA Article 28 and 31, specifically regarding subcontracting, exit strategy, and the third-country regime?',
  },
  {
    label: 'CSSF substance requirements',
    text: 'What are the minimum substance requirements for a Luxembourg AIFM under CSSF Circular 18/698 and the AIFMD Level 2 Regulation 231/2013, and how do they apply to a sub-threshold AIFM with EUR 80M AUM?',
  },
]

export default function OpinionPage() {
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<{ merkle?: string; signature?: string; confidence?: string } | null>(null)

  const generate = useCallback(async () => {
    if (question.length < 16) { setError('Legal question must be at least 16 characters'); return }
    setBusy(true); setError(null); setLast(null)
    try {
      const res = await fetch('/api/opinion/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? `HTTP ${res.status}`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `genesis-swarm-opinion-${Date.now()}.pdf`; a.click()
      URL.revokeObjectURL(url)
      setLast({
        merkle: res.headers.get('X-Merkle-Root') ?? undefined,
        signature: res.headers.get('X-Signature') ?? undefined,
        confidence: res.headers.get('X-Confidence') ?? undefined,
      })
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }, [question])

  return (
    <div className="min-h-screen text-white" style={{ background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)' }}>
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3 flex items-center justify-between"
        style={{ background: 'rgba(5,5,12,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="flex items-center gap-3">
          <a href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </a>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-[#9b6dff]" />
            <span className="text-sm font-bold tracking-[0.18em] text-[#9b6dff]">AI LEGAL OPINION</span>
          </div>
        </div>
        <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] hidden md:block">
          Lux financial law · 2,000-word memo in 60s
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">

        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(155,109,255,0.06)', border: '1px solid rgba(155,109,255,0.3)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#9b6dff]"
              style={{ animation: 'pulse 1.2s ease-in-out infinite', boxShadow: '0 0 8px #9b6dff' }} />
            <span className="text-[10px] font-black tracking-[0.25em] uppercase text-[#9b6dff]">€3,000 OPINION · €99 PRICE</span>
          </div>
          <h1 className="font-black tracking-tight mb-3"
            style={{ fontSize: 'clamp(2.25rem, 5vw, 4rem)', lineHeight: 1 }}>
            <span className="text-white">A legal opinion in</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #9b6dff 0%, #4a9eff 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>sixty seconds.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.55)] text-sm md:text-base max-w-2xl mx-auto leading-relaxed">
            Structured legal memo on AIFMD, SFDR, DORA, UCITS, CSSF circulars, Luxembourg financial law.
            Drafted in proper memo format with citations to actual articles. Merkle-signed PDF.
            <span className="text-white"> Watermarked: AI-assisted, requires human review.</span>
          </p>
        </div>

        {/* Form */}
        {!busy && !last && (
          <div className="rounded-2xl p-6 mb-6"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(155,109,255,0.25)' }}>
            <label className="block text-[10px] uppercase tracking-[0.2em] font-bold text-[rgba(255,255,255,0.55)] mb-3">
              Your legal question
            </label>
            <textarea value={question} onChange={e => setQuestion(e.target.value)}
              rows={6}
              placeholder="e.g. Can a Luxembourg-domiciled SICAV-RAIF managed by a non-EU AIFM market to professional investors in France under the AIFMD II marketing passport?"
              className="w-full bg-[rgba(0,0,0,0.4)] rounded-lg px-4 py-3 text-[13px] text-white placeholder:text-[rgba(255,255,255,0.3)] focus:outline-none resize-none"
              style={{ border: '1px solid rgba(155,109,255,0.3)', fontFamily: 'system-ui' }} />

            <div className="flex flex-wrap gap-1.5 mt-3">
              <span className="text-[9px] uppercase tracking-widest text-[rgba(255,255,255,0.4)] mr-1 py-0.5">Examples:</span>
              {EXAMPLES.map(ex => (
                <button key={ex.label} onClick={() => setQuestion(ex.text)}
                  className="text-[10px] px-2.5 py-1 rounded uppercase tracking-wider"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(155,109,255,0.25)', color: 'rgba(155,109,255,0.85)' }}>
                  {ex.label}
                </button>
              ))}
            </div>

            {error && (
              <div className="mt-3 flex items-center gap-2 p-3 rounded text-[11px]"
                style={{ background: 'rgba(255,51,102,0.06)', border: '1px solid rgba(255,51,102,0.3)', color: '#ff3366' }}>
                <AlertOctagon className="w-3.5 h-3.5" /> {error}
              </div>
            )}

            <button onClick={generate} disabled={busy || question.length < 16}
              className="w-full mt-5 py-3 rounded-md text-[12px] uppercase tracking-[0.15em] font-black disabled:opacity-50 flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #9b6dff 0%, #6a3dff 100%)',
                color: '#fff',
                boxShadow: '0 0 24px rgba(155,109,255,0.4)',
              }}>
              <FileDown className="w-4 h-4" /> Generate AI legal memo
            </button>

            <div className="mt-4 text-[9px] uppercase tracking-wider text-center text-[rgba(255,170,0,0.7)]">
              AI-assisted output · requires human review · not a substitute for Luxembourg-licensed counsel
            </div>
          </div>
        )}

        {/* Loading */}
        {busy && (
          <div className="rounded-2xl p-8 text-center"
            style={{ background: 'rgba(155,109,255,0.04)', border: '1px solid rgba(155,109,255,0.3)' }}>
            <Sparkles className="w-8 h-8 text-[#9b6dff] mx-auto mb-3" style={{ animation: 'pulse 1s ease-in-out infinite', filter: 'drop-shadow(0 0 16px #9b6dff)' }} />
            <div className="text-[12px] uppercase tracking-[0.2em] font-black text-[#9b6dff] mb-2">Drafting memorandum…</div>
            <div className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.5)] space-y-1 mt-4">
              <div>Identifying applicable framework…</div>
              <div>Citing Luxembourg-specific provisions…</div>
              <div>Composing analysis with qualifications…</div>
              <div>Hashing memo body into Merkle tree…</div>
              <div>Signing PDF with watermark…</div>
            </div>
          </div>
        )}

        {/* Success */}
        {last && !busy && (
          <div className="rounded-2xl p-6"
            style={{ background: 'rgba(155,109,255,0.04)', border: '1px solid rgba(155,109,255,0.3)', boxShadow: '0 0 40px rgba(155,109,255,0.1)' }}>
            <div className="flex items-start gap-3 mb-4">
              <CheckCircle2 className="w-6 h-6 text-[#9b6dff] shrink-0" />
              <div>
                <div className="text-[15px] font-black text-white mb-1">Memorandum downloaded · cryptographically signed</div>
                <div className="text-[11px] text-[rgba(255,255,255,0.55)]">AI confidence: <span className="text-[#9b6dff] font-bold uppercase">{last.confidence}</span></div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[9px]">
              <div>
                <span className="text-[rgba(255,255,255,0.35)] uppercase tracking-widest">Merkle:</span>{' '}
                <span className="font-mono text-[#9b6dff]">0x{last.merkle?.slice(0, 28)}…</span>
              </div>
              <div>
                <span className="text-[rgba(255,255,255,0.35)] uppercase tracking-widest">Signature:</span>{' '}
                <span className="font-mono text-[#9b6dff]">0x{last.signature?.slice(0, 28)}…</span>
              </div>
            </div>
            <button onClick={() => { setLast(null); setQuestion('') }}
              className="w-full mt-5 py-2.5 rounded text-[10px] uppercase tracking-wider font-bold"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)' }}>
              Draft another opinion
            </button>
          </div>
        )}

        {/* Trust strip */}
        {!busy && !last && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-8">
            {[
              { t: '€3K → €99', d: 'Disrupt the €5K Arendt opinion. Volume play for sub-threshold AIFMs and smaller funds.' },
              { t: 'Watermarked', d: 'AI-ASSISTED watermark + human-review-hours estimate + qualifications baked into every memo.' },
              { t: 'Merkle-anchored', d: 'Every memo SHA-256 hashed across 8 sections. Verifiable, tamper-evident, citable.' },
            ].map(s => (
              <div key={s.t} className="rounded-lg p-4"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="text-[14px] font-black text-white mb-1">{s.t}</div>
                <div className="text-[11px] text-[rgba(255,255,255,0.5)] leading-relaxed">{s.d}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
