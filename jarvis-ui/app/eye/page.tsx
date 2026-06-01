'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Eye as EyeIcon, AlertOctagon, Activity, ShieldAlert, Sparkles } from 'lucide-react'
import LegalDisclaimer from '@/components/LegalDisclaimer'
import CosmicBackground from '@/components/CosmicBackground'

interface LogEntry { id: string; subject: string; scanned_at: string; risk_level: string; sentiment_score: number }
interface Stage { stage: string; label: string; findings: string[]; done: boolean }
interface Artifact {
  id: string
  subject: string
  scanned_at: string
  ofac_hits: number
  gleif_match?: { lei: string; legalName: string; jurisdiction?: string }
  sentiment_score: number
  risk_level: string
  swarm_findings: string[]
  verdict: string
  merkle_root: string
}

const RISK_COLORS: Record<string, string> = {
  LOW: '#00ff88',
  MODERATE: '#ffaa00',
  ELEVATED: '#ff7700',
  CRITICAL: '#ff3366',
}

export default function EyePage() {
  const [subject, setSubject] = useState('')
  const [stages, setStages] = useState<Stage[]>([])
  const [artifact, setArtifact] = useState<Artifact | null>(null)
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])
  const [err, setErr] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  async function loadLog() {
    try {
      const r = await fetch('/api/eye/log')
      const j = await r.json() as { entries?: LogEntry[] }
      setLog(j.entries ?? [])
    } catch { /* */ }
  }
  useEffect(() => { void loadLog() }, [])
  useEffect(() => () => { abortRef.current?.abort() }, [])

  async function scan() {
    if (!subject.trim()) return
    setRunning(true); setErr(''); setStages([]); setArtifact(null)
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const r = await fetch('/api/eye/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim() }),
        signal: ctrl.signal,
      })
      if (!r.ok || !r.body) { setErr(`server ${r.status}`); setRunning(false); return }
      const reader = r.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const events = buf.split('\n\n')
        buf = events.pop() ?? ''
        for (const ev of events) {
          if (!ev.trim()) continue
          const lines = ev.split('\n')
          const eventName = lines.find(l => l.startsWith('event:'))?.slice(6).trim() ?? 'message'
          const dataLine = lines.find(l => l.startsWith('data:'))?.slice(5).trim() ?? '{}'
          let payload: Record<string, unknown> = {}
          try { payload = JSON.parse(dataLine) } catch { /* */ }

          if (eventName === 'stage') {
            setStages(prev => [...prev.map(s => ({ ...s, done: true })), { stage: payload.stage as string, label: payload.label as string, findings: [], done: false }])
          } else if (eventName === 'finding') {
            const stage = payload.stage as string
            const text = payload.text as string
            setStages(prev => prev.map(s => s.stage === stage ? { ...s, findings: [...s.findings, text] } : s))
          } else if (eventName === 'artifact') {
            setArtifact(payload as unknown as Artifact)
            setStages(prev => prev.map(s => ({ ...s, done: true })))
          } else if (eventName === 'close') {
            void loadLog()
          }
        }
      }
    } catch (e) {
      if ((e as { name?: string })?.name !== 'AbortError') setErr(String(e))
    }
    setRunning(false)
  }

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="intense" accent="#ff3366" />
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <EyeIcon className="w-4 h-4" style={{ color: '#ff3366' }} />
          <span className="text-sm font-bold tracking-[0.18em]" style={{ color: '#ff3366' }}>THE EYE</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">live surveillance · public append-only log</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-12">

        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
            style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.3)' }}>
            <EyeIcon className="w-3 h-3" style={{ color: '#ff3366' }} />
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#ff3366]">
              Surveillance on demand · permanent log
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-3" style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', lineHeight: 1.05 }}>
            <span className="text-white">Type any name.</span>
            <br />
            <span style={{ background: 'linear-gradient(90deg, #ff3366 0%, #9b6dff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              The Eye opens.
            </span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl mx-auto leading-relaxed">
            Live AI swarm investigation streams onto a public, permanent log.
            Every query becomes an immutable record. Companies want their score before journalists do.
          </p>
        </div>

        {/* INPUT */}
        <div className="rounded-2xl p-5 mb-8"
          style={{ background: 'rgba(255,51,102,0.04)', border: '1px solid rgba(255,51,102,0.25)' }}>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#ff3366] font-black mb-3">Subject of surveillance</div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Company, fund, person, or entity name"
              disabled={running}
              className="px-4 py-3 rounded-lg text-sm bg-[rgba(0,0,0,0.4)] text-white border border-[rgba(255,51,102,0.3)] focus:border-[#ff3366] outline-none disabled:opacity-50"
              onKeyDown={e => { if (e.key === 'Enter' && !running) void scan() }}
            />
            <button onClick={() => void scan()} disabled={running || !subject.trim()}
              className="px-6 py-3 rounded-lg text-sm font-black uppercase tracking-[0.15em] disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #ff3366 0%, #9b6dff 100%)', color: '#fff', boxShadow: '0 0 24px rgba(255,51,102,0.4)' }}>
              {running ? 'Surveilling…' : 'Open The Eye'}
            </button>
          </div>
          {err && <div className="text-[#ff3366] text-[11px] mt-3">{err}</div>}
        </div>

        {/* LIVE STREAM */}
        {stages.length > 0 && (
          <div className="rounded-2xl p-6 mb-8"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,51,102,0.2)' }}>
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-[#ff3366]" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#ff3366] font-black">Live investigation stream</span>
              {running && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#ff3366]" style={{ animation: 'pulse 1s infinite' }} />}
            </div>
            <div className="space-y-3">
              {stages.map((s, i) => (
                <div key={i} className="rounded-lg p-3"
                  style={{
                    background: s.done ? 'rgba(0,255,136,0.03)' : 'rgba(255,51,102,0.04)',
                    border: `1px solid ${s.done ? 'rgba(0,255,136,0.15)' : 'rgba(255,51,102,0.25)'}`,
                  }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[8px] font-mono text-[rgba(255,255,255,0.4)]">[{(i + 1).toString().padStart(2, '0')}]</span>
                    <span className="text-[10px] uppercase tracking-[0.18em] font-black"
                      style={{ color: s.done ? '#00ff88' : '#ff3366' }}>{s.label}</span>
                    {!s.done && <span className="text-[8px] uppercase font-bold text-[#ff3366]">SCANNING</span>}
                    {s.done && <span className="text-[8px] uppercase font-bold text-[#00ff88]">COMPLETE</span>}
                  </div>
                  <div className="space-y-1 pl-5">
                    {s.findings.map((f, j) => (
                      <div key={j} className="text-[12px] text-[rgba(255,255,255,0.85)] leading-relaxed">
                        <span className="text-[#ff3366] font-mono mr-2">›</span>{f}
                      </div>
                    ))}
                    {s.findings.length === 0 && !s.done && (
                      <div className="text-[11px] text-[rgba(255,255,255,0.4)] italic">probing…</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ARTIFACT */}
        {artifact && (
          <div className="rounded-2xl p-6 mb-10"
            style={{
              background: `linear-gradient(135deg, ${RISK_COLORS[artifact.risk_level]}08 0%, rgba(0,0,0,0) 100%)`,
              border: `1px solid ${RISK_COLORS[artifact.risk_level]}40`,
              boxShadow: `0 0 32px ${RISK_COLORS[artifact.risk_level]}15`,
            }}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-[9px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.5)] mb-1">Surveillance artifact</div>
                <div className="text-2xl font-black">{artifact.subject}</div>
                {artifact.gleif_match?.lei && (
                  <div className="text-[10px] font-mono text-[rgba(255,255,255,0.4)] mt-1">
                    LEI {artifact.gleif_match.lei} · {artifact.gleif_match.jurisdiction ?? '—'}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{ background: `${RISK_COLORS[artifact.risk_level]}15`, border: `1px solid ${RISK_COLORS[artifact.risk_level]}50` }}>
                <AlertOctagon className="w-3 h-3" style={{ color: RISK_COLORS[artifact.risk_level] }} />
                <span className="text-[10px] uppercase tracking-[0.15em] font-black"
                  style={{ color: RISK_COLORS[artifact.risk_level] }}>{artifact.risk_level}</span>
              </div>
            </div>

            <div className="text-[14px] leading-relaxed mb-5 pl-3"
              style={{ borderLeft: `2px solid ${RISK_COLORS[artifact.risk_level]}60` }}>
              {artifact.verdict}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <Tile label="OFAC hits" value={String(artifact.ofac_hits)} color={artifact.ofac_hits > 0 ? '#ff3366' : '#00ff88'} />
              <Tile label="Sentiment" value={`${artifact.sentiment_score}/100`} color={artifact.sentiment_score >= 60 ? '#00ff88' : artifact.sentiment_score >= 30 ? '#ffaa00' : '#ff3366'} />
              <Tile label="Findings" value={String(artifact.swarm_findings.length)} color="#9b6dff" />
              <Tile label="Risk" value={artifact.risk_level} color={RISK_COLORS[artifact.risk_level]} />
            </div>

            <div className="rounded p-3 text-[10px] font-mono"
              style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex gap-2 mb-1">
                <span className="text-[rgba(255,255,255,0.4)] w-24">SCAN ID</span>
                <span className="text-[#ff3366]">{artifact.id}</span>
              </div>
              <div className="flex gap-2 mb-1">
                <span className="text-[rgba(255,255,255,0.4)] w-24">SCANNED</span>
                <span className="text-[rgba(255,255,255,0.85)]">{new Date(artifact.scanned_at).toUTCString()}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-[rgba(255,255,255,0.4)] w-24">MERKLE</span>
                <span className="text-[#9b6dff] truncate">0x{artifact.merkle_root}</span>
              </div>
            </div>
          </div>
        )}

        {/* PUBLIC LOG */}
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] font-black mb-4 flex items-center gap-2">
            <Sparkles className="w-3 h-3" />
            Public Eye Log <span className="text-[#ff3366]">({log.length})</span>
            <span className="text-[8px] text-[rgba(255,255,255,0.3)] uppercase font-normal">— append-only · world-readable</span>
          </div>
          {log.length === 0 ? (
            <div className="rounded-lg p-6 text-center text-[12px] text-[rgba(255,255,255,0.4)]"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)' }}>
              The Eye has not yet opened. Be the first.
            </div>
          ) : (
            <div className="rounded-lg overflow-hidden"
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="grid grid-cols-[80px_1fr_120px_100px_80px] gap-2 px-3 py-2 text-[8px] uppercase tracking-wider font-bold text-[rgba(255,255,255,0.35)] border-b border-[rgba(255,255,255,0.05)]">
                <span>ID</span>
                <span>Subject</span>
                <span>Scanned</span>
                <span>Sentiment</span>
                <span>Risk</span>
              </div>
              {log.slice(0, 30).map(e => (
                <div key={e.id} className="grid grid-cols-[80px_1fr_120px_100px_80px] gap-2 px-3 py-2 text-[11px] border-b border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.02)]">
                  <span className="font-mono text-[#ff3366]">{e.id}</span>
                  <span className="font-bold text-white truncate">{e.subject}</span>
                  <span className="text-[rgba(255,255,255,0.5)] text-[10px]">
                    {new Date(e.scanned_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} {new Date(e.scanned_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="tabular-nums">{e.sentiment_score}/100</span>
                  <span className="font-black" style={{ color: RISK_COLORS[e.risk_level] ?? '#fff' }}>{e.risk_level}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* WHY */}
        <div className="mt-12 rounded-2xl p-8"
          style={{ background: 'rgba(255,51,102,0.03)', border: '1px solid rgba(255,51,102,0.2)' }}>
          <ShieldAlert className="w-6 h-6 text-[#ff3366] mb-3" />
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#ff3366] font-black mb-2">The doctrine</div>
          <p className="text-[14px] text-[rgba(255,255,255,0.7)] leading-relaxed">
            Every Eye scan creates a permanent, world-readable analytical record with a cryptographic Merkle root.
            All findings are AI-generated operational-risk indicators, not factual claims. Subjects of analysis may{' '}
            <Link href="/legal" className="text-[#ff3366] hover:underline">request erasure or correction</Link>{' '}
            of their public dossier.
          </p>
        </div>

        <div className="mt-6">
          <LegalDisclaimer variant="full" />
        </div>

      </div>
    </div>
  )
}

function Tile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded p-3"
      style={{ background: `${color}06`, border: `1px solid ${color}30` }}>
      <div className="text-[8px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] mb-1 font-bold">{label}</div>
      <div className="text-xl font-black tabular-nums" style={{ color }}>{value}</div>
    </div>
  )
}
