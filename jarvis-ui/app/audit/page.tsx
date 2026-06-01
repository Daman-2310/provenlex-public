'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, ShieldCheck, Loader2, FileDown, Sparkles, Clock, AlertOctagon,
  CheckCircle2, History, ExternalLink, Send,
} from 'lucide-react'

interface AuditRecord {
  id: string
  question: string
  fundCount: number
  fundNames: string[]
  summary: string
  merkleRoot: string
  signature: string
  generatedAt: number
}

const EXAMPLE_QUESTIONS = [
  {
    label: 'DORA ICT register',
    text: 'Provide evidence of DORA Article 28 ICT third-party vendor register compliance for the past 12 months, including categorisation, contractual clauses, and exit-strategy documentation.',
  },
  {
    label: 'AIFMD leverage',
    text: 'Demonstrate adherence to AIFMD II Article 24 leverage reporting requirements. Provide gross and commitment-method calculations, board-approved leverage limits, and quarterly reporting evidence.',
  },
  {
    label: 'SFDR Art. 8/9 disclosures',
    text: 'Confirm SFDR Article 8 and 9 disclosure obligations are met across the fund range. Include pre-contractual disclosures, periodic reports, and PAI consideration documentation.',
  },
  {
    label: 'CSSF liquidity stress',
    text: 'Provide evidence of CSSF Circular 22/795 liquidity stress test compliance. Include monthly test results, board sign-off records, and remediation actions where stress thresholds were breached.',
  },
]

function CountdownTimer({ active, duration = 60 }: { active: boolean; duration?: number }) {
  const [remaining, setRemaining] = useState(duration)
  useEffect(() => {
    if (!active) { setRemaining(duration); return }
    const start = Date.now()
    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000
      const r = Math.max(0, duration - elapsed)
      setRemaining(r)
    }, 100)
    return () => clearInterval(interval)
  }, [active, duration])

  const pct = (remaining / duration) * 100
  const color = remaining > 30 ? '#00ff88' : remaining > 10 ? '#ffaa00' : '#ff3366'

  return (
    <div className="flex items-center gap-3">
      <div className="font-black tabular-nums leading-none"
        style={{
          fontSize: 'clamp(2rem, 5vw, 3rem)',
          color,
          textShadow: `0 0 20px ${color}88`,
        }}>
        {Math.ceil(remaining)}s
      </div>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}aa, ${color})`,
            boxShadow: `0 0 12px ${color}`,
          }} />
      </div>
    </div>
  )
}

export default function AuditPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [authed, setAuthed] = useState(false)
  const [question, setQuestion] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastAudit, setLastAudit] = useState<{ merkleRoot?: string; signature?: string; auditId?: string } | null>(null)
  const [history, setHistory] = useState<AuditRecord[]>([])

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then((d: { authenticated?: boolean }) => {
      if (d.authenticated) { setAuthed(true) }
      setAuthChecked(true)
    })
  }, [])

  useEffect(() => {
    if (!authed) return
    fetch('/api/audit/list').then(r => r.json()).then(d => setHistory(d.items ?? []))
  }, [authed, lastAudit])

  const generate = useCallback(async () => {
    if (!question.trim() || question.length < 12) {
      setError('Question must be at least 12 characters')
      return
    }
    setGenerating(true); setError(null); setLastAudit(null)
    try {
      const res = await fetch('/api/audit/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      if (res.status === 401) { router.push('/login?next=/audit'); return }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? `HTTP ${res.status}`)
        return
      }
      const merkle = res.headers.get('X-Merkle-Root') ?? undefined
      const signature = res.headers.get('X-Signature') ?? undefined
      const auditId = res.headers.get('X-Audit-Id') ?? undefined
      // Download PDF
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `genesis-swarm-audit-${Date.now()}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      setLastAudit({ merkleRoot: merkle, signature, auditId })
    } catch (e) { setError(String(e)) } finally { setGenerating(false) }
  }, [question, router])

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#050508] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#00ff88] animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen text-white" style={{
      background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)',
    }}>
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3 flex items-center justify-between"
        style={{ background: 'rgba(5,5,12,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="flex items-center gap-3">
          <a href={authed ? '/dashboard' : '/'} className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> {authed ? 'Dashboard' : 'Home'}
          </a>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#00ff88]" />
            <span className="text-sm font-bold tracking-[0.18em] text-[#00ff88]">60-MINUTE AUDIT PACK</span>
          </div>
        </div>
        <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] hidden md:block">
          Regulator-grade · CSSF-aligned · Merkle-signed
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">

        {!authed && (
          <div className="mb-6 rounded-lg p-4 flex items-center gap-3"
            style={{ background: 'rgba(255,170,0,0.04)', border: '1px solid rgba(255,170,0,0.3)' }}>
            <AlertOctagon className="w-4 h-4 text-[#ffaa00] shrink-0" />
            <div className="text-[12px] text-[rgba(255,255,255,0.85)]">
              <a href="/login?next=/audit" className="font-bold text-[#ffaa00] hover:underline">Sign in</a> to save audit history and link your saved funds. Anonymous generation works too.
            </div>
          </div>
        )}

        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.25)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88]"
              style={{ animation: 'pulse 1.2s ease-in-out infinite', boxShadow: '0 0 8px #00ff88' }} />
            <span className="text-[10px] font-black tracking-[0.25em] uppercase text-[#00ff88]">REGULATOR INCOMING? GO.</span>
          </div>

          <h1 className="font-black tracking-tight mb-3"
            style={{ fontSize: 'clamp(2.25rem, 5vw, 4rem)', lineHeight: 1 }}>
            <span className="text-white">Audit response in</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #00ff88 0%, #ffaa00 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              60 seconds.
            </span>
          </h1>
          <p className="text-[rgba(255,255,255,0.55)] text-sm md:text-base max-w-2xl mx-auto leading-relaxed">
            Paste the regulator&apos;s question. AI cites the exact CSSF circulars, DORA articles, AIFMD II
            requirements. Generates a Merkle-signed PDF you can walk into the audit room with.
            <span className="text-white"> Six weeks of work, sixty seconds.</span>
          </p>
        </div>

        {/* Countdown when generating */}
        {generating && (
          <div className="rounded-xl p-6 mb-6"
            style={{ background: 'linear-gradient(135deg, rgba(0,255,136,0.04) 0%, rgba(255,170,0,0.04) 100%)', border: '1px solid rgba(0,255,136,0.3)', boxShadow: '0 0 40px rgba(0,255,136,0.08)' }}>
            <div className="flex items-center gap-3 mb-4">
              <Sparkles className="w-4 h-4 text-[#00ff88]" style={{ animation: 'pulse 1s ease-in-out infinite' }} />
              <div className="text-[10px] uppercase tracking-[0.2em] font-black text-[#00ff88]">Generating audit pack…</div>
            </div>
            <CountdownTimer active={generating} duration={60} />
            <div className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.45)] mt-3 space-y-1">
              <div>· Parsing regulator question</div>
              <div>· Mapping to AIFMD / DORA / SFDR / CSSF articles</div>
              <div>· Pulling fund evidence chain from saved analyses</div>
              <div>· Computing SHA-256 Merkle root</div>
              <div>· Signing PDF…</div>
            </div>
          </div>
        )}

        {/* Question form */}
        {!generating && (
          <div className="rounded-2xl p-6 mb-6"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <label className="block text-[10px] uppercase tracking-[0.2em] font-bold text-[rgba(255,255,255,0.55)] mb-3">
              The regulator&apos;s question
            </label>
            <textarea value={question}
              onChange={e => setQuestion(e.target.value)}
              rows={5}
              placeholder="e.g. Provide evidence of DORA Art. 28 ICT vendor register compliance for the past 12 months…"
              className="w-full bg-[rgba(0,0,0,0.4)] rounded-lg px-4 py-3 text-[13px] text-white placeholder:text-[rgba(255,255,255,0.3)] focus:outline-none resize-none"
              style={{ border: '1px solid rgba(0,255,136,0.25)', fontFamily: 'system-ui' }} />

            <div className="flex flex-wrap gap-1.5 mt-3">
              <span className="text-[9px] uppercase tracking-widest text-[rgba(255,255,255,0.4)] mr-1 py-0.5">Examples:</span>
              {EXAMPLE_QUESTIONS.map(ex => (
                <button key={ex.label} onClick={() => setQuestion(ex.text)}
                  className="text-[10px] px-2.5 py-1 rounded uppercase tracking-wider"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(0,255,136,0.2)', color: 'rgba(0,255,136,0.7)' }}>
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

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-5 pt-4 border-t border-[rgba(255,255,255,0.06)]">
              <div className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">
                {question.length} chars · AIFMD II / DORA / SFDR / CSSF coverage · ~60s
              </div>
              <button onClick={generate}
                disabled={generating || question.length < 12}
                className="flex items-center gap-2 px-6 py-3 rounded-md text-[12px] uppercase tracking-[0.15em] font-black disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
                  color: '#000',
                  boxShadow: '0 0 24px rgba(0,255,136,0.4)',
                }}>
                <FileDown className="w-4 h-4" /> Generate signed audit pack
              </button>
            </div>
          </div>
        )}

        {/* Last audit confirmation */}
        {lastAudit && !generating && (
          <div className="rounded-xl p-5 mb-6"
            style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.3)', boxShadow: '0 0 30px rgba(0,255,136,0.08)' }}>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#00ff88] shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-black text-white mb-1">Audit pack downloaded · cryptographically signed</div>
                <div className="text-[10px] text-[rgba(255,255,255,0.55)] mb-2">
                  Walk into your audit with this PDF. Every claim hashed, every citation traceable.
                </div>
                {lastAudit.merkleRoot && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[9px]">
                    <div>
                      <span className="text-[rgba(255,255,255,0.35)] uppercase tracking-widest">Merkle:</span>{' '}
                      <span className="font-mono text-[#00ff88]">0x{lastAudit.merkleRoot.slice(0, 24)}…</span>
                    </div>
                    <div>
                      <span className="text-[rgba(255,255,255,0.35)] uppercase tracking-widest">Signature:</span>{' '}
                      <span className="font-mono text-[#00ff88]">0x{lastAudit.signature?.slice(0, 24)}…</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* History */}
        {authed && history.length > 0 && (
          <div className="mt-12">
            <h2 className="text-[10px] uppercase tracking-[0.2em] font-bold text-[rgba(255,255,255,0.55)] mb-3 flex items-center gap-2">
              <History className="w-3 h-3" /> Audit history · {history.length} packs generated
            </h2>
            <div className="space-y-2">
              {history.slice(0, 10).map(a => (
                <div key={a.id} className="rounded-lg p-4"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-start gap-3">
                    <Clock className="w-3.5 h-3.5 text-[rgba(255,255,255,0.3)] mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-bold text-white mb-1 line-clamp-2">{a.question}</div>
                      <div className="text-[10px] text-[rgba(255,255,255,0.5)] leading-relaxed line-clamp-2">{a.summary}</div>
                      <div className="flex items-center gap-3 mt-2 text-[8px] uppercase tracking-widest text-[rgba(255,255,255,0.35)]">
                        <span>{new Date(a.generatedAt).toLocaleString()}</span>
                        <span>·</span>
                        <span>{a.fundCount} fund{a.fundCount === 1 ? '' : 's'}</span>
                        <span>·</span>
                        <span className="font-mono text-[#00ff88]">0x{a.merkleRoot.slice(0, 16)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trust pillars */}
        {!generating && history.length === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-8">
            {[
              { icon: ShieldCheck, t: 'Regulator-grade', d: 'Cites real CSSF circulars, AIFMD II articles, DORA RTSs. AI counsel-quality output.' },
              { icon: Clock, t: '60-second turnaround', d: 'Six weeks of manual evidence gathering. Done while your coffee brews.' },
              { icon: Send, t: 'Merkle-signed', d: 'Every claim SHA-256 hashed. Auditor can verify nothing was tampered.' },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t} className="rounded-xl p-5"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <Icon className="w-5 h-5 text-[#00ff88] mb-3" />
                <div className="text-[14px] font-black text-white mb-1">{t}</div>
                <div className="text-[11px] text-[rgba(255,255,255,0.5)] leading-relaxed">{d}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
